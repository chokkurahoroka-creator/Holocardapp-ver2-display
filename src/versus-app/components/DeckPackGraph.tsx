// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
//   ・パックの中のカードは、パックの名札から見て、全体の円の中心に向かう点を、1枚目として、並べる
//   ・カードにカーソルを乗せる（スマホは、タップ）と、そのカードのアイコンが、今の大きさの1.5倍になる
//   ・パックの名札だけでなく、パックの範囲の外枠（グループの円）にカーソルを乗せても（スマホは、タップ）、そのパックが拡大する。
//     関係するカードがいる、ほかのパックは、明るくなり、1.2倍になる（名札・外枠とも）。
//     パックにカーソルを乗せる、またはそのパックのカードにカーソルを乗せると、ほかのパックが薄くなり、そのパックが拡大する：
//     名札は約2.5倍、そのパックに収録されている（関係する）カードのアイコンは2倍。グループのカードは、見やすいよう、ゆったりと広がり直す。
//     拡大した円が、周りのパックを隠すときは、周りのパックを、円周に沿って、見える位置へずらす。大きな円からはみ出す場合は、はみ出さない位置まで、中心へ寄る。
//     そのパックで再録のカードは、縁が青になる
//   ・パックにカーソルを乗せている間は、そのパックの名札を中心にして、その場で拡大する（いちばん外の円の上に、はみ出してよい）。いちばん外の円は、暗くなる
//   ・強調するパック（関係カードがいるほかのパック）は、カードを名札から離して並べ直し、名札とカードが、重ならないようにする（外枠は、大きくしない）。
//     関係ラインが薄くなったら（カードにカーソルを移したら）、そのパックの強調も、関係カードの強調も、外す（非アクティブにする）
//   ・アクティブな間は、見えている線と、アイコンが、被らないよう、アイコンの位置（関係カードを線の向きに近い位置へ入れ替え・輪の回転・角度のずらし）と大きさ（縮小）を調整し、
//     それでも途中のアイコンを通る線は、アイコンを避けて曲げる
//   ・図は、ホイールで拡大・縮小、ドラッグで移動、（スマホは）ピンチで拡大・縮小ができる。ボタンで、図と収録情報を、全画面にできる
//   ・「収録情報」は、図の右側（狭い画面では、下）の、別のパネルに出す

export const PACK_LINK_COLOR: Record<PackType, string> = { 新規: '#ff4d4d', 再録: '#4da3ff', パラレル: '#ffd23f' }

const HUB_ZOOM = 1.5 // 拡大したときの、名札の大きさの伸び（1 + 1.5 ＝ 2.5倍）
const CARD_ZOOM = 1.0 // 拡大したときの、関係カードのアイコンの大きさの伸び（1 + 1.0 ＝ 2倍）
const HOVER_ZOOM = 1.5 // カードにカーソル（タップ）を乗せたときの、そのカードのアイコンの倍率（今の大きさに、かける）
const EMPH_ZOOM = 1.2 // 関係カードがいる、ほかのパックを強調するときの、名札・外枠の倍率
const EXPAND_MS = 260
const HOVER_LEAVE_MS = 180 // カーソルが外れてから、閉じるまでの、猶予（名札からカードへ、移る間に、閉じないように）
const LINK_WIDTH = 1.6 // 線の太さ（ふだん）
const LINK_WIDTH_ACTIVE = 3.4 // パックにカーソルを乗せたときの、そのパックとカードをつなぐ線の太さ
const LINK_OPACITY = 0.4 // 線の不透明度（ふだん）
const DIM_OPACITY = 0.2 // ほかのパックの不透明度（パックを選んでいるとき）
const LABEL_FS = 11 // 種類の名前の文字の大きさ
const TYPE_COLORS = ['#4ce0e6', '#c58bff', '#ffb454', '#7bdc8a', '#ff8fb0', '#9fb4ff'] // パックの種類ごとの色（弧・外枠）

// 拡大したときの、グループの中のカードの並べ方（ゆったり）
const EXP_HUB_GAP = 46 // 名札と、いちばん内側（一層め）のカードの、すき間
const EXP_ARC_GAP_FIRST = 70 // 一層めの、カード同士のすき間（広めにして、一層めを、分散させる）
const EXP_ARC_GAP = 26 // 同じ輪の中の、カード同士のすき間
const EXP_RING_GAP = 30 // 輪と輪の、すき間
const EXP_PAD = 16 // グループの円の、内側の余白
const NEIGHBOR_GAP = 10 // ずらした周りのパックと、拡大した円との、すき間
const EMPH_PUSH = 36 // 強調するパックで、カードを、名札から離す距離（名札が1.2倍・関係カードが2倍になっても、重ならないように）
const OUTER_DIM = 0.7 // パックにカーソルを乗せている間に、いちばん外の円（と種類の弧・名前）を、暗くする割合（0.7 ＝ 30%の明るさ）

const K_MIN = 0.5 // 図の、拡大・縮小の、最小・最大の倍率
const K_MAX = 8

type Active = { kind: 'card'; id: number } | { kind: 'pack'; code: string } | null

// ---------- 計算だけの部分（画面に依存しない） ----------

