// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DeckRecipe } from '../utils/deckImage'

// 対戦ページの「デッキケース」用：保存したデッキの一覧と、保存・上書き・削除。
// 保存先は、管理画面の「デッキレシピ」と同じ deck_recipes テーブル（どちらで作っても、同じデッキが見える）。
// 見える範囲・作れる数の本当の制限は、データベースが決める（ここでは、画面の出し分けのため、上限も確認する）

export type DeckCase = { id: number; name: string; image_url: string | null; updated_at: string; recipe: DeckRecipe }

type Row = { id: number; name: string; image_url: string | null; updated_at: string; recipe: Partial<DeckRecipe> | null }

export const EMPTY_RECIPE: DeckRecipe = { name: '新しいデッキ', oshi: null, yells: [], main: [], manual: false }

// 保存済みの内容を、安全に DeckRecipe の形に直す（足りない項目は初期値で補う）
export function normalizeRecipe(p: Partial<DeckRecipe> | null | undefined): DeckRecipe {
  return {
    name: typeof p?.name === 'string' ? p.name : EMPTY_RECIPE.name,
    oshi: p?.oshi ?? null,
    yells: Array.isArray(p?.yells) ? p.yells : [],
    main: Array.isArray(p?.main) ? p.main : [],
    manual: p?.manual === true,
  }
}

// ギャラリーに出す画像：推しホロメンの画像（なければ、メインの最初のカード）。
// 画像をアップロードする仕組み（管理画面の /api/upload）が、表示サイト側には無いため、カード画像をそのまま使う
function coverOf(r: DeckRecipe): string {
  return r.oshi?.image_url ?? r.main.find((e) => e.card.image_url)?.card.image_url ?? ''
}

export function useDeckCases(limit: number | null) {
  const [decks, setDecks] = useState<DeckCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.from('deck_recipes').select('id, name, image_url, updated_at, recipe').order('updated_at', { ascending: false })
    if (err) {
      setError(err.message)
      setDecks([])
    } else {
      setError('')
      setDecks(((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, image_url: r.image_url, updated_at: r.updated_at, recipe: normalizeRecipe(r.recipe) })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    // ログイン・ログアウトのときは、見えるデッキが変わるので、取り直す
    const { data: listener } = supabase.auth.onAuthStateChange(() => void refresh())
    return () => listener.subscription.unsubscribe()
  }, [refresh])

  const atLimit = limit !== null && decks.length >= limit

  // 新しいデッキとして保存する。保存したデッキのIDを返す
  const saveAs = async (recipe: DeckRecipe): Promise<number> => {
    if (atLimit) throw new Error(`デッキは、${limit}個までしか作れません（今：${decks.length}個）。不要なデッキを削除してください`)
    const { data, error: err } = await supabase.from('deck_recipes').insert({ name: recipe.name, recipe, image_url: coverOf(recipe) }).select('id').single()
    if (err) throw new Error(err.message)
    await refresh()
    return (data as { id: number }).id
  }

  // 保存済みのデッキを、今の内容で上書きする
  const overwrite = async (id: number, recipe: DeckRecipe): Promise<void> => {
    const { error: err } = await supabase.from('deck_recipes').update({ name: recipe.name, recipe, image_url: coverOf(recipe), updated_at: new Date().toISOString() }).eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }

  const remove = async (id: number): Promise<void> => {
    const { error: err } = await supabase.from('deck_recipes').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }

  return { decks, loading, error, refresh, saveAs, overwrite, remove, limit, atLimit }
}