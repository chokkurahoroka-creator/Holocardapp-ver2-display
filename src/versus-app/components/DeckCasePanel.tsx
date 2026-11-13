// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDeckCases, normalizeRecipe, EMPTY_RECIPE, type DeckCase } from '../hooks/useDeckCases'
import { searchDeckCards, DECK_SEARCH_LIMIT } from '../hooks/useDeckCards'
import { useSetsAdmin, setLabel } from '../hooks/useSetsAdmin'
import { fetchDecklog, parseDeckCode, resolveDecklog } from '../utils/decklog'
import { insertByBasicOrder, orderedMain, type DeckCard, type DeckEntry, type DeckRecipe } from '../utils/deckImage'
import type { RoleInfo } from '../utils/roles'

// 対戦ページの「デッキ」タブ：デッキケースのように並べたギャラリー。
//   ・デッキをクリック → 詳細（中身の確認）。そこから「編集」
//   ・「新規作成」「デッキログから」 → 新しいデッキを作る（デッキログのデッキコードで、中身を読み込める）
// 保存先は、管理画面の「デッキレシピ」と同じ（deck_recipes）。ここで作ったデッキは、対戦ルームで、そのまま使える

const MAIN_TARGET = 50 // メインデッキの枚数
const YELL_TARGET = 20 // エールデッキの枚数
const MAX_COPIES = 4 // 同じカードを入れられる枚数（これを超えたら注意を出す）
const MAX_ENTRY = 50

const KIND_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: '推しホロメン', label: '推しホロメン' },
  { value: 'ホロメン', label: 'ホロメン' },
  { value: 'Buzzホロメン', label: 'Buzzホロメン' },
  { value: 'サポート', label: 'サポート' },
  { value: 'エール', label: 'エール' },
]

const total = (entries: DeckEntry[]) => entries.reduce((sum, e) => sum + e.count, 0)

// 同じカードがあれば枚数を1増やし、無ければ末尾に追加する
function bump(entries: DeckEntry[], card: DeckCard): DeckEntry[] {
  const found = entries.find((e) => e.card.id === card.id)
  if (!found) return [...entries, { card, count: 1 }]
  return entries.map((e) => (e.card.id === card.id ? { ...e, count: Math.min(MAX_ENTRY, e.count + 1) } : e))
}

// 枚数を変える。0枚になったら取り除く
function changeCount(entries: DeckEntry[], id: number, delta: number): DeckEntry[] {
  return entries.map((e) => (e.card.id === id ? { ...e, count: Math.max(0, Math.min(MAX_ENTRY, e.count + delta)) } : e)).filter((e) => e.count > 0)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Thumb({ card, width, onZoom }: { card: DeckCard; width: number; onZoom?: (card: DeckCard) => void }) {
  const height = Math.round(width * (88 / 63))
  if (!card.image_url) {
    return (
      <div style={{ width, height }} className="shrink-0 rounded bg-[#26324f] p-1 text-center text-[9px] text-[#9fc3ca] flex items-center justify-center">
        {card.card_name}
      </div>
    )
  }
  const img = <img src={card.image_url} alt={card.card_name} loading="lazy" style={{ width, height, objectFit: 'cover', borderRadius: 4, background: '#26324f' }} />
  if (!onZoom) return <span className="shrink-0">{img}</span>
  return (
    <button type="button" onClick={() => onZoom(card)} title="クリックで拡大表示" aria-label={`${card.card_name}を拡大表示`} className="block shrink-0 cursor-zoom-in rounded outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4ce0e6]">
      {img}
    </button>
  )
}

function Lightbox({ card, onClose }: { card: DeckCard; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div role="dialog" aria-label={`${card.card_name}の拡大表示`} className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-2 bg-black/85 p-4" onClick={onClose}>
      <img src={card.image_url ?? ''} alt={card.card_name} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
      <p className="text-xs text-white">
        {card.card_name}
        <span className="ml-2 hud-mono text-[#9fc3ca]">
          {card.card_number ?? ''} {card.rarity ?? ''}
        </span>
      </p>
    </div>,
    document.body,
  )
}

// ふちの付いた全画面のモーダル（開いている間は、後ろの画面が動かないようにする）
function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/75 p-2 sm:p-6" onClick={onClose}>
      <div className="hud-panel my-auto w-full max-w-5xl p-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function CountStepper({ count, onChange }: { count: number; onChange: (delta: number) => void }) {
  const btn = 'w-8 h-8 rounded border border-[#2a4a52] text-[#d7eef2] text-base leading-none hover:border-[#4ce0e6] disabled:opacity-40'
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" className={btn} onClick={() => onChange(-1)} aria-label="1枚減らす">
        −
      </button>
      <span className="hud-mono w-7 text-center text-sm text-white">{count}</span>
      <button type="button" className={btn} onClick={() => onChange(1)} aria-label="1枚増やす" disabled={count >= MAX_ENTRY}>
        ＋
      </button>
    </div>
  )
}

