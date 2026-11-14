// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DeckRecipe } from '../utils/deckImage'

// 対戦ページの「デッキケース」用：保存したデッキの一覧と、保存・上書き・削除・並び順。
// 保存先は、管理画面の「デッキレシピ」と同じ deck_recipes テーブル（どちらで作っても、同じデッキが見える）。
// 見える範囲・作れる数の本当の制限は、データベースが決める（ここでは、画面の出し分けのため、上限も確認する）

// デッキケースの見た目（recipe の JSON の中に、一緒に保存する。無ければ、初期の見た目になる）
export type CaseStyle = 'gradient' | 'band'
export type DeckLook = {
  caseColor?: string // ケースの色（1色目。以前の保存データとの互換用で、caseColors の先頭と同じ）
  caseColors?: string[] // ケースの色（#rrggbb を、1〜3色）
  caseStyle?: CaseStyle // 色が複数のときの、塗り方：gradient＝なめらかなグラデーション／band＝斜めの帯（境目がくっきり）
  casePhoto?: string // ケースの窓に入れる写真（縮小した画像データ）
  showcase?: number[] // 代表カード（カードのID、最大3枚）。ケースにカーソルを乗せると、上に出る
}
export type DeckRecipeX = DeckRecipe & DeckLook

export type DeckCase = { id: number; name: string; image_url: string | null; updated_at: string; recipe: DeckRecipeX }

type Row = { id: number; name: string; image_url: string | null; updated_at: string; recipe: (Partial<DeckRecipe> & DeckLook) | null }

export const EMPTY_RECIPE: DeckRecipeX = { name: '新しいデッキ', oshi: null, yells: [], main: [], manual: false }

const HEX = /^#[0-9a-fA-F]{6}$/
const ORDER_KEY = 'deck_order' // 並び順の保存先：アカウントの user_metadata（別の端末でも、同じ順に並ぶ）

// 保存済みの内容を、安全に DeckRecipeX の形に直す（足りない項目は初期値で補う）
export function normalizeRecipe(p: (Partial<DeckRecipe> & DeckLook) | null | undefined): DeckRecipeX {
  const colors = Array.isArray(p?.caseColors) ? p.caseColors.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 3) : []
  if (colors.length === 0 && typeof p?.caseColor === 'string' && HEX.test(p.caseColor)) colors.push(p.caseColor)
  const style: CaseStyle | undefined = p?.caseStyle === 'band' || p?.caseStyle === 'gradient' ? p.caseStyle : undefined
  const photo = typeof p?.casePhoto === 'string' && /^(data:image\/|https?:\/\/)/.test(p.casePhoto) ? p.casePhoto : undefined
  const showcase = Array.isArray(p?.showcase) ? p.showcase.filter((n): n is number => typeof n === 'number').slice(0, 3) : undefined
  return {
    name: typeof p?.name === 'string' ? p.name : EMPTY_RECIPE.name,
    oshi: p?.oshi ?? null,
    yells: Array.isArray(p?.yells) ? p.yells : [],
    main: Array.isArray(p?.main) ? p.main : [],
    manual: p?.manual === true,
    ...(colors.length > 0 ? { caseColors: colors, caseColor: colors[0] } : {}),
    ...(style ? { caseStyle: style } : {}),
    ...(photo ? { casePhoto: photo } : {}),
    ...(showcase ? { showcase } : {}),
  }
}

// 管理画面の一覧に出す画像：推しホロメンの画像（なければ、メインの最初のカード）。
// 画像をアップロードする仕組み（管理画面の /api/upload）が、表示サイト側には無いため、カード画像をそのまま使う
function coverOf(r: DeckRecipe): string {
  return r.oshi?.image_url ?? r.main.find((e) => e.card.image_url)?.card.image_url ?? ''
}

// 並び順を当てはめる：保存した順 → まだ順番のないデッキ（新しく作ったもの）は、登録順で、後ろに並べる
function applyOrder(registered: DeckCase[], order: number[]): DeckCase[] {
  const byId = new Map(registered.map((d) => [d.id, d]))
  const ordered = order.map((id) => byId.get(id)).filter((d): d is DeckCase => !!d)
  const used = new Set(ordered.map((d) => d.id))
  return [...ordered, ...registered.filter((d) => !used.has(d.id))]
}

export function useDeckCases(limit: number | null) {
  const [registered, setRegistered] = useState<DeckCase[]>([]) // 登録順（IDの小さい順）
  const [order, setOrderState] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const lastUserId = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<number[] | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [{ data, error: err }, { data: sessionData }] = await Promise.all([
      supabase.from('deck_recipes').select('id, name, image_url, updated_at, recipe').order('id', { ascending: true }),
      supabase.auth.getSession(),
    ])
    lastUserId.current = sessionData.session?.user.id ?? null
    const savedOrder: unknown = sessionData.session?.user.user_metadata?.[ORDER_KEY]
    setOrderState(Array.isArray(savedOrder) ? savedOrder.filter((n): n is number => typeof n === 'number') : [])
    if (err) {
      setError(err.message)
      setRegistered([])
    } else {
      setError('')
      setRegistered(((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, image_url: r.image_url, updated_at: r.updated_at, recipe: normalizeRecipe(r.recipe) })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    // ログイン・ログアウトで、アカウントが変わったときだけ、取り直す（トークンの更新などでは、取り直さない）
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null
      if (uid !== lastUserId.current) void refresh()
    })
    return () => listener.subscription.unsubscribe()
  }, [refresh])

  const decks = useMemo(() => applyOrder(registered, order), [registered, order])
  const atLimit = limit !== null && decks.length >= limit

  // 並び順の保存（まだ送っていない分を、すぐ送る）。失敗したときは、エラーを投げる
  const flushOrder = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current)
    const ids = pending.current
    if (!ids) return
    pending.current = null
    const { error: err } = await supabase.auth.updateUser({ data: { [ORDER_KEY]: ids } })
    if (err) throw new Error(err.message)
  }, [])

  // 並び順を変える（画面には、すぐ反映して、保存は、少し待ってから、まとめて行う）
  const setOrder = useCallback(
    (ids: number[]) => {
      setOrderState(ids)
      pending.current = ids
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flushOrder().catch(() => undefined), 800)
    },
    [flushOrder],
  )

  // 画面を離れるときに、保存し忘れた並び順を、送る
  useEffect(() => () => void flushOrder().catch(() => undefined), [flushOrder])

  // 新しいデッキとして保存する。保存したデッキのIDを返す
  const saveAs = async (recipe: DeckRecipeX): Promise<number> => {
    if (atLimit) throw new Error(`デッキは、${limit}個までしか作れません（今：${decks.length}個）。不要なデッキを削除してください`)
    const { data, error: err } = await supabase.from('deck_recipes').insert({ name: recipe.name, recipe, image_url: coverOf(recipe) }).select('id').single()
    if (err) throw new Error(err.message)
    await refresh()
    return (data as { id: number }).id
  }

  // 保存済みのデッキを、今の内容で上書きする
  const overwrite = async (id: number, recipe: DeckRecipeX): Promise<void> => {
    const { error: err } = await supabase.from('deck_recipes').update({ name: recipe.name, recipe, image_url: coverOf(recipe), updated_at: new Date().toISOString() }).eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }

  const remove = async (id: number): Promise<void> => {
    const { error: err } = await supabase.from('deck_recipes').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }

  return { decks, loading, error, refresh, saveAs, overwrite, remove, setOrder, flushOrder, limit, atLimit }
}