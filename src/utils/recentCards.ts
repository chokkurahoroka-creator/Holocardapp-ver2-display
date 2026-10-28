import type { Card } from '../types/card'

// 「新着カード」：新カードページを公開中のパックのカードを、登録日の新しい順に並べ、最新の100枚までを表示する
export const RECENT_CARD_LIMIT = 100

// 登録日時（cards.timestamp）の文字列を日時に直す。解釈できない・空の場合は null
export function parseRegisteredAt(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const s = value.trim()
  // 「2026/10/12 18:30:00」「2026-10-12 18:30」のような形式は、ブラウザによって読めないことがあるので、ISO形式に整える。
  // タイムゾーンが付いていない場合は、日本時間として扱う
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(.*)$/)
  if (m) {
    const pad = (v: string | undefined, n = 2) => (v ?? '0').padStart(n, '0')
    const rest = (m[7] ?? '').trim()
    const iso = `${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${pad(m[5])}:${pad(m[6])}${rest || '+09:00'}`
    const t = Date.parse(iso)
    if (!Number.isNaN(t)) return t
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

// 「NEW!」の表示：新しく登録されてから、この日数以内のカード（更新日ではなく、登録日時 cards.timestamp が基準）
export const NEW_CARD_DAYS = 5

export function isNewCard(card: Card, now: number = Date.now()): boolean {
  const t = parseRegisteredAt(card.timestamp)
  return t !== null && now - t <= NEW_CARD_DAYS * 24 * 60 * 60 * 1000
}

const dayFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })

// 登録日（日本時間）を「2026-10-12」の形で返す。登録日が分からないカードは 'unknown'
export function registeredDayKey(card: Card): string {
  const t = parseRegisteredAt(card.timestamp)
  return t === null ? 'unknown' : dayFormatter.format(new Date(t))
}

// 「10月12日(日)」のような見出し。今年でなければ年も付ける
export function formatDayLabel(key: string): string {
  if (key === 'unknown') return '登録日不明'
  const date = new Date(`${key}T00:00:00+09:00`)
  const thisYear = dayFormatter.format(new Date()).slice(0, 4)
  return date.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    ...(key.slice(0, 4) === thisYear ? {} : { year: 'numeric' as const }),
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

// 重複判定用に、全角・半角、大文字・小文字、空白の違いをそろえる
function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase()
}

// 同じカードの重複表示をまとめるときに、どれを残すかの優先順（小さいほど優先）。新規 → 再録 → パラレル
function typeRank(type: string): number {
  const i = ['新規', '再録', 'パラレル'].indexOf(type)
  return i === -1 ? 3 : i
}

// 全カードから、公開中パックのカードだけを選び、登録日時の新しい順に最新100枚を返す（登録日不明のカードは最後）。
// 同じ日に登録された、オリジナル番号もカード名も同じカードは、1枚（新規 → 再録 → パラレルの順に優先）にまとめる
export function buildRecentCards(allCards: Card[], publicSetCodes: string[]): Card[] {
  const open = new Set(publicSetCodes)
  const sorted = allCards
    .filter((c) => open.has(c.set_code))
    .map((card, index) => ({ card, index, t: parseRegisteredAt(card.timestamp) }))
    .sort((a, b) => {
      if (a.t === null && b.t === null) return a.index - b.index
      if (a.t === null) return 1
      if (b.t === null) return -1
      return b.t - a.t || a.index - b.index
    })

  const result: Card[] = []
  const seen = new Map<string, number>() // 重複の判定キー → result内の位置
  for (const { card } of sorted) {
    const original = normalizeKey(card.original_number)
    // オリジナル番号が無いカードは、同じカードかどうか判断できないため、まとめない
    if (!original) {
      result.push(card)
      continue
    }
    // 日付だけで比べる（時刻は見ない）
    const key = `${registeredDayKey(card)}|${original}|${normalizeKey(card.card_name)}`
    const at = seen.get(key)
    if (at === undefined) {
      seen.set(key, result.length)
      result.push(card)
    } else if (typeRank(card.type) < typeRank(result[at]!.type)) {
      result[at] = card // 優先順位の高い方に差し替える（位置は、先に出てきた方のまま）
    }
  }
  return result.slice(0, RECENT_CARD_LIMIT)
}

// 並んでいるカードを、登録日ごとに分ける（新しい日が先、登録日不明は最後）。日の中の順番は、渡された並びのまま
export function groupByRegisteredDay(cards: Card[]): { key: string; label: string; cards: Card[] }[] {
  const map = new Map<string, Card[]>()
  cards.forEach((c) => {
    const key = registeredDayKey(c)
    const list = map.get(key)
    if (list) list.push(c)
    else map.set(key, [c])
  })
  return Array.from(map, ([key, list]) => ({ key, label: formatDayLabel(key), cards: list })).sort((a, b) => {
    if (a.key === 'unknown') return 1
    if (b.key === 'unknown') return -1
    return b.key.localeCompare(a.key)
  })
}