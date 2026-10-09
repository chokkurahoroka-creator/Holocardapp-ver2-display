import type { CSSProperties } from 'react'
import './rarityEffects.css'

// レア度ごとの枠演出（管理画面のカード一覧と同じ設定）
const SWEEP_ANGLE = -22 // 全レア度共通の斜線の角度（deg）

// 光の斜線が左端の外から現れて右端の外へ抜けるまでの1周期（秒）。休止時間を含む。
// カードにマウスを乗せている間だけ繰り返し流れる（rarityEffects.css）
const SWEEP_DURATION_SEC = 2.4
const SWEEP_DURATION_SEC_FAST = 2.2 // SECは少し速く
const SWEEP_SECOND_STREAK_OFFSET_MS = 300 // 二重線のとき、2本目を遅らせる時間

type SweepIntensity = 'strong' | 'medium' | 'soft'
type RarityConfig = {
  border?: string // グラデーション文字列 or 単色hex
  borderAnimated?: boolean // 枠のホロ色が流れるか
  pulseColor?: string
  pulseColorStrong?: string
  sweep?: SweepIntensity // 白系の光の筋。強さだけで差をつける
  sweepDouble?: boolean // 二重線（最上位のみ）
  staticGlow?: string
  badgeColor: string
}

const RARITY_CONFIG: Record<string, RarityConfig> = {
  SEC: {
    border: 'linear-gradient(120deg, #ffd76a, #ff8a5c, #4ce0e6, #b28ce3, #ffd76a)',
    borderAnimated: true,
    pulseColor: 'rgba(255,215,106,0.4)',
    pulseColorStrong: 'rgba(255,215,106,0.85)',
    sweep: 'strong',
    sweepDouble: true,
    badgeColor: '#ffd76a',
  },
  OUR: {
    border: 'linear-gradient(135deg, #ff6ec7, #b28ce3)',
    pulseColor: 'rgba(255,110,199,0.35)',
    pulseColorStrong: 'rgba(255,110,199,0.8)',
    sweep: 'strong',
    badgeColor: '#ff6ec7',
  },
  HR: {
    border: 'linear-gradient(135deg, #3ddc97, #4ce0e6)',
    pulseColor: 'rgba(61,220,151,0.35)',
    pulseColorStrong: 'rgba(61,220,151,0.8)',
    sweep: 'strong',
    badgeColor: '#3ddc97',
  },
  UR: {
    border: '#ffd76a',
    pulseColor: 'rgba(255,215,106,0.3)',
    pulseColorStrong: 'rgba(255,215,106,0.7)',
    sweep: 'medium',
    badgeColor: '#ffd76a',
  },
  SY: {
    border: '#7c9bff',
    pulseColor: 'rgba(124,155,255,0.3)',
    pulseColorStrong: 'rgba(124,155,255,0.7)',
    sweep: 'medium',
    badgeColor: '#7c9bff',
  },
  OSR: {
    border: '#ff8a8a',
    pulseColor: 'rgba(255,138,138,0.3)',
    pulseColorStrong: 'rgba(255,138,138,0.7)',
    sweep: 'medium',
    badgeColor: '#ff8a8a',
  },
  SR: {
    border: '#4ce0e6',
    pulseColor: 'rgba(76,224,230,0.3)',
    pulseColorStrong: 'rgba(76,224,230,0.7)',
    sweep: 'medium',
    badgeColor: '#4ce0e6',
  },
  S: { sweep: 'soft', badgeColor: '#9fc3ca' }, // 白い光の斜線が左から右へ流れる
  RR: { sweep: 'soft', badgeColor: '#9fc3ca' },
  R: { staticGlow: 'rgba(255,255,255,0.4)', badgeColor: '#9fc3ca' },
  U: { badgeColor: '#9fc3ca' },
  C: { badgeColor: '#9fc3ca' },
}

// width: 斜線の幅（カード幅に対する割合）。opacity: 斜線中心の白の濃さ。
// 動いて一瞬で通り過ぎるため、固定表示だった頃より少し濃くしている
const SWEEP_STYLE: Record<SweepIntensity, { width: number; opacity: number }> = {
  strong: { width: 0.16, opacity: 0.4 },
  medium: { width: 0.13, opacity: 0.3 },
  soft: { width: 0.12, opacity: 0.24 },
}

