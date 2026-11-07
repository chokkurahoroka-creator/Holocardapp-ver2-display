import { useIsMobile } from '../hooks/useGridLayout'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

// 検索バー（メニューの右横に置く）。入力があるときは、消す「×」を右端に出す
export function SearchBox({ value, onChange, placeholder = 'カード名・タグ・キーワード（スペースで複数）' }: Props) {
  const isMobile = useIsMobile()
  return (
    <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
      <input
        className="field"
        type="text"
        placeholder={isMobile ? 'カード名・タグ（スペースで複数）' : placeholder}
        title="スペースで区切ると、すべての言葉を含むカードを検索します"
        aria-label="カード検索"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', minHeight: 40, paddingRight: 36 }}
      />
      {value && (
        <button
          type="button"
          aria-label="検索語を消す"
          onClick={() => onChange('')}
          style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, background: 'transparent', border: 'none', color: 'var(--hud-ink-dim)', fontSize: 18, cursor: 'pointer' }}
        >
          ×
        </button>
      )}
    </div>
  )
}