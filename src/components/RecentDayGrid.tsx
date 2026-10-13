import { useLayoutEffect, useRef, useState } from 'react'
import type { Card } from '../types/card'
import { CardTile } from './CardTile'
import { useGridLayout } from '../hooks/useGridLayout'

type Props = {
  cards: Card[] // 1日分のカード（パックごとにまとまった順で渡す）
  setNameByCode: Map<string, string> // 弾コード → パック名（見出し用。弾コードは画面に出さない）
  onCardClick: (card: Card) => void
  isFav: (card: Card) => boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (card: Card) => void
  tileScale?: number
}

// パックごとの帯の色（隣り合うパックが見分けられるよう、順番に使う）
const PACK_COLORS = ['#4ce0e6', '#ffd76a', '#ff8fb1', '#9be37a']

// 新着カードの1日分。カードを横一列に並べ、1行がいっぱいになったら次の行へ進む。
// パックごとのまとまりは、カードの上の色付きの帯と、パック名のタグで示す。
// パックが変わっても行は改行せず、同じ行の続きに並べる（帯の色が変わる）。
export function RecentDayGrid({ cards, setNameByCode, tileScale = 1, onCardClick, isFav, onToggleFav, selectionMode, selectedIds, onToggleSelect }: Props) {
  const layout = useGridLayout(tileScale)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 1行に並ぶ列数。スマホは倍率で決まった列数、PCは最小タイル幅から、表示領域の幅に入る数を求める
  const columns = layout.columns ?? Math.max(1, Math.floor((width + layout.gap) / (layout.tileMin + layout.gap)))
  const gap = layout.gap

  // 各カードについて、何番目のパックか・そのパックの最後のカードの位置を調べる
  const packIndex: number[] = []
  const packEnd: number[] = [] // そのカードが属するパックの、最後のカードの位置
  let current = -1
  cards.forEach((card, i) => {
    if (i === 0 || cards[i - 1]!.set_code !== card.set_code) current++
    packIndex.push(current)
  })
  for (let i = cards.length - 1; i >= 0; i--) {
    packEnd[i] = i + 1 < cards.length && packIndex[i + 1] === packIndex[i] ? packEnd[i + 1]! : i
  }

  const chipFont = layout.chipFont
  const stripHeight = Math.round(chipFont * 1.25) + 7 // タグ1行分の高さ（全カードで同じにして、行の高さをそろえる）

  return (
    <div
      ref={ref}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap,
        alignItems: 'start',
      }}
    >
      {cards.map((card, i) => {
        const color = PACK_COLORS[packIndex[i]! % PACK_COLORS.length]!
        const col = i % columns
        const startsPack = i === 0 || packIndex[i - 1] !== packIndex[i]
        // パックの最初のカード、または行の先頭のカード（途中で改行された続き）に、パック名のタグを出す
        const showTag = startsPack || col === 0
        // 同じパックの次のカードが同じ行にあるときは、帯をすき間の分だけ伸ばして、つなげる
        const joinsNext = i + 1 < cards.length && packIndex[i + 1] === packIndex[i] && col !== columns - 1
        // タグの最大幅：このパックのカードが、この行で占める枚数ぶん（それ以上は、次のパックと重なるので省略表示にする）
        const spanCount = Math.max(1, Math.min(packEnd[i]! - i + 1, columns - col))
        return (
          <div key={card.id} style={{ minWidth: 0 }}>
            <div style={{ position: 'relative', height: stripHeight }}>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: joinsNext ? -gap : 0,
                  bottom: 0,
                  height: 3,
                  borderRadius: 2,
                  background: color,
                  boxShadow: `0 0 6px ${color}`,
                }}
              />
              {showTag && (
                <span
                  className="hud-mono"
                  style={{
                    position: 'absolute',
                    left: 0,
                    bottom: 3,
                    maxWidth: `calc(${spanCount} * 100% + ${(spanCount - 1) * gap}px)`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    padding: `0 ${Math.max(3, Math.round(chipFont * 0.5))}px`,
                    borderRadius: '5px 5px 0 0',
                    background: color,
                    color: '#04232a',
                    fontSize: chipFont,
                    fontWeight: 800,
                    lineHeight: 1.3,
                    zIndex: 1,
                  }}
                >
                  {setNameByCode.get(card.set_code) ?? ''}
                </span>
              )}
            </div>
            <CardTile
              card={card}
              onClick={onCardClick}
              isFav={isFav(card)}
              onToggleFav={onToggleFav}
              selectionMode={selectionMode}
              selected={selectedIds.has(card.id)}
              onToggleSelect={onToggleSelect}
              compact={layout.compact}
              hideFav={layout.hideFav}
            />
          </div>
        )
      })}
    </div>
  )
}