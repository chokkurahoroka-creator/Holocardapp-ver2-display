import type { Card } from '../types/card'

export type CardFilters = {
  skillType: string
  hpMin: string
  hpMax: string
  tag: string
  batonTouch: string
  attribute: string
  cardType: string
  stage: string
}

export const EMPTY_FILTERS: CardFilters = {
  skillType: '',
  hpMin: '',
  hpMax: '',
  tag: '',
  batonTouch: '',
  attribute: '',
  cardType: '',
  stage: '',
}

type SkillRow = { skillType?: string }

function cardSkillTypes(card: Card): string[] {
  const skills = (card.skills_json ?? []) as SkillRow[]
  return skills.map((s) => s.skillType).filter((v): v is string => !!v && v !== 'ー')
}

// タグ文字列から個々のタグを取り出す（空白・カンマ・読点・中黒区切りに対応）
function splitTags(tags: string | null | undefined): string[] {
  return (tags ?? '')
    .split(/[\s,、・]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function sortJa(values: string[]): string[] {
  return values.slice().sort((a, b) => a.localeCompare(b, 'ja'))
}

export function distinctSkillTypes(cards: Card[]): string[] {
  const set = new Set<string>()
  cards.forEach((c) => cardSkillTypes(c).forEach((t) => set.add(t)))
  return sortJa(Array.from(set))
}

export function distinctTags(cards: Card[]): string[] {
  const set = new Set<string>()
  cards.forEach((c) => splitTags(c.tags).forEach((t) => set.add(t)))
  return sortJa(Array.from(set))
}

export function distinctBatonTouch(cards: Card[]): number[] {
  const set = new Set<number>()
  cards.forEach((c) => {
    if (c.baton_touch_cost !== null && c.baton_touch_cost !== undefined) set.add(c.baton_touch_cost)
  })
  return Array.from(set).sort((a, b) => a - b)
}

export function distinctAttributes(cards: Card[]): string[] {
  return sortJa(Array.from(new Set(cards.map((c) => c.attribute).filter((v): v is string => !!v))))
}

export function distinctCardTypes(cards: Card[]): string[] {
  return sortJa(Array.from(new Set(cards.map((c) => c.card_type).filter((v): v is string => !!v))))
}

export function distinctStages(cards: Card[]): string[] {
  return sortJa(Array.from(new Set(cards.map((c) => c.stage).filter((v): v is string => !!v))))
}

export function applyCardFilters(cards: Card[], filters: CardFilters): Card[] {
  return cards.filter((c) => {
    if (filters.skillType && !cardSkillTypes(c).includes(filters.skillType)) return false
    if (filters.hpMin && (c.hp === null || c.hp === undefined || c.hp < Number(filters.hpMin))) return false
    if (filters.hpMax && (c.hp === null || c.hp === undefined || c.hp > Number(filters.hpMax))) return false
    if (filters.tag && !splitTags(c.tags).includes(filters.tag)) return false
    if (filters.batonTouch && String(c.baton_touch_cost ?? '') !== filters.batonTouch) return false
    if (filters.attribute && c.attribute !== filters.attribute) return false
    if (filters.cardType && c.card_type !== filters.cardType) return false
    if (filters.stage && c.stage !== filters.stage) return false
    return true
  })
}

export function hasActiveFilters(filters: CardFilters): boolean {
  return Object.values(filters).some((v) => v !== '')
}