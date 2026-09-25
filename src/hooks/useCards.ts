import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Card } from '../types/card'

export function useCards(setCode: string | null) {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!setCode) return
    setLoading(true)
    supabase
      .from('cards')
      .select('*')
      .eq('set_code', setCode)
      .then(({ data, error }) => {
        if (error) console.error(error)
        setCards(data ?? [])
        setLoading(false)
      })
  }, [setCode])

  return { cards, loading }
}