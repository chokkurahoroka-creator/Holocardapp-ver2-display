// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCardDetailForPreview } from '../hooks/useCardDetailForPreview'
import { YELL_COLOR_HEX } from '../types/artsSkills'
import type { DeckCard } from '../utils/deckImage'

type Props = {
  card: DeckCard
  imageWidth?: number // カード画像の幅（px）
}

// エールのコスト（色の丸と、その数）
function CostDots({ cost }: { cost: { color: string; count: number }[] }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {cost.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: YELL_COLOR_HEX[c.color] ?? '#9aa5a8', border: '1px solid rgba(255,255,255,0.7)', display: 'inline-block' }} title={c.color} />
          <span className="hud-mono text-[10px] text-[#9fc3ca]">×{c.count}</span>
        </span>
      ))}
    </span>
  )
}

// カードのプレビュー。大きな画像の横に、カード名・種類・HP・固有スキル・アーツの効果を並べる
export function CardPreview({ card, imageWidth = 210 }: Props) {
  const { detail, loading, error } = useCardDetailForPreview(card.id)
  const imageHeight = Math.round(imageWidth * (88 / 63))
  const skills = detail?.skills.filter((s) => s.title || s.text) ?? []
  const arts = detail?.arts.filter((a) => a.name || a.effectText || a.damage) ?? []

  return (
    <div className="flex flex-wrap gap-3">
      <div className="shrink-0">
        {card.image_url ? (
          <img src={card.image_url} alt={card.card_name} draggable={false} style={{ width: imageWidth, height: imageHeight, objectFit: 'cover', borderRadius: 8, display: 'block', boxShadow: '0 2px 10px rgba(0,0,0,0.6)' }} />
        ) : (
          <div style={{ width: imageWidth, height: imageHeight }} className="rounded-lg bg-[#26324f] text-sm text-[#9fc3ca] flex items-center justify-center text-center p-2">
            {card.card_name}
          </div>
        )}
      </div>

      <div className="min-w-[200px] flex-1 text-xs text-[#d7eef2]">
        <div className="text-base text-white font-bold break-all leading-tight">{card.card_name}</div>
        <div className="hud-mono text-[10px] text-[#9fc3ca] mt-1">
          {card.set_code} {card.type}
          {card.card_type ? ` / ${card.card_type}` : ''}
          {(detail?.stage ?? card.stage) ? ` / ${detail?.stage ?? card.stage}` : ''}
          {(detail?.attribute ?? card.attribute) ? ` / ${detail?.attribute ?? card.attribute}` : ''}
        </div>

        {detail && (detail.hp !== null || detail.baton_touch_cost !== null) && (
          <div className="mt-1.5 flex gap-3 text-[11px] text-white">
            {detail.hp !== null && <span>HP <b>{detail.hp}</b></span>}
            {detail.baton_touch_cost !== null && <span>バトンタッチ <b>{detail.baton_touch_cost}</b></span>}
          </div>
        )}
        {detail?.tags && <div className="mt-1 text-[10px] text-[#9fc3ca] break-all">{detail.tags}</div>}

        {loading && <p className="mt-2 text-[#9fc3ca]">効果を読み込み中...</p>}
        {error && <p className="mt-2 text-[#ff4d4d]">効果を取得できませんでした: {error}</p>}

        {skills.length > 0 && (
          <div className="mt-3">
            <div className="hud-mono text-[10px] text-[#4ce0e6] mb-1">SKILLS</div>
            <ul className="flex flex-col gap-2">
              {skills.map((s, i) => (
                <li key={i} className="rounded border border-[#143844] bg-[#071820] p-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.skillType && s.skillType !== 'ー' && <span className="rounded bg-[#4ce0e6]/20 px-1.5 py-0.5 text-[10px] text-[#4ce0e6]">{s.skillType}</span>}
                    <span className="font-bold text-white">{s.title}</span>
                    {s.powerCost && <span className="hud-mono text-[10px] text-[#ffd76a]">ホロパワー -{s.powerCost}</span>}
                  </div>
                  {s.text && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{s.text}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {arts.length > 0 && (
          <div className="mt-3">
            <div className="hud-mono text-[10px] text-[#ffd76a] mb-1">ARTS</div>
            <ul className="flex flex-col gap-2">
              {arts.map((a, i) => (
                <li key={i} className="rounded border border-[#143844] bg-[#071820] p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CostDots cost={a.yellCost ?? []} />
                    <span className="font-bold text-white">{a.name}</span>
                    {a.damage && <span className="hud-mono text-sm text-[#ffd76a] ml-auto">{a.damage}</span>}
                  </div>
                  {a.specialAttackColor && (
                    <div className="mt-0.5 text-[10px] text-[#9fc3ca]">
                      特攻: {a.specialAttackColor}
                      {a.specialAttackDamage ? ` +${a.specialAttackDamage}` : ''}
                    </div>
                  )}
                  {a.effectText && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{a.effectText}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail && skills.length === 0 && arts.length === 0 && !loading && <p className="mt-2 text-[#9fc3ca]">固有スキル・アーツの登録はありません</p>}
      </div>
    </div>
  )
}