import type { CSSProperties } from 'react'
import type { Card } from '../types/card'

type YellCost = { color: string; count: number }
type ArtRow = {
  name?: string
  damage?: string
  yellCost?: YellCost[]
  specialAttackColor?: string
  specialAttackDamage?: string
  effectText?: string
}
type SkillRow = { skillType?: string; title?: string; text?: string; powerCost?: string }

// エール色 → 表示色
const YELL_COLOR_MAP: Record<string, string> = {
  白: '#f2f2f2',
  赤: '#ff5a5a',
  青: '#4da3ff',
  緑: '#4cd68a',
  紫: '#b28ce3',
  黄: '#ffd76a',
  無色: '#9aa5a8',
}

function YellDots({ cost }: { cost: YellCost[] }) {
  const dots: { color: string; key: string }[] = []
  cost.forEach((y, yi) => {
    const n = Math.max(0, Math.min(10, Number(y.count) || 0))
    for (let i = 0; i < n; i++) dots.push({ color: y.color, key: `${yi}-${i}` })
  })
  if (!dots.length) return null
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }} aria-label="エールコスト">
      {dots.map((d) => (
        <span
          key={d.key}
          title={d.color}
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: YELL_COLOR_MAP[d.color] ?? '#9aa5a8',
            border: '1px solid rgba(255,255,255,0.35)',
            display: 'inline-block',
          }}
        />
      ))}
    </span>
  )
}

const blockBase: CSSProperties = {
  borderRadius: 8,
  padding: '10px 12px',
  marginBottom: 8,
}

const sectionTitleStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--hud-cyan)',
  margin: '16px 0 8px',
}

type Props = { card: Card }

export function ArtsSkillsView({ card }: Props) {
  const skills = ((card.skills_json ?? []) as SkillRow[]).filter((s) => s && (s.title || s.text))
  const arts = ((card.arts_json ?? []) as ArtRow[]).filter((a) => a && (a.name || a.effectText || a.damage))

  if (!skills.length && !arts.length) return null

  return (
    <div>
      {skills.length > 0 && (
        <>
          <div className="hud-mono" style={sectionTitleStyle}>
            SKILLS<span className="hud-font" style={{ marginLeft: 8, color: 'var(--hud-ink-dim)', fontSize: 13 }}>固有スキル</span>
          </div>
          {skills.map((s, i) => (
            <div
              key={i}
              style={{
                ...blockBase,
                background: 'rgba(100,181,246,0.07)',
                border: '1px solid rgba(100,181,246,0.3)',
                borderLeft: '4px solid #64b5f6',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: s.text ? 4 : 0 }}>
                {s.skillType && s.skillType !== 'ー' && (
                  <span
                    className="hud-mono"
                    style={{ fontSize: 10, color: '#64b5f6', border: '1px solid rgba(100,181,246,0.6)', borderRadius: 4, padding: '1px 6px' }}
                  >
                    {s.skillType}
                  </span>
                )}
                {s.powerCost && (
                  <span
                    className="hud-mono"
                    title="ホロパワーコスト"
                    style={{ fontSize: 10, color: '#ffd76a', border: '1px solid rgba(255,215,106,0.6)', borderRadius: 4, padding: '1px 6px' }}
                  >
                    ホロパワー -{s.powerCost}
                  </span>
                )}
                {s.title && (
                  <span className="hud-font" style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                    {s.title}
                  </span>
                )}
              </div>
              {s.text && <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--hud-ink)', whiteSpace: 'pre-wrap' }}>{s.text}</div>}
            </div>
          ))}
        </>
      )}

      {arts.length > 0 && (
        <>
          <div className="hud-mono" style={sectionTitleStyle}>
            ARTS<span className="hud-font" style={{ marginLeft: 8, color: 'var(--hud-ink-dim)', fontSize: 13 }}>アーツ</span>
          </div>
          {arts.map((a, i) => (
            <div
              key={i}
              style={{
                ...blockBase,
                background: 'rgba(232,140,77,0.07)',
                border: '1px solid rgba(232,140,77,0.3)',
                borderLeft: '4px solid #e88c4d',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {a.yellCost && a.yellCost.length > 0 && <YellDots cost={a.yellCost} />}
                {a.name && (
                  <span className="hud-font" style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                    {a.name}
                  </span>
                )}
                {a.damage && (
                  <span className="hud-mono" style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: '#ffb27a' }}>
                    {a.damage}
                  </span>
                )}
              </div>

              {a.specialAttackColor && (
                <div className="hud-mono" style={{ fontSize: 11, marginTop: 4, color: 'var(--hud-ink-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  特攻:
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: YELL_COLOR_MAP[a.specialAttackColor] ?? '#9aa5a8',
                      display: 'inline-block',
                      border: '1px solid rgba(255,255,255,0.35)',
                    }}
                  />
                  {a.specialAttackColor}
                  {a.specialAttackDamage && <span style={{ color: '#ffb27a', fontWeight: 700 }}>{a.specialAttackDamage}</span>}
                </div>
              )}

              {a.effectText && (
                <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--hud-ink)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.effectText}</div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}