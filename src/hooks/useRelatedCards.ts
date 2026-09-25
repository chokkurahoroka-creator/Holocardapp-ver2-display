import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Card } from '../types/card'

type RelatedCard = { card: Card; label: string }

function cardKey(c: Card): string {
  return `${c.set_code}__${c.type}__${c.slot}`
}

export function useRelatedCards(card: Card | null) {
  const [related, setRelated] = useState<RelatedCard[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!card) {
      setRelated([])
      return
    }
    let cancelled = false
    setLoading(true)
    setRelated([])

    const myKey = cardKey(card)
    const myLinkKeys = String(card.linked_card_key || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    async function fetchRelated() {
      const results: RelatedCard[] = []

      if ((card!.type === 'パラレル' || card!.type === '再録') && myLinkKeys.length) {
        // パラレル/再録 → リンク先の元カードを取得
        for (const key of myLinkKeys) {
          const parts = key.split('__')
          if (parts.length !== 3) continue
          const [setCode, type, slot] = parts
          const { data } = await supabase
            .from('cards')
            .select('*')
            .eq('set_code', setCode)
            .eq('type', type)
            .eq('slot', Number(slot))
            .maybeSingle()
          if (data) {
            const label = card!.sync_source_key === key ? '元カード' : '関連カード'
            results.push({ card: data, label })
          }
        }
      } else {
        // 元カード → 自分をlinked_card_keyに含むパラレル/再録カードを検索
        const { data } = await supabase
          .from('cards')
          .select('*')
          .like('linked_card_key', `%${myKey}%`)
        if (data) {
          data
            .filter((cand) =>
              String(cand.linked_card_key || '')
                .split(',')
                .map((s) => s.trim())
                .includes(myKey)
            )
            .forEach((cand) => results.push({ card: cand, label: '関連カード' }))
        }
      }

      if (!cancelled) {
        setRelated(results)
        setLoading(false)
      }
    }

    fetchRelated()
    return () => {
      cancelled = true
    }
  }, [card?.id])

  return { related, loading }
}