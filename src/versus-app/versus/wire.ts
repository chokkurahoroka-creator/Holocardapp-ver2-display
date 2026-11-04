// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import type { DeckCard } from '../utils/deckImage'
import { emptyState, initialPrep, initialTurn, mergePrep, normalizePrep, normalizeTurn, swapPrep, swapTurn, type PlayCard, type PlayState, type PrepState, type Side, type TurnState, type ZoneId } from '../utils/playfield'

// ===== 対戦ルームで、盤面をやり取りするための形 =====
// ・盤面は「ホスト側＝me／ゲスト側＝opp」の向きで、ルームに保存する（正本）。ゲストは、画面に出すときだけ、自分と相手を入れ替える
// ・カードは、ID だけを送って、受け取った側が、カードの情報を補う（通信量を、小さくするため）
// ・ホルダー（自分だけの置き場）は、同期しない

// [uid, カードID, フラグ（1: レスト／2: 裏向き／4: 公開中／8: 登場したターン）, ダメージ, パワーアップ, 最大HPアップ]
export type WireCard = [string, number, number, number, number, number?, number?]
export type WireDoc = {
  v: 1
  z: Partial<Record<ZoneId, WireCard[]>>
  su: Record<string, boolean> // 推しスキルを使ったか（キーは、ホスト向きの me:oshi など）
  tn?: TurnState // ターンの状態（ホスト向き）
  pp?: PrepState | null // 対戦の準備の状態（ホスト向き）。無い・null は、準備なし（古い部屋・準備が終わった部屋）
}

export const emptyWire = (): WireDoc => ({ v: 1, z: {}, su: {}, tn: initialTurn(), pp: initialPrep() }) // 新しい部屋は、準備から始まる

export function toWire(state: PlayState, skillUsed: Record<string, boolean>, turn: TurnState = initialTurn(), prep: PrepState | null = null): WireDoc {
  const z: WireDoc['z'] = {}
  for (const id of Object.keys(state) as ZoneId[]) {
    if (id === 'holder' || state[id].length === 0) continue
    z[id] = state[id].map((c) => [c.uid, c.card.id, (c.rested ? 1 : 0) | (c.faceDown ? 2 : 0) | (c.revealed ? 4 : 0) | (c.fresh ? 8 : 0), c.damage ?? 0, c.powerUp ?? 0, c.hpUp ?? 0, c.logSeq ?? 0])
  }
  const su: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(skillUsed)) if (v) su[k] = true
  return { v: 1, z, su, tn: turn, pp: prep }
}

// 盤面に出ているカードのID（不足している情報を、取りに行くため）
export function wireCardIds(doc: WireDoc): number[] {
  const ids = new Set<number>()
  for (const list of Object.values(doc.z)) list?.forEach((c) => ids.add(c[1]))
  return Array.from(ids)
}

export function fromWire(doc: WireDoc, cards: Map<number, DeckCard>): PlayState {
  const state = emptyState()
  for (const id of Object.keys(doc.z) as ZoneId[]) {
    if (!(id in state)) continue
    const out: PlayCard[] = []
    for (const [uid, cardId, flags, damage, powerUp, hpUp, logSeq] of doc.z[id] ?? []) {
      const card = cards.get(cardId)
      if (!card) continue
      out.push({ uid, card, rested: (flags & 1) !== 0, faceDown: (flags & 2) !== 0, damage, powerUp, hpUp: hpUp ?? 0, logSeq: logSeq ? logSeq : undefined, revealed: (flags & 4) !== 0, fresh: (flags & 8) !== 0 })
    }
    state[id] = out
  }
  return state
}

const swapId = (id: string): string => (id.startsWith('me:') ? 'opp:' + id.slice(3) : id.startsWith('opp:') ? 'me:' + id.slice(4) : id)

