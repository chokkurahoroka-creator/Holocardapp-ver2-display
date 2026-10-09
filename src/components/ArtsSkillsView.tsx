import type { CSSProperties } from 'react'
import type { Card } from '../types/card'
import { useIsMobile } from '../hooks/useGridLayout'
import { SkillBanner, YellRow, hasSkillBanner } from './YellIcon'

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

// 効果テキスト中の数字（半角・全角、先頭の+/-付き）を強調表示する
const NUMBER_PATTERN = /([+＋\-－]?[0-9０-９]+)/g

function HighlightNumbers({ text, color = '#ffd76a', glow = false }: { text: string; color?: string; glow?: boolean }) {
  // split() の結果は「通常テキスト, 数字, 通常テキスト, 数字, ...」の順になるので、奇数番目が数字
  const parts = text.split(NUMBER_PATTERN)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className="hud-mono"
            style={{
              color,
              fontWeight: 800,
              fontSize: '1.1em',
              textShadow: glow ? '0 0 6px rgba(255,200,61,0.8)' : undefined,
            }}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

// エクストラ（固有スキル）は金色の枠で表示する
const EXTRA_SKILL_TYPE = 'エクストラ'
const GOLD = '#ffc83d'

const blockBase: CSSProperties = {
  borderRadius: 8,
  padding: '10px 12px', // PCでは下でさらに広げる
  marginBottom: 8,
}

const sectionTitleStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--hud-cyan)',
  margin: '16px 0 8px',
}

type Props = { card: Card }

export function ArtsSkillsView({ card }: Props) {
  // PCは文字を太く・大きくして読みやすくする（スマホは従来サイズ）
  const isMobile = useIsMobile()
  const titleSize = isMobile ? 15 : 18
  const titleWeight = isMobile ? 700 : 800
  const bodySize = isMobile ? 13 : 15
  const bodyWeight = isMobile ? 400 : 600
  const damageSize = isMobile ? 16 : 22
  const sectionLabelSize = isMobile ? 13 : 15
  const badgeSize = isMobile ? 10 : 12
  const yellSize = isMobile ? 24 : 30 // アーツに必要なエール画像の大きさ
  const bannerHeight = isMobile ? 28 : 38 // スキル種別バナー画像の高さ
  const skills = ((card.skills_json ?? []) as SkillRow[]).filter((s) => s && (s.title || s.text))
  const arts = ((card.arts_json ?? []) as ArtRow[]).filter((a) => a && (a.name || a.effectText || a.damage))

  if (!skills.length && !arts.length) return null

  return (
    <div>
      {skills.length > 0 && (
        <>
          <div className="hud-mono" style={sectionTitleStyle}>
            SKILLS<span className="hud-font" style={{ marginLeft: 8, color: 'var(--hud-ink-dim)', fontSize: sectionLabelSize, fontWeight: isMobile ? 400 : 700 }}>固有スキル</span>
          </div>
          {skills.map((s, i) => {
            const isExtra = s.skillType === EXTRA_SKILL_TYPE
            const accent = isExtra ? GOLD : '#64b5f6'
            return (
            <div
              key={i}
              style={{
                ...blockBase,
                padding: isMobile ? blockBase.padding : '12px 16px',
                background: isExtra ? 'rgba(255,200,61,0.10)' : 'rgba(100,181,246,0.07)',
                border: isExtra ? '1px solid rgba(255,200,61,0.6)' : '1px solid rgba(100,181,246,0.3)',
                borderLeft: `4px solid ${accent}`,
                boxShadow: isExtra ? '0 0 10px rgba(255,200,61,0.25)' : undefined,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: s.text ? 4 : 0 }}>
                {/* ギフト・コラボエフェクト・ブルームエフェクトはバナー画像、それ以外（エクストラなど）は文字バッジ */}
                {hasSkillBanner(s.skillType) && <SkillBanner skillType={s.skillType!} height={bannerHeight} />}
                {s.skillType && s.skillType !== 'ー' && !hasSkillBanner(s.skillType) && (
                  <span
                    className="hud-mono"
                    style={{ fontSize: badgeSize, fontWeight: isMobile ? 400 : 700, color: accent, border: `1px solid ${isExtra ? 'rgba(255,200,61,0.7)' : 'rgba(100,181,246,0.6)'}`, borderRadius: 4, padding: '1px 6px' }}
                  >
                    {s.skillType}
                  </span>
                )}
                {s.powerCost && (
                  <span
                    className="hud-mono"
                    title="ホロパワーコスト"
                    style={{ fontSize: badgeSize, fontWeight: isMobile ? 400 : 700, color: '#ffd76a', border: '1px solid rgba(255,215,106,0.6)', borderRadius: 4, padding: '1px 6px' }}
                  >
                    ホロパワー -{s.powerCost}
                  </span>
                )}
                {s.title && (
                  <span className="hud-font" style={{ fontSize: titleSize, fontWeight: titleWeight, color: '#fff' }}>
                    {s.title}
                  </span>
                )}
              </div>
              {s.text && (
                <div style={{ fontSize: bodySize, fontWeight: bodyWeight, lineHeight: 1.75, color: 'var(--hud-ink)', whiteSpace: 'pre-wrap' }}>
                  <HighlightNumbers text={s.text} color={isExtra ? '#fff' : '#ffd76a'} glow={isExtra} />
                </div>
              )}
            </div>
            )
          })}
        </>
      )}

      {arts.length > 0 && (
        <>
          <div className="hud-mono" style={sectionTitleStyle}>
            ARTS<span className="hud-font" style={{ marginLeft: 8, color: 'var(--hud-ink-dim)', fontSize: sectionLabelSize, fontWeight: isMobile ? 400 : 700 }}>アーツ</span>
          </div>
          {arts.map((a, i) => (
            <div
              key={i}
              style={{
                ...blockBase,
                padding: isMobile ? blockBase.padding : '12px 16px',
                background: 'rgba(232,140,77,0.07)',
                border: '1px solid rgba(232,140,77,0.3)',
                borderLeft: '4px solid #e88c4d',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {a.yellCost && a.yellCost.length > 0 && <YellRow items={a.yellCost} size={yellSize} />}
                {a.name && (
                  <span className="hud-font" style={{ fontSize: titleSize, fontWeight: titleWeight, color: '#fff' }}>
                    {a.name}
                  </span>
                )}
                {a.damage && (
                  <span className="hud-mono" style={{ marginLeft: 'auto', fontSize: damageSize, fontWeight: 800, color: '#ffb27a' }}>
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
                <div style={{ fontSize: bodySize, fontWeight: bodyWeight, lineHeight: 1.75, color: 'var(--hud-ink)', marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  <HighlightNumbers text={a.effectText} />
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}