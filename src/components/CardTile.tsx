import type { Card } from '../types/card'
import { getRarityConfig, renderRarityFrame } from '../utils/rarityFrame'

type Props = {
  card: Card
  onClick: (card: Card) => void
  isFav: boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (card: Card) => void
  compact?: boolean // 小さい表示サイズ・スマホの多列表示のとき、下部のテキスト情報を非表示にして余白も詰める
}

export function CardTile({ card, onClick, isFav, onToggleFav, selectionMode, selected, onToggleSelect, compact = false }: Props) {
  const badgeColor = getRarityConfig(card.rarity).badgeColor

  return (
    <div
      className={`hud-tile group${selected ? ' selected' : ''}`}
      onClick={() => (selectionMode ? onToggleSelect(card) : onClick(card))}
      // 下部の情報を隠すcompact表示のときは、タイル自体の余白も0にして画像を枠一杯に表示する
      style={{ width: '100%', ...(compact ? { padding: 0 } : null) }}
    >
      {selectionMode ? (
        <div
          style={{
            position: 'absolute',
            top: compact ? 4 : 10,
            left: compact ? 4 : 10,
            zIndex: 2,
            width: compact ? 18 : 24,
            height: compact ? 18 : 24,
            borderRadius: '50%',
            background: selected ? 'var(--hud-cyan)' : 'rgba(6,18,23,0.7)',
            border: selected ? 'none' : '1px solid var(--hud-line)',
            color: selected ? '#04232a' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: compact ? 11 : 14,
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
            top: compact ? 4 : 10,
            left: compact ? 4 : 10,
            zIndex: 2,
            background: 'rgba(6,18,23,0.7)',
            border: '1px solid var(--hud-line)',
            borderRadius: '50%',
            width: compact ? 20 : 28,
            height: compact ? 20 : 28,
            color: isFav ? 'var(--hud-cyan)' : '#fff',
            fontSize: compact ? 11 : 16,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {isFav ? '★' : '☆'}
        </button>
      )}

      <div style={{ padding: compact ? 0 : 6 }}>{card.image_url && renderRarityFrame(card.image_url, card.card_name, card.rarity)}</div>

      {!compact && (
        <div style={{ padding: '2px 8px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {card.rarity && (
              <span
                className="hud-mono"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  padding: '0 4px',
                  borderRadius: 3,
                  border: `1px solid ${badgeColor}`,
                  color: badgeColor,
                  flexShrink: 0,
                }}
              >
                {card.rarity}
              </span>
            )}
            {card.card_type && (
              <div
                className="hud-mono"
                style={{ fontSize: 10, color: 'var(--hud-ink-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {card.card_type}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}