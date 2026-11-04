// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import type { DeckCard } from './deckImage'
import { ZONE_BY_KEY, isYellCard, parseZone, unitDamage, unitHpUp, unitParts, unitPower, type PlayCard, type PlayState, type Side, type TurnState, type ZoneId, type ZoneKey } from './playfield'

// ===== プレイログ：盤面が変わったときに、前の盤面との差から、何が起きたかを、文にする =====
// 自分の操作も、相手の操作（対戦中は、ルームから届く盤面）も、同じ差分から作るので、どちらの画面にも、同じログが出る

export type PlayLogKind = 'move' | 'reveal' | 'rest' | 'damage' | 'power' | 'shuffle' | 'turn' | 'skill' | 'step' | 'attack'
// 枠の色分け：パワー関係（ホロパワー・パワーアップ）＝紫、エール関係＝水色、ダメージ関係＝赤、シャッフル＝青
export type PlayLogTone = 'power' | 'yell' | 'damage' | 'shuffle'
// ログの文字の右側に出す、そのログのカード（小さな画像）
export type LogThumb = { id: number; name: string; img: string | null }
export type PlayLogDraft = { side: Side; kind: PlayLogKind; text: string; tone?: PlayLogTone; thumbs?: LogThumb[] }
export type PlayLogEntry = PlayLogDraft & { id: number }

export const PLAY_LOG_LIMIT = 200 // 残しておくログの数（古いものから消える）

const BACK_KEYS = new Set<ZoneKey>(['back1', 'back2', 'back3', 'back4', 'back5'])
// 対戦中、相手のカードの名前を、ログに出してよい場所（盤面で、相手にも見えている場所）
const PUBLIC_KEYS = new Set<ZoneKey>(['center', 'collab', 'back1', 'back2', 'back3', 'back4', 'back5', 'oshi', 'archive', 'log'])
// レスト・ダメージを記録する場所
const STAGE_KEYS = new Set<ZoneKey>(['center', 'collab', 'back1', 'back2', 'back3', 'back4', 'back5', 'oshi'])

const sideLabel = (s: Side): string => (s === 'me' ? '自分' : '相手')

// ゾーンの名前（バック1〜5は、まとめて「バック」。盤面の中央の枠は、盤面と同じ「SUPPORT」）
function placeName(id: ZoneId): string {
  const p = parseZone(id)
  if (!p) return 'ホルダー'
  if (BACK_KEYS.has(p.key)) return 'バック'
  if (p.key === 'log') return 'SUPPORT'
  return ZONE_BY_KEY.get(p.key)?.label ?? ''
}

type Located = { zone: ZoneId; card: PlayCard }

function indexCards(state: PlayState): Map<string, Located> {
  const m = new Map<string, Located>()
  for (const zone of Object.keys(state) as ZoneId[]) for (const card of state[zone]) m.set(card.uid, { zone, card })
  return m
}

// カードの名前を、ログに出してよいか（対戦中の相手の、見えていないカードは、出さない）
function nameVisible(conceal: boolean, side: Side, zone: ZoneId, card: PlayCard): boolean {
  if (!conceal || side === 'me') return true
  const p = parseZone(zone)
  if (!p) return false
  if (p.key === 'handHolder') return card.revealed === true
  return PUBLIC_KEYS.has(p.key)
}

// カード名の表示：「進化レベル-名前」（外側に「」。進化レベルがないカードは、「名前」）。
// 進化レベルの色（Debut＝銅色、1st・1stBuzz＝銀色、2nd＝金色）は、画面側で付けるので、⟦b:文字⟧（銅）・⟦s:文字⟧（銀）・⟦g:文字⟧（金）の印で挟む
export const LOG_MARK = /(⟦[bsg]:[^⟧]*⟧)/
export type LogTier = 'b' | 's' | 'g'

