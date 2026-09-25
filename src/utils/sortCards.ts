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

export type SortKey = 'slot' | 'rarity' | 'name' | 'hp'
export type SortDir = 'asc' | 'desc'

export function sortCards(cards: Card[], key: SortKey, dir: SortDir): Card[] {
  let list: Card[]
  if (key === 'rarity') {
    list = [...cards].sort((a, b) => rarityOrderIndex(a.rarity) - rarityOrderIndex(b.rarity) || byNameJa(a, b))
  } else if (key === 'name') {
    list = [...cards].sort(byNameJa)
  } else if (key === 'hp') {
    list = [...cards].sort((a, b) => (Number(a.hp) || 0) - (Number(b.hp) || 0) || byNameJa(a, b))
  } else {
    list = [...cards].sort((a, b) => Number(a.slot) - Number(b.slot))
  }
  if (dir === 'desc') list.reverse()
  return list
} 