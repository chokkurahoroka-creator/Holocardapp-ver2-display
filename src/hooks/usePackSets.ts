import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PackSet } from '../types/card'

// パックセット（複数のパックをひとまとまりにして表示するための設定）。
// pack_sets テーブルが未作成の環境では、エラーにせず空として扱う（従来どおり、パックごとの表示になる）
export function usePackSets() {
  const [packSets, setPackSets] = useState<PackSet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('pack_sets')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.warn('pack_sets を取得できませんでした（パックごとの表示になります）', error.message)
        setPackSets((data ?? []) as PackSet[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { packSets, loading }
}