import type { MouseEvent } from 'react'
import type { Card } from '../types/card'
import { CardTile } from './CardTile'
import { useGridLayout } from '../hooks/useGridLayout'

type Props = {
  cards: Card[] // この区分（新規/再録/パラレル）のカードだけを渡す
  count: number // この区分に設定されている枚数（total_new/total_rerun/total_parallel）。0以下なら登録済みカードだけをスロット番号順に並べる
  onCardClick: (card: Card) => void
  isFav: (card: Card) => boolean
  onToggleFav: (card: Card, e: MouseEvent) => void
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (card: Card) => void
  tileScale?: number // 右下の表示サイズ変更ボタンから渡される倍率（既定1）
}

export function SlotGrid({
  cards,
  count,
  onCardClick,
  isFav,
  onToggleFav,
  selectionMode,
  selectedIds,
  onToggleSelect,
  tileScale = 1,
}: Props) {
  // 区分（新規/再録/パラレル）ごとのスロット番号（slot）でカードを引く。
  // 通し番号（overall_number）は、弾の枚数設定を後から変えるとずれるため、ここでは使わない
  const bySlot = new Map<number, Card>()
  cards.forEach((c) => {
    bySlot.set(Number(c.slot), c)
  })

  const layout = useGridLayout(tileScale)

  const items: { number: number; card: Card | null }[] = []
  if (count > 0) {
    for (let n = 1; n <= count; n++) {
      items.push({ number: n, card: bySlot.get(n) ?? null })
    }
    // 設定枚数を超えるスロット番号で登録されたカードも、消えないよう末尾に並べる
    cards
      .filter((c) => Number(c.slot) > count || Number(c.slot) < 1)
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .forEach((c) => items.push({ number: Number(c.slot), card: c }))
  } else {
    // 枚数設定が無い弾は、登録済みカードだけをスロット番号順に並べる（空枠は出さない）
    cards
      .slice()
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .forEach((c) => items.push({ number: Number(c.slot), card: c }))
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: layout.gridTemplateColumns,
        gap: layout.gap,
      }}
    >
      {items.map((it) =>
        it.card ? (
          <CardTile
            key={it.card.id}
            card={it.card}
            onClick={onCardClick}
            isFav={isFav(it.card)}
            onToggleFav={onToggleFav}
            selectionMode={selectionMode}
            selected={selectedIds.has(it.card.id)}
            onToggleSelect={onToggleSelect}
            compact={layout.compact}
          />
        ) : (
          <div
            key={`empty-${it.number}`}
            style={{
              width: '100%',
              aspectRatio: '5 / 7',
              borderRadius: 8,
              border: '1px dashed var(--hud-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <span className="hud-mono" style={{ fontSize: layout.compact ? 10 : 13, color: 'var(--hud-ink-dim)' }}>
              No.{it.number}
            </span>
          </div>
        )
      )}
    </div>
  )
}