// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// カードのHPを、cards テーブルから取得して覚えておく（カードID → HP。HPが無い・分からないカードは null）。
// 保存済みのデッキなど、HPを持たない形で保存されたカードでも、HPが分かるようにするため、盤面に出たカードのIDだけを問い合わせる
export function useCardHp(ids: number[]): Record<number, number | null> {
  const [hp, setHp] = useState<Record<number, number | null>>({})
  const requested = useRef<Set<number>>(new Set())
  const key = ids.join(',')

  useEffect(() => {
    const list = key ? key.split(',').map(Number) : []
    const missing = list.filter((id) => !requested.current.has(id))
    if (missing.length === 0) return
    missing.forEach((id) => requested.current.add(id))
    void (async () => {
      const { data, error } = await supabase.from('cards').select('id, hp').in('id', missing)
      if (error) {
        console.warn('カードのHPを取得できませんでした', error.message)
        missing.forEach((id) => requested.current.delete(id)) // 次に盤面が変わったとき、もう一度取得する
        return
      }
      setHp((prev) => {
        const next = { ...prev }
        missing.forEach((id) => {
          next[id] = null
        })
        ;(data ?? []).forEach((row: { id: number; hp: number | null }) => {
          next[row.id] = typeof row.hp === 'number' && row.hp > 0 ? row.hp : null
        })
        return next
      })
    })()
  }, [key])

  return hp
}