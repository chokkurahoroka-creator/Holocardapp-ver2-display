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

// 'slot'  : カード番号順（新規はスロット番号順、再録・パラレルは、種類・色・進化レベルなどの決まった順）
// 'overall': 弾ごとの通し番号（overall_number）順（全カード検索のカード番号順）
export type SortKey = 'slot' | 'overall' | 'rarity' | 'name' | 'hp'
const TYPE_ORDER: Card['type'][] = ['新規', '再録', 'パラレル']

// エールの色の並び順（それ以外の色・無色・色なしは最後の「その他」）
const COLOR_ORDER = ['白', '緑', '赤', '青', '紫', '黄']

function colorRank(attribute: string | null | undefined): number {
  const a = (attribute || '').trim()
  const exact = COLOR_ORDER.indexOf(a)
  if (exact !== -1) return exact
  // 色の順番は、白・緑・赤・青・紫・黄 の次が 多色、その次が 無色、それ以外は最後
  if (a.startsWith('多色')) return COLOR_ORDER.length
  if (a === '無色') return COLOR_ORDER.length + 1
  // 「白/緑」のように複数の色が入っている場合は、並び順が先の色として扱う
  const found = COLOR_ORDER.findIndex((c) => a.includes(c))
  return found !== -1 ? found : COLOR_ORDER.length + 2
}

// カードの種類の並び順: 推しホロメン → ホロメン → サポート → エール
function categoryRank(card: Card): number {
  const t = card.card_type || ''
  if (t.includes('推し') || /^O[A-Z]+$/i.test((card.rarity || '').trim())) return 0
  if (t.includes('ホロメン')) return 1
  if (t.startsWith('エール')) return 3
  return 2 // サポート（その他の種類も、ここに含める）
}

// サポートの並び順: イベント → アイテム → ツール → マスコット → ファン → その他
const SUPPORT_KEYWORDS = ['イベント', 'アイテム', 'ツール', 'マスコット', 'ファン']

function supportRank(card: Card): number {
  const t = card.card_type || ''
  const i = SUPPORT_KEYWORDS.findIndex((k) => t.includes(k))
  return i === -1 ? SUPPORT_KEYWORDS.length : i
}

// ホロメンの並び順: debut → 1st → 1stBuzz → 2nd（Buzzホロメンの1stが、1stBuzz）。それ以外の進化レベルは最後
const STAGE_RANK: Record<string, number> = { debut: 0, '1st': 1, '2nd': 3, spot: 4 }

function stageRank(card: Card): number {
  const stage = (card.stage || '').trim().toLowerCase()
  const base = STAGE_RANK[stage] ?? 5
  if ((card.card_type || '') === 'Buzzホロメン') return stage === '1st' ? 2 : base + 0.25 // 1stBuzz は、1st と 2nd の間
  return base
}

// 再録・パラレルの並び（レアリティを除く部分）
//   第1: 推しホロメン → ホロメン → サポート → エール
//   第2: 推しホロメン・ホロメン・エールは色（白,緑,赤,青,紫,黄,多色）、サポートは種類（イベント,アイテム,ツール,マスコット,ファン,その他）
//   第3: ホロメンは進化レベル（debut,1st,1stBuzz,2nd）
function byCategoryColorStage(a: Card, b: Card): number {
  const catA = categoryRank(a)
  const catB = categoryRank(b)
  if (catA !== catB) return catA - catB
  if (catA === 2) {
    const supCmp = supportRank(a) - supportRank(b)
    if (supCmp !== 0) return supCmp
    return (a.card_type || '').localeCompare(b.card_type || '', 'ja') // 「その他」の中は、種類の名前順
  }
  const colorCmp = colorRank(a.attribute) - colorRank(b.attribute)
  if (colorCmp !== 0) return colorCmp
  if (catA === 1) return stageRank(a) - stageRank(b)
  return 0
}

// カード番号順。弾ごとに、次の順で並べる。
//   新規: 番号順（useOverall=true なら通し番号、false ならスロット番号）
//   再録: 上の「第1〜第3」の順
//   パラレル: 第1にレアリティ（レアリティ順と同じ並び）、続けて「第1〜第3」の順
// 同じ並びの中は、通し番号（未設定なら、スロット番号）の順
function makeCardNumberComparator(useOverall: boolean) {
  return (a: Card, b: Card): number => {
    const setCmp = (a.set_code || '').localeCompare(b.set_code || '', undefined, { numeric: true })
    if (setCmp !== 0) return setCmp

    const typeCmp = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
    if (typeCmp !== 0) return typeCmp

    if (a.type === 'パラレル') {
      const rarityCmp = rarityOrderIndex(a.rarity) - rarityOrderIndex(b.rarity)
      if (rarityCmp !== 0) return rarityCmp
    }
    if (a.type !== '新規') {
      const ruleCmp = byCategoryColorStage(a, b)
      if (ruleCmp !== 0) return ruleCmp
    }

    if (useOverall) {
      const an = a.overall_number ?? Number.POSITIVE_INFINITY
      const bn = b.overall_number ?? Number.POSITIVE_INFINITY
      if (an !== bn) return an < bn ? -1 : 1
    }
    return Number(a.slot) - Number(b.slot)
  }
}

const byOverallNumber = makeCardNumberComparator(true)
const bySlotCardNumber = makeCardNumberComparator(false)

// カード番号順（スロット番号ベース）に並べる。新規は番号順、再録・パラレルは上の決まりで並べる
export function sortByCardNumber(cards: Card[]): Card[] {
  return [...cards].sort(bySlotCardNumber)
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
    // カード番号順（既定）。パックセットで複数パックのカードが混ざる場合に備え、パック（弾コード）の順に並べ、
    // 区分ごとに、新規は番号順、再録・パラレルは決まった並び（上の makeCardNumberComparator）にする
    list = [...cards].sort(bySlotCardNumber)
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

// 並び替えキーに応じた「区切りの見出し」。
// カード番号順（overall）は、新規・再録・パラレルの区分ごとに区切る。パックをまたいでまとめて表示するとき
// （withSet）は、パックが変わった所にも区切りが入るよう、見出しにパックの弾コードも付ける。
// カード番号順（slot）は区切り不要なので null
export function getSortGroupLabel(card: Card, key: SortKey, opts?: { withSet?: boolean }): string | null {
  if (key === 'overall') return `${opts?.withSet ? `${card.set_code} ` : ''}${card.type}`
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