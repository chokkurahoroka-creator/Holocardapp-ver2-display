import type { CSSProperties } from 'react'
import type { Card } from '../types/card'
import { RelatedCards } from './RelatedCards'
import { useRelatedCards } from '../hooks/useRelatedCards'
import { RatingRadar } from './RatingRadar'
import { ArtsSkillsView } from './ArtsSkillsView'
import { downloadCardImage } from '../lib/download'
import { logEvent } from '../lib/logEvent'
import { getRarityConfig, renderRarityFrame } from '../utils/rarityFrame'

type Props = {
  card: Card | null
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  hasNav: boolean
  onSelectCard: (card: Card) => void
}

const navButtonStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: 26,
  lineHeight: 1,
  background: 'rgba(6,18,23,0.75)',
  border: '1px solid var(--hud-line)',
  color: 'var(--hud-ink)',
  cursor: 'pointer',
  borderRadius: '50%',
  width: 40,
  height: 40,
  zIndex: 10,
  padding: 0,
}

export function CardModal({ card, onClose, onPrev, onNext, hasNav, onSelectCard }: Props) {
  const { related, loading } = useRelatedCards(card)
  if (!card) return null

  const handleDownload = async () => {
    await downloadCardImage(card)
    logEvent('download', { set_code: card.set_code, type: card.type, slot: card.slot, card_name: card.card_name })
  }

  const rarityColor = getRarityConfig(card.rarity).badgeColor

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
        // 狭い画面では外側の余白を減らし、カード内容に使える幅を広くする
        padding: 'clamp(4px, 2vw, 16px)',
      }}
    >
      {/* 外枠：角カットのHUDパネル（ここはスクロールさせない） */}
      <div
        className="hud-panel"
        style={{
          width: 'min(96vw, 1000px)',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--hud-ink)',
        }}
      >
        <button
          onClick={onClose}
          className="btn-icon"
          style={{ position: 'absolute', top: 6, right: 14, fontSize: 22, zIndex: 11 }}
          aria-label="閉じる"
        >
          ×
        </button>

        {hasNav && (
          <>
            <button onClick={onPrev} style={{ ...navButtonStyle, left: 8 }} aria-label="前のカード">
              ‹
            </button>
            <button onClick={onNext} style={{ ...navButtonStyle, right: 8 }} aria-label="次のカード">
              ›
            </button>
          </>
        )}

        {/* 中身：実際にスクロールする領域。左右の余白はclamp()でビューポート幅に応じて縮める
            （固定56pxのままだと狭いスマホ画面でコンテンツ幅を圧迫しすぎるため） */}
        <div style={{ overflowY: 'auto', padding: 'clamp(16px, 6vw, 28px) clamp(16px, 10vw, 56px) 24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ flexShrink: 0, width: 240, maxWidth: '100%' }} className="group">
              {card.image_url && renderRarityFrame(card.image_url, card.card_name, card.rarity)}
              <button onClick={handleDownload} className="btn-primary" style={{ marginTop: 10, width: '100%' }}>
                ⬇ ダウンロード
              </button>
            </div>

            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {card.type && <span style={badgeStyle('#ffd76a')}>{card.type}</span>}
                {card.rarity && <span style={badgeStyle(rarityColor)}>{card.rarity}</span>}
                {card.card_type && <span style={badgeStyle('#9fc3ca')}>{card.card_type}</span>}
                {card.stage && <span style={badgeStyle('#b28ce3')}>{card.stage}</span>}
              </div>
              <h3 className="hud-font" style={{ margin: '0 0 10px', fontSize: 20, color: '#fff' }}>
                {card.card_name}
              </h3>
              <div className="hud-mono" style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--hud-ink-dim)' }}>
                {card.attribute && <div>属性: <span style={{ color: 'var(--hud-ink)' }}>{card.attribute}</span></div>}
                {card.hp && <div>HP: <span style={{ color: 'var(--hud-ink)' }}>{card.hp}</span></div>}
                {card.baton_touch_cost !== null && (
                  <div>バトンタッチ: <span style={{ color: 'var(--hud-ink)' }}>{card.baton_touch_cost}</span></div>
                )}
              </div>

              <ArtsSkillsView card={card} />

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <RatingRadar card={card} />
              </div>
              {card.rating_comment && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--hud-ink)', lineHeight: 1.6 }}>{card.rating_comment}</div>
              )}
            </div>
          </div>

          <RelatedCards related={related} loading={loading} onSelect={onSelectCard} />
        </div>
      </div>
    </div>
  )
}

function badgeStyle(color: string): CSSProperties {
  return {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    color,
    border: `1px solid ${color}`,
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
  }
}