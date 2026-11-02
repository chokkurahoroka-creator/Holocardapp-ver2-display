// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import type { Side } from '../utils/playfield'

// ターンチェンジの演出：画面の中心を、右から現れて、一瞬だけ中央で止まって、左へ消える（1回だけ。動かし続けない）
export function TurnChangeBanner({ side, title, sub, onDone }: { side: Side; title: string; sub: string; onDone: () => void }) {
  const accent = side === 'me' ? '#4ce0e6' : '#ff7066'
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-1/2 z-[115] -translate-y-1/2 overflow-hidden">
      <style>{`
@keyframes tc-slide{
  0%{transform:translate3d(105vw,0,0);animation-timing-function:cubic-bezier(.16,1,.3,1)}
  26%{transform:translate3d(0,0,0)}
  62%{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.7,0,.84,0)}
  100%{transform:translate3d(-105vw,0,0)}
}
.tc-band{animation:tc-slide 1.4s linear 1 both;will-change:transform}
`}</style>
      <div
        className="tc-band relative w-full px-4 py-4 text-center"
        onAnimationEnd={onDone}
        style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(4,14,20,0.92) 12%, rgba(4,14,20,0.92) 88%, transparent 100%)`,
          borderTop: `2px solid ${accent}`,
          borderBottom: `2px solid ${accent}`,
          boxShadow: `0 0 24px ${accent}66`,
        }}
      >
        <p className="hud-mono text-xs font-bold tracking-[0.6em]" style={{ color: accent }}>
          TURN CHANGE
        </p>
        <p className="mt-1 break-words font-extrabold leading-tight text-white" style={{ fontSize: 'clamp(26px, 7vw, 52px)', textShadow: `0 0 18px ${accent}` }}>
          {title}
        </p>
        <p className="mt-1 text-sm font-bold" style={{ color: accent }}>
          {sub}
        </p>
      </div>
    </div>
  )
}