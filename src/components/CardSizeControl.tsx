export const CARD_SIZE_MIN = 0.4
export const CARD_SIZE_MAX = 1.6
export const CARD_SIZE_STEP = 0.1
export const CARD_SIZE_DEFAULT = 1

type Props = {
  scale: number
  onChange: (scale: number) => void
}

const btnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--hud-ink)',
  cursor: 'pointer',
  fontSize: 16,
  fontWeight: 700,
}

export function CardSizeControl({ scale, onChange }: Props) {
  const dec = () => onChange(Math.max(CARD_SIZE_MIN, +(scale - CARD_SIZE_STEP).toFixed(2)))
  const inc = () => onChange(Math.min(CARD_SIZE_MAX, +(scale + CARD_SIZE_STEP).toFixed(2)))
  const reset = () => onChange(CARD_SIZE_DEFAULT)

  return (
    <div
      className="hud-panel"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 999,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
      title="表示サイズ"
    >
      <button onClick={dec} style={btnStyle} disabled={scale <= CARD_SIZE_MIN} aria-label="カードを小さく">
        −
      </button>
      <button onClick={reset} style={{ ...btnStyle, fontSize: 14 }} aria-label="表示サイズをリセット">
        🔄
      </button>
      <button onClick={inc} style={btnStyle} disabled={scale >= CARD_SIZE_MAX} aria-label="カードを大きく">
        ＋
      </button>
    </div>
  )
}