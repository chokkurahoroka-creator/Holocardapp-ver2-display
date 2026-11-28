// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useSyncExternalStore } from 'react'

// ===== 対戦ルームの効果音 =====
// 音声ファイルは使わず、ブラウザの Web Audio API で、その場で作る（読み込みなし・軽量）。
// 自分の操作も、相手の操作（盤面の変化・相手から届いた出来事）も、同じ場所から鳴らす。
// 画面を一度クリック（タップ）するまでは、ブラウザの決まりで、音が出ない。ミュート・音量は、保存される

export type SoundName =
  | 'move' // カードの移動（手札に引く・ステージに出す・アーカイブに送る など）
  | 'rest' // おやすみ⇄アクティブ
  | 'reveal' // カードの公開
  | 'shuffle' // シャッフル
  | 'fly' // エール・ホロパワーが飛ぶ
  | 'chip' // チップを選んだ
  | 'power' // パワーアップなどのカウンターが変わった
  | 'attack' // アーツの攻撃
  | 'hit' // ダメージを受けた
  | 'down' // ダウン
  | 'bloom' // ブルーム
  | 'cast' // サポートの発動
  | 'dice' // サイコロ
  | 'janken' // じゃんけん
  | 'turn' // ターンチェンジ
  | 'step' // ステップの推移
  | 'skill' // 推しスキル
  | 'win' // 勝ち
  | 'lose' // 負け

const KEY = 'horoka-versus-sound'
type Settings = { enabled: boolean; volume: number }

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null
    return { enabled: raw?.enabled !== false, volume: typeof raw?.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : 0.6 }
  } catch {
    return { enabled: true, volume: 0.6 }
  }
}

let settings: Settings = load()
const listeners = new Set<() => void>()
function update(next: Settings) {
  settings = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 保存できなくても、そのまま続ける */
  }
  if (master) master.gain.value = next.volume
  listeners.forEach((l) => l())
}
export const setSoundEnabled = (enabled: boolean) => update({ ...settings, enabled })
export const setSoundVolume = (volume: number) => update({ ...settings, volume: Math.min(1, Math.max(0, volume)) })

// 画面の部品から使う：ミュート・音量の、いまの設定
export function useSoundSettings(): Settings & { setEnabled: (v: boolean) => void; setVolume: (v: number) => void } {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => settings
  )
  return { ...s, setEnabled: setSoundEnabled, setVolume: setSoundVolume }
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
    master = ctx.createGain()
    master.gain.value = settings.volume
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return ctx
}

// 最初のクリック・タップで、音を出せる状態にする（ブラウザの決まり）
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio()
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

// ---- 音の部品 ----
type Wave = OscillatorType
function tone(c: AudioContext, at: number, freq: number, dur: number, type: Wave, gain: number, toFreq?: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  if (toFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), at + dur)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.012, dur / 3))
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(master!)
  o.start(at)
  o.stop(at + dur + 0.03)
}

function noise(c: AudioContext, at: number, dur: number, gain: number, filter: BiquadFilterType, f0: number, f1?: number, q = 1) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const flt = c.createBiquadFilter()
  flt.type = filter
  flt.Q.value = q
  flt.frequency.setValueAtTime(f0, at)
  if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.01, dur / 3))
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(flt).connect(g).connect(master!)
  src.start(at, Math.random() * 0.5)
  src.stop(at + dur + 0.03)
}

