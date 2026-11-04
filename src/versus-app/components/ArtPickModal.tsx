// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { YELL_COLOR_HEX, type ArtRow } from '../types/artsSkills'
import { isPlusDamage, parseDamage, type ZoneId } from '../utils/playfield'
import { useNarrowScreen } from './ZoneActionMenu'
import type { DeckCard } from '../utils/deckImage'

// パフォーマンスステップ：センター・コラボのホロメンの、どのアーツを使うかを選ぶメニュー。
// 選んだカード（anchorZone の枠）の、すぐ上に出す（上に余白が足りないときは、下）。外側をクリックすると、閉じる。
// ・必要なエールが足りないアーツは、選べない（暗く表示する）
// ・アーツのダメージに「+」がついているもの（50+ など）は、追加するダメージを、入力できる
// 選んだら、盤面で、ダメージを与える相手（コラボ・センター・バック）を選ぶ
const MENU_MAX_W = 380
const GAP = 10

export function ArtPickModal({ anchorZone, card, arts, loading, error, power, payable, onPick, onClose }: { anchorZone: ZoneId; card: DeckCard; arts: ArtRow[]; loading: boolean; error: string; power: number; payable: (art: ArtRow) => boolean; onPick: (art: ArtRow, extra: number) => void; onClose: () => void }) {
  const narrow = useNarrowScreen()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [extra, setExtra] = useState<Record<number, string>>({}) // 「+」のアーツに、追加するダメージ（入力中の文字）

  // カードの、画面上の位置（ズームやスクロールで動くので、そのたびに測り直す）
  useLayoutEffect(() => {
    if (narrow) return
    const measure = () => {
      const el = document.querySelector(`[data-pf-zone="${anchorZone}"]`)
      setRect(el ? el.getBoundingClientRect() : null)
      setVp({ w: window.innerWidth, h: window.innerHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [anchorZone, narrow])

  const w = Math.min(vp.w - 16, MENU_MAX_W)
  const cx = rect ? rect.left + rect.width / 2 : vp.w / 2
  const left = Math.max(8, Math.min(cx - w / 2, vp.w - 8 - w))
  const spaceAbove = rect ? rect.top - GAP - 8 : 0
  const spaceBelow = rect ? vp.h - rect.bottom - GAP - 8 : 0
  const above = !rect || spaceAbove >= 200 || spaceAbove >= spaceBelow
  const maxH = Math.max(140, rect ? (above ? spaceAbove : spaceBelow) : vp.h - 32)
  const pos = !rect ? { top: 16 } : above ? { bottom: vp.h - rect.top + GAP } : { top: rect.bottom + GAP }
  const caretLeft = Math.max(18, Math.min(cx - left, w - 18))

  const extraOf = (i: number): number => Math.max(0, Math.floor(Number(extra[i] ?? '0')) || 0)
  const bump = (i: number, d: number) => setExtra((m) => ({ ...m, [i]: String(extraOf(i) + d) }))

  const content = (
    <>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="hud-font truncate text-sm font-bold text-white">
              {card.card_name}
              <span className="ml-2 text-xs font-normal text-[#9fc3ca]">アーツを選ぶ</span>
            </h3>
            {power > 0 && <span className="hud-mono shrink-0 text-[11px] text-[#fcd34d]">パワーアップ +{power}</span>}
            <button type="button" className="btn-secondary ml-auto shrink-0" onClick={onClose}>
              やめる
            </button>
          </div>

          {loading && <p className="text-sm text-[#9fc3ca]">アーツを読み込み中...</p>}
          {error && <p className="text-sm text-[#ff4d4d]">アーツを取得できませんでした：{error}</p>}
          {!loading && !error && arts.length === 0 && <p className="text-sm text-[#ffd76a]">このカードには、アーツが登録されていません</p>}

          <ul className="flex flex-col gap-1.5">
            {arts.map((a, i) => {
              const ok = payable(a)
              const plus = isPlusDamage(a.damage)
              return (
                <li key={i} className="rounded-lg border-2 p-2" style={{ borderColor: ok ? 'rgba(232,140,77,0.5)' : 'rgba(120,130,135,0.4)', background: ok ? 'rgba(232,140,77,0.07)' : 'rgba(120,130,135,0.06)', opacity: ok ? 1 : 0.55 }}>
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
                    <span className="hud-mono ml-auto text-base font-extrabold text-[#ffd76a]">
                      {a.damage || '0'}
                      {power > 0 && <span className="ml-1 text-xs text-[#fcd34d]">+{power}</span>}
                    </span>
                  </div>
                  {a.specialAttackColor && (
                    <div className="mt-1 text-[11px] text-[#9fc3ca]">
                      特攻: <span style={{ color: YELL_COLOR_HEX[a.specialAttackColor] ?? '#9aa5a8', fontWeight: 700 }}>{a.specialAttackColor}</span>
                      {a.specialAttackDamage ? ` ${a.specialAttackDamage}` : ''}（相手が{a.specialAttackColor}のとき、+{parseDamage(a.specialAttackDamage)}）
                    </div>
                  )}
                  {a.effectText && <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-[#d7eef2]">{a.effectText}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {plus && ok && (
                      <label className="flex items-center gap-1 text-xs text-[#ffe9a8]">
                        追加ダメージ ＋
                        <input type="number" inputMode="numeric" min={0} step={10} className="field !w-20 !py-1 text-right" value={extra[i] ?? ''} placeholder="0" onChange={(e) => setExtra((m) => ({ ...m, [i]: e.target.value }))} aria-label={`${a.name}の追加ダメージ`} />
                        {[10, 20, 50].map((d) => (
                          <button key={d} type="button" className="btn-secondary !px-1.5 !py-0.5 text-[11px]" onClick={() => bump(i, d)}>
                            +{d}
                          </button>
                        ))}
                      </label>
                    )}
                    <button type="button" disabled={!ok} className="btn-primary ml-auto !px-3 !py-1 disabled:cursor-not-allowed" onClick={() => onPick(a, plus ? extraOf(i) : 0)}>
                      {ok ? '使う' : 'エール不足'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
    </>
  )

  // スマホ：画面の中央のモーダル（カードの横に出すと、はみ出すため）
  if (narrow) {
    return createPortal(
      <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-3" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label="アーツを選ぶ" className="w-full overflow-y-auto rounded-2xl border-2 border-[#ffd76a] p-3 shadow-2xl" style={{ maxWidth: 420, maxHeight: 'calc(100dvh - 24px)', background: '#061217', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }} onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[89]" onClick={onClose} />
      <div role="dialog" aria-label="アーツを選ぶ" className="fixed z-[90]" style={{ left, width: w, ...pos }}>
        {rect && <div aria-hidden style={{ position: 'absolute', left: caretLeft - 8, [above ? 'bottom' : 'top']: -8, width: 16, height: 16, transform: 'rotate(45deg)', background: '#061217', borderRight: above ? '2px solid #ffd76a' : undefined, borderBottom: above ? '2px solid #ffd76a' : undefined, borderLeft: above ? undefined : '2px solid #ffd76a', borderTop: above ? undefined : '2px solid #ffd76a' }} />}
        <div className="overflow-y-auto rounded-xl border-2 border-[#ffd76a] p-2.5 shadow-2xl" style={{ background: '#061217', maxHeight: maxH }}>
          {content}
        </div>
      </div>
    </>,
    document.body
  )
}