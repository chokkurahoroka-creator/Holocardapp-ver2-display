// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import type { DeckCard, DeckRecipe } from './deckImage'

// ===== プレイフィールド（カードの擬似プレイ）の、盤面の定義とカードの移動処理 =====

export type Side = 'me' | 'opp' // 自分（下側）／相手（上側。盤面ごと上下を反転して表示）

export const ZONE_KEYS = ['hand', 'back1', 'back2', 'back3', 'back4', 'back5', 'collab', 'center', 'oshi', 'life', 'yellDeck', 'deck', 'archive', 'power', 'handHolder', 'log'] as const
export type ZoneKey = (typeof ZONE_KEYS)[number]
export type ZoneId = `${Side}:${ZoneKey}` | 'holder' // holder は、使うカードを置いておくホルダー

export type PlayCard = {
  uid: string // 盤面の上でカードを区別するID（同じカードが複数枚あっても、1枚ずつ別のID）
  card: DeckCard
  rested: boolean // レスト（横向き）
  faceDown: boolean // 裏向き
  damage: number // ダメージ（ダメージカウンターの合計。枠のホロメンだけが持つ。枠を出ると0に戻る）
  powerUp: number // パワーアップ（パワーアップカウンターの合計。ダメージと同じく、枠を出ると0に戻る）
  hpUp?: number // 最大HPアップ（最大HPを増やすカウンターの合計。ダメージ・パワーアップと同じく、枠を出ると0に戻る）
  logSeq?: number // ログに置いた順番（ログの中を、置いた順に、左から右へ並べる）
  fresh?: boolean // 登場したターン（手札・デッキ・アーカイブからステージに出したホロメン。黄色の警告マークを出す。相手のターンチェンジで消える）
  revealed?: boolean // 公開中（対戦中、手札・手札横のホルダーのカードを、相手に見せる。その場所を出ると、非公開に戻る）
}

export type PlayState = Record<ZoneId, PlayCard[]>

export type ZoneKind = 'slot' | 'pile' | 'life' | 'hand'

export type ZoneDef = {
  key: ZoneKey
  label: string
  kind: ZoneKind
  x: number
  y: number
  w: number
  h: number
  color: string
  landscape?: boolean // 横向きに置くゾーン（パワー）
  labelBelow?: boolean // 名前を、ゾーンの下に出す
}

// 盤面の大きさ（論理サイズ。画面の幅に合わせて、縮小して表示する）
export const HALF_W = 1520
export const HALF_H = 1005
// 2人のステージの間に、ログ（そのターンに使ったカードの置き場）と、ターン表示を置く。
// ログは、各自の側のゾーン（y が負の値＝自分の側の、すぐ手前）に置くので、相手の分は、反対向きに見える
export const LOG_LABEL_H = 34 // ステージの上の、小さな名前（Center・Collabo など）の分の高さ
export const LOG_PAD = 8
export const LOG_FRAME_H = 210 // ログの枠（自分と相手で、ひとつの枠）の高さ
export const HALF_GAP = 2 * (LOG_LABEL_H + LOG_PAD) + LOG_FRAME_H
// 2人の間の帯の、横の並び：左の端に相手のターン表示、右の端に自分のターン表示（どちらも、ライフの枠と同じ幅）。その間が、ログの枠
export const SIDE_PANEL_X = 18
export const SIDE_PANEL_W = 202
export const LOG_X = SIDE_PANEL_X + SIDE_PANEL_W + 12
export const LOG_W = HALF_W - 2 * LOG_X
export const MAT_H = HALF_H * 2 + HALF_GAP

const BACK_PITCH = 209

// 自分側（下側）の配置。相手側は、同じ配置を180度回転して、上側に置く
export const ZONES: ZoneDef[] = [
  { key: 'life', label: 'ライフ', kind: 'life', x: 18, y: 0, w: 202, h: 430, color: '#9fe3ee' },
  { key: 'yellDeck', label: 'エールデッキ', kind: 'pile', x: 18, y: 437, w: 202, h: 277, color: '#9fe3ee' },
  ...[0, 1, 2, 3, 4].map(
    (i): ZoneDef => ({ key: `back${i + 1}` as ZoneKey, label: `バック${i + 1}`, kind: 'slot', x: 243 + BACK_PITCH * i, y: 437, w: 203, h: 277, color: '#b3b3b3' })
  ),
  { key: 'collab', label: 'コラボ', kind: 'slot', x: 289, y: 0, w: 268, h: 370, color: '#ff7066', labelBelow: true },
  { key: 'center', label: 'センター', kind: 'slot', x: 626, y: 0, w: 268, h: 370, color: '#90ff9b', labelBelow: true },
  { key: 'oshi', label: '推し', kind: 'slot', x: 963, y: 0, w: 268, h: 370, color: '#00f0ff', labelBelow: true },
  { key: 'power', label: 'パワー', kind: 'pile', x: 1300, y: 57, w: 186, h: 135, color: '#ff9ee8', landscape: true }, // 幅は、デッキに合わせる（デッキのすぐ上）
  { key: 'deck', label: 'デッキ', kind: 'pile', x: 1300, y: 200, w: 186, h: 255, color: '#e0e0e0' },
  { key: 'archive', label: 'アーカイブ', kind: 'pile', x: 1300, y: 462, w: 186, h: 252, color: '#9a9a9a' },
  // ログ：そのターンに使ったカードの置き場。ステージの間に、自分の側の分と、相手の側の分（反対向き）が並ぶ
  // （盤面には、2人でひとつの枠として、帯の中央に出す。ここの位置は、使わない）
  { key: 'log', label: 'SUPPORT', kind: 'hand', x: 0, y: 0, w: 0, h: 0, color: '#7dd3fc' },
  // 手札とホルダーの幅は、ホルダーのカードの枚数に応じて変わる（handRowLayout）。ここは、ホルダーが空のときの幅
  { key: 'hand', label: '手札', kind: 'hand', x: 110, y: 785, w: 1145, h: 210, color: '#ffffff' },
  // 手札の右側のホルダー（その側で使うカードを、手札とは別に置いておく場所）
  { key: 'handHolder', label: 'ホルダー', kind: 'hand', x: 1270, y: 785, w: 240, h: 210, color: '#ffd76a' },
]

