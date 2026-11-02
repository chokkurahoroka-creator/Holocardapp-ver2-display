// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
// カードの属性（色）の扱い。
// 属性が複数あるカードは「多色[赤青]」の形で保存する（色は 白・緑・赤・青・紫・黄 の順に並べる）。
// 1色なら「赤」、無色なら「無色」のように、そのまま保存する。

export const ATTRIBUTE_COLORS = [
    { name: '白', hex: '#f1f5f9' },
    { name: '緑', hex: '#4ade80' },
    { name: '赤', hex: '#f87171' },
    { name: '青', hex: '#60a5fa' },
    { name: '紫', hex: '#c084fc' },
    { name: '黄', hex: '#facc15' },
  ] as const
  
  export const COLORLESS = '無色'
  
  const COLOR_NAMES: string[] = ATTRIBUTE_COLORS.map((c) => c.name)
  
  // 区切り文字（「白/緑」「白・緑」など）を除いた結果が、色の文字だけで出来ているか調べて、色の一覧にする
  function colorsFromText(text: string): string[] | null {
    const chars = Array.from(text.replace(/[\s/／・,、+＋]/g, ''))
    if (chars.length === 0 || !chars.every((ch) => COLOR_NAMES.includes(ch))) return null
    return COLOR_NAMES.filter((name) => chars.includes(name))
  }
  
  export type ParsedAttribute = {
    colors: string[] // チェックを付ける色（無色を選んでいるときは ['無色']）
    other: string // 上のどれにも当てはまらない既存の値（空なら無し）
  }
  
  export function parseAttribute(value: string | null | undefined): ParsedAttribute {
    const v = (value ?? '').trim()
    if (!v) return { colors: [], other: '' }
    if (v === COLORLESS) return { colors: [COLORLESS], other: '' }
  
    const multi = v.match(/^多色\[(.*)\]$/)
    if (multi) {
      const colors = colorsFromText(multi[1] ?? '')
      if (colors) return { colors, other: '' }
      return { colors: [], other: v }
    }
  
    // 過去に「白/緑」のような形で入れていた値も、複数色として読み取る
    const colors = colorsFromText(v)
    if (colors) return { colors, other: '' }
    return { colors: [], other: v }
  }
  
  // チェックされた色から、保存する文字列を作る
  export function buildAttribute(colors: string[]): string {
    if (colors.includes(COLORLESS)) return COLORLESS
    const ordered = COLOR_NAMES.filter((name) => colors.includes(name))
    if (ordered.length === 0) return ''
    if (ordered.length === 1) return ordered[0]!
    return `多色[${ordered.join('')}]`
  }
  
  // 1つの色のチェックを切り替えた後の、保存する文字列を返す。無色は他の色と同時に選べない
  export function toggleAttributeColor(value: string | null | undefined, color: string): string {
    const { colors } = parseAttribute(value)
    if (color === COLORLESS) return colors.includes(COLORLESS) ? '' : COLORLESS
    const base = colors.filter((c) => c !== COLORLESS)
    return buildAttribute(base.includes(color) ? base.filter((c) => c !== color) : [...base, color])
  }