// 自分と相手を入れ替える（ゲストが見る向きと、正本の向きの、変換。何度やっても、同じ結果で戻る）
export function swapSides(state: PlayState): PlayState {
  const next = emptyState()
  for (const id of Object.keys(state) as ZoneId[]) next[swapId(id) as ZoneId] = state[id]
  return next
}

export function swapSkillKeys(su: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(su)) out[swapId(k)] = v
  return out
}

// ターンの状態（正本の向き）。ゲストの画面に出すときは、自分と相手を入れ替える
export function turnFromWire(doc: WireDoc, guest: boolean): TurnState {
  const t = normalizeTurn(doc.tn)
  return guest ? swapTurn(t) : t
}

// 準備の状態（正本の向き）。ゲストの画面に出すときは、自分と相手を入れ替える
export function prepFromWire(doc: WireDoc, guest: boolean): PrepState | null {
  const p = normalizePrep(doc.pp)
  return guest ? swapPrep(p) : p
}

export const swapZoneId = (id: ZoneId): ZoneId => swapId(id) as ZoneId

// 準備の間に、2人の保存が重なったとき：相手の保存（remote）の上に、自分の側のゾーンだけを重ねて、混ぜる（どちらも、正本の向き）。
// 準備の間は、2人とも、自分の側のカードだけを動かすので、混ぜても、操作は、失われない
export function mergeDocs(remote: WireDoc, mine: WireDoc, mySide: Side): WireDoc {
  const prefix = mySide === 'me' ? 'me:' : 'opp:'
  const z: WireDoc['z'] = {}
  for (const id of new Set([...Object.keys(remote.z), ...Object.keys(mine.z)]) as Set<ZoneId>) {
    const src = id.startsWith(prefix) ? mine.z[id] : remote.z[id]
    if (src && src.length > 0) z[id] = src
  }
  const su: Record<string, boolean> = {}
  for (const [k, v] of Object.entries({ ...remote.su, ...mine.su })) {
    const own = k.startsWith(prefix)
    if (own ? mine.su[k] : remote.su[k]) su[k] = v
  }
  const pp = mergePrep(normalizePrep(remote.pp), normalizePrep(mine.pp), mySide)
  // 準備が終わった側（pp が null）の、ターンの状態を使う
  const tn = normalizePrep(mine.pp) === null || normalizePrep(remote.pp) === null ? (normalizePrep(mine.pp) === null ? mine.tn : remote.tn) : remote.tn
  return { v: 1, z, su, tn, pp }
}

// ===== 相手の画面へ送る出来事（サイコロ・シャッフル・ダウンの演出） =====
export type RemoteEventInput = { kind: 'dice'; n: number } | { kind: 'janken'; hand: number } | { kind: 'fx'; fx: { kind: 'shuffle'; zone: ZoneId } | { kind: 'down' | 'fly'; from: ZoneId; to: ZoneId; card: DeckCard } | { kind: 'attack'; from: ZoneId; to: ZoneId; amount: number } }
export type RemoteEvent = RemoteEventInput & { id: number }

// 自分の画面に出ている状態を、ルームへ保存するときの形、その逆
export type VersusSync = {
  state: PlayState // 画面に出す向き（自分が下側）
  skillUsed: Record<string, boolean>
  turn: TurnState
  prep: PrepState | null // 対戦の準備の状態（画面に出す向き）。null は、準備なし（準備が終わった）
  onChange: (next: PlayState, skills?: Record<string, boolean>, turn?: TurnState, prep?: PrepState | null) => void // prep：渡さないと、そのまま
  onEmit: (ev: RemoteEventInput) => void
  lastEvent: RemoteEvent | null // 相手から届いた、最新の出来事（zone は、受け取った側の向きに直してある）
  roomCode: string
  shareUrl: string
  myName: string // 自分の名前（勝利の表示に使う）
  oppName: string
  peerOnline: boolean
  waiting: boolean // 相手が、まだ入室していない
  onLeave: () => void
}