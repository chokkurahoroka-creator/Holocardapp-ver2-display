import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { DeckCard } from '../utils/deckImage'

// サポート（SUPPORT）の置き場にカードを置いたとき、画面の中央で、そのカードを発動したとわかるようにする演出。
// 続けて置かれたときは、順番に1枚ずつ出す
export type SupportCast = { id: number; card: DeckCard; who: string }

const CAST_MS = 1900

export function SupportCastOverlay({ queue, onDone }: { queue: SupportCast[]; onDone: (id: number) => void }) {
  const head = queue[0]
  const headId = head?.id
  useEffect(() => {
    if (headId === undefined) return
    const t = window.setTimeout(() => onDone(headId), CAST_MS)
    return () => window.clearTimeout(t)
  }, [headId, onDone])
  if (!head) return null
  const { card } = head
  return createPortal(
    <div key={head.id} aria-live="polite" className="pointer-events-none fixed inset-0 z-[104] grid place-items-center overflow-hidden">
      <style>{`
@keyframes sc-dim{0%{opacity:0}12%{opacity:1}82%{opacity:1}100%{opacity:0}}
@keyframes sc-card{0%{transform:translateY(140px) scale(.35) rotate(-10deg);opacity:0}20%{transform:translateY(0) scale(1.12) rotate(2deg);opacity:1}30%{transform:scale(1) rotate(0)}82%{transform:scale(1);opacity:1}100%{transform:translateY(-30px) scale(1.18);opacity:0}}
@keyframes sc-ring{0%{transform:translate(-50%,-50%) scale(.4);opacity:.9}100%{transform:translate(-50%,-50%) scale(2.1);opacity:0}}
@keyframes sc-text{0%{transform:translateY(-14px) scale(.7);opacity:0}22%{transform:translateY(0) scale(1.08);opacity:1}32%{transform:scale(1)}82%{opacity:1}100%{transform:translateY(-10px);opacity:0}}
@keyframes sc-shine{0%{transform:translateX(-140%) skewX(-18deg);opacity:0}30%{opacity:.85}100%{transform:translateX(260%) skewX(-18deg);opacity:0}}
@media (prefers-reduced-motion: reduce){.sc-anim{animation:none!important}}
`}</style>
      <div className="sc-anim absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(8,28,48,0.35), rgba(2,8,16,0.8))', animation: `sc-dim ${CAST_MS}ms ease-out forwards` }} />
      <div className="relative flex flex-col items-center gap-3">
        <div className="sc-anim text-center" style={{ animation: `sc-text ${CAST_MS}ms ease-out forwards` }}>
          <p className="hud-mono text-xs font-bold tracking-[0.5em] text-[#7dd3fc]">SUPPORT</p>
          <p className="text-2xl font-extrabold text-white" style={{ textShadow: '0 0 14px #38bdf8, 0 2px 6px rgba(0,0,0,0.9)' }}>
            {head.who}が発動！
          </p>
        </div>
        <div className="relative" style={{ width: 'min(52vw, 250px)', aspectRatio: '63 / 88' }}>
          {[0, 0.25].map((d) => (
            <div key={d} className="sc-anim absolute left-1/2 top-1/2 rounded-2xl" style={{ width: '100%', height: '100%', border: '5px solid #7dd3fc', boxShadow: '0 0 28px #38bdf8', opacity: 0, animation: `sc-ring 1.3s ease-out ${0.15 + d}s forwards` }} />
          ))}
          <div className="sc-anim absolute inset-0 overflow-hidden rounded-xl" style={{ animation: `sc-card ${CAST_MS}ms cubic-bezier(.2,1,.3,1) forwards`, boxShadow: '0 0 0 3px #bae6fd, 0 0 42px #38bdf8, 0 14px 30px rgba(0,0,0,0.75)', background: '#26324f', opacity: 0 }}>
            {card.image_url ? (
              <img src={card.image_url} alt={card.card_name} draggable={false} className="block h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center p-3 text-center text-sm font-bold text-white">{card.card_name}</div>
            )}
            <div className="sc-anim absolute inset-y-0 left-0 w-2/5" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.8), rgba(255,255,255,0))', mixBlendMode: 'screen', opacity: 0, animation: 'sc-shine 0.9s ease-out 0.35s forwards' }} />
          </div>
        </div>
        <p className="sc-anim max-w-[80vw] truncate text-base font-bold text-[#e0f2fe]" style={{ animation: `sc-text ${CAST_MS}ms ease-out forwards`, textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
          {card.card_name}
        </p>
      </div>
    </div>,
    document.body
  )
}