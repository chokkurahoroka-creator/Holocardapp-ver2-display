// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
// パック収録図の配置計算（画面に依存しない、計算だけの部分）。
//   ・パックごとに、1つの円（グループ）を作る。円の中心に、パックの名札を置き、その周りに、同心円状に、カードを並べる
//   ・グループの円を、大きな円の内側に、輪になるように並べる（グループが1つなら中央、2つ以上なら、円周上に等間隔ぎみに）
//   ・並べる順番は、呼び出し側が決める（パックの発売順にすると、近いパックのカードが、隣り合う）

export const CARD_R = 16 // カード（丸いアイコン）の半径
export const HUB_R = 26 // パックの名札（中心の円）の半径
const CARD_GAP = 4 // カード同士の、すき間
const GROUP_PAD = 8 // グループの円の、内側の余白
const GROUP_GAP = 18 // グループの円同士の、すき間
const OUTER_PAD = 16 // 大きな円の、内側の余白

export type PlacedItem<T> = { item: T; x: number; y: number }
export type PlacedGroup<T> = { packCode: string; cx: number; cy: number; r: number; hubR: number; items: PlacedItem<T>[] }
export type PackGraphLayout<T> = { groups: PlacedGroup<T>[]; outerR: number }

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

export function layoutPackGraph<T>(input: { packCode: string; items: T[] }[]): PackGraphLayout<T> {
  const local = input.map((g) => ({ g, ...layoutGroup(g.items.length) }))
  if (local.length === 0) return { groups: [], outerR: 80 }

  const place = (cx: number, cy: number, idx: number): PlacedGroup<T> => {
    const l = local[idx]!
    return {
      packCode: l.g.packCode,
      cx,
      cy,
      r: l.r,
      hubR: HUB_R,
      items: l.g.items.map((item, i) => ({ item, x: cx + (l.positions[i]?.x ?? 0), y: cy + (l.positions[i]?.y ?? 0) })),
    }
  }

  // 1つだけ：中央に置く
  if (local.length === 1) {
    const g = place(0, 0, 0)
    return { groups: [g], outerR: g.r + OUTER_PAD }
  }

  // 2つ以上：円周上に、並べる。各グループが占める角度は、大きさに比例させる
  const widths = local.map((l) => 2 * l.r + GROUP_GAP)
  const totalWidth = widths.reduce((a, b) => a + b, 0)
  const spans = widths.map((w) => (2 * Math.PI * w) / totalWidth)
  const centers: number[] = []
  let angle = -Math.PI / 2 - spans[0]! / 2 // 先頭のグループが、真上に来る
  spans.forEach((span) => {
    centers.push(angle + span / 2)
    angle += span
  })
  // 隣り合うグループが、重ならないように、輪の半径を決める
  let ringR = 0
  for (let i = 0; i < local.length; i++) {
    const j = (i + 1) % local.length
    const delta = Math.abs(centers[j]! - centers[i]!) % (2 * Math.PI)
    const half = Math.sin(Math.min(delta, 2 * Math.PI - delta) / 2)
    const need = local[i]!.r + local[j]!.r + GROUP_GAP
    ringR = Math.max(ringR, half > 1e-6 ? need / (2 * half) : need)
  }
  const groups = local.map((_, i) => place(ringR * Math.cos(centers[i]!), ringR * Math.sin(centers[i]!), i))
  const outerR = Math.max(...groups.map((g) => Math.hypot(g.cx, g.cy) + g.r)) + OUTER_PAD
  return { groups, outerR }
}