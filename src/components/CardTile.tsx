import type { Card } from '../types/card'

type Props = {
  card: Card
  onClick: (card: Card) => void
  isFav: boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (card: Card) => void
}

export function CardTile({ card, onClick, isFav, onToggleFav, selectionMode, selected, onToggleSelect }: Props) {
  return (
    <div
      onClick={() => (selectionMode ? onToggleSelect(card) : onClick(card))}
      style={{
        position: 'relative',
        cursor: 'pointer',
        border: selected ? '2px solid #d4af6a' : '1px solid #444',
        borderRadius: 8,
        overflow: 'hidden',
        width: 160,
      }}
    >
      {selectionMode ? (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            zIndex: 2,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: selected ? '#d4af6a' : 'rgba(0,0,0,0.5)',
            color: selected ? '#1a1305' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 'bold',
          }}
        >
          {selected ? '✓' : ''}
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFav(card, e)
          }}
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            zIndex: 2,
            background: 'rgba(0,0,0,0.5)',
            border: 'none',
            borderRadius: '50%',
            width: 28,
            height: 28,
            color: isFav ? '#d4af6a' : '#fff',
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          {isFav ? '★' : '☆'}
        </button>
      )}
      <img
        src={card.image_url ?? ''}
        alt={card.card_name}
        loading="lazy"
        style={{ width: '100%', aspectRatio: '5/7', objectFit: 'cover' }}
      />
      <div style={{ padding: 8 }}>
        {card.card_type && (
          <div style={{ fontSize: 11, color: '#999' }}>{card.card_type}</div>
        )}
        <div style={{ fontSize: 13, fontWeight: 'bold' }}>{card.card_name}</div>
        <div style={{ fontSize: 11, color: '#999' }}>
          {card.attribute ?? ''}
          {card.hp ? ` / HP${card.hp}` : ''}
        </div>
      </div>
    </div>
  )
}