// 手札とホルダーは、同じ段に並ぶ。ホルダーのカードが増えたら、ホルダーを右から左へ伸ばして、手札を短くする
const ROW_LEFT = 110
const ROW_RIGHT = 1510
const ROW_GAP = 15
export function handRowLayout(holderCount: number): { hand: { x: number; w: number }; holder: { x: number; w: number } } {
  const holderW = Math.max(240, Math.min(625, 40 + holderCount * 150)) // 1枚あたり150。手札が短くなりすぎないよう、上限あり
  const holderX = ROW_RIGHT - holderW
  return { hand: { x: ROW_LEFT, w: holderX - ROW_GAP - ROW_LEFT }, holder: { x: holderX, w: holderW } }
}

export const ZONE_BY_KEY = new Map<ZoneKey, ZoneDef>(ZONES.map((z) => [z.key, z]))

export function zoneId(side: Side, key: ZoneKey): ZoneId {
  return `${side}:${key}`
}

// ゾーンIDから、側と種類を取り出す（holder は null）
export function parseZone(id: ZoneId): { side: Side; key: ZoneKey } | null {
  if (id === 'holder') return null
  const [side, key] = id.split(':') as [Side, ZoneKey]
  return { side, key }
}

export function zoneLabel(id: ZoneId): string {
  const p = parseZone(id)
  if (!p) return 'ホルダー'
  return `${p.side === 'me' ? '自分' : '相手'}の${ZONE_BY_KEY.get(p.key)?.label ?? ''}`
}

// 裏向きで置くゾーン
function defaultFaceDown(id: ZoneId): boolean {
  const p = parseZone(id)
  return !!p && (p.key === 'deck' || p.key === 'yellDeck' || p.key === 'life' || p.key === 'power')
}

// カードを重ねて置く枠（推し・センター・コラボ・バックステージ）
export function isSlotZone(id: ZoneId): boolean {
  const p = parseZone(id)
  return !!p && ZONE_BY_KEY.get(p.key)?.kind === 'slot'
}

export function emptyState(): PlayState {
  const s = { holder: [] } as unknown as PlayState
  ;(['me', 'opp'] as const).forEach((side) => ZONE_KEYS.forEach((k) => (s[zoneId(side, k)] = [])))
  return s
}

let uidCounter = 0
export function newUid(): string {
  uidCounter += 1
  return `${Date.now().toString(36)}-${uidCounter}-${Math.random().toString(36).slice(2, 6)}`
}

export function makePlayCard(card: DeckCard, faceDown = false): PlayCard {
  return { uid: newUid(), card, rested: false, faceDown, damage: 0, powerUp: 0 }
}

// カードの種類の判定。枠に重なったカードの役割（ホロメン／サポート／エール）を、カードの種類で見分ける
export const isYellCard = (c: DeckCard): boolean => (c.card_type ?? '').startsWith('エール')
export const isSupportCard = (c: DeckCard): boolean => (c.card_type ?? '').startsWith('サポート')
export const isHolomenCard = (c: DeckCard): boolean => !isYellCard(c) && !isSupportCard(c)

// 枠（推し・センター・コラボ・バックステージ）の中身を、ひとまとまり（ユニット）として見たときの構成。
//   holomen : ホロメン（下から、元のカード → ブルームしたカードの順。いちばん上が、表に見えるカード）
//   supports: つけているサポート（ファン・マスコット・ツールなど）
//   yells   : つけているエール
export type UnitParts = { holomen: PlayCard[]; supports: PlayCard[]; yells: PlayCard[]; top: PlayCard | undefined }

export function unitParts(cards: PlayCard[]): UnitParts {
  const holomen = cards.filter((c) => isHolomenCard(c.card))
  const supports = cards.filter((c) => isSupportCard(c.card))
  const yells = cards.filter((c) => isYellCard(c.card))
  return { holomen, supports, yells, top: holomen[holomen.length - 1] ?? supports[supports.length - 1] ?? yells[yells.length - 1] }
}

// アーカイブの表示用：カードと、エールを分ける（エールは、別のスタックとして表示する）
export function archiveSplit(cards: PlayCard[]): { main: PlayCard[]; yells: PlayCard[] } {
  return { main: cards.filter((c) => !isYellCard(c.card)), yells: cards.filter((c) => isYellCard(c.card)) }
}

