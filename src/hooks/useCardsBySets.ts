import { useEffect, useState } from 'react'
import { fetchCardsBySets } from '../lib/fetchAllCards'
import type { Card } from '../types/card'

// 複数のパック（パックセットに含まれるパック）のカードをまとめて取得する
export function useCardsBySets(setCodes: string[]) {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const key = setCodes.join(',')

  useEffect(() => {
    if (!key) {
      setCards([])
      return
    }
    let cancelled = false
    setLoading(true)
    fetchCardsBySets(key.split(','))
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
  }, [key])

  return { cards, loading }
}