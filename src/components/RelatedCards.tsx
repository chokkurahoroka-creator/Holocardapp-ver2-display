import type { Card } from '../types/card'

type RelatedCard = { card: Card; label: string }

type Props = {
  related: RelatedCard[]
  loading: boolean
  onSelect: (card: Card) => void
}

export function RelatedCards({ related, loading, onSelect }: Props) {
  if (!related.length && !loading) return null

  return (
    <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--hud-line)' }}>
      <div className="hud-mono" style={{ fontSize: 12, color: 'var(--hud-cyan)', marginBottom: 8 }}>
        RELATED{loading ? ' … LOADING' : ''}
        <span className="hud-font" style={{ marginLeft: 8, color: 'var(--hud-ink-dim)', fontSize: 13 }}>
          関連カード
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {related.map((r) => (
          <div
            key={`${r.card.set_code}__${r.card.type}__${r.card.slot}`}
            onClick={() => onSelect(r.card)}
            style={{ cursor: 'pointer', textAlign: 'center', width: 90 }}
          >
            <img
              src={r.card.image_url ?? ''}
              style={{
                width: 90,
                aspectRatio: '5/7',
                objectFit: 'cover',
                borderRadius: 6,
                border: '1px solid var(--hud-line)',
              }}
            />
            <div className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-cyan)', marginTop: 4 }}>
              {r.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}