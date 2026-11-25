import { useEffect, useState } from 'react'
import { useSets } from '../hooks/useSets'
import { usePackSets } from '../hooks/usePackSets'
import { groupInfoBySetCode, comparePackMeta, type PackGroupInfo, type PackOrder } from '../utils/packGroups'
import { useAllCards } from '../hooks/useAllCards'
import { useCardSearch } from '../hooks/useCardSearch'
import { sortCards, type SortKey, type SortDir } from '../utils/sortCards'
import { applyCardFilters, hasActiveFilters, EMPTY_FILTERS, type CardFilters } from '../utils/cardFilters'
import { CardGrid } from '../components/CardGrid'
import { CardFilterPanel, ActiveFilterChips } from '../components/CardFilterPanel'
import { CardModal } from '../components/CardModal'
import { SiteNav } from '../components/SiteNav'
import { useIsMobile } from '../hooks/useGridLayout'
import { CardSizeControl, CARD_SIZE_DEFAULT } from '../components/CardSizeControl'
import { ControlsBar, ControlGroup } from '../components/ControlsBar'
import { SearchBox } from '../components/SearchBox'
import { FilterButton } from '../components/FilterButton'
import { downloadCardsAsZip } from '../lib/download'
import { logDownloadEvents } from '../lib/logEvent'
import type { Card } from '../types/card'

// 一括ダウンロードで、一度に取得する枚数が多いときの確認の目安
const BULK_CONFIRM_COUNT = 200
const CARD_SIZE_STORAGE_KEY = 'horoka-display:cardSize'

// パックセットごと（パックセットに入っていないパックは、そのパックごと）に区切ってまとめる。
// カードの並び順は維持し、区切りの順番は、パックの並び順（種類順／発売日順）にする
function groupCardsByPackGroup(
  cards: Card[],
  info: Map<string, PackGroupInfo>,
  order: PackOrder
): { key: string; name: string; cards: Card[] }[] {
  const byKey = new Map<string, { key: string; name: string; cards: Card[]; minCode: string; releaseDate: string | null; packType: string | null }>()
  cards.forEach((c) => {
    const g = info.get(c.set_code) ?? { key: c.set_code, name: c.set_code, releaseDate: null, packType: null }
    const existing = byKey.get(g.key)
    if (existing) {
      existing.cards.push(c)
      if (c.set_code.localeCompare(existing.minCode, undefined, { numeric: true }) < 0) existing.minCode = c.set_code
    } else {
      byKey.set(g.key, { key: g.key, name: g.name, cards: [c], minCode: c.set_code, releaseDate: g.releaseDate, packType: g.packType })
    }
  })
  const cmp = comparePackMeta(order)
  return Array.from(byKey.values())
    .sort((a, b) => cmp({ releaseDate: a.releaseDate, packType: a.packType, code: a.minCode }, { releaseDate: b.releaseDate, packType: b.packType, code: b.minCode }))
    .map(({ key, name, cards: groupCards }) => ({ key, name, cards: groupCards }))
}

