// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { supabase } from '../lib/supabase'
import type { DeckCard, DeckEntry, DeckRecipe } from './deckImage'

// デッキログ（ブシロード公式のデッキ作成ツール）のデッキコードから、デッキを読み込む。
//   1) ブラウザ → 自分のサーバー（/api/decklog）→ デッキログ、の順に取得する（ブラウザから直接は、CORSで読めないため）
//   2) 取得したカード（カード番号・レアリティ・枚数）を、自分のデータベースの cards と突き合わせて、DeckRecipe にする
// デッキログの応答は、公式に公開されたAPIではないため、読み取りは、できるだけ形の違いに強くしてある

export type DecklogItem = { cardNumber: string; rare: string; count: number; name: string }
export type DecklogDeck = { title: string; items: DecklogItem[] }

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

// 「ABC12」のコードでも、「https://decklog.bushiroad.com/view/ABC12」のURLでも、コードだけを取り出す。読み取れないときは null
export function parseDeckCode(input: string): string | null {
  const s = input.trim()
  const m = s.match(/\/view\/([0-9A-Za-z]+)/)
  const code = (m?.[1] ?? s).trim()
  return /^[0-9A-Za-z]{3,12}$/.test(code) ? code.toUpperCase() : null
}

function collect(raw: Raw, keys: string[] | null): DecklogItem[] {
  const merged = new Map<string, DecklogItem>()
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue
    if (keys && !keys.includes(key)) continue
    for (const r of value) {
      if (!isObj(r)) continue
      const cardNumber = str(r.card_number ?? r.cardNumber ?? r.number)
      if (!cardNumber) continue
      const count = Math.max(1, Math.round(Number(r.num ?? r.count ?? 1)) || 1)
      const rare = str(r.rare ?? r.rarity)
      const mapKey = `${cardNumber}__${rare}`
      const exist = merged.get(mapKey)
      if (exist) exist.count += count
      else merged.set(mapKey, { cardNumber, rare, count, name: str(r.name ?? r.card_name) })
    }
  }
  return [...merged.values()]
}

const sum = (items: DecklogItem[]) => items.reduce((n, i) => n + i.count, 0)

// デッキログの応答（JSON）から、カード番号・レアリティ・枚数の一覧を取り出す
export function normalizeDecklog(raw: unknown): DecklogDeck {
  if (!isObj(raw)) throw new Error('デッキログの応答を読み取れませんでした')
  let items = collect(raw, null)
  // 推し1枚＋メイン50枚＋エール20枚＝71枚を、大きく超えるときは、別の用途の一覧（差し替え候補など）が混ざっていると見て、デッキ本体の一覧だけにする
  if (sum(items) > 71) items = collect(raw, ['list', 'sub_list'])
  if (items.length === 0) throw new Error('デッキのカードを読み取れませんでした（コードが違うか、公開されていないデッキかもしれません）')
  return { title: str(raw.title ?? raw.deck_name ?? raw.name), items }
}

// コードから、デッキログのデッキを取得する（ログインが必要）
export async function fetchDecklog(code: string): Promise<DecklogDeck> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ログインが必要です')

  const res = await fetch(`/api/decklog?code=${encodeURIComponent(code)}`, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  if (!res.ok) {
    let message = ''
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? ''
    } catch {
      // JSONではない（関数が動いていないとき）
    }
    throw new Error(message || `デッキログから取得できませんでした（HTTP ${res.status}）。サイトに公開した環境で試してください`)
  }
  try {
    return normalizeDecklog(JSON.parse(text))
  } catch (err) {
    throw err instanceof Error ? err : new Error('デッキログの応答を読み取れませんでした')
  }
}

// ---- 自分のカードデータとの突き合わせ ----
const COLUMNS = 'id, set_code, type, slot, card_name, card_type, attribute, stage, rarity, card_number, image_url'
const CHUNK = 60

type Row = DeckCard & { original_number?: string | null }
const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

async function fetchRows(column: 'card_number' | 'original_number', numbers: string[]): Promise<Map<string, Row[]>> {
  const out = new Map<string, Row[]>()
  const wanted = Array.from(new Set(numbers.flatMap((n) => [n, n.toUpperCase()])))
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('cards')
      .select(column === 'original_number' ? `${COLUMNS}, original_number` : COLUMNS)
      .in(column, wanted.slice(i, i + CHUNK))
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as unknown as Row[]) {
      const key = norm(column === 'card_number' ? r.card_number : r.original_number)
      if (!key) continue
      const list = out.get(key)
      if (list) list.push(r)
      else out.set(key, [r])
    }
  }
  return out
}

// 同じ番号のカードが複数あるとき（再録・パラレル）：レアリティが同じもの → 新規 → 先頭、の順に選ぶ
function pick(candidates: Row[], rare: string): Row | null {
  const r = norm(rare)
  return (r ? candidates.find((c) => norm(c.rarity) === r) : undefined) ?? candidates.find((c) => c.type === '新規') ?? candidates[0] ?? null
}

export type DecklogResolved = {
  recipe: DeckRecipe
  requested: number // デッキログ上の、カードの合計枚数
  matched: number // 反映できた枚数
  missing: string[] // 自分のデータベースに見つからなかったカード（番号と名前）
}

// デッキログのデッキを、盤面に置ける形（DeckRecipe）にする。推し・エール・メインへの振り分けは、カードの種類で行う
export async function resolveDecklog(deck: DecklogDeck, fallbackName = 'デッキログから'): Promise<DecklogResolved> {
  const numbers = Array.from(new Set(deck.items.map((i) => i.cardNumber)))
  const byNumber = await fetchRows('card_number', numbers)
  const unresolved = numbers.filter((n) => !byNumber.has(norm(n)))
  const byOriginal = unresolved.length > 0 ? await fetchRows('original_number', unresolved) : new Map<string, Row[]>()

  const counts = new Map<number, DeckEntry>()
  const missing: string[] = []
  let oshi: DeckCard | null = null
  let requested = 0
  let matched = 0

  for (const item of deck.items) {
    requested += item.count
    const key = norm(item.cardNumber)
    const row = pick(byNumber.get(key) ?? byOriginal.get(key) ?? [], item.rare)
    if (!row) {
      missing.push(item.name ? `${item.cardNumber}（${item.name}）` : item.cardNumber)
      continue
    }
    matched += item.count
    const type = row.card_type ?? ''
    if (type.includes('推し')) {
      oshi ??= row // 推しは、1枚だけ
      continue
    }
    const exist = counts.get(row.id)
    if (exist) exist.count += item.count
    else counts.set(row.id, { card: row, count: item.count })
  }

  const yells: DeckEntry[] = []
  const main: DeckEntry[] = []
  for (const entry of counts.values()) {
    if ((entry.card.card_type ?? '').startsWith('エール')) yells.push(entry)
    else main.push(entry)
  }
  yells.sort((a, b) => a.card.card_name.localeCompare(b.card.card_name, 'ja'))
  return { recipe: { name: deck.title || fallbackName, oshi, yells, main, manual: false }, requested, matched, missing }
}