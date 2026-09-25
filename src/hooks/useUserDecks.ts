import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type DeckCardsMap = Record<string, number>

export type Deck = {
  id: string
  deck_name: string
  cards: DeckCardsMap
  created_at: string
  updated_at: string
}

export function useUserDecks(session: Session | null) {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session) {
      setDecks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('user_decks')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
    if (error) console.error(error)
    setDecks((data as Deck[]) ?? [])
    setLoading(false)
  }, [session])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createDeck = async (deckName: string) => {
    if (!session) return
    const { error } = await supabase.from('user_decks').insert({ user_id: session.user.id, deck_name: deckName, cards: {} })
    if (error) throw error
    await refresh()
  }

  const renameDeck = async (deckId: string, deckName: string) => {
    const { error } = await supabase.from('user_decks').update({ deck_name: deckName }).eq('id', deckId)
    if (error) throw error
    setDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, deck_name: deckName } : d)))
  }

  const deleteDeck = async (deckId: string) => {
    const { error } = await supabase.from('user_decks').delete().eq('id', deckId)
    if (error) throw error
    setDecks((prev) => prev.filter((d) => d.id !== deckId))
  }

  const saveDeckCards = async (deckId: string, cards: DeckCardsMap) => {
    const { error } = await supabase
      .from('user_decks')
      .update({ cards, updated_at: new Date().toISOString() })
      .eq('id', deckId)
    if (error) throw error
    setDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, cards } : d)))
  }

  return { decks, loading, createDeck, renameDeck, deleteDeck, saveDeckCards }
}