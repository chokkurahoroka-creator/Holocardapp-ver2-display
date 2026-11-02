// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, TouchEvent as ReactTouchEvent } from 'react'
import { createPortal } from 'react-dom'
import type { BackStyle } from '../utils/cardBack'

// スマホ・タブレット（タッチ操作）で、ドラッグ&ドロップをするための仕組み。
// 長押し（約0.2秒）してから動かすと、ドラッグが始まる。長押しの前に指が動いたら、ふつうのスクロールとして扱う。
// ドロップ先は、data-pf-zone（ゾーンID）・data-pf-index（並べ替えの位置）・data-pf-halves（上下に分けるゾーン）の付いた要素から探す。

export type GhostSpec = {
  imageUrl?: string | null
  faceDown?: boolean
  back?: BackStyle // 裏向きのカードの、裏側の見た目（置いてある場所に応じて変わる）
  text?: string // 画像が無いときに出す文字
  w: number
  h: number
  round?: boolean // 丸い形（ダメージカウンター）
  color?: string // 丸い形の色
}

export type DropHit = { zone: string; index?: number; pos?: 'top' | 'bottom' }

type Options<T> = {
  onStart: (payload: T) => void
  onHover: (hit: DropHit | null, payload: T) => void
  onDrop: (payload: T, hit: DropHit) => void
  onEnd: () => void
}

const HOLD_MS = 220 // 長押しと見なす時間
const CANCEL_PX = 10 // 長押しの前に、これ以上動いたら、スクロールと見なす
const MOVED_PX = 8 // ドラッグ開始後、これ以上動いたら「動かした」と見なす
const EDGE_PX = 80 // 画面の上下の端で、自動スクロールする範囲

// 指の位置にあるドロップ先を探す
function hitTest(x: number, y: number): DropHit | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const zoneEl = el.closest<HTMLElement>('[data-pf-zone]')
    if (!zoneEl) continue
    const zone = zoneEl.dataset.pfZone
    if (!zone) continue
    const hit: DropHit = { zone }
    if (zoneEl.dataset.pfIndex !== undefined) hit.index = Number(zoneEl.dataset.pfIndex)
    if (zoneEl.dataset.pfHalves !== undefined) {
      const r = zoneEl.getBoundingClientRect()
      hit.pos = y < r.top + r.height / 2 ? 'top' : 'bottom'
    }
    return hit
  }
  return null
}

// 画面をスクロールさせている要素を探す（このアプリは、ページ全体ではなく、中身の領域がスクロールする）
function findScroller(el: Element | null): HTMLElement | null {
  for (let cur: Element | null = el; cur && cur !== document.body; cur = cur.parentElement) {
    const oy = getComputedStyle(cur).overflowY
    if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 1) return cur as HTMLElement
  }
  return null
}

type Session<T> = {
  payload: T
  ghost: GhostSpec
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  moved: boolean
  holdTimer: number | null
  tickRaf: number | null // 画面の端にいるあいだだけ回す、自動スクロール用
  hoverRaf: number | null // 指の位置のドロップ先判定は、1フレームに1回にまとめる
  lastHit: string // 直前のドロップ先（変わったときだけ、通知する）
  scroller: HTMLElement | null | undefined // スクロールする要素（最初に探した結果を使い回す）
  target: Element
  move: (ev: TouchEvent) => void
  end: (ev: TouchEvent) => void
  cancel: () => void
}