export function findCard(state: PlayState, uid: string): { zone: ZoneId; index: number } | null {
  for (const zone of Object.keys(state) as ZoneId[]) {
    const index = state[zone].findIndex((c) => c.uid === uid)
    if (index !== -1) return { zone, index }
  }
  return null
}

// 置く位置を決めて挿入する。枠では、ホロメン（ブルーム）・サポート・エールを、順に重ねる（役割は、カードの種類で見分ける）
function insertInto(list: PlayCard[], card: PlayCard, to: ZoneId, index?: number): PlayCard[] {
  if (isSlotZone(to)) return [...list, card]
  if (index === undefined || index < 0 || index > list.length) return [...list, card]
  return [...list.slice(0, index), card, ...list.slice(index)]
}

// すでに盤面・ホルダーにあるカードを、別のゾーンへ移す。index は、並べ替え（手札など）で、挿入したい位置
export function moveCard(state: PlayState, uid: string, to: ZoneId, index?: number): PlayState {
  const loc = findCard(state, uid)
  if (!loc) return state
  if (slotBlocked(state, to, loc.zone)) return state // バックとコラボは、合わせて5枚まで
  const card = state[loc.zone][loc.index]!
  const sameZone = loc.zone === to
  const remaining = state[loc.zone].filter((_, i) => i !== loc.index)
  const adjusted = sameZone && index !== undefined && loc.index < index ? index - 1 : index
  const target = sameZone ? remaining : state[to]
  // 枠に重ねるときは、その枠のレスト状態（横向きかどうか）に合わせる
  const restedOnTarget = !sameZone && isSlotZone(to) && target.length > 0 ? target.some((c) => c.rested) : false
  // ダメージは、枠の中にいるあいだだけ持つ（枠から出る＝アーカイブ・手札などへ移ると、0に戻る）
  const keepDamage = sameZone || (isSlotZone(to) && isSlotZone(loc.zone))
  // 手札・ホルダー・デッキ・アーカイブから、ステージ（推し以外の枠）に出したホロメンは、登場したターンの印をつける
  const fromKey = parseZone(loc.zone)?.key
  const toKey = parseZone(to)?.key
  const entersStage = !sameZone && isSlotZone(to) && toKey !== 'oshi' && isHolomenCard(card.card) && !isOshiCard(card.card) && (fromKey === 'hand' || fromKey === 'handHolder' || fromKey === 'deck' || fromKey === 'archive')
  const moved: PlayCard = { ...card, fresh: entersStage ? true : keepDamage ? card.fresh === true : false, faceDown: sameZone ? card.faceDown : defaultFaceDown(to), rested: sameZone ? card.rested : restedOnTarget, damage: keepDamage ? (card.damage ?? 0) : 0, powerUp: keepDamage ? (card.powerUp ?? 0) : 0, hpUp: keepDamage ? (card.hpUp ?? 0) : 0, revealed: sameZone ? card.revealed === true : false, logSeq: parseZone(to)?.key === 'log' ? (sameZone ? card.logSeq : nextLogSeq(state)) : undefined }
  return { ...state, [loc.zone]: remaining, [to]: insertInto(target, moved, to, adjusted) }
}

// 検索結果・デッキなどから、新しいカードを作って置く
export function addNewCard(state: PlayState, card: DeckCard, to: ZoneId, index?: number): PlayState {
  if (slotBlocked(state, to, null)) return state // バックとコラボは、合わせて5枚まで
  const pc = makePlayCard(card, defaultFaceDown(to))
  if (parseZone(to)?.key === 'log') pc.logSeq = nextLogSeq(state)
  return { ...state, [to]: insertInto(state[to], pc, to, index) }
}

// 枠の中身（ホロメン・ブルーム・サポート・エール）を、ひとまとめにして、別のゾーンへ移す。
//   移動先が空の枠: そのまま移る（レストの状態も、そのまま）
//   移動先がカードの入っている枠: 中身を入れ替える（バックステージとセンターの入れ替えなど）
//   枠以外（アーカイブ・手札・ホルダーなど）: 1枚ずつ移る。アーカイブでは、エールが別のスタックとして表示される
// index が 0 のときは、移動先の一番下（デッキの一番下など）に入れる。指定しないと、一番上に入る
export function moveUnit(state: PlayState, from: ZoneId, to: ZoneId, index?: number): PlayState {
  if (from === to || !isSlotZone(from) || state[from].length === 0) return state
  if (slotBlocked(state, to, from)) return state // バックとコラボは、合わせて5枚まで
  if (isSlotZone(to)) {
    return { ...state, [from]: state[to], [to]: state[from] }
  }
  let next = state
  if (index === 0) {
    // 一番下に入れるときは、上のカードから順に下へ入れて、元の重なりの順を保つ
    for (const c of [...state[from]].reverse()) next = moveCard(next, c.uid, to, 0)
    return next
  }
  for (const c of state[from]) next = moveCard(next, c.uid, to, index)
  return next
}

// 枠の中身全体を、レスト（横向き）にする／戻す。枠にあるカードは、すべて同じ向きにそろえる
export function toggleUnitRest(state: PlayState, zone: ZoneId): PlayState {
  const parts = unitParts(state[zone])
  if (!parts.top) return state
  const rested = !parts.top.rested
  return { ...state, [zone]: state[zone].map((c) => ({ ...c, rested })) }
}

