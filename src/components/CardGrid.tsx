import type { Card } from '../types/card'
import { CardTile } from './CardTile'
import { useGridLayout } from '../hooks/useGridLayout'

type Props = {
  cards: Card[]
  onCardClick: (card: Card) => void
  isFav: (card: Card) => boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (card: Card) => void
  tileScale?: number // 右下の表示サイズ変更ボタンから渡される倍率（既定1）
}

export function CardGrid({ cards, onCardClick, isFav, onToggleFav, selectionMode, selectedIds, onToggleSelect, tileScale = 1 }: Props) {
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
      {cards.map((card) => (
        <CardTile
          key={card.id}
          card={card}
          onClick={onCardClick}
          isFav={isFav(card)}
          onToggleFav={onToggleFav}
          selectionMode={selectionMode}
          selected={selectedIds.has(card.id)}
          onToggleSelect={onToggleSelect}
          compact={layout.compact}
        />
      ))}
    </div>
  )
}