import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useIsMobile } from '../hooks/useGridLayout'

// 操作パネルの開閉状態を端末ごとに覚えておく。保存が無い場合は defaultOpen から始める
export function useControlsOpen(pageKey: string, defaultOpen: boolean): [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const storageKey = `horoka-display:controlsOpen:${pageKey}`
  const [open, setOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(storageKey)
    return saved === null ? defaultOpen : saved === '1'
  })
  useEffect(() => {
    localStorage.setItem(storageKey, open ? '1' : '0')
  }, [storageKey, open])
  return [open, setOpen]
}

type Props = {
  open: boolean
  onToggle: () => void
  // 検索語やフィルターが効いているとき、閉じていても分かるように印を出す
  active?: boolean
  // 開閉タブの横に常時表示するコントロール（パック選択・並び替え・昇降順など）
  children?: ReactNode
}

// ナビ直下の常時表示バー。左端の▼/▲タブでパネルを開閉し、その横に主要な操作を並べる
export function ControlsBar({ open, onToggle, active = false, children }: Props) {
  const isMobile = useIsMobile()

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isMobile ? 6 : 10, marginBottom: open ? 8 : 12 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? '操作パネルを閉じる' : '操作パネルを開く'}
        className="hud-mono"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: isMobile ? '6px 10px' : '8px 12px',
          background: open ? 'rgba(0,229,255,0.12)' : 'transparent',
          border: '1px solid var(--hud-cyan)',
          borderRadius: 4,
          color: 'var(--hud-cyan)',
          fontSize: isMobile ? 12 : 13,
          cursor: 'pointer',
          flexShrink: 0,
          touchAction: 'manipulation',
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
        {!isMobile && <span>メニュー</span>}
        {active && (
          <span
            aria-label="検索・フィルター適用中"
            style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffd76a', display: 'inline-block' }}
          />
        )}
      </button>
      {children}
    </div>
  )
}