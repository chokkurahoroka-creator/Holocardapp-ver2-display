import { useEffect, useState } from 'react'

// スマホ判定（Tailwindのsmブレークポイント未満）
const MOBILE_QUERY = '(max-width: 640px)'

// スマホでの既定の列数（表示サイズ倍率が1のとき）
export const MOBILE_DEFAULT_COLUMNS = 4
const MOBILE_MAX_COLUMNS = 8

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false))

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

export type GridLayout = {
  gridTemplateColumns: string
  gap: number
  compact: boolean // trueのとき、タイル下部のテキスト情報を省いてコンパクトに表示する
}

// カード一覧グリッドの列構成。表示サイズ倍率（右下の＋/−ボタン）に応じて変わる。
// ・PC: 最小タイル幅を倍率で拡縮する従来どおりの自動列数
// ・スマホ: 倍率1で4列。大きくすると列数が減り、小さくすると列数が増える
export function useGridLayout(tileScale: number): GridLayout {
  const isMobile = useIsMobile()

  if (isMobile) {
    // 2.5列のような半端な値は切り捨て側に寄せる（倍率1.6で2列になるように）
    const columns = Math.min(MOBILE_MAX_COLUMNS, Math.max(1, Math.round(MOBILE_DEFAULT_COLUMNS / tileScale - 0.001)))
    return {
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: columns >= 4 ? 6 : 10,
      compact: columns >= 3,
    }
  }

  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${Math.round(110 * tileScale)}px, 40vw, ${Math.round(160 * tileScale)}px), 1fr))`,
    gap: 12,
    compact: tileScale < 0.75,
  }
}