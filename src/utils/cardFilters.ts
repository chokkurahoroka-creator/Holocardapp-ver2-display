import type { Card } from '../types/card'

// logicは「選択したすべての条件（チップ1つ1つ）」の組み合わせ方。
// AND = 選んだ条件をすべて満たすカードだけ表示。OR = 選んだ条件のどれか1つでも満たせば表示。
// （カテゴリ内だから自動的にOR、というグループ化はせず、文字通り選択した個々の値単位でAND/ORを切り替える）
export type FilterLogic = 'and' | 'or'

export type CardFilters = {
  logic: FilterLogic
  // 区分（新規・再録・パラレル）。未選択ならすべて表示。選んだ区分のどれかに当てはまるカードだけを表示する。
  // 他の条件のAND/ORには含めず、常に「他の条件に加えて」絞り込む
  types: string[]
  skillTypes: string[]
  hpMin: string
  hpMax: string
  tags: string[]
  batonTouches: string[]
  attributes: string[]
  specialAttackColors: string[] // 特攻対象色（アーツの特攻の色）
  cardTypes: string[]
  stages: string[]
  setCodes: string[] // 「全カード検索」ページでのみ使用（カード一覧側は常に空）
}

export const EMPTY_FILTERS: CardFilters = {
  logic: 'and',
  types: [],
  skillTypes: [],
  hpMin: '',
  hpMax: '',
  tags: [],
  batonTouches: [],
  attributes: [],
  specialAttackColors: [],
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

// タグごとの付いているカード枚数（多い順）。よく使われるタグをワンタップ選択として並べるのに使う
export function tagCounts(cards: Card[]): { tag: string; count: number }[] {
  const map = new Map<string, number>()
  cards.forEach((c) => splitTags(c.tags).forEach((t) => map.set(t, (map.get(t) ?? 0) + 1)))
  return Array.from(map, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ja'))
}

// チップ1つ分の条件を外したフィルターを返す（HPは上限・下限をまとめて解除）
export function removeFilterChip(filters: CardFilters, category: keyof CardFilters, value: string): CardFilters {
  if (category === 'hpMin') return { ...filters, hpMin: '', hpMax: '' }
  const current = filters[category] as string[]
  return { ...filters, [category]: current.filter((v) => v !== value) }
}

export function distinctBatonTouch(cards: Card[]): number[] {
  const set = new Set<number>()
  cards.forEach((c) => set.add(batonTouchValue(c)))
  return Array.from(set).sort((a, b) => a - b)
}

// ---- カード色 ----
// 属性は「赤」のような1色、「無色」、複数色の「多色[赤青]」のいずれか。
const BASE_COLORS = ['白', '緑', '赤', '青', '紫', '黄']
// フィルターに並べるカード色の順番
const ATTRIBUTE_ORDER = [...BASE_COLORS, '多色', '無色', 'その他']

// ---- 特攻色 ----
// アーツの「特攻対象色」。軽量データでは special_attack_colors に入っている（cards_tokkou ビューから取得）。
// 全項目のデータ（arts_json を持つ）のときは、アーツから拾う
type ArtRow = { specialAttackColor?: string }

export function cardSpecialAttackColors(card: Card): string[] {
  if (card.special_attack_colors) return card.special_attack_colors
  return Array.from(new Set(((card.arts_json ?? []) as ArtRow[]).map((a) => (a?.specialAttackColor ?? '').trim()).filter(Boolean)))
}

// 複数色の属性から、含まれる色を取り出す。「多色[赤青]」のほか、過去に入れた「白/緑」「白・緑」の形も読み取る
function multiColorParts(attribute: string): string[] {
  const m = attribute.match(/^多色\[(.*)\]$/)
  if (m) return Array.from(m[1] ?? '').filter((ch) => BASE_COLORS.includes(ch))
  const parts = attribute.split(/[\s/／・,、+＋]+/).filter(Boolean)
  return parts.length >= 2 && parts.every((p) => BASE_COLORS.includes(p)) ? parts : []
}

// 属性をフィルターの選択肢（白・緑・…・多色・無色・その他）のどれに当たるかに直す
function attributeBucket(attribute: string | null | undefined): string | null {
  const a = (attribute ?? '').trim()
  if (!a) return null
  if (a.startsWith('多色') || multiColorParts(a).length >= 2) return '多色'
  if (a === '無色') return '無色'
  if (BASE_COLORS.includes(a)) return a
  return 'その他'
}

// 属性がフィルターの選択肢vに当てはまるか。
// 「赤」を選ぶと、赤を含む多色カード（多色[赤青]など）も表示する。「多色」はすべての多色カードが対象
function attributeMatches(attribute: string | null | undefined, v: string): boolean {
  const a = (attribute ?? '').trim()
  if (!a) return false
  if (v === '多色') return attributeBucket(a) === '多色'
  if (BASE_COLORS.includes(v)) return a === v || multiColorParts(a).includes(v)
  return attributeBucket(a) === v
}

// 特攻色の選択肢。カード色と同じ並び（白・緑・赤・青・紫・黄・無色）で、その他の値は最後に並べる
export function distinctSpecialAttackColors(cards: Card[]): string[] {
  const present = new Set<string>()
  cards.forEach((c) => cardSpecialAttackColors(c).forEach((v) => present.add(v)))
  const rank = (v: string) => {
    const i = ATTRIBUTE_ORDER.indexOf(v)
    return i === -1 ? ATTRIBUTE_ORDER.length : i
  }
  return Array.from(present).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ja'))
}

export function distinctAttributes(cards: Card[]): string[] {
  const present = new Set<string>()
  cards.forEach((c) => {
    const b = attributeBucket(c.attribute)
    if (b) present.add(b)
  })
  return ATTRIBUTE_ORDER.filter((v) => present.has(v))
}

// ---- カード種類 ----
// 推しホロメン → ホロメン → Buzzホロメン → サポート（イベント・アイテム・スタッフ・ツール・ファン・マスコット）→ エール
const CARD_TYPE_ORDER = [
  '推しホロメン',
  'ホロメン',
  'Buzzホロメン',
  'サポート・イベント',
  'サポート・アイテム',
  'サポート・スタッフ',
  'サポート・ツール',
  'サポート・ファン',
  'サポート・マスコット',
  'エール',
]

function cardTypeRank(t: string): number {
  const exact = CARD_TYPE_ORDER.indexOf(t)
  if (exact !== -1) return exact
  // 「サポート」だけなど、細かい種類が付いていないものは、サポートのグループの先頭に置く
  if (t.startsWith('サポート')) return CARD_TYPE_ORDER.indexOf('サポート・イベント') - 0.5
  return CARD_TYPE_ORDER.length // 上にない種類は最後に
}

export function distinctCardTypes(cards: Card[]): string[] {
  const values = Array.from(new Set(cards.map((c) => c.card_type).filter((v): v is string => !!v)))
  return values.sort((a, b) => cardTypeRank(a) - cardTypeRank(b) || a.localeCompare(b, 'ja'))
}

// ---- 進化レベル ----
const STAGE_ORDER = ['debut', '1st', '2nd', 'spot']

function stageRank(s: string): number {
  const i = STAGE_ORDER.indexOf(s.trim().toLowerCase())
  return i === -1 ? STAGE_ORDER.length : i
}

export function distinctStages(cards: Card[]): string[] {
  const values = Array.from(new Set(cards.map((c) => c.stage).filter((v): v is string => !!v)))
  return values.sort((a, b) => stageRank(a) - stageRank(b) || a.localeCompare(b, 'ja'))
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
  filters.attributes.forEach((v) => checks.push(attributeMatches(c.attribute, v)))
  filters.specialAttackColors.forEach((v) => checks.push(cardSpecialAttackColors(c).includes(v)))
  filters.cardTypes.forEach((v) => checks.push(c.card_type === v))
  filters.stages.forEach((v) => checks.push(c.stage === v))
  filters.setCodes.forEach((v) => checks.push(c.set_code === v))
  if (filters.hpMin || filters.hpMax) checks.push(hpInRange(c, filters))
  return checks
}

export function applyCardFilters(cards: Card[], filters: CardFilters): Card[] {
  return cards.filter((c) => {
    if (filters.types.length > 0 && !filters.types.includes(c.type)) return false
    const checks = activeChecks(c, filters)
    if (checks.length === 0) return true
    return filters.logic === 'or' ? checks.some(Boolean) : checks.every(Boolean)
  })
}

export function hasActiveFilters(filters: CardFilters): boolean {
  return (
    filters.types.length > 0 ||
    filters.skillTypes.length > 0 ||
    filters.hpMin !== '' ||
    filters.hpMax !== '' ||
    filters.tags.length > 0 ||
    filters.batonTouches.length > 0 ||
    filters.attributes.length > 0 ||
    filters.specialAttackColors.length > 0 ||
    filters.cardTypes.length > 0 ||
    filters.stages.length > 0 ||
    filters.setCodes.length > 0
  )
}

// 現在アクティブなフィルター条件を「カテゴリ: 値」のチップ一覧として返す（選択解除ボタン用）
export function activeFilterChips(filters: CardFilters): { category: keyof CardFilters; value: string; label: string }[] {
  const chips: { category: keyof CardFilters; value: string; label: string }[] = []
  filters.types.forEach((v) => chips.push({ category: 'types', value: v, label: `区分: ${v}` }))
  filters.skillTypes.forEach((v) => chips.push({ category: 'skillTypes', value: v, label: `スキル種類: ${v}` }))
  filters.tags.forEach((v) => chips.push({ category: 'tags', value: v, label: `タグ: ${v}` }))
  filters.batonTouches.forEach((v) => chips.push({ category: 'batonTouches', value: v, label: `バトンタッチ: ${v}` }))
  filters.attributes.forEach((v) => chips.push({ category: 'attributes', value: v, label: `カード色: ${v}` }))
  filters.specialAttackColors.forEach((v) => chips.push({ category: 'specialAttackColors', value: v, label: `特攻色: ${v}` }))
  filters.cardTypes.forEach((v) => chips.push({ category: 'cardTypes', value: v, label: `カード種類: ${v}` }))
  filters.stages.forEach((v) => chips.push({ category: 'stages', value: v, label: `進化レベル: ${v}` }))
  filters.setCodes.forEach((v) => chips.push({ category: 'setCodes', value: v, label: `弾: ${v}` }))
  if (filters.hpMin || filters.hpMax) {
    chips.push({ category: 'hpMin', value: '__hp__', label: `HP: ${filters.hpMin || '0'}〜${filters.hpMax || '∞'}` })
  }
  return chips
}