function stageTier(stage: string | null): LogTier | null {
  const t = (stage ?? '').trim().toLowerCase()
  if (t.startsWith('debut')) return 'b'
  if (t.startsWith('1st')) return 's'
  if (t.startsWith('2nd')) return 'g'
  return null
}

export const logThumb = (c: DeckCard): LogThumb => ({ id: c.id, name: c.card_name, img: c.image_url ?? null })

export function cardLabel(c: DeckCard): string {
  const text = `「${c.stage ? `${c.stage}-${c.card_name}` : c.card_name}」`
  const tier = stageTier(c.stage)
  return tier ? `⟦${tier}:${text}⟧` : text
}

// デッキに入ったカードの位置：いちばん上＝デッキトップ、いちばん下＝デッキアンダー（デッキの配列は、末尾が上）
function deckPlace(next: PlayState, zone: ZoneId, uid: string): string {
  const list = next[zone]
  const i = list.findIndex((c) => c.uid === uid)
  if (list.length < 2 || i === -1) return 'デッキ'
  if (i === list.length - 1) return 'デッキトップ'
  if (i === 0) return 'デッキアンダー'
  return 'デッキ'
}

// 2つの並びが、1枚だけ動かしたものか（1枚を抜くと、同じ並びになる）。そうでなければ、シャッフル
function isSingleMove(a: string[], b: string[]): boolean {
  return a.some((u) => {
    const x = a.filter((v) => v !== u)
    const y = b.filter((v) => v !== u)
    return x.every((v, i) => v === y[i])
  })
}

// archive：アーカイブへ送ったカード。何枚送っても、ログに出すのは、いちばん上（最後に積まれた）1枚だけ（tops から選ぶ）
type Move = { side: Side; from: string; to: string; names: string[]; thumbs: LogThumb[]; count: number; tone?: PlayLogTone; archive: boolean; tops: { idx: number; name: string; thumb: LogThumb }[] }

// 移動の色分け：ホロパワー置き場に出入りするカード＝パワー関係、センター・コラボからアーカイブへ行くカード＝赤、エールのカード・エールデッキに出入りするカード＝エール関係
function moveTone(card: PlayCard, from: ZoneId, to: ZoneId): PlayLogTone | undefined {
  const kf = parseZone(from)?.key
  const kt = parseZone(to)?.key
  if (kf === 'power' || kt === 'power') return 'power'
  if ((kf === 'center' || kf === 'collab') && kt === 'archive') return 'damage' // ダウン・アーカイブ送りは、赤
  if (isYellCard(card.card) || kf === 'yellDeck' || kt === 'yellDeck') return 'yell'
  return undefined
}

