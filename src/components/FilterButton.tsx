import { FilterIcon } from './FilterIcon'
import { useIsMobile } from '../hooks/useGridLayout'
import { activeFilterChips, hasActiveFilters, type CardFilters } from '../utils/cardFilters'

type Props = {
  filters: CardFilters
  open: boolean
  onToggle: () => void
}

// 絞り込みフィルターの開閉ボタン（昇順・降順ボタンの右に置く）。条件が効いているときは、その数を出す
export function FilterButton({ filters, open, onToggle }: Props) {
  const isMobile = useIsMobile()
  const active = hasActiveFilters(filters)
  return (
    <button
      className={open || active ? 'btn-primary' : 'btn-secondary'}
      onClick={onToggle}
      title="絞り込みフィルター"
      aria-label="絞り込みフィルター"
      aria-expanded={open}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto', minHeight: 40 }}
    >
      <FilterIcon />
      {!isMobile && 'フィルター'}
      {active && (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#04232a', color: 'var(--hud-cyan)', fontSize: 11, fontWeight: 700 }}>
          {activeFilterChips(filters).length}
        </span>
      )}
    </button>
  )
}