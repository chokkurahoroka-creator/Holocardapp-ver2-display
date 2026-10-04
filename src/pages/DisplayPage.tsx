import { useEffect, useState } from 'react'
import { useSets } from '../hooks/useSets'
import { useCards } from '../hooks/useCards'
import { useCardSearch } from '../hooks/useCardSearch'
import { useSiteStatus } from '../hooks/useSiteStatus'
import { sortCards, type SortKey, type SortDir } from '../utils/sortCards'
import { CardGrid } from '../components/CardGrid'
import { SlotGrid } from '../components/SlotGrid'
import { CardFilterPanel } from '../components/CardFilterPanel'
import { applyCardFilters, hasActiveFilters, EMPTY_FILTERS, type CardFilters } from '../utils/cardFilters'
import { CardModal } from '../components/CardModal'
import { MaintenanceBanner } from '../components/MaintenanceBanner'
import type { Card } from '../types/card'
import { useFavorites } from '../hooks/useFavorites'
import { downloadCardsAsZip } from '../lib/download'
import { logEvent, logDownloadEvents } from '../lib/logEvent'
import { SiteNav } from '../components/SiteNav'

const THIS_PAGE_KEY = 'display'
const STORAGE_KEY = 'horoka-display:display:setCode'

// 新規・再録・パラレルの順で、それぞれの枠を分けてグループ化する（枠内の並び順はsortedの順序のまま維持）
const TYPE_ORDER: Card['type'][] = ['新規', '再録', 'パラレル']
function groupCardsByType(cards: Card[]): { type: Card['type']; cards: Card[] }[] {
  return TYPE_ORDER.map((type) => ({ type, cards: cards.filter((c) => c.type === type) })).filter((g) => g.cards.length > 0)
}

export function DisplayPage() {
  const { sets } = useSets()
  const [setCode, setSetCode] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  const { cards, loading } = useCards(setCode)
  const { status: siteStatus } = useSiteStatus()
  const isMaintenance = siteStatus[THIS_PAGE_KEY] === '作業中'

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('slot')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS)

  // 弾を切り替えたら、別の弾の選択肢が残らないようフィルターをリセットする
  useEffect(() => {
    setFilters(EMPTY_FILTERS)
  }, [setCode])

  const filteredByPanel = applyCardFilters(cards, filters)
  const searched = useCardSearch(filteredByPanel, searchQuery)
  const sorted = sortCards(searched, sortKey, sortDir)
  const groupedByType = groupCardsByType(sorted)

  // パック選択リストは、管理画面で「公開中」に設定されている弾だけを、名前順で表示する
  const visibleSets = sets
    .filter((s) => s.status === '公開中')
    .slice()
    .sort((a, b) => a.set_name.localeCompare(b.set_name, 'ja'))

  // 通し番号（overall_number）の割り振り方は登録時と同じ: 新規=1〜、再録=新規の続き、パラレル=再録の続き
  const setInfo = sets.find((s) => s.set_code === setCode)
  // 検索中や、枠番号順以外の並び替えをしているときは「空いている枠」の概念がそのままでは意味を持たないため、
  // 検索なし・枠番号順のときだけ空き枠を表示する
  const showEmptySlots = !searchQuery.trim() && !hasActiveFilters(filters) && sortKey === 'slot' && !!setInfo
  const slotTypeConfig = setInfo
    ? [
        { type: '新規' as const, start: 1, count: setInfo.total_new ?? 0 },
        { type: '再録' as const, start: (setInfo.total_new ?? 0) + 1, count: setInfo.total_rerun ?? 0 },
        { type: 'パラレル' as const, start: (setInfo.total_new ?? 0) + (setInfo.total_rerun ?? 0) + 1, count: setInfo.total_parallel ?? 0 },
      ]
    : []

  const [navIndex, setNavIndex] = useState(-1)

  // ----- サイト訪問ログ：初回マウント時に1回だけ記録 -----
  useEffect(() => {
    logEvent('visit')
  }, [])

  // ----- 選択中の弾を保存し、次回このページを開いたときも引き継ぐ -----
  useEffect(() => {
    if (setCode) localStorage.setItem(STORAGE_KEY, setCode)
    else localStorage.removeItem(STORAGE_KEY)
  }, [setCode])

  // ----- 検索ログ：入力が止まって600ms経ったら記録（デバウンス） -----
  useEffect(() => {
    if (!searchQuery.trim()) return
    const timer = setTimeout(() => {
      logEvent('search', { query: searchQuery.trim() })
    }, 600)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleSelectRelated = (card: Card) => {
    const idx = sorted.findIndex((c) => c.id === card.id)
    if (idx !== -1) {
      setNavIndex(idx)
    } else {
      console.log('別弾の関連カードは現状未対応:', card.card_name)
    }
  }

  const handleCardClick = (card: Card) => {
    const idx = sorted.findIndex((c) => c.id === card.id)
    setNavIndex(idx)
    if (idx !== -1) {
      logEvent('view', { set_code: card.set_code, type: card.type, slot: card.slot, card_name: card.card_name })
    }
  }
  const handleClose = () => setNavIndex(-1)
  const handlePrev = () => setNavIndex((i) => (i - 1 + sorted.length) % sorted.length)
  const handleNext = () => setNavIndex((i) => (i + 1) % sorted.length)

  const currentCard = navIndex !== -1 ? sorted[navIndex] : null
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
      <div style={{ padding: 20, marginTop: isMaintenance ? 28 : 0, marginBottom: isMaintenance ? 28 : 0, paddingBottom: selectionMode ? 90 : 20 }}>
        <SiteNav />

        {/* 操作パネル */}
        <section className="hud-panel" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <select className="field hud-mono" value={setCode ?? ''} onChange={(e) => setSetCode(e.target.value || null)}>
              <option value="">弾を選択してください</option>
              {visibleSets.map((s) => (
                <option key={s.set_code} value={s.set_code}>
                  {s.set_code}（{s.set_name}）
                </option>
              ))}
            </select>

            <input
              className="field"
              type="text"
              placeholder="カード名・タグ・キーワードで検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: '1 1 200px', minWidth: 160 }}
            />

            <select className="field" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="slot">枠番号順</option>
              <option value="rarity">レアリティ順</option>
              <option value="name">カード名順</option>
              <option value="hp">HP順</option>
            </select>
            <button className="btn-secondary" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>
              {sortDir === 'asc' ? '昇順 ▲' : '降順 ▼'}
            </button>

            <button
              className={selectionMode ? 'btn-primary' : 'btn-secondary'}
              onClick={() => (selectionMode ? handleExitSelectionMode() : setSelectionMode(true))}
            >
              {selectionMode ? '選択モードを終了' : '選択してダウンロード'}
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

          {/* 絞り込みフィルター */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hud-line)' }}>
            <CardFilterPanel cards={cards} filters={filters} onChange={setFilters} />
          </div>
        </section>

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
                      cards={typeCards}
                      startNumber={tc.start}
                      count={tc.count}
                      onCardClick={handleCardClick}
                      isFav={(c) => isFav(c, activeGroup)}
                      onToggleFav={handleToggleFav}
                      selectionMode={selectionMode}
                      selectedIds={selectedIds}
                      onToggleSelect={handleToggleSelect}
                    />
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
                />
              </div>
            ))}

        <CardModal
          card={currentCard}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
          hasNav={sorted.length > 1}
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
            padding: '10px 20px',
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
    </>
  )
}