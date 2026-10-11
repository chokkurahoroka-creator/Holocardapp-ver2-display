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

type Props = { card: Card }

export function ArtsSkillsView({ card }: Props) {
  // PCは文字を太く・大きくして読みやすくする（スマホは従来サイズ）
  const isMobile = useIsMobile()
  // アーツ名・スキル名と本文は、読みやすいように大きく表示する
  const titleSize = isMobile ? 19 : 26
  const titleWeight = isMobile ? 700 : 800
  const bodySize = isMobile ? 14 : 17
  const bodyWeight = isMobile ? 400 : 600
  const damageSize = isMobile ? 20 : 28
  const tokkouSize = isMobile ? 12 : 15
  const badgeSize = isMobile ? 11 : 13
  const yellSize = isMobile ? 24 : 32 // アーツに必要なエール画像の大きさ
  const bannerHeight = isMobile ? 28 : 38 // スキル種別バナー画像の高さ
  const skills = ((card.skills_json ?? []) as SkillRow[]).filter((s) => s && (s.title || s.text))
  const arts = ((card.arts_json ?? []) as ArtRow[]).filter((a) => a && (a.name || a.effectText || a.damage))

  if (!skills.length && !arts.length) return null

  return (
    <div>
      {skills.length > 0 && (
        <div style={{ marginTop: 12 }}>
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
              {/* 1行: 左に種別バナー・ホロパワーコスト、残りの幅の中央にスキル名 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: s.text ? 6 : 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
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
                </div>
                {s.title && (
                  <div className="hud-font" style={{ flex: '1 1 0', minWidth: 120, textAlign: 'center', fontSize: titleSize, fontWeight: titleWeight, color: '#fff', lineHeight: 1.3 }}>
                    {s.title}
                  </div>
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
        </div>
      )}

      {arts.length > 0 && (
        <div style={{ marginTop: 12 }}>
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
              {/* 1行: 左に必要なエール、残りの幅の中央にアーツ名、右にダメージとその右に特攻 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {a.yellCost && a.yellCost.length > 0 && (
                  <div style={{ flex: '0 0 auto' }}>
                    <YellRow items={a.yellCost} size={yellSize} />
                  </div>
                )}
                {a.name ? (
                  <div className="hud-font" style={{ flex: '1 1 0', minWidth: 120, textAlign: 'center', fontSize: titleSize, fontWeight: titleWeight, color: '#fff', lineHeight: 1.3 }}>
                    {a.name}
                  </div>
                ) : (
                  <div style={{ flex: '1 1 0' }} />
                )}
                {(a.damage || a.specialAttackColor) && (
                  <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                    {a.damage && (
                      <span className="hud-mono" style={{ fontSize: damageSize, fontWeight: 800, color: '#ffb27a' }}>
                        {a.damage}
                      </span>
                    )}
                    {a.specialAttackColor && (
                      <span className="hud-mono" style={{ fontSize: tokkouSize, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--hud-ink-dim)', whiteSpace: 'nowrap' }}>
                        特攻
                        <span
                          style={{
                            width: tokkouSize - 2,
                            height: tokkouSize - 2,
                            borderRadius: '50%',
                            background: YELL_COLOR_MAP[a.specialAttackColor] ?? '#9aa5a8',
                            display: 'inline-block',
                            border: '1px solid rgba(255,255,255,0.35)',
                          }}
                        />
                        {a.specialAttackColor}
                        {a.specialAttackDamage && <span style={{ color: '#ffb27a', fontWeight: 800 }}>{a.specialAttackDamage}</span>}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {a.effectText && (
                <div style={{ fontSize: bodySize, fontWeight: bodyWeight, lineHeight: 1.75, color: 'var(--hud-ink)', marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  <HighlightNumbers text={a.effectText} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}