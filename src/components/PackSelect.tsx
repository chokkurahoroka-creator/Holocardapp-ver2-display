import { useEffect, useRef, useState } from 'react'
import type { PackGroup } from '../utils/packGroups'

type Props = {
  groups: PackGroup[] // 選択肢にするグループ（パックセット、またはパックセットに入っていない単独パック）
  value: string | null // 選択中のグループのキー
  onChange: (groupKey: string | null) => void
}

// パックのアイコン。画像が無い弾は空の枠を出して、行の高さ・文字位置が揃うようにする
function PackIcon({ url, size }: { url: string | null; size: number }) {
  const w = Math.round(size * 0.78)
  return (
    <span
      aria-hidden="true"
      style={{
        width: w,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 3,
        overflow: 'hidden',
        background: url ? 'transparent' : 'rgba(255,255,255,0.05)',
        border: url ? 'none' : '1px dashed var(--hud-line)',
      }}
    >
      {url && <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
    </span>
  )
}

// 弾の選択（パック名の前にアイコン画像を表示する）。
// <select>の<option>には画像を入れられないため、ボタン＋一覧の自前ドロップダウンにしている
export function PackSelect({ groups, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = groups.find((g) => g.key === value) ?? null

  // 外側のクリック/タップ、Escapeで閉じる
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (key: string | null) => {
    onChange(key)
    setOpen(false)
  }

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '6px 10px',
    background: active ? 'rgba(0,229,255,0.14)' : 'transparent',
    border: 'none',
    borderLeft: `3px solid ${active ? 'var(--hud-cyan)' : 'transparent'}`,
    color: 'var(--hud-ink)',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 13,
    touchAction: 'manipulation',
  })

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 'clamp(120px, 38vw, 260px)', maxWidth: '100%' }}>
      <button
        type="button"
        className="field hud-mono"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer' }}
      >
        {selected && <PackIcon url={selected.imageUrl} size={22} />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : '弾を選択してください'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--hud-cyan)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 700,
            width: 'max(100%, 280px)',
            maxWidth: 'calc(100vw - 20px)',
            maxHeight: '60vh',
            overflowY: 'auto',
            background: '#0b1e26',
            border: '1px solid var(--hud-cyan)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          <button type="button" role="option" aria-selected={value === null} onClick={() => choose(null)} className="hud-mono" style={rowStyle(value === null)}>
            <PackIcon url={null} size={34} />
            弾を選択してください
          </button>
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              role="option"
              aria-selected={g.key === value}
              onClick={() => choose(g.key)}
              className="hud-mono"
              style={rowStyle(g.key === value)}
            >
              <PackIcon url={g.imageUrl} size={34} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {g.name}
                {g.sets.length > 1 && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--hud-ink-dim)' }}>
                    {g.sets.map((s) => s.set_code).join(' / ')}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}