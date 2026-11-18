// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSetsAdmin, setLabel } from '../hooks/useSetsAdmin'
import { loadCardPackInfo, PACK_TYPES, type CardPackInfo, type PackType } from '../utils/packFamilies'
import { layoutPackGraph, CARD_R, HUB_R } from '../utils/packGraphLayout'
import type { DeckEntry } from '../utils/deckImage'
import type { DeckRecipeX } from '../hooks/useDeckCases'

// パック収録図（ネットワーク図）：デッキのカードが、どのパックに収録されているかを、線でつないで見せる。
//   ・パックごとに、丸いグループを作り、中心に、パックの名札（写真・コード・パック名）、その周りに、デッキのカードを並べる
//   ・カードは、仲間（元カード・再録・パラレル）の中に「新規」があれば、その新規のパックのグループに入る（新規を優先）
//   ・すべてのパックのグループを、1つの大きな円の円周に、並べる。パックの種類（ブースター・スタートデッキなど）ごとに、続けて並べ、
//     種類ごとの範囲を、円周の内側の色つきの弧と、外側の名前（円弧に沿って）で示す（種類の中は、発売順）
//   ・パックの外枠（グループの円・名札の縁）は、パックの種類の色にそろえる
//   ・線の色：新規＝赤、再録＝青、パラレル＝黄。カードから、そのカードが収録されているパックの名札へ、線を引く
//   ・カードにカーソルを乗せる（スマホは、タップ）と、そのカードのアイコンが1.5倍になる
//   ・パックにカーソルを乗せる（スマホは、タップ）、またはそのパックのカードにカーソルを乗せると、ほかのパックが薄くなり、そのパックが拡大する：
//     名札は約2.5倍、そのパックに収録されている（関係する）カードのアイコンは2倍。グループのカードは、見やすいよう、ゆったりと広がり直す。
//     拡大した円が、周りのパックを隠すときは、周りのパックを、円周に沿って、見える位置へずらす。大きな円からはみ出す場合は、はみ出さない位置まで、中心へ寄る。
//     そのパックで再録のカードは、縁が青になる
//   ・図は、ホイールで拡大・縮小、ドラッグで移動、（スマホは）ピンチで拡大・縮小ができる
//   ・「収録情報」は、図の右側（狭い画面では、下）の、別のパネルに出す

export const PACK_LINK_COLOR: Record<PackType, string> = { 新規: '#ff4d4d', 再録: '#4da3ff', パラレル: '#ffd23f' }

const HUB_ZOOM = 1.5 // 拡大したときの、名札の大きさの伸び（1 + 1.5 ＝ 2.5倍）
const CARD_ZOOM = 1.0 // 拡大したときの、関係カードのアイコンの大きさの伸び（1 + 1.0 ＝ 2倍）
const HOVER_ZOOM = 1.5 // カードにカーソル（タップ）を乗せたときの、そのカードのアイコンの倍率
const EXPAND_MS = 260
const HOVER_LEAVE_MS = 180 // カーソルが外れてから、閉じるまでの、猶予（名札からカードへ、移る間に、閉じないように）
const LINK_WIDTH = 1.6 // 線の太さ（ふだん）
const LINK_WIDTH_ACTIVE = 3.4 // パックにカーソルを乗せたときの、そのパックとカードをつなぐ線の太さ
const LINK_OPACITY = 0.4 // 線の不透明度（ふだん）
const DIM_OPACITY = 0.2 // ほかのパックの不透明度（パックを選んでいるとき）
const LABEL_FS = 11 // 種類の名前の文字の大きさ
const TYPE_COLORS = ['#4ce0e6', '#c58bff', '#ffb454', '#7bdc8a', '#ff8fb0', '#9fb4ff'] // パックの種類ごとの色（弧・外枠）

// 拡大したときの、グループの中のカードの並べ方（ゆったり）
const EXP_HUB_GAP = 30 // 名札とカードの、すき間
const EXP_ARC_GAP = 26 // 同じ輪の中の、カード同士のすき間
const EXP_RING_GAP = 30 // 輪と輪の、すき間
const EXP_PAD = 16 // グループの円の、内側の余白
const NEIGHBOR_GAP = 10 // ずらした周りのパックと、拡大した円との、すき間

const K_MIN = 0.5 // 図の、拡大・縮小の、最小・最大の倍率
const K_MAX = 8

type Active = { kind: 'card'; id: number } | { kind: 'pack'; code: string } | null

// ---------- 計算だけの部分（画面に依存しない） ----------

// 拡大したときの、グループの中のカードの位置（グループの中心が、原点）と、グループの半径。
// 拡大した名札（2.5倍）・カードのアイコン（2倍）の大きさに合わせて、輪ごとに、カード同士が離れるように並べる。
// 輪ごとの枚数は、輪の長さに比例させる（内側ばかり詰まらないように）
export function layoutGroupExpanded(n: number): { positions: { x: number; y: number }[]; r: number } {
  const hubR = HUB_R * (1 + HUB_ZOOM)
  const cardR = CARD_R * (1 + CARD_ZOOM)
  const arcStep = 2 * cardR + EXP_ARC_GAP
  const ringStep = 2 * cardR + EXP_RING_GAP
  if (n <= 0) return { positions: [], r: hubR + EXP_PAD }
  const dists: number[] = []
  const caps: number[] = []
  let total = 0
  while (total < n) {
    const dist = hubR + cardR + EXP_HUB_GAP + dists.length * ringStep
    const cap = Math.max(1, Math.floor((2 * Math.PI * dist) / arcStep))
    dists.push(dist)
    caps.push(cap)
    total += cap
  }
  // 輪ごとの枚数：容量に比例（端数は、端数の大きい輪から）
  const capSum = caps.reduce((a, b) => a + b, 0)
  const raw = caps.map((c) => (n * c) / capSum)
  const counts = raw.map((v) => Math.floor(v))
  let rest = n - counts.reduce((a, b) => a + b, 0)
  raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (rest > 0 && (counts[i] ?? 0) < (caps[i] ?? 0)) {
        counts[i] = (counts[i] ?? 0) + 1
        rest--
      }
    })
  const positions: { x: number; y: number }[] = []
  counts.forEach((k, ring) => {
    const dist = dists[ring] ?? 0
    const offset = -Math.PI / 2 + ring * 0.45
    for (let i = 0; i < k; i++) {
      const a = offset + (2 * Math.PI * i) / k
      positions.push({ x: dist * Math.cos(a), y: dist * Math.sin(a) })
    }
  })
  const lastRing = counts.map((k, i) => (k > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), 0)
  return { positions, r: (dists[lastRing] ?? hubR) + cardR + EXP_PAD }
}

