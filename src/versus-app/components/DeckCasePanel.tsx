// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDeckCases, normalizeRecipe, EMPTY_RECIPE, type CaseStyle, type DeckCase, type DeckLook, type DeckRecipeX } from '../hooks/useDeckCases'
import { searchDeckCards, DECK_SEARCH_LIMIT } from '../hooks/useDeckCards'
import { useSetsAdmin, setLabel } from '../hooks/useSetsAdmin'
import { fetchDecklog, parseDeckCode, resolveDecklog } from '../utils/decklog'
import { insertByBasicOrder, orderedMain, type DeckCard, type DeckEntry } from '../utils/deckImage'
import type { RoleInfo } from '../utils/roles'
import { YELL_COLORS, YELL_COLOR_HEX } from '../types/artsSkills'

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

function StarButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={on ? '代表カードから外す' : '代表カードにする（最大3枚）'}
      className={`h-8 w-8 shrink-0 rounded border text-base leading-none ${on ? 'border-[#ffd76a] bg-[#2a2408] text-[#ffd76a]' : 'border-[#2a4a52] text-[#6f9aa3] hover:border-[#ffd76a]'}`}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

function countColor(n: number, target: number): string {
  return n === target ? '#3ddc97' : '#ffd76a'
}

// ---- デッキケースの見た目（色・写真・代表カード） ----
const DEFAULT_CASE_COLOR = '#2a8aa0'
const CASE_COLORS = ['#2a8aa0', '#243b6b', '#7b4fc9', '#e86fa6', '#c0392b', '#e6882e', '#d4b02a', '#2e9d6a', '#2b2f36', '#e8edf2']
const MAX_CASE_COLORS = 3
const CASE_DEPTH = 10 // ケースの厚み（右と上に見える面の幅・高さ。px）
const SHOWCASE_MAX = 3
const PHOTO_ASPECT = '63 / 76' // ケースの窓の縦横比（写真は、この形に切り抜く）

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(hex: string, target: number, t: number): string {
  const [r, g, b] = rgbOf(hex)
  const f = (v: number) => Math.round(v + (target - v) * t)
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}
const lighten = (hex: string, t: number) => mix(hex, 255, t)
const darken = (hex: string, t: number) => mix(hex, 0, t)

// 代表カード：選んだカード（デッキに入っているものだけ）。1枚も選んでいないときは、推し→メインの先頭から、自動で出す
function showcaseCards(r: DeckRecipeX): DeckCard[] {
  const all = new Map<number, DeckCard>()
  if (r.oshi) all.set(r.oshi.id, r.oshi)
  r.yells.forEach((e) => all.set(e.card.id, e.card))
  r.main.forEach((e) => all.set(e.card.id, e.card))
  const chosen = (r.showcase ?? []).map((id) => all.get(id)).filter((c): c is DeckCard => !!c && !!c.image_url)
  if (chosen.length > 0) return chosen.slice(0, SHOWCASE_MAX)
  const auto = [...(r.oshi ? [r.oshi] : []), ...orderedMain(r).map((e) => e.card)].filter((c) => !!c.image_url)
  return auto.slice(0, SHOWCASE_MAX)
}