// エールデッキの上から1枚を、枠のカードにつける
export function attachYellFromDeck(state: PlayState, side: Side, slot: ZoneId): PlayState {
  const deck = state[zoneId(side, 'yellDeck')]
  const top = deck[deck.length - 1]
  return top ? moveCard(state, top.uid, slot) : state
}

// デッキの上から、n枚を手札に引く（足りなければ、引ける分だけ）
export function drawCards(state: PlayState, side: Side, n: number): PlayState {
  let next = state
  for (let i = 0; i < n; i++) {
    const after = drawCard(next, side)
    if (after === next) break
    next = after
  }
  return next
}

// ===== ダメージ・HP =====

// 推しホロメンのカードか（推しは、ダメージ・HPの対象外。ライフで管理する）
export const isOshiCard = (c: DeckCard): boolean => (c.card_type ?? '').includes('推し')

// ダメージカウンターを置けるゾーンか（センター・コラボ・バックステージで、ホロメンがいる枠）
export function isDamageableZone(state: PlayState, id: ZoneId): boolean {
  const p = parseZone(id)
  if (!p || p.key === 'oshi' || !isSlotZone(id)) return false
  return unitParts(state[id]).holomen.some((c) => !isOshiCard(c.card))
}

// 枠のホロメン（ブルームの重なり全体）に乗っているダメージの合計
export function unitDamage(cards: PlayCard[]): number {
  return unitParts(cards).holomen.reduce((n, c) => n + (c.damage ?? 0), 0)
}

// 枠のダメージを増やす／減らす。増やすときは、いちばん上のホロメン（表に見えているカード）に乗せる。
// ブルームしても、下のホロメンに乗っているダメージは、そのまま引き継がれる（合計で数える）
type CounterField = 'damage' | 'powerUp' | 'hpUp'

function addCounter(state: PlayState, zone: ZoneId, delta: number, field: CounterField): PlayState {
  if (delta === 0 || !isDamageableZone(state, zone)) return state
  const cards = state[zone]
  if (delta > 0) {
    const topUid = unitParts(cards).top!.uid
    return { ...state, [zone]: cards.map((c) => (c.uid === topUid ? { ...c, [field]: (c[field] ?? 0) + delta } : c)) }
  }
  // 減らすときは、上のホロメンから順に取り除く
  let rest = -delta
  const list = cards.map((c) => ({ ...c }))
  for (let i = list.length - 1; i >= 0 && rest > 0; i--) {
    const c = list[i]!
    if (!isHolomenCard(c.card)) continue
    const cut = Math.min(c[field] ?? 0, rest)
    c[field] = (c[field] ?? 0) - cut
    rest -= cut
  }
  return { ...state, [zone]: list }
}

export const addDamage = (state: PlayState, zone: ZoneId, delta: number): PlayState => addCounter(state, zone, delta, 'damage')

export function clearDamage(state: PlayState, zone: ZoneId): PlayState {
  if (!isSlotZone(zone) || unitDamage(state[zone]) === 0) return state
  return { ...state, [zone]: state[zone].map((c) => ({ ...c, damage: 0 })) }
}

// ===== 最大HPアップ =====

// 枠のホロメンに乗っている、最大HPアップの合計
export function unitHpUp(cards: PlayCard[]): number {
  return unitParts(cards).holomen.reduce((n, c) => n + (c.hpUp ?? 0), 0)
}

export const addHpUp = (state: PlayState, zone: ZoneId, delta: number): PlayState => addCounter(state, zone, delta, 'hpUp')

export function clearHpUp(state: PlayState, zone: ZoneId): PlayState {
  if (!isSlotZone(zone) || unitHpUp(state[zone]) === 0) return state
  return { ...state, [zone]: state[zone].map((c) => ({ ...c, hpUp: 0 })) }
}

// ===== パワーアップカウンター =====

// 枠のホロメンに乗っているパワーアップの合計
export function unitPower(cards: PlayCard[]): number {
  return unitParts(cards).holomen.reduce((n, c) => n + (c.powerUp ?? 0), 0)
}

export const addPower = (state: PlayState, zone: ZoneId, delta: number): PlayState => addCounter(state, zone, delta, 'powerUp')

export function clearPower(state: PlayState, zone: ZoneId): PlayState {
  if (!isSlotZone(zone) || unitPower(state[zone]) === 0) return state
  return { ...state, [zone]: state[zone].map((c) => ({ ...c, powerUp: 0 })) }
}

// ダメージを与える。ダメージの合計が、いちばん上のホロメンのHP以上になったら、枠の中身ごとアーカイブへ送る。
// hpOf が null を返すカード（HPが分からない）は、アーカイブへ送らない
export function applyDamage(state: PlayState, zone: ZoneId, amount: number, hpOf: (card: DeckCard) => number | null): { state: PlayState; defeated: PlayCard | null } {
  const damaged = addDamage(state, zone, amount)
  if (damaged === state || amount <= 0) return { state: damaged, defeated: null }
  const parts = unitParts(damaged[zone])
  const top = parts.top
  const p = parseZone(zone)
  if (!top || !p) return { state: damaged, defeated: null }
  const hp = hpOf(top.card)
  // 最大HPは、カードのHPに、最大HPアップを足した値
  if (hp === null || hp <= 0 || unitDamage(damaged[zone]) < hp + unitHpUp(damaged[zone])) return { state: damaged, defeated: null }
  return { state: moveUnit(damaged, zone, zoneId(p.side, 'archive')), defeated: top }
}