export function diffPlayLog(prev: PlayState, next: PlayState, opts: { conceal: boolean; hpOf: (card: DeckCard) => number | null }): PlayLogDraft[] {
  const before = indexCards(prev)
  if (before.size === 0) return [] // 最初の読み込み（デッキを置いただけ）は、記録しない
  const after = indexCards(next)

  const moves = new Map<string, Move>()
  const reveals = new Map<string, { side: Side; place: string; names: string[]; thumbs: LogThumb[] }>()

  for (const [uid, a] of after) {
    const b = before.get(uid)
    if (!b) continue // 新しく現れたカード（デッキの読み込み）は、記録しない
    if (b.zone === a.zone) {
      if (a.card.revealed === true && b.card.revealed !== true) {
        const side: Side = parseZone(a.zone)?.side ?? 'me'
        const place = placeName(a.zone)
        const key = `${side}|${place}`
        const g = reveals.get(key) ?? { side, place, names: [], thumbs: [] }
        g.names.push(cardLabel(a.card.card)) // 公開したカードは、相手にも見えるので、名前を出してよい
        g.thumbs.push(logThumb(a.card.card))
        reveals.set(key, g)
      }
      continue
    }
    const pa = parseZone(a.zone)
    const pb = parseZone(b.zone)
    // バックのカードを、左へ詰める動きは、記録しない
    if (pa && pb && pa.side === pb.side && BACK_KEYS.has(pa.key) && BACK_KEYS.has(pb.key)) continue
    const side: Side = pa?.side ?? pb?.side ?? 'me'
    const from = placeName(b.zone)
    const to = pa?.key === 'deck' ? deckPlace(next, a.zone, uid) : placeName(a.zone) // デッキへ戻すときは、トップか、アンダーかも出す
    const tone = moveTone(a.card, b.zone, a.zone)
    const key = `${side}|${from}|${to}|${tone ?? ''}`
    const g = moves.get(key) ?? { side, from, to, names: [], thumbs: [], count: 0, tone, archive: pa?.key === 'archive', tops: [] }
    g.count += 1
    const secret = pb?.key === 'deck' && pa?.key === 'power' // デッキ → パワー（ホロパワーへ置く）は、非公開情報なので、カード名を出さない
    if (!secret && nameVisible(opts.conceal, side, a.zone, a.card)) {
      g.names.push(cardLabel(a.card.card))
      g.thumbs.push(logThumb(a.card.card))
      g.tops.push({ idx: next[a.zone].findIndex((c) => c.uid === uid), name: cardLabel(a.card.card), thumb: logThumb(a.card.card) })
    }
    moves.set(key, g)
  }

  const out: PlayLogDraft[] = []
  for (const g of moves.values()) {
    // 複数枚をアーカイブへ送ったときは、いちばん上のカード（アーカイブの山の、いちばん上）1枚だけを出す
    if (g.archive && g.tops.length > 1) {
      const top = g.tops.reduce((a, b) => (b.idx > a.idx ? b : a))
      g.names = [top.name]
      g.thumbs = [top.thumb]
    }
    const route = `${g.from} → ${g.to}`
    // 移動（場所 → 場所）を先に出し、改行して、カード名（1枚ずつ、1行。4枚目からは、枚数）を出す。名前が見えないとき（相手の非公開のカード・デッキ → パワー）は、移動だけ
    const shown = g.names.slice(0, 3)
    const more = g.names.length > 3 ? `\nほか${g.names.length - 3}枚` : ''
    const times = g.count > 1 ? ` ×${g.count}` : ''
    const text = g.names.length === 0 ? `${route}${times}` : `${route}${times}\n${shown.join('\n')}${more}`
    out.push({ side: g.side, kind: 'move', text, tone: g.tone, thumbs: g.thumbs.slice(0, 3) })
  }

  for (const g of reveals.values()) {
    const shown = g.names.slice(0, 3)
    const more = g.names.length > 3 ? `\nほか${g.names.length - 3}枚` : ''
    out.push({ side: g.side, kind: 'reveal', text: `${g.place}のカードを公開\n${shown.join('\n')}${more}`, thumbs: g.thumbs.slice(0, 3) })
  }

  // 枠（ユニット）ごとの変化：レスト・ダメージは、いちばん上のカード（表に見えているホロメン）の情報で出す
  const restDrafts: PlayLogDraft[] = []
  const damageDrafts: PlayLogDraft[] = []
  const powerDrafts: PlayLogDraft[] = []
  const shuffleDrafts: PlayLogDraft[] = []
  for (const zone of Object.keys(next) as ZoneId[]) {
    const p = parseZone(zone)
    if (!p) continue
    const pc = prev[zone]
    const nc = next[zone]

    if (STAGE_KEYS.has(p.key)) {
      if (pc.length === 0 || nc.length === 0) continue
      const pTop = unitParts(pc).top
      const nTop = unitParts(nc).top
      if (!pTop || !nTop || pTop.uid !== nTop.uid) continue // 別のユニットになった（ブルーム・入れ替え）ときは、移動のログだけ
      const label = cardLabel(nTop.card)

      const sameCards = pc.length === nc.length && pc.every((c, i) => c.uid === nc[i]!.uid)
      if (sameCards) {
        const was = pc.some((c) => c.rested)
        const now = nc.some((c) => c.rested)
        if (was !== now) restDrafts.push({ side: p.side, kind: 'rest', text: `${label}を${now ? 'レストにした' : 'アクティブにした'}`, thumbs: [logThumb(nTop.card)] })
      }

      const dp = unitDamage(pc)
      const dn = unitDamage(nc)
      if (dp !== dn) {
        const base = opts.hpOf(nTop.card)
        const remain = base === null ? '不明' : String(Math.max(0, base + unitHpUp(nc) - dn))
        const text = dn > dp ? `${label}に${dn - dp}ダメージ（残りHP ${remain}）` : `${label}のダメージを${dp - dn}減らした（残りHP ${remain}）`
        damageDrafts.push({ side: p.side, kind: 'damage', text, tone: 'damage', thumbs: [logThumb(nTop.card)] })
      }

      // パワーアップカウンター
      const pp = unitPower(pc)
      const pn = unitPower(nc)
      if (pp !== pn) {
        const text = pn > pp ? `${label}にパワー+${pn - pp}（合計+${pn}）` : `${label}のパワーを${pp - pn}減らした（合計+${pn}）`
        powerDrafts.push({ side: p.side, kind: 'power', text, tone: 'power', thumbs: [logThumb(nTop.card)] })
      }
      continue
    }

    // デッキ・エールデッキ：並びが変わって、1枚だけ動かしたものでないとき（出入りしたカードは、除いて比べる）は、シャッフル
    if (p.key === 'deck' || p.key === 'yellDeck') {
      const nextIds = new Set(nc.map((c) => c.uid))
      const prevIds = new Set(pc.map((c) => c.uid))
      const a = pc.filter((c) => nextIds.has(c.uid)).map((c) => c.uid)
      const b = nc.filter((c) => prevIds.has(c.uid)).map((c) => c.uid)
      if (a.length >= 3 && a.some((u, i) => u !== b[i]) && !isSingleMove(a, b)) {
        shuffleDrafts.push({ side: p.side, kind: 'shuffle', text: `${placeName(zone)}をシャッフル`, tone: 'shuffle' })
      }
    }
  }
  return [...out, ...shuffleDrafts, ...restDrafts, ...powerDrafts, ...damageDrafts]
}

