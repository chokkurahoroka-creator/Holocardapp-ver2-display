export type Card = {
  id: number
  set_code: string
  type: '新規' | '再録' | 'パラレル'
  slot: number
  card_number: string | null
  rarity: string | null
  card_type: string | null
  tags: string | null
  card_name: string
  attribute: string | null
  hp: number | null
  stage: string | null
  baton_touch_cost: number | null
  is_limited: boolean
  image_url: string | null
  arts_json: any[]
  skills_json: any[]
  rating_json: Record<string, number>
  rating_comment: string | null
  linked_card_key: string | null
  sync_source_key: string | null
  featured: boolean
  overall_number: number | null
  timestamp: string
  updated_at?: string
  original_number?: string | null // 再録・パラレルの元カードの番号（再録パックでカード番号がずれるため、元の番号を別に持つ）
  // 一覧用の軽量データ（cards_listビュー）から作ったカードのとき true。
  // アーツ・固有スキル・評価（arts_json/skills_json/rating_json/rating_comment）は空で、詳細モーダルを開いたときに取得する
  lean?: boolean
  // 軽量データにだけ含まれる、フィルター・キーワード検索用の派生データ
  skill_types?: string[] // 固有スキルの種類（ギフト・コラボエフェクト等）
  special_attack_colors?: string[] // アーツの特攻対象色（重複なし）。軽量データには、cards_tokkou ビューから取得して付ける
  search_text?: string // 固有スキル・アーツの名前と効果文をまとめた検索用テキスト
}

export type SetInfo = {
  set_code: string
  set_name: string
  display_name?: string | null // 表示名（弾名が長いときの短い名前）。画面にはこちらを優先して出す
  total_new: number
  total_rerun: number
  total_parallel: number
  pack_image_url: string | null
  status: string
  default_flag: boolean
  pack_set_id?: number | null // 所属するパックセット（pack_sets.id）。未所属は null
  pack_type?: string | null // パックの種類（ブースターパック・スターターデッキなど。管理画面のパック管理で入力）
  release_date?: string | null // 発売日（YYYY-MM-DD。管理画面のパック管理で入力）
}

// 複数のパックをひとまとまりにして表示するためのパックセット
export type PackSet = {
  id: number
  name: string
}