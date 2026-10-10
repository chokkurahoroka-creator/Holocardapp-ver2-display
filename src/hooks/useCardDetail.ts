import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Card } from '../types/card'

// 詳細モーダル用。一覧の軽量データ（lean）のカードは、アーツ・固有スキル・評価が空なので、
// 開いたときにそのカード1枚の全項目を取得して合成する。一度取得したカードは使い回す。
const detailCache = new Map<number, Card>()

export function useCardDetail(card: Card | null): { card: Card | null; loadingDetail: boolean } {
  const [, forceRender] = useState(0)
  const id = card?.id
  const lean = !!card?.lean

  useEffect(() => {
    if (id === undefined || !lean || detailCache.has(id)) return
    let cancelled = false
    supabase
      .from('cards')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error(error)
        if (data) detailCache.set(id, data as Card)
        if (!cancelled) forceRender((n) => n + 1)
      })
    return () => {
      cancelled = true
    }
  }, [id, lean])

  if (!card) return { card: null, loadingDetail: false }
  if (!card.lean) return { card, loadingDetail: false }
  const full = detailCache.get(card.id)
  if (full) return { card: { ...card, ...full, lean: false }, loadingDetail: false }
  return { card, loadingDetail: true }
}