// 拡大した円が、周りのパックを隠すとき、周りのパックを、大きな円の円周に沿って、見える位置へずらす（新しい角度を返す）。
//   angles：円周上の、グループの角度（円周を、時計回りに、たどった順。増え続ける）
//   focusK：拡大したグループの中心が、元の位置（円周上）から、中心へ寄った割合（1＝寄っていない）
export function shiftNeighborAngles(p: { ringR: number; angles: number[]; radii: number[]; focus: number; focusK: number; focusRadius: number; gap: number }): number[] {
  const { ringR, angles, radii, focus, focusK, focusRadius, gap } = p
  const n = angles.length
  const out = angles.slice()
  if (n < 3 || ringR < 1 || focusK < 1e-3) return out
  const TAU = 2 * Math.PI
  const th = angles[focus] ?? 0
  const idxOf = (j: number) => (focus + j) % n
  const phi: number[] = []
  for (let j = 1; j < n; j++) phi.push((((angles[idxOf(j)] ?? 0) - th) % TAU + TAU) % TAU) // 拡大したグループからの、時計回りの角度（小さい順）
  const first = phi[0] ?? 0
  const last = phi[n - 2] ?? 0
  const span = last - first
  if (span <= 1e-6) return out
  const maxR = Math.max(...Array.from({ length: n - 1 }, (_, j) => radii[idxOf(j + 1)] ?? 0))
  const need = focusRadius + maxR + gap
  // 拡大したグループの中心から、need 以上、離れる角度（中心は、円周上の同じ向きに、focusK 倍の位置）
  const cosA = (1 + focusK * focusK - (need / ringR) ** 2) / (2 * focusK)
  const A = cosA >= 1 ? 0 : cosA <= -1 ? Math.PI : Math.acos(cosA)
  let lo = Math.max(A, first)
  let hi = Math.min(TAU - A, last)
  const MIN_COMPRESS = 0.55 // 周りのパックを、縮めすぎない（元の幅の55%まで）
  if ((hi - lo) / span < MIN_COMPRESS) {
    const mid = (first + last) / 2
    lo = mid - (MIN_COMPRESS * span) / 2
    hi = mid + (MIN_COMPRESS * span) / 2
  }
  if (lo <= first + 1e-9 && hi >= last - 1e-9) return out // もう十分離れている
  for (let j = 1; j < n; j++) out[idxOf(j)] = th + lo + (((phi[j - 1] ?? 0) - first) / span) * (hi - lo)
  return out
}

export type View = { k: number; tx: number; ty: number }
// 図の、拡大・縮小：点(px, py)が、画面上で動かないように、倍率を変える
export function zoomAt(v: View, px: number, py: number, factor: number): View {
  const k = Math.min(K_MAX, Math.max(K_MIN, v.k * factor))
  const f = k / v.k
  return { k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f }
}

