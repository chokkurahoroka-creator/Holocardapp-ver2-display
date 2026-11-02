// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { fetchImageViaProxy } from '../lib/fetchImageViaProxy'

// ---- デッキレシピの型 ----
export type DeckCard = {
  id: number
  card_name: string
  card_type: string | null
  attribute: string | null
  stage: string | null
  set_code: string
  slot: number
  type: string // 新規・再録・パラレル
  rarity: string | null
  card_number: string | null
  image_url: string | null
}

export type DeckEntry = { card: DeckCard; count: number }

export type DeckRecipe = {
  name: string
  oshi: DeckCard | null
  yells: DeckEntry[]
  main: DeckEntry[]
  manual: boolean // true のとき、main の並び（画像をドラッグして並べ替えた順）をそのまま使う。false のときは、基本の並びにする
}

// ---- 並び順（メインデッキ）----
// 基本の並び：
//   ホロメン … 2nd → 1stBuzz（Buzzホロメンの1st）→ 1st → debut → spot
//   サポート … イベント → アイテム → その他のカードタイプごと（スタッフ・ツール・ファン・マスコット …）
// それぞれの中は、カード名（同じ名前のカードが隣り合う）→ 弾・スロットの順
const SUPPORT_ORDER = ['サポート・イベント', 'サポート・アイテム', 'サポート・スタッフ', 'サポート・ツール', 'サポート・ファン', 'サポート・マスコット']
const STAGE_ORDER = ['2nd', '1st', 'debut', 'spot'] // 1stBuzz は、2nd と 1st の間に入れる

// 大きな区分：ホロメン(0) → サポート(1) → それ以外(2)
function groupRank(t: string | null): number {
  const v = t ?? ''
  if (v === 'ホロメン' || v === 'Buzzホロメン') return 0
  if (v.startsWith('サポート')) return 1
  return 2
}

// 区分の中の順番。ホロメンは進化レベル、サポートはカードタイプごと
function subRank(card: DeckCard): number {
  const t = card.card_type ?? ''
  if (groupRank(t) === 0) {
    const stage = (card.stage ?? '').trim().toLowerCase()
    const i = STAGE_ORDER.indexOf(stage)
    const base = i === -1 ? STAGE_ORDER.length : i // 2nd:0, 1st:1, debut:2, spot:3, その他:4
    if (t === 'Buzzホロメン') return stage === '1st' ? 0.5 : base + 0.25 // 1stBuzz は 2nd(0)と1st(1)の間。それ以外のBuzzは、同じ進化レベルの後ろ
    return base
  }
  if (groupRank(t) === 1) {
    const i = SUPPORT_ORDER.indexOf(t)
    return i === -1 ? SUPPORT_ORDER.length : i // 決まった種類は順番どおり、それ以外は最後
  }
  return 0
}

export function compareDeckCards(x: DeckCard, y: DeckCard): number {
  return (
    groupRank(x.card_type) - groupRank(y.card_type) ||
    subRank(x) - subRank(y) ||
    (x.card_type ?? '').localeCompare(y.card_type ?? '', 'ja') ||
    x.card_name.localeCompare(y.card_name, 'ja') ||
    x.set_code.localeCompare(y.set_code) ||
    x.slot - y.slot
  )
}

export function sortDeckEntries(entries: DeckEntry[]): DeckEntry[] {
  return [...entries].sort((a, b) => compareDeckCards(a.card, b.card))
}

// 画面と画像に使う並び。手動の並び（ドラッグで並べ替えた順）なら、そのまま。そうでなければ基本の並び
export function orderedMain(recipe: DeckRecipe): DeckEntry[] {
  return recipe.manual ? recipe.main : sortDeckEntries(recipe.main)
}

// 手動の並びのときに、新しく入れたカードを置く位置（基本の並びで、自分より後ろになる最初のカードの前。無ければ末尾）
export function insertByBasicOrder(entries: DeckEntry[], entry: DeckEntry): DeckEntry[] {
  const at = entries.findIndex((e) => compareDeckCards(entry.card, e.card) < 0)
  if (at === -1) return [...entries, entry]
  return [...entries.slice(0, at), entry, ...entries.slice(at)]
}

// ---- 画像の取得 ----
// キャンバスに描いた画像を保存するには、画像が「別サイトのデータ」として汚れていない必要がある。
// まずブラウザから直接取得し（R2にCORS設定があれば成功）、できなければサーバー経由で取得する
const bitmapCache = new Map<string, Promise<ImageBitmap | null>>()

export function loadCardBitmap(url: string): Promise<ImageBitmap | null> {
  const cached = bitmapCache.get(url)
  if (cached) return cached
  const promise = (async () => {
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (res.ok) return await createImageBitmap(await res.blob())
    } catch {
      // CORSで取得できない場合は、次のサーバー経由に進む
    }
    try {
      return await createImageBitmap(await fetchImageViaProxy(url))
    } catch {
      return null
    }
  })()
  bitmapCache.set(url, promise)
  return promise
}

// ---- 描画 ----
export const DECK_IMAGE_WIDTH = 1122 // 論理サイズ。実際の画像は、この2倍（2244px）で出力する
const SCALE = 2
const COLS = 10
const FONT = "'Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif"
const CARD_RATIO = 88 / 63

