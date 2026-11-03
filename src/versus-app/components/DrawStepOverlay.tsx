// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { backStyleOf } from '../utils/cardBack'

// ドローステップ：デッキを画面の中央に出して、クリック（タップ）で、1枚引く。
// ターンを進める側の画面にだけ出す（対戦中、相手の画面には出ない）
export function DrawStepOverlay({ count, title, onDraw, onSkip }: { count: number; title: string; onDraw: () => void; onSkip: () => void }) {
  const b = backStyleOf('deck')

  // Enter・スペースでも引ける
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      onDraw()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDraw])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="ドローステップ" className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
      <style>{`
@keyframes ds-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes ds-in{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
.ds-deck{animation:ds-in .35s cubic-bezier(.2,1.3,.4,1) 1 both}
.ds-deck-inner{animation:ds-bob 1.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.ds-deck,.ds-deck-inner{animation:none}}
`}</style>
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="hud-mono text-xs font-bold tracking-[0.5em] text-[#4ce0e6]">DRAW STEP</p>
        <h2 className="text-xl font-extrabold text-white">{title}</h2>
        <button type="button" onClick={onDraw} aria-label="デッキから1枚引く" className="ds-deck block cursor-pointer select-none rounded-2xl outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4ce0e6]" style={{ WebkitTapHighlightColor: 'transparent' }}>
          <div
            className="ds-deck-inner relative grid place-items-center"
            style={{
              width: 'min(46vw, 210px)',
              aspectRatio: '63 / 88',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${b.from}, ${b.to})`,
              border: `4px solid ${b.border}`,
              boxShadow: `inset 0 0 0 4px rgba(10,20,60,0.85), 0 0 34px ${b.border}88, 0 12px 28px rgba(0,0,0,0.7)`,
            }}
          >
            <span className="rounded-full bg-[rgba(5,10,30,0.6)] px-5 py-1 text-3xl font-extrabold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              ×{count}
            </span>
          </div>
        </button>
        <p className="text-sm font-bold text-[#d7eef2]">{count > 0 ? 'デッキをクリック（タップ）して、1枚引く' : 'デッキにカードがありません'}</p>
        <button type="button" className="btn-secondary" onClick={onSkip}>
          引かずに進む
        </button>
      </div>
    </div>,
    document.body
  )
}