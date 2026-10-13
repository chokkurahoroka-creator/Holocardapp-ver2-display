import { useEffect, useState } from 'react'
import { loadAllCards } from '../lib/fetchAllCards'
import type { Card } from '../types/card'

// enabled が false のあいだは、カードを取得しない（新着カードのときだけ全カードが必要、というような使い方のため）
export function useAllCards(enabled = true) {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    // 端末に保存済みのカードがあれば先にそれを表示し、更新があった分だけ裏で取得して差し替える
    loadAllCards({
      onCached: (rows) => {
        if (cancelled) return
        setCards(rows)
        setLoading(false)
      },
    })
      .then((rows) => {
        if (!cancelled) setCards(rows)
      })
      .catch((error) => {
        console.error(error)
        // 保存済みデータで表示できているときは、エラーでも消さない
        if (!cancelled) setCards((prev) => prev)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { cards, loading: enabled && loading }
}