import type { Card } from '../types/card'
import { CardTile } from './CardTile'

type Props = {
  cards: Card[]
  onCardClick: (card: Card) => void
  isFav: (card: Card) => boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (card: Card) => void
}

export function CardGrid({ cards, onCardClick, isFav, onToggleFav, selectionMode, selectedIds, onToggleSelect }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12,
      }}
    >
      {cards.map((c) => (
        <CardTile
          key={c.id}
          card={c}
          onClick={onCardClick}
          isFav={isFav(c)}
          onToggleFav={onToggleFav}
          selectionMode={selectionMode}
          selected={selectedIds.has(c.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  )
}