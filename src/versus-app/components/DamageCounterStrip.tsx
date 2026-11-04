// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react'
import type { GhostSpec } from '../hooks/useTouchDrag'
import type { DragItem } from './PlayfieldBoard'

// ダメージカウンターの種類（1個で、何ダメージを表すか）
export const DAMAGE_COUNTERS = [10, 20, 40, 50, 100, 200] as const
// パワーアップカウンターの種類（1個で、何パワー上がるか）
export const POWER_COUNTERS = [10, 20, 50, 100] as const

const DAMAGE_COLORS: Record<number, string> = { 10: '#f87171', 20: '#f06464', 40: '#e84a4a', 50: '#ef4444', 100: '#b91c1c', 200: '#7f1d1d' }
// 最大HPアップカウンターの種類（1個で、最大HPが何増えるか）
export const HP_COUNTERS = [10, 20, 50] as const
const HP_COLORS: Record<number, string> = { 10: '#4ade80', 20: '#22c55e', 50: '#15803d' }
const POWER_COLORS: Record<number, string> = { 10: '#fbbf24', 20: '#f59e0b', 50: '#ea580c', 100: '#c2410c' }

type CounterKind = 'damage' | 'power' | 'hp'

type Props = {
  compact: boolean // スマホ：文言を消して、アイコンを小さくする
  onDragStart: (item: DragItem) => void // マウスで、ドラッグを始めた
  onDragEnd: () => void
  onTouchDragStart: (e: ReactTouchEvent, item: DragItem, ghost: GhostSpec) => void // 指で、長押しして、ドラッグを始めた
  onTap: (kind: CounterKind, amount: number) => void // タップ・クリック：そのカウンターを選ぶ（つけ先は、そのあと、ステージのホロメンをクリックして選ぶ）
  pending: { kind: CounterKind; amount: number } | null // いま選んでいて、つけ先を選ぶのを待っているカウンター
  onRoll: (result: number) => void // サイコロの目が出た
  hint: string
  acceptRemove: boolean // カードに乗っているカウンターをドラッグしている（ここへ落とすと外れる）
  removeOver: boolean
  onDropRemove: () => void
  jankenMine: number | null // じゃんけん：自分が出した手（0:グー／1:チョキ／2:パー）。まだなら null
  onJanken: (hand: number) => void
  onLog?: () => void // スマホ：じゃんけんの右隣に、プレイログのボタンを出す
  logOpen?: boolean
}

// サイコロの目の、点の位置（3×3のマス。左上から右へ、0〜8）
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

function Die({ size, onRoll }: { size: number; onRoll: (n: number) => void }) {
  const [value, setValue] = useState(6)
  const [rolling, setRolling] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    []
  )

  const roll = () => {
    if (rolling) return
    setRolling(true)
    const result = Math.floor(Math.random() * 6) + 1
    // 出目をころころ変えてから、結果を出す
    for (let i = 1; i <= 7; i++) timers.current.push(window.setTimeout(() => setValue(Math.floor(Math.random() * 6) + 1), i * 80))
    timers.current.push(
      window.setTimeout(() => {
        setValue(result)
        setRolling(false)
        onRoll(result)
      }, 680)
    )
  }

  const pip = Math.max(5, Math.round(size * 0.16))
  return (
    <button
      type="button"
      onClick={roll}
      title="クリックでサイコロを振る"
      aria-label={`サイコロ（いまの目：${value}）`}
      className="shrink-0 select-none"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.21),
        background: 'linear-gradient(145deg, #ffffff, #d9e2e6)',
        border: '3px solid rgba(255,255,255,0.92)',
        boxShadow: '0 3px 8px rgba(0,0,0,0.6)',
        boxSizing: 'border-box',
        padding: Math.round(size * 0.1),
        display: 'grid',
        gridTemplate: 'repeat(3, 1fr) / repeat(3, 1fr)',
        cursor: 'pointer',
        animation: rolling ? 'pf-die-roll 0.34s linear infinite' : undefined,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} style={{ width: pip, height: pip, borderRadius: '50%', margin: 'auto', background: PIPS[value]!.includes(i) ? (value === 1 ? '#dc2626' : '#111827') : 'transparent' }} />
      ))}
    </button>
  )
}

