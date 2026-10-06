import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Card } from '../types/card'

export function useAllCards() {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('cards')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error(error)
        setCards(data ?? [])
        setLoading(false)
      })
  }, [])

  return { cards, loading }
}