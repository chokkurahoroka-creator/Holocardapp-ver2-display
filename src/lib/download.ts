import JSZip from 'jszip'
import type { Card } from '../types/card'

function safeFileName(card: Card): string {
  const base = `${card.set_code}-${card.card_number || card.slot}_${card.card_name}`
  return base.replace(/[^\w\-一-龠ぁ-んァ-ヶ]/g, '') + '.jpg'
}

// 画像の取得：
//   ① ブラウザから、直接取得する（R2にCORS設定があれば成功。サーバーを通らないので、速い）
//   ② できなければ、このサイトのサーバー（/api/image）経由で取得する（CORSの設定や、キャッシュの影響を受けない）
// 取得したものが、画像でないとき（エラーのページなど）は、失敗として扱う
async function fetchImageBlob(url: string): Promise<Blob> {
  const reasons: string[] = []
  try {
    // cache: 'reload'：以前に、ページの表示（<img>）で読み込んだ画像が、キャッシュに残っていると、CORSの情報が無く、取得に失敗することがあるため、キャッシュを使わず、取り直す
    const res = await fetch(url, { mode: 'cors', cache: 'reload' })
    if (res.ok) {
      const blob = await res.blob()
      if (blob.type.startsWith('image/')) return blob
      reasons.push('直接: 画像ではない応答')
    } else {
      reasons.push(`直接: HTTP ${res.status}`)
    }
  } catch (err) {
    reasons.push('直接: ' + (err instanceof Error ? err.message : String(err)) + '（CORSの設定が原因の可能性）')
  }
  try {
    const res = await fetch(`/api/image?url=${encodeURIComponent(url)}`)
    if (res.ok) {
      const blob = await res.blob()
      if (blob.type.startsWith('image/')) return blob
      reasons.push('サーバー経由: 画像ではない応答（サーバーの設定が、反映されていない可能性）')
    } else {
      let message = ''
      try {
        message = ((await res.json()) as { error?: string }).error ?? ''
      } catch {
        // JSONではない応答
      }
      reasons.push(`サーバー経由: ${message || `HTTP ${res.status}`}`)
    }
  } catch (err) {
    reasons.push('サーバー経由: ' + (err instanceof Error ? err.message : String(err)))
  }
  throw new Error(reasons.join(' ／ '))
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadCardImage(card: Card) {
  if (!card.image_url) return
  try {
    saveBlob(await fetchImageBlob(card.image_url), safeFileName(card))
  } catch (err) {
    window.alert('画像をダウンロードできませんでした。\n' + (err instanceof Error ? err.message : String(err)))
  }
}

// 進捗をonProgressで通知しながら、選択したカード群をZIPにまとめてダウンロードする。
// 一部のカードの取得に失敗しても、ほかのカードで、ZIPを作る（失敗したカードは、最後に知らせる）。全部失敗したときは、エラーにする
export async function downloadCardsAsZip(cards: Card[], onProgress?: (done: number, total: number) => void) {
  const zip = new JSZip()
  const folder = zip.folder(`ホロカ_カード画像_${new Date().toISOString().slice(0, 10)}`)
  const failed: { card: Card; reason: string }[] = []
  let done = 0
  let next = 0
  onProgress?.(0, cards.length)

  // 4件ずつ、並べて取得する
  const worker = async () => {
    while (next < cards.length) {
      const card = cards[next++]
      if (!card) break
      if (card.image_url) {
        try {
          const blob = await fetchImageBlob(card.image_url)
          // 区分＋配置スロット番号を必ず含め、同名カード（新規/再録/パラレル違いなど）でファイル名が衝突しないようにする
          const name = `${card.card_name}_${card.type}${card.slot}`.replace(/[^\w\-一-龠ぁ-んァ-ヶ]/g, '') + '.jpg'
          folder?.file(name, blob)
        } catch (err) {
          failed.push({ card, reason: err instanceof Error ? err.message : String(err) })
        }
      }
      onProgress?.(++done, cards.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, cards.length) }, worker))

  const withImage = cards.filter((c) => c.image_url).length
  if (withImage > 0 && failed.length === withImage) throw new Error(`画像を取得できませんでした（${failed[0]?.reason ?? ''}）`)

  saveBlob(await zip.generateAsync({ type: 'blob' }), `ホロカ_カード画像_${new Date().toISOString().slice(0, 10)}.zip`)
  if (failed.length > 0) {
    const names = failed.slice(0, 5).map((f) => f.card.card_name).join('、')
    window.alert(`${failed.length}枚は、画像を取得できなかったため、ZIPに入っていません。\n${names}${failed.length > 5 ? ' ほか' : ''}\n（${failed[0]?.reason ?? ''}）`)
  }
}