const RECIPES: Record<SoundName, (c: AudioContext, t: number) => void> = {
  move: (c, t) => {
    noise(c, t, 0.05, 0.22, 'bandpass', 1800, 900, 1.2)
    tone(c, t, 230, 0.07, 'sine', 0.16, 130)
  },
  rest: (c, t) => {
    tone(c, t, 190, 0.09, 'triangle', 0.2, 120)
    tone(c, t + 0.07, 250, 0.09, 'triangle', 0.16, 160)
  },
  reveal: (c, t) => {
    tone(c, t, 660, 0.1, 'triangle', 0.16)
    tone(c, t + 0.08, 990, 0.16, 'triangle', 0.16)
  },
  shuffle: (c, t) => {
    for (let i = 0; i < 7; i++) noise(c, t + i * 0.06, 0.07, 0.2, 'bandpass', 2200 + (i % 2) * 600, 1200, 0.9)
  },
  fly: (c, t) => {
    noise(c, t, 0.22, 0.16, 'bandpass', 700, 2400, 1.4)
    tone(c, t + 0.12, 700, 0.1, 'sine', 0.12, 1000)
  },
  chip: (c, t) => {
    tone(c, t, 880, 0.05, 'sine', 0.16)
    tone(c, t + 0.035, 1320, 0.05, 'sine', 0.1)
  },
  power: (c, t) => {
    tone(c, t, 420, 0.18, 'square', 0.07, 840)
    tone(c, t + 0.1, 840, 0.12, 'triangle', 0.12)
  },
  attack: (c, t) => {
    noise(c, t, 0.3, 0.3, 'bandpass', 500, 3000, 1.1)
    tone(c, t, 260, 0.3, 'sawtooth', 0.09, 900)
  },
  hit: (c, t) => {
    noise(c, t, 0.16, 0.42, 'lowpass', 1400, 300)
    tone(c, t, 150, 0.2, 'sawtooth', 0.3, 45)
  },
  down: (c, t) => {
    noise(c, t, 0.2, 0.4, 'lowpass', 1400, 250)
    tone(c, t, 420, 0.6, 'square', 0.12, 55)
    tone(c, t + 0.05, 210, 0.5, 'sawtooth', 0.18, 40)
  },
  bloom: (c, t) => {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, t + i * 0.07, f, 0.28, 'triangle', 0.15))
    noise(c, t, 0.4, 0.06, 'highpass', 5000)
  },
  cast: (c, t) => {
    ;[392, 494, 587].forEach((f) => tone(c, t, f, 0.55, 'sine', 0.13))
    tone(c, t + 0.12, 784, 0.45, 'triangle', 0.1)
  },
  dice: (c, t) => {
    for (let i = 0; i < 9; i++) {
      const at = t + i * 0.065 + Math.random() * 0.02
      noise(c, at, 0.04, 0.2, 'bandpass', 1400 + Math.random() * 1800, undefined, 2)
      tone(c, at, 320 + Math.random() * 260, 0.04, 'square', 0.04)
    }
    tone(c, t + 0.62, 140, 0.1, 'sine', 0.22, 90)
  },
  janken: (c, t) => {
    tone(c, t, 1000, 0.09, 'sine', 0.16)
    tone(c, t + 0.1, 1500, 0.14, 'sine', 0.13)
  },
  turn: (c, t) => {
    tone(c, t, 659, 0.6, 'sine', 0.2)
    tone(c, t, 1318, 0.4, 'sine', 0.06)
    tone(c, t + 0.18, 988, 0.7, 'sine', 0.2)
    tone(c, t + 0.18, 1976, 0.4, 'sine', 0.05)
  },
  step: (c, t) => {
    tone(c, t, 740, 0.12, 'triangle', 0.14)
    tone(c, t + 0.07, 988, 0.14, 'triangle', 0.12)
  },
  skill: (c, t) => {
    tone(c, t, 330, 0.35, 'sawtooth', 0.08, 880)
    ;[880, 1175, 1568].forEach((f, i) => tone(c, t + 0.18 + i * 0.07, f, 0.3, 'sine', 0.1))
  },
  win: (c, t) => {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.14, f, 0.34, 'triangle', 0.2))
    ;[523, 659, 784, 1047].forEach((f) => tone(c, t + 0.6, f, 0.8, 'sine', 0.09))
  },
  lose: (c, t) => {
    ;[392, 349, 311, 262].forEach((f, i) => tone(c, t + i * 0.2, f, 0.4, 'triangle', 0.17))
  },
}

// 同じ音が、連続で鳴りすぎないよう、間隔をあける（盤面を一度に読み込んだときなど）
const MIN_GAP_MS: Partial<Record<SoundName, number>> = { move: 90, rest: 90, reveal: 120, power: 120, hit: 150, fly: 120, shuffle: 400, chip: 60 }
const lastAt: Partial<Record<SoundName, number>> = {}

export function playSound(name: SoundName): void {
  if (!settings.enabled || settings.volume <= 0) return
  const now = performance.now()
  if (now - (lastAt[name] ?? -1e9) < (MIN_GAP_MS[name] ?? 40)) return
  lastAt[name] = now
  const c = audio()
  if (!c || c.state !== 'running') return // まだ、画面を操作していない（ブラウザが、音を許していない）
  try {
    RECIPES[name](c, c.currentTime + 0.01)
  } catch {
    /* 鳴らせなくても、対戦は続けられる */
  }
}

// プレイログの種類から、鳴らす音を決める（盤面の変化から作られるので、自分の操作も、相手の操作も、同じように鳴る）。
// ダメージ・攻撃・シャッフルは、演出（pushFx）の側で鳴らす。ターンチェンジのときは、ステップの音は重ねない
export function soundsForLog(kinds: string[], opts?: { oppOnlyDice?: boolean }): SoundName[] {
  const set = new Set(kinds)
  const out: SoundName[] = []
  if (set.has('turn')) out.push('turn')
  else if (set.has('step')) out.push('step')
  if (set.has('skill')) out.push('skill')
  if (set.has('dice') && !opts?.oppOnlyDice) out.push('dice')
  if (set.has('power')) out.push('power')
  if (set.has('reveal')) out.push('reveal')
  if (set.has('rest')) out.push('rest')
  if (set.has('move')) out.push('move')
  return out.slice(0, 3)
}