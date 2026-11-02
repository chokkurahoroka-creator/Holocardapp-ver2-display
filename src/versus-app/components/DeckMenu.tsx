// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Side } from '../utils/playfield'

export type DeckMenuAction = 'shuffle' | 'draw1' | 'draw3' | 'draw5' | 'draw7' | 'returnAll' | 'returnYells' | 'view'

type Props = {
  anchor: DOMRect // デッキの、画面上の位置
  title: string // 例：自分のデッキ
  side: Side // 自分／相手（色を変えて、見分けられるようにする）
  kind: 'deck' | 'yellDeck' // デッキか、エールデッキか
  deckCount: number
  returnCount: number // 「全てデッキに戻す」（エールデッキでは「全てのエールを戻す」）で、戻るカードの枚数
  onAction: (action: DeckMenuAction) => void
  onClose: () => void
}

const MENU_W = 216
const ITEM_H = 42

// デッキをクリックしたときに、デッキの近くに出すメニュー
export function DeckMenu({ anchor, title, side, kind, deckCount, returnCount, onAction, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // メニューの外を押す・Escape・スクロール・画面の大きさの変更で閉じる
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  // 自分は青緑、相手はオレンジ
  const accent = side === 'me' ? '#4ce0e6' : '#ff8a4c'
  const tint = side === 'me' ? 'rgba(76,224,230,0.16)' : 'rgba(255,138,76,0.18)'

  const itemClass = 'text-sm text-[#d7eef2] hover:bg-[#143844] active:bg-[#1d5563] disabled:opacity-35 disabled:hover:bg-transparent'
  const draws: { action: DeckMenuAction; label: string }[] = [
    { action: 'draw1', label: '1枚引く' },
    { action: 'draw3', label: '3枚引く' },
    { action: 'draw5', label: '5枚引く' },
    { action: 'draw7', label: '7枚引く' },
  ]

  // デッキの左側に出す。入らなければ右側。画面の外に出ないよう、位置を整える
  const height = kind === 'yellDeck' ? 46 + ITEM_H * 3 + 24 : 46 + ITEM_H * 5 + ITEM_H + 24
  let left = anchor.left - 10 - MENU_W
  if (left < 8) left = anchor.right + 10
  left = Math.max(8, Math.min(left, window.innerWidth - MENU_W - 8))
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8))

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`${title}のメニュー`}
      className="fixed z-[95] hud-panel overflow-hidden"
      style={{ left, top, width: MENU_W, background: 'var(--hud-bg, #061217)', border: `2px solid ${accent}`, boxShadow: `0 10px 30px rgba(0,0,0,0.7), 0 0 0 1px ${accent}55` }}
    >
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: tint, borderBottom: `1px solid ${accent}` }}>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: accent, color: '#04232a' }}>
          {side === 'me' ? '自分' : '相手'}
        </span>
        <span className="hud-font text-white text-sm font-bold">{kind === 'yellDeck' ? 'エールデッキ' : 'デッキ'}</span>
        <span className="hud-mono text-[11px] ml-auto" style={{ color: accent }}>
          残り{deckCount}枚
        </span>
      </div>
      <div className="py-1">
        <button type="button" role="menuitem" disabled={deckCount < 2} onClick={() => onAction('shuffle')} className={`w-full text-left px-4 ${itemClass}`} style={{ minHeight: ITEM_H }}>
          シャッフル
        </button>
        {kind === 'yellDeck' ? (
          <button
            type="button"
            role="menuitem"
            disabled={returnCount < 1 && deckCount < 1}
            onClick={() => onAction('returnYells')}
            className={`w-full text-left px-4 ${itemClass} border-y border-[#143844] my-1`}
            style={{ minHeight: ITEM_H + 6 }}
            title="全てのエールを、エールデッキに戻して、シャッフルしたあと、推しホロメンのライフ分を、ライフに置きます"
          >
            全てのエールを戻す
            <span className="block text-[10px] text-[#9fc3ca]">戻したあと、推しのライフ分をライフへ</span>
          </button>
        ) : (
        /* カードを引く：2列 */
        <div className="grid grid-cols-2 border-y border-[#143844] my-1">
          {draws.map((d, i) => (
            <button
              key={d.action}
              type="button"
              role="menuitem"
              disabled={deckCount < 1}
              onClick={() => onAction(d.action)}
              className={`text-center ${itemClass} ${i % 2 === 0 ? 'border-r border-[#143844]' : ''} ${i < 2 ? 'border-b border-[#143844]' : ''}`}
              style={{ minHeight: ITEM_H }}
            >
              {d.label}
            </button>
          ))}
        </div>
        )}
        {kind === 'deck' && (
          <button type="button" role="menuitem" disabled={returnCount < 1} onClick={() => onAction('returnAll')} className={`w-full text-left px-4 ${itemClass}`} style={{ minHeight: ITEM_H }} title="手札・アーカイブ・ステージのカードを、デッキへ戻します（エールデッキは、そのまま）">
            全てデッキに戻す
          </button>
        )}
        <div className="px-2 pt-1 pb-1">
          <button type="button" role="menuitem" onClick={() => onAction('view')} className="w-full rounded font-bold text-sm text-[#2b1a00] active:brightness-90" style={{ minHeight: ITEM_H - 4, background: 'linear-gradient(180deg, #ffe58a, #ffb81f)', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
            {kind === 'yellDeck' ? 'エールデッキを開く' : 'デッキを開く'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}