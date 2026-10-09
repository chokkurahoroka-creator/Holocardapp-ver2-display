// エール・スキル種別の画像（public/images/ に配置）
const IMAGE_BASE = `${import.meta.env.BASE_URL}images/`

// エールの色 → 画像ファイル
const YELL_IMAGE_FILE: Record<string, string> = {
  白: 'yell-white.png',
  赤: 'yell-red.png',
  青: 'yell-blue.png',
  緑: 'yell-green.png',
  紫: 'yell-purple.png',
  黄: 'yell-yellow.png',
  無色: 'yell-colorless.png',
}

// スキル種別 → バナー画像ファイル（エクストラなど画像が無い種別は、従来の文字バッジのまま）
const SKILL_BANNER_FILE: Record<string, string> = {
  コラボエフェクト: 'skill-collab.png',
  ブルームエフェクト: 'skill-bloom.png',
  ギフト: 'skill-gift.png',
}

// エールの色から表示用の代替色（画像が無い色・読み込み前の下地に使う）
const YELL_FALLBACK_COLOR = '#9aa5a8'

export function YellIcon({ color, size }: { color: string; size: number }) {
  const file = YELL_IMAGE_FILE[color]
  if (!file) {
    // 未知の色は、従来どおりの色付きの丸で表示する
    return (
      <span
        title={color}
        style={{
          width: size * 0.7,
          height: size * 0.7,
          borderRadius: '50%',
          background: YELL_FALLBACK_COLOR,
          border: '1px solid rgba(255,255,255,0.35)',
          display: 'inline-block',
        }}
      />
    )
  }
  return (
    <img
      src={`${IMAGE_BASE}${file}`}
      alt={`${color}エール`}
      title={`${color}エール`}
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    />
  )
}

// エールを数に応じて横に並べる
export function YellRow({ items, size, max = 10 }: { items: { color: string; count: number }[]; size: number; max?: number }) {
  const icons: { color: string; key: string }[] = []
  items.forEach((y, yi) => {
    const n = Math.max(0, Math.min(max, Number(y.count) || 0))
    for (let i = 0; i < n; i++) icons.push({ color: y.color, key: `${yi}-${i}` })
  })
  if (!icons.length) return null
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }} aria-label="エール">
      {icons.map((d) => (
        <YellIcon key={d.key} color={d.color} size={size} />
      ))}
    </span>
  )
}

// スキル種別のバナー。画像が無い種別は null（呼び出し側で文字バッジにする）
export function SkillBanner({ skillType, height }: { skillType: string; height: number }) {
  const file = SKILL_BANNER_FILE[skillType]
  if (!file) return null
  return (
    <img
      src={`${IMAGE_BASE}${file}`}
      alt={skillType}
      title={skillType}
      draggable={false}
      style={{ height, width: 'auto', display: 'block', flexShrink: 0 }}
    />
  )
}

export function hasSkillBanner(skillType: string | undefined): boolean {
  return !!skillType && skillType in SKILL_BANNER_FILE
}