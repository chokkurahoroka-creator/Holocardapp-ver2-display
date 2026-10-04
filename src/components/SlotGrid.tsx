import type { MouseEvent } from 'react'
import type { Card } from '../types/card'
import { CardTile } from './CardTile'

type Props = {
  cards: Card[] // この区分（新規/再録/パラレル）のカードだけを渡す
  startNumber: number // この区分の最初のスロットの通し番号（新規は1、再録はtotal_new+1、パラレルはtotal_new+total_rerun+1）
  count: number // この区分に設定されている枚数（total_new/total_rerun/total_parallel）。0以下なら登録済みカードだけを番号順に並べる
  onCardClick: (card: Card) => void
  isFav: (card: Card) => boolean
  onToggleFav: (card: Card, e: MouseEvent) => void
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (card: Card) => void
}

export function SlotGrid({
  cards,
  startNumber,
  count,
  onCardClick,
  isFav,
  onToggleFav,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: Props) {
  // 通し番号（overall_number）でカードを引けるようにしておく。
  // 古いデータ等でoverall_numberが入っていないカードは配置スロット番号で代用する
  const byNumber = new Map<number, Card>()
  cards.forEach((c) => {
    byNumber.set(c.overall_number ?? c.slot, c)
  })

  const items: { number: number; card: Card | null }[] = []
  if (count > 0) {
    for (let n = startNumber; n < startNumber + count; n++) {
      items.push({ number: n, card: byNumber.get(n) ?? null })
    }
  } else {
    // 枚数設定が無い弾は、登録済みカードだけを番号順に並べる（空枠は出さない）
    cards
      .slice()
      .sort((a, b) => (a.overall_number ?? a.slot) - (b.overall_number ?? b.slot))
      .forEach((c) => items.push({ number: c.overall_number ?? c.slot, card: c }))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
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
            <span className="hud-mono" style={{ fontSize: 13, color: 'var(--hud-ink-dim)' }}>
              No.{it.number}
            </span>
          </div>
        )
      )}
    </div>
  )
}