const tokenStyle = (color: string, size: number): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${color} 55%, ${color} 100%)`,
  border: '3px solid rgba(255,255,255,0.92)',
  boxShadow: '0 3px 8px rgba(0,0,0,0.6)',
  boxSizing: 'border-box',
  fontSize: Math.round(size * (size < 48 ? 0.34 : 0.34)),
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
})

function Divider() {
  return <div className="self-stretch xl:w-full w-px xl:h-px bg-[#143844] shrink-0" />
}

// ダメージカウンター・サイコロ・パワーアップカウンターの置き場。プレイフィールドとホルダーの間に、縦長に置く（狭い画面では、横長）。
// カウンターを、ホロメンへドラッグすると乗る。ダメージが、ホロメンのHP以上になると、そのホロメンは、アーカイブへ送られる
export function DamageCounterStrip({ compact, pending, onDragStart, onDragEnd, onTouchDragStart, onTap, onRoll, hint, acceptRemove, removeOver, onDropRemove, jankenMine, onJanken, onLog, logOpen }: Props) {
  // アイコンの大きさは、すべてそろえる。スマホ（compact）は、全部が1段に収まるよう、画面の幅に合わせて小さくする
  const rootRef = useRef<HTMLElement>(null)
  const [fit, setFit] = useState(34)
  useEffect(() => {
    const el = rootRef.current
    if (!compact || !el) return
    const count = DAMAGE_COUNTERS.length + 1 + POWER_COUNTERS.length // 2段に並べる。いちばん長い、上の段のアイコンの数（サイコロを含む）
    const gap = 4
    const calc = () => {
      if (window.matchMedia('(min-width: 1280px)').matches) {
        setFit(40) // 広い画面では、縦に並べる
        return
      }
      // 幅 − 左右の余白(12) − すき間（アイコン数＋区切り線2本−1 か所） − 区切り線2本
      const w = el.clientWidth - 12 - (count + 2) * gap - 3
      setFit(Math.max(26, Math.min(42, Math.floor(w / count)))) // 幅が足りないときは、これより小さくせず、横にスクロールする
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact])
  const size = compact ? fit : 40 // PC：以前より小さくして、場所を取らないようにする

  const token = (kind: CounterKind, amount: number, color: string, label: string, title: string) => {
    const item: DragItem = { kind, amount }
    const picked = pending?.kind === kind && pending.amount === amount
    return (
      <div
        key={`${kind}-${amount}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move' // ドロップ先は dropEffect が 'move' なので、'copy' にすると、ドロップできなくなる
          e.dataTransfer.setData('text/plain', `${kind}:${amount}`)
          onDragStart(item)
        }}
        onDragEnd={onDragEnd}
        onTouchStart={(e) => onTouchDragStart(e, item, { w: size, h: size, round: true, text: label, color })}
        onClick={() => onTap(kind, amount)}
        onContextMenu={(e) => e.preventDefault()}
        title={title}
        className="cursor-grab select-none flex items-center justify-center text-white font-extrabold shrink-0"
        style={{ ...tokenStyle(color, size), ...(picked ? { outline: '3px solid #4ce0e6', outlineOffset: 2, boxShadow: '0 0 14px #4ce0e6' } : {}) }}
        aria-pressed={picked}
      >
        {label}
      </div>
    )
  }

  const group = 'relative flex flex-row xl:flex-col items-center shrink-0 pt-3 ' + (compact ? 'gap-1' : 'gap-3')
  const row = 'flex flex-row xl:flex-col items-center justify-center ' + (compact ? 'gap-1' : 'gap-3')

  // 各グループの、左上の小さな文言
  const tag = (text: string) => <span className="absolute left-0 top-0 hud-mono text-[8px] leading-none tracking-wider text-[#9fc3ca] pointer-events-none">{text}</span>

  // じゃんけん：グー・チョキ・パー。自分が出した手に、枠をつける（互いが出すと、結果が出る）
  const hands = [
    { hand: 0, emoji: '✊', name: 'グー' },
    { hand: 1, emoji: '✌️', name: 'チョキ' },
    { hand: 2, emoji: '✋', name: 'パー' },
  ]

  return (
    <section
      ref={rootRef}
      data-pf-zone="damage-strip"
      onDragOver={(e) => {
        if (!acceptRemove) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => {
        if (!acceptRemove) return
        e.preventDefault()
        onDropRemove()
      }}
      className={`hud-panel flex flex-col items-stretch xl:h-full xl:overflow-y-auto ${compact ? 'p-1.5 gap-1 overflow-x-auto' : 'p-2 gap-3'}`}
      style={acceptRemove ? { outline: `3px ${removeOver ? 'solid' : 'dashed'} var(--hud-cyan)`, background: removeOver ? 'rgba(76,224,230,0.25)' : undefined } : undefined}
      aria-label="カウンター置き場"
    >
      <style>{`@keyframes pf-die-roll{0%{transform:rotate(0) scale(1)}25%{transform:rotate(90deg) scale(1.08)}50%{transform:rotate(180deg) scale(1)}75%{transform:rotate(270deg) scale(1.08)}100%{transform:rotate(360deg) scale(1)}}@media (prefers-reduced-motion: reduce){button[aria-label^="サイコロ"]{animation:none!important}}`}</style>

      {/* PC（広い画面）：MAX HP のところで改行して、縦2列にする（左の列：ダメージ・サイコロ・パワーアップ／右の列：最大HPアップ・じゃんけん）。狭い画面・スマホは、横に2段 */}
      <div className={`flex flex-col xl:flex-row xl:items-start xl:justify-center ${compact ? 'gap-1 xl:gap-1' : 'gap-3'}`}>
      {/* 1段目：ダメージ・サイコロ・パワーアップ */}
      <div className={row}>
        <div className={group}>
          {tag('DAMAGE')}
          {DAMAGE_COUNTERS.map((n) => token('damage', n, DAMAGE_COLORS[n] ?? '#ef4444', String(n), `${n}ダメージ：クリックして、つけ先のホロメンを選ぶ（ホロメンへドラッグでも）`))}
        </div>

        <Divider />

        <div className={`${group} pt-3`}>
          <Die size={size} onRoll={onRoll} />
        </div>

        <Divider />

        <div className={group}>
          {tag('POWER')}
          {POWER_COUNTERS.map((n) => token('power', n, POWER_COLORS[n] ?? '#f59e0b', `+${n}`, `パワーアップ+${n}：クリックして、つけ先のホロメンを選ぶ（ホロメンへドラッグでも）`))}
        </div>
      </div>

      {/* 2段目：最大HPアップ・じゃんけん */}
      <div className={row}>
        <div className={group}>
          {tag('MAXHP')}
          {HP_COUNTERS.map((n) => token('hp', n, HP_COLORS[n] ?? '#22c55e', `+${n}`, `最大HP+${n}：クリックして、つけ先のホロメンを選ぶ（ホロメンへドラッグでも）`))}
        </div>

        <Divider />

        <div className={group}>
          {tag('JANKEN')}
          {hands.map((h) => {
            const picked = jankenMine === h.hand
            return (
              <button
                key={h.hand}
                type="button"
                onClick={() => onJanken(h.hand)}
                title={`じゃんけん：${h.name}（互いが出すと、結果が出ます。出したあとも、変えられます）`}
                aria-label={`じゃんけん ${h.name}`}
                aria-pressed={picked}
                className="grid place-items-center shrink-0 select-none"
                style={{
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #e2e8f0 60%, #cbd5e1 100%)',
                  border: `3px solid ${picked ? '#4ce0e6' : 'rgba(255,255,255,0.92)'}`,
                  boxShadow: picked ? '0 0 0 2px #4ce0e6, 0 3px 8px rgba(0,0,0,0.6)' : '0 3px 8px rgba(0,0,0,0.6)',
                  boxSizing: 'border-box',
                  fontSize: Math.round(size * 0.5),
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                {h.emoji}
              </button>
            )
          })}
          {onLog && (
            <button
              type="button"
              onClick={onLog}
              aria-expanded={logOpen}
              aria-label="プレイログ"
              title="プレイログを開く／閉じる"
              className="grid place-items-center shrink-0 select-none"
              style={{
                width: size,
                height: size,
                marginLeft: 4,
                borderRadius: 10,
                background: logOpen ? '#4ce0e6' : 'rgba(6,18,23,0.92)',
                color: logOpen ? '#04252a' : '#d7eef2',
                border: '3px solid #4ce0e6',
                boxSizing: 'border-box',
                fontSize: Math.max(10, Math.round(size * 0.32)),
                fontWeight: 800,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ログ
            </button>
          )}
        </div>
      </div>

      </div>

      {!compact && <p className="text-[10px] text-[#9fc3ca] xl:text-center leading-snug min-w-0">{acceptRemove ? 'ここへ落とすと、カウンターが外れます' : hint}</p>}
    </section>
  )
}