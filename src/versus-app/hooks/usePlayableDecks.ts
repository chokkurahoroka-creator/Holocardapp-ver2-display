// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DeckCard, DeckEntry, DeckRecipe } from '../utils/deckImage'

// プレイフィールド・対戦で「読み込めるデッキ」の一覧と、読み込み。管理画面と、公開サイト（display）の、両方で、同じコードが動く。
//   ・デッキレシピ（deck_recipes）… 管理画面の「デッキレシピ」で作ったデッキ。管理者・サブ管理者は、全員のぶん。メンバー・臨時は、自分のぶん（見える範囲は、データベースが決める）
//   ・マイデッキ（user_decks）… 公開サイトの「カードプール・デッキ」で作った、自分のデッキ。ログインしているときだけ
// IDは、「r:数字」（デッキレシピ）、「u:文字列」（マイデッキ）の形

export type PlayableDeck = { id: string; name: string; source: 'recipe' | 'user' }

const COLUMNS = 'id, set_code, type, slot, card_name, card_type, attribute, stage, rarity, card_number, image_url'
const CHUNK = 80 // 一度に問い合わせる、カードの数

type UserDeckRow = { id: string; deck_name: string; cards: Record<string, number> | null }

export function usePlayableDecks() {
  const [decks, setDecks] = useState<PlayableDeck[]>([])
  const [ready, setReady] = useState(false)
  const userDecks = useRef<Map<string, UserDeckRow>>(new Map())

  const refresh = useCallback(async () => {
    const { list, mine } = await fetchPlayableDeckList()
    userDecks.current = mine
    setDecks(list)
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
    const { data: listener } = supabase.auth.onAuthStateChange(() => void refresh())
    return () => listener.subscription.unsubscribe()
  }, [refresh])

  // デッキを読み込んで、盤面に置ける形（DeckRecipe）にする
  const load = async (id: string): Promise<DeckRecipe> => {
    if (id.startsWith('r:')) {
      const { data, error } = await supabase.from('deck_recipes').select('recipe').eq('id', Number(id.slice(2))).single()
      if (error) throw new Error(error.message)
      return (data as { recipe: DeckRecipe }).recipe
    }
    if (id.startsWith('u:')) {
      const deck = userDecks.current.get(id.slice(2))
      if (!deck) throw new Error('デッキが見つかりません')
      return buildRecipeFromCounts(deck.deck_name, deck.cards ?? {})
    }
    throw new Error('デッキの指定が正しくありません')
  }

  return { decks, ready, refresh, load }
}

// 読み込めるデッキの一覧を取る。ログインしていない・匿名のときは、空
export async function fetchPlayableDeckList(): Promise<{ list: PlayableDeck[]; mine: Map<string, UserDeckRow> }> {
  const { data: s } = await supabase.auth.getSession()
  const user = s.session?.user
  const list: PlayableDeck[] = []
  const mine = new Map<string, UserDeckRow>()
  if (user && !user.is_anonymous) {
    const [recipes, own] = await Promise.all([
      supabase.from('deck_recipes').select('id, name').order('created_at', { ascending: false }),
      supabase.from('user_decks').select('id, deck_name, cards').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])
    // 読めなかったとき（権限がない・表がない）は、そのぶんを、空にする
    for (const r of (recipes.data as { id: number; name: string }[] | null) ?? []) list.push({ id: `r:${r.id}`, name: r.name, source: 'recipe' })
    for (const d of (own.data as UserDeckRow[] | null) ?? []) {
      mine.set(d.id, d)
      list.push({ id: `u:${d.id}`, name: d.deck_name, source: 'user' })
    }
  }
  return { list, mine }
}

// 「カードID：枚数」のデッキ（マイデッキ）を、推し・エール・メインに振り分ける（カードの種類で見分ける）
export async function buildRecipeFromCounts(name: string, counts: Record<string, number>): Promise<DeckRecipe> {
  const ids = Object.keys(counts)
    .map(Number)
    .filter((n) => Number.isFinite(n) && (counts[String(n)] ?? 0) > 0)
  if (ids.length === 0) throw new Error('このデッキには、カードが入っていません')

  const cards = new Map<number, DeckCard>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase.from('cards').select(COLUMNS).in('id', ids.slice(i, i + CHUNK))
    if (error) throw new Error(error.message)
    for (const c of (data as DeckCard[]) ?? []) cards.set(c.id, c)
  }

  let oshi: DeckCard | null = null
  const yells: DeckEntry[] = []
  const main: DeckEntry[] = []
  for (const id of ids) {
    const card = cards.get(id)
    if (!card) continue // 削除されたカードは、飛ばす
    const count = counts[String(id)] ?? 0
    const type = card.card_type ?? ''
    if (type.includes('推し')) {
      oshi ??= card // 推しは、1枚だけ
    } else if (type.startsWith('エール')) {
      yells.push({ card, count })
    } else {
      main.push({ card, count })
    }
  }
  yells.sort((a, b) => a.card.card_name.localeCompare(b.card.card_name, 'ja'))
  return { name, oshi, yells, main, manual: false }
}