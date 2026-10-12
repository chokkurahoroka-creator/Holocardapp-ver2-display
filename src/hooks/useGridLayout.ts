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
  hideFav: boolean // trueのとき、カードが小さすぎるので、お気に入りの★ボタンを出さない
  chipFont: number // 並び替えの区切り線に付けるタグの文字サイズ（px）。カードのズームに合わせて変わる
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
      // 5列以上（既定の4列より小さく表示）になったら、★は小さすぎて押しにくく、画像も隠すので非表示にする
      hideFav: columns >= 5,
      // 列が増えるほど（カードが小さいほど）、文字も小さくする：3列=16px、4列=13px、5列=10px、6列以上=9px以下
      chipFont: Math.max(7, Math.min(16, Math.round(52 / columns))),
    }
  }

  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${Math.round(110 * tileScale)}px, 40vw, ${Math.round(160 * tileScale)}px), 1fr))`,
    gap: 12,
    compact: tileScale < 0.75,
    hideFav: tileScale < 0.6,
    chipFont: Math.max(9, Math.min(18, Math.round(16 * tileScale))),
  }
}