// ステップの名前（ログに出す）
export const STEP_LOG_LABEL: Record<TurnState['phase'], string> = { reset: 'リセットステップ', draw: 'ドローステップ', yell: 'エールステップ', main: 'メインステップ', performance: 'パフォーマンスステップ' }

// ターンが替わったとき（ターンチェンジ）と、ステップが進んだとき（リセット → ドロー → エール → メイン → パフォーマンス）
export function diffTurnLog(prev: TurnState, next: TurnState): PlayLogDraft[] {
  const out: PlayLogDraft[] = []
  const turnChanged = prev.active !== next.active
  if (turnChanged) out.push({ side: next.active, kind: 'turn', text: `${sideLabel(next.active)}のターン（${next[next.active]}ターン目）` })
  if (turnChanged || prev.phase !== next.phase) out.push({ side: next.active, kind: 'step', text: STEP_LOG_LABEL[next.phase] })
  return out
}

// 推しスキルを使ったとき（キー：me:oshi / me:sp / opp:oshi / opp:sp）。使用済みが、元に戻ったときは、記録しない
export function diffSkillLog(prev: Record<string, boolean>, next: Record<string, boolean>): PlayLogDraft[] {
  const out: PlayLogDraft[] = []
  for (const key of Object.keys(next)) {
    if (next[key] !== true || prev[key] === true) continue
    const [side, which] = key.split(':') as [Side, string]
    if (side !== 'me' && side !== 'opp') continue
    out.push({ side, kind: 'skill', text: which === 'sp' ? 'SP推しスキルを使用' : '推しスキルを使用' })
  }
  return out
}