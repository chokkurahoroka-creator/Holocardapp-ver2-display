// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { supabase } from '../lib/supabase'
import type { DeckCard } from '../utils/deckImage'

const COLUMNS = 'id, set_code, type, slot, card_name, card_type, attribute, stage, rarity, card_number, image_url'
export const DECK_SEARCH_LIMIT = 150

export type DeckSearchOptions = {
  query: string // 検索語
  setCode: string // 弾（空ならすべて）
  kind: string // カード種類（空ならすべて。「サポート」はサポート全般）
  type: string // 区分（新規・再録・パラレル。空ならすべて）
  inName: boolean // カード名を検索対象にする
  inSkills: boolean // 固有スキル・アーツ（名前と効果文）を検索対象にする
  inTags: boolean // タグを検索対象にする
}

// 検索語を、PostgREST の or 条件の中で使える形（二重引用符で囲み、中の \ と " をエスケープ）にする
function quotePattern(word: string): string {
  const escaped = word.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"%${escaped}%"`
}

export type DeckSearchResult = {
  cards: DeckCard[]
  note: string // 検索対象を絞らざるを得なかったときの案内（空なら無し）
}

// デッキに入れるカードを探す。
// 固有スキル・アーツの検索には、一覧用ビュー cards_list の search_text（スキル・アーツの名前と効果文）を使う。
// ビューがまだ無い環境では、cards テーブルで、カード名とタグだけを検索する
export async function searchDeckCards(opts: DeckSearchOptions): Promise<DeckSearchResult> {
  const word = opts.query.trim()
  const build = (table: 'cards_list' | 'cards', allowSkills: boolean) => {
    let q = supabase
      .from(table)
      .select(COLUMNS)
      .order('set_code', { ascending: false })
      .order('slot', { ascending: true })
      .order('id', { ascending: true })
      .limit(DECK_SEARCH_LIMIT)

    if (word) {
      const pattern = quotePattern(word)
      const parts: string[] = []
      if (opts.inName || (!opts.inSkills && !opts.inTags)) parts.push(`card_name.ilike.${pattern}`)
      if (opts.inTags) parts.push(`tags.ilike.${pattern}`)
      if (opts.inSkills && allowSkills) parts.push(`search_text.ilike.${pattern}`)
      q = q.or(parts.join(','))
    }
    if (opts.setCode) q = q.eq('set_code', opts.setCode)
    if (opts.type) q = q.eq('type', opts.type)
    if (opts.kind === 'サポート') q = q.ilike('card_type', 'サポート%')
    else if (opts.kind) q = q.eq('card_type', opts.kind)
    return q
  }

  const first = await build('cards_list', true)
  if (!first.error) return { cards: (first.data ?? []) as DeckCard[], note: '' }

  // ビューが無い・検索できないときは、cards テーブルで、カード名とタグだけを探す
  const fallback = await build('cards', false)
  if (fallback.error) throw fallback.error
  const note = opts.inSkills ? '固有スキル・アーツの検索には、cards_list_view.sql の実行が必要です（今回は、カード名とタグだけを検索しました）' : ''
  return { cards: (fallback.data ?? []) as DeckCard[], note }
}