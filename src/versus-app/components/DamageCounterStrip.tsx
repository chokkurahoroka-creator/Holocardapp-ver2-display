// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react'
import { createPortal } from 'react-dom'
import type { GhostSpec } from '../hooks/useTouchDrag'
import type { ReactNode } from 'react'
import { playSound, useSoundSettings } from '../utils/sound'
import type { ChipKind, DragItem } from './PlayfieldBoard'

// チップの種類。数値は、チップには書かない：チップをクリック（またはドラッグ）して、つけ先のホロメンを選んだあとに、数値を打ち込む
export const CHIP_INFO: Record<ChipKind, { label: string; color: string; name: string; hint: string }> = {
  damage: { label: 'ダメ', color: '#ef4444', name: 'ダメージ', hint: 'ダメージ' },
  heal: { label: '回復', color: '#34d399', name: '回復', hint: 'ダメージを回復（減らす）' },
  hp: { label: 'HP+', color: '#16a34a', name: '最大HPアップ', hint: '最大HPアップ' },
  power: { label: 'PW+', color: '#f59e0b', name: 'パワーアップ', hint: 'パワーアップ' },
  clear: { label: 'クリア', color: '#94a3b8', name: 'クリア', hint: 'ダメージ・パワーアップ・最大HPアップを、選んでクリア' },
}

