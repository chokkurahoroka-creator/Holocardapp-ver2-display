// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { YELL_COLOR_HEX, type ArtRow } from '../types/artsSkills'
import { parseDamage, type ZoneId } from '../utils/playfield'
import type { DeckCard } from '../utils/deckImage'

// パフォーマンスステップ：センターのホロメンの、どのアーツを使うかを選ぶメニュー。
// 選んだカード（anchorZone の枠）の、すぐ上に出す（上に余白が足りないときは、下）。外側をクリックすると、閉じる。
// 選んだら、盤面で、ダメージを与える相手（コラボ・センター・バック）を選ぶ
const MENU_MAX_W = 380
const GAP = 10

export function ArtPickModal({ anchorZone, card, arts, loading, error, power, onPick, onClose }: { anchorZone: ZoneId; card: DeckCard; arts: ArtRow[]; loading: boolean; error: string; power: number; onPick: (art: ArtRow) => void; onClose: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

  // カードの、画面上の位置（ズームやスクロールで動くので、そのたびに測り直す）
  useLayoutEffect(() => {
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
  }, [anchorZone])

  const w = Math.min(vp.w - 16, MENU_MAX_W)
  const cx = rect ? rect.left + rect.width / 2 : vp.w / 2
  const left = Math.max(8, Math.min(cx - w / 2, vp.w - 8 - w))
  const spaceAbove = rect ? rect.top - GAP - 8 : 0
  const spaceBelow = rect ? vp.h - rect.bottom - GAP - 8 : 0
  const above = !rect || spaceAbove >= 200 || spaceAbove >= spaceBelow
  const maxH = Math.max(140, rect ? (above ? spaceAbove : spaceBelow) : vp.h - 32)
  const pos = !rect ? { top: 16 } : above ? { bottom: vp.h - rect.top + GAP } : { top: rect.bottom + GAP }
  const caretLeft = Math.max(18, Math.min(cx - left, w - 18))

  return createPortal(
    <>
      <div className="fixed inset-0 z-[89]" onClick={onClose} />
      <div role="dialog" aria-label="アーツを選ぶ" className="fixed z-[90]" style={{ left, width: w, ...pos }}>
        {rect && <div aria-hidden style={{ position: 'absolute', left: caretLeft - 8, [above ? 'bottom' : 'top']: -8, width: 16, height: 16, transform: 'rotate(45deg)', background: '#061217', borderRight: above ? '2px solid #ffd76a' : undefined, borderBottom: above ? '2px solid #ffd76a' : undefined, borderLeft: above ? undefined : '2px solid #ffd76a', borderTop: above ? undefined : '2px solid #ffd76a' }} />}
        <div className="overflow-y-auto rounded-xl border-2 border-[#ffd76a] p-2.5 shadow-2xl" style={{ background: '#061217', maxHeight: maxH }}>
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
            {arts.map((a, i) => (
              <li key={i}>
                <button type="button" onClick={() => onPick(a)} className="w-full rounded-lg border-2 border-[#e88c4d]/50 bg-[#e88c4d]/[0.07] p-2 text-left hover:border-[#ffd76a] focus-visible:border-[#ffd76a] focus-visible:outline-none">
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
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>,
    document.body
  )
}