// ===== デッキに戻す =====

// 「全てデッキに戻す」で、戻す対象のゾーン（手札・アーカイブ・ステージだけ。ライフ・パワー・ホルダー・エールデッキは、対象外）
const RETURN_TO_DECK_KEYS: ZoneKey[] = ['hand', 'back1', 'back2', 'back3', 'back4', 'back5', 'collab', 'center', 'archive']

// 戻す対象のカード（推しホロメンは、推し枠にあるものとして動かさない。エールは、エールデッキに影響しないよう、そのまま残す）
function returnableCards(state: PlayState, side: Side): PlayCard[] {
  return RETURN_TO_DECK_KEYS.flatMap((k) => state[zoneId(side, k)]).filter((c) => !isOshiCard(c.card) && !isYellCard(c.card))
}

export function countReturnableToDeck(state: PlayState, side: Side): number {
  return returnableCards(state, side).length
}

// 手札・アーカイブ・ステージのカードを、デッキに戻す。エールデッキには、影響しない（エールのカードは、動かさない）。シャッフルはしない
export function returnAllToDeck(state: PlayState, side: Side): PlayState {
  const deck = zoneId(side, 'deck')
  let next = state
  for (const c of returnableCards(state, side)) next = moveCard(next, c.uid, deck)
  return next
}

// 手札のカードを、すべてデッキに戻す（シャッフルはしない）。戻す枚数を返すために、先に数える関数も用意する
export function countHand(state: PlayState, side: Side): number {
  return state[zoneId(side, 'hand')].length
}
export function returnHandToDeck(state: PlayState, side: Side): PlayState {
  const deck = zoneId(side, 'deck')
  let next = state
  for (const c of state[zoneId(side, 'hand')]) next = moveCard(next, c.uid, deck)
  return next
}

// 指定した側の、公開中のカードを、すべて非公開に戻す（公開中のカードがなければ、同じ盤面を返す）
export function hideRevealed(state: PlayState, side: Side): PlayState {
  let next: PlayState | null = null
  for (const z of Object.keys(state) as ZoneId[]) {
    if (parseZone(z)?.side !== side || !state[z].some((c) => c.revealed)) continue
    next ??= { ...state }
    next[z] = state[z].map((c) => (c.revealed ? { ...c, revealed: false } : c))
  }
  return next ?? state
}

// ゾーンのカードを、比べる関数の順に並べ替える（同じ順位のカードは、今の順のまま）。手札の並び替えに使う
export function sortZone(state: PlayState, zone: ZoneId, compare: (a: DeckCard, b: DeckCard) => number): PlayState {
  const sorted = [...state[zone]].sort((a, b) => compare(a.card, b.card))
  return { ...state, [zone]: sorted }
}

export function updateCard(state: PlayState, uid: string, patch: Partial<Pick<PlayCard, 'rested' | 'faceDown' | 'revealed'>>): PlayState {
  const loc = findCard(state, uid)
  if (!loc) return state
  return { ...state, [loc.zone]: state[loc.zone].map((c, i) => (i === loc.index ? { ...c, ...patch } : c)) }
}

// エールデッキの上から、n枚を、ライフに置く（裏向き）。エールデッキの枚数が足りないときは、ある分だけ
export function dealLife(state: PlayState, side: Side, n: number): PlayState {
  const yellDeck = zoneId(side, 'yellDeck')
  const life = zoneId(side, 'life')
  let next = state
  const count = Math.min(Math.max(0, Math.floor(n)), next[yellDeck].length)
  for (let i = 0; i < count; i++) {
    const top = next[yellDeck][next[yellDeck].length - 1]!
    next = moveCard(next, top.uid, life)
  }
  return next
}

// エールデッキの外にある、その側のエール（手札・ライフ・アーカイブ・ステージについているものなど）
function yellsOutsideYellDeck(state: PlayState, side: Side): PlayCard[] {
  return ZONES.filter((z) => z.key !== 'yellDeck').flatMap((z) => state[zoneId(side, z.key)]).filter((c) => isYellCard(c.card))
}

export function countYellsOutsideYellDeck(state: PlayState, side: Side): number {
  return yellsOutsideYellDeck(state, side).length
}

// その側の、全てのエールを、エールデッキに戻す（シャッフルは、しない）
export function returnAllYellsToYellDeck(state: PlayState, side: Side): PlayState {
  const yellDeck = zoneId(side, 'yellDeck')
  let next = state
  for (const c of yellsOutsideYellDeck(state, side)) next = moveCard(next, c.uid, yellDeck)
  return next
}

export function shuffleZone(state: PlayState, zone: ZoneId, rnd: () => number = Math.random): PlayState {
  const list = [...state[zone]]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[list[i], list[j]] = [list[j]!, list[i]!]
  }
  return { ...state, [zone]: list }
}

