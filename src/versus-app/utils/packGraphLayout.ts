// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
// パック収録図の配置計算（画面に依存しない、計算だけの部分）。
//   ・パックごとに、1つの円（グループ）を作る。円の中心に、パックの名札を置き、その周りに、同心円状に、カードを並べる
//   ・同じ種類のパック（ブースター・スタートデッキなど）の、グループの円を、1つの大きな円（種類ごとの円）の内側に、輪になるように並べる
//   ・種類ごとの円を、さらに、いちばん大きな円の内側に、輪になるように並べる（種類が1つなら、その円が、そのまま、いちばん大きな円）
//   ・並べる順番は、呼び出し側が決める（パックの発売順にすると、近いパックのカードが、隣り合う）

export const CARD_R = 16 // カード（丸いアイコン）の半径
export const HUB_R = 30 // パックの名札（中心の円）の半径
const CARD_GAP = 4 // カード同士の、すき間
const GROUP_PAD = 8 // グループの円の、内側の余白
const GROUP_GAP = 18 // グループの円同士の、すき間
const CLUSTER_GAP = 26 // 種類ごとの円同士の、すき間
const OUTER_PAD = 16 // 大きな円の、内側の余白

export type PlacedItem<T> = { item: T; x: number; y: number }
export type PlacedGroup<T> = { packCode: string; cx: number; cy: number; r: number; hubR: number; items: PlacedItem<T>[] }
export type PackGraphLayout<T> = { groups: PlacedGroup<T>[]; outerR: number }
export type PlacedCluster<T> = { typeName: string; cx: number; cy: number; r: number; groups: PlacedGroup<T>[] }
export type PackGraphTypedLayout<T> = { clusters: PlacedCluster<T>[]; outerR: number }

// 1つのグループの中の、カードの位置（グループの中心が、原点）と、グループの半径
function layoutGroup(n: number): { positions: { x: number; y: number }[]; r: number } {
  const positions: { x: number; y: number }[] = []
  const step = 2 * CARD_R + CARD_GAP
  let ring = 0
  let placed = 0
  let lastDist = HUB_R
  while (placed < n) {
    const dist = HUB_R + CARD_R + CARD_GAP + ring * step
    const capacity = Math.max(1, Math.floor((2 * Math.PI * dist) / step))
    const k = Math.min(capacity, n - placed)
    const offset = -Math.PI / 2 + ring * 0.5 // 輪ごとに、開始の角度を、ずらす
    for (let i = 0; i < k; i++) {
      const a = offset + (2 * Math.PI * i) / k
      positions.push({ x: dist * Math.cos(a), y: dist * Math.sin(a) })
    }
    placed += k
    lastDist = dist + CARD_R
    ring++
  }
  return { positions, r: (n === 0 ? HUB_R : lastDist) + GROUP_PAD }
}

// 半径の違う円を、輪になるように並べる（1つなら、中央）。先頭の円が、真上に来る。隣り合う円が、重ならないように、輪の半径を決める
function ringPlace(radii: number[], gap: number): { x: number; y: number }[] {
  if (radii.length === 0) return []
  if (radii.length === 1) return [{ x: 0, y: 0 }]
  const widths = radii.map((r) => 2 * r + gap)
  const totalWidth = widths.reduce((a, b) => a + b, 0)
  const spans = widths.map((w) => (2 * Math.PI * w) / totalWidth) // 各円が占める角度は、大きさに比例させる
  const centers: number[] = []
  let angle = -Math.PI / 2 - spans[0]! / 2
  spans.forEach((span) => {
    centers.push(angle + span / 2)
    angle += span
  })
  let ringR = 0
  for (let i = 0; i < radii.length; i++) {
    const j = (i + 1) % radii.length
    const delta = Math.abs(centers[j]! - centers[i]!) % (2 * Math.PI)
    const half = Math.sin(Math.min(delta, 2 * Math.PI - delta) / 2)
    const need = radii[i]! + radii[j]! + gap
    ringR = Math.max(ringR, half > 1e-6 ? need / (2 * half) : need)
  }
  return centers.map((a) => ({ x: ringR * Math.cos(a), y: ringR * Math.sin(a) }))
}

export function layoutPackGraph<T>(input: { packCode: string; items: T[] }[]): PackGraphLayout<T> {
  const local = input.map((g) => ({ g, ...layoutGroup(g.items.length) }))
  if (local.length === 0) return { groups: [], outerR: 80 }
  const centers = ringPlace(
    local.map((l) => l.r),
    GROUP_GAP,
  )
  const groups: PlacedGroup<T>[] = local.map((l, i) => {
    const c = centers[i] ?? { x: 0, y: 0 }
    return {
      packCode: l.g.packCode,
      cx: c.x,
      cy: c.y,
      r: l.r,
      hubR: HUB_R,
      items: l.g.items.map((item, k) => ({ item, x: c.x + (l.positions[k]?.x ?? 0), y: c.y + (l.positions[k]?.y ?? 0) })),
    }
  })
  const outerR = Math.max(...groups.map((g) => Math.hypot(g.cx, g.cy) + g.r)) + OUTER_PAD
  return { groups, outerR }
}

// パックの種類ごとに分けて配置する。種類の順番・種類の中のパックの順番は、呼び出し側が決める
export function layoutPackGraphByType<T>(types: { typeName: string; groups: { packCode: string; items: T[] }[] }[]): PackGraphTypedLayout<T> {
  const sub = types.map((t) => ({ typeName: t.typeName, layout: layoutPackGraph(t.groups) }))
  if (sub.length === 0) return { clusters: [], outerR: 80 }
  const centers = ringPlace(
    sub.map((s) => s.layout.outerR),
    CLUSTER_GAP,
  )
  const clusters: PlacedCluster<T>[] = sub.map((s, i) => {
    const c = centers[i] ?? { x: 0, y: 0 }
    return {
      typeName: s.typeName,
      cx: c.x,
      cy: c.y,
      r: s.layout.outerR,
      groups: s.layout.groups.map((g) => ({ ...g, cx: g.cx + c.x, cy: g.cy + c.y, items: g.items.map((it) => ({ item: it.item, x: it.x + c.x, y: it.y + c.y })) })),
    }
  })
  const outerR = clusters.length === 1 ? clusters[0]!.r : Math.max(...clusters.map((c) => Math.hypot(c.cx, c.cy) + c.r)) + OUTER_PAD
  return { clusters, outerR }
}