import type { Card } from '../types/card'
import { CardTile } from './CardTile'

type Props = {
  cards: Card[]
  onCardClick: (card: Card) => void
  isFav: (card: Card) => boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (card: Card) => void
  tileScale?: number // 右下の表示サイズ変更ボタンから渡される倍率（既定1）
}

export function CardGrid({ cards, onCardClick, isFav, onToggleFav, selectionMode, selectedIds, onToggleSelect, tileScale = 1 }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        // 最小タイル幅をclamp()でビューポート幅に応じて縮めることで、
        // 狭いスマホ画面でもメディアクエリ無しで無理なく2列前後に収まるようにする。
        // tileScaleで上限・下限どちらも拡大縮小する
        gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${Math.round(110 * tileScale)}px, 40vw, ${Math.round(160 * tileScale)}px), 1fr))`,
        gap: 12,
      }}
    >
      {cards.map((card) => (
        <CardTile
          key={card.id}
          card={card}
          onClick={onCardClick}
          isFav={isFav(card)}
          onToggleFav={onToggleFav}
          selectionMode={selectionMode}
          selected={selectedIds.has(card.id)}
          onToggleSelect={onToggleSelect}
          compact={tileScale < 0.75}
        />
      ))}
    </div>
  )
}