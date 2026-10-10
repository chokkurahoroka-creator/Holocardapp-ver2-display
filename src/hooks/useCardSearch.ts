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

function matchesQuery(c: Card, q: string): boolean {
  const query = q.toLowerCase()
  // 軽量データ（cards_listビュー）は、固有スキル・アーツの文章が search_text にまとまっている
  const fields = c.lean
    ? [c.card_name, c.card_type, c.card_number, c.set_code, c.tags, c.search_text]
    : [c.card_name, c.card_type, c.card_number, c.set_code, c.tags, ...skillsText(c), ...artsText(c)]
  return fields.some((f) => (f ?? '').toString().toLowerCase().includes(query))
}

export function useCardSearch(cards: Card[], query: string) {
  return useMemo(() => {
    if (!query.trim()) return cards
    return cards.filter((c) => matchesQuery(c, query))
  }, [cards, query])
}