// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import type { DragEvent } from 'react'

// マウスでドラッグしているあいだ、マウスについて動く絵を、元のカードの scale 倍の大きさにする。
// （大きいままだと、移動先が隠れて見えないため）
export function setScaledDragImage(e: DragEvent, scale = 0.7): void {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  // 横向き（レスト）のカードは、縦向きの大きさにそろえる
  const [w, h] = rect.width > rect.height ? [rect.height, rect.width] : [rect.width, rect.height]
  const dw = Math.max(24, Math.round(w * scale))
  const dh = Math.max(34, Math.round(h * scale))

  const box = document.createElement('div')
  box.style.cssText = `position:fixed;left:-10000px;top:0;width:${dw}px;height:${dh}px;border-radius:6px;overflow:hidden;opacity:.92;pointer-events:none;box-sizing:border-box;`
  const img = el.querySelector('img')
  if (img) {
    const copy = img.cloneNode(true) as HTMLImageElement
    copy.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;transform:none;'
    box.appendChild(copy)
  } else {
    // 裏向きなど、画像が無いカード
    box.style.background = 'linear-gradient(135deg,#1d3d8f,#0b1f4f)'
    box.style.border = '2px solid #8fb4ff'
  }
  document.body.appendChild(box)
  e.dataTransfer.setDragImage(box, Math.round(dw / 2), Math.round(dh / 2))
  window.setTimeout(() => box.remove(), 0)
}