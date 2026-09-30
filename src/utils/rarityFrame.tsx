import type { CSSProperties } from 'react'

// レア度ごとの枠演出（管理画面のカード一覧と同じ設定）
const SWEEP_ANGLE = -22 // 全レア度共通の角度（deg）。hud.css の hud-shine-sweep-hover とも揃える

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
  S: { sweep: 'soft', badgeColor: '#9fc3ca' },
  RR: { sweep: 'soft', badgeColor: '#9fc3ca' },
  R: { staticGlow: 'rgba(255,255,255,0.4)', badgeColor: '#9fc3ca' },
  U: { badgeColor: '#9fc3ca' },
  C: { badgeColor: '#9fc3ca' },
}

const SWEEP_STYLE: Record<SweepIntensity, { width: string; opacity: number }> = {
  strong: { width: '16%', opacity: 0.32 },
  medium: { width: '13%', opacity: 0.22 },
  soft: { width: '10%', opacity: 0.14 },
}

export function getRarityConfig(rarity: string | null | undefined): RarityConfig {
  return RARITY_CONFIG[(rarity || '').toUpperCase()] ?? { badgeColor: '#9fc3ca' }
}

// 親要素に "group" クラスがあると、ホバー中に光の筋が流れる（hud.css 側で制御）
export function renderRarityFrame(imageUrl: string, cardName: string, rarity: string | null | undefined) {
  const config = getRarityConfig(rarity)
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
    <div style={frameStyle}>
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
            const streak = (leftPct: number, key: number) => (
              <span
                key={key}
                className="hud-sweep"
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  top: '-60%',
                  left: `${leftPct}%`,
                  width: s.width,
                  height: '220%',
                  background: `linear-gradient(100deg, transparent, rgba(255,255,255,${s.opacity}), transparent)`,
                  transform: `rotate(${SWEEP_ANGLE}deg)`,
                }}
              />
            )
            return config.sweepDouble ? (
              <>
                {streak(22, 0)}
                {streak(52, 1)}
              </>
            ) : (
              streak(35, 0)
            )
          })()}
      </div>
    </div>
  )
}