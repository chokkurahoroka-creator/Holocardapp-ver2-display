import { useMemo } from 'react'
import type { Card } from '../types/card'

type SkillRow = { skillType?: string; title?: string; text?: string }
type ArtRow = { name?: string; effectText?: string }

function skillsText(card: Card): string[] {
  const skills = (card.skills_json ?? []) as SkillRow[]
  return skills.flatMap((s) => [s.title, s.text]).filter((v): v is string => !!v)
}

function artsText(card: Card): string[] {
  const arts = (card.arts_json ?? []) as ArtRow[]
  return arts.flatMap((a) => [a.name, a.effectText]).filter((v): v is string => !!v)
}

// 検索用に、全角・半角、大文字・小文字の違いをそろえる（全角スペースは、半角スペースになる）
const normalize = (v: string): string => v.normalize('NFKC').toLowerCase()

// 検索語を、スペース（半角・全角）で区切った単語に分ける。「ときのそら ギフト」→ 「ときのそら」「ギフト」
export function splitSearchWords(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean)
}

// カード1枚の検索対象（名前・種類・番号・弾・タグ・固有スキルとアーツの文章）を、1つの文字列にまとめる。
// 検索語を打つたびに作り直さないよう、カードごとに覚えておく。項目の境目には改行を入れて、項目をまたいだ偶然の一致を防ぐ
const haystackCache = new WeakMap<Card, string>()
function haystackOf(c: Card): string {
  const cached = haystackCache.get(c)
  if (cached !== undefined) return cached
  // 軽量データ（cards_listビュー）は、固有スキル・アーツの文章が search_text にまとまっている
  const fields = c.lean
    ? [c.card_name, c.card_type, c.card_number, c.set_code, c.tags, c.search_text]
    : [c.card_name, c.card_type, c.card_number, c.set_code, c.tags, ...skillsText(c), ...artsText(c)]
  const text = normalize(fields.map((f) => (f ?? '').toString()).join('\n'))
  haystackCache.set(c, text)
  return text
}

// 複数の言葉は、すべてを含むカードだけ（AND）。それぞれの言葉は、どの項目に含まれていてもよい
function matchesWords(c: Card, words: string[]): boolean {
  const text = haystackOf(c)
  return words.every((w) => text.includes(w))
}

export function useCardSearch(cards: Card[], query: string) {
  return useMemo(() => {
    const words = splitSearchWords(query)
    if (words.length === 0) return cards
    return cards.filter((c) => matchesWords(c, words))
  }, [cards, query])
}