// 写真を、ケースの窓の形に切り抜いて、小さくする（保存データが重くならないように）
async function fileToCoverDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('この画像は読み込めませんでした（JPEG・PNG・WebPなどを選んでください）'))
      i.src = url
    })
    const W = 300
    const H = Math.round((W * 76) / 63)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('画像を処理できませんでした')
    const scale = Math.max(W / img.width, H / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
    for (const q of [0.85, 0.75, 0.65, 0.5]) {
      const d = canvas.toDataURL('image/jpeg', q)
      if (d.length <= 60000) return d
    }
    return canvas.toDataURL('image/jpeg', 0.4)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ケースの色（1〜3色）。旧データ（1色だけ）にも対応
function caseColorsOf(r: DeckLook): string[] {
  return r.caseColors && r.caseColors.length > 0 ? r.caseColors : [r.caseColor ?? DEFAULT_CASE_COLOR]
}

// 編集画面で、「空にする」「デッキログの読み込み」をしても、残す見た目（色・写真）
function lookOf(r: DeckLook): DeckLook {
  return {
    ...(r.caseColors ? { caseColors: r.caseColors } : {}),
    ...(r.caseColor ? { caseColor: r.caseColor } : {}),
    ...(r.caseStyle ? { caseStyle: r.caseStyle } : {}),
    ...(r.casePhoto ? { casePhoto: r.casePhoto } : {}),
  }
}

// ケースの正面の塗り：1色＝ハイライト付きの1色／複数色＝グラデーション or 斜めの帯（境目がくっきり）
function caseFaceBackground(colors: string[], style: CaseStyle): string {
  const c1 = colors[0] ?? DEFAULT_CASE_COLOR
  if (colors.length < 2) return `linear-gradient(135deg, ${lighten(c1, 0.3)} 0%, ${c1} 45%, ${darken(c1, 0.34)} 100%)`
  if (style === 'band') {
    const n = colors.length
    return `linear-gradient(135deg, ${colors.map((c, i) => `${c} ${Math.round((i * 100) / n)}%, ${c} ${Math.round(((i + 1) * 100) / n)}%`).join(', ')})`
  }
  return `linear-gradient(135deg, ${colors.join(', ')})`
}

// エールデッキのエールの色（カードの「色」。無ければ、カード名から）
function yellColorOf(card: DeckCard): string {
  const a = card.attribute ?? ''
  if (a in YELL_COLOR_HEX) return a
  return YELL_COLORS.find((c) => card.card_name.includes(c)) ?? '無色'
}

// エールチップ：デッキに入っているエールの色（白・赤・青・緑・紫・黄・無色の順）と、その枚数
function yellChips(r: DeckRecipeX): { color: string; count: number }[] {
  const counts = new Map<string, number>()
  r.yells.forEach((e) => {
    const c = yellColorOf(e.card)
    counts.set(c, (counts.get(c) ?? 0) + e.count)
  })
  return YELL_COLORS.filter((c) => counts.has(c)).map((c) => ({ color: c, count: counts.get(c) ?? 0 }))
}

// 直線だけで作った立体のデッキケース1個（正面＋上の面＋右の面の、箱の形）。
// カーソルを乗せる（キーボードで選ぶ）と、少し持ち上がって、代表カードが上にせり上がる（乗せる前は、見えない）。
// onOpen が無いときは、クリックできない見本（編集画面のプレビュー・並び替え中）になる。overlay は、その上に重ねる部品
function CaseArt({ recipe, name, updatedAt, onOpen, overlay }: { recipe: DeckRecipeX; name: string; updatedAt?: string; onOpen?: () => void; overlay?: React.ReactNode }) {
  const colors = caseColorsOf(recipe)
  const c1 = colors[0] ?? DEFAULT_CASE_COLOR
  const cLast = colors[colors.length - 1] ?? c1
  const mainTotal = total(recipe.main)
  const yellTotal = total(recipe.yells)
  const complete = !!recipe.oshi && mainTotal === MAIN_TARGET && yellTotal === YELL_TARGET
  const photo = recipe.casePhoto ?? ''
  const img = photo || recipe.oshi?.image_url || ''
  const fan = showcaseCards(recipe)
  const chips = yellChips(recipe)
  const D = CASE_DEPTH

  const faceStyle: React.CSSProperties = {
    background: caseFaceBackground(colors, recipe.caseStyle ?? 'gradient'),
    border: `1px solid ${darken(c1, 0.55)}`,
    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.28)',
  }
  const faceClass = 'relative z-10 block w-full overflow-hidden text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4ce0e6]'

  const body = (
    <>
      {/* 背表紙（左の太い線） */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-2.5 sm:w-3" style={{ background: `linear-gradient(90deg, ${darken(c1, 0.55)} 0 55%, ${darken(c1, 0.25)} 55% 100%)` }} />
      <div className="py-1.5 pl-3.5 pr-1.5 sm:py-2 sm:pl-4 sm:pr-2">
        {/* デッキ名のラベル */}
        <div className="mb-1 truncate px-1.5 py-0.5 text-[10px] font-bold text-white sm:mb-1.5 sm:py-1 sm:text-xs" style={{ background: 'rgba(0, 0, 0, 0.42)' }}>
          {name}
        </div>
        {/* 窓（写真。無ければ、推しホロメン） */}
        <div className="relative overflow-hidden" style={{ aspectRatio: PHOTO_ASPECT, border: `2px solid ${darken(c1, 0.55)}`, boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.6)', background: '#071820' }}>
          {img ? <img src={img} alt="" loading="lazy" className={`h-full w-full object-cover ${photo ? 'object-center' : 'object-top'}`} /> : <div className="flex h-full items-center justify-center px-1 text-center text-[9px] text-[#9fc3ca]">推しホロメン未設定</div>}
          {/* 照り返し（斜めの直線） */}
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.3) 22%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.1) 60%, rgba(255,255,255,0.1) 66%, rgba(255,255,255,0) 66%)' }} />
          <span className="absolute bottom-0.5 left-0.5 px-1 py-px text-[9px] font-bold" style={{ background: complete ? '#3ddc97' : '#ffd76a', color: '#04232a' }}>
            {complete ? '完成' : '作成中'}
          </span>
        </div>
        {/* 枚数（左）と、エールチップの色（右下） */}
        <div className="mt-1 px-1.5 py-0.5 sm:mt-1.5 sm:py-1" style={{ background: 'rgba(0, 0, 0, 0.42)' }}>
          <div className="hud-mono flex flex-wrap gap-x-1.5 text-[9px] sm:text-[10px]">
            <span style={{ color: countColor(mainTotal, MAIN_TARGET) }}>メイン {mainTotal}</span>
            <span style={{ color: countColor(yellTotal, YELL_TARGET) }}>エール {yellTotal}</span>
          </div>
          <div className="flex min-h-[12px] items-end justify-between gap-1">
            <span className="hud-mono hidden text-[9px] text-[#d7eef2]/80 sm:block">{updatedAt ? formatDate(updatedAt) : ''}</span>
            <span className="ml-auto flex items-center gap-[3px]" aria-label={chips.length > 0 ? `エールの色：${chips.map((c) => `${c.color}${c.count}枚`).join('、')}` : 'エール未設定'}>
              {chips.map((c) => (
                <span key={c.color} title={`${c.color}エール ${c.count}枚`} className="inline-block h-2.5 w-2.5 rounded-full border border-black/60" style={{ background: YELL_COLOR_HEX[c.color] ?? '#9aa5a8' }} />
              ))}
            </span>
          </div>
        </div>
      </div>
      {overlay}
    </>
  )

  return (
    <div className="group relative hover:z-30 focus-within:z-30" style={{ marginTop: D, marginRight: D }}>
      {/* 代表カード：ケースの裏に隠れていて（見えない）、カーソルを乗せると、上にせり上がる */}
      {fan.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute left-[-15%] top-1 z-0 flex w-[130%] justify-center opacity-0 transition-[transform,opacity] duration-300 ease-out group-hover:-translate-y-[85%] group-hover:opacity-100 group-focus-within:-translate-y-[85%] group-focus-within:opacity-100 sm:left-[-25%] sm:w-[150%]">
          {fan.map((c, i) => (
            <img
              key={c.id}
              src={c.image_url ?? ''}
              alt=""
              loading="lazy"
              className="w-[36%] shadow-[0_6px_14px_rgba(0,0,0,0.65)]"
              style={{ marginLeft: i === 0 ? 0 : '-6%', transform: `rotate(${(i - (fan.length - 1) / 2) * 8}deg)`, transformOrigin: 'bottom center' }}
            />
          ))}
        </div>
      )}

      {/* 箱の本体：カーソルを乗せると、少し持ち上がる */}
      <div className="relative transition-transform duration-200 ease-out group-hover:-translate-y-1 group-focus-within:-translate-y-1">
        {/* 落ち影 */}
        <span aria-hidden className="absolute inset-0 z-0" style={{ transform: `translate(${D + 4}px, ${D + 6}px)`, background: 'rgba(0, 0, 0, 0.5)', filter: 'blur(7px)' }} />
        {onOpen ? (
          <button type="button" onClick={onOpen} title={`${name}（クリックで詳細）`} className={faceClass} style={faceStyle}>
            {body}
          </button>
        ) : (
          <div className={faceClass} style={faceStyle}>
            {body}
          </div>
        )}
        {/* 上の面（右へ、ななめに伸ばした、平行四辺形） */}
        <span aria-hidden className="absolute bottom-full left-0 z-10 w-full" style={{ height: D, background: lighten(c1, 0.38), boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.35)', transformOrigin: 'bottom left', transform: 'skewX(-45deg)' }} />
        {/* 右の面 */}
        <span aria-hidden className="absolute left-full top-0 z-10 h-full" style={{ width: D, background: darken(cLast, 0.5), boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.4)', transformOrigin: 'top left', transform: 'skewY(-45deg)' }} />
      </div>
    </div>
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
function DeckEditor({ id, initial, focusImport, limitText, canSaveNew, onSave, onCancel, onZoom }: { id: number | null; initial: DeckRecipeX; focusImport: boolean; limitText: string; canSaveNew: boolean; onSave: (recipe: DeckRecipeX) => Promise<void>; onCancel: () => void; onZoom: (card: DeckCard) => void }) {
  const { sets } = useSetsAdmin()
  const [recipe, setRecipe] = useState<DeckRecipeX>(initial)
  const [initialJson] = useState(() => JSON.stringify(initial))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [lookMessage, setLookMessage] = useState('')
  const [colorSlot, setColorSlot] = useState(0) // 今、色を変えている番号（0〜2）
  const [showcaseNote, setShowcaseNote] = useState('')

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

  // 代表カード：デッキに入っているカードの中から、3枚まで選ぶ（デッキから抜いたカードは、選択も外れる）
  const showcaseIds = useMemo(() => (recipe.showcase ?? []).filter((x) => countInDeck.has(x)), [recipe.showcase, countInDeck])
  const showcaseSlots = useMemo(() => {
    const all = new Map<number, DeckCard>()
    if (recipe.oshi) all.set(recipe.oshi.id, recipe.oshi)
    recipe.yells.forEach((e) => all.set(e.card.id, e.card))
    recipe.main.forEach((e) => all.set(e.card.id, e.card))
    return showcaseIds.map((x) => all.get(x)).filter((c): c is DeckCard => !!c)
  }, [recipe, showcaseIds])

  const toggleShowcase = (cardId: number) => {
    if (showcaseIds.includes(cardId)) {
      setRecipe({ ...recipe, showcase: showcaseIds.filter((x) => x !== cardId) })
      setShowcaseNote('')
      return
    }
    if (showcaseIds.length >= SHOWCASE_MAX) {
      setShowcaseNote(`代表カードは、${SHOWCASE_MAX}枚までです。先に、どれかを外してください`)
      return
    }
    setRecipe({ ...recipe, showcase: [...showcaseIds, cardId] })
    setShowcaseNote('')
  }

  // ケースの色（最大3色）。1色目は、以前の保存データとの互換のため、caseColor にも入れる
  const caseColors = caseColorsOf(recipe)
  const slot = Math.min(colorSlot, caseColors.length - 1)
  const setCaseColors = (next: string[]) => setRecipe((prev) => ({ ...prev, caseColors: next, caseColor: next[0] ?? DEFAULT_CASE_COLOR }))
  const setColorAt = (index: number, hex: string) => setCaseColors(caseColors.map((c, i) => (i === index ? hex : c)))
  const addColor = () => {
    if (caseColors.length >= MAX_CASE_COLORS) return
    const next = CASE_COLORS.find((c) => !caseColors.includes(c)) ?? DEFAULT_CASE_COLOR
    setCaseColors([...caseColors, next])
    setColorSlot(caseColors.length)
  }
  const removeColor = (index: number) => {
    if (caseColors.length <= 1) return
    setCaseColors(caseColors.filter((_, i) => i !== index))
    setColorSlot(Math.max(0, index - 1))
  }

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return
    setLookMessage('写真を処理中...')
    try {
      const casePhoto = await fileToCoverDataUrl(file)
      setRecipe((prev) => ({ ...prev, casePhoto }))
      setLookMessage('')
    } catch (err) {
      setLookMessage(err instanceof Error ? err.message : String(err))
    }
  }

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
      setRecipe({ ...r.recipe, ...lookOf(recipe) })
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
      await onSave({ ...recipe, name, showcase: showcaseIds })
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
                if (window.confirm('今のデッキの内容をすべて消して、空にしますか？（保存するまで、保存済みのデッキは変わりません）')) setRecipe({ ...EMPTY_RECIPE, name: recipe.name, ...lookOf(recipe) })
              }}
            >
              空にする
            </button>
          </div>

          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-[#9fc3ca]">デッキ名</span>
            <input className="field w-full" value={recipe.name} maxLength={40} onChange={(e) => setRecipe({ ...recipe, name: e.target.value })} />
          </label>

          {/* ケースの見た目と、代表カード */}
          <div className="mb-3 flex flex-wrap gap-4 rounded-lg border border-[#2a4a52] bg-[#071820]/60 p-3">
            <div className="w-[150px] shrink-0 pt-20 pr-2" title="カーソルを乗せると、代表カードが上に出ます">
              <CaseArt recipe={{ ...recipe, showcase: showcaseIds }} name={recipe.name || '新しいデッキ'} />
            </div>
            <div className="min-w-0 flex-1 basis-56">
              <div className="mb-1 text-xs font-bold text-[#d7eef2]">
                ケースの色（{caseColors.length} / {MAX_CASE_COLORS}色）
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {caseColors.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setColorSlot(i)}
                    aria-pressed={slot === i}
                    aria-label={`${i + 1}色目を選ぶ`}
                    title={`${i + 1}色目`}
                    className="hud-mono h-8 w-8 border-2 text-[11px] font-bold text-white"
                    style={{ background: c, borderColor: slot === i ? '#ffffff' : 'rgba(255,255,255,0.25)', textShadow: '0 0 3px #000, 0 0 3px #000' }}
                  >
                    {i + 1}
                  </button>
                ))}
                {caseColors.length < MAX_CASE_COLORS && (
                  <button type="button" className="btn-secondary" onClick={addColor}>
                    ＋ 色を足す
                  </button>
                )}
                {caseColors.length > 1 && (
                  <button type="button" className="btn-secondary" onClick={() => removeColor(slot)}>
                    {slot + 1}色目を外す
                  </button>
                )}
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {CASE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorAt(slot, c)}
                    aria-label={`${slot + 1}色目を ${c} にする`}
                    aria-pressed={caseColors[slot] === c}
                    className="h-7 w-7 border-2"
                    style={{ background: c, borderColor: caseColors[slot] === c ? '#ffffff' : 'rgba(255,255,255,0.25)' }}
                  />
                ))}
                <label className="ml-1 flex items-center gap-1 text-[10px] text-[#9fc3ca]">
                  自由に選ぶ
                  <input type="color" value={caseColors[slot] ?? DEFAULT_CASE_COLOR} onChange={(e) => setColorAt(slot, e.target.value)} aria-label={`${slot + 1}色目を自由に選ぶ`} className="h-7 w-9 cursor-pointer border border-[#2a4a52] bg-transparent p-0" />
                </label>
              </div>
              {caseColors.length > 1 && (
                <div className="mb-3 flex items-center gap-3 text-xs text-[#d7eef2]" role="radiogroup" aria-label="複数色の塗り方">
                  <span className="text-[#9fc3ca]">塗り方</span>
                  {([['gradient', 'グラデーション'], ['band', '斜めの帯']] as const).map(([v, label]) => (
                    <label key={v} className="flex cursor-pointer items-center gap-1">
                      <input type="radio" name="case-style" checked={(recipe.caseStyle ?? 'gradient') === v} onChange={() => setRecipe({ ...recipe, caseStyle: v })} />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              <div className="mb-3" />

              <div className="mb-1 text-xs font-bold text-[#d7eef2]">ケースの写真</div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="btn-secondary cursor-pointer">
                  写真を選ぶ
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void handlePhoto(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                {recipe.casePhoto && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setRecipe({ ...recipe, casePhoto: undefined })}
                  >
                    写真を外す
                  </button>
                )}
                <span className="text-[10px] text-[#9fc3ca]">{recipe.casePhoto ? '窓の形に切り抜いて、保存します' : '未設定のときは、推しホロメンの画像が入ります'}</span>
              </div>
              {lookMessage && <p className="mb-2 text-xs text-[#ffd76a]">{lookMessage}</p>}

              <div className="mb-1 text-xs font-bold text-[#d7eef2]">
                代表カード（{showcaseSlots.length} / {SHOWCASE_MAX}枚）
              </div>
              <div className="flex gap-2">
                {Array.from({ length: SHOWCASE_MAX }, (_, i) => {
                  const c = showcaseSlots[i]
                  return c ? (
                    <div key={c.id} className="relative">
                      <Thumb card={c} width={48} onZoom={onZoom} />
                      <button type="button" onClick={() => toggleShowcase(c.id)} aria-label={`${c.card_name}を代表カードから外す`} className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full border border-[#2a4a52] bg-[#0a0f1e] text-[11px] leading-none text-white hover:border-[#ff8a8a]">
                        ×
                      </button>
                    </div>
                  ) : (
                    <div key={`empty-${i}`} style={{ width: 48, height: Math.round(48 * (88 / 63)) }} className="flex items-center justify-center rounded border border-dashed border-[#2a4a52] text-[10px] text-[#6f9aa3]">
                      空き
                    </div>
                  )
                })}
              </div>
              <p className="mt-1 text-[10px] text-[#9fc3ca]">下の一覧の「☆」で選びます。ケースにカーソルを乗せると、上に出ます（選ばないと、推し・メインの先頭が出ます）</p>
              {showcaseNote && <p className="mt-1 text-xs text-[#ffd76a]">{showcaseNote}</p>}
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-1 text-xs" style={{ color: recipe.oshi ? '#3ddc97' : '#ffd76a' }}>
              推しホロメン {recipe.oshi ? 1 : 0} / 1枚
            </div>
            {recipe.oshi ? (
              <div className="flex items-center gap-3">
                <Thumb card={recipe.oshi} width={44} onZoom={onZoom} />
                <div className="min-w-0 flex-1 break-all text-sm text-white">{recipe.oshi.card_name}</div>
                <StarButton on={showcaseIds.includes(recipe.oshi.id)} onClick={() => recipe.oshi && toggleShowcase(recipe.oshi.id)} />
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
                  <StarButton on={showcaseIds.includes(e.card.id)} onClick={() => toggleShowcase(e.card.id)} />
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
                  <StarButton on={showcaseIds.includes(e.card.id)} onClick={() => toggleShowcase(e.card.id)} />
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
  const [editing, setEditing] = useState<{ id: number | null; recipe: DeckRecipeX; focusImport: boolean } | null>(null) // 編集中（id が null のときは、新しいデッキ）
  const [zoom, setZoom] = useState<DeckCard | null>(null)
  const [notice, setNotice] = useState('')
  const [reordering, setReordering] = useState(false) // 並び替え中
  const [dragId, setDragId] = useState<number | null>(null)

  const viewing = cases.decks.find((d) => d.id === viewId) ?? null
  const limitText = cases.limit === null ? `${cases.decks.length}個` : `${cases.decks.length} / ${cases.limit}個`

  // 並び替え：1つ前・後ろへ（◀ ▶）／ドラッグで、その位置へ（パソコン）
  const moveBy = (id: number, delta: number) => {
    const ids = cases.decks.map((d) => d.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) return
    ids.splice(to, 0, ...ids.splice(from, 1))
    cases.setOrder(ids)
  }
  const moveTo = (id: number, targetId: number) => {
    const ids = cases.decks.map((d) => d.id)
    const from = ids.indexOf(id)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0 || from === to) return
    ids.splice(to, 0, ...ids.splice(from, 1))
    cases.setOrder(ids)
  }
  const finishReorder = async () => {
    setReordering(false)
    try {
      await cases.flushOrder()
      setNotice('並び順を保存しました')
    } catch (err) {
      setNotice('並び順を保存できませんでした: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

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

  const handleSave = async (recipe: DeckRecipeX) => {
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
          {reordering ? (
            <button type="button" className="btn-primary" onClick={() => void finishReorder()}>
              並び替えを完了
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setReordering(true)} disabled={cases.decks.length < 2} title={cases.decks.length < 2 ? 'デッキが2個以上あると、並び替えられます' : 'デッキケースの順番を、手動で並び替える'}>
              並び替え
            </button>
          )}
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

      {reordering && <p className="mb-2 text-xs text-[#ffd76a]">並び替え中：◀ ▶ で、1つずつ動かせます（パソコンでは、ドラッグでも動かせます）。終わったら「並び替えを完了」を押してください</p>}

      {/* デッキの窓：デッキが増えたら、この中をスクロールする（上の余白は、代表カードが上に出るためのもの）。並びは、登録順（手動で並び替えたときは、その順） */}
      <div tabIndex={0} aria-label="デッキの一覧（スクロールできます）" className="max-h-[60vh] overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-5 pt-20 sm:px-10 sm:pt-28 lg:max-h-[78vh]">
        <div className="grid grid-cols-[repeat(auto-fill,104px)] justify-center gap-x-9 gap-y-16 sm:grid-cols-[repeat(auto-fill,132px)] sm:gap-y-20">
          {cases.decks.map((d, i) => (
            <div
              key={d.id}
              draggable={reordering}
              onDragStart={reordering ? (e) => {
                    setDragId(d.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(d.id))
                  }
                : undefined}
              onDragOver={reordering ? (e) => e.preventDefault() : undefined}
              onDrop={reordering ? (e) => {
                    e.preventDefault()
                    if (dragId !== null) moveTo(dragId, d.id)
                    setDragId(null)
                  }
                : undefined}
              onDragEnd={() => setDragId(null)}
              className={dragId === d.id ? 'opacity-40' : undefined}
            >
              <CaseArt
                recipe={d.recipe}
                name={d.name}
                updatedAt={d.updated_at}
                onOpen={reordering ? undefined : () => {
                      setNotice('')
                      setViewId(d.id)
                    }}
                overlay={reordering ? (
                    <div className="absolute inset-0 z-20 flex cursor-grab flex-col items-center justify-center gap-1.5" style={{ background: 'rgba(4, 18, 24, 0.62)' }}>
                      <span className="hud-mono text-sm font-bold text-white">{i + 1}</span>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => moveBy(d.id, -1)} disabled={i === 0} aria-label={`${d.name}を前へ`} className="h-8 w-8 border border-[#4ce0e6] bg-[#0b1e26] text-sm text-white disabled:opacity-30">
                          ◀
                        </button>
                        <button type="button" onClick={() => moveBy(d.id, 1)} disabled={i === cases.decks.length - 1} aria-label={`${d.name}を後ろへ`} className="h-8 w-8 border border-[#4ce0e6] bg-[#0b1e26] text-sm text-white disabled:opacity-30">
                          ▶
                        </button>
                      </div>
                    </div>
                  ) : undefined}
              />
            </div>
          ))}
        </div>
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