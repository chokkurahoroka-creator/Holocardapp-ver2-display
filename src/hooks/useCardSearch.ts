import { useMemo } from 'react'
import type { Card } from '../types/card'

function matchesQuery(c: Card, q: string): boolean {
  const query = q.toLowerCase()
  const fields = [c.card_name, c.card_type, c.card_number, c.set_code, c.tags]
  return fields.some((f) => (f ?? '').toString().toLowerCase().includes(query))
}

export function useCardSearch(cards: Card[], query: string) {
  return useMemo(() => {
    if (!query.trim()) return cards
    return cards.filter((c) => matchesQuery(c, query))
  }, [cards, query])
}