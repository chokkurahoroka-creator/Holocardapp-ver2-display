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
  compact?: boolean // 小さい表示サイズ・スマホの多列表示のとき、下部のテキスト情報を非表示にして余白も詰める
  hideFav?: boolean // カードが小さいとき、お気に入りの★ボタンを非表示にする（一括選択モードのチェックは常に表示）
}

export function CardTile({ card, onClick, isFav, onToggleFav, selectionMode, selected, onToggleSelect, compact = false, hideFav = false }: Props) {
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
      ) : hideFav ? null : (
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