export function useTouchDrag<T>(opts: Options<T>): { begin: (e: ReactTouchEvent, payload: T, ghost: GhostSpec) => void; ghostNode: ReactNode } {
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })
  const sessionRef = useRef<Session<T> | null>(null)
  const ghostElRef = useRef<HTMLDivElement | null>(null)
  const [ghost, setGhost] = useState<GhostSpec | null>(null)

  const place = (el: HTMLDivElement, x: number, y: number, g: GhostSpec) => {
    // 指の少し上に出して、指で隠れないようにする
    el.style.transform = `translate(${Math.round(x - g.w / 2)}px, ${Math.round(y - g.h - 24)}px)`
  }

  const cleanup = useCallback(() => {
    const s = sessionRef.current
    if (!s) return
    if (s.holdTimer !== null) window.clearTimeout(s.holdTimer)
    if (s.tickRaf !== null) cancelAnimationFrame(s.tickRaf)
    if (s.hoverRaf !== null) cancelAnimationFrame(s.hoverRaf)
    s.target.removeEventListener('touchmove', s.move as EventListener)
    s.target.removeEventListener('touchend', s.end as EventListener)
    s.target.removeEventListener('touchcancel', s.cancel)
    sessionRef.current = null
    setGhost(null)
  }, [])

  // 画面が閉じられたときに、残らないようにする
  useEffect(() => cleanup, [cleanup])

  const begin = useCallback(
    (e: ReactTouchEvent, payload: T, spec: GhostSpec) => {
      if (e.touches.length !== 1) return
      cleanup()
      const t = e.touches[0]!
      const target = e.target as Element

      // ドロップ先の判定（elementsFromPoint）は重いので、1フレームに1回だけ行い、結果が変わったときだけ通知する
      const runHover = () => {
        const s = sessionRef.current
        if (!s) return
        s.hoverRaf = null
        if (!s.active) return
        const hit = hitTest(s.x, s.y)
        const key = hit ? `${hit.zone}|${hit.index ?? ''}|${hit.pos ?? ''}` : ''
        if (key === s.lastHit) return
        s.lastHit = key
        optsRef.current.onHover(hit, s.payload)
      }
      const updateHover = () => {
        const s = sessionRef.current
        if (!s || !s.active || s.hoverRaf !== null) return
        s.hoverRaf = requestAnimationFrame(runHover)
      }

      // 画面の上下の端に指があるあいだだけ、自動でスクロールする（端にいないときは、何も動かさない）
      const edgeStep = () => {
        const s = sessionRef.current
        if (!s) return
        s.tickRaf = null
        if (!s.active) return
        let dy = 0
        if (s.y < EDGE_PX) dy = -Math.ceil(((EDGE_PX - s.y) / EDGE_PX) * 16)
        else if (s.y > window.innerHeight - EDGE_PX) dy = Math.ceil(((s.y - (window.innerHeight - EDGE_PX)) / EDGE_PX) * 16)
        if (dy === 0) return // 端から離れたら、ループを止める（次に端へ入ったとき、touchmove で再開する）
        if (s.scroller === undefined) s.scroller = findScroller(s.target)
        if (s.scroller) s.scroller.scrollBy(0, dy)
        else window.scrollBy(0, dy)
        updateHover()
        s.tickRaf = requestAnimationFrame(edgeStep)
      }
      const maybeEdgeScroll = () => {
        const s = sessionRef.current
        if (!s || !s.active || s.tickRaf !== null) return
        if (s.y < EDGE_PX || s.y > window.innerHeight - EDGE_PX) s.tickRaf = requestAnimationFrame(edgeStep)
      }

      const s: Session<T> = {
        payload,
        ghost: spec,
        startX: t.clientX,
        startY: t.clientY,
        x: t.clientX,
        y: t.clientY,
        active: false,
        moved: false,
        holdTimer: null,
        tickRaf: null,
        hoverRaf: null,
        lastHit: '',
        scroller: undefined,
        target,
        move: (ev) => {
          const tt = ev.touches[0]
          if (!tt) return
          s.x = tt.clientX
          s.y = tt.clientY
          const dist = Math.hypot(s.x - s.startX, s.y - s.startY)
          if (!s.active) {
            if (dist > CANCEL_PX) cleanup() // 長押しの前に動いた：スクロール
            return
          }
          ev.preventDefault() // ドラッグ中は、画面をスクロールさせない
          if (dist > MOVED_PX) s.moved = true
          if (ghostElRef.current) place(ghostElRef.current, s.x, s.y, s.ghost)
          updateHover()
          maybeEdgeScroll()
        },
        end: (ev) => {
          if (!s.active) {
            cleanup() // ただのタップ（そのまま、クリックとして扱われる）
            return
          }
          const dropped = s.moved
          if (dropped) ev.preventDefault() // ドロップのあとに、クリックが起きて、選択が変わらないようにする
          const hit = dropped ? hitTest(s.x, s.y) : null
          const dragged = s.payload
          cleanup()
          if (hit) optsRef.current.onDrop(dragged, hit)
          optsRef.current.onEnd()
        },
        cancel: () => {
          const wasActive = s.active
          cleanup()
          if (wasActive) optsRef.current.onEnd()
        },
      }
      sessionRef.current = s

      // touchmove は、スクロールを止められるよう、passive にしない。touchstart のうちに、触っている要素に付ける（iOSで効かせるため）
      target.addEventListener('touchmove', s.move as EventListener, { passive: false })
      target.addEventListener('touchend', s.end as EventListener, { passive: false })
      target.addEventListener('touchcancel', s.cancel)

      s.holdTimer = window.setTimeout(() => {
        s.holdTimer = null
        s.active = true
        if ('vibrate' in navigator) navigator.vibrate(12)
        optsRef.current.onStart(s.payload)
        setGhost(s.ghost)
        maybeEdgeScroll() // 最初から画面の端にいるときも、自動スクロールを始める
      }, HOLD_MS)
    },
    [cleanup]
  )

  const ghostNode: ReactNode =
    ghost &&
    createPortal(
      <div
        ref={(el) => {
          ghostElRef.current = el
          const s = sessionRef.current
          if (el && s) place(el, s.x, s.y, ghost)
        }}
        style={{ position: 'fixed', left: 0, top: 0, zIndex: 120, pointerEvents: 'none', width: ghost.w, height: ghost.h, opacity: 0.92, willChange: 'transform' }}
      >
        {ghost.round ? (
          <div style={{ width: ghost.w, height: ghost.h, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #fff 0%, ${ghost.color ?? '#ef4444'} 55%)`, border: '3px solid #fff', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: Math.round(ghost.w * 0.36) }}>
            {ghost.text}
          </div>
        ) : ghost.faceDown ? (
          <div style={{ width: ghost.w, height: ghost.h, borderRadius: 6, background: `linear-gradient(135deg, ${ghost.back?.from ?? '#1d3d8f'}, ${ghost.back?.to ?? '#0b1f4f'})`, border: `2px solid ${ghost.back?.border ?? '#8fb4ff'}`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', whiteSpace: 'pre-line', color: ghost.back?.text ?? '#bcd0ff', fontWeight: 800, fontSize: 11 }}>
            {ghost.back?.label}
          </div>
        ) : ghost.imageUrl ? (
          <img src={ghost.imageUrl} alt="" draggable={false} style={{ width: ghost.w, height: ghost.h, objectFit: 'cover', borderRadius: 6, display: 'block', border: '2px solid #4ce0e6', boxSizing: 'border-box' }} />
        ) : (
          <div style={{ width: ghost.w, height: ghost.h, borderRadius: 6, background: '#26324f', border: '2px solid #4ce0e6', boxSizing: 'border-box', color: '#9fc3ca', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 4 }}>{ghost.text}</div>
        )}
      </div>,
      document.body
    )

  return { begin, ghostNode }
}