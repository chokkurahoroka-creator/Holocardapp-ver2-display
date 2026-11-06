// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useState } from 'react'

// 勝利のモーダル：ライフが0になった側の、相手の勝ち。紙吹雪は、1回だけ降らせて止める（動きを続けて、端末を熱くしないため）。
// 「動きを減らす」設定の端末では、紙吹雪と、動きを出さない

const COLORS = ['#ffd23f', '#ff7f50', '#4ce0e6', '#a855f7', '#ff5d8f', '#7cfc00', '#ffffff']
type Piece = { left: number; delay: number; dur: number; w: number; h: number; color: string; rot: number; drift: number; round: boolean }

function makePieces(n: number): Piece[] {
  return Array.from({ length: n }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    dur: 2.6 + Math.random() * 1.8,
    w: 6 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    color: COLORS[i % COLORS.length]!,
    rot: 360 + Math.random() * 720,
    drift: (Math.random() - 0.5) * 160,
    round: Math.random() < 0.3,
  }))
}

// onRematch：対戦ルームのとき、「再戦」（デッキ選択から、もう一度始める）を出す
export function VictoryModal({ name, subtitle, onClose, onRematch }: { name: string; subtitle: string; onClose: () => void; onRematch?: () => void }) {
  const [pieces] = useState(() => makePieces(36))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={`${name} Win`} className="fixed inset-0 z-[120] grid place-items-center overflow-hidden p-4" style={{ background: 'rgba(2,7,11,0.82)' }} onClick={onClose}>
      <style>{`
@keyframes vm-fall{0%{transform:translate3d(0,-14vh,0) rotate(0deg);opacity:0}8%{opacity:1}100%{transform:translate3d(var(--vm-drift),112vh,0) rotate(var(--vm-rot));opacity:1}}
@keyframes vm-pop{0%{transform:scale(.3) rotate(-14deg);opacity:0}60%{transform:scale(1.18) rotate(5deg);opacity:1}100%{transform:scale(1) rotate(0deg);opacity:1}}
@keyframes vm-rise{0%{transform:translateY(16px);opacity:0}100%{transform:translateY(0);opacity:1}}
@keyframes vm-shine{0%{background-position:220% 0}100%{background-position:-120% 0}}
.vm-confetti{position:absolute;top:0;animation:vm-fall var(--vm-dur) cubic-bezier(.3,.1,.6,1) var(--vm-delay) 1 both;will-change:transform}
.vm-pop{animation:vm-pop .7s cubic-bezier(.2,1.4,.4,1) .1s 1 both}
.vm-rise{animation:vm-rise .6s ease-out .45s 1 both}
.vm-shine{background-size:220% 100%;animation:vm-shine 1.8s linear .6s 3 both}
@media (prefers-reduced-motion: reduce){.vm-confetti{display:none}.vm-pop,.vm-rise,.vm-shine{animation:none}}
`}</style>

      {/* 紙吹雪（1回だけ降る） */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="vm-confetti"
            style={
              {
                left: `${p.left}%`,
                width: p.w,
                height: p.round ? p.w : p.h,
                borderRadius: p.round ? '50%' : 2,
                background: p.color,
                '--vm-dur': `${p.dur}s`,
                '--vm-delay': `${p.delay}s`,
                '--vm-rot': `${p.rot}deg`,
                '--vm-drift': `${p.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* 金の縁のカード */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(92vw,580px)] rounded-3xl p-[3px]"
        style={{ background: 'linear-gradient(135deg,#ffd23f,#fff3b0 30%,#ff9f1c 60%,#ffd23f)', boxShadow: '0 0 40px rgba(255,210,63,0.45), 0 20px 60px rgba(0,0,0,0.6)' }}
      >
        <div
          className="relative overflow-hidden rounded-[21px] px-5 py-9 text-center sm:px-8"
          style={{ background: 'radial-gradient(circle at 50% 0%, #4a3508 0%, #140d03 52%, #070b10 100%)' }}
        >
          {/* 背景の放射状の光（動かさない） */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-25"
            style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,226,122,0.9) 0deg 8deg, transparent 8deg 20deg)', maskImage: 'radial-gradient(circle, #000 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 70%)' }}
          />
          <div className="vm-pop relative text-6xl leading-none" aria-hidden="true">
            👑
          </div>
          <p className="vm-rise relative mt-3 text-sm font-bold tracking-[0.55em] text-[#ffd23f]">VICTORY</p>
          <h2
            className="vm-rise vm-shine relative mt-2 break-words font-extrabold leading-tight"
            style={{
              fontSize: 'clamp(30px, 8vw, 58px)',
              backgroundImage: 'linear-gradient(100deg,#ffb703 0%,#fff6c2 25%,#ffd23f 45%,#fff 55%,#ffb703 75%,#ffe27a 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 24px rgba(255,210,63,0.35)',
            }}
          >
            {name} Win
          </h2>
          <p className="vm-rise relative mt-3 text-sm text-[#f1e3b0]">{subtitle}</p>
          <div className="vm-rise relative mt-6 flex flex-wrap items-center justify-center gap-3">
            {onRematch && (
              <button type="button" className="btn-primary !px-8 !py-2 text-base" onClick={onRematch} autoFocus title="デッキ選択から、もう一度始めます（相手の画面も、デッキ選択に戻ります）">
                再戦
              </button>
            )}
            <button type="button" className={onRematch ? 'btn-secondary !px-8 !py-2 text-base' : 'btn-primary !px-8 !py-2 text-base'} onClick={onClose} autoFocus={!onRematch}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}