import type { Card } from '../types/card'

const RARITY_ORDER = ['SEC', 'OUR', 'OSR', 'OC', 'HR', 'SY', 'UR', 'SR', 'RR', 'U', 'S', 'R', 'C', 'P', '判別不能', 'その他']

function byNameJa(a: Card, b: Card) {
  return (a.card_name || '').localeCompare(b.card_name || '', 'ja')
}

function rarityOrderIndex(rarity: string | null): number {
  const r = (rarity || '').toUpperCase().trim()
  if (!r) return RARITY_ORDER.indexOf('その他')
  const idx = RARITY_ORDER.indexOf(r)
  return idx === -1 ? RARITY_ORDER.indexOf('判別不能') : idx
}

// 'slot'  : 区分（新規/再録/パラレル）内のスロット番号順
// 'overall': 弾ごとの通し番号（overall_number）順（全カード検索のカード番号順）
export type SortKey = 'slot' | 'overall' | 'rarity' | 'name' | 'hp'
const TYPE_ORDER: Card['type'][] = ['新規', '再録', 'パラレル']

// エールの色の並び順（それ以外の色・無色・色なしは最後の「その他」）
const COLOR_ORDER = ['白', '緑', '赤', '青', '紫', '黄']

function colorRank(attribute: string | null | undefined): number {
  const a = (attribute || '').trim()
  const exact = COLOR_ORDER.indexOf(a)
  if (exact !== -1) return exact
  // 「白/緑」のように複数の色が入っている場合は、並び順が先の色として扱う
  const found = COLOR_ORDER.findIndex((c) => a.includes(c))
  return found !== -1 ? found : COLOR_ORDER.length
}

// カードの種類の並び順: 推しホロメン → ホロメン → サポート（その他）
function categoryRank(card: Card): number {
  const t = card.card_type || ''
  if (t.includes('推し') || /^O[A-Z]+$/i.test((card.rarity || '').trim())) return 0
  if (t.includes('ホロメン')) return 1
  return 2
}

// カード番号順（全カード検索の既定）。弾ごとに次の順で並べる。
//   新規: 番号順
//   再録: 推しホロメン(白,緑,赤,青,紫,黄,その他) → ホロメン(同) → サポート
//   パラレル: 再録と同じ並び
// 各グループの中は通し番号の順（通し番号が未設定のカードは、スロット番号順で末尾）
function byOverallNumber(a: Card, b: Card) {
  const setCmp = (a.set_code || '').localeCompare(b.set_code || '')
  if (setCmp !== 0) return setCmp

  const typeCmp = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
  if (typeCmp !== 0) return typeCmp

  if (a.type !== '新規') {
    const catA = categoryRank(a)
    const catB = categoryRank(b)
    if (catA !== catB) return catA - catB
    // サポートは色で分けない
    if (catA !== 2) {
      const colorCmp = colorRank(a.attribute) - colorRank(b.attribute)
      if (colorCmp !== 0) return colorCmp
    }
  }

  const an = a.overall_number ?? Number.POSITIVE_INFINITY
  const bn = b.overall_number ?? Number.POSITIVE_INFINITY
  if (an !== bn) return an < bn ? -1 : 1
  return Number(a.slot) - Number(b.slot)
}

export type SortDir = 'asc' | 'desc'

export function sortCards(cards: Card[], key: SortKey, dir: SortDir): Card[] {
  let list: Card[]
  if (key === 'rarity') {
    list = [...cards].sort((a, b) => rarityOrderIndex(a.rarity) - rarityOrderIndex(b.rarity) || byNameJa(a, b))
  } else if (key === 'name') {
    list = [...cards].sort(byNameJa)
  } else if (key === 'overall') {
    list = [...cards].sort(byOverallNumber)
  } else if (key === 'hp') {
    list = [...cards].sort((a, b) => (Number(a.hp) || 0) - (Number(b.hp) || 0) || byNameJa(a, b))
  } else {
    list = [...cards].sort((a, b) => Number(a.slot) - Number(b.slot))
  }
  if (dir === 'desc') list.reverse()
  return list
}

// ---- 並び替えの区切り表示（レアリティ・HP・カード名順のとき、どこから区切られるかを示す）----

const KANA_ROWS: [string, string][] = [
  ['あ行', 'あいうえおぁぃぅぇぉゔ'],
  ['か行', 'かきくけこがぎぐげごゕゖ'],
  ['さ行', 'さしすせそざじずぜぞ'],
  ['た行', 'たちつてとだぢづでどっ'],
  ['な行', 'なにぬねの'],
  ['は行', 'はひふへほばびぶべぼぱぴぷぺぽ'],
  ['ま行', 'まみむめも'],
  ['や行', 'やゆよゃゅょ'],
  ['ら行', 'らりるれろ'],
  ['わ行', 'わゐゑをんゎ'],
]

// カード名の先頭文字から、五十音の行（あ行〜わ行）・英数字・その他に分類する
function nameGroupLabel(name: string | null): string {
  // 全角英数・半角カナを正規化し、カタカナはひらがなに揃えてから判定する
  const first = (name || '').trim().normalize('NFKC').charAt(0)
  if (!first) return 'その他'
  const code = first.charCodeAt(0)
  const hira = code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : first
  const row = KANA_ROWS.find(([, chars]) => chars.includes(hira))
  if (row) return row[0]
  if (/[0-9A-Za-z]/.test(first)) return '英数字'
  return 'その他（漢字など）'
}

// 並び替えキーに応じた「区切りの見出し」。枠番号順・通し番号順は区切り不要なので null
export function getSortGroupLabel(card: Card, key: SortKey): string | null {
  if (key === 'rarity') {
    const r = (card.rarity || '').toUpperCase().trim()
    return r ? `レアリティ ${r}` : 'レアリティなし'
  }
  if (key === 'hp') {
    const hp = Number(card.hp)
    return hp > 0 ? `HP ${hp}` : 'HPなし'
  }
  if (key === 'name') return nameGroupLabel(card.card_name)
  return null
}