// カードの中心 → パックの名札の中心、の線（端は、カード・名札の縁）。bend が0以外のときは、曲げて、重ならないようにする
function linkPath(x1: number, y1: number, x2: number, y2: number, bend: number, r1: number, r2: number): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const sx = x1 + ux * r1
  const sy = y1 + uy * r1
  const ex = x2 - ux * r2
  const ey = y2 - uy * r2
  if (!bend) return `M${sx.toFixed(1)},${sy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`
  const mx = (sx + ex) / 2 - uy * bend * 2
  const my = (sy + ey) / 2 + ux * bend * 2
  return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`
}

const typeOrder = (t: PackType | null) => (t ? PACK_TYPES.indexOf(t) : 9)
const sameActive = (a: Active, b: NonNullable<Active>): boolean => !!a && a.kind === b.kind && (a.kind === 'card' ? a.id === (b as { id: number }).id : a.code === (b as { code: string }).code)

// ---------- 図の表示部分（データは、親から受け取る） ----------
export function PackGraphView({ infos, counts, packLabel, packRank, packType, packImage }: { infos: CardPackInfo[]; counts: Map<number, number>; packLabel: (code: string) => string; packRank: (code: string) => number; packType: (code: string) => string; packImage: (code: string) => string | null }) {
  const [hover, setHover] = useState<Active>(null)
  const [selected, setSelected] = useState<Active>(null)
  const [kbdCard, setKbdCard] = useState<number | null>(null) // キーボード（Tab）で選んでいるカード
  const active = hover ?? selected

  // ---- 拡大の動き ----
  const [focusCode, setFocusCode] = useState<string | null>(null) // 拡大している（拡大が終わるまでの間も含む）パック
  const [expand, setExpand] = useState(0) // 0（ふつう）〜1（拡大）
  const anim = useRef<{ cur: number; raf: number; code: string | null }>({ cur: 0, raf: 0, code: null })
  const hoverTimer = useRef<number | undefined>(undefined)

  const homeOf = useMemo(() => new Map(infos.map((i) => [i.card.id, i.homePack])), [infos])
  const hoveredCardHome = hover?.kind === 'card' ? homeOf.get(hover.id) : undefined
  // 拡大するパック：カーソルのあるパック → （拡大中のパックのカードに触れている間は、そのまま）→ タップして選んだパック
  const wantedFocus: string | null = hover?.kind === 'pack' ? hover.code : hoveredCardHome && hoveredCardHome === focusCode ? hoveredCardHome : selected?.kind === 'pack' ? selected.code : null

  useEffect(() => {
    const a = anim.current
    cancelAnimationFrame(a.raf)
    let from = a.cur
    let to = 0
    if (wantedFocus) {
      if (wantedFocus !== a.code) {
        from = 0
        a.code = wantedFocus
        setFocusCode(wantedFocus)
      }
      to = 1
    }
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      a.cur = to
      setExpand(to)
      if (!wantedFocus) {
        a.code = null
        setFocusCode(null)
      }
      return
    }
    let start: number | null = null // 最初の描画の時刻を、開始とする（時計の取り方の違いで、ずれないように）
    const tick = (now: number) => {
      if (start === null) start = now
      const t = Math.min(1, Math.max(0, (now - start) / EXPAND_MS))
      a.cur = from + (to - from) * (1 - Math.pow(1 - t, 3))
      setExpand(a.cur)
      if (t < 1) a.raf = requestAnimationFrame(tick)
      else if (to === 0) {
        a.code = null
        setFocusCode(null)
      }
    }
    a.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(a.raf)
  }, [wantedFocus])

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])
  const enter = (a: NonNullable<Active>) => {
    window.clearTimeout(hoverTimer.current)
    setHover(a)
  }
  const leave = () => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHover(null), HOVER_LEAVE_MS)
  }
  const toggle = (a: NonNullable<Active>) => setSelected((cur) => (sameActive(cur, a) ? null : a))

  // ---- 配置：すべてのパックを、1つの円周に。パックの種類ごとに続けて（種類の順 → 発売順）並べる ----
  const { layout, ringR, ringAngles, expandedMap, cardPos, typeSpans, typeColors } = useMemo(() => {
    const packCodes = new Set<string>()
    infos.forEach((i) => {
      packCodes.add(i.homePack)
      i.memberships.forEach((m) => packCodes.add(m.packCode))
    })
    const byType = new Map<string, string[]>()
    Array.from(packCodes).forEach((code) => byType.set(packType(code), [...(byType.get(packType(code)) ?? []), code]))
    const types = Array.from(byType.entries())
      .map(([typeName, codes]) => {
        const sorted = codes.sort((a, b) => packRank(a) - packRank(b) || a.localeCompare(b))
        return { typeName, rank: packRank(sorted[0] ?? ''), codes: sorted }
      })
      .sort((a, b) => a.rank - b.rank || a.typeName.localeCompare(b.typeName))
    const ordered = types.flatMap((t) => t.codes.map((code) => ({ code, typeName: t.typeName })))
    const l = layoutPackGraph(
      ordered.map(({ code }) => ({
        packCode: code,
        items: infos.filter((i) => i.homePack === code).sort((a, b) => typeOrder(a.ownType) - typeOrder(b.ownType) || a.card.slot - b.card.slot || a.card.id - b.card.id),
      })),
    )
    const posMap = new Map<number, { x: number; y: number; cx: number; cy: number; pack: string; index: number }>()
    const expMap = new Map<string, { positions: { x: number; y: number }[]; r: number }>()
    l.groups.forEach((g) => {
      g.items.forEach((it, index) => posMap.set(it.item.card.id, { x: it.x, y: it.y, cx: g.cx, cy: g.cy, pack: g.packCode, index }))
      expMap.set(g.packCode, layoutGroupExpanded(g.items.length))
    })

    // 円周上の、グループの角度（時計回りに、増え続けるようにそろえる）
    let prev = -Infinity
    const angles = l.groups.map((g) => {
      let ang = Math.atan2(g.cy, g.cx)
      while (ang < prev) ang += 2 * Math.PI
      prev = ang
      return ang
    })
    const ring = l.groups.length >= 2 ? Math.hypot(l.groups[0]?.cx ?? 0, l.groups[0]?.cy ?? 0) : 0

    // 種類ごとの範囲（円周上の、角度）。種類が2つ以上のときだけ、弧と名前を出す
    const spans: { typeName: string; color: string; a0: number; a1: number; mid: number }[] = []
    if (types.length >= 2 && l.groups.length >= 2) {
      const halves = l.groups.map((g) => Math.asin(Math.min(0.99, g.r / (ring || 1))))
      let index = 0
      types.forEach((t, ti) => {
        const fi = index
        const li = index + t.codes.length - 1
        index += t.codes.length
        const a0 = (angles[fi] ?? 0) - (halves[fi] ?? 0)
        const a1 = (angles[li] ?? 0) + (halves[li] ?? 0)
        spans.push({ typeName: t.typeName, color: TYPE_COLORS[ti % TYPE_COLORS.length] ?? '#4ce0e6', a0, a1, mid: (a0 + a1) / 2 })
      })
    }
    const colors = new Map(types.map((t, ti) => [t.typeName, TYPE_COLORS[ti % TYPE_COLORS.length] ?? '#4ce0e6']))
    return { layout: l, ringR: ring, ringAngles: angles, expandedMap: expMap, cardPos: posMap, typeSpans: spans, typeColors: colors }
  }, [infos, packRank, packType])
  const typeColorOf = (code: string) => typeColors.get(packType(code)) ?? '#4ce0e6'
  const allGroups = layout.groups

  // ---- 今の、グループの中心・半径（拡大中は、広がって、中心へ寄り、周りのパックが、円周に沿って、ずれる） ----
  const nowGroups = (() => {
    const m = new Map<string, { cx: number; cy: number; r: number }>()
    allGroups.forEach((g) => m.set(g.packCode, { cx: g.cx, cy: g.cy, r: g.r }))
    const fi = focusCode ? allGroups.findIndex((g) => g.packCode === focusCode) : -1
    const fg = fi >= 0 ? allGroups[fi] : undefined
    if (!focusCode || !fg || expand <= 0) return m
    const rNow = fg.r + ((expandedMap.get(focusCode)?.r ?? fg.r) - fg.r) * expand
    const dist = Math.hypot(fg.cx, fg.cy)
    const limit = Math.max(0, layout.outerR - 8 - rNow) // 大きな円の内側に収まる、中心からの最大距離
    const k = dist > limit && dist > 0 ? limit / dist : 1
    m.set(focusCode, { cx: fg.cx * k, cy: fg.cy * k, r: rNow })
    if (allGroups.length >= 3 && ringR > 0) {
      const next = shiftNeighborAngles({ ringR, angles: ringAngles, radii: allGroups.map((g) => g.r), focus: fi, focusK: k, focusRadius: rNow, gap: NEIGHBOR_GAP })
      allGroups.forEach((g, i) => {
        if (i !== fi) m.set(g.packCode, { cx: ringR * Math.cos(next[i] ?? 0), cy: ringR * Math.sin(next[i] ?? 0), r: g.r })
      })
    }
    return m
  })()
  const groupNow = (code: string) => nowGroups.get(code) ?? { cx: 0, cy: 0, r: 0 }

  const hubScale = (code: string) => (code === focusCode ? 1 + HUB_ZOOM * expand : 1)
  // 拡大中のパックに収録されている（関係する）カードは、どのグループにいても、アイコンが大きくなる
  const isRelated = (info: CardPackInfo) => !!focusCode && info.memberships.some((m) => m.packCode === focusCode)
  const isHoveredCard = (info: CardPackInfo) => active?.kind === 'card' && active.id === info.card.id
  const cardScale = (info: CardPackInfo) => (isRelated(info) ? 1 + CARD_ZOOM * expand : 1)
  const nowPos = (id: number) => {
    const p = cardPos.get(id)
    if (!p) return null
    const gn = groupNow(p.pack)
    let rx = p.x - p.cx
    let ry = p.y - p.cy
    if (p.pack === focusCode && expand > 0) {
      const ex = expandedMap.get(p.pack)?.positions[p.index] // 拡大したときの、ゆったりした位置へ、動かす
      if (ex) {
        rx += (ex.x - rx) * expand
        ry += (ex.y - ry) * expand
      }
    }
    return { x: gn.cx + rx, y: gn.cy + ry, pack: p.pack }
  }

  // 線：カードごとに、収録されているパック（区分ごと）へ。同じカード→同じパックに、複数の線があるときは、曲げて、ずらす
  const links = infos.flatMap((info) => {
    const from = nowPos(info.card.id)
    if (!from) return []
    const byPack = new Map<string, PackType[]>()
    info.memberships.forEach((m) => byPack.set(m.packCode, [...(byPack.get(m.packCode) ?? []), m.type]))
    const out: { key: string; cardId: number; pack: string; type: PackType; d: string }[] = []
    byPack.forEach((types, pack) => {
      if (!nowGroups.has(pack)) return
      const to = groupNow(pack)
      types.forEach((type, i) => out.push({ key: `${info.card.card_name}-${info.card.id}|${pack}|${type}`, cardId: info.card.id, pack, type, d: linkPath(from.x, from.y, to.cx, to.cy, (i - (types.length - 1) / 2) * 12, CARD_R * Math.max(cardScale(info), isHoveredCard(info) ? HOVER_ZOOM : 1), HUB_R * hubScale(pack)) }))
    })
    return out
  })

  // ---- 薄くする・太くする ----
  const packsOf = (info: CardPackInfo) => new Set(info.memberships.map((m) => m.packCode))
  const activeInfo = active?.kind === 'card' ? infos.find((i) => i.card.id === active.id) : undefined
  // 薄くしない（はっきり見せる）パック：拡大中のパック＋（カードにカーソルのときは）そのカードが収録されているパック
  const brightPacks = new Set<string>()
  if (wantedFocus) brightPacks.add(wantedFocus)
  if (activeInfo) packsOf(activeInfo).forEach((c) => brightPacks.add(c))
  const dimming = brightPacks.size > 0 // パックを選んでいる／カードにカーソルがあるとき、ほかを薄くする
  const packOpacity = (code: string) => (!dimming || brightPacks.has(code) ? 1 : DIM_OPACITY)
  const cardOpacity = (info: CardPackInfo) => {
    if (!dimming) return 1
    if (isHoveredCard(info)) return 1
    if (wantedFocus) return packsOf(info).has(wantedFocus) ? 1 : DIM_OPACITY
    return DIM_OPACITY
  }
  const linkOpacity = (l: { cardId: number; pack: string }) => {
    if (!active) return LINK_OPACITY
    if (active.kind === 'card') return l.cardId === active.id ? 1 : 0.06
    return l.pack === active.code ? 1 : 0.06
  }
  // 太くする線：パックにカーソルを乗せたとき、そのパックとカードをつなぐ線（カードにカーソルのときは、そのカードと拡大中のパックをつなぐ線）
  const linkWidth = (l: { cardId: number; pack: string }) => (active?.kind === 'pack' && l.pack === active.code) || (active?.kind === 'card' && l.cardId === active.id && l.pack === wantedFocus) ? LINK_WIDTH_ACTIVE : LINK_WIDTH
  // カードの縁の色：ふだんは、デッキに入っているカードの区分の色。拡大しているパックで「再録」のカードは、青にする（外れると、元に戻る）
  const ringColor = (info: CardPackInfo) => (wantedFocus && info.memberships.some((m) => m.packCode === wantedFocus && m.type === '再録') ? PACK_LINK_COLOR['再録'] : info.ownType ? PACK_LINK_COLOR[info.ownType] : '#9aa5a8')

  // ---- 種類の名前：円周に沿って（円弧の上に）、円の外側へ ----
  const R = layout.outerR
  const typeLabels = typeSpans.map((t, i) => {
    const bottom = Math.sin(t.mid) > 0 // 円の下半分は、文字が逆さにならないよう、向きを反対にして、内側に向けて書く
    const rText = R + 10 + (bottom ? LABEL_FS : 0)
    const textLen = t.typeName.length * (LABEL_FS + 1)
    const half = Math.min(2.9, Math.max((t.a1 - t.a0) / 2, textLen / 2 / rText + 0.03)) // 文字が、はみ出さない長さの弧にする
    const pt = (a: number) => `${(rText * Math.cos(a)).toFixed(1)},${(rText * Math.sin(a)).toFixed(1)}`
    const large = 2 * half > Math.PI ? 1 : 0
    const d = bottom ? `M${pt(t.mid + half)} A${rText},${rText} 0 ${large} 0 ${pt(t.mid - half)}` : `M${pt(t.mid - half)} A${rText},${rText} 0 ${large} 1 ${pt(t.mid + half)}`
    return { ...t, id: `pg-type-${i}`, d }
  })
  const pad = typeLabels.length > 0 ? LABEL_FS + 18 : 0
  const minX = -R - pad - 6
  const minY = -R - pad - 6
  const vbW = 2 * (R + pad + 6)
  const vbH = vbW

  // ---- 拡大・縮小・移動（ホイール／ドラッグ／ピンチ／ボタン） ----
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const geo = useRef({ minX, minY, vbW, vbH })
  geo.current = { minX, minY, vbW, vbH }
  // 画面上の点 → 図の座標（viewBox の座標）
  const toUser = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM?.()
    if (ctm && typeof DOMPoint !== 'undefined') {
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
      return { x: p.x, y: p.y }
    }
    const r = svg.getBoundingClientRect()
    if (!r.width || !r.height) return null
    const g = geo.current
    const s = Math.min(r.width / g.vbW, r.height / g.vbH)
    return { x: g.minX + (clientX - (r.left + (r.width - g.vbW * s) / 2)) / s, y: g.minY + (clientY - (r.top + (r.height - g.vbH * s) / 2)) / s }
  }
  // ホイールは、ページがスクロールしないよう、preventDefault できる形（passive: false）で受け取る
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = toUser(e.clientX, e.clientY)
      if (!p) return
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))
      setView((v) => zoomAt(v, p.x, p.y, factor))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ view: View; start: { x: number; y: number }; dist: number; moved: boolean }>({ view, start: { x: 0, y: 0 }, dist: 0, moved: false })
  const suppressClick = useRef(false)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest?.('[role="button"]')) return // カード・パックの上では、移動を始めない
    const p = toUser(e.clientX, e.clientY)
    if (!p) return
    pointers.current.set(e.pointerId, p)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 対応していない環境
    }
    const pts = Array.from(pointers.current.values())
    const [a, b] = pts
    gesture.current = { view, start: a ?? p, dist: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = toUser(e.clientX, e.clientY)
    if (!p) return
    pointers.current.set(e.pointerId, p)
    const pts = Array.from(pointers.current.values())
    const g = gesture.current
    const [a, b] = pts
    if (a && b && g.dist > 0) {
      // 2本の指：間隔の変化で拡大・縮小し、中点の動きで移動する
      const mid0 = g.start
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const z = zoomAt(g.view, mid0.x, mid0.y, Math.hypot(a.x - b.x, a.y - b.y) / g.dist)
      setView({ ...z, tx: z.tx + (mid.x - mid0.x), ty: z.ty + (mid.y - mid0.y) })
      g.moved = true
      suppressClick.current = true
    } else if (pts.length === 1) {
      const dx = p.x - g.start.x
      const dy = p.y - g.start.y
      if (g.moved || Math.hypot(dx, dy) > 4) {
        g.moved = true
        suppressClick.current = true
        setView({ ...g.view, tx: g.view.tx + dx, ty: g.view.ty + dy })
      }
    }
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 1) {
      // 2本から1本に戻ったとき：残った指から、移動を、やり直す
      const rest = Array.from(pointers.current.values())[0]
      if (rest) gesture.current = { view, start: rest, dist: 0, moved: true }
    }
    window.setTimeout(() => (suppressClick.current = false), 0)
  }
  const zoomBy = (factor: number) => setView((v) => zoomAt(v, minX + vbW / 2, minY + vbH / 2, factor))

  const thumb = (code: string, w: number, h: number) => {
    const url = packImage(code)
    return url ? <img src={url} alt="" loading="lazy" className="shrink-0 rounded-sm object-cover" style={{ width: w, height: h }} /> : null
  }
  const cardThumb = (url: string | null, w: number) => (url ? <img src={url} alt="" loading="lazy" className="shrink-0 rounded-sm object-cover" style={{ width: w, height: Math.round(w * (88 / 63)) }} /> : <span className="shrink-0 rounded-sm bg-[#26324f]" style={{ width: w, height: Math.round(w * (88 / 63)) }} />)

  // ---- 名札・カードの描き方（重なる順番は、下の「描く順番」を参照） ----
  const renderHub = (g: (typeof allGroups)[number]) => {
    const label = packLabel(g.packCode)
    const img = packImage(g.packCode)
    const hs = hubScale(g.packCode)
    const gn = groupNow(g.packCode)
    const hubClip = `pg-hub-${allGroups.indexOf(g)}-${g.packCode.replace(/[^0-9A-Za-z_-]/g, '_')}`
    const isFocus = g.packCode === focusCode
    return (
      <g
        key={`hub-${g.packCode}`}
        transform={`translate(${gn.cx} ${gn.cy}) scale(${hs})`}
        tabIndex={0}
        role="button"
        aria-label={`パック ${label}`}
        style={{ cursor: 'pointer', outline: 'none', opacity: packOpacity(g.packCode), transition: 'opacity 0.2s' }}
        onMouseEnter={() => enter({ kind: 'pack', code: g.packCode })}
        onMouseLeave={leave}
        onFocus={() => enter({ kind: 'pack', code: g.packCode })}
        onBlur={leave}
        onClick={(e) => {
          e.stopPropagation()
          if (suppressClick.current) return
          toggle({ kind: 'pack', code: g.packCode })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle({ kind: 'pack', code: g.packCode })
          }
        }}
      >
        <title>{`${label}（${g.packCode}／${packType(g.packCode)}）`}</title>
        <clipPath id={hubClip}>
          <circle r={HUB_R - 1} />
        </clipPath>
        <circle r={HUB_R} fill="#0b1e26" stroke={typeColorOf(g.packCode)} strokeWidth={(active?.kind === 'pack' && active.code === g.packCode ? 3 : 2) / hs} />
        {img && (
          <>
            <image href={img} x={-HUB_R} y={-HUB_R} width={2 * HUB_R} height={2 * HUB_R} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${hubClip})`} />
            <rect x={-HUB_R} y={3} width={2 * HUB_R} height={HUB_R} fill="rgba(4, 18, 24, 0.8)" clipPath={`url(#${hubClip})`} />
          </>
        )}
        <text textAnchor="middle" y={img ? 13 : -2} fontSize={g.packCode.length > 6 ? 8 : 10} fontWeight={700} fill="#ffffff" style={{ fontFamily: 'ui-monospace, monospace' }}>
          {g.packCode}
        </text>
        <text textAnchor="middle" y={img ? 23 : 9} fontSize={6.5} fill="#cfe6ea">
          {label.length > 8 ? `${label.slice(0, 7)}…` : label}
        </text>
        {/* 拡大したときは、パック名の全体を、名札の下に出す */}
        {isFocus && expand > 0.5 && (
          <text textAnchor="middle" y={HUB_R + 10} fontSize={8} fontWeight={700} fill="#ffffff" stroke="#071820" strokeWidth={3} paintOrder="stroke" opacity={Math.min(1, (expand - 0.5) * 2)}>
            {label}
          </text>
        )}
      </g>
    )
  }
  const renderCard = (info: CardPackInfo) => {
    const p = nowPos(info.card.id)
    if (!p) return null
    const count = counts.get(info.card.id) ?? 1
    const ring = ringColor(info)
    const clipId = `pg-clip-${info.card.id}`
    const isActive = isHoveredCard(info)
    const cs = cardScale(info)
    const hoverFactor = isActive ? Math.max(1, HOVER_ZOOM / cs) : 1 // 拡大中のパックの関係カード（2倍）は、そのまま。それ以外は、1.5倍になるよう、足りない分だけ大きくする
    return (
      <g
        key={info.card.id}
        transform={`translate(${p.x} ${p.y}) scale(${cs})`}
        tabIndex={0}
        role="button"
        aria-label={`${info.card.card_name}（${info.ownType ?? ''}）`}
        style={{ cursor: 'pointer', outline: 'none', opacity: cardOpacity(info), transition: 'opacity 0.2s' }}
        onMouseEnter={() => enter({ kind: 'card', id: info.card.id })}
        onMouseLeave={leave}
        onFocus={(e) => {
          enter({ kind: 'card', id: info.card.id })
          try {
            setKbdCard(e.currentTarget.matches(':focus-visible') ? info.card.id : null)
          } catch {
            setKbdCard(null)
          }
        }}
        onBlur={() => {
          setKbdCard(null)
          leave()
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (suppressClick.current) return
          toggle({ kind: 'card', id: info.card.id })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle({ kind: 'card', id: info.card.id })
          }
        }}
      >
        <title>{`${info.card.card_name}（${info.ownType ?? ''}・${info.card.set_code}）`}</title>
        <g style={{ transform: `scale(${hoverFactor})`, transformBox: 'view-box', transformOrigin: '0 0', transition: 'transform 0.18s ease-out' }}>
          <clipPath id={clipId}>
            <circle r={CARD_R - 1.5} />
          </clipPath>
          <circle r={CARD_R} fill="#26324f" stroke={ring} strokeWidth={isActive ? 4 : 2.5} style={{ transition: 'stroke 0.2s' }} />
          {info.card.image_url && <image href={info.card.image_url} x={-(CARD_R - 1.5)} y={-CARD_R - 2} width={2 * (CARD_R - 1.5)} height={(2 * (CARD_R - 1.5) * 88) / 63} preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clipId})`} />}
          {count > 1 && (
            <g transform={`translate(${CARD_R - 3} ${CARD_R - 3})`}>
              <circle r={7} fill="#0a0f1e" stroke="#ffffff" strokeWidth={0.8} />
              <text textAnchor="middle" y={2.6} fontSize={7.5} fontWeight={700} fill="#ffffff">
                {count}
              </text>
            </g>
          )}
        </g>
      </g>
    )
  }
  const allInfos = layout.groups.flatMap((g) => g.items.map((it) => it.item))
  // キーボードで選んだカードは、手前へ動かさない（動かすと、選んだ状態が、外れてしまうため）
  const layerOf = (i: CardPackInfo) => (isHoveredCard(i) && kbdCard !== i.card.id ? 2 : isRelated(i) ? 1 : 0)
  const cardsInDrawOrder = [...allInfos].sort((a, b) => layerOf(a) - layerOf(b))

  // ---- 収録情報（右側の別パネル） ----
  const typeChips = (types: PackType[]) =>
    PACK_TYPES.filter((t) => types.includes(t)).map((t) => (
      <span key={t} className="inline-flex items-center gap-1">
        <span className="inline-block h-0.5 w-3.5" style={{ background: PACK_LINK_COLOR[t] }} />
        {t}
      </span>
    ))
  const packsInOrder = [...allGroups].sort((a, b) => packRank(a.packCode) - packRank(b.packCode) || a.packCode.localeCompare(b.packCode))
  const perPack = (code: string) => {
    const per: Record<PackType, number> = { 新規: 0, 再録: 0, パラレル: 0 }
    infos.forEach((i) => i.memberships.filter((m) => m.packCode === code).forEach((m) => (per[m.type] += 1)))
    return per
  }
  const infoPanel = (
    <aside className="flex max-h-[60vh] min-h-0 flex-col rounded border border-[#2a4a52] bg-[#071820]/70 text-xs text-[#d7eef2] lg:max-h-[74vh]" aria-live="polite" aria-label="収録情報">
      <div className="flex items-center justify-between border-b border-[#2a4a52] px-3 py-2">
        <h4 className="hud-font text-sm font-bold text-white">収録情報</h4>
        {active && (
          <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => setSelected(null)}>
            選択を解除
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!active && (
          <>
            <p className="mb-2 text-[#9fc3ca]">カードやパックを、クリック（タップ）すると、ここに、収録されているパックやカードが出ます。下の一覧からも、パックを選べます。</p>
            <ul className="flex flex-col gap-1">
              {packsInOrder.map((g) => {
                const per = perPack(g.packCode)
                const total = per.新規 + per.再録 + per.パラレル
                return (
                  <li key={g.packCode}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded border border-transparent px-1.5 py-1 text-left hover:border-[#2a4a52]"
                      onMouseEnter={() => enter({ kind: 'pack', code: g.packCode })}
                      onMouseLeave={leave}
                      onClick={() => toggle({ kind: 'pack', code: g.packCode })}
                    >
                      <span className="h-6 w-1 shrink-0 rounded-sm" style={{ background: typeColorOf(g.packCode) }} />
                      {thumb(g.packCode, 20, 28)}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-white">{packLabel(g.packCode)}</span>
                        <span className="hud-mono block text-[10px] text-[#9fc3ca]">
                          {g.packCode}・{packType(g.packCode)}
                        </span>
                      </span>
                      <span className="hud-mono flex shrink-0 gap-1.5 text-[11px]">
                        {PACK_TYPES.map((t) => (per[t] > 0 ? <span key={t} style={{ color: PACK_LINK_COLOR[t] }}>{per[t]}</span> : null))}
                        <span className="text-[#9fc3ca]">/{total}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {active?.kind === 'card' && activeInfo && (
          <>
            <div className="mb-3 flex items-start gap-3">
              {cardThumb(activeInfo.card.image_url, 64)}
              <div className="min-w-0">
                <p className="break-all text-sm font-bold text-white">{activeInfo.card.card_name}</p>
                <p className="mt-1 text-[#9fc3ca]">
                  デッキに {counts.get(activeInfo.card.id) ?? 1}枚<br />
                  入っているのは {activeInfo.ownType ?? '不明'}（{activeInfo.card.set_code}）
                </p>
              </div>
            </div>
            <p className="mb-1 font-bold text-white">収録されているパック</p>
            <ul className="flex flex-col gap-1.5">
              {[...activeInfo.memberships]
                .sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || packRank(a.packCode) - packRank(b.packCode))
                .map((m) => (
                  <li key={`${m.packCode}|${m.type}`}>
                    <button type="button" className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-[#0b1e26]" onClick={() => toggle({ kind: 'pack', code: m.packCode })}>
                      <span className="inline-block h-0.5 w-5 shrink-0" style={{ background: PACK_LINK_COLOR[m.type] }} />
                      {thumb(m.packCode, 18, 25)}
                      <span className="min-w-0">
                        <span className="block truncate">
                          <span className="font-bold" style={{ color: PACK_LINK_COLOR[m.type] }}>{m.type}</span>：{packLabel(m.packCode)}
                        </span>
                        <span className="hud-mono block text-[10px] text-[#9fc3ca]">
                          {m.packCode}・{packType(m.packCode)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </>
        )}

        {active?.kind === 'pack' && (
          <>
            <div className="mb-3 flex items-start gap-3">
              {thumb(active.code, 48, 67)}
              <div className="min-w-0">
                <p className="break-all text-sm font-bold text-white">{packLabel(active.code)}</p>
                <p className="hud-mono text-[#9fc3ca]">
                  {active.code}・{packType(active.code)}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3">
                  {PACK_TYPES.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1">
                      <span className="inline-block h-0.5 w-3.5" style={{ background: PACK_LINK_COLOR[t] }} />
                      {t} {perPack(active.code)[t]}種類
                    </span>
                  ))}
                </p>
              </div>
            </div>
            <p className="mb-1 font-bold text-white">このパックに収録されている、デッキのカード</p>
            <ul className="flex flex-col gap-1">
              {infos
                .filter((i) => i.memberships.some((m) => m.packCode === active.code))
                .sort((a, b) => typeOrder(a.ownType) - typeOrder(b.ownType) || a.card.slot - b.card.slot)
                .map((i) => (
                  <li key={i.card.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-[#0b1e26]"
                      onMouseEnter={() => enter({ kind: 'card', id: i.card.id })}
                      onMouseLeave={leave}
                      onClick={() => toggle({ kind: 'card', id: i.card.id })}
                    >
                      {cardThumb(i.card.image_url, 24)}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{i.card.card_name}</span>
                        <span className="flex flex-wrap gap-x-2 text-[10px] text-[#9fc3ca]">{typeChips(i.memberships.filter((m) => m.packCode === active.code).map((m) => m.type))}</span>
                      </span>
                      <span className="hud-mono shrink-0 text-[#9fc3ca]">×{counts.get(i.card.id) ?? 1}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  )

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#d7eef2]">
        {PACK_TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-6" style={{ background: PACK_LINK_COLOR[t] }} />
            {t}
          </span>
        ))}
        <span className="text-[10px] text-[#9fc3ca]">（カードの縁の色＝デッキに入っているカードの区分。カードにカーソルを乗せる／タップ：1.5倍。パックにカーソルを乗せる／タップ：そのパックが拡大し、ほかのパックが薄くなり、そのパックで再録のカードの縁が、青になります）</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-w-0 overflow-hidden rounded border border-[#2a4a52] bg-[#061217]">
          <svg
            ref={svgRef}
            viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
            className="block h-[60vh] w-full touch-none select-none lg:h-[74vh]"
            style={{ cursor: view.k > 1 ? 'grab' : 'default' }}
            role="img"
            aria-label="デッキのカードが収録されているパックの図"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={() => {
              if (!suppressClick.current) setSelected(null)
            }}
          >
            <g data-role="viewport" transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              {/* いちばん大きな円 */}
              <circle r={R - 1} fill="rgba(76, 224, 230, 0.03)" stroke="#2a4a52" strokeWidth={1} />

              {/* パックの種類ごとの範囲：円周の内側の弧と、外側の名前（円弧に沿って書く）。種類が2つ以上のときだけ */}
              {typeLabels.map((t) => {
                const ar = R - 7
                const large = t.a1 - t.a0 > Math.PI ? 1 : 0
                return (
                  <g key={t.typeName} pointerEvents="none" data-role="type-arc">
                    <path d={`M${(ar * Math.cos(t.a0)).toFixed(1)},${(ar * Math.sin(t.a0)).toFixed(1)} A${ar},${ar} 0 ${large} 1 ${(ar * Math.cos(t.a1)).toFixed(1)},${(ar * Math.sin(t.a1)).toFixed(1)}`} fill="none" stroke={t.color} strokeWidth={5} strokeLinecap="round" opacity={0.85} />
                    <path id={t.id} d={t.d} fill="none" stroke="none" />
                    <text fontSize={LABEL_FS} fontWeight={700} fill={t.color} textAnchor="middle">
                      <textPath href={`#${t.id}`} startOffset="50%">
                        {t.typeName}
                      </textPath>
                    </text>
                  </g>
                )
              })}

              {/* パックごとのグループの円（外枠は、パックの種類の色。拡大中は、広がる） */}
              {allGroups.map((g) => {
                const on = g.packCode === focusCode
                const gn = groupNow(g.packCode)
                const color = typeColorOf(g.packCode)
                return <circle key={g.packCode} cx={gn.cx} cy={gn.cy} r={gn.r} fill={color} fillOpacity={on ? 0.14 : 0.07} stroke={color} strokeOpacity={on ? 1 : 0.9} strokeWidth={on ? 2.6 : 2} style={{ opacity: packOpacity(g.packCode), transition: 'opacity 0.2s' }} />
              })}

              {/* 線（カードの下に描く） */}
              <g fill="none" strokeLinecap="round" pointerEvents="none">
                {links.map((l) => (
                  <path key={l.key} d={l.d} stroke={PACK_LINK_COLOR[l.type]} style={{ opacity: linkOpacity(l), strokeWidth: linkWidth(l), transition: 'opacity 0.2s, stroke-width 0.2s' }} />
                ))}
              </g>

              {/* 描く順番（下から）：名札 → 関係のないカード → 関係するカード → カーソルのあるカード（いちばん手前）。カードは、1つの並びの中で、順番だけを変える */}
              {allGroups.map(renderHub)}
              {cardsInDrawOrder.map(renderCard)}
            </g>
          </svg>

          {/* 拡大・縮小のボタンと、使い方 */}
          <div className="absolute right-2 top-2 flex flex-col gap-1">
            <button type="button" className="btn-secondary !h-8 !w-8 !p-0 text-base" onClick={() => zoomBy(1.3)} aria-label="拡大">
              ＋
            </button>
            <button type="button" className="btn-secondary !h-8 !w-8 !p-0 text-base" onClick={() => zoomBy(1 / 1.3)} aria-label="縮小">
              －
            </button>
            <button type="button" className="btn-secondary !h-8 !w-8 !p-0 text-[11px]" onClick={() => setView({ k: 1, tx: 0, ty: 0 })} aria-label="元の大きさに戻す" title="元の大きさに戻す">
              1:1
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-1.5 left-2 text-[10px] text-[#6f9aa3]">ホイールで拡大・縮小 ／ ドラッグで移動 ／ スマホは、ピンチ</p>
        </div>

        {infoPanel}
      </div>
    </div>
  )
}