export function SearchPage() {
  const { sets } = useSets()
  const { cards, loading } = useAllCards()

  // 全カード検索は「新カード一覧」の公開/非公開設定とは関係なく、登録済みの全弾を対象にする
  const { packSets } = usePackSets()
  const packGroupInfo = groupInfoBySetCode(sets, packSets)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('overall')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  // 新カード一覧で選んでいるパックには左右されず、最初は全パックを対象に表示する
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  // 操作パネル（キーワード検索・フィルター）の開閉。キーワード検索がこのページの主役なので、初回は開いておく。
  // 並び替え・昇降順は、パネルを閉じていても使えるよう開閉タブの横に常時表示する
  // パックの並び順（種類順／発売日順）。端末ごとに覚えておく
  const [packOrder, setPackOrder] = useState<PackOrder>(() => (localStorage.getItem(PACK_ORDER_STORAGE_KEY) === 'release' ? 'release' : 'type'))
  useEffect(() => {
    localStorage.setItem(PACK_ORDER_STORAGE_KEY, packOrder)
  }, [packOrder])
  const [navIndex, setNavIndex] = useState(-1)
  const isMobile = useIsMobile()

  // パックごとの区切りをなくして、検索結果全体をひとつのリストとして並び替えて表示するモード（端末ごとに覚える）
  const [mergePacks, setMergePacks] = useState(() => localStorage.getItem(MERGE_PACKS_STORAGE_KEY) === '1')
  useEffect(() => {
    localStorage.setItem(MERGE_PACKS_STORAGE_KEY, mergePacks ? '1' : '0')
  }, [mergePacks])

  // カード表示サイズ（右下の+/🔄/-ボタンで変更）。新カード一覧と設定を共有する
  const [cardScale, setCardScale] = useState(() => {
    const saved = localStorage.getItem(CARD_SIZE_STORAGE_KEY)
    return saved ? Number(saved) : CARD_SIZE_DEFAULT
  })
  useEffect(() => {
    localStorage.setItem(CARD_SIZE_STORAGE_KEY, String(cardScale))
  }, [cardScale])

  const filteredByPanel = applyCardFilters(cards, filters)
  const searched = useCardSearch(filteredByPanel, searchQuery)
  const sorted = sortCards(searched, sortKey, sortDir)
  const grouped = groupCardsByPackGroup(sorted, packGroupInfo, packOrder)
  // 詳細モーダルの前へ/次へで辿る順序。一覧に表示されている並び（弾ごとのまとまり・並べ替え後の順）そのままにする
  const navCards = mergePacks ? sorted : grouped.flatMap((g) => g.cards)

  const handleCardClick = (card: Card) => {
    const idx = navCards.findIndex((c) => c.id === card.id)
    setNavIndex(idx)
  }
  const handleClose = () => setNavIndex(-1)
  const handlePrev = () => setNavIndex((i) => (i - 1 + navCards.length) % navCards.length)
  const handleNext = () => setNavIndex((i) => (i + 1) % navCards.length)
  const currentCard = navIndex !== -1 ? navCards[navIndex] ?? null : null

  // ----- 一括選択ダウンロード（新カード一覧と同じ） -----
  // 検索語を変えても、選んだカードは、そのまま残る（見えていないカードも、ダウンロードに含む）
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [zipStatus, setZipStatus] = useState('')
  const [downloading, setDownloading] = useState(false)

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
  // 今、一覧に出ているカードを、すべて選ぶ（検索結果をまとめて、ダウンロードするときに使う）
  const handleSelectShown = () => setSelectedIds((prev) => new Set([...prev, ...sorted.map((c) => c.id)]))
  const handleBulkDownload = async () => {
    const selectedCards = cards.filter((c) => selectedIds.has(c.id))
    if (!selectedCards.length || downloading) return
    if (selectedCards.length > BULK_CONFIRM_COUNT && !window.confirm(`${selectedCards.length}枚の画像を、まとめて取得します。時間がかかり、端末への負荷も大きくなります。続けますか？`)) return
    setDownloading(true)
    try {
      await downloadCardsAsZip(selectedCards, (done, total) => {
        setZipStatus(`画像を取得中... (${done}/${total})`)
      })
      logDownloadEvents(selectedCards)
      setZipStatus(`${selectedCards.length}枚をダウンロードしました`)
    } catch (err) {
      setZipStatus('ダウンロードに失敗しました: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setDownloading(false)
    }
  }

  return (
    // カードの表示範囲は、画面の幅に対してPCは80%・スマホは90%にして、中央に寄せる
    <div style={{ width: isMobile ? '90%' : '80%', margin: '0 auto', padding: 'clamp(10px, 4vw, 20px)', paddingBottom: selectionMode ? 90 : 'clamp(10px, 4vw, 20px)' }}>
      <SiteNav />

      {/* 1行目: 検索バー（このページには開閉するパネルが無いため、メニューのタブは出さない）。2行目: カード（並び替え・昇降順・フィルター）とパック（並び順・区切り）のまとまり */}
      <ControlsBar
        search={
          <>
            <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder="カード名・タグ・キーワード（全弾対象・スペースで複数）" />
            {/* 一括ダウンロード：押すと、選択モードになり、カードを選んで、ZIPでまとめてダウンロードできる */}
            <button
              type="button"
              className={selectionMode ? 'btn-primary' : 'btn-secondary'}
              onClick={() => (selectionMode ? handleExitSelectionMode() : setSelectionMode(true))}
              aria-pressed={selectionMode}
              aria-label={selectionMode ? '選択モードを終了' : '選択してダウンロード'}
              title={selectionMode ? '選択モードを終了' : 'カードを選んで、画像をまとめてダウンロード（ZIP）'}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, flexShrink: 0, whiteSpace: 'nowrap', ...(isMobile ? { padding: '0 10px' } : null) }}
            >
              <DownloadIcon />
              {!isMobile && (selectionMode ? '選択モードを終了' : '選択してダウンロード')}
            </button>
          </>
        }
      >
        <ControlGroup kind="card">
          <select className="field" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="overall">カード番号順</option>
            <option value="name">カード名順</option>
            <option value="rarity">レアリティ順</option>
            <option value="hp">HP順</option>
          </select>
          <button className="btn-secondary" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>
            {sortDir === 'asc' ? '昇順 ▲' : '降順 ▼'}
          </button>
          <FilterButton filters={filters} open={filterPanelOpen} onToggle={() => setFilterPanelOpen((v) => !v)} />
        </ControlGroup>

        <ControlGroup kind="pack">
          {/* パックの並び順：種類順（パックの種類 → 弾コード）／発売日順（新しい順） */}
          <select className="field" value={packOrder} onChange={(e) => setPackOrder(e.target.value as PackOrder)} aria-label="パックの並び順">
            <option value="type">種類順</option>
            <option value="release">発売日順（新しい順）</option>
          </select>
          <button
            className={mergePacks ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setMergePacks((v) => !v)}
            aria-pressed={mergePacks}
            title={mergePacks ? 'パックごとの区切りをなくして表示中（押すと元に戻す）' : 'パックごとの区切りをなくして、全体をまとめて並び替える'}
            aria-label="パックごとの区切りをなくす"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <PackMergeIcon />
            {!isMobile && 'パック区切りなし'}
          </button>
        </ControlGroup>
      </ControlsBar>

      {/* 選択中のフィルター条件。フィルターを開かなくても、ここから外せる */}
      {hasActiveFilters(filters) && (
        <div style={{ marginBottom: 12 }}>
          <ActiveFilterChips filters={filters} onChange={setFilters} />
        </div>
      )}

      {/* 絞り込みフィルター：スマホは画面下のシート、PCは画面中央のモーダル */}
        {filterPanelOpen && <CardFilterPanel asSheet={isMobile} cards={cards} filters={filters} onChange={setFilters} sets={sets} resultCount={sorted.length} onClose={() => setFilterPanelOpen(false)} />}

      <div className="hud-mono" style={{ fontSize: 12, color: 'var(--hud-ink-dim)', marginBottom: 12 }}>
        {loading ? 'LOADING...' : `${sorted.length} ITEMS / ${grouped.length} SETS`}
      </div>

      {mergePacks ? (
        <CardGrid
          cards={sorted}
          onCardClick={handleCardClick}
          isFav={() => false}
          onToggleFav={() => {}}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          tileScale={cardScale}
          sortKey={sortKey}
          groupWithSet
        />
      ) : (
        <>
      {grouped.map((g) => (
        <div key={g.key} style={{ marginBottom: 28 }}>
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
            {g.name}
            <span className="hud-mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--hud-ink-dim)', fontWeight: 400 }}>
              {g.cards.length} ITEMS
            </span>
          </h3>
          <CardGrid
            cards={g.cards}
            onCardClick={handleCardClick}
            isFav={() => false}
            onToggleFav={() => {}}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            tileScale={cardScale}
            sortKey={sortKey}
          />
        </div>
      ))}
        </>
      )}

      {selectionMode && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--hud-panel)',
            borderTop: '1px solid var(--hud-cyan)',
            padding: '10px clamp(10px, 4vw, 20px)',
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', // iPhoneのホームバーに重ならないように
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
          <button className="btn-primary" onClick={handleBulkDownload} disabled={!selectedIds.size || downloading}>
            {downloading ? '取得中…' : '選択した画像をダウンロード（ZIP）'}
          </button>
          <button className="btn-secondary" onClick={handleSelectShown} disabled={downloading || !sorted.length}>
            表示中の{sorted.length}枚を選択
          </button>
          <button className="btn-secondary" onClick={() => setSelectedIds(new Set())} disabled={downloading || !selectedIds.size}>
            選択を解除
          </button>
          {zipStatus && <span style={{ fontSize: 12, color: 'var(--hud-ink-dim)' }}>{zipStatus}</span>}
        </div>
      )}

      <CardModal card={currentCard} onClose={handleClose} onPrev={handlePrev} onNext={handleNext} hasNav={navCards.length > 1} onSelectCard={() => {}} />
      <CardSizeControl scale={cardScale} onChange={setCardScale} />
    </div>
  )
}

const MERGE_PACKS_STORAGE_KEY = 'horoka-display:search:mergePacks'
const PACK_ORDER_STORAGE_KEY = 'horoka-display:search:packOrder'

// 「パックごとの区切りをなくす」ボタンのアイコン（ひとつにまとまった4枚のカード）
function PackMergeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.75" y="1.75" width="5" height="5" rx="1" />
      <rect x="9.25" y="1.75" width="5" height="5" rx="1" />
      <rect x="1.75" y="9.25" width="5" height="5" rx="1" />
      <rect x="9.25" y="9.25" width="5" height="5" rx="1" />
    </svg>
  )
}

// 一括ダウンロードボタンのアイコン（下向きの矢印と、受け皿）
function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v8M4.75 7.25 8 10.5l3.25-3.25" />
      <path d="M2.5 12.5v1h11v-1" />
    </svg>
  )
}