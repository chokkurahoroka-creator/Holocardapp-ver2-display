import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SetInfo } from '../types/card'

export function useSets() {
  const [sets, setSets] = useState<SetInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('sets')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error(error)
        setSets(data ?? [])
        setLoading(false)
      })
  }, [])

  return { sets, loading }
}