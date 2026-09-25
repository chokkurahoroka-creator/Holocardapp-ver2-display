import { useState } from 'react'
import type { Deck } from '../../hooks/useUserDecks'

type Props = {
  decks: Deck[]
  activeDeckId: string | null
  onSelect: (deckId: string) => void
  onCreate: (name: string) => Promise<void>
  onRename: (deckId: string, name: string) => Promise<void>
  onDelete: (deckId: string) => Promise<void>
}

export function DeckList({ decks, activeDeckId, onSelect, onCreate, onRename, onDelete }: Props) {
  const [newName, setNewName] = useState('')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新しいデッキ名"
          className="flex-1 rounded bg-black/30 border border-[#d4af6a]/30 px-3 py-1.5 text-sm text-white"
        />
        <button
          onClick={async () => {
            if (!newName.trim()) return
            await onCreate(newName.trim())
            setNewName('')
          }}
          className="rounded bg-[#d4af6a] text-[#1a1305] font-bold px-3 py-1.5 text-sm"
        >
          ＋作成
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {decks.map((d) => (
          <div key={d.id} className="flex items-center gap-1">
            <button
              onClick={() => onSelect(d.id)}
              className={`text-xs rounded px-3 py-1.5 ${
                activeDeckId === d.id ? 'bg-[#d4af6a] text-[#1a1305] font-bold' : 'text-[#9aa5c0] border border-[#d4af6a]/30'
              }`}
            >
              {d.deck_name}
            </button>
            <button
              onClick={() => {
                const name = prompt('デッキ名を変更', d.deck_name)
                if (name && name.trim()) onRename(d.id, name.trim())
              }}
              className="text-[10px] text-[#9aa5c0] underline"
            >
              名前変更
            </button>
            <button
              onClick={() => {
                if (confirm(`「${d.deck_name}」を削除しますか？`)) onDelete(d.id)
              }}
              className="text-[10px] text-red-300 underline"
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}