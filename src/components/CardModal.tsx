import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, TouchEvent } from 'react'
import type { Card } from '../types/card'
import { RelatedCards } from './RelatedCards'
import { useRelatedCards } from '../hooks/useRelatedCards'
import { RatingRadar } from './RatingRadar'
import { ArtsSkillsView } from './ArtsSkillsView'
import { downloadCardImage } from '../lib/download'
import { logEvent } from '../lib/logEvent'
import { useIsMobile } from '../hooks/useGridLayout'
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

// スワイプ判定: 横に50px以上、かつ縦移動の1.5倍以上動いたときだけ前後のカードへ遷移する
const SWIPE_MIN_DISTANCE = 50
const SWIPE_DIRECTION_RATIO = 1.5

// タグ文字列から個々のタグを取り出す（空白・カンマ・読点・中黒区切り。絞り込みフィルターと同じ）
function splitTags(tags: string | null | undefined): string[] {
  return (tags ?? '')
    .split(/[\s,、・]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

export function CardModal({ card, onClose, onPrev, onNext, hasNav, onSelectCard }: Props) {
  const { related, loading } = useRelatedCards(card)
  const isMobile = useIsMobile()

  // 画像の全画面表示。カードを切り替えたときは閉じる
  const [zoomed, setZoomed] = useState(false)
  const cardId = card?.id
  useEffect(() => {
    setZoomed(false)
  }, [cardId])
  useEffect(() => {
    if (!zoomed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed])

  // スワイプで前後のカードへ遷移
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const handleTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null
  }
  const handleTouchEnd = (e: TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    const t = e.changedTouches[0]
    if (!start || !t || !hasNav) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return
    if (dx > 0) onPrev()
    else onNext()
  }

  if (!card) return null

  const handleDownload = async () => {
    await downloadCardImage(card)
    logEvent('download', { set_code: card.set_code, type: card.type, slot: card.slot, card_name: card.card_name })
  }

  const rarityColor = getRarityConfig(card.rarity).badgeColor

  const tags = splitTags(card.tags)

  return (
    <>
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          width: 'min(96vw, 1280px)',
          maxHeight: '96vh',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--hud-ink)',
        }}
      >
        <button
          onClick={onClose}
          className="btn-icon"
          style={{
            position: 'absolute',
            top: isMobile ? 4 : 6,
            right: isMobile ? 6 : 14,
            fontSize: isMobile ? 28 : 22,
            zIndex: 11,
            ...(isMobile ? { width: 44, height: 44, lineHeight: 1 } : null),
          }}
          aria-label="閉じる"
        >
          ×
        </button>

        {hasNav && !isMobile && (
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
        <div style={{ overflowY: 'auto', padding: 'clamp(16px, 6vw, 32px) clamp(16px, 10vw, 64px) 28px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            {/* スマホでは画像を画面幅いっぱいに合わせて中央配置し、ダウンロードボタンは出さない */}
            <div
              style={{
                flexShrink: 0,
                width: isMobile ? '100%' : 'clamp(260px, 38vw, 440px)',
                maxWidth: '100%',
                margin: isMobile ? '0 auto' : undefined,
              }}
              className="group"
            >
              {card.image_url && (
                <div
                  onClick={() => setZoomed(true)}
                  role="button"
                  aria-label="画像を全画面で表示"
                  style={{ position: 'relative', cursor: 'zoom-in' }}
                >
                  {renderRarityFrame(card.image_url, card.card_name, card.rarity)}
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: 8,
                      bottom: 8,
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'rgba(6,18,23,0.7)',
                      border: '1px solid var(--hud-line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      pointerEvents: 'none',
                    }}
                  >
                    🔍
                  </span>
                </div>
              )}
              {!isMobile && (
                <button onClick={handleDownload} className="btn-primary" style={{ marginTop: 10, width: '100%' }}>
                  ⬇ ダウンロード
                </button>
              )}
            </div>

            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {card.type && <span style={badgeStyle('#ffd76a')}>{card.type}</span>}
                {card.rarity && <span style={badgeStyle(rarityColor)}>{card.rarity}</span>}
                {card.card_type && <span style={badgeStyle('#9fc3ca')}>{card.card_type}</span>}
                {card.stage && <span style={badgeStyle('#b28ce3')}>{card.stage}</span>}
              </div>
              {/* カード名の右横に属性・HP。狭い画面では折り返して下に回る */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 16, rowGap: 4, marginBottom: 8 }}>
                <h3 className="hud-font" style={{ margin: 0, fontSize: 'clamp(18px, 2.2vw, 24px)', color: '#fff' }}>
                  {card.card_name}
                </h3>
                {(card.attribute || card.hp) && (
                  <div className="hud-mono" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14, fontSize: 14, color: 'var(--hud-ink-dim)' }}>
                    {card.attribute && <div>属性: <span style={{ color: 'var(--hud-ink)' }}>{card.attribute}</span></div>}
                    {card.hp && <div>HP: <span style={{ color: 'var(--hud-ink)' }}>{card.hp}</span></div>}
                  </div>
                )}
              </div>

              {/* タグ */}
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                  {tags.map((tag) => (
                    <span key={tag} className="hud-mono" style={tagStyle}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <ArtsSkillsView card={card} />

              {/* バトンタッチはアーツの下 */}
              {card.baton_touch_cost !== null && card.baton_touch_cost !== undefined && (
                <div className="hud-mono" style={{ marginTop: 4, fontSize: 14, lineHeight: 1.8, color: 'var(--hud-ink-dim)' }}>
                  バトンタッチ: <span style={{ color: 'var(--hud-ink)' }}>{card.baton_touch_cost}</span>
                </div>
              )}

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

        {/* スマホ: 親指で押しやすい大きな前後ボタンを下部に固定（スワイプでも移動できる） */}
        {hasNav && isMobile && (
          <div style={{ display: 'flex', gap: 8, padding: 8, borderTop: '1px solid var(--hud-line)', flexShrink: 0 }}>
            <button onClick={onPrev} style={mobileNavButtonStyle} aria-label="前のカード">
              <span style={{ fontSize: 28, lineHeight: 1 }}>‹</span> 前へ
            </button>
            <button onClick={onNext} style={mobileNavButtonStyle} aria-label="次のカード">
              次へ <span style={{ fontSize: 28, lineHeight: 1 }}>›</span>
            </button>
          </div>
        )}
      </div>
    </div>

    {/* 画像の全画面表示（クリック/タップ、Escで閉じる） */}
    {zoomed && card.image_url && (
      <div
        onClick={() => setZoomed(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'rgba(0,0,0,0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          cursor: 'zoom-out',
        }}
      >
        <img
          src={card.image_url}
          alt={card.card_name}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
        />
        <button
          onClick={() => setZoomed(false)}
          aria-label="全画面表示を閉じる"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(6,18,23,0.8)',
            border: '1px solid var(--hud-line)',
            color: '#fff',
            fontSize: 24,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
    )}
    </>
  )
}

const tagStyle: CSSProperties = {
  color: 'var(--hud-cyan)',
  border: '1px solid var(--hud-line)',
  background: 'rgba(0,229,255,0.06)',
  fontSize: 12,
  padding: '2px 8px',
  borderRadius: 999,
}

const mobileNavButtonStyle: CSSProperties = {
  flex: 1,
  height: 52,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--hud-ink)',
  background: 'rgba(0,229,255,0.12)',
  border: '1px solid var(--hud-cyan)',
  borderRadius: 10,
  cursor: 'pointer',
  touchAction: 'manipulation',
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