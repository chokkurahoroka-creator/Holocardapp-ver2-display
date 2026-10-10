import { supabase } from './supabase'
import { cacheGet, cacheSet } from './cardCache'
import type { Card } from '../types/card'

// ---------------------------------------------------------------------------
// カードの取得。Supabaseの転送量（egress）を抑えるために、次の2つをしている。
//
// ① 一覧用の軽量ビュー（cards_list）から取得する。
//    アーツ・固有スキル・評価などの重いJSONは含めず、代わりにフィルター・検索に必要な
//    派生データ（skill_types・search_text）だけを持つ。重い詳細は、詳細モーダルを開いたときに1枚だけ取得する。
//    ビューが未作成の環境では、従来どおり cards テーブルから全項目を取得する（動作は変わらない）。
//
// ② 全カード検索は、取得したカードを端末（IndexedDB）に保存して使い回す。
//    次回以降は「最新の更新日時と枚数」だけを軽く確認し、
//      ・変わっていなければ → ダウンロードなし
//      ・更新があれば → 更新されたカードだけ取得して差し替え
//      ・削除など枚数が合わなければ → 全件を取り直す
// ---------------------------------------------------------------------------

const LIST_VIEW = 'cards_list'
const PAGE_SIZE = 1000 // Supabase(PostgREST)は1回で最大1000行まで
const CACHE_KEY = 'all-cards'
const CACHE_SCHEMA = 1 // 保存形式を変えたときに上げると、古い保存データは使われない

type CachedCards = { schema: number; latest: string; cards: Card[] }
type Row = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryMod = (q: any) => any

// ビューの行をCard型に整える（重い項目は空にして、軽量データであることを示す）
function toLeanCard(row: Row): Card {
  return {
    ...(row as unknown as Card),
    arts_json: [],
    skills_json: [],
    rating_json: {},
    rating_comment: null,
    lean: true,
  }
}

// 1000行ずつ分けて取得し、すべて結合して返す。ページ間で重複・欠落しないよう、必ずid順で取得する
async function fetchPaged(table: string, mod?: QueryMod): Promise<Row[]> {
  const page = (from: number) => {
    let q = supabase.from(table).select('*', { count: 'exact' })
    if (mod) q = mod(q)
    return q.order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1)
  }

  const first = await page(0)
  if (first.error) throw first.error
  const rows: Row[] = [...((first.data ?? []) as Row[])]
  if (rows.length < PAGE_SIZE) return rows

  if (typeof first.count === 'number') {
    // 総数が分かるので、残りのページは並列で取得する
    const offsets: number[] = []
    for (let from = PAGE_SIZE; from < first.count; from += PAGE_SIZE) offsets.push(from)
    const pages = await Promise.all(offsets.map((from) => page(from)))
    for (const p of pages) {
      if (p.error) throw p.error
      rows.push(...((p.data ?? []) as Row[]))
    }
    return rows
  }

  for (let from = PAGE_SIZE; ; from += PAGE_SIZE) {
    const p = await page(from)
    if (p.error) throw p.error
    const data = (p.data ?? []) as Row[]
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

// 軽量ビューから取得。ビューが無い（SQL未実行）などで失敗したら、cardsテーブルの全項目取得に切り替える
async function fetchLeanOrFull(mod?: QueryMod): Promise<Card[]> {
  try {
    return (await fetchPaged(LIST_VIEW, mod)).map(toLeanCard)
  } catch (err) {
    console.warn('cards_list ビューを使えないため、cards テーブルから全項目を取得します', err)
    return (await fetchPaged('cards', mod)) as unknown as Card[]
  }
}

// 弾ごとの取得（新カード一覧・カードプール用）
export async function fetchAllCards(setCode?: string): Promise<Card[]> {
  return fetchLeanOrFull(setCode ? (q) => q.eq('set_code', setCode) : undefined)
}

// 最新の更新日時と総枚数（1行だけの軽いリクエスト）
async function fetchHead(): Promise<{ latest: string; count: number }> {
  const { data, error, count } = await supabase
    .from(LIST_VIEW)
    .select('updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const latest = (data?.[0] as { updated_at?: string } | undefined)?.updated_at
  if (!latest || typeof count !== 'number') throw new Error('updated_at/count を取得できませんでした')
  return { latest, count }
}

async function readCache(): Promise<CachedCards | null> {
  const cached = await cacheGet<CachedCards>(CACHE_KEY)
  return cached && cached.schema === CACHE_SCHEMA && Array.isArray(cached.cards) ? cached : null
}

// 全カードの取得（全カード検索用）。保存済みデータがあれば、onCached で先にそれを渡して即表示できるようにする
export async function loadAllCards(opts?: { onCached?: (cards: Card[]) => void }): Promise<Card[]> {
  const cached = await readCache()
  if (cached) opts?.onCached?.(cached.cards)

  let head: { latest: string; count: number }
  try {
    head = await fetchHead()
  } catch (err) {
    // 更新日時を確認できない（SQL未実行・通信エラー等）。保存データがあればそれを使い、無ければ保存なしで取得する
    console.warn('更新確認に失敗したため、保存せずに取得します', err)
    return cached ? cached.cards : fetchLeanOrFull()
  }

  // 前回から変わっていない → ダウンロード不要
  if (cached && cached.latest === head.latest && cached.cards.length === head.count) return cached.cards

  let cards: Card[] | null = null
  if (cached) {
    // 更新されたカードだけ取得して差し替える（同時刻の更新を取りこぼさないよう gte で取り、idで重複を除く）
    try {
      const changed = (await fetchPaged(LIST_VIEW, (q) => q.gte('updated_at', cached.latest))).map(toLeanCard)
      const byId = new Map<number, Card>(cached.cards.map((c) => [c.id, c]))
      changed.forEach((c) => byId.set(c.id, c))
      // 枚数が合うときだけ採用（削除されたカードがあると合わないので、全件を取り直す）
      if (byId.size === head.count) cards = Array.from(byId.values())
    } catch (err) {
      console.warn('差分の取得に失敗したため、全件を取得し直します', err)
    }
  }
  if (!cards) cards = (await fetchPaged(LIST_VIEW)).map(toLeanCard)

  cards.sort((a, b) => a.id - b.id)
  void cacheSet(CACHE_KEY, { schema: CACHE_SCHEMA, latest: head.latest, cards } satisfies CachedCards)
  return cards
}