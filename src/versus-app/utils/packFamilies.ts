// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { supabase } from '../lib/supabase'
import { padCardNumber, padOriginalNumber } from './cardNumber'
import type { DeckCard } from './deckImage'

// デッキのカードが、どのパックに、どの区分（新規・再録・パラレル）で収録されているかを調べる。
// 同じカードの仲間（元カード・再録・パラレル）は、次の2つでつなぐ：
//   ・同じ「元カードの番号」（original_number。新規カードは、自分自身の番号）
//   ・関連カード（linked_card_key）の指定

export type PackType = '新規' | '再録' | 'パラレル'
export const PACK_TYPES: PackType[] = ['新規', '再録', 'パラレル']
export const isPackType = (t: string | null | undefined): t is PackType => PACK_TYPES.some((p) => p === t)

export type PackMembership = { packCode: string; type: PackType }
export type CardPackInfo = {
  card: DeckCard
  ownType: PackType | null // デッキに入っているカード自身の区分
  homePack: string // グループにするパック：仲間に「新規」があれば、その新規のパック（優先）。無ければ、カード自身のパック
  memberships: PackMembership[] // 収録されているパックと区分（重複なし）
}

export type PoolRow = { id: number; set_code: string; type: string; slot: number; card_number: string | null; original_number: string | null; linked_card_key: string | null }

const keyOf = (r: { set_code: string; type: string; slot: number }) => `${r.set_code}__${r.type}__${r.slot}`
const linkKeys = (s: string | null | undefined) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

// 元カードの番号（再録・パラレル：original_number。新規：original_number、無ければ「弾-カード番号」）
export function familyNumberOf(r: Pick<PoolRow, 'set_code' | 'type' | 'card_number' | 'original_number'>): string {
  const o = padOriginalNumber(r.original_number)
  if (o) return o
  if (r.type === '新規' && r.card_number) return padOriginalNumber(`${r.set_code}-${padCardNumber(r.card_number)}`)
  return ''
}

// 仲間づくり（計算だけの部分）。pool は、調べて集めたカードの行。packRank は、パックの順番（発売の古い順に小さい）
export function computeCardPackInfo(cards: DeckCard[], pool: PoolRow[], packRank: (packCode: string) => number): CardPackInfo[] {
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) ?? r
    let c = x
    while ((parent.get(c) ?? c) !== r) {
      const next = parent.get(c) ?? c
      parent.set(c, r)
      c = next
    }
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  pool.forEach((r) => parent.set(r.id, r.id))

  const byKey = new Map(pool.map((r) => [keyOf(r), r.id]))
  const byNumber = new Map<string, number>()
  pool.forEach((r) => {
    const n = familyNumberOf(r)
    if (n) {
      const first = byNumber.get(n)
      if (first === undefined) byNumber.set(n, r.id)
      else union(first, r.id)
    }
    linkKeys(r.linked_card_key).forEach((k) => {
      const target = byKey.get(k)
      if (target !== undefined) union(r.id, target)
    })
  })

  const rowById = new Map(pool.map((r) => [r.id, r]))
  return cards.map((card) => {
    const own = rowById.get(card.id)
    const members = own ? pool.filter((r) => find(r.id) === find(own.id)) : []
    const seen = new Set<string>()
    const memberships: PackMembership[] = []
    const add = (packCode: string, type: string) => {
      if (!isPackType(type)) return
      const k = `${packCode}|${type}`
      if (seen.has(k)) return
      seen.add(k)
      memberships.push({ packCode, type })
    }
    add(card.set_code, card.type) // 自分自身は、必ず入れる
    members.forEach((m) => add(m.set_code, m.type))
    const news = memberships.filter((m) => m.type === '新規').sort((a, b) => packRank(a.packCode) - packRank(b.packCode) || a.packCode.localeCompare(b.packCode))
    return { card, ownType: isPackType(card.type) ? card.type : null, homePack: news[0]?.packCode ?? card.set_code, memberships }
  })
}

// ---- データベースから、仲間を集める ----
const COLS = 'id, set_code, type, slot, card_number, original_number, linked_card_key'
const CHUNK = 60
const chunked = <T>(arr: T[], size: number): T[][] => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))

async function query(build: (q: ReturnType<typeof baseQuery>) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<PoolRow[]> {
  const { data, error } = await build(baseQuery())
  if (error) throw new Error(error.message)
  return (data ?? []) as PoolRow[]
}
const baseQuery = () => supabase.from('cards').select(COLS)

// 番号は、3桁にそろえた形と、そろえる前の形（-4 など）の、両方で探す（3桁化のSQLを実行する前のデータにも、対応）
const numberVariants = (n: string): string[] => [n, n.replace(/-(\d+)([^-]*)$/, (_m, d: string, rest: string) => `-${Number(d)}${rest}`)]

export async function loadCardPackInfo(cards: DeckCard[], packRank: (packCode: string) => number): Promise<CardPackInfo[]> {
  if (cards.length === 0) return []
  const pool = new Map<number, PoolRow>()
  const addAll = (rows: PoolRow[]) => rows.forEach((r) => pool.set(r.id, r))

  // 1. デッキのカード自身
  for (const ids of chunked(Array.from(new Set(cards.map((c) => c.id))), 100)) addAll(await query((q) => q.in('id', ids)))

  // 2. 関連カード（linked_card_key）に指定された、元カード
  const wantedKeys = Array.from(new Set(Array.from(pool.values()).flatMap((r) => linkKeys(r.linked_card_key))))
  for (const keys of chunked(wantedKeys, 25)) {
    const conds = keys.flatMap((k) => {
      const [setCode, type, slot] = k.split('__')
      return setCode && type && slot !== undefined && /^\d+$/.test(slot) ? [`and(set_code.eq.${setCode},type.eq.${type},slot.eq.${slot})`] : []
    })
    if (conds.length > 0) addAll(await query((q) => q.or(conds.join(','))))
  }

  // 3. 同じ「元カードの番号」を持つカード（元カード・再録・パラレル）
  const numbers = Array.from(new Set(Array.from(pool.values()).map(familyNumberOf).filter(Boolean)))
  for (const ns of chunked(Array.from(new Set(numbers.flatMap(numberVariants))), CHUNK)) addAll(await query((q) => q.in('original_number', ns)))

  // 4. 新規カードを、関連カードに指定している、再録・パラレル（元の番号が、入っていないデータのため）
  const newKeys = Array.from(pool.values()).filter((r) => r.type === '新規').map(keyOf)
  for (const batch of chunked(newKeys, 6)) {
    const results = await Promise.all(batch.map((key) => query((q) => q.like('linked_card_key', `%${key}%`)).then((rows) => rows.filter((r) => linkKeys(r.linked_card_key).includes(key)))))
    results.forEach(addAll)
  }

  return computeCardPackInfo(cards, Array.from(pool.values()), packRank)
}