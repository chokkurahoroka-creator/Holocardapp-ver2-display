import type { Card } from '../types/card'
import { RelatedCards } from './RelatedCards'
import { useRelatedCards } from '../hooks/useRelatedCards'
import { RatingRadar } from './RatingRadar'
import { downloadCardImage } from '../lib/download'
import { logEvent } from '../lib/logEvent'

type Props = {
  card: Card | null
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  hasNav: boolean
  onSelectCard: (card: Card) => void
}

export function CardModal({ card, onClose, onPrev, onNext, hasNav, onSelectCard }: Props) {
  const { related, loading } = useRelatedCards(card)
  if (!card) return null

  const handleDownload = async () => {
    await downloadCardImage(card)
    logEvent('download', { set_code: card.set_code, type: card.type, slot: card.slot, card_name: card.card_name })
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#1a1305',
          borderRadius: 12,
          padding: 20,
          maxWidth: 700,
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          gap: 20,
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 10, right: 10, fontSize: 20, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
        >
          ×
        </button>

        {hasNav && (
          <>
            <button
              onClick={onPrev}
              style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 28,
                background: 'rgba(0,0,0,0.5)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                borderRadius: '50%',
                width: 40,
                height: 40,
                zIndex: 10,
              }}
            >
              ‹
            </button>
            <button
              onClick={onNext}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 28,
                background: 'rgba(0,0,0,0.5)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                borderRadius: '50%',
                width: 40,
                height: 40,
                zIndex: 10,
              }}
            >
              ›
            </button>
          </>
        )}

        <div style={{ flexShrink: 0 }}>
          <img
            src={card.image_url ?? ''}
            alt={card.card_name}
            style={{ width: 240, aspectRatio: '5/7', objectFit: 'cover', borderRadius: 8 }}
          />
          <button
            onClick={handleDownload}
            style={{
              marginTop: 8,
              width: '100%',
              background: '#d4af6a',
              color: '#1a1305',
              border: 'none',
              borderRadius: 6,
              padding: '8px 0',
              fontWeight: 'bold',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ⬇ ダウンロード
          </button>
        </div>

        <div style={{ color: '#fff' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {card.type && <span style={badgeStyle('#7a5c1e')}>{card.type}</span>}
            {card.rarity && <span style={badgeStyle('#7ec8e3')}>{card.rarity}</span>}
            {card.card_type && <span style={badgeStyle('#a3a3a3')}>{card.card_type}</span>}
            {card.stage && <span style={badgeStyle('#9d7cf2')}>{card.stage}</span>}
          </div>
          <h3 style={{ margin: '0 0 10px' }}>{card.card_name}</h3>
          {card.attribute && <div>属性: {card.attribute}</div>}
          {card.hp && <div>HP: {card.hp}</div>}
          {card.baton_touch_cost !== null && <div>バトンタッチ: {card.baton_touch_cost}</div>}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <RatingRadar card={card} />
          </div>
          {card.rating_comment && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#c9d1e0', lineHeight: 1.5 }}>
              {card.rating_comment}
            </div>
          )}
        </div>
        <RelatedCards related={related} loading={loading} onSelect={onSelectCard} />
      </div>
    </div>
  )
}

function badgeStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#1a1305',
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 4,
    fontWeight: 'bold',
  }
}