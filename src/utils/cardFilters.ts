import type { Card } from '../types/card'

// logicは「選択したすべての条件（チップ1つ1つ）」の組み合わせ方。
// AND = 選んだ条件をすべて満たすカードだけ表示。OR = 選んだ条件のどれか1つでも満たせば表示。
// （カテゴリ内だから自動的にOR、というグループ化はせず、文字通り選択した個々の値単位でAND/ORを切り替える）
export type FilterLogic = 'and' | 'or'

export type CardFilters = {
  logic: FilterLogic
  skillTypes: string[]
  hpMin: string
  hpMax: string
  tags: string[]
  batonTouches: string[]
  attributes: string[]
  cardTypes: string[]
  stages: string[]
  setCodes: string[] // 「全カード検索」ページでのみ使用（カード一覧側は常に空）
}

export const EMPTY_FILTERS: CardFilters = {
  logic: 'and',
  skillTypes: [],
  hpMin: '',
  hpMax: '',
  tags: [],
  batonTouches: [],
  attributes: [],
  cardTypes: [],
  stages: [],
  setCodes: [],
}

type SkillRow = { skillType?: string }

function cardSkillTypes(card: Card): string[] {
  // 軽量データ（cards_listビュー）では、スキルの種類が skill_types に入っている
  if (card.lean) return (card.skill_types ?? []).filter((v) => !!v && v !== 'ー')
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

// バトンタッチ未設定（null/undefined）のカードは0として扱う
function batonTouchValue(c: Card): number {
  return c.baton_touch_cost ?? 0
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
  cards.forEach((c) => set.add(batonTouchValue(c)))
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

// カードが実際に持っているHPの最小・最大値（スライダーの可動域に使う）。カードが無ければ既定で0〜200
export function hpBounds(cards: Card[]): { min: number; max: number } {
  const values = cards.map((c) => c.hp).filter((v): v is number => v !== null && v !== undefined)
  if (values.length === 0) return { min: 0, max: 200 }
  const min = Math.floor(Math.min(...values) / 10) * 10
  const max = Math.ceil(Math.max(...values) / 10) * 10
  return { min, max: Math.max(max, min + 10) }
}

function hpInRange(c: Card, filters: CardFilters): boolean {
  if (c.hp === null || c.hp === undefined) return false
  if (filters.hpMin && c.hp < Number(filters.hpMin)) return false
  if (filters.hpMax && c.hp > Number(filters.hpMax)) return false
  return true
}

// 選択された条件を、個々の値ごとに1つずつの判定関数として並べる（AND/ORはこの配列単位で適用する）
function activeChecks(c: Card, filters: CardFilters): boolean[] {
  const checks: boolean[] = []
  filters.skillTypes.forEach((v) => checks.push(cardSkillTypes(c).includes(v)))
  filters.tags.forEach((v) => checks.push(splitTags(c.tags).includes(v)))
  filters.batonTouches.forEach((v) => checks.push(String(batonTouchValue(c)) === v))
  filters.attributes.forEach((v) => checks.push(c.attribute === v))
  filters.cardTypes.forEach((v) => checks.push(c.card_type === v))
  filters.stages.forEach((v) => checks.push(c.stage === v))
  filters.setCodes.forEach((v) => checks.push(c.set_code === v))
  if (filters.hpMin || filters.hpMax) checks.push(hpInRange(c, filters))
  return checks
}

export function applyCardFilters(cards: Card[], filters: CardFilters): Card[] {
  return cards.filter((c) => {
    const checks = activeChecks(c, filters)
    if (checks.length === 0) return true
    return filters.logic === 'or' ? checks.some(Boolean) : checks.every(Boolean)
  })
}

export function hasActiveFilters(filters: CardFilters): boolean {
  return (
    filters.skillTypes.length > 0 ||
    filters.hpMin !== '' ||
    filters.hpMax !== '' ||
    filters.tags.length > 0 ||
    filters.batonTouches.length > 0 ||
    filters.attributes.length > 0 ||
    filters.cardTypes.length > 0 ||
    filters.stages.length > 0 ||
    filters.setCodes.length > 0
  )
}

// 現在アクティブなフィルター条件を「カテゴリ: 値」のチップ一覧として返す（選択解除ボタン用）
export function activeFilterChips(filters: CardFilters): { category: keyof CardFilters; value: string; label: string }[] {
  const chips: { category: keyof CardFilters; value: string; label: string }[] = []
  filters.skillTypes.forEach((v) => chips.push({ category: 'skillTypes', value: v, label: `スキル種類: ${v}` }))
  filters.tags.forEach((v) => chips.push({ category: 'tags', value: v, label: `タグ: ${v}` }))
  filters.batonTouches.forEach((v) => chips.push({ category: 'batonTouches', value: v, label: `バトンタッチ: ${v}` }))
  filters.attributes.forEach((v) => chips.push({ category: 'attributes', value: v, label: `カード色: ${v}` }))
  filters.cardTypes.forEach((v) => chips.push({ category: 'cardTypes', value: v, label: `カード種類: ${v}` }))
  filters.stages.forEach((v) => chips.push({ category: 'stages', value: v, label: `進化レベル: ${v}` }))
  filters.setCodes.forEach((v) => chips.push({ category: 'setCodes', value: v, label: `弾: ${v}` }))
  if (filters.hpMin || filters.hpMax) {
    chips.push({ category: 'hpMin', value: '__hp__', label: `HP: ${filters.hpMin || '0'}〜${filters.hpMax || '∞'}` })
  }
  return chips
}