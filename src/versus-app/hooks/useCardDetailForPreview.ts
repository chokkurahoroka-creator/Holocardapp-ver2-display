// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ArtRow, SkillRow } from '../types/artsSkills'

// プレビューに出す、カードの詳細（固有スキル・アーツなど）
export type CardDetail = {
  hp: number | null
  baton_touch_cost: number | null
  stage: string | null
  attribute: string | null
  tags: string | null
  is_limited: boolean | null
  arts: ArtRow[]
  skills: SkillRow[]
}

const cache = new Map<number, CardDetail>()

// json 列の値（配列、または JSON 文字列）を、配列に直す
function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

async function fetchDetail(id: number): Promise<CardDetail> {
  const { data, error } = await supabase.from('cards').select('hp, baton_touch_cost, stage, attribute, tags, is_limited, arts_json, skills_json').eq('id', id).single()
  if (error) throw error
  const row = data as Record<string, unknown>
  return {
    hp: (row.hp as number | null) ?? null,
    baton_touch_cost: (row.baton_touch_cost as number | null) ?? null,
    stage: (row.stage as string | null) ?? null,
    attribute: (row.attribute as string | null) ?? null,
    tags: (row.tags as string | null) ?? null,
    is_limited: (row.is_limited as boolean | null) ?? null,
    arts: toArray<ArtRow>(row.arts_json),
    skills: toArray<SkillRow>(row.skills_json),
  }
}

type State = { id: number | null; detail: CardDetail | null; error: string }

// カードIDの詳細を取得する（取得済みのものは、再取得しない）
export function useCardDetailForPreview(cardId: number | null): { detail: CardDetail | null; loading: boolean; error: string } {
  const [state, setState] = useState<State>({ id: null, detail: null, error: '' })

  useEffect(() => {
    if (cardId === null) return
    const cached = cache.get(cardId)
    if (cached) {
      setState({ id: cardId, detail: cached, error: '' })
      return
    }
    let cancelled = false
    // マウスを動かしたときに、何度も取得しないよう、少し待ってから取得する
    const timer = window.setTimeout(async () => {
      try {
        const detail = await fetchDetail(cardId)
        cache.set(cardId, detail)
        if (!cancelled) setState({ id: cardId, detail, error: '' })
      } catch (err) {
        if (!cancelled) setState({ id: cardId, detail: null, error: err instanceof Error ? err.message : String(err) })
      }
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [cardId])

  const ready = state.id === cardId
  return { detail: ready ? state.detail : null, loading: cardId !== null && !ready, error: ready ? state.error : '' }
}