// デッキの上（末尾）から1枚、手札に引く
export function drawCard(state: PlayState, side: Side): PlayState {
  const deck = state[zoneId(side, 'deck')]
  const top = deck[deck.length - 1]
  return top ? moveCard(state, top.uid, zoneId(side, 'hand')) : state
}

// 保存したデッキを、ゲームを始める形に配置する：推し→推し枠、エール→エールデッキ、メインデッキ→デッキ（どちらもシャッフル、裏向き）
// lifeCount を指定すると、シャッフルしたエールデッキの上から、その枚数を、ライフに裏向きで置く（推しホロメンのライフの数）
export function setupFromRecipe(state: PlayState, side: Side, recipe: DeckRecipe, rnd: () => number = Math.random, lifeCount?: number): PlayState {
  let next = { ...state }
  const put = (key: ZoneKey, cards: DeckCard[]) => {
    next = { ...next, [zoneId(side, key)]: cards.map((c) => makePlayCard(c, defaultFaceDown(zoneId(side, key)))) }
  }
  const expand = (entries: DeckRecipe['main']) => entries.flatMap((e) => Array.from({ length: e.count }, () => e.card))
  put('oshi', recipe.oshi ? [recipe.oshi] : [])
  put('yellDeck', expand(recipe.yells))
  put('deck', expand(recipe.main))
  next = shuffleZone(next, zoneId(side, 'yellDeck'), rnd)
  next = shuffleZone(next, zoneId(side, 'deck'), rnd)
  if (lifeCount !== undefined) next = dealLife({ ...next, [zoneId(side, 'life')]: [] }, side, lifeCount)
  return next
}

// 保存したデッキの全カードを、ホルダーに追加する
export function addRecipeToHolder(state: PlayState, recipe: DeckRecipe): PlayState {
  const cards: DeckCard[] = [...(recipe.oshi ? [recipe.oshi] : []), ...recipe.yells.flatMap((e) => Array.from({ length: e.count }, () => e.card)), ...recipe.main.flatMap((e) => Array.from({ length: e.count }, () => e.card))]
  return { ...state, holder: [...state.holder, ...cards.map((c) => makePlayCard(c))] }
}

// ===== バックとコラボの枚数（合わせて5枚まで）、バックの左詰め =====

const BACK_KEYS: ZoneKey[] = ['back1', 'back2', 'back3', 'back4', 'back5']
const COUNTED_KEYS: ZoneKey[] = ['collab', ...BACK_KEYS]
export const STAGE_LIMIT = 5

function nextLogSeq(state: PlayState): number {
  return 1 + Math.max(0, ...(['me', 'opp'] as const).flatMap((s) => state[zoneId(s, 'log')].map((c) => c.logSeq ?? 0)))
}

// その側の、コラボとバックにいる枠の数
export function stageCount(state: PlayState, side: Side): number {
  return COUNTED_KEYS.filter((k) => state[zoneId(side, k)].length > 0).length
}

// その枠が、いま、使えないか。バックとコラボは、合わせて5枚まで：5枚になったら、空いている枠には、新しく入れられない。
// from：動かすカード（枠）の、いまの場所。コラボ・バックの間で動かすだけなら、枚数は増えないので、入れられる（from を省くと、見た目のための判定）
export function slotBlocked(state: PlayState, zone: ZoneId, from?: ZoneId | null): boolean {
  const p = parseZone(zone)
  if (!p || !COUNTED_KEYS.includes(p.key)) return false
  if (state[zone].length > 0) return false
  const fp = from ? parseZone(from) : null
  if (fp && fp.side === p.side && COUNTED_KEYS.includes(fp.key)) return false
  return stageCount(state, p.side) >= STAGE_LIMIT
}

// バックのカードを、左に詰める（空いた枠ができたら、右にいるカードが、左へ移る）
export function compactBacks(state: PlayState): PlayState {
  let next = state
  for (const side of ['me', 'opp'] as const) {
    const ids = BACK_KEYS.map((k) => zoneId(side, k))
    const units = ids.map((id) => next[id]).filter((u) => u.length > 0)
    const changed = ids.some((id, i) => (units[i] ?? []) !== next[id] && !((units[i] ?? []).length === 0 && next[id].length === 0))
    if (!changed) continue
    const copy = { ...next }
    ids.forEach((id, i) => {
      copy[id] = units[i] ?? []
    })
    next = copy
  }
  return next
}

