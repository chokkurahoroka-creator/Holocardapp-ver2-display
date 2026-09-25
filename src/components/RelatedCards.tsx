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
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(212,175,106,0.2)' }}>
      <div style={{ fontSize: 13, color: '#9aa5c0', marginBottom: 8 }}>
        関連カード{loading ? '（読み込み中...）' : ''}
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
                border: '1px solid rgba(212,175,106,0.3)',
              }}
            />
            <div style={{ fontSize: 11, color: '#d4af6a', marginTop: 4 }}>{r.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}