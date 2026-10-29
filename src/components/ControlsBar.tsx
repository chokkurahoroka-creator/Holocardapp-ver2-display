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
  // 開閉タブ（▼/▲）で開閉するパネルがあるときに指定する。指定しないと、タブは出さない
  open?: boolean
  onToggle?: () => void
  // 検索語やフィルターが効いているとき、閉じていても分かるように印を出す
  active?: boolean
  // メニュー（開閉タブ）の右横に置く検索バー
  search: ReactNode
  // 検索バーの下に常時表示するコントロール。ControlGroup（カード用・パック用）で囲んで並べる
  children?: ReactNode
}

// 並び替えなどの操作が、カードに対するものか、パックに対するものかを示す小さなマーク
function CardGlyph() {
  return (
    <svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <rect x="0.75" y="0.75" width="7.5" height="9.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.2" y="2.4" width="4.6" height="3.4" rx="0.5" fill="currentColor" opacity="0.7" />
    </svg>
  )
}

function PackGlyph() {
  return (
    <svg width="10" height="11" viewBox="0 0 10 11" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path d="M1.2 2.2 L2 1 H8 L8.8 2.2 V9.6 L8 10.4 H2 L1.2 9.6 Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M1.2 2.9 H8.8" stroke="currentColor" strokeWidth="1" />
      <circle cx="5" cy="6.4" r="1.4" fill="currentColor" opacity="0.8" />
    </svg>
  )
}

// 操作のまとまりを、枠で囲む。枠線の上に「CARD」「PACK」の小さな見出しとマークを載せて、
// カードの並び替え（水色）なのか、パックの並び替え・選択（黄色）なのかが、ひと目で分かるようにする
export function ControlGroup({ kind, children }: { kind: 'card' | 'pack'; children: ReactNode }) {
  const isMobile = useIsMobile()
  const color = kind === 'card' ? 'var(--hud-cyan)' : '#ffd76a'
  const label = kind === 'card' ? 'CARD' : 'PACK'
  return (
    <div
      title={kind === 'card' ? 'カードの並び替え・絞り込み' : 'パックの選択・並び替え'}
      // スマホ：枠を小さくして、2つの枠（PACK・CARD）を、画面の横幅に合わせて1行に並べる（CARDは、ボタンが多いので、少し広く）
      className={isMobile ? 'ctl-compact' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        alignItems: 'center',
        gap: isMobile ? 4 : 6,
        padding: isMobile ? '11px 5px 5px' : '12px 8px 7px',
        border: `1px solid ${color}`,
        borderRadius: 6,
        minWidth: 0,
        ...(isMobile ? { flex: kind === 'card' ? '1.7 1 0' : '1 1 0' } : null),
      }}
    >
      <span
        className="hud-mono"
        style={{
          position: 'absolute',
          top: -7,
          left: 8,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 5px',
          fontSize: 9,
          lineHeight: '14px',
          letterSpacing: '0.08em',
          color,
          background: 'var(--hud-bg, #061217)',
        }}
      >
        {kind === 'card' ? <CardGlyph /> : <PackGlyph />}
        {label}
      </span>
      {children}
    </div>
  )
}

// ナビ直下の常時表示バー。1行目は、左端の▼/▲タブ（メニュー）と、その右横の検索バー。
// 2行目に、カード用・パック用の操作のまとまりを並べる
export function ControlsBar({ open = false, onToggle, active = false, search, children }: Props) {
  const isMobile = useIsMobile()
  const hasPanel = !!onToggle

  return (
    <div
      // スマホでは画面の横幅いっぱいの帯にする（PCは今まで通り、ページ内に収める）
      className={isMobile ? 'mobileBleed' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? 8 : 10,
        marginBottom: open ? 8 : 12,
        ...(isMobile
          ? {
              padding: '6px max(10px, 4vw) 8px',
              background: 'var(--hud-panel)',
              borderTop: '1px solid var(--hud-line)',
              borderBottom: '1px solid var(--hud-line)',
            }
          : null),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
        {hasPanel && (
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
              minHeight: 40,
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
            {active && <span aria-label="検索・フィルター適用中" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffd76a', display: 'inline-block' }} />}
          </button>
        )}
        {search}
      </div>

      {children && (
        <div style={{ display: 'flex', flexWrap: isMobile ? 'nowrap' : 'wrap', alignItems: isMobile ? 'stretch' : 'flex-start', gap: isMobile ? 6 : 14, paddingTop: 4 }}>{children}</div>
      )}
    </div>
  )
}