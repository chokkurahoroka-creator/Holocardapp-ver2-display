import type { Card } from '../types/card'
import { CardTile } from './CardTile'
import { useGridLayout } from '../hooks/useGridLayout'
import { getSortGroupLabel, type SortKey } from '../utils/sortCards'

type Props = {
  cards: Card[]
  onCardClick: (card: Card) => void
  isFav: (card: Card) => boolean
  onToggleFav: (card: Card, e: React.MouseEvent) => void
  selectionMode: boolean
  selectedIds: Set<number>
  onToggleSelect: (card: Card) => void
  tileScale?: number // 右下の表示サイズ変更ボタンから渡される倍率（既定1）
  sortKey?: SortKey // 並び替えキー。レアリティ・HP・カード名順のときは、区切りの見出しを入れる
}

// 区切り線に付けるタグの短い文字（「レアリティ SR」→「SR」、「HP 90」→「HP90」、「その他（漢字など）」→「他」）
function chipText(label: string): string {
  return label
    .replace(/^レアリティ\s?/, '')
    .replace(/^HP\s/, 'HP')
    .replace(/^その他（漢字など）$/, '他')
}

export function CardGrid({ cards, onCardClick, isFav, onToggleFav, selectionMode, selectedIds, onToggleSelect, tileScale = 1, sortKey }: Props) {
  // PCは最小タイル幅ベースの自動列数、スマホは倍率1で4列（詳細はuseGridLayout）
  const layout = useGridLayout(tileScale)
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: layout.gridTemplateColumns,
        gap: layout.gap,
      }}
    >
      {cards.map((card, index) => {
        // 並び替えの区切り: 前のカードと見出しが変わったカードの左側（カードとカードの間）に縦の区切り線を引く
        const label = sortKey ? getSortGroupLabel(card, sortKey) : null
        const prevLabel = sortKey && index > 0 ? getSortGroupLabel(cards[index - 1]!, sortKey) : null
        const startsGroup = label !== null && (index === 0 || label !== prevLabel)
        return (
          <div key={card.id} style={{ position: 'relative' }}>
            {startsGroup && (
              <span
                title={`${label}ここから`}
                aria-label={`${label}ここから`}
                style={{
                  position: 'absolute',
                  zIndex: 3,
                  top: 0,
                  bottom: 0,
                  left: -(layout.gap / 2) - 1,
                  width: 2,
                  borderRadius: 1,
                  background: 'var(--hud-cyan)',
                  boxShadow: '0 0 6px var(--hud-cyan)',
                  pointerEvents: 'none',
                }}
              >
                {/* 区切り線の中ほどに、グループ名の小さなタグ */}
                <span
                  className="hud-mono"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    padding: layout.compact ? '1px 3px' : '2px 5px',
                    borderRadius: 4,
                    background: 'var(--hud-cyan)',
                    color: '#04232a',
                    fontSize: layout.compact ? 9 : 11,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {chipText(label!)}
                </span>
              </span>
            )}
            <CardTile
              card={card}
              onClick={onCardClick}
              isFav={isFav(card)}
              onToggleFav={onToggleFav}
              selectionMode={selectionMode}
              selected={selectedIds.has(card.id)}
              onToggleSelect={onToggleSelect}
              compact={layout.compact}
            />
          </div>
        )
      })}
    </div>
  )
}