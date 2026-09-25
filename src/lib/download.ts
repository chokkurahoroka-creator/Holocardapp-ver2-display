import JSZip from 'jszip'
import type { Card } from '../types/card'

function safeFileName(card: Card): string {
  const base = `${card.set_code}-${card.card_number || card.slot}_${card.card_name}`
  return base.replace(/[^\w\-一-龠ぁ-んァ-ヶ]/g, '') + '.jpg'
}

export async function downloadCardImage(card: Card) {
  if (!card.image_url) return
  const res = await fetch(card.image_url)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeFileName(card)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// 進捗をonProgressで通知しながら、選択したカード群をZIPにまとめてダウンロードする
export async function downloadCardsAsZip(cards: Card[], onProgress?: (done: number, total: number) => void) {
  const zip = new JSZip()
  const folder = zip.folder(`ホロカ_カード画像_${new Date().toISOString().slice(0, 10)}`)
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    onProgress?.(i, cards.length)
    if (!card.image_url) continue
    try {
      const res = await fetch(card.image_url)
      const blob = await res.blob()
      // 区分＋配置スロット番号を必ず含め、同名カード（新規/再録/パラレル違いなど）でファイル名が衝突しないようにする
      const name = `${card.card_name}_${card.type}${card.slot}`.replace(/[^\w\-一-龠ぁ-んァ-ヶ]/g, '') + '.jpg'
      folder?.file(name, blob)
    } catch {
      // 1件の取得失敗でZIP全体を止めない
    }
  }
  onProgress?.(cards.length, cards.length)
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ホロカ_カード画像_${new Date().toISOString().slice(0, 10)}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}