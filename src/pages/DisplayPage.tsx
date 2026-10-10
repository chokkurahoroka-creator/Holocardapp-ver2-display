import { useEffect, useState } from 'react'
import { useSets } from '../hooks/useSets'
import { useCardsBySets } from '../hooks/useCardsBySets'
import { usePackSets } from '../hooks/usePackSets'
import { buildPackGroups, resolveGroupKey } from '../utils/packGroups'
import { useCardSearch } from '../hooks/useCardSearch'
import { useSiteStatus } from '../hooks/useSiteStatus'
import { sortCards, type SortKey, type SortDir } from '../utils/sortCards'
import { CardGrid } from '../components/CardGrid'
import { SlotGrid, orderSlotCards } from '../components/SlotGrid'
import { CardFilterPanel } from '../components/CardFilterPanel'
import { FilterIcon } from '../components/FilterIcon'
import { applyCardFilters, hasActiveFilters, activeFilterChips, EMPTY_FILTERS, type CardFilters } from '../utils/cardFilters'
import { CardModal } from '../components/CardModal'
import { MaintenanceBanner } from '../components/MaintenanceBanner'
import type { Card } from '../types/card'
import { useFavorites } from '../hooks/useFavorites'
import { downloadCardsAsZip } from '../lib/download'
import { logEvent, logDownloadEvents } from '../lib/logEvent'
import { SiteNav } from '../components/SiteNav'
import { CardSizeControl, CARD_SIZE_DEFAULT } from '../components/CardSizeControl'
import { ControlsBar, useControlsOpen } from '../components/ControlsBar'
import { PackSelect } from '../components/PackSelect'

const THIS_PAGE_KEY = 'display'
const STORAGE_KEY = 'horoka-display:display:setCode'
const CARD_SIZE_STORAGE_KEY = 'horoka-display:cardSize'

// 新規・再録・パラレルの順で、それぞれの枠を分けてグループ化する（枠内の並び順はsortedの順序のまま維持）
const TYPE_ORDER: Card['type'][] = ['新規', '再録', 'パラレル']
function groupCardsByType(cards: Card[]): { type: Card['type']; cards: Card[] }[] {
  return TYPE_ORDER.map((type) => ({ type, cards: cards.filter((c) => c.type === type) })).filter((g) => g.cards.length > 0)
}

