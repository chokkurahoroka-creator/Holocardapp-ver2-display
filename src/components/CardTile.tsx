import type { Card } from '../types/card'
import { getRarityConfig, renderRarityFrame } from '../utils/rarityFrame'
import { isNewCard, NEW_CARD_DAYS } from '../utils/recentCards'

const NEW_RED = '#ff3b3b'

type Props = {
  card: Card
  onClick: (card: Card) => void
  isFav: boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (card: Card) => void
  compact?: boolean // 小さい表示サイズ・スマホの多列表示のとき、下部のテキスト情報（カード種類・お気に入りの★）を非表示にして余白も詰める
}

export function CardTile({ card, onClick, isFav, onToggleFav, selectionMode, selected, onToggleSelect, compact = false }: Props) {
  const badgeColor = getRarityConfig(card.rarity).badgeColor
  const isNew = isNewCard(card) // 登録から5日以内のカードは、赤枠と「NEW!」で目立たせる

  return (
    <div
      className={`hud-tile group${selected ? ' selected' : ''}`}
      onClick={() => (selectionMode ? onToggleSelect(card) : onClick(card))}
      // 下部の情報を隠すcompact表示のときは、タイル自体の余白も0にして画像を枠一杯に表示する
      style={{
        width: '100%',
        ...(compact ? { padding: 0 } : null),
        // 選択中は、これまでどおりの水色の枠を優先する
        ...(isNew && !selected ? { border: `2px solid ${NEW_RED}`, boxShadow: `0 0 10px rgba(255,59,59,0.65)` } : null),
      }}
    >
      {isNew && (
        <span
          title={`登録から${NEW_CARD_DAYS}日以内のカード`}
          className="hud-mono"
          style={{
            position: 'absolute',
            top: compact ? 3 : 8,
            right: compact ? 3 : 8,
            zIndex: 2,
            padding: compact ? '0 4px' : '1px 7px',
            borderRadius: 4,
            background: NEW_RED,
            color: '#fff',
            fontSize: compact ? 9 : 12,
            fontWeight: 800,
            lineHeight: compact ? '14px' : '18px',
            letterSpacing: '0.04em',
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
        >
          NEW!
        </span>
      )}
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
      ) : null}

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
            {/* お気に入りの★：カード種類の右（行の右端）。小さめ。カード種類と一緒に、compact のときは出さない。一括選択中は、出さない */}
            {!selectionMode && (
              <button
                type="button"
                title={isFav ? 'お気に入りを外す' : 'お気に入りに追加'}
                aria-label={isFav ? 'お気に入りを外す' : 'お気に入りに追加'}
                aria-pressed={isFav}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFav(card, e)
                }}
                style={{
                  marginLeft: 'auto',
                  flexShrink: 0,
                  background: 'transparent',
                  border: 'none',
                  color: isFav ? 'var(--hud-cyan)' : 'var(--hud-ink-dim)',
                  fontSize: 13,
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '2px 2px',
                  touchAction: 'manipulation',
                }}
              >
                {isFav ? '★' : '☆'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}