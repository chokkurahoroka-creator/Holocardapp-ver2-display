import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useSets } from '../hooks/useSets'
import { useCards } from '../hooks/useCards'
import { useSiteStatus } from '../hooks/useSiteStatus'
import { useUserCollection } from '../hooks/useUserCollection'
import { useUserDecks } from '../hooks/useUserDecks'
import { AuthPanel } from '../components/cardpool/AuthPanel'
import { CollectionGrid } from '../components/cardpool/CollectionGrid'
import { DeckList } from '../components/cardpool/DeckList'
import { DeckBuilder } from '../components/cardpool/DeckBuilder'
import { MaintenanceBanner } from '../components/MaintenanceBanner'
import { cardKey } from '../utils/cardKey'
import { SiteNav } from '../components/SiteNav'

const THIS_PAGE_KEY = 'cardpool'

export function CardPoolPage() {
  const { session, loading: authLoading, signOut } = useAuth()
  const { sets } = useSets()
  const [setCode, setSetCode] = useState<string | null>(null)
  const { cards } = useCards(setCode)
  const { status: siteStatus } = useSiteStatus()
  const isMaintenance = siteStatus[THIS_PAGE_KEY] === '作業中'

  const { collection, loading: collectionLoading, increment, decrement } = useUserCollection(session)
  const { decks, loading: decksLoading, createDeck, renameDeck, deleteDeck, saveDeckCards } = useUserDecks(session)
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null)
  const [tab, setTab] = useState<'zukan' | 'deck'>('zukan')

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0f0a04] text-white text-sm">読み込み中...</div>
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#0f0a04]">
        {isMaintenance && <MaintenanceBanner position="top" />}
        <AuthPanel />
      </div>
    )
  }

  const ownedCards = cards.filter((c) => (collection[cardKey(c)] ?? 0) > 0)
  const activeDeck = decks.find((d) => d.id === activeDeckId) ?? null

  return (
    <div className="min-h-screen bg-[#0f0a04]">
      {isMaintenance && <MaintenanceBanner position="top" />}
      <div className="p-6" style={{ marginTop: isMaintenance ? 28 : 0, marginBottom: isMaintenance ? 28 : 0 }}>
      <SiteNav />
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-white text-lg font-bold">カードプール・デッキ管理</h1>
          <button onClick={signOut} className="text-xs text-[#9aa5c0] border border-[#d4af6a]/30 rounded px-3 py-1">
            ログアウト
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('zukan')}
            className={`text-sm rounded px-3 py-1.5 ${
              tab === 'zukan' ? 'bg-[#d4af6a] text-[#1a1305] font-bold' : 'text-[#9aa5c0] border border-[#d4af6a]/30'
            }`}
          >
            図鑑（所持カード）
          </button>
          <button
            onClick={() => setTab('deck')}
            className={`text-sm rounded px-3 py-1.5 ${
              tab === 'deck' ? 'bg-[#d4af6a] text-[#1a1305] font-bold' : 'text-[#9aa5c0] border border-[#d4af6a]/30'
            }`}
          >
            デッキビルダー
          </button>
        </div>

        <select
          onChange={(e) => setSetCode(e.target.value || null)}
          value={setCode ?? ''}
          className="mb-4 rounded bg-black/30 border border-[#d4af6a]/30 px-3 py-2 text-sm text-white"
        >
          <option value="">弾を選択してください</option>
          {sets.map((s) => (
            <option key={s.set_code} value={s.set_code}>
              {s.set_code}（{s.set_name}）
            </option>
          ))}
        </select>

        {tab === 'zukan' &&
          (collectionLoading ? (
            <p className="text-sm text-[#9aa5c0]">読み込み中...</p>
          ) : (
            <CollectionGrid cards={cards} collection={collection} onIncrement={increment} onDecrement={decrement} />
          ))}

        {tab === 'deck' &&
          (decksLoading ? (
            <p className="text-sm text-[#9aa5c0]">読み込み中...</p>
          ) : (
            <div className="flex flex-col gap-4">
              <DeckList
                decks={decks}
                activeDeckId={activeDeckId}
                onSelect={setActiveDeckId}
                onCreate={createDeck}
                onRename={renameDeck}
                onDelete={async (id) => {
                    await deleteDeck(id)
                    if (activeDeckId === id) setActiveDeckId(null)
                  }}
              />
              {activeDeck ? (
                <DeckBuilder deck={activeDeck} ownedCards={ownedCards} collection={collection} onSave={saveDeckCards} />
              ) : (
                <p className="text-sm text-[#9aa5c0]">編集するデッキを選択、または新規作成してください</p>
              )}
            </div>
          ))}
      </div>
      {isMaintenance && <MaintenanceBanner position="bottom" />}
    </div>
  )
}