// 左の列
const LEFT_PANEL_W = 250
const OSHI = { x: 21, y: 61, w: 224 }
const YELL = { x: 19, w: 88, gap: 12 }
// メインデッキのグリッド
const GRID = { x: 268, y: 63, w: 78, pitchX: 83.5, pitchY: 115.5 }

type Assets = Map<string, ImageBitmap | null>

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, minSize: number, weight = 'bold'): { text: string; size: number } {
  let size = startSize
  ctx.font = `${weight} ${size}px ${FONT}`
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 1
    ctx.font = `${weight} ${size}px ${FONT}`
  }
  let out = text
  while (ctx.measureText(out).width > maxWidth && out.length > 1) out = out.slice(0, -1)
  return { text: out === text ? text : `${out}…`, size }
}

function drawCard(ctx: CanvasRenderingContext2D, card: DeckCard, assets: Assets, x: number, y: number, w: number, radius: number, border: number) {
  const h = w * CARD_RATIO
  const bmp = card.image_url ? assets.get(card.image_url) : null

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.fillStyle = '#26324f'
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.clip()
  if (bmp) {
    ctx.drawImage(bmp, x, y, w, h)
  } else {
    // 画像を取得できなかったときは、カード名だけの枠にする
    ctx.fillStyle = '#9fb0d4'
    ctx.font = `bold ${Math.max(8, Math.round(w / 9))}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(card.card_name.slice(0, 8), x + w / 2, y + h / 2)
  }
  ctx.restore()

  if (border > 0) {
    roundRectPath(ctx, x, y, w, h, radius)
    ctx.lineWidth = border
    ctx.strokeStyle = '#e8dcc0'
    ctx.stroke()
  }
  return h
}

function drawCountPill(ctx: CanvasRenderingContext2D, text: string, right: number, bottom: number) {
  ctx.font = `bold 12px ${FONT}`
  const tw = ctx.measureText(text).width
  const w = tw + 12
  const h = 18
  roundRectPath(ctx, right - w, bottom - h, w, h, 9)
  ctx.fillStyle = 'rgba(10,15,30,0.88)'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, right - w / 2, bottom - h / 2 + 0.5)
}

// デッキレシピを、キャンバスに描く。出力サイズ（論理）の高さを返す
export function renderDeckImage(canvas: HTMLCanvasElement, recipe: DeckRecipe, assets: Assets): number {
  // メインデッキは、1枚ずつ並べる（同じカードが複数枚あれば、その枚数ぶん）
  const mainCards: DeckCard[] = orderedMain(recipe).flatMap((e) => Array.from({ length: e.count }, () => e.card))
  const mainTotal = mainCards.length
  const rows = Math.max(1, Math.ceil(mainTotal / COLS))

  const oshiH = OSHI.w * CARD_RATIO
  const yellH = YELL.w * CARD_RATIO
  const yellTop = OSHI.y + oshiH + 26
  const perRow = Math.max(1, Math.floor((LEFT_PANEL_W - YELL.x) / (YELL.w + YELL.gap)))
  const yellRows = Math.ceil(recipe.yells.length / perRow)
  const leftBottom = recipe.yells.length > 0 ? yellTop + yellRows * (yellH + YELL.gap) : OSHI.y + oshiH + 13
  const gridBottom = GRID.y + rows * GRID.pitchY
  const height = Math.ceil(Math.max(leftBottom, gridBottom + 8) + 22)

  canvas.width = DECK_IMAGE_WIDTH * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return height
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)

  // 背景
  ctx.fillStyle = '#101a33'
  ctx.fillRect(0, 0, DECK_IMAGE_WIDTH, height)

  // デッキ名
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  const title = fitText(ctx, recipe.name.trim() || 'デッキレシピ', 236, 24, 12)
  ctx.font = `bold ${title.size}px ${FONT}`
  ctx.fillText(title.text, 21, 28)

  // 左の列の背景（推しホロメンの後ろ）
  roundRectPath(ctx, 0, 50, LEFT_PANEL_W, OSHI.y + oshiH + 13 - 50, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.045)'
  ctx.fill()

  // 推しホロメン
  if (recipe.oshi) drawCard(ctx, recipe.oshi, assets, OSHI.x, OSHI.y, OSHI.w, 10, 2)

  // エール
  recipe.yells.forEach((y, i) => {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    const x = YELL.x + col * (YELL.w + YELL.gap)
    const top = yellTop + row * (yellH + YELL.gap)
    drawCard(ctx, y.card, assets, x, top, YELL.w, 6, 1.5)
    drawCountPill(ctx, `x${y.count}`, x + YELL.w - 4, top + yellH - 4)
  })

  // メインデッキの背景
  const panelTop = 45
  roundRectPath(ctx, 262, panelTop, DECK_IMAGE_WIDTH - 262 - 15, GRID.y - panelTop + rows * GRID.pitchY + 2, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  ctx.fill()

  // メインデッキの見出し
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `bold 11px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText('メインデッキ', GRID.x, 54)
  const labelW = ctx.measureText('メインデッキ').width
  ctx.font = `9px ${FONT}`
  ctx.fillStyle = '#8b98b8'
  ctx.fillText(`(${mainTotal}枚)`, GRID.x + labelW + 5, 55)

  // メインデッキのカード
  mainCards.forEach((card, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    drawCard(ctx, card, assets, GRID.x + col * GRID.pitchX, GRID.y + row * GRID.pitchY, GRID.w, 5, 1.4)
  })

  return height
}