export function getRarityConfig(rarity: string | null | undefined): RarityConfig {
  return RARITY_CONFIG[(rarity || '').toUpperCase()] ?? { badgeColor: '#9fc3ca' }
}

// 光の斜線は、ホバー中だけ、左端の外から現れて右端の外へ抜けるまでを繰り返す（rarityEffects.css）。
// 親要素に "group" クラスがあれば、その要素全体へのホバーで流れる（カードタイル・モーダルの画像）
export function renderRarityFrame(imageUrl: string, cardName: string, rarity: string | null | undefined) {
  const config = getRarityConfig(rarity)
  const rarityName = (rarity || '')
  const frameStyle: CSSProperties = { borderRadius: '0.5rem' }
  const animations: string[] = []

  if (config.border) {
    if (config.border.includes('gradient')) {
      frameStyle.background = config.border
      frameStyle.backgroundSize = config.borderAnimated ? '300% 300%' : '100% 100%'
      frameStyle.padding = '2px'
      if (config.borderAnimated) animations.push('hud-holo-shift 3s linear infinite')
    } else {
      frameStyle.border = `2px solid ${config.border}`
    }
  } else if (!config.sweep && !config.staticGlow) {
    frameStyle.border = '1px solid var(--hud-line)'
  }

  if (config.pulseColor) {
    animations.push('hud-glow-pulse-color 2.4s ease-in-out infinite')
    ;(frameStyle as Record<string, string>)['--pulse-color'] = config.pulseColor
    ;(frameStyle as Record<string, string>)['--pulse-color-strong'] = config.pulseColorStrong ?? config.pulseColor
  }
  if (config.staticGlow) {
    frameStyle.boxShadow = `0 0 10px ${config.staticGlow}`
  }
  if (animations.length) frameStyle.animation = animations.join(', ')

  return (
    <div className="rarity-frame" style={frameStyle}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '0.4rem' }}>
        <img
          src={imageUrl}
          alt={cardName}
          loading="lazy"
          style={{ display: 'block', width: '100%', aspectRatio: '5/7', objectFit: 'cover' }}
        />
        {config.sweep &&
          (() => {
            const s = SWEEP_STYLE[config.sweep!]
            const duration = rarityName.toUpperCase() === 'SEC' ? SWEEP_DURATION_SEC_FAST : SWEEP_DURATION_SEC
            // 斜線の中心がカード左端の外(-0.5W)から右端の外(1.5W)まで動くように、移動量を自身の幅に対する%で求める
            // （translateXの%は要素自身の幅が基準）。斜めに傾いた帯の端まで完全に外に出る余裕を見ている
            const startPct = Math.round(((-0.5 - s.width / 2) / s.width) * 100)
            const endPct = Math.round(((1.5 - s.width / 2) / s.width) * 100)
            const streak = (delayMs: number, key: number) => (
              <span
                key={key}
                className="rarity-sweep"
                style={
                  {
                    position: 'absolute',
                    pointerEvents: 'none',
                    top: '-30%',
                    left: 0,
                    width: `${s.width * 100}%`,
                    height: '160%',
                    background: `linear-gradient(100deg, transparent, rgba(255,255,255,${s.opacity}), transparent)`,
                    transform: `translateX(${startPct}%) rotate(${SWEEP_ANGLE}deg)`,
                    opacity: 0,
                    animationDuration: `${duration}s`,
                    animationDelay: `${delayMs}ms`,
                    '--sweep-start': `${startPct}%`,
                    '--sweep-end': `${endPct}%`,
                    '--sweep-angle': `${SWEEP_ANGLE}deg`,
                  } as CSSProperties
                }
              />
            )
            return config.sweepDouble ? (
              <>
                {streak(0, 0)}
                {streak(SWEEP_SECOND_STREAK_OFFSET_MS, 1)}
              </>
            ) : (
              streak(0, 0)
            )
          })()}
      </div>
    </div>
  )
}