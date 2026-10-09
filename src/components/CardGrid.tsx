import { Fragment } from 'react'
import type { Card } from '../types/card'
import { CardTile } from './CardTile'
import { useGridLayout } from '../hooks/useGridLayout'
import { getSortGroupLabel, type SortKey } from '../utils/sortCards'

type Props = {
  cards: Card[]
  onCardClick: (card: Card) => void
  isFav: (card: Card) => boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (card: Card) => void
  tileScale?: number // 右下の表示サイズ変更ボタンから渡される倍率（既定1）
  sortKey?: SortKey // 並び替えキー。レアリティ・HP・カード名順のときは、区切りの見出しを入れる
}

export function CardGrid({ cards, onCardClick, isFav, onToggleFav, selectionMode, selectedIds, onToggleSelect, tileScale = 1, sortKey }: Props) {
  // PCは最小タイル幅ベースの自動列数、スマホは倍率1で4列（詳細はuseGridLayout）
  const layout = useGridLayout(tileScale)
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: layout.gridTemplateColumns,
        gap: layout.gap,
      }}
    >
      {cards.map((card, index) => {
        // 並び替えの区切り: 前のカードと見出しが変わったところに、行いっぱいの見出しを入れる
        const label = sortKey ? getSortGroupLabel(card, sortKey) : null
        const prevLabel = sortKey && index > 0 ? getSortGroupLabel(cards[index - 1]!, sortKey) : null
        const startsGroup = label !== null && (index === 0 || label !== prevLabel)
        let groupCount = 0
        if (startsGroup) {
          for (let k = index; k < cards.length && getSortGroupLabel(cards[k]!, sortKey!) === label; k++) groupCount++
        }
        return (
          <Fragment key={card.id}>
            {startsGroup && (
              <div
                className="hud-mono"
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: index === 0 ? 0 : 8,
                  fontSize: layout.compact ? 12 : 13,
                  color: 'var(--hud-cyan)',
                }}
              >
                <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>▶ {label}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--hud-line)' }} />
                <span style={{ whiteSpace: 'nowrap', color: 'var(--hud-ink-dim)' }}>{groupCount}枚</span>
              </div>
            )}
            <CardTile
              card={card}
              onClick={onCardClick}
              isFav={isFav(card)}
              onToggleFav={onToggleFav}
              selectionMode={selectionMode}
              selected={selectedIds.has(card.id)}
              onToggleSelect={onToggleSelect}
              compact={layout.compact}
            />
          </Fragment>
        )
      })}
    </div>
  )
}