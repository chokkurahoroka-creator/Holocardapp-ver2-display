// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCardDetailForPreview } from '../hooks/useCardDetailForPreview'
import { YELL_COLOR_HEX } from '../types/artsSkills'
import type { DeckCard } from '../utils/deckImage'

// カードの固有スキルとアーツを、コンパクトに並べる（スマホの操作バーなど、狭い場所用）
export function CardEffects({ card }: { card: DeckCard }) {
  const { detail, loading, error } = useCardDetailForPreview(card.id)
  const skills = detail?.skills.filter((s) => s.title || s.text) ?? []
  const arts = detail?.arts.filter((a) => a.name || a.effectText || a.damage) ?? []

  if (loading) return <p className="text-[11px] text-[#9fc3ca]">効果を読み込み中...</p>
  if (error) return <p className="text-[11px] text-[#ff4d4d]">効果を取得できませんでした</p>
  if (skills.length === 0 && arts.length === 0) return <p className="text-[11px] text-[#9fc3ca]">固有スキル・アーツの登録はありません</p>

  return (
    <div className="flex flex-col gap-1.5 text-[11px] text-[#d7eef2] leading-snug">
      {skills.map((s, i) => (
        <div key={`s${i}`} className="rounded border border-[#143844] bg-[#071820] px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {s.skillType && s.skillType !== 'ー' && <span className="rounded bg-[#4ce0e6]/20 px-1.5 py-0.5 text-[10px] text-[#4ce0e6]">{s.skillType}</span>}
            <span className="font-bold text-white">{s.title}</span>
            {s.powerCost && <span className="hud-mono text-[10px] text-[#ffd76a]">ホロパワー -{s.powerCost}</span>}
          </div>
          {s.text && <p className="mt-0.5 whitespace-pre-wrap">{s.text}</p>}
        </div>
      ))}
      {arts.map((a, i) => (
        <div key={`a${i}`} className="rounded border border-[#143844] bg-[#071820] px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-[#ffd76a]/20 px-1.5 py-0.5 text-[10px] text-[#ffd76a]">アーツ</span>
            <span className="inline-flex items-center gap-1">
              {(a.yellCost ?? []).map((c, j) => (
                <span key={j} className="inline-flex items-center gap-0.5">
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: YELL_COLOR_HEX[c.color] ?? '#9aa5a8', border: '1px solid rgba(255,255,255,0.7)', display: 'inline-block' }} title={c.color} />
                  <span className="hud-mono text-[10px] text-[#9fc3ca]">×{c.count}</span>
                </span>
              ))}
            </span>
            <span className="font-bold text-white">{a.name}</span>
            {a.damage && <span className="hud-mono ml-auto text-xs text-[#ffd76a]">{a.damage}</span>}
          </div>
          {a.specialAttackColor && (
            <div className="text-[10px] text-[#9fc3ca]">
              特攻: {a.specialAttackColor}
              {a.specialAttackDamage ? ` +${a.specialAttackDamage}` : ''}
            </div>
          )}
          {a.effectText && <p className="mt-0.5 whitespace-pre-wrap">{a.effectText}</p>}
        </div>
      ))}
    </div>
  )
}