type Props = {
  compact: boolean // スマホ：文言を消して、アイコンを小さくする
  onDragStart: (item: DragItem) => void // マウスで、ドラッグを始めた
  onDragEnd: () => void
  onTouchDragStart: (e: ReactTouchEvent, item: DragItem, ghost: GhostSpec) => void // 指で、長押しして、ドラッグを始めた
  onTap: (chip: ChipKind) => void // タップ・クリック：そのチップを選ぶ（つけ先は、そのあと、ステージのホロメンをクリックして選ぶ。選んだあと、数値を打ち込む）
  pending: ChipKind | null // いま選んでいて、つけ先を選ぶのを待っているチップ
  onRoll: (result: number) => void // サイコロの目が出た
  hint: string
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
    playSound('dice') // 振った瞬間に、コロコロと鳴る（結果は、プレイログに残る）
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

const tokenStyle = (color: string, size: number, label: string): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${color} 55%, ${color} 100%)`,
  border: '3px solid rgba(255,255,255,0.92)',
  boxShadow: '0 3px 8px rgba(0,0,0,0.6)',
  boxSizing: 'border-box',
  fontSize: Math.round(size * (label.length >= 3 ? 0.26 : 0.34)),
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
})

function Divider() {
  return <div className="self-stretch xl:w-full w-px xl:h-px bg-[#143844] shrink-0" />
}

// チップ・サイコロ・じゃんけんの置き場。プレイフィールドとホルダーの間に、縦長に置く（狭い画面では、横長）。
// チップをクリックして、ホロメンを選ぶ（ホロメンへドラッグでも）と、数値を打ち込む画面が開く。数値を入れると、そのホロメンに反映される
export function DamageCounterStrip({ compact, pending, onDragStart, onDragEnd, onTouchDragStart, onTap, onRoll, hint, jankenMine, onJanken, onLog, logOpen }: Props) {
  // アイコンの大きさは、すべてそろえる。スマホ（compact）は、全部が1段に収まるよう、画面の幅に合わせて小さくする
  const rootRef = useRef<HTMLElement>(null)
  const [fit, setFit] = useState(34)
  useEffect(() => {
    const el = rootRef.current
    if (!compact || !el) return
    const count = 5 + 1 // 2段に並べる。いちばん長い、上の段のアイコンの数（チップ5個・サイコロ）
    const gap = 4
    const calc = () => {
      if (window.matchMedia('(min-width: 1280px)').matches) {
        setFit(40) // 広い画面では、縦に並べる
        return
      }
      const w = el.clientWidth - 12 - (count + 1) * gap - 2
      setFit(Math.max(26, Math.min(42, Math.floor(w / count)))) // 幅が足りないときは、これより小さくせず、横にスクロールする
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact])
  const size = compact ? fit : 40 // PC：小さくして、場所を取らないようにする

  const token = (chip: ChipKind) => {
    const info = CHIP_INFO[chip]
    const item: DragItem = { kind: 'chip', chip }
    const picked = pending === chip
    return (
      <div
        key={chip}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move' // ドロップ先は dropEffect が 'move' なので、'copy' にすると、ドロップできなくなる
          e.dataTransfer.setData('text/plain', `chip:${chip}`)
          onDragStart(item)
        }}
        onDragEnd={onDragEnd}
        onTouchStart={(e) => onTouchDragStart(e, item, { w: size, h: size, round: true, text: info.label, color: info.color })}
        onClick={() => onTap(chip)}
        onContextMenu={(e) => e.preventDefault()}
        title={`${info.hint}：クリックして、つけ先のホロメンを選ぶ（ホロメンへドラッグでも）。そのあと、数値を打ち込みます`}
        className="cursor-grab select-none flex items-center justify-center text-white font-extrabold shrink-0"
        style={{ ...tokenStyle(info.color, size, info.label), ...(picked ? { outline: '3px solid #4ce0e6', outlineOffset: 2, boxShadow: '0 0 14px #4ce0e6' } : {}) }}
        aria-pressed={picked}
        aria-label={info.name}
      >
        {info.label}
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
      className={`hud-panel flex flex-col items-stretch xl:h-full xl:overflow-y-auto ${compact ? 'p-1.5 gap-1 overflow-x-auto' : 'p-2 gap-3'}`}
      aria-label="チップ置き場"
    >
      <style>{`@keyframes pf-die-roll{0%{transform:rotate(0) scale(1)}25%{transform:rotate(90deg) scale(1.08)}50%{transform:rotate(180deg) scale(1)}75%{transform:rotate(270deg) scale(1.08)}100%{transform:rotate(360deg) scale(1)}}@media (prefers-reduced-motion: reduce){button[aria-label^="サイコロ"]{animation:none!important}}`}</style>

      {/* PC（広い画面）：縦2列にする（左の列：ダメージ・回復・サイコロ・パワーアップ・最大HP／右の列：クリア・じゃんけん）。狭い画面・スマホは、横に2段 */}
      <div className={`flex flex-col xl:flex-row xl:items-start xl:justify-center ${compact ? 'gap-1 xl:gap-1' : 'gap-3'}`}>
        {/* 1段目：ダメージ・回復・サイコロ・パワーアップ・最大HPアップ */}
        <div className={row}>
          <div className={group}>
            {tag('DAMAGE')}
            {token('damage')}
            {token('heal')}
          </div>

          <Divider />

          <div className={`${group} pt-3`}>
            <Die size={size} onRoll={onRoll} />
          </div>

          <Divider />

          <div className={group}>
            {tag('BOOST')}
            {token('power')}
            {token('hp')}
          </div>
        </div>

        {/* 2段目：クリア・じゃんけん */}
        <div className={row}>
          <div className={group}>
            {tag('CLEAR')}
            {token('clear')}
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

      {!compact && <p className="text-[10px] text-[#9fc3ca] xl:text-center leading-snug min-w-0">{hint}</p>}
    </section>
  )
}

// ===== チップの、数値入力・クリア項目の選択（つけ先のホロメンを選んだあとに開く） =====
export type ChipDialogInfo = {
  chip: ChipKind
  cardName: string // つけ先のホロメン
  damage: number // いま乗っているダメージ
  power: number // いま乗っているパワーアップ
  hpUp: number // いま乗っている最大HPアップ
  remain: number | null // いまの残りHP（HPが分からないときは null）
}
export type ChipSubmit = { amount: number } | { clear: { damage: boolean; power: boolean; hp: boolean } }

export function ChipDialog({ info, onSubmit, onCancel }: { info: ChipDialogInfo; onSubmit: (v: ChipSubmit) => void; onCancel: () => void }) {
  const meta = CHIP_INFO[info.chip]
  const [text, setText] = useState('10') // 数値は、10ずつ増減する（直接、打ち込んでもよい）
  const [sel, setSel] = useState({ damage: info.damage > 0, power: info.power > 0, hp: info.hpUp > 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  const amount = Math.floor(Number(text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))))
  const amountOk = Number.isFinite(amount) && amount > 0
  const bump = (d: number) => setText(String(Math.max(10, (Number.isFinite(amount) ? amount : 0) + d))) // 10ずつ増減（いちばん小さいのは、10）
  const clearOk = sel.damage || sel.power || sel.hp
  const submit = () => {
    if (info.chip === 'clear') {
      if (clearOk) onSubmit({ clear: sel })
    } else if (amountOk) onSubmit({ amount })
  }
  const status =
    info.chip === 'heal'
      ? `いまのダメージ：${info.damage}`
      : info.chip === 'damage'
        ? `いまのダメージ：${info.damage}${info.remain !== null ? `（残りHP ${info.remain}）` : ''}`
        : info.chip === 'hp'
          ? `いまの最大HPアップ：+${info.hpUp}`
          : info.chip === 'power'
            ? `いまのパワーアップ：+${info.power}`
            : ''

  const clearRows: { key: 'damage' | 'power' | 'hp'; label: string; value: number }[] = [
    { key: 'damage', label: 'ダメージ', value: info.damage },
    { key: 'power', label: 'パワーアップ', value: info.power },
    { key: 'hp', label: '最大HPアップ', value: info.hpUp },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[96] grid place-items-center bg-black/65 p-3" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${meta.name}の入力`}
        className="w-full rounded-2xl p-4 shadow-2xl"
        style={{ maxWidth: 340, background: '#061217', border: `2px solid ${meta.color}` }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="grid shrink-0 place-items-center rounded-full font-extrabold text-white" style={{ width: 34, height: 34, background: meta.color, fontSize: meta.label.length >= 3 ? 9 : 12, textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>
            {meta.label}
          </span>
          <h3 className="hud-font min-w-0 flex-1 truncate text-sm font-bold text-white">{meta.name}</h3>
        </div>
        <p className="mb-3 truncate text-xs text-[#9fc3ca]" title={info.cardName}>
          つけ先：{info.cardName}
        </p>

        {info.chip === 'clear' ? (
          <ul className="mb-3 flex flex-col gap-1.5">
            {clearRows.map((r) => (
              <li key={r.key}>
                <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${r.value === 0 ? 'opacity-40' : 'cursor-pointer'}`} style={{ borderColor: sel[r.key] ? meta.color : '#143844', background: sel[r.key] ? 'rgba(148,163,184,0.16)' : 'transparent', color: '#d7eef2' }}>
                  <input type="checkbox" disabled={r.value === 0} checked={sel[r.key]} onChange={(e) => setSel((s) => ({ ...s, [r.key]: e.target.checked }))} />
                  <span className="flex-1">{r.label}</span>
                  <span className="hud-mono text-xs text-[#9fc3ca]">{r.key === 'damage' ? r.value : `+${r.value}`}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mb-3">
            {status && <p className="mb-1.5 text-xs text-[#9fc3ca]">{status}</p>}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => bump(-10)} disabled={!Number.isFinite(amount) || amount <= 10} aria-label="10減らす" className="shrink-0 rounded-full border-2 border-white/80 font-extrabold text-white disabled:opacity-35" style={{ width: 52, height: 52, background: `linear-gradient(180deg, ${meta.color}, ${meta.color}b0)`, fontSize: 15, boxShadow: '0 2px 6px rgba(0,0,0,0.55)' }}>
                −10
              </button>
              <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                min={1}
                step={10}
                value={text}
                placeholder="数値"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submit()
                  }
                }}
                aria-label={`${meta.name}の数値`}
                className="min-w-0 flex-1 rounded-lg border-2 bg-[#0b1f27] px-2 py-2 text-center text-xl font-bold text-white outline-none"
                style={{ borderColor: meta.color }}
              />
              <button type="button" onClick={() => bump(10)} aria-label="10増やす" className="shrink-0 rounded-full border-2 border-white/80 font-extrabold text-white" style={{ width: 52, height: 52, background: `linear-gradient(180deg, ${meta.color}, ${meta.color}b0)`, fontSize: 15, boxShadow: '0 2px 6px rgba(0,0,0,0.55)' }}>
                +10
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onCancel}>
            やめる
          </button>
          <button type="button" className="btn-primary flex-1" disabled={info.chip === 'clear' ? !clearOk : !amountOk} onClick={submit}>
            {info.chip === 'clear' ? 'クリア' : '決定'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ===== スマホの、カード操作バーで使う、チップ風のボタン =====
export function ChipButton({ color, children, onClick, disabled, active, label }: { color: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className="shrink-0 select-none whitespace-nowrap font-extrabold text-white"
      style={{
        minHeight: 40,
        minWidth: 52,
        padding: '0 14px',
        borderRadius: 999,
        background: `linear-gradient(180deg, ${color} 0%, ${color}b8 100%)`,
        border: `2px solid ${active ? '#4ce0e6' : 'rgba(255,255,255,0.85)'}`,
        boxShadow: active ? '0 0 0 2px #4ce0e6, 0 2px 6px rgba(0,0,0,0.55)' : '0 2px 6px rgba(0,0,0,0.55)',
        fontSize: 13,
        textShadow: '0 1px 2px rgba(0,0,0,0.75)',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  )
}

// ダメージ・パワー・最大HPの、1行分：名前と、いまの数値の札、そして、増減のチップ（10ずつ）
export function CounterRow({ color, name, value, prefix, onMinus, onPlus, onClear }: { color: string; name: string; value: number; prefix?: string; onMinus: () => void; onPlus: () => void; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-full px-3" style={{ minWidth: 112, minHeight: 40, background: `${color}26`, border: `2px solid ${color}` }}>
        <span className="text-[11px] font-bold text-[#d7eef2]">{name}</span>
        <span className="hud-mono text-sm font-extrabold text-white">
          {prefix ?? ''}
          {value}
        </span>
      </div>
      <ChipButton color={color} onClick={onMinus} disabled={value === 0} label={`${name}を10減らす`}>
        −10
      </ChipButton>
      <ChipButton color={color} onClick={onPlus} label={`${name}を10増やす`}>
        +10
      </ChipButton>
      {onClear && (
        <ChipButton color="#64748b" onClick={onClear} disabled={value === 0} label={`${name}をクリア`}>
          クリア
        </ChipButton>
      )}
    </div>
  )
}

// ===== 効果音のボタン（トップメニュー用） =====
export function SoundControl({ compact, pill }: { compact?: boolean; pill?: boolean }) {
  const sound = useSoundSettings()
  const toggle = () => {
    sound.setEnabled(!sound.enabled)
    if (!sound.enabled) window.setTimeout(() => playSound('chip'), 0) // 入れたときに、試しに1回鳴る
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={sound.enabled}
        aria-label="効果音"
        title={sound.enabled ? '効果音：オン（クリックでミュート）' : '効果音：ミュート中（クリックでオン）'}
        className={pill ? 'inline-flex items-center gap-1 rounded-full border border-[#4ce0e6]/60 bg-[#061217]/90 px-2.5 py-1.5 text-[11px] font-bold text-[#d7eef2] shadow-lg' : 'inline-flex items-center gap-1 text-[#d7eef2]'}
      >
        <span aria-hidden="true">{sound.enabled ? '🔊' : '🔇'}</span>
        {!compact && <span>{sound.enabled ? '効果音' : 'ミュート中'}</span>}
      </button>
      {!compact && sound.enabled && (
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(sound.volume * 100)}
          onChange={(e) => sound.setVolume(Number(e.target.value) / 100)}
          onPointerUp={() => playSound('chip')}
          aria-label="効果音の音量"
          title={`効果音の音量：${Math.round(sound.volume * 100)}%`}
          className="w-16 accent-[#4ce0e6]"
        />
      )}
    </span>
  )
}