import { useEffect, useState } from 'react'
import { fetchAllCards } from '../lib/fetchAllCards'
import type { Card } from '../types/card'

export function useAllCards() {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // 取得上限（1000行）を超えるぶんも、ページ分けしてすべて取得する
    fetchAllCards()
      .then((rows) => {
        if (!cancelled) setCards(rows)
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) setCards([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { cards, loading }
}