// データを取って、図を出す（エールを、図に含めるかを選べる。初めは、推しホロメンとメインデッキだけ）
export function DeckPackGraph({ recipe }: { recipe: DeckRecipeX }) {
  const { sets, loading: setsLoading } = useSetsAdmin()
  const [includeYells, setIncludeYells] = useState(false)
  const [infos, setInfos] = useState<CardPackInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const entries: DeckEntry[] = useMemo(() => {
    const list: DeckEntry[] = [...(recipe.oshi ? [{ card: recipe.oshi, count: 1 }] : []), ...recipe.main, ...(includeYells ? recipe.yells : [])]
    const merged = new Map<number, DeckEntry>()
    list.forEach((e) => merged.set(e.card.id, merged.has(e.card.id) ? { card: e.card, count: (merged.get(e.card.id)?.count ?? 0) + e.count } : e))
    return Array.from(merged.values())
  }, [recipe, includeYells])
  const counts = useMemo(() => new Map(entries.map((e) => [e.card.id, e.count])), [entries])

  // パックの順番：発売日の古い順（発売日が無いパックは、後ろ）→ パックのコード順
  const rankMap = useMemo(() => {
    const sorted = [...sets].sort((a, b) => (a.release_date ?? '9999-12-31').localeCompare(b.release_date ?? '9999-12-31') || a.set_code.localeCompare(b.set_code))
    return new Map(sorted.map((s, i) => [s.set_code, i]))
  }, [sets])
  const packRank = useMemo(() => (code: string) => rankMap.get(code) ?? 100000, [rankMap])
  const labelMap = useMemo(() => new Map(sets.map((s) => [s.set_code, setLabel(s)])), [sets])
  const packLabel = useMemo(() => (code: string) => labelMap.get(code) ?? code, [labelMap])
  const typeMap = useMemo(() => new Map(sets.map((s) => [s.set_code, (s.pack_type ?? '').trim() || 'その他'])), [sets])
  const packType = useMemo(() => (code: string) => typeMap.get(code) ?? 'その他', [typeMap])
  const imageMap = useMemo(() => new Map(sets.map((s) => [s.set_code, s.pack_image_url || null])), [sets])
  const packImage = useMemo(() => (code: string) => imageMap.get(code) ?? null, [imageMap])

  const idsKey = entries.map((e) => e.card.id).sort((a, b) => a - b).join(',')
  useEffect(() => {
    if (setsLoading) return
    let cancelled = false
    setLoading(true)
    setError('')
    loadCardPackInfo(
      entries.map((e) => e.card),
      packRank,
    )
      .then((r) => {
        if (!cancelled) setInfos(r)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // entries は、idsKey の変化で、取り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, setsLoading, packRank])

  return (
    <div>
      <label className="mb-2 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-[#d7eef2]">
        <input type="checkbox" checked={includeYells} onChange={(e) => setIncludeYells(e.target.checked)} />
        エールデッキも、図に含める
      </label>
      {entries.length === 0 && <p className="text-xs text-[#ffd76a]">カードが入っていません。「編集」から、カードを入れてください</p>}
      {entries.length > 0 && (loading || setsLoading) && <p className="text-xs text-[#9fc3ca]">収録パックを調べています...</p>}
      {error && <p className="text-xs text-[#ff8a8a]">収録パックを調べられませんでした：{error}</p>}
      {entries.length > 0 && !loading && !setsLoading && !error && <PackGraphView infos={infos} counts={counts} packLabel={packLabel} packRank={packRank} packType={packType} packImage={packImage} />}
    </div>
  )
}