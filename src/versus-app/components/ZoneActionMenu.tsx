// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ZoneId } from '../utils/playfield'

// 盤面の枠（カード）をクリックしたときに、そのカードのすぐ上に出す、操作のメニュー（上に余白が足りないときは、下）。
// 外側をクリックすると、閉じる。画面上の実寸で出すので、盤面が縮んでいても、文字は小さくならない
export type ZoneAction = { id: string; label: string; hint?: string; disabled?: boolean; onSelect: () => void }

const MENU_W = 260
const GAP = 10

export function ZoneActionMenu({ anchorZone, title, subtitle, actions, onClose }: { anchorZone: ZoneId; title: string; subtitle?: string; actions: ZoneAction[]; onClose: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

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

  const w = Math.min(vp.w - 16, MENU_W)
  const cx = rect ? rect.left + rect.width / 2 : vp.w / 2
  const left = Math.max(8, Math.min(cx - w / 2, vp.w - 8 - w))
  const spaceAbove = rect ? rect.top - GAP - 8 : 0
  const spaceBelow = rect ? vp.h - rect.bottom - GAP - 8 : 0
  const above = !rect || spaceAbove >= 220 || spaceAbove >= spaceBelow
  const maxH = Math.max(140, rect ? (above ? spaceAbove : spaceBelow) : vp.h - 32)
  const pos = !rect ? { top: 16 } : above ? { bottom: vp.h - rect.top + GAP } : { top: rect.bottom + GAP }
  const caretLeft = Math.max(18, Math.min(cx - left, w - 18))
  const edge = '#c084fc'

  return createPortal(
    <>
      <div className="fixed inset-0 z-[89]" onClick={onClose} />
      <div role="menu" aria-label={title} className="fixed z-[90]" style={{ left, width: w, ...pos }}>
        {rect && <div aria-hidden style={{ position: 'absolute', left: caretLeft - 8, [above ? 'bottom' : 'top']: -8, width: 16, height: 16, transform: 'rotate(45deg)', background: '#061217', borderRight: above ? `2px solid ${edge}` : undefined, borderBottom: above ? `2px solid ${edge}` : undefined, borderLeft: above ? undefined : `2px solid ${edge}`, borderTop: above ? undefined : `2px solid ${edge}` }} />}
        <div className="overflow-y-auto rounded-xl p-2 shadow-2xl" style={{ background: '#061217', border: `2px solid ${edge}`, maxHeight: maxH }}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <h3 className="hud-font min-w-0 flex-1 truncate text-sm font-bold text-white">{title}</h3>
            <button type="button" className="btn-secondary shrink-0 !px-2 !py-0.5 text-xs" onClick={onClose}>
              閉じる
            </button>
          </div>
          {subtitle && <p className="mb-1.5 px-1 text-[11px] text-[#9fc3ca]">{subtitle}</p>}
          <ul className="flex flex-col gap-1.5">
            {actions.map((a) => (
              <li key={a.id}>
                <button type="button" role="menuitem" disabled={a.disabled} onClick={a.onSelect} className="w-full rounded-lg border-2 border-[#c084fc]/50 bg-[#c084fc]/[0.08] px-3 py-2 text-left text-sm font-bold text-white hover:border-[#e9d5ff] focus-visible:border-[#e9d5ff] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40">
                  {a.label}
                  {a.hint && <span className="block text-[11px] font-normal text-[#c9b8e8]">{a.hint}</span>}
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