function countColor(n: number, target: number): string {
  return n === target ? '#3ddc97' : '#ffd76a'
}

// ---- ギャラリーの、デッキケース1個 ----
function DeckCaseTile({ deck, onOpen }: { deck: DeckCase; onOpen: () => void }) {
  const mainTotal = total(deck.recipe.main)
  const yellTotal = total(deck.recipe.yells)
  const complete = !!deck.recipe.oshi && mainTotal === MAIN_TARGET && yellTotal === YELL_TARGET
  const img = deck.recipe.oshi?.image_url ?? deck.image_url ?? ''
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${deck.name}（クリックで詳細）`}
      className="group min-w-0 overflow-hidden rounded-xl border-2 bg-[#0b1e26] text-left transition hover:-translate-y-0.5 hover:border-[#4ce0e6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4ce0e6]"
      style={{ borderColor: complete ? 'rgba(61,220,151,0.55)' : 'var(--hud-line)' }}
    >
      {/* ケースのふた（デッキ名のラベル） */}
      <div className="border-b border-[#2a4a52] bg-[#0f2a33] px-2 py-1.5">
        <div className="truncate text-xs font-bold text-white">{deck.name}</div>
      </div>
      {/* ケースの窓（推しホロメン） */}
      <div className="relative bg-[#071820]" style={{ aspectRatio: '63 / 80' }}>
        {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover object-top" /> : <div className="flex h-full items-center justify-center text-[10px] text-[#9fc3ca]">推しホロメン未設定</div>}
        <span className="absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: complete ? '#3ddc97' : '#ffd76a', color: '#04232a' }}>
          {complete ? '完成' : '作成中'}
        </span>
      </div>
      {/* ケースの底（枚数と、更新日時） */}
      <div className="px-2 py-1.5">
        <div className="hud-mono flex flex-wrap gap-x-2 text-[10px]">
          <span style={{ color: countColor(mainTotal, MAIN_TARGET) }}>
            メイン {mainTotal}/{MAIN_TARGET}
          </span>
          <span style={{ color: countColor(yellTotal, YELL_TARGET) }}>
            エール {yellTotal}/{YELL_TARGET}
          </span>
        </div>
        <div className="hud-mono text-[10px] text-[#9fc3ca]">{formatDate(deck.updated_at)}</div>
      </div>
    </button>
  )
}

// ---- 詳細（中身の確認） ----
function DeckDetail({ deck, onEdit, onDelete, onClose, onZoom }: { deck: DeckCase; onEdit: () => void; onDelete: () => void; onClose: () => void; onZoom: (card: DeckCard) => void }) {
  const r = deck.recipe
  const main = useMemo(() => orderedMain(r), [r])
  const mainTotal = total(r.main)
  const yellTotal = total(r.yells)
  const holomem = r.main.filter((e) => (e.card.card_type ?? '').includes('ホロメン')).reduce((n, e) => n + e.count, 0)
  const support = r.main.filter((e) => (e.card.card_type ?? '').startsWith('サポート')).reduce((n, e) => n + e.count, 0)
  const over = r.main.filter((e) => e.count > MAX_COPIES)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="hud-font min-w-0 flex-1 truncate text-base font-bold text-white">{deck.name}</h3>
        <button type="button" className="btn-primary" onClick={onEdit}>
          編集
        </button>
        <button type="button" className="btn-secondary" onClick={onDelete}>
          削除
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="hud-mono mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span style={{ color: countColor(mainTotal, MAIN_TARGET) }}>
          メイン {mainTotal} / {MAIN_TARGET}枚
        </span>
        <span style={{ color: countColor(yellTotal, YELL_TARGET) }}>
          エール {yellTotal} / {YELL_TARGET}枚
        </span>
        <span className="text-[#9fc3ca]">
          ホロメン {holomem}枚 ・ サポート {support}枚
        </span>
        <span className="text-[#9fc3ca]">更新 {formatDate(deck.updated_at)}</span>
      </div>
      {over.length > 0 && <p className="mb-3 text-[11px] text-[#ffd76a]">同じカードが{MAX_COPIES}枚を超えています：{over.map((e) => e.card.card_name).join('、')}</p>}

      <div className="mb-4 flex flex-wrap gap-6">
        <div>
          <div className="mb-1 text-xs text-[#9fc3ca]">推しホロメン</div>
          {r.oshi ? (
            <div className="flex items-center gap-2">
              <Thumb card={r.oshi} width={72} onZoom={onZoom} />
              <div className="max-w-[10rem] break-all text-sm text-white">{r.oshi.card_name}</div>
            </div>
          ) : (
            <p className="text-xs text-[#ffd76a]">未設定</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-xs text-[#9fc3ca]">エールデッキ</div>
          {r.yells.length === 0 ? (
            <p className="text-xs text-[#ffd76a]">未設定</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {r.yells.map((e) => (
                <div key={e.card.id} className="relative">
                  <Thumb card={e.card} width={52} onZoom={onZoom} />
                  <span className="hud-mono pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-[#0a0f1e]/90 px-1 py-0.5 text-[10px] font-bold leading-none text-white">×{e.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-1 text-xs text-[#9fc3ca]">メインデッキ（クリックで拡大）</div>
      {main.length === 0 ? (
        <p className="text-xs text-[#ffd76a]">カードが入っていません。「編集」から、カードを入れてください</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {main.map((e) => (
            <div key={e.card.id} className="relative">
              <Thumb card={e.card} width={76} onZoom={onZoom} />
              <span className="hud-mono pointer-events-none absolute bottom-1 right-1 rounded bg-[#0a0f1e]/90 px-1.5 py-1 text-xs font-bold leading-none text-white">×{e.count}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ---- 編集（カード検索・枚数の調整・デッキログの読み込み） ----
function DeckEditor({ id, initial, focusImport, limitText, canSaveNew, onSave, onCancel, onZoom }: { id: number | null; initial: DeckRecipe; focusImport: boolean; limitText: string; canSaveNew: boolean; onSave: (recipe: DeckRecipe) => Promise<void>; onCancel: () => void; onZoom: (card: DeckCard) => void }) {
  const { sets } = useSetsAdmin()
  const [recipe, setRecipe] = useState<DeckRecipe>(initial)
  const [initialJson] = useState(() => JSON.stringify(initial))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // デッキログ
  const [code, setCode] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // カード検索
  const [query, setQuery] = useState('')
  const [setCodeFilter, setSetCodeFilter] = useState('')
  const [kind, setKind] = useState('')
  const [results, setResults] = useState<DeckCard[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const dirty = JSON.stringify(recipe) !== initialJson
  const isEmpty = !recipe.oshi && recipe.main.length === 0 && recipe.yells.length === 0
  const mainTotal = total(recipe.main)
  const yellTotal = total(recipe.yells)
  const sortedMain = useMemo(() => orderedMain(recipe), [recipe])
  const overCopies = recipe.main.filter((e) => e.count > MAX_COPIES)
  const hasFilter = !!(query.trim() || setCodeFilter || kind)

  // 検索（入力が止まってから実行する）。検索語・弾・種類のどれかを指定したときだけ検索する
  useEffect(() => {
    if (!hasFilter) {
      setResults([])
      setSearchError('')
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const r = await searchDeckCards({ query, setCode: setCodeFilter, kind, type: '', inName: true, inSkills: true, inTags: true })
        if (!cancelled) {
          setResults(r.cards)
          setSearchError('')
        }
      } catch (err) {
        if (!cancelled) setSearchError('検索エラー: ' + (err instanceof Error ? err.message : String(err)))
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [hasFilter, query, setCodeFilter, kind])

  const countInDeck = useMemo(() => {
    const m = new Map<number, number>()
    recipe.main.forEach((e) => m.set(e.card.id, e.count))
    recipe.yells.forEach((e) => m.set(e.card.id, e.count))
    if (recipe.oshi) m.set(recipe.oshi.id, 1)
    return m
  }, [recipe])

  // カードの種類に合わせて、入れる場所を決める（推しホロメン→推し枠、エール→エール、それ以外→メインデッキ）
  const addCard = (card: DeckCard) => {
    const t = card.card_type ?? ''
    setRecipe((prev) => {
      if (t.includes('推し')) return { ...prev, oshi: card }
      if (t.startsWith('エール')) return { ...prev, yells: bump(prev.yells, card) }
      // 手動の並びのときは、基本の並びで合う位置に入れる（既にあるカードは、枚数だけ増える）
      if (prev.manual && !prev.main.some((e) => e.card.id === card.id)) return { ...prev, main: insertByBasicOrder(prev.main, { card, count: 1 }) }
      return { ...prev, main: bump(prev.main, card) }
    })
  }

  const handleImport = async () => {
    const c = parseDeckCode(code)
    if (!c) {
      setImportMessage({ ok: false, text: 'デッキコードを読み取れません。デッキログの「デッキコード」（英数字）か、デッキのURLを入れてください' })
      return
    }
    if (!isEmpty && !window.confirm('今のデッキの内容は、デッキログのデッキに置き換わります。読み込みますか？')) return
    setImporting(true)
    setImportMessage(null)
    try {
      const deck = await fetchDecklog(c)
      const r = await resolveDecklog(deck)
      setRecipe(r.recipe)
      const base = `読み込みました：推し ${r.recipe.oshi ? 1 : 0}枚／エール ${total(r.recipe.yells)}枚／メイン ${total(r.recipe.main)}枚（${r.matched}/${r.requested}枚）`
      setImportMessage({ ok: r.missing.length === 0, text: r.missing.length === 0 ? base : `${base}。カードデータに見つからなかったカード：${r.missing.join('、')}（必要なら、左の検索で入れてください）` })
    } catch (err) {
      setImportMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setImporting(false)
    }
  }

  const handleSave = async () => {
    const name = recipe.name.trim() || '新しいデッキ'
    setSaving(true)
    setMessage('保存中...')
    try {
      await onSave({ ...recipe, name })
    } catch (err) {
      setMessage('保存に失敗しました: ' + (err instanceof Error ? err.message : String(err)))
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (dirty && !window.confirm('編集中の内容は、保存されません。やめますか？')) return
    onCancel()
  }

  const saveDisabled = saving || isEmpty || (id === null && !canSaveNew)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="hud-font text-base font-bold text-white">{id === null ? 'デッキを作る' : 'デッキを編集'}</h3>
        <span className="hud-mono text-xs text-[#9fc3ca]">{limitText}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saveDisabled} title={id === null && !canSaveNew ? 'デッキの数が上限に達しています' : isEmpty ? 'カードを入れてください' : '保存する'}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleCancel} disabled={saving}>
            やめる
          </button>
        </div>
      </div>
      {id === null && !canSaveNew && <p className="mb-2 text-xs text-[#ffcf8a]">デッキの数が上限に達しているため、新しく保存できません。不要なデッキを削除してください</p>}
      {message && <p className="mb-2 whitespace-pre-wrap text-xs text-[#ffb0b0]">{message}</p>}

      {/* デッキログ */}
      <section className="mb-4 rounded-lg border border-[#2a4a52] bg-[#071820]/60 p-3">
        <div className="mb-1 text-xs font-bold text-[#d7eef2]">デッキログのコードから読み込む</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field hud-mono w-44 uppercase"
            value={code}
            maxLength={80}
            autoFocus={focusImport}
            placeholder="デッキコード（例：6EWZQ）"
            aria-label="デッキログのデッキコード"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !importing && code.trim()) void handleImport()
            }}
          />
          <button type="button" className="btn-secondary" onClick={() => void handleImport()} disabled={importing || !code.trim()}>
            {importing ? '読み込み中…' : '読み込む'}
          </button>
          <span className="text-[10px] text-[#9fc3ca]">デッキのURL（…/view/コード）でも読み込めます。今のデッキの中身は置き換わります（保存するまで、保存済みのデッキは変わりません）</span>
        </div>
        {importMessage && <p className={`mt-2 whitespace-pre-wrap text-xs ${importMessage.ok ? 'text-[#3ddc97]' : 'text-[#ffd76a]'}`}>{importMessage.text}</p>}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {/* カードを探す */}
        <section className="min-w-0">
          <h4 className="hud-font mb-2 text-sm font-bold text-white">カードを探す</h4>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="カード名・固有スキル・アーツ・タグで検索"
            aria-label="カード検索"
            className="mb-2 h-11 w-full rounded-lg border-2 border-[#4ce0e6]/60 bg-[#071820] px-3 text-base text-white outline-none transition placeholder:text-[#6f9aa3] focus:border-[#4ce0e6]"
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <select className="field w-full text-sm" value={setCodeFilter} onChange={(e) => setSetCodeFilter(e.target.value)} aria-label="パック">
              <option value="">パック：すべて</option>
              {sets.map((s) => (
                <option key={s.set_code} value={s.set_code}>
                  {s.set_code}（{setLabel(s)}）
                </option>
              ))}
            </select>
            <select className="field w-full text-sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="種類">
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  種類：{o.label}
                </option>
              ))}
            </select>
          </div>
          {!hasFilter && <p className="text-xs text-[#9fc3ca]">検索語を入力するか、パック・種類を選んでください。カードをクリックすると、デッキに1枚入ります（推しホロメンは推し枠、エールはエール、それ以外はメインデッキ）</p>}
          {searchError && <p className="text-xs text-[#ff4d4d]">{searchError}</p>}
          {searching && <p className="text-xs text-[#9fc3ca]">検索中...</p>}
          {!searching && hasFilter && !searchError && (
            <p className="mb-2 text-xs text-[#9fc3ca]">
              {results.length}件{results.length >= DECK_SEARCH_LIMIT ? `（上限の${DECK_SEARCH_LIMIT}件まで表示。条件を絞ってください）` : ''}
            </p>
          )}
          <div className="grid max-h-[480px] gap-2 overflow-y-auto pr-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
            {results.map((c) => {
              const n = countInDeck.get(c.id) ?? 0
              return (
                <button key={c.id} type="button" onClick={() => addCard(c)} title={`${c.set_code} ${c.card_name}（${c.type}）`} className="relative rounded-md border border-transparent p-0.5 text-left outline-none hover:border-[#4ce0e6] focus:border-[#4ce0e6]">
                  <Thumb card={c} width={78} />
                  <div className="mt-0.5 line-clamp-2 break-all text-[10px] leading-tight text-[#d7eef2]">{c.card_name}</div>
                  <div className="hud-mono text-[9px] text-[#9fc3ca]">
                    {c.set_code} {c.type}
                  </div>
                  {n > 0 && <span className="hud-mono absolute right-1 top-1 rounded bg-[#4ce0e6] px-1.5 py-0.5 text-[10px] font-bold text-[#04232a]">×{n}</span>}
                </button>
              )
            })}
          </div>
        </section>

        {/* デッキの内容 */}
        <section className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="hud-font text-sm font-bold text-white">デッキの内容</h4>
            <button
              type="button"
              className="btn-secondary ml-auto"
              onClick={() => {
                if (window.confirm('今のデッキの内容をすべて消して、空にしますか？（保存するまで、保存済みのデッキは変わりません）')) setRecipe({ ...EMPTY_RECIPE, name: recipe.name })
              }}
            >
              空にする
            </button>
          </div>

          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-[#9fc3ca]">デッキ名</span>
            <input className="field w-full" value={recipe.name} maxLength={40} onChange={(e) => setRecipe({ ...recipe, name: e.target.value })} />
          </label>

          <div className="mb-3">
            <div className="mb-1 text-xs" style={{ color: recipe.oshi ? '#3ddc97' : '#ffd76a' }}>
              推しホロメン {recipe.oshi ? 1 : 0} / 1枚
            </div>
            {recipe.oshi ? (
              <div className="flex items-center gap-3">
                <Thumb card={recipe.oshi} width={44} onZoom={onZoom} />
                <div className="min-w-0 flex-1 break-all text-sm text-white">{recipe.oshi.card_name}</div>
                <button type="button" className="btn-secondary shrink-0" onClick={() => setRecipe({ ...recipe, oshi: null })}>
                  外す
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#9fc3ca]">検索で、推しホロメンのカードをクリックすると、ここに入ります</p>
            )}
          </div>

          <div className="mb-3">
            <div className="mb-1 text-xs" style={{ color: countColor(yellTotal, YELL_TARGET) }}>
              エール {yellTotal} / {YELL_TARGET}枚
            </div>
            {recipe.yells.length === 0 && <p className="text-xs text-[#9fc3ca]">種類を「エール」にして検索し、クリックして入れます</p>}
            <ul className="flex flex-col gap-2">
              {recipe.yells.map((e) => (
                <li key={e.card.id} className="flex items-center gap-3">
                  <Thumb card={e.card} width={36} onZoom={onZoom} />
                  <div className="min-w-0 flex-1 break-all text-sm text-white">{e.card.card_name}</div>
                  <CountStepper count={e.count} onChange={(d) => setRecipe({ ...recipe, yells: changeCount(recipe.yells, e.card.id, d) })} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-xs" style={{ color: countColor(mainTotal, MAIN_TARGET) }}>
              メインデッキ {mainTotal} / {MAIN_TARGET}枚
            </div>
            {overCopies.length > 0 && <p className="mb-1 text-[11px] text-[#ffd76a]">同じカードが{MAX_COPIES}枚を超えています：{overCopies.map((e) => e.card.card_name).join('、')}</p>}
            {recipe.main.length === 0 && <p className="text-xs text-[#9fc3ca]">検索で、カードをクリックすると、ここに入ります</p>}
            <ul className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
              {sortedMain.map((e) => (
                <li key={e.card.id} className="flex items-center gap-3">
                  <Thumb card={e.card} width={36} onZoom={onZoom} />
                  <div className="min-w-0 flex-1">
                    <div className="break-all text-sm leading-tight text-white">{e.card.card_name}</div>
                    <div className="hud-mono text-[10px] text-[#9fc3ca]">
                      {e.card.set_code} {e.card.type}
                      {e.card.card_type ? ` / ${e.card.card_type}` : ''}
                    </div>
                  </div>
                  <CountStepper count={e.count} onChange={(d) => setRecipe({ ...recipe, main: changeCount(recipe.main, e.card.id, d) })} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  )
}

// ---- デッキタブ本体 ----
export function DeckCasePanel({ info }: { info: RoleInfo }) {
  const cases = useDeckCases(info.deckLimit)
  const [viewId, setViewId] = useState<number | null>(null) // 詳細を開いているデッキ
  const [editing, setEditing] = useState<{ id: number | null; recipe: DeckRecipe; focusImport: boolean } | null>(null) // 編集中（id が null のときは、新しいデッキ）
  const [zoom, setZoom] = useState<DeckCard | null>(null)
  const [notice, setNotice] = useState('')

  const viewing = cases.decks.find((d) => d.id === viewId) ?? null
  const limitText = cases.limit === null ? `${cases.decks.length}個` : `${cases.decks.length} / ${cases.limit}個`

  const closeAll = () => {
    setViewId(null)
    setEditing(null)
  }

  const startNew = (focusImport: boolean) => {
    setNotice('')
    setViewId(null)
    setEditing({ id: null, recipe: EMPTY_RECIPE, focusImport })
  }

  const startEdit = (deck: DeckCase) => setEditing({ id: deck.id, recipe: normalizeRecipe(deck.recipe), focusImport: false })

  const handleSave = async (recipe: DeckRecipe) => {
    if (editing?.id == null) {
      const id = await cases.saveAs(recipe)
      setViewId(id)
      setNotice(`「${recipe.name}」を保存しました`)
    } else {
      await cases.overwrite(editing.id, recipe)
      setViewId(editing.id)
      setNotice(`「${recipe.name}」を保存しました`)
    }
    setEditing(null)
  }

  const handleDelete = async (deck: DeckCase) => {
    if (!window.confirm(`デッキ「${deck.name}」を削除しますか？（元に戻せません）`)) return
    try {
      await cases.remove(deck.id)
      closeAll()
      setNotice(`「${deck.name}」を削除しました`)
    } catch (err) {
      setNotice('削除に失敗しました: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <section className="hud-panel min-w-0 p-4" aria-label="デッキ">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="hud-font text-sm font-bold text-white">デッキ</h2>
        <span className="hud-mono text-xs text-[#9fc3ca]">{cases.loading && cases.decks.length === 0 ? '' : limitText}</span>
        {cases.atLimit && <span className="rounded border border-[#ffb454]/60 bg-[#2a1c08]/70 px-2 py-0.5 text-xs font-bold text-[#ffcf8a]">上限に達しています</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => startNew(false)} disabled={cases.atLimit} title={cases.atLimit ? 'デッキの数が上限です' : '新しいデッキを作る'}>
            ＋ 新規作成
          </button>
          <button type="button" className="btn-secondary" onClick={() => startNew(true)} disabled={cases.atLimit} title={cases.atLimit ? 'デッキの数が上限です' : 'デッキログのデッキコードから、デッキを作る'}>
            デッキログから
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="mb-2 text-xs text-[#9fc3ca]">
          {notice}
        </p>
      )}
      {cases.error && <p className="mb-2 text-xs text-[#ff4d4d]">デッキを読み込めませんでした：{cases.error}</p>}
      {!cases.error && !cases.loading && cases.decks.length === 0 && <p className="text-xs text-[#9fc3ca]">まだデッキがありません。「新規作成」か「デッキログから」で、最初のデッキを作りましょう</p>}
      {cases.loading && cases.decks.length === 0 && <p className="text-xs text-[#9fc3ca]">読み込み中...</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {cases.decks.map((d) => (
          <DeckCaseTile
            key={d.id}
            deck={d}
            onOpen={() => {
              setNotice('')
              setViewId(d.id)
            }}
          />
        ))}
      </div>

      {editing && (
        <Modal title="デッキの編集">
          <DeckEditor
            key={editing.id ?? 'new'}
            id={editing.id}
            initial={editing.recipe}
            focusImport={editing.focusImport}
            limitText={limitText}
            canSaveNew={!cases.atLimit}
            onSave={handleSave}
            onCancel={() => (editing.id === null ? closeAll() : setEditing(null))}
            onZoom={setZoom}
          />
        </Modal>
      )}
      {!editing && viewing && (
        <Modal title={`デッキの詳細：${viewing.name}`} onClose={closeAll}>
          <DeckDetail deck={viewing} onEdit={() => startEdit(viewing)} onDelete={() => void handleDelete(viewing)} onClose={closeAll} onZoom={setZoom} />
        </Modal>
      )}
      {zoom?.image_url && <Lightbox card={zoom} onClose={() => setZoom(null)} />}
    </section>
  )
}