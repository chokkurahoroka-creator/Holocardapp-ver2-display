import { useState } from 'react'
import type { Card } from '../../types/card'
import { cardKey } from '../../utils/cardKey'
import type { Deck, DeckCardsMap } from '../../hooks/useUserDecks'
import type { CollectionMap } from '../../hooks/useUserCollection'

type Props = {
  deck: Deck
  ownedCards: Card[]
  collection: CollectionMap
  onSave: (deckId: string, cards: DeckCardsMap) => Promise<void>
}

// 所持枚数を上限として採用できる(ドラッグ&ドロップは今回未実装、+/-ボタンでの増減のみ)
export function DeckBuilder({ deck, ownedCards, collection, onSave }: Props) {
  const [cards, setCards] = useState<DeckCardsMap>(deck.cards)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const totalInDeck = Object.values(cards).reduce((a, b) => a + b, 0)

  const addCard = (key: string) => {
    const owned = collection[key] ?? 0
    const current = cards[key] ?? 0
    if (current >= owned) return
    setCards({ ...cards, [key]: current + 1 })
  }

  const removeCard = (key: string) => {
    const current = cards[key] ?? 0
    if (current <= 1) {
      const next = { ...cards }
      delete next[key]
      setCards(next)
    } else {
      setCards({ ...cards, [key]: current - 1 })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('保存中...')
    try {
      await onSave(deck.id, cards)
      setMessage('保存しました')
    } catch (err) {
      setMessage('保存に失敗しました: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold">
          {deck.deck_name}（{totalInDeck}枚）
        </h3>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-[#d4af6a] text-[#1a1305] font-bold py-1.5 px-4 text-sm disabled:opacity-50"
        >
          {saving ? '保存中...' : 'デッキを保存'}
        </button>
      </div>
      {message && <p className="text-xs text-[#9aa5c0]">{message}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {ownedCards.map((c) => {
          const key = cardKey(c)
          const owned = collection[key] ?? 0
          const inDeck = cards[key] ?? 0
          return (
            <div key={key} className="rounded-lg border border-[#d4af6a]/20 p-2 flex flex-col items-center gap-1">
              <img src={c.image_url ?? ''} alt={c.card_name} className="w-full aspect-[63/88] object-cover rounded" />
              <p className="text-[10px] text-white text-center line-clamp-1">{c.card_name}</p>
              <p className="text-[10px] text-[#9aa5c0]">
                所持 {owned} / 採用 {inDeck}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => removeCard(key)}
                  disabled={inDeck === 0}
                  className="w-6 h-6 rounded bg-black/40 text-white text-xs disabled:opacity-30"
                >
                  −
                </button>
                <button
                  onClick={() => addCard(key)}
                  disabled={inDeck >= owned}
                  className="w-6 h-6 rounded bg-[#d4af6a] text-[#1a1305] text-xs disabled:opacity-30"
                >
                  ＋
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}