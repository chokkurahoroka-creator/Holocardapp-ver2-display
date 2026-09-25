import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type CollectionMap = Record<string, number>

export function useUserCollection(session: Session | null) {
  const [collection, setCollection] = useState<CollectionMap>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session) {
      setCollection({})
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('user_collections')
      .select('collection')
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (error) console.error(error)
    setCollection((data?.collection as CollectionMap) ?? {})
    setLoading(false)
  }, [session])

  useEffect(() => {
    load()
  }, [load])

  // 1件ずつupsert(連打時の競合はlast-write-winsで許容。デバウンスは今回未実装)
  const setCardCount = async (cardKey: string, count: number) => {
    if (!session) return
    const next = { ...collection }
    if (count <= 0) {
      delete next[cardKey]
    } else {
      next[cardKey] = count
    }
    setCollection(next)
    const { error } = await supabase
      .from('user_collections')
      .upsert(
        { user_id: session.user.id, collection: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (error) console.error(error)
  }

  const increment = (cardKey: string) => setCardCount(cardKey, (collection[cardKey] ?? 0) + 1)
  const decrement = (cardKey: string) => setCardCount(cardKey, Math.max(0, (collection[cardKey] ?? 0) - 1))

  return { collection, loading, increment, decrement }
}