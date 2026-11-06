// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ZoneId } from '../utils/playfield'

// 盤面の枠（カード）をクリックしたときに出す、メニューの外枠。アーツの選択と、リセットステップのメニューで、共通に使う（色だけ、accent で変える）。
// ・パソコン：そのカードのすぐ上に出す（上に余白が足りないときは、下）。外側をクリックすると、閉じる
// ・スマホ（画面が狭いとき）：画面の中央に、モーダルで出す
const MENU_MAX_W = 380
const GAP = 10
const NARROW_QUERY = '(max-width: 640px), (pointer: coarse) and (max-width: 900px)'

export function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches)
  useEffect(() => {
    const m = window.matchMedia(NARROW_QUERY)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

// modal=false：外側をクリックしても、閉じない（盤面を、そのまま操作できる。スマホでは、中央のモーダルのまま）
export function AnchoredMenu({ anchorZone, label, accent, onClose, modal = true, children }: { anchorZone: ZoneId; label: string; accent: string; onClose: () => void; modal?: boolean; children: ReactNode }) {
  const narrow = useNarrowScreen()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

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

  // スマホ：画面の中央のモーダル
  if (narrow) {
    return createPortal(
      <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-3" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={label} className="w-full overflow-y-auto rounded-2xl p-3 shadow-2xl" style={{ maxWidth: 420, maxHeight: 'calc(100dvh - 24px)', background: '#061217', border: `2px solid ${accent}`, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>,
      document.body
    )
  }

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
      {modal && <div className="fixed inset-0 z-[89]" onClick={onClose} />}
      <div role="dialog" aria-label={label} className="fixed z-[90]" style={{ left, width: w, ...pos }}>
        {rect && <div aria-hidden style={{ position: 'absolute', left: caretLeft - 8, [above ? 'bottom' : 'top']: -8, width: 16, height: 16, transform: 'rotate(45deg)', background: '#061217', borderRight: above ? `2px solid ${accent}` : undefined, borderBottom: above ? `2px solid ${accent}` : undefined, borderLeft: above ? undefined : `2px solid ${accent}`, borderTop: above ? undefined : `2px solid ${accent}` }} />}
        <div className="overflow-y-auto rounded-xl p-2.5 shadow-2xl" style={{ background: '#061217', border: `2px solid ${accent}`, maxHeight: maxH }}>
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}

// リセットステップのメニュー（アーツの選択と同じ見た目。色だけ、紫）。説明は、ホバーで見える
export type ZoneAction = { id: string; label: string; hint?: string; disabled?: boolean; onSelect: () => void }
const ACCENT = '#c084fc'

export function ZoneActionMenu({ anchorZone, title, subtitle, actions, onClose, modal = true }: { anchorZone: ZoneId; title: string; subtitle?: string; actions: ZoneAction[]; onClose: () => void; modal?: boolean }) {
  return (
    <AnchoredMenu anchorZone={anchorZone} label={title} accent={ACCENT} onClose={onClose} modal={modal}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="hud-font truncate text-sm font-bold text-white">
          {title}
          {subtitle && <span className="ml-2 text-xs font-normal text-[#9fc3ca]">{subtitle}</span>}
        </h3>
        <button type="button" className="btn-secondary ml-auto shrink-0" onClick={onClose}>
          やめる
        </button>
      </div>
      {/* ボタンは、行全体を押せる大きさで、2列に並べる */}
      <ul className="grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <li key={a.id} className={actions.length % 2 === 1 && a.id === actions[actions.length - 1]?.id ? 'col-span-2' : undefined}>
            <button type="button" title={a.hint} disabled={a.disabled} onClick={a.onSelect} className="w-full rounded-lg border-2 px-2 py-3 text-sm font-bold text-white hover:brightness-125 active:brightness-150 disabled:cursor-not-allowed disabled:opacity-40" style={{ minHeight: 48, borderColor: ACCENT, background: 'rgba(192,132,252,0.16)' }}>
              {a.label}
            </button>
          </li>
        ))}
      </ul>
    </AnchoredMenu>
  )
}