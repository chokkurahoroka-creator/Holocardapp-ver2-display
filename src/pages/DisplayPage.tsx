import { useEffect, useState } from 'react'
import { useSets } from '../hooks/useSets'
import { useCards } from '../hooks/useCards'
import { useCardSearch } from '../hooks/useCardSearch'
import { useSiteStatus } from '../hooks/useSiteStatus'
import { sortCards, type SortKey, type SortDir } from '../utils/sortCards'
import { CardGrid } from '../components/CardGrid'
import { CardModal } from '../components/CardModal'
import { MaintenanceBanner } from '../components/MaintenanceBanner'
import type { Card } from '../types/card'
import { useFavorites } from '../hooks/useFavorites'
import { downloadCardsAsZip } from '../lib/download'
import { logEvent, logDownloadEvents } from '../lib/logEvent'
import { SiteNav } from '../components/SiteNav'

const THIS_PAGE_KEY = 'display'

export function DisplayPage() {
  const { sets } = useSets()
  const [setCode, setSetCode] = useState<string | null>(null)
  const { cards, loading } = useCards(setCode)
  const { status: siteStatus } = useSiteStatus()
  const isMaintenance = siteStatus[THIS_PAGE_KEY] === '作業中'

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('slot')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const searched = useCardSearch(cards, searchQuery)
  const sorted = sortCards(searched, sortKey, sortDir)

  const [navIndex, setNavIndex] = useState(-1)

  // ----- サイト訪問ログ：初回マウント時に1回だけ記録 -----
  useEffect(() => {
    logEvent('visit')
  }, [])

  // ----- 検索ログ：入力が止まって600ms経ったら記録（デバウンス） -----
  // 1文字打つたびに記録すると意味のないログが大量に溜まるため、
  // 「入力が止まった状態が一定時間続いたら、その時点のクエリを1件だけ記録する」という形にしている。
  // searchQueryが変わるたびにこのeffectが再実行され、前回セットしたタイマーはクリーンアップ関数で必ずキャンセルされる
  useEffect(() => {
    if (!searchQuery.trim()) return
    const timer = setTimeout(() => {
      logEvent('search', { query: searchQuery.trim() })
    }, 600)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleSelectRelated = (card: Card) => {
    const idx = sorted.findIndex((c) => c.id === card.id)
    if (idx !== -1) {
      setNavIndex(idx)
    } else {
      console.log('別弾の関連カードは現状未対応:', card.card_name)
    }
  }

  const handleCardClick = (card: Card) => {
    const idx = sorted.findIndex((c) => c.id === card.id)
    setNavIndex(idx)
    if (idx !== -1) {
      logEvent('view', { set_code: card.set_code, type: card.type, slot: card.slot, card_name: card.card_name })
    }
  }
  const handleClose = () => setNavIndex(-1)
  const handlePrev = () => setNavIndex((i) => (i - 1 + sorted.length) % sorted.length)
  const handleNext = () => setNavIndex((i) => (i + 1) % sorted.length)

  const currentCard = navIndex !== -1 ? sorted[navIndex] : null
  const { favGroups, activeGroup, setActiveGroup, isFav, createGroup, toggleFav, deleteGroup } = useFavorites()
  const handleToggleFav = (card: Card) => {
    if (!activeGroup) {
      const name = prompt('グループ名を入力してください（例: お気に入り）', 'お気に入り')
      if (name && name.trim()) createGroup(name.trim())
      return
    }
    if (!isFav(card, activeGroup)) {
      logEvent('favorite', { set_code: card.set_code, type: card.type, slot: card.slot, card_name: card.card_name })
    }
    toggleFav(card)
  }

  // ----- 一括選択ダウンロード -----
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [zipStatus, setZipStatus] = useState('')

  const handleToggleSelect = (card: Card) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(card.id)) next.delete(card.id)
      else next.add(card.id)
      return next
    })
  }

  const handleExitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setZipStatus('')
  }

  const handleBulkDownload = async () => {
    const selectedCards = sorted.filter((c) => selectedIds.has(c.id))
    if (!selectedCards.length) return
    try {
      await downloadCardsAsZip(selectedCards, (done, total) => {
        setZipStatus(`画像を取得中... (${done}/${total})`)
      })
      logDownloadEvents(selectedCards)
      setZipStatus(`${selectedCards.length}枚をダウンロードしました`)
    } catch (err) {
      setZipStatus('ダウンロードに失敗しました: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <>
      {isMaintenance && <MaintenanceBanner position="top" />}
      <div style={{ padding: 20, marginTop: isMaintenance ? 28 : 0, marginBottom: isMaintenance ? 28 : 0, paddingBottom: selectionMode ? 90 : 20 }}>
      <SiteNav />
        <select onChange={(e) => setSetCode(e.target.value)}>
          <option value="">選択してください</option>
          {sets.map((s) => (
            <option key={s.set_code} value={s.set_code}>
              {s.set_code}（{s.set_name}）
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="カード名で検索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ marginLeft: 10 }}
        />

        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={{ marginLeft: 10 }}>
          <option value="slot">枠番号順</option>
          <option value="rarity">レアリティ順</option>
          <option value="name">カード名順</option>
          <option value="hp">HP順</option>
        </select>
        <button onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>
          {sortDir === 'asc' ? '昇順' : '降順'}
        </button>

        <button
          onClick={() => (selectionMode ? handleExitSelectionMode() : setSelectionMode(true))}
          style={{ marginLeft: 10, background: selectionMode ? '#d4af6a' : undefined, color: selectionMode ? '#1a1305' : undefined }}
        >
          {selectionMode ? '選択モードを終了' : '選択してダウンロード'}
        </button>

        <div style={{ marginTop: 10 }}>
          {Object.keys(favGroups).map((name) => (
            <button
              key={name}
              onClick={() => setActiveGroup(name)}
              style={{
                marginRight: 6,
                fontWeight: activeGroup === name ? 'bold' : 'normal',
                background: activeGroup === name ? '#d4af6a' : undefined,
              }}
            >
              {name}（{favGroups[name].length}）
            </button>
          ))}
          <button
            onClick={() => {
              const name = prompt('新しいグループ名を入力してください', 'お気に入り')
              if (name && name.trim()) createGroup(name.trim())
            }}
          >
            ＋新しいグループ
          </button>
          {activeGroup && (
            <button onClick={() => deleteGroup(activeGroup)} style={{ marginLeft: 6 }}>
              「{activeGroup}」を削除
            </button>
          )}
        </div>

        {loading && <p>読み込み中...</p>}
        <p>{sorted.length}件</p>
        <CardGrid
          cards={sorted}
          onCardClick={handleCardClick}
          isFav={(c) => isFav(c, activeGroup)}
          onToggleFav={handleToggleFav}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
        />

        <CardModal
          card={currentCard}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
          hasNav={sorted.length > 1}
          onSelectCard={handleSelectRelated}
        />
      </div>

      {selectionMode && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: isMaintenance ? 28 : 0,
            background: '#1a1305',
            borderTop: '1px solid rgba(212,175,106,0.3)',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 900,
            color: '#fff',
          }}
        >
          <span>{selectedIds.size}枚選択中</span>
          <button
            onClick={handleBulkDownload}
            disabled={!selectedIds.size}
            style={{ background: '#d4af6a', color: '#1a1305', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 'bold' }}
          >
            選択した画像をダウンロード（ZIP）
          </button>
          <button onClick={() => setSelectedIds(new Set())}>選択を解除</button>
          {zipStatus && <span style={{ fontSize: 12, color: '#9aa5c0' }}>{zipStatus}</span>}
        </div>
      )}

      {isMaintenance && <MaintenanceBanner position="bottom" />}
    </>
  )
}