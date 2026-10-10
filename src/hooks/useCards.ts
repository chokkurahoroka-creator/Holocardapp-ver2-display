import { useEffect, useState } from 'react'
import { fetchAllCards } from '../lib/fetchAllCards'
import type { Card } from '../types/card'

export function useCards(setCode: string | null) {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!setCode) return
    let cancelled = false
    setLoading(true)
    // 1つの弾が1000枚を超えても取りこぼさないよう、ページ分けして取得する
    fetchAllCards(setCode)
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
  }, [setCode])

  return { cards, loading }
}