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

// 弾（set_code）→通し番号の順。通し番号が未設定のカードは、その弾の末尾に区分・スロット番号順で並べる
function byOverallNumber(a: Card, b: Card) {
  const setCmp = (a.set_code || '').localeCompare(b.set_code || '')
  if (setCmp !== 0) return setCmp
  const an = a.overall_number ?? Number.POSITIVE_INFINITY
  const bn = b.overall_number ?? Number.POSITIVE_INFINITY
  if (an !== bn) return an < bn ? -1 : 1
  return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || Number(a.slot) - Number(b.slot)
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