export function DisplayPage() {
  const { sets } = useSets()
  const { packSets } = usePackSets()
  // 選択中の「パックセット（または単独パック）」。以前の版では弾コードを保存していたため、保存値は弾コードでも受け付ける
  const [groupKey, setGroupKey] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  // パック選択リストは、管理画面で「公開中」に設定されているパックだけを、パックセットごとにまとめて表示する
  const groups = buildPackGroups(sets, packSets, { onlyPublic: true })
  const activeKey = resolveGroupKey(groupKey, groups)
  const group = groups.find((g) => g.key === activeKey) ?? null
  // 空き枠・設定枚数は、グループの代表パック（弾コードが最小のパック）の設定で表示する。追加パックのカードは続けて並べる
  const setInfo = group?.sets[0]
  const setCode = setInfo?.set_code ?? null
  const extraSets = group ? group.sets.slice(1) : []
  const memberCodes = group ? group.sets.map((s) => s.set_code) : []
  const { cards, loading } = useCardsBySets(memberCodes)
  const { status: siteStatus } = useSiteStatus()
  const isMaintenance = siteStatus[THIS_PAGE_KEY] === '作業中'

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('slot')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  // 操作パネル（検索・一括ダウンロード・フィルター・お気に入り）の開閉。普段は閉じておく。
  // 弾選択・並び替え・昇降順は、パネルを閉じていても使えるよう開閉タブの横に常時表示する
  const [controlsOpen, setControlsOpen] = useControlsOpen('display', false)

  // カード表示サイズ（右下の+/🔄/-ボタンで変更）。端末ごとに前回の設定を覚えておく
  const [cardScale, setCardScale] = useState(() => {
    const saved = localStorage.getItem(CARD_SIZE_STORAGE_KEY)
    return saved ? Number(saved) : CARD_SIZE_DEFAULT
  })
  useEffect(() => {
    localStorage.setItem(CARD_SIZE_STORAGE_KEY, String(cardScale))
  }, [cardScale])

  // 弾を切り替えたら、別の弾の選択肢が残らないようフィルターをリセットする
  useEffect(() => {
    setFilters(EMPTY_FILTERS)
  }, [activeKey])

  const filteredByPanel = applyCardFilters(cards, filters)
  const searched = useCardSearch(filteredByPanel, searchQuery)
  // 枠番号順は昇順固定（昇降順ボタンは無効）。降順の状態が残っていても、枠番号順では昇順で並べる
  const slotSort = sortKey === 'slot'
  const effectiveSortDir: SortDir = slotSort ? 'asc' : sortDir
  const sorted = sortCards(searched, sortKey, effectiveSortDir)
  const groupedByType = groupCardsByType(sorted)

  // 空き枠は区分ごとのスロット番号（slot）で1〜設定枚数まで表示する（通し番号は使わない）
  // 検索中や、枠番号順以外の並び替えをしているときは「空いている枠」の概念がそのままでは意味を持たないため、
  // 検索なし・枠番号順のときだけ空き枠を表示する
  const showEmptySlots = !searchQuery.trim() && !hasActiveFilters(filters) && sortKey === 'slot' && !!setInfo
  const slotTypeConfig = setInfo
    ? [
        { type: '新規' as const, count: setInfo.total_new ?? 0 },
        { type: '再録' as const, count: setInfo.total_rerun ?? 0 },
        { type: 'パラレル' as const, count: setInfo.total_parallel ?? 0 },
      ]
    : []

  // 詳細モーダルの前へ/次へで辿る順序。一覧に表示されている並び（区分ごとのまとまり・並べ替え後の順）そのままにする
  const bySlot = (a: Card, b: Card) => Number(a.slot) - Number(b.slot)
  const primaryCardsOf = (type: Card['type']) => cards.filter((c) => c.type === type && c.set_code === setCode)
  // 追加パックのカード（パックの順 → スロット番号順）。カードの無いパックは除く
  const extraPacksOf = (type: Card['type']) =>
    extraSets
      .map((s) => ({ set: s, cards: cards.filter((c) => c.type === type && c.set_code === s.set_code).sort(bySlot) }))
      .filter((x) => x.cards.length > 0)
  const navCards: Card[] = showEmptySlots
    ? slotTypeConfig
        .filter((tc) => tc.count > 0 || cards.some((c) => c.type === tc.type))
        .flatMap((tc) => [...orderSlotCards(primaryCardsOf(tc.type), tc.count), ...extraPacksOf(tc.type).flatMap((x) => x.cards)])
    : groupedByType.flatMap((g) => g.cards)

  const [navIndex, setNavIndex] = useState(-1)

  // ----- サイト訪問ログ：初回マウント時に1回だけ記録 -----
  useEffect(() => {
    logEvent('visit')
  }, [])

  // ----- 選択中の弾を保存し、次回このページを開いたときも引き継ぐ -----
  useEffect(() => {
    if (groupKey) localStorage.setItem(STORAGE_KEY, groupKey)
    else localStorage.removeItem(STORAGE_KEY)
  }, [groupKey])

  // 以前の版で保存された弾コードを、パックセット/グループのキーに置き換えておく
  useEffect(() => {
    if (activeKey && groupKey !== activeKey) setGroupKey(activeKey)
  }, [activeKey, groupKey])

  // ----- 検索ログ：入力が止まって600ms経ったら記録（デバウンス） -----
  useEffect(() => {
    if (!searchQuery.trim()) return
    const timer = setTimeout(() => {
      logEvent('search', { query: searchQuery.trim() })
    }, 600)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleSelectRelated = (card: Card) => {
    const idx = navCards.findIndex((c) => c.id === card.id)
    if (idx !== -1) {
      setNavIndex(idx)
    } else {
      console.log('別弾の関連カードは現状未対応:', card.card_name)
    }
  }

  const handleCardClick = (card: Card) => {
    const idx = navCards.findIndex((c) => c.id === card.id)
    setNavIndex(idx)
    if (idx !== -1) {
      logEvent('view', { set_code: card.set_code, type: card.type, slot: card.slot, card_name: card.card_name })
    }
  }
  const handleClose = () => setNavIndex(-1)
  const handlePrev = () => setNavIndex((i) => (i - 1 + navCards.length) % navCards.length)
  const handleNext = () => setNavIndex((i) => (i + 1) % navCards.length)

  const currentCard = navIndex !== -1 ? navCards[navIndex] ?? null : null
  const { favGroups, activeGroup, setActiveGroup, isFav, createGroup, toggleFav, deleteGroup } = useFavorites()
  const handleToggleFav = (card: Card) => {
    if (!activeGroup) {
      const name = prompt('グループ名を入力してください（例: お気に入り）', 'お気に入り')
      if (name && name.trim()) createGroup(name.trim())
      return
    }
    if (!isFav(card, activeGroup)) {
      logEvent('favorite', { set_code: card.set_code, type: card.type, slot: card.slot, card_name: card.card_name })
    }
    toggleFav(card)
  }

  // ----- 一括選択ダウンロード -----
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [zipStatus, setZipStatus] = useState('')

  const handleToggleSelect = (card: Card) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(card.id)) next.delete(card.id)
      else next.add(card.id)
      return next
    })
  }

  const handleExitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setZipStatus('')
  }

  const handleBulkDownload = async () => {
    const selectedCards = sorted.filter((c) => selectedIds.has(c.id))
    if (!selectedCards.length) return
    try {
      await downloadCardsAsZip(selectedCards, (done, total) => {
        setZipStatus(`画像を取得中... (${done}/${total})`)
      })
      logDownloadEvents(selectedCards)
      setZipStatus(`${selectedCards.length}枚をダウンロードしました`)
    } catch (err) {
      setZipStatus('ダウンロードに失敗しました: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <>
      {isMaintenance && <MaintenanceBanner position="top" />}
      <div
        style={{
          padding: 'clamp(10px, 4vw, 20px)',
          marginTop: isMaintenance ? 28 : 0,
          marginBottom: isMaintenance ? 28 : 0,
          paddingBottom: selectionMode ? 90 : 'clamp(10px, 4vw, 20px)',
        }}
      >
        <SiteNav />

        {/* 開閉タブ（▼/▲）と、その横に常時表示する弾選択・並び替え・昇降順 */}
        <ControlsBar
          open={controlsOpen}
          onToggle={() => setControlsOpen((v) => !v)}
          active={!!searchQuery.trim() || hasActiveFilters(filters)}
        >
          <PackSelect groups={groups} value={activeKey} onChange={setGroupKey} />

          <select className="field" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="slot">枠番号順</option>
            <option value="rarity">レアリティ順</option>
            <option value="name">カード名順</option>
            <option value="hp">HP順</option>
          </select>
          <button
            className="btn-secondary"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            disabled={slotSort}
            title={slotSort ? '枠番号順では昇降順を切り替えられません' : undefined}
            style={slotSort ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            {effectiveSortDir === 'asc' ? '昇順 ▲' : '降順 ▼'}
          </button>
        </ControlsBar>

        {/* 操作パネル */}
        {controlsOpen && (
        <section className="hud-panel" style={{ padding: 'clamp(10px, 3vw, 16px)', marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <input
              className="field"
              type="text"
              placeholder="カード名・タグ・キーワードで検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: '1 1 200px', minWidth: 160 }}
            />

            <button
              className={selectionMode ? 'btn-primary' : 'btn-secondary'}
              onClick={() => (selectionMode ? handleExitSelectionMode() : setSelectionMode(true))}
            >
              {selectionMode ? '選択モードを終了' : '選択してダウンロード'}
            </button>

            <button
              className={filterPanelOpen || hasActiveFilters(filters) ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setFilterPanelOpen((v) => !v)}
              title="絞り込みフィルター"
              aria-label="絞り込みフィルター"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FilterIcon /> フィルター{hasActiveFilters(filters) ? `（${activeFilterChips(filters).length}）` : ''}
            </button>
          </div>

          {/* お気に入りグループ */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <span className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-cyan)', marginRight: 4 }}>
              FAV://
            </span>
            {Object.keys(favGroups).map((name) => (
              <button key={name} className={activeGroup === name ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveGroup(name)}>
                {name}（{favGroups[name].length}）
              </button>
            ))}
            <button
              className="btn-secondary"
              onClick={() => {
                const name = prompt('新しいグループ名を入力してください', 'お気に入り')
                if (name && name.trim()) createGroup(name.trim())
              }}
            >
              ＋新しいグループ
            </button>
            {activeGroup && (
              <button className="btn-danger" onClick={() => deleteGroup(activeGroup)}>
                「{activeGroup}」を削除
              </button>
            )}
          </div>

          {/* 絞り込みフィルター（フィルターボタンを押したときだけ表示） */}
          {filterPanelOpen && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hud-line)' }}>
              <CardFilterPanel cards={cards} filters={filters} onChange={setFilters} onClose={() => setFilterPanelOpen(false)} />
            </div>
          )}
        </section>
        )}

        {/* 件数・読み込み状態 */}
        <div className="hud-mono" style={{ fontSize: 12, color: 'var(--hud-ink-dim)', marginBottom: 12 }}>
          {loading ? 'LOADING...' : `${sorted.length} ITEMS`}
        </div>

        {/* 新規・再録・パラレルをそれぞれ別のセクションとして表示する。
            検索なし・枠番号順のときは、未登録の枠も「空き枠」としてその番号を表示する */}
        {showEmptySlots
          ? slotTypeConfig
              .filter((tc) => tc.count > 0 || cards.some((c) => c.type === tc.type))
              .map((tc) => {
                const typeCards = cards.filter((c) => c.type === tc.type)
                const extraPacks = extraPacksOf(tc.type)
                return (
                  <div key={tc.type} style={{ marginBottom: 28 }}>
                    <h3
                      className="hud-font"
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--hud-cyan)',
                        borderLeft: '2px solid var(--hud-cyan)',
                        paddingLeft: 8,
                        marginBottom: 10,
                        letterSpacing: '0.03em',
                      }}
                    >
                      {tc.type}
                      <span className="hud-mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--hud-ink-dim)', fontWeight: 400 }}>
                        {typeCards.length}
                        {tc.count > 0 ? ` / ${tc.count}` : ''} ITEMS
                      </span>
                    </h3>
                    <SlotGrid
                      cards={primaryCardsOf(tc.type)}
                      count={tc.count}
                      onCardClick={handleCardClick}
                      isFav={(c) => isFav(c, activeGroup)}
                      onToggleFav={handleToggleFav}
                      selectionMode={selectionMode}
                      selectedIds={selectedIds}
                      onToggleSelect={handleToggleSelect}
                      tileScale={cardScale}
                    />

                    {/* パックセットの追加パック（再販など）のカード。代表パックの枠の後ろに、パックごとに続けて表示する */}
                    {extraPacks.map((x) => (
                      <div key={x.set.set_code} style={{ marginTop: 16 }}>
                        <div className="hud-mono" style={{ fontSize: 12, color: 'var(--hud-cyan)', marginBottom: 8 }}>
                          ▶ {x.set.set_code}（{x.set.set_name}）
                          <span style={{ marginLeft: 8, color: 'var(--hud-ink-dim)' }}>{x.cards.length} ITEMS</span>
                        </div>
                        <CardGrid
                          cards={x.cards}
                          onCardClick={handleCardClick}
                          isFav={(c) => isFav(c, activeGroup)}
                          onToggleFav={handleToggleFav}
                          selectionMode={selectionMode}
                          selectedIds={selectedIds}
                          onToggleSelect={handleToggleSelect}
                          tileScale={cardScale}
                        />
                      </div>
                    ))}
                  </div>
                )
              })
          : groupedByType.map((group) => (
              <div key={group.type} style={{ marginBottom: 28 }}>
                <h3
                  className="hud-font"
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--hud-cyan)',
                    borderLeft: '2px solid var(--hud-cyan)',
                    paddingLeft: 8,
                    marginBottom: 10,
                    letterSpacing: '0.03em',
                  }}
                >
                  {group.type}
                  <span className="hud-mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--hud-ink-dim)', fontWeight: 400 }}>
                    {group.cards.length} ITEMS
                  </span>
                </h3>
                <CardGrid
                  cards={group.cards}
                  onCardClick={handleCardClick}
                  isFav={(c) => isFav(c, activeGroup)}
                  onToggleFav={handleToggleFav}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  tileScale={cardScale}
                  sortKey={sortKey}
                />
              </div>
            ))}

        <CardModal
          card={currentCard}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
          hasNav={navCards.length > 1}
          onSelectCard={handleSelectRelated}
        />
      </div>

      {selectionMode && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: isMaintenance ? 28 : 0,
            background: 'var(--hud-panel)',
            borderTop: '1px solid var(--hud-cyan)',
            padding: '10px clamp(10px, 4vw, 20px)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            zIndex: 900,
            color: 'var(--hud-ink)',
          }}
        >
          <span className="hud-mono" style={{ fontSize: 13, color: 'var(--hud-cyan)' }}>
            {selectedIds.size} SELECTED
          </span>
          <button className="btn-primary" onClick={handleBulkDownload} disabled={!selectedIds.size}>
            選択した画像をダウンロード（ZIP）
          </button>
          <button className="btn-secondary" onClick={() => setSelectedIds(new Set())}>
            選択を解除
          </button>
          {zipStatus && <span style={{ fontSize: 12, color: 'var(--hud-ink-dim)' }}>{zipStatus}</span>}
        </div>
      )}

      {isMaintenance && <MaintenanceBanner position="bottom" />}
      <CardSizeControl scale={cardScale} onChange={setCardScale} />
    </>
  )
}