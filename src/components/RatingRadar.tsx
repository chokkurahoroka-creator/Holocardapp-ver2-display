import type { Card } from '../types/card'
import { getActiveRatingItems, wrapRadarLabel } from '../utils/ratingRadar'

type Props = {
  card: Card
}

// 表示サイズ(220x220)はwidth/height属性で維持しつつ、
// 内部座標系(viewBox)を広めに取ることでラベル用の余白を確保する
const SIZE = 260
const CENTER = SIZE / 2
const RADIUS = SIZE / 2 - 46
const MAX_VAL = 5

function pointAt(frac: number, i: number, angleStep: number): [number, number] {
  const angle = -Math.PI / 2 + i * angleStep
  const r = frac * RADIUS
  return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)]
}

export function RatingRadar({ card }: Props) {
  const items = getActiveRatingItems(card.card_type)
  if (!items.length) return null

  const rating = card.rating_json || {}
  const angleStep = (Math.PI * 2) / items.length

  const gridPolygons = [0.25, 0.5, 0.75, 1].map((frac) =>
    items.map((_, i) => pointAt(frac, i, angleStep).join(',')).join(' ')
  )

  const dataPoints = items
    .map((it, i) => {
      const val = Math.min(MAX_VAL, Math.max(0, Number(rating[it.key]) || 0))
      return pointAt(val / MAX_VAL, i, angleStep).join(',')
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={220} height={220}>
      {gridPolygons.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="rgba(212,175,106,0.18)" strokeWidth={1} />
      ))}

      {items.map((it, i) => {
        const [x2, y2] = pointAt(1, i, angleStep)
        return (
          <line
            key={`axis-${it.key}`}
            x1={CENTER}
            y1={CENTER}
            x2={x2}
            y2={y2}
            stroke="rgba(212,175,106,0.22)"
            strokeWidth={1}
          />
        )
      })}

      <polygon points={dataPoints} fill="rgba(212,175,106,0.35)" stroke="#d4af6a" strokeWidth={2} />

      {items.map((it, i) => {
        const [lx, ly] = pointAt(1.28, i, angleStep)
        const lines = wrapRadarLabel(it.label)
        const lineHeight = 12
        const startDy = -((lines.length - 1) * lineHeight) / 2 + 4
        return (
          <text key={`label-${it.key}`} x={lx} y={ly} fontSize={11} fill="#c9d1e0" textAnchor="middle">
            {lines.map((line, li) => (
              <tspan key={li} x={lx} dy={li === 0 ? startDy : lineHeight}>
                {line}
              </tspan>
            ))}
          </text>
        )
      })}
    </svg>
  )
}