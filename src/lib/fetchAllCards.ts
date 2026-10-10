import { supabase } from './supabase'
import type { Card } from '../types/card'

// Supabase(PostgREST)は1回のリクエストで最大1000行までしか返さないため、
// range()で1000行ずつ分けて取得し、すべて結合して返す。
// ページ間で行が重複・欠落しないよう、必ず主キー(id)で並べて取得する。
const PAGE_SIZE = 1000

export async function fetchAllCards(setCode?: string): Promise<Card[]> {
  const fetchPage = (from: number) => {
    let q = supabase.from('cards').select('*', { count: 'exact' })
    if (setCode) q = q.eq('set_code', setCode)
    return q.order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1)
  }

  const first = await fetchPage(0)
  if (first.error) throw first.error
  const rows: Card[] = [...((first.data ?? []) as Card[])]

  // 1ページ目に収まった（1000行未満）なら終わり
  if (rows.length < PAGE_SIZE) return rows

  if (typeof first.count === 'number') {
    // 総数が分かるので、残りのページを並列で取得する
    const offsets: number[] = []
    for (let from = PAGE_SIZE; from < first.count; from += PAGE_SIZE) offsets.push(from)
    const pages = await Promise.all(offsets.map((from) => fetchPage(from)))
    for (const page of pages) {
      if (page.error) throw page.error
      rows.push(...((page.data ?? []) as Card[]))
    }
    return rows
  }

  // 総数が取れなかった場合は、1000行未満のページが返るまで順番に取得する
  for (let from = PAGE_SIZE; ; from += PAGE_SIZE) {
    const page = await fetchPage(from)
    if (page.error) throw page.error
    const data = (page.data ?? []) as Card[]
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}