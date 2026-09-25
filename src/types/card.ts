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
  }
  
  export type SetInfo = {
    set_code: string
    set_name: string
    total_new: number
    total_rerun: number
    total_parallel: number
    pack_image_url: string | null
    status: string
    default_flag: boolean
  }