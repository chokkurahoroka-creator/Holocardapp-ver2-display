import type { Card } from '../../types/card'
import { cardKey } from '../../utils/cardKey'
import type { CollectionMap } from '../../hooks/useUserCollection'

type Props = {
  cards: Card[]
  collection: CollectionMap
  onIncrement: (key: string) => void
  onDecrement: (key: string) => void
}

export function CollectionGrid({ cards, collection, onIncrement, onDecrement }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {cards.map((c) => {
        const key = cardKey(c)
        const count = collection[key] ?? 0
        return (
          <div
            key={key}
            className={`rounded-lg border p-2 flex flex-col items-center gap-1 ${
              count > 0 ? 'border-[#d4af6a]/60' : 'border-[#d4af6a]/15 opacity-60'
            }`}
          >
            <img src={c.image_url ?? ''} alt={c.card_name} className="w-full aspect-[63/88] object-cover rounded" />
            <p className="text-[10px] text-white text-center line-clamp-1">{c.card_name}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDecrement(key)}
                disabled={count === 0}
                className="w-6 h-6 rounded bg-black/40 text-white text-xs disabled:opacity-30"
              >
                −
              </button>
              <span className="text-xs text-[#d4af6a] w-4 text-center">{count}</span>
              <button onClick={() => onIncrement(key)} className="w-6 h-6 rounded bg-[#d4af6a] text-[#1a1305] text-xs">
                ＋
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}