// 拡大したときの、グループの中のカードの位置（グループの中心が、原点）と、グループの半径。
// 拡大した名札（2.5倍）・カードのアイコン（2倍）の大きさに合わせて、輪ごとに、カード同士が離れるように並べる。
// 輪ごとの枚数は、輪の長さに比例させる（内側ばかり詰まらないように）
export function layoutGroupExpanded(n: number): { positions: { x: number; y: number }[]; rings: number[]; r: number } {
  const hubR = HUB_R * (1 + HUB_ZOOM)
  const cardR = CARD_R * (1 + CARD_ZOOM)
  const arcStepOf = (ring: number) => 2 * cardR + (ring === 0 ? EXP_ARC_GAP_FIRST : EXP_ARC_GAP)
  const ringStep = 2 * cardR + EXP_RING_GAP
  if (n <= 0) return { positions: [], rings: [], r: hubR + EXP_PAD }
  const dists: number[] = []
  const caps: number[] = []
  let total = 0
  while (total < n) {
    const dist = hubR + cardR + EXP_HUB_GAP + dists.length * ringStep
    const cap = Math.max(1, Math.floor((2 * Math.PI * dist) / arcStepOf(dists.length)))
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
  const rings: number[] = [] // 各カードの、輪の番号（0＝いちばん内側）
  counts.forEach((k, ring) => {
    const dist = dists[ring] ?? 0
    const offset = -Math.PI / 2 + ring * 0.45
    for (let i = 0; i < k; i++) {
      const a = offset + (2 * Math.PI * i) / k
      positions.push({ x: dist * Math.cos(a), y: dist * Math.sin(a) })
      rings.push(ring)
    }
  })
  const lastRing = counts.map((k, i) => (k > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), 0)
  return { positions, rings, r: (dists[lastRing] ?? hubR) + cardR + EXP_PAD }
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

// 数値（0〜1など）を、目標に向けて、なめらかに変える
function useTween(target: number, ms: number): number {
  const [v, setV] = useState(target)
  const cur = useRef(target)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      cur.current = target
      setV(target)
      return
    }
    const from = cur.current
    let start: number | null = null
    let raf = 0
    const tick = (now: number) => {
      if (start === null) start = now
      const t = Math.min(1, Math.max(0, (now - start) / ms))
      cur.current = from + (target - from) * (1 - Math.pow(1 - t, 3))
      setV(cur.current)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

// 元の並び（拡大していないとき）で、名札からの距離から、輪の番号を求める（0＝いちばん内側）
const baseRingOf = (len: number) => Math.max(0, Math.round((len - (HUB_R + CARD_R + 4)) / (2 * CARD_R + 4)))

// ---- 線とアイコンが被らないための、輪ごとの回転の計算（画面に依存しない） ----
type Pt = { x: number; y: number }
export type AvoidIcon = { rel: Pt; r: number; ring: number } // rel：名札の中心から見た、回転前の位置
export type AvoidSeg = { from: number | Pt; to: 'hub' | Pt; fromR: number; toR: number } // from：グループ内のアイコン番号、または名札の中心から見た位置。to：名札の中心、または位置

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// 各アイコンと、各線（アイコンの縁から縁まで）の、いちばん小さいすき間（負なら、重なっている）。名札も、障害物として数える
export function minLineClearance(icons: AvoidIcon[], pos: Pt[], hubR: number, segs: AvoidSeg[], margin: number): number {
  let best = Infinity
  for (const sg of segs) {
    const S = typeof sg.from === 'number' ? (pos[sg.from] ?? { x: 0, y: 0 }) : sg.from
    const E = sg.to === 'hub' ? { x: 0, y: 0 } : sg.to
    const len = Math.hypot(E.x - S.x, E.y - S.y)
    if (len <= sg.fromR + sg.toR + 1) continue
    const ux = (E.x - S.x) / len
    const uy = (E.y - S.y) / len
    const a = { x: S.x + ux * sg.fromR, y: S.y + uy * sg.fromR }
    const b = { x: E.x - ux * sg.toR, y: E.y - uy * sg.toR }
    icons.forEach((ic, j) => {
      if (j === sg.from) return
      best = Math.min(best, distToSegment(pos[j] ?? { x: 0, y: 0 }, a, b) - ic.r - margin)
    })
    if (sg.to !== 'hub') best = Math.min(best, distToSegment({ x: 0, y: 0 }, a, b) - hubR - margin)
  }
  return best
}

// 1つのアイコンが、位置 pt にあるときの、線とのいちばん小さいすき間
function iconClearanceAt(pt: Pt, r: number, j: number, positions: Pt[], segs: AvoidSeg[], margin: number): number {
  let best = Infinity
  for (const sg of segs) {
    if (sg.from === j) continue
    const S = typeof sg.from === 'number' ? (positions[sg.from] ?? { x: 0, y: 0 }) : sg.from
    const E = sg.to === 'hub' ? { x: 0, y: 0 } : sg.to
    const len = Math.hypot(E.x - S.x, E.y - S.y)
    if (len <= sg.fromR + sg.toR + 1) continue
    const ux = (E.x - S.x) / len
    const uy = (E.y - S.y) / len
    best = Math.min(best, distToSegment(pt, { x: S.x + ux * sg.fromR, y: S.y + uy * sg.fromR }, { x: E.x - ux * sg.toR, y: E.y - uy * sg.toR }) - r - margin)
  }
  return best
}

// 線とアイコンが被らないように、アイコンの位置と大きさを決める（回転・ずらし・縮小の順）。
//   1) 輪ごとの回転：各輪を、1つ分の間隔の範囲で回し、線とのすき間が、いちばん大きくなる角度を選ぶ（ふだんの向きで、十分すき間があれば、そのまま）
//   2) アイコンごとの、角度のずらし：線と重なるアイコンを、同じ輪の上で、近くの空いている角度へ、少しずらす（ほかのアイコンとは、重ならないように）
//   3) 縮小：それでも線と重なるアイコンは、重ならない大きさまで、小さくする（minR より小さくはしない）
// order：outer-first＝外の輪から（線が、名札へ向かうとき）／inner-first＝内の輪から（線が、外へ向かうとき）
// 戻り値：psi＝輪ごとの回転角、delta＝アイコンごとの、角度のずらし、radii＝アイコンごとの半径
export function solveRingRotations(p: { icons: AvoidIcon[]; baseRot: number; hubR: number; segs: AvoidSeg[]; order: 'outer-first' | 'inner-first'; margin?: number; good?: number; samples?: number; minR?: number; sources?: { index: number; angle: number }[] }): { psi: number[]; delta: number[]; radii: number[]; slot: number[] } {
  const { icons: rawIcons, baseRot, hubR, segs, order } = p
  const margin = p.margin ?? 6
  const good = p.good ?? 8
  const samples = p.samples ?? 24
  const minR = p.minR ?? CARD_R
  // 0) 線の出発点のカード（sources）を、線の向き（angle）に近い位置（外の輪を優先）へ、入れ替える。名札の反対側にいると、線が名札を通ってしまうため
  const slot = rawIcons.map((_, i) => i) // アイコン i が使う位置（rawIcons の番号）
  if (p.sources && p.sources.length > 0) {
    const owner = rawIcons.map((_, i) => i)
    const locked = new Set<number>()
    const topRing = Math.max(0, ...rawIcons.map((i) => i.ring))
    const worldAngle = (si: number) => {
      const v = rawIcons[si]!.rel
      return Math.atan2(v.x * Math.sin(baseRot) + v.y * Math.cos(baseRot), v.x * Math.cos(baseRot) - v.y * Math.sin(baseRot))
    }
    for (const src of p.sources) {
      let best = -1
      let bestCost = Infinity
      for (let si = 0; si < rawIcons.length; si++) {
        if (locked.has(owner[si]!)) continue
        const d = Math.abs(Math.atan2(Math.sin(worldAngle(si) - src.angle), Math.cos(worldAngle(si) - src.angle)))
        const cost = d + (topRing - rawIcons[si]!.ring) * 0.15
        if (cost < bestCost) {
          bestCost = cost
          best = si
        }
      }
      if (best < 0) continue
      const j = owner[best]!
      const old = slot[src.index]!
      slot[src.index] = best
      owner[best] = src.index
      slot[j] = old
      owner[old] = j
      locked.add(src.index)
    }
  }
  const icons: AvoidIcon[] = rawIcons.map((ic, i) => ({ rel: rawIcons[slot[i]!]!.rel, r: ic.r, ring: rawIcons[slot[i]!]!.ring }))
  const ringIds = Array.from(new Set(icons.map((i) => i.ring))).sort((a, b) => (order === 'outer-first' ? b - a : a - b))
  const maxRing = Math.max(0, ...ringIds)
  const psi = Array.from({ length: maxRing + 1 }, () => 0)
  const delta = icons.map(() => 0)
  const place = (ic: AvoidIcon, j: number, extra = 0): Pt => {
    const a = baseRot + (psi[ic.ring] ?? 0) + (delta[j] ?? 0) + extra
    const c = Math.cos(a)
    const sn = Math.sin(a)
    return { x: ic.rel.x * c - ic.rel.y * sn, y: ic.rel.x * sn + ic.rel.y * c }
  }
  const positions = () => icons.map((ic, j) => place(ic, j))
  const clearance = () => minLineClearance(icons, positions(), hubR, segs, margin)

  // 1) 輪ごとの回転
  for (const ring of ringIds) {
    const k = icons.filter((i) => i.ring === ring).length
    if (clearance() >= good) continue
    // 線が名札へ向かうとき：輪の並びは、1つ分ずらすと同じ形になるので、1つ分の範囲を探す／線が外へ向かうとき：出発点のカードが決まっているので、一周を探す
    const step = order === 'inner-first' ? 2 * Math.PI : k > 1 ? (2 * Math.PI) / k : 2 * Math.PI
    const n = order === 'inner-first' ? Math.max(samples, 3 * k) : samples
    let bestPsi = 0
    let best = -Infinity
    for (let i = 0; i < n; i++) {
      const cand = -step / 2 + (step * i) / n
      psi[ring] = cand
      const c = clearance()
      if (c > best + 1e-6 || (Math.abs(c - best) <= 1e-6 && Math.abs(cand) < Math.abs(bestPsi))) {
        best = c
        bestPsi = cand
      }
    }
    psi[ring] = bestPsi
  }

  // 2) アイコンごとの角度のずらし（2回、見直す。線は、アイコンの位置で変わるため）
  const ONE_DEG = Math.PI / 180
  for (let pass = 0; pass < 2; pass++) {
    for (const ring of ringIds) {
      const members = icons.map((ic, j) => ({ ic, j })).filter((m) => m.ic.ring === ring)
      const k = members.length
      const maxShift = Math.min(40 * ONE_DEG, (0.45 * 2 * Math.PI) / Math.max(1, k))
      for (const { ic, j } of members) {
        const pos = positions()
        if (iconClearanceAt(pos[j] ?? { x: 0, y: 0 }, ic.r, j, pos, segs, margin) >= 0) continue // もう、重なっていない
        let chosen = delta[j] ?? 0
        let bestClear = -Infinity
        let found = false
        for (let step = 1; step <= Math.round(maxShift / ONE_DEG); step++) {
          for (const sign of [1, -1]) {
            const cand = (delta[j] ?? 0) + sign * step * ONE_DEG
            const pt = place(ic, j, sign * step * ONE_DEG)
            const clr = iconClearanceAt(pt, ic.r, j, pos, segs, margin)
            const free = icons.every((o, m) => m === j || Math.hypot(pt.x - (pos[m]?.x ?? 0), pt.y - (pos[m]?.y ?? 0)) >= ic.r + o.r + 4)
            if (!free) continue
            if (clr >= 0) {
              chosen = cand
              found = true
              break
            }
            if (clr > bestClear) {
              bestClear = clr
              chosen = cand
            }
          }
          if (found) break
        }
        delta[j] = chosen
      }
    }
  }

  // 3) それでも重なるアイコンは、小さくする
  const finalPos = positions()
  const radii = icons.map((ic, j) => {
    const maxR = iconClearanceAt(finalPos[j] ?? { x: 0, y: 0 }, 0, j, finalPos, segs, margin) // 半径0のときの、すき間＝使える最大の半径
    return Math.max(Math.min(ic.r, minR), Math.min(ic.r, maxR))
  })
  return { psi, delta, radii, slot }
}

export type View = { k: number; tx: number; ty: number }
// 図の、拡大・縮小：点(px, py)が、画面上で動かないように、倍率を変える
export function zoomAt(v: View, px: number, py: number, factor: number): View {
  const k = Math.min(K_MAX, Math.max(K_MIN, v.k * factor))
  const f = k / v.k
  return { k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f }
}

// カードの中心 → パックの名札の中心、の線の形（端は、カード・名札の縁）。bend が0以外のときは、曲げる（曲がりの大きさ ＝ bend）
function linkGeom(x1: number, y1: number, x2: number, y2: number, bend: number, r1: number, r2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const sx = x1 + ux * r1
  const sy = y1 + uy * r1
  const ex = x2 - ux * r2
  const ey = y2 - uy * r2
  return { sx, sy, ex, ey, mx: (sx + ex) / 2 - uy * bend * 2, my: (sy + ey) / 2 + ux * bend * 2, bend }
}
function linkPath(x1: number, y1: number, x2: number, y2: number, bend: number, r1: number, r2: number): string {
  const g = linkGeom(x1, y1, x2, y2, bend, r1, r2)
  if (!bend) return `M${g.sx.toFixed(1)},${g.sy.toFixed(1)} L${g.ex.toFixed(1)},${g.ey.toFixed(1)}`
  return `M${g.sx.toFixed(1)},${g.sy.toFixed(1)} Q${g.mx.toFixed(1)},${g.my.toFixed(1)} ${g.ex.toFixed(1)},${g.ey.toFixed(1)}`
}
// 線の上の点（曲線を、細かく区切った点）
function linkPoints(x1: number, y1: number, x2: number, y2: number, bend: number, r1: number, r2: number): { x: number; y: number }[] {
  const g = linkGeom(x1, y1, x2, y2, bend, r1, r2)
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    pts.push(bend ? { x: (1 - t) ** 2 * g.sx + 2 * (1 - t) * t * g.mx + t * t * g.ex, y: (1 - t) ** 2 * g.sy + 2 * (1 - t) * t * g.my + t * t * g.ey } : { x: g.sx + (g.ex - g.sx) * t, y: g.sy + (g.ey - g.sy) * t })
  }
  return pts
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

  // ---- 強調するパック・薄くするパックの決め方 ----
  const packsOf = (info: CardPackInfo) => new Set(info.memberships.map((m) => m.packCode))
  const activeInfo = active?.kind === 'card' ? infos.find((i) => i.card.id === active.id) : undefined
  // 薄くしない（はっきり見せる）パック：拡大中のパック＋強調するパック
  const brightPacks = new Set<string>()
  // 強調するパック（明るく・1.2倍・カードを名札から離す）：見えている関係ラインが、つないでいるパック。
  //   パックを選んでいるとき：そのパックに収録されている（関係する）カードがいる、ほかのパック
  //   カードにカーソルのとき：そのカードの関係ラインだけが見えるので、そのカードが収録されているパックだけ（ほかのパックは、強調を外す）
  const emphPacks = new Set<string>()
  if (wantedFocus) brightPacks.add(wantedFocus)
  if (activeInfo) {
    packsOf(activeInfo).forEach((c) => emphPacks.add(c))
  } else if (wantedFocus) {
    infos.forEach((i) => {
      if (i.memberships.some((m) => m.packCode === wantedFocus)) emphPacks.add(i.homePack)
    })
  }
  if (wantedFocus) emphPacks.delete(wantedFocus)
  emphPacks.forEach((c) => brightPacks.add(c))
  // 強調の動き（0〜1）。外れるときは、直前に強調していたパックを使って、なめらかに戻す
  const emphOn = emphPacks.size > 0
  const emphLevel = useTween(emphOn ? 1 : 0, 220)
  // 関係カードをアクティブにするのは、関係ライン（そのパックとカードをつなぐ線）が見えている間だけ。カードにカーソルを移して、線が切れたら、関係カードも、非アクティブにする
  const relatedMode = !!wantedFocus && !activeInfo
  const relLevel = useTween(relatedMode ? 1 : 0, 220)
  const lastEmph = useRef<Set<string>>(new Set())
  if (emphOn) lastEmph.current = emphPacks
  const emphShown = emphOn ? emphPacks : emphLevel > 0.001 ? lastEmph.current : emphPacks

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
    const expMap = new Map<string, { positions: { x: number; y: number }[]; rings: number[]; r: number }>()
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

  // ---- グループの中心・半径（拡大中は、名札を中心に、その場で広がり、周りのパックが、円周に沿って、ずれる）。focus：拡大するパック、e：拡大の度合い（0〜1） ----
  const groupsAt = (focus: string | null, e: number) => {
    const m = new Map<string, { cx: number; cy: number; r: number }>()
    allGroups.forEach((g) => m.set(g.packCode, { cx: g.cx, cy: g.cy, r: g.r }))
    const fi = focus ? allGroups.findIndex((g) => g.packCode === focus) : -1
    const fg = fi >= 0 ? allGroups[fi] : undefined
    if (!focus || !fg || e <= 0) return m
    const rNow = fg.r + ((expandedMap.get(focus)?.r ?? fg.r) - fg.r) * e
    m.set(focus, { cx: fg.cx, cy: fg.cy, r: rNow })
    if (allGroups.length >= 3 && ringR > 0) {
      const next = shiftNeighborAngles({ ringR, angles: ringAngles, radii: allGroups.map((g) => g.r), focus: fi, focusK: 1, focusRadius: rNow, gap: NEIGHBOR_GAP })
      allGroups.forEach((g, i) => {
        if (i !== fi) m.set(g.packCode, { cx: ringR * Math.cos(next[i] ?? 0), cy: ringR * Math.sin(next[i] ?? 0), r: g.r })
      })
    }
    return m
  }
  const nowGroups = groupsAt(focusCode, expand)
  const groupOfCode = new Map(allGroups.map((g) => [g.packCode, g]))
  const groupNow = (code: string) => nowGroups.get(code) ?? { cx: 0, cy: 0, r: 0 }

  const hubScale = (code: string) => (code === focusCode ? 1 + HUB_ZOOM * expand : 1)

  // ---- 線とアイコンが被らない調整（見えている線ごとに、アイコンの位置と大きさを決める） ----
  // 拡大が終わったときの位置（周りのパックがずれた後）を前提に、①関係カードがいるパック（線の出発点）→ ②拡大するパック（線の行き先）の順に、決める
  const activeCardId = activeInfo?.card.id ?? null
  const emphKey = Array.from(emphPacks).sort().join(',')
  const plans = useMemo(() => {
    type Plan = { psi: number[]; delta: number[]; radii: number[]; slot: number[] }
    const out = new Map<string, Plan>()
    const cardInfo = activeCardId !== null ? infos.find((i) => i.card.id === activeCardId) : undefined
    if (!wantedFocus && !cardInfo) return out
    const fin = groupsAt(wantedFocus, 1) // 拡大が終わったときの、グループの位置
    const groupOf = new Map(layout.groups.map((g) => [g.packCode, g]))
    const hubAt = (code: string) => ({ x: fin.get(code)?.cx ?? 0, y: fin.get(code)?.cy ?? 0 })
    const rotAt = (code: string) => {
      const h = hubAt(code)
      return (Math.hypot(h.x, h.y) < 1e-6 ? -Math.PI / 2 : Math.atan2(-h.y, -h.x)) + Math.PI / 2
    }
    const hubRadius = (code: string) => (code === wantedFocus ? HUB_R * (1 + HUB_ZOOM) : (HUB_R + 4) * EMPH_ZOOM)
    const bigR = CARD_R * (1 + CARD_ZOOM) // 関係カード（2倍）の半径
    const idxIn = (info: CardPackInfo) => cardPos.get(info.card.id)?.index ?? 0
    const sub = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x - b.x, y: a.y - b.y })
    const rotate = (v: { x: number; y: number }, a: number) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) })
    // グループの中のアイコン（回転前の位置）。拡大するパックは、ゆったりした並び。強調するパックは、名札から離した並び
    const iconsOf = (code: string): AvoidIcon[] => {
      const g = groupOf.get(code)
      if (!g) return []
      const ex = code === wantedFocus ? expandedMap.get(code) : undefined
      return g.items.map((it, i) => {
        const info = it.item
        const pp = cardPos.get(info.card.id)
        let rel = ex?.positions[i] ?? { x: (pp?.x ?? 0) - (pp?.cx ?? 0), y: (pp?.y ?? 0) - (pp?.cy ?? 0) }
        let ring = ex?.rings[i] ?? 0
        if (!ex) {
          const len = Math.hypot(rel.x, rel.y)
          ring = baseRingOf(len)
          if (len > 0) rel = { x: (rel.x * (len + EMPH_PUSH)) / len, y: (rel.y * (len + EMPH_PUSH)) / len }
        }
        const isHover = cardInfo?.card.id === info.card.id
        const isMember = !cardInfo && !!wantedFocus && info.memberships.some((m) => m.packCode === wantedFocus)
        return { rel, r: isHover ? CARD_R * HOVER_ZOOM : isMember ? bigR : CARD_R, ring }
      })
    }
    // 調整後の、カードの位置（全体の座標）
    const finalPos = (info: CardPackInfo) => {
      const code = info.homePack
      const plan = out.get(code)
      const icon = iconsOf(code)[plan?.slot[idxIn(info)] ?? idxIn(info)] // 入れ替えた位置
      if (!icon) return hubAt(code)
      const a = (plan?.psi[icon.ring] ?? 0) + (plan?.delta[idxIn(info)] ?? 0)
      const v = rotate(rotate(icon.rel, a), rotAt(code))
      return { x: hubAt(code).x + v.x, y: hubAt(code).y + v.y }
    }
    const solve = (code: string, segs: AvoidSeg[]) => {
      if (segs.length === 0 || !groupOf.has(code)) return
      const outward = segs.some((sg) => typeof sg.from === 'number' && sg.to !== 'hub')
      // 線が外へ向かうとき：出発点のカードを、線の向きに近い位置へ（外の輪を優先）入れ替える
      const sources = outward
        ? segs.flatMap((sg) => (typeof sg.from === 'number' && typeof sg.to !== 'string' ? [{ index: sg.from, angle: Math.atan2(sg.to.y, sg.to.x) }] : []))
        : undefined
      out.set(code, solveRingRotations({ icons: iconsOf(code), baseRot: rotAt(code), hubR: hubRadius(code), segs, order: outward ? 'inner-first' : 'outer-first', sources }))
    }
    if (cardInfo) {
      // カードにカーソル：そのカードの線（カード → 収録されているパック）だけが見える
      const H = cardInfo.homePack
      const rC = CARD_R * HOVER_ZOOM
      const targets = Array.from(new Set(cardInfo.memberships.map((m) => m.packCode))).filter((Y) => groupOf.has(Y))
      solve(
        H,
        targets.map((Y) => ({ from: idxIn(cardInfo), to: Y === H ? ('hub' as const) : sub(hubAt(Y), hubAt(H)), fromR: rC, toR: hubRadius(Y) })),
      ) // ①カードがいるパック
      const cardAt = finalPos(cardInfo)
      targets.filter((Y) => Y !== H).forEach((Y) => solve(Y, [{ from: sub(cardAt, hubAt(Y)), to: 'hub', fromR: rC, toR: hubRadius(Y) }])) // ②線の行き先のパック
    } else if (wantedFocus) {
      // パックを選んでいる：そのパックと、収録されている（関係する）カードをつなぐ線が見える
      const P = wantedFocus
      const related = infos.filter((i) => i.memberships.some((m) => m.packCode === P))
      const external = related.filter((i) => i.homePack !== P)
      // ①関係カードがいる、ほかのパック（線の出発点）：線は、そのパックの外へ、拡大するパックの名札へ向かう
      const sourceGroups = Array.from(new Set(external.map((i) => i.homePack)))
      const ownSegs = (G: string): AvoidSeg[] => external.filter((i) => i.homePack === G).map((i) => ({ from: idxIn(i), to: sub(hubAt(P), hubAt(G)), fromR: bigR, toR: hubRadius(P) }))
      sourceGroups.forEach((G) => solve(G, ownSegs(G))) // 1周目：自分の線だけ
      // 2周目：途中のパックを通る、ほかのパックの線も、避ける（線の近くを通るものだけ）
      sourceGroups.forEach((G) => {
        const hubG = hubAt(G)
        const reach = (fin.get(G)?.r ?? 0) + EMPH_PUSH + bigR + 12
        const passing: AvoidSeg[] = external
          .filter((i) => i.homePack !== G)
          .map((i) => ({ from: sub(finalPos(i), hubG), to: sub(hubAt(P), hubG), fromR: bigR, toR: hubRadius(P) }))
          .filter((sg) => {
            const a = sg.from as { x: number; y: number }
            const b = sg.to as { x: number; y: number }
            return distToSegment({ x: 0, y: 0 }, a, b) < reach
          })
        if (passing.length > 0) solve(G, [...ownSegs(G), ...passing])
      })
      // ②拡大するパック（線の行き先）：外からの線と、自分のカードから名札への線
      solve(
        P,
        related.map((i) => ({ from: i.homePack === P ? idxIn(i) : sub(finalPos(i), hubAt(P)), to: 'hub' as const, fromR: bigR, toR: hubRadius(P) })),
      )
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infos, layout, cardPos, expandedMap, wantedFocus, activeCardId, emphKey])
  const lastPlans = useRef(plans)
  if (plans.size > 0) lastPlans.current = plans
  const plansShown = plans.size > 0 ? plans : expand > 0.001 || emphLevel > 0.001 ? lastPlans.current : plans // 外れるときも、直前の調整のまま、なめらかに戻す
  const planScale = (info: CardPackInfo) => {
    const pp = cardPos.get(info.card.id)
    const r = pp ? plansShown.get(pp.pack)?.radii[pp.index] : undefined
    return r === undefined ? undefined : r / CARD_R // 調整後の、アイコンの大きさ（CARD_R に対する倍率）
  }

  // 拡大中のパックに収録されている（関係する）カード。関係ラインが見えている間だけ、アイコンが大きくなる（線と被る場合は、その分、小さくなる）
  const isMember = (info: CardPackInfo) => !!focusCode && info.memberships.some((m) => m.packCode === focusCode)
  const isRelated = (info: CardPackInfo) => relatedMode && !!wantedFocus && info.memberships.some((m) => m.packCode === wantedFocus)
  const isHoveredCard = (info: CardPackInfo) => active?.kind === 'card' && active.id === info.card.id
  const cardScale = (info: CardPackInfo) => (isMember(info) ? 1 + (Math.min(1 + CARD_ZOOM, planScale(info) ?? 1 + CARD_ZOOM) - 1) * expand * relLevel : 1)
  // グループの向き：元の並びは、1枚目が真上。名札から見て、全体の円の中心の向きへ、回す角度（ずれたパックは、今の位置から見た向き）
  const rotationOf = (code: string) => {
    const c = code === focusCode ? allGroups.find((g) => g.packCode === code) : groupNow(code)
    const cx = c?.cx ?? 0
    const cy = c?.cy ?? 0
    return (Math.hypot(cx, cy) < 1e-6 ? -Math.PI / 2 : Math.atan2(-cy, -cx)) + Math.PI / 2
  }
  const nowPos = (id: number) => {
    const p = cardPos.get(id)
    if (!p) return null
    const gn = groupNow(p.pack)
    const plan = plansShown.get(p.pack)
    let rx = p.x - p.cx
    let ry = p.y - p.cy
    if (p.pack === focusCode && expand > 0) {
      const exp = expandedMap.get(p.pack)
      let ex = exp?.positions[p.index] // 拡大したときの、ゆったりした位置へ、動かす
      if (ex && plan) {
        const a = (plan.psi[exp?.rings[p.index] ?? 0] ?? 0) + (plan.delta[p.index] ?? 0) // 線と被らないよう、輪を回し、角度をずらす
        ex = { x: ex.x * Math.cos(a) - ex.y * Math.sin(a), y: ex.x * Math.sin(a) + ex.y * Math.cos(a) }
      }
      if (ex) {
        rx += (ex.x - rx) * expand
        ry += (ex.y - ry) * expand
      }
    } else if (emphLevel > 0 && emphShown.has(p.pack)) {
      // 強調するパックは、カードを、名札から離す（名札が1.2倍・関係カードが2倍でも、重ならないように）。線と被らないよう、位置を入れ替え、輪を回し、角度をずらす
      const slotItem = plan ? groupOfCode.get(p.pack)?.items[plan.slot[p.index] ?? p.index] : undefined
      if (slotItem) {
        // 入れ替えた位置（線の向きに近い位置）へ、動かす
        const g0 = groupOfCode.get(p.pack)!
        rx += (slotItem.x - g0.cx - rx) * emphLevel
        ry += (slotItem.y - g0.cy - ry) * emphLevel
      }
      const len = Math.hypot(rx, ry)
      const ring = baseRingOf(slotItem ? Math.hypot(slotItem.x - (groupOfCode.get(p.pack)?.cx ?? 0), slotItem.y - (groupOfCode.get(p.pack)?.cy ?? 0)) : len) // 輪の番号は、入れ替えた位置のもの
      if (len > 0) {
        const k = (len + EMPH_PUSH * emphLevel) / len
        rx *= k
        ry *= k
      }
      if (plan) {
        const a = ((plan.psi[ring] ?? 0) + (plan.delta[p.index] ?? 0)) * emphLevel
        const nx = rx * Math.cos(a) - ry * Math.sin(a)
        ry = rx * Math.sin(a) + ry * Math.cos(a)
        rx = nx
      }
    }
    // 1枚目のカードが、パックの名札から見て、全体の円の中心の向きに来るよう、グループ全体を回す
    const rot = rotationOf(p.pack)
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    return { x: gn.cx + rx * cos - ry * sin, y: gn.cy + rx * sin + ry * cos, pack: p.pack }
  }

  // ---- 薄くする・太くする ----
  const dimming = brightPacks.size > 0 // パックを選んでいる／カードにカーソルがあるとき、ほかを薄くする
  const packOpacity = (code: string) => (!dimming || brightPacks.has(code) ? 1 : DIM_OPACITY)
  const cardOpacity = (info: CardPackInfo) => {
    if (!dimming) return 1
    if (isHoveredCard(info)) return 1
    if (relatedMode && wantedFocus) return packsOf(info).has(wantedFocus) ? 1 : DIM_OPACITY // 関係ラインが見えているカードだけ、はっきり見せる
    return DIM_OPACITY // カードにカーソルのとき：そのカード以外は、関係ラインが切れるので、非アクティブ
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

  // 線：カードごとに、収録されているパック（区分ごと）へ。同じカード→同じパックに、複数の線があるときは、曲げて、ずらす。
  // はっきり見えている線（不透明1）は、途中にあるアイコン（はっきり見えているもの）を避けるよう、曲げる
  const obstacles: { id: string; x: number; y: number; r: number }[] = []
  const visibleLinks = !!active // 線を避けて曲げるのは、カード・パックを選んでいる間だけ
  if (visibleLinks) {
    infos.forEach((i) => {
      const pos = nowPos(i.card.id)
      if (pos && cardOpacity(i) >= 0.99) obstacles.push({ id: `c${i.card.id}`, x: pos.x, y: pos.y, r: CARD_R * cardScale(i) * (isHoveredCard(i) ? HOVER_ZOOM : 1) })
    })
    allGroups.forEach((g) => {
      if (packOpacity(g.packCode) >= 0.99) {
        const gn = groupNow(g.packCode)
        obstacles.push({ id: `h${g.packCode}`, x: gn.cx, y: gn.cy, r: HUB_R * hubScale(g.packCode) * (emphShown.has(g.packCode) && g.packCode !== focusCode ? 1 + (EMPH_ZOOM - 1) * emphLevel : 1) })
      }
    })
  }
  const routeBend = (x1: number, y1: number, x2: number, y2: number, base: number, r1: number, r2: number, skip: string[]) => {
    const clearanceOf = (bend: number) => {
      const pts = linkPoints(x1, y1, x2, y2, bend, r1, r2)
      let best = Infinity
      for (const o of obstacles) {
        if (skip.includes(o.id)) continue
        let d = Infinity
        for (const q of pts) d = Math.min(d, Math.hypot(o.x - q.x, o.y - q.y))
        best = Math.min(best, d - o.r - 3)
      }
      return best
    }
    if (clearanceOf(base) >= 0) return base
    let bestBend = base
    let best = clearanceOf(base)
    for (const off of [24, -24, 48, -48, 80, -80, 120, -120]) {
      const c = clearanceOf(base + off)
      if (c > best + 0.5) {
        best = c
        bestBend = base + off
      }
      if (c >= 0) return base + off
    }
    return bestBend
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
      const r1 = CARD_R * cardScale(info) * (isHoveredCard(info) ? HOVER_ZOOM : 1)
      const r2 = HUB_R * hubScale(pack) * (emphShown.has(pack) && pack !== focusCode ? 1 + (EMPH_ZOOM - 1) * emphLevel : 1) // 強調した名札（1.2倍）の縁まで、線を引く
      types.forEach((type, i) => {
        const base = (i - (types.length - 1) / 2) * 12
        const l = { cardId: info.card.id, pack }
        const bend = visibleLinks && linkOpacity(l) >= 0.99 ? routeBend(from.x, from.y, to.cx, to.cy, base, r1, r2, [`c${info.card.id}`, `h${pack}`]) : base
        out.push({ key: `${info.card.card_name}-${info.card.id}|${pack}|${type}`, cardId: info.card.id, pack, type, d: linkPath(from.x, from.y, to.cx, to.cy, bend, r1, r2) })
      })
    })
    return out
  })


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
  // 全画面：図と収録情報を、画面いっぱいに出す（ブラウザの全画面にできるときは、そうする。できない環境でも、画面を覆う表示になる）
  const [full, setFull] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const nativeFull = useRef(false)
  useEffect(() => {
    if (full) {
      const el = wrapRef.current
      try {
        void el?.requestFullscreen?.().then(() => (nativeFull.current = true)).catch(() => undefined)
      } catch {
        // 全画面にできない環境：画面を覆う表示のまま
      }
    } else if (typeof document !== 'undefined' && document.fullscreenElement) {
      nativeFull.current = false
      void document.exitFullscreen?.().catch(() => undefined)
    }
  }, [full])
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && nativeFull.current) {
        nativeFull.current = false
        setFull(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    if (full) window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('keydown', onKey)
    }
  }, [full])
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
  }, [full])
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
    const emph = emphShown.has(g.packCode) && !isFocus
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
        <g style={{ transform: `scale(${emph ? 1 + (EMPH_ZOOM - 1) * emphLevel : 1})`, transformBox: 'view-box', transformOrigin: '0 0' }}>
        <clipPath id={hubClip}>
          <circle r={HUB_R - 1} />
        </clipPath>
        {/* 強調するパックは、白い輪で、明るくする */}
        {emph && <circle r={HUB_R + 4} fill="none" stroke="#ffffff" strokeWidth={2.4 / hs} opacity={0.85 * emphLevel} />}
        <circle r={HUB_R} fill="#0b1e26" stroke={typeColorOf(g.packCode)} strokeWidth={((active?.kind === 'pack' && active.code === g.packCode) || emph ? 3 : 2) / hs} />
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
        {/* 拡大・強調したときは、パック名の全体を、名札の下に出す */}
        {((isFocus && expand > 0.5) || (emph && emphLevel > 0.4)) && (
          <text textAnchor="middle" y={HUB_R + 10} fontSize={8} fontWeight={700} fill="#ffffff" stroke="#071820" strokeWidth={3} paintOrder="stroke" opacity={isFocus ? Math.min(1, (expand - 0.5) * 2) : Math.min(1, (emphLevel - 0.4) * 2)}>
            {label}
          </text>
        )}
        </g>
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
    const hoverFactor = isActive ? Math.min(HOVER_ZOOM, Math.max(1, (planScale(info) ?? HOVER_ZOOM) / cs)) : 1 // 今の大きさの1.5倍（線と被る場合は、その分、小さくなる）
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
    <aside className={`flex min-h-0 flex-col rounded border border-[#2a4a52] bg-[#071820]/70 text-xs text-[#d7eef2] ${full ? 'h-full' : 'max-h-[60vh] lg:max-h-[74vh]'}`} aria-live="polite" aria-label="収録情報">
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

  const content = (
    <div ref={wrapRef} data-role={full ? 'pack-graph-full' : undefined} className={full ? 'fixed inset-0 z-[130] flex flex-col overflow-auto bg-[#061217] p-3' : undefined}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#d7eef2]">
        {PACK_TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-6" style={{ background: PACK_LINK_COLOR[t] }} />
            {t}
          </span>
        ))}
        <span className="text-[10px] text-[#9fc3ca]">（カードの縁の色＝デッキに入っているカードの区分。カードにカーソルを乗せる／タップ：1.5倍。パックの名札・外枠にカーソルを乗せる／タップ：そのパックが拡大し、関係カードがいるほかのパックは明るく1.2倍になり、それ以外が薄くなり、そのパックで再録のカードの縁が、青になります）</span>
      </div>

      <div className={full ? 'grid min-h-0 flex-1 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1' : 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]'}>
        <div className={`relative min-w-0 overflow-hidden rounded border border-[#2a4a52] bg-[#061217] ${full ? 'min-h-0' : ''}`}>
          <svg
            ref={svgRef}
            viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
            className={`block w-full touch-none select-none ${full ? 'h-full' : 'h-[60vh] lg:h-[74vh]'}`}
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
              <g data-role="outer-ring" opacity={1 - OUTER_DIM * expand}>
              {/* いちばん大きな円（パックにカーソルを乗せている間は、暗くなる。拡大したパックが、この上に重なる） */}
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
              </g>

              {/* パックごとのグループの円（外枠は、パックの種類の色。拡大中は、広がる） */}
              {allGroups.map((g) => {
                const on = g.packCode === focusCode
                const emph = emphShown.has(g.packCode) && !on
                const gn = groupNow(g.packCode)
                const color = typeColorOf(g.packCode) // 外枠は、パックの種類の色
                return (
                  <circle
                    key={g.packCode}
                    cx={gn.cx}
                    cy={gn.cy}
                    r={gn.r}
                    fill={color}
                    fillOpacity={on ? 0.14 : emph ? 0.22 : 0.07}
                    stroke={color}
                    strokeOpacity={on || emph ? 1 : 0.9}
                    strokeWidth={on ? 2.6 : emph ? 3.2 : 2}
                    data-role="pack-frame"
                    style={{ opacity: packOpacity(g.packCode), transition: 'opacity 0.2s', cursor: 'pointer' }}
                    // 名札だけでなく、パックの範囲の外枠でも、カーソルを乗せる（タップ）と、拡大する
                    onMouseEnter={() => enter({ kind: 'pack', code: g.packCode })}
                    onMouseLeave={leave}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (suppressClick.current) return
                      toggle({ kind: 'pack', code: g.packCode })
                    }}
                  />
                )
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
            <button type="button" className="btn-secondary !h-8 !w-8 !p-0" onClick={() => setFull((f) => !f)} aria-label={full ? '全画面を終了' : '全画面表示'} title={full ? '全画面を終了（Esc）' : '図と収録情報を、全画面で表示'}>
              <svg viewBox="0 0 16 16" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {full ? <path d="M6 2v4H2 M10 2v4h4 M14 10h-4v4 M2 10h4v4" /> : <path d="M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4" />}
              </svg>
            </button>
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
          <p className="pointer-events-none absolute bottom-1.5 left-2 text-[10px] text-[#6f9aa3]">ホイールで拡大・縮小 ／ ドラッグで移動 ／ スマホは、ピンチ{full ? ' ／ Escで全画面を終了' : ''}</p>
        </div>

        {infoPanel}
      </div>
    </div>
  )
  // 全画面のときは、画面全体を覆うよう、ページの直下に出す（デッキ詳細の枠の外へ）
  return full && typeof document !== 'undefined' ? createPortal(content, document.body) : content
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