// 推しスキルの、必要なホロパワーの数（「2」「-2」「２」などから、数字だけを取り出す）
export function skillCost(raw: string | null | undefined): number {
  const half = String(raw ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  return Number(half.replace(/[^\d]/g, '')) || 0
}

// ===== アーツのダメージ計算 =====

// 「50」「50+」「５０」「+50」などの文字列から、数字だけを取り出す（数字が無ければ 0）
export function parseDamage(raw: string | null | undefined): number {
  const half = String(raw ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  const m = /\d+/.exec(half)
  return m ? Number(m[0]) : 0
}

export type ArtDamageInput = { damage: string; specialAttackColor: string; specialAttackDamage: string }
export type ArtDamageResult = { base: number; power: number; special: number; total: number }

// アーツのダメージ ＝ アーツの数値 ＋ 攻撃するホロメンに乗っているパワーアップ ＋ （相手の色が特攻対象色なら）特攻ダメージ。
// targetColors は、ダメージを受けるホロメンの色（「赤」「青」など。多色は、複数）
export function calcArtDamage(art: ArtDamageInput, power: number, targetColors: string[]): ArtDamageResult {
  const base = parseDamage(art.damage)
  const special = art.specialAttackColor && targetColors.includes(art.specialAttackColor) ? parseDamage(art.specialAttackDamage) : 0
  return { base, power, special, total: base + power + special }
}

// 攻撃できるホロメンがいる、その側のゾーン（アーツのダメージを与える相手の、コラボ・センター・バック）
export function attackTargetZones(state: PlayState, side: Side): ZoneId[] {
  return (['collab', 'center', 'back1', 'back2', 'back3', 'back4', 'back5'] as const).map((k) => zoneId(side, k)).filter((id) => isDamageableZone(state, id))
}

// エールステップで、エールをつけられる、その側の枠（センター・コラボ・バックのホロメン）
export function yellTargetZones(state: PlayState, side: Side): ZoneId[] {
  return attackTargetZones(state, side)
}

// ===== ターン =====

// ターンの中のステップ：draw（ドロー）→ yell（エール）→ main（メイン）→ performance（パフォーマンス）。
// ゲーム開始時と、先攻・後攻の入れ替え・RESET のあとは main から始める（準備は、手で進めるため）。ターンチェンジのあとは、draw から始まる
export type TurnPhase = 'draw' | 'yell' | 'main' | 'performance'
export const TURN_PHASES: TurnPhase[] = ['draw', 'yell', 'main', 'performance']
export const PHASE_LABEL: Record<TurnPhase, string> = { draw: 'ドロー', yell: 'エール', main: 'メイン', performance: 'パフォーマンス' }

export type TurnState = {
  first: Side // 先攻の側
  active: Side // いま、ターンを進めている側（盤面の背景が、紺色になる）
  me: number // 自分が、何ターン目か
  opp: number // 相手が、何ターン目か
  phase: TurnPhase // いま、ターンのどのステップか
}

export const initialTurn = (): TurnState => ({ first: 'me', active: 'me', me: 1, opp: 0, phase: 'main' })

export function normalizeTurn(raw: unknown): TurnState {
  const t = (raw ?? {}) as Partial<TurnState>
  const side = (v: unknown, d: Side): Side => (v === 'me' || v === 'opp' ? v : d)
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d)
  const phase: TurnPhase = TURN_PHASES.includes(t.phase as TurnPhase) ? (t.phase as TurnPhase) : 'main' // 古い保存データには、ステップが無い
  return { first: side(t.first, 'me'), active: side(t.active, 'me'), me: num(t.me, 1), opp: num(t.opp, 0), phase }
}

// 自分と相手を入れ替えた、ターンの状態（対戦で、ゲストの画面に出す向きにするため。二度かけると、元に戻る）
export function swapTurn(t: TurnState): TurnState {
  const other = (s: Side): Side => (s === 'me' ? 'opp' : 'me')
  return { first: other(t.first), active: other(t.active), me: t.opp, opp: t.me, phase: t.phase }
}

const STAGE_KEYS: ZoneKey[] = ['center', 'collab', 'back1', 'back2', 'back3', 'back4', 'back5']

// その側のステージのホロメンの、登場したターンの印を、消す
export function clearFresh(state: PlayState, side: Side): PlayState {
  let next = state
  for (const k of STAGE_KEYS) {
    const id = zoneId(side, k)
    if (next[id].some((c) => c.fresh)) next = { ...next, [id]: next[id].map((c) => (c.fresh ? { ...c, fresh: false } : c)) }
  }
  return next
}

// ターンチェンジ（ender の側が、ターンを終える）：
// ・ログのカードを、それぞれの側のアーカイブへ送る
// ・相手（次のターンの側）のターン数を＋1して、その側を、ターンを進める側にする
// ・相手のステージの、登場したターンの印を消す
// ・次の側は、ドローステップから始まる
export function endTurn(state: PlayState, turn: TurnState, ender: Side): { state: PlayState; turn: TurnState; sent: number } {
  const other: Side = ender === 'me' ? 'opp' : 'me'
  let next = state
  let sent = 0
  for (const side of ['me', 'opp'] as const) {
    for (const c of state[zoneId(side, 'log')]) {
      next = moveCard(next, c.uid, zoneId(side, 'archive'))
      sent += 1
    }
  }
  next = clearFresh(next, other)
  return { state: next, turn: { ...turn, active: other, [other]: turn[other] + 1, phase: 'draw' }, sent }
}

// その側の、全てのカード（推しを除く）を、デッキ・エールデッキに戻して（エールはエールデッキ、ほかはデッキ）、
// 両方をシャッフルして、推しホロメンのライフ分を、ライフに置く（初期状態）
export function resetSideToInitial(state: PlayState, side: Side, lifeCount?: number, rnd: () => number = Math.random): PlayState {
  const deck = zoneId(side, 'deck')
  const yellDeck = zoneId(side, 'yellDeck')
  let next = state
  for (const z of ZONES) {
    if (z.key === 'oshi' || z.key === 'deck' || z.key === 'yellDeck') continue
    for (const c of state[zoneId(side, z.key)]) {
      if (isOshiCard(c.card)) continue
      next = moveCard(next, c.uid, isYellCard(c.card) ? yellDeck : deck)
    }
  }
  next = shuffleZone(shuffleZone(next, yellDeck, rnd), deck, rnd)
  if (lifeCount !== undefined) next = dealLife(next, side, lifeCount)
  return next
}

// 盤面のカードを、すべてホルダーに戻す
export function clearBoardToHolder(state: PlayState): PlayState {
  const next = emptyState()
  const returned: PlayCard[] = []
  ;(Object.keys(state) as ZoneId[]).forEach((z) => {
    if (z === 'holder') return
    state[z].forEach((c) => returned.push({ ...c, rested: false, faceDown: false, damage: 0, powerUp: 0, hpUp: 0, fresh: false, revealed: false }))
  })
  next.holder = [...state.holder, ...returned]
  return next
}

export function countCards(state: PlayState): number {
  return (Object.keys(state) as ZoneId[]).reduce((n, z) => n + state[z].length, 0)
}

// 保存（localStorage）から読み込んだ値を、安全に PlayState に直す
export function normalizeState(raw: unknown): PlayState {
  const base = emptyState()
  if (!raw || typeof raw !== 'object') return base
  const src = raw as Record<string, unknown>
  ;(Object.keys(base) as ZoneId[]).forEach((z) => {
    const list = src[z]
    if (!Array.isArray(list)) return
    base[z] = list
      .filter((c): c is PlayCard => !!c && typeof c === 'object' && typeof (c as PlayCard).uid === 'string' && !!(c as PlayCard).card && typeof (c as PlayCard).card.id === 'number')
      .map((c) => ({ uid: c.uid, card: c.card, rested: c.rested === true, faceDown: c.faceDown === true, damage: typeof c.damage === 'number' && c.damage > 0 ? c.damage : 0, powerUp: typeof c.powerUp === 'number' && c.powerUp > 0 ? c.powerUp : 0, hpUp: typeof c.hpUp === 'number' && c.hpUp > 0 ? c.hpUp : 0, fresh: c.fresh === true, revealed: c.revealed === true, logSeq: typeof c.logSeq === 'number' ? c.logSeq : undefined }))
  })
  return base
}

// ===== ブルーム・サポート発動の検出（盤面の変化から、演出を出すための判定） =====

export type BloomStage = 'first' | 'buzz' | 'second'
export type BloomEvent = { zone: ZoneId; stage: BloomStage; label: string; card: DeckCard }

// ブルームの演出を出す進化レベル：1st・Buzzの1st（1stBuzz）・2nd。Debut・Spot は、出さない
export function bloomStageOf(card: DeckCard): BloomStage | null {
  const t = (card.stage ?? '').trim().toLowerCase()
  if (t.startsWith('2nd')) return 'second'
  if (t.startsWith('1st')) return t.includes('buzz') || (card.card_type ?? '').includes('Buzz') ? 'buzz' : 'first'
  return null
}

const BLOOM_LABEL: Record<BloomStage, string> = { first: '1st', buzz: 'Buzz 1st', second: '2nd' }

// 前の盤面と、いまの盤面を比べて、ブルームした枠を見つける。
// 条件：ステージの枠（センター・コラボ・バック）で、もとのカードが全部そのまま残り、ホロメンが増えて、いちばん上が新しいカードになった（入れ替えや、枠から枠への移動は、除く）。
// いちばん上のカードが、1st・Buzzの1st・2nd のときだけ
export function detectBlooms(prev: PlayState, next: PlayState): BloomEvent[] {
  const out: BloomEvent[] = []
  for (const side of ['me', 'opp'] as const) {
    for (const k of STAGE_KEYS) {
      const id = zoneId(side, k)
      const before = prev[id]
      const after = next[id]
      if (before === after) continue
      const beforeHolo = unitParts(before).holomen.filter((c) => !isOshiCard(c.card))
      const afterHolo = unitParts(after).holomen.filter((c) => !isOshiCard(c.card))
      if (beforeHolo.length === 0 || afterHolo.length <= beforeHolo.length) continue
      if (!before.every((c) => after.some((a) => a.uid === c.uid))) continue
      const top = afterHolo[afterHolo.length - 1]!
      if (before.some((c) => c.uid === top.uid)) continue
      const from = findCard(prev, top.uid)
      if (from && isSlotZone(from.zone)) continue // 別の枠から動かしてきたもの
      const stage = bloomStageOf(top.card)
      if (!stage) continue
      out.push({ zone: id, stage, label: BLOOM_LABEL[stage], card: top.card })
    }
  }
  return out
}

// サポート（SUPPORT）の置き場に、新しく置かれたカード（置いた順）
export function detectSupportCasts(prev: PlayState, next: PlayState): { card: DeckCard; side: Side }[] {
  const had = new Set((['me', 'opp'] as const).flatMap((s) => prev[zoneId(s, 'log')].map((c) => c.uid)))
  const added = (['me', 'opp'] as const).flatMap((side) => next[zoneId(side, 'log')].filter((c) => !had.has(c.uid)).map((c) => ({ card: c.card, side, seq: c.logSeq ?? 0 })))
  return added.sort((a, b) => a.seq - b.seq).map(({ card, side }) => ({ card, side }))
}