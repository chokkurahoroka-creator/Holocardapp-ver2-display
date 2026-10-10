import { useEffect, useState } from 'react'
import { useSets } from '../hooks/useSets'
import { usePackSets } from '../hooks/usePackSets'
import { groupInfoBySetCode } from '../utils/packGroups'
import { useAllCards } from '../hooks/useAllCards'
import { useCardSearch } from '../hooks/useCardSearch'
import { sortCards, type SortKey, type SortDir } from '../utils/sortCards'
import { applyCardFilters, hasActiveFilters, activeFilterChips, EMPTY_FILTERS, type CardFilters } from '../utils/cardFilters'
import { CardGrid } from '../components/CardGrid'
import { CardFilterPanel } from '../components/CardFilterPanel'
import { CardModal } from '../components/CardModal'
import { SiteNav } from '../components/SiteNav'
import { FilterIcon } from '../components/FilterIcon'
import { useIsMobile } from '../hooks/useGridLayout'
import { CardSizeControl, CARD_SIZE_DEFAULT } from '../components/CardSizeControl'
import { ControlsBar, useControlsOpen } from '../components/ControlsBar'
import type { Card } from '../types/card'

const EMPTY_SELECTION = new Set<number>()
const CARD_SIZE_STORAGE_KEY = 'horoka-display:cardSize'

// パックセットごと（パックセットに入っていないパックは、そのパックごと）に区切ってまとめる。
// カードの並び順は維持し、区切りの順番は、含まれるパックの弾コードが小さい順にする
function groupCardsByPackGroup(
  cards: Card[],
  info: Map<string, { key: string; name: string }>
): { key: string; name: string; cards: Card[] }[] {
  const byKey = new Map<string, { key: string; name: string; cards: Card[]; minCode: string }>()
  cards.forEach((c) => {
    const g = info.get(c.set_code) ?? { key: c.set_code, name: c.set_code }
    const existing = byKey.get(g.key)
    if (existing) {
      existing.cards.push(c)
      if (c.set_code.localeCompare(existing.minCode, undefined, { numeric: true }) < 0) existing.minCode = c.set_code
    } else {
      byKey.set(g.key, { key: g.key, name: g.name, cards: [c], minCode: c.set_code })
    }
  })
  return Array.from(byKey.values())
    .sort((a, b) => a.minCode.localeCompare(b.minCode, undefined, { numeric: true }))
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
  const [controlsOpen, setControlsOpen] = useControlsOpen('search', true)
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
  const grouped = groupCardsByPackGroup(sorted, packGroupInfo)
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

  return (
    <div style={{ padding: 'clamp(10px, 4vw, 20px)' }}>
      <SiteNav />

      {/* 開閉タブ（▼/▲）と、その横に常時表示する並び替え・昇降順 */}
      <ControlsBar
        open={controlsOpen}
        onToggle={() => setControlsOpen((v) => !v)}
        active={!!searchQuery.trim() || hasActiveFilters(filters)}
      >
        <select className="field" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="overall">カード番号順</option>
          <option value="name">カード名順</option>
          <option value="rarity">レアリティ順</option>
          <option value="hp">HP順</option>
        </select>
        <button className="btn-secondary" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>
          {sortDir === 'asc' ? '昇順 ▲' : '降順 ▼'}
        </button>
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
      </ControlsBar>

      {controlsOpen && (
        <section className="hud-panel" style={{ padding: 'clamp(10px, 3vw, 16px)', marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <input
              className="field"
              type="text"
              placeholder="カード名・タグ・キーワードで検索（全弾対象）"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: '1 1 240px', minWidth: 160 }}
            />

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

          {filterPanelOpen && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hud-line)' }}>
              <CardFilterPanel cards={cards} filters={filters} onChange={setFilters} sets={sets} onClose={() => setFilterPanelOpen(false)} />
            </div>
          )}
        </section>
      )}

      <div className="hud-mono" style={{ fontSize: 12, color: 'var(--hud-ink-dim)', marginBottom: 12 }}>
        {loading ? 'LOADING...' : `${sorted.length} ITEMS / ${grouped.length} SETS`}
      </div>

      {mergePacks ? (
        <CardGrid
          cards={sorted}
          onCardClick={handleCardClick}
          isFav={() => false}
          onToggleFav={() => {}}
          selectionMode={false}
          selectedIds={EMPTY_SELECTION}
          onToggleSelect={() => {}}
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
            selectionMode={false}
            selectedIds={EMPTY_SELECTION}
            onToggleSelect={() => {}}
            tileScale={cardScale}
            sortKey={sortKey}
          />
        </div>
      ))}
        </>
      )}

      <CardModal card={currentCard} onClose={handleClose} onPrev={handlePrev} onNext={handleNext} hasNav={navCards.length > 1} onSelectCard={() => {}} />
      <CardSizeControl scale={cardScale} onChange={setCardScale} />
    </div>
  )
}

const MERGE_PACKS_STORAGE_KEY = 'horoka-display:search:mergePacks'

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