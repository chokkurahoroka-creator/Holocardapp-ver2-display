// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useState } from 'react'
import { YELL_COLOR_HEX, type ArtRow } from '../types/artsSkills'
import { isPlusDamage, parseDamage, type ZoneId } from '../utils/playfield'
import type { DeckCard } from '../utils/deckImage'
import { AnchoredMenu } from './ZoneActionMenu'

// パフォーマンスステップ：センター・コラボのホロメンの、どのアーツを使うかを選ぶメニュー（カードのすぐ上に出る。スマホは、中央のモーダル）。
// 必要なエールが足りないアーツは、選べない。ダメージに「+」がついているアーツは、追加するダメージを入力できる。
// 選んだら、盤面で、ダメージを与える相手を選ぶ
export function ArtPickModal({ anchorZone, card, arts, loading, error, power, payable, onPick, onClose }: { anchorZone: ZoneId; card: DeckCard; arts: ArtRow[]; loading: boolean; error: string; power: number; payable: (art: ArtRow) => boolean; onPick: (art: ArtRow, extra: number) => void; onClose: () => void }) {
  const [extra, setExtra] = useState<Record<number, string>>({}) // 「+」のアーツに、追加するダメージ（入力中の文字）
  const extraOf = (i: number): number => Math.max(0, Math.floor(Number(extra[i] ?? '0')) || 0)
  const bump = (i: number, d: number) => setExtra((m) => ({ ...m, [i]: String(extraOf(i) + d) }))

  return (
    <AnchoredMenu anchorZone={anchorZone} label="アーツを選ぶ" accent="#ffd76a" onClose={onClose}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="hud-font truncate text-sm font-bold text-white">
          {card.card_name}
          <span className="ml-2 text-xs font-normal text-[#9fc3ca]">アーツ</span>
        </h3>
        {power > 0 && (
          <span className="hud-mono shrink-0 text-[11px] text-[#fcd34d]" title="パワーアップ：ダメージに足されます">
            パワー+{power}
          </span>
        )}
        <button type="button" className="btn-secondary ml-auto shrink-0" onClick={onClose}>
          やめる
        </button>
      </div>

      {loading && <p className="text-sm text-[#9fc3ca]">読み込み中…</p>}
      {error && <p className="text-sm text-[#ff4d4d]">取得できませんでした：{error}</p>}
      {!loading && !error && arts.length === 0 && <p className="text-sm text-[#ffd76a]">アーツが登録されていません</p>}

      <ul className="flex flex-col gap-1.5">
        {arts.map((a, i) => {
          const ok = payable(a)
          const plus = isPlusDamage(a.damage)
          return (
            <li key={i} title={ok ? undefined : 'エールが足りません（確認のうえで、使えます）'} className="rounded-lg border-2 p-2" style={{ borderColor: ok ? 'rgba(232,140,77,0.5)' : 'rgba(120,130,135,0.4)', background: ok ? 'rgba(232,140,77,0.07)' : 'rgba(120,130,135,0.06)', opacity: ok ? 1 : 0.55 }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  {(a.yellCost ?? []).map((c, j) => (
                    <span key={j} className="inline-flex items-center gap-0.5">
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: YELL_COLOR_HEX[c.color] ?? '#9aa5a8', border: '1px solid rgba(255,255,255,0.7)', display: 'inline-block' }} title={c.color} />
                      <span className="hud-mono text-[11px] text-[#9fc3ca]">×{c.count}</span>
                    </span>
                  ))}
                </span>
                <span className="text-sm font-bold text-white">{a.name || '（名前なし）'}</span>
                <span className="hud-mono ml-auto text-base font-extrabold text-[#ffd76a]">{a.damage || '0'}</span>
              </div>
              {a.specialAttackColor && (
                <div className="mt-1 text-[11px] text-[#9fc3ca]" title={`相手が${a.specialAttackColor}のとき、+${parseDamage(a.specialAttackDamage)}`}>
                  特攻 <span style={{ color: YELL_COLOR_HEX[a.specialAttackColor] ?? '#9aa5a8', fontWeight: 700 }}>{a.specialAttackColor}</span> {a.specialAttackDamage}
                </div>
              )}
              {a.effectText && <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-[#d7eef2]">{a.effectText}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {plus && ok && (
                  <label className="flex items-center gap-1 text-xs text-[#ffe9a8]" title="追加するダメージを入力します">
                    ＋
                    <input type="number" inputMode="numeric" min={0} step={10} className="field !w-20 !py-1 text-right" value={extra[i] ?? ''} placeholder="0" onChange={(e) => setExtra((m) => ({ ...m, [i]: e.target.value }))} aria-label={`${a.name}の追加ダメージ`} />
                    {[10, 20, 50].map((d) => (
                      <button key={d} type="button" className="btn-secondary !px-1.5 !py-0.5 text-[11px]" onClick={() => bump(i, d)}>
                        +{d}
                      </button>
                    ))}
                  </label>
                )}
                <button type="button" className="btn-primary ml-auto !px-3 !py-1" onClick={() => onPick(a, plus ? extraOf(i) : 0)} title={ok ? undefined : 'エールが足りません。確認のうえで、使えます'}>
                  {ok ? '使う' : '使う（エール不足）'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </AnchoredMenu>
  )
}