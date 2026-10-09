import { useEffect, useState } from 'react'
import { useSets } from '../hooks/useSets'
import { useAllCards } from '../hooks/useAllCards'
import { useCardSearch } from '../hooks/useCardSearch'
import { sortCards, type SortKey, type SortDir } from '../utils/sortCards'
import { applyCardFilters, hasActiveFilters, activeFilterChips, EMPTY_FILTERS, type CardFilters } from '../utils/cardFilters'
import { CardGrid } from '../components/CardGrid'
import { CardFilterPanel } from '../components/CardFilterPanel'
import { CardModal } from '../components/CardModal'
import { SiteNav } from '../components/SiteNav'
import { FilterIcon } from '../components/FilterIcon'
import { CardSizeControl, CARD_SIZE_DEFAULT } from '../components/CardSizeControl'
import type { Card } from '../types/card'

const EMPTY_SELECTION = new Set<number>()
const CARD_SIZE_STORAGE_KEY = 'horoka-display:cardSize'

function groupCardsBySet(cards: Card[], setNameByCode: Map<string, string>): { set_code: string; set_name: string; cards: Card[] }[] {
  const order: string[] = []
  const byCode = new Map<string, Card[]>()
  cards.forEach((c) => {
    if (!byCode.has(c.set_code)) {
      byCode.set(c.set_code, [])
      order.push(c.set_code)
    }
    byCode.get(c.set_code)!.push(c)
  })
  return order
    .map((set_code) => ({
      set_code,
      set_name: setNameByCode.get(set_code) ?? set_code,
      cards: byCode.get(set_code)!,
    }))
    .sort((a, b) => a.set_code.localeCompare(b.set_code))
}

export function SearchPage() {
  const { sets } = useSets()
  const { cards, loading } = useAllCards()

  // 全カード検索は「新カード一覧」の公開/非公開設定とは関係なく、登録済みの全弾を対象にする
  const setNameByCode = new Map(sets.map((s) => [s.set_code, s.set_name]))

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  // 初期値は「新カード一覧」で最後に見ていたパックにしておく（無ければすべて対象）
  const [filters, setFilters] = useState<CardFilters>(() => {
    const lastSetCode = localStorage.getItem('horoka-display:display:setCode')
    return lastSetCode ? { ...EMPTY_FILTERS, setCodes: [lastSetCode] } : EMPTY_FILTERS
  })
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [navIndex, setNavIndex] = useState(-1)

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
  const grouped = groupCardsBySet(sorted, setNameByCode)

  const handleCardClick = (card: Card) => {
    const idx = sorted.findIndex((c) => c.id === card.id)
    setNavIndex(idx)
  }
  const handleClose = () => setNavIndex(-1)
  const handlePrev = () => setNavIndex((i) => (i - 1 + sorted.length) % sorted.length)
  const handleNext = () => setNavIndex((i) => (i + 1) % sorted.length)
  const currentCard = navIndex !== -1 ? sorted[navIndex] : null

  return (
    <div style={{ padding: 'clamp(10px, 4vw, 20px)' }}>
      <SiteNav />

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

          <select className="field" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="name">カード名順</option>
            <option value="rarity">レアリティ順</option>
            <option value="overall">カード番号順（通し番号）</option>
            <option value="hp">HP順</option>
          </select>
          <button className="btn-secondary" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>
            {sortDir === 'asc' ? '昇順 ▲' : '降順 ▼'}
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

        {filterPanelOpen && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hud-line)' }}>
            <CardFilterPanel cards={cards} filters={filters} onChange={setFilters} sets={sets} onClose={() => setFilterPanelOpen(false)} />
          </div>
        )}
      </section>

      <div className="hud-mono" style={{ fontSize: 12, color: 'var(--hud-ink-dim)', marginBottom: 12 }}>
        {loading ? 'LOADING...' : `${sorted.length} ITEMS / ${grouped.length} SETS`}
      </div>

      {grouped.map((g) => (
        <div key={g.set_code} style={{ marginBottom: 28 }}>
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
            {g.set_code}（{g.set_name}）
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
          />
        </div>
      ))}

      <CardModal card={currentCard} onClose={handleClose} onPrev={handlePrev} onNext={handleNext} hasNav={sorted.length > 1} onSelectCard={() => {}} />
      <CardSizeControl scale={cardScale} onChange={setCardScale} />
    </div>
  )
}