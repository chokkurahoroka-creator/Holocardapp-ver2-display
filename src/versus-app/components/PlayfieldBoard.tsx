// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, TouchEvent as ReactTouchEvent } from 'react'
import type { DeckCard } from '../utils/deckImage'
import type { GhostSpec } from '../hooks/useTouchDrag'
import { backStyleOf } from '../utils/cardBack'
import { setScaledDragImage } from '../utils/dragImage'
import { ATTRIBUTE_COLORS, COLORLESS, parseAttribute } from '../utils/attribute'
import { HALF_GAP, HALF_H, HALF_W, LOG_FRAME_H, LOG_LABEL_H, LOG_PAD, LOG_W, LOG_X, MAT_H, SIDE_PANEL_W, SIDE_PANEL_X, ZONES, skillCost, handRowLayout, ZONE_BY_KEY, findCard, slotBlocked, parseZone, archiveSplit, isDamageableZone, unitDamage, unitHpUp, unitPower, unitParts, zoneId, PHASE_LABEL, type BloomStage, type PlayCard, type PlayState, type Side, type TurnState, type ZoneDef, type ZoneId, type ZoneKey } from '../utils/playfield'

// ドラッグ中のもの。card: 1枚のカード／unit: 枠の中身全体（ブルーム・サポート・エールごと）／search: 検索結果（新しいカード）／damage: ダメージカウンター
export type PlayDrag = { kind: 'card'; uid: string } | { kind: 'unit'; zone: ZoneId } | { kind: 'search'; card: DeckCard } | { kind: 'damage'; amount: number; from?: ZoneId } | { kind: 'power'; amount: number; from?: ZoneId } | { kind: 'hp'; amount: number; from?: ZoneId } | null
export type DragItem = NonNullable<PlayDrag>

// 「どの枠をクリック（タップ）するか」を選ばせるモード（エールをつけるホロメンを選ぶ・アーツを使うセンターを選ぶ・ダメージを与える相手を選ぶ）。
// zones の枠が光って、クリックすると onPickZone が呼ばれる
export type PickState = { zones: ZoneId[]; color: string }

// アニメーション。shuffle: そのゾーンのカードをシャッフルする動き／down: ダメージで倒されたホロメンが、アーカイブへ飛んでいく動き
export type PlayFxInput = { kind: 'shuffle'; zone: ZoneId } | { kind: 'down' | 'fly'; from: ZoneId; to: ZoneId; card: DeckCard } | { kind: 'bloom'; zone: ZoneId; stage: BloomStage; label: string } // bloom：ブルームした枠の、演出（相手の画面へは送らない。それぞれの画面で、盤面の変化から出す） // fly：カードが、1枚、別のゾーンへ飛んでいく（ホロパワーのアーカイブなど）
export type PlayFx = PlayFxInput & { id: number }

const FX_CSS = `
@keyframes pf-shuf-l{0%{transform:translateX(0) rotate(0)}35%{transform:translateX(-58%) rotate(-10deg)}65%{transform:translateX(-58%) rotate(-10deg)}100%{transform:translateX(0) rotate(0)}}
@keyframes pf-shuf-r{0%{transform:translateX(0) rotate(0)}35%{transform:translateX(58%) rotate(10deg)}65%{transform:translateX(58%) rotate(10deg)}100%{transform:translateX(0) rotate(0)}}
@keyframes pf-shuf-m{0%{transform:translateY(0)}35%{transform:translateY(-16%)}65%{transform:translateY(-16%)}100%{transform:translateY(0)}}
@keyframes pf-down-card{
 0%{transform:translate(0,0) scale(1) rotate(0);opacity:1;filter:none}
 8%{transform:translate(-14px,0) scale(1);filter:drop-shadow(0 0 16px #ef4444) brightness(1.25)}
 16%{transform:translate(14px,0)}
 24%{transform:translate(-10px,0)}
 32%{transform:translate(0,0) scale(1.04);filter:drop-shadow(0 0 22px #ef4444) brightness(1.3)}
 100%{transform:translate(var(--dx),var(--dy)) scale(.55) rotate(16deg);opacity:0;filter:drop-shadow(0 0 10px #ef4444)}}
@keyframes pf-fly{0%{transform:translate(0,0) scale(1) rotate(0);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.62) rotate(-12deg);opacity:0}}
@keyframes pf-bloom-flash{0%{opacity:0;transform:scale(.6)}18%{opacity:.95}100%{opacity:0;transform:scale(1.3)}}
@keyframes pf-bloom-ring{0%{transform:scale(.5);opacity:.95}100%{transform:scale(1.55);opacity:0}}
@keyframes pf-bloom-spark{0%{transform:translate(-50%,-50%) rotate(var(--a)) translateY(0) scale(.4);opacity:0}15%{opacity:1}100%{transform:translate(-50%,-50%) rotate(var(--a)) translateY(calc(var(--r) * -1)) scale(1);opacity:0}}
@keyframes pf-bloom-text{0%{transform:scale(.3);opacity:0}18%{transform:scale(1.2);opacity:1}62%{transform:scale(1);opacity:1}100%{transform:translateY(-26px) scale(1);opacity:0}}
@keyframes pf-bloom-shine{0%{transform:translateX(-130%) skewX(-20deg);opacity:0}25%{opacity:.9}100%{transform:translateX(230%) skewX(-20deg);opacity:0}}
@keyframes pf-down-flash{0%{opacity:0}12%{opacity:.75}100%{opacity:0}}
@keyframes pf-down-text{0%{transform:scale(.4);opacity:0}15%{transform:scale(1.25);opacity:1}55%{transform:scale(1);opacity:1}100%{transform:translateY(-24px) scale(1);opacity:0}}
@media (prefers-reduced-motion: reduce){.pf-fx{display:none!important}}
`

// ブルームの演出の色：1st＝緑、Buzzの1st＝橙、2nd＝紫（と、金の輪）
const BLOOM_STYLE: Record<BloomStage, { main: string; glow: string; sparks: number; rings: number }> = {
  first: { main: '#6ee7a0', glow: 'rgba(110,231,160,0.6)', sparks: 10, rings: 2 },
  buzz: { main: '#ffb347', glow: 'rgba(255,179,71,0.65)', sparks: 12, rings: 2 },
  second: { main: '#c084fc', glow: 'rgba(192,132,252,0.7)', sparks: 16, rings: 3 },
}

// デッキにドロップしたときの位置。top: デッキトップ（上半分）／bottom: デッキの一番下（下半分）
export type DropPos = 'top' | 'bottom'

// 推しホロメンカードの固有スキル（推しスキル／SP推しスキル）。カードの登録内容から作る
export type OshiSkill = { which: 'oshi' | 'sp'; title: string; powerCost: string }

// そのゾーンに、ドラッグ中のものを置けるか。ダメージカウンターは、ホロメンのいる枠（推しを除く）にだけ置ける
// ターンを進めている側の盤面に出す、4本の光るバー（上下左右）。両端は、矢じりのように尖らせる
const TURN_BAR_THICK = 5 // バーの太さ（盤面の座標。スマホでは、縮小されて約1px）
const TURN_BAR_EDGE = 2 // 盤面の縁からの距離（Center・Collabo の名前や、手札・ライフと、重ならない位置）
const TURN_BAR_INSET = 220 // 角から、バーの端までの距離（大きいほど、バーが短くなる）
const TURN_BAR_TIP = 9 // 尖った先の長さ
const TURN_BAR_BASE: CSSProperties = { position: 'absolute', opacity: 0.9 }
const TURN_BAR_H: CSSProperties = {
  ...TURN_BAR_BASE,
  clipPath: `polygon(0 50%, ${TURN_BAR_TIP}px 0, calc(100% - ${TURN_BAR_TIP}px) 0, 100% 50%, calc(100% - ${TURN_BAR_TIP}px) 100%, ${TURN_BAR_TIP}px 100%)`,
  background: 'linear-gradient(90deg, #e6fdff, #4ce0e6 14%, rgba(76,224,230,0.55) 50%, #4ce0e6 86%, #e6fdff)',
}
const TURN_BAR_V: CSSProperties = {
  ...TURN_BAR_BASE,
  clipPath: `polygon(50% 0, 100% ${TURN_BAR_TIP}px, 100% calc(100% - ${TURN_BAR_TIP}px), 50% 100%, 0 calc(100% - ${TURN_BAR_TIP}px), 0 ${TURN_BAR_TIP}px)`,
  background: 'linear-gradient(180deg, #e6fdff, #4ce0e6 14%, rgba(76,224,230,0.55) 50%, #4ce0e6 86%, #e6fdff)',
}
const FIELD_EXT = 38 // 盤面の枠（背景・光）を、ステージの名前（Center・Collabo）の上まで広げる高さ
export const DAMAGE_STRIP = 'damage-strip' // ダメージカウンター置き場（カードに乗ったカウンターを、ここへドラッグすると外れる）

export function dropAllowed(drag: PlayDrag, zone: ZoneId, state: PlayState): boolean {
  if (drag === null) return false
  if ((zone as string) === DAMAGE_STRIP) return (drag.kind === 'damage' || drag.kind === 'power' || drag.kind === 'hp') && !!drag.from
  if (drag.kind === 'damage' || drag.kind === 'power' || drag.kind === 'hp') return isDamageableZone(state, zone)
  // バックとコラボは、合わせて5枚まで：5枚になったら、空いている枠には、新しく置けない（枠どうしの移動は、置ける）
  const from: ZoneId | null = drag.kind === 'card' ? (findCard(state, drag.uid)?.zone ?? null) : drag.kind === 'unit' ? drag.zone : null
  if (slotBlocked(state, zone, from)) return false
  return true
}

// 盤面の上のカードを、指で持ち上げたときに出す絵（盤面の拡大率に関わらず、同じ大きさ）
function ghostOf(pc: PlayCard, backKey?: ZoneKey): GhostSpec {
  // エールデッキの上のカードは、ドラッグ中、表側（どのエールか）を見せる
  return { imageUrl: pc.card.image_url, faceDown: pc.faceDown && !(backKey === 'yellDeck' && pc.card.image_url), back: backStyleOf(backKey), text: pc.card.card_name, w: 70, h: 98 }
}

export type BoardProps = {
  state: PlayState
  selectedUid: string | null
  drag: PlayDrag
  overZone: ZoneId | null
  overPos: DropPos | null // デッキの上にドラッグしているとき、上半分（デッキトップ）か、下半分（一番下）か
  hpOf: (card: DeckCard) => number | null // カードのHP（分からないときは null）
  onDragStart: (d: DragItem) => void
  onDeckMenu: (side: Side, anchor: DOMRect, kind: 'deck' | 'yellDeck') => void // デッキ・エールデッキをクリックしたとき、近くにメニューを出す
  onTouchDragStart: (e: ReactTouchEvent, d: DragItem, ghost: GhostSpec) => void // タッチ操作で、長押ししてドラッグを始める
  touchMode: boolean // タッチ操作の端末。マウスのドラッグ・ダブルクリック・右クリックでの操作を無効にして、誤操作を防ぐ（ドラッグは、長押しして動かす）
  moveMode: boolean // 移動先を選んでいるとき。どのゾーンをタップしても、選んだカードがそこへ移る
  onZoneTap: (zone: ZoneId) => void
  maxHeight?: number // 指定すると、盤面全体がこの高さに収まる大きさにする（PCで、全体が見えるように）
  fx: PlayFx[] // 再生中のアニメーション
  oshiSkills: Record<Side, OshiSkill[]> // 推しホロメンカードの固有スキル
  skillUsed: Record<string, boolean> // 推しスキルを使ったか（キーは「me:oshi」「me:sp」など）
  onToggleSkill: (side: Side, which: 'oshi' | 'sp') => void
  onDragEnd: () => void
  onDragOverZone: (zone: ZoneId | null, pos?: DropPos) => void
  onDropZone: (zone: ZoneId, index?: number, pos?: DropPos) => void
  onSelect: (uid: string | null) => void
  onToggleRest: (uid: string) => void
  onFlip: (uid: string) => void
  onPreview: (card: DeckCard | null) => void
  onOpenZone: (zone: ZoneId) => void
  turn: TurnState // ターンの状態（先攻・後攻、ターン数、いまターンを進めている側）
  onTurnChange: (side: Side) => void // ターンチェンジ（その側が、ターンを終える）
  onToggleFirst: () => void // 先攻・後攻を入れ替える
  onInspect: (card: DeckCard) => void // 相手が公開したカードを、詳しく見る
  onHandReturnAll: (side: Side) => void // 手札の左：手札を、全てデッキに戻す
  onHandSort: (side: Side) => void // 手札の左：手札を、並び替える
  concealSide?: Side // 対戦中：この側の、手札などの中身は、伏せて見せない（相手の側）
  pick: PickState | null // 枠を選ばせているとき
  onPickZone: (zone: ZoneId) => void // 光っている枠を、クリック（タップ）したとき
}

// ---- カードの裏面 ----
// ライフ：クリスタルのような、ハートの宝石
function LifeCrystal({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.88} viewBox="0 0 64 56" aria-hidden="true">
      <defs>
        <linearGradient id="pf-crystal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd1e8" />
          <stop offset="0.45" stopColor="#f472b6" />
          <stop offset="1" stopColor="#9d174d" />
        </linearGradient>
      </defs>
      <path d="M32 54 C10 38 2 26 2 16 C2 8 8 2 16 2 C23 2 29 6 32 11 C35 6 41 2 48 2 C56 2 62 8 62 16 C62 26 54 38 32 54 Z" fill="url(#pf-crystal)" stroke="#fff1f8" strokeWidth="2.5" strokeLinejoin="round" />
      {/* 宝石の面 */}
      <path d="M32 11 L32 54 M2 16 L32 26 L62 16 M16 2 L32 26 L48 2 M10 34 L32 26 L54 34" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 14 C8 9 12 6 17 6 C21 6 25 8 27 12 L20 20 Z" fill="rgba(255,255,255,0.65)" />
      <path d="M40 8 L47 6 L44 12 Z" fill="rgba(255,255,255,0.8)" />
    </svg>
  )
}

// カードの裏側。置いてある場所（デッキ・エールデッキ・ライフ・パワー）に応じて、色が変わる。
// 文字は出さず、枚数（×41 など）を中央に置く。ライフは、クリスタルのハートにする
function CardBack({ w, h, backKey, count, rotateText }: { w: number; h: number; backKey?: ZoneKey; count?: number; rotateText?: boolean }) {
  const b = backStyleOf(backKey)
  const life = backKey === 'life'
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: Math.max(6, Math.min(w, h) * 0.08),
        background: life ? 'linear-gradient(180deg, #7a1650, #3b0a2a)' : `linear-gradient(135deg, ${b.from}, ${b.to})`,
        border: `${Math.max(2, Math.min(w, h) * 0.025)}px solid ${life ? '#f9a8d4' : b.border}`,
        boxShadow: 'inset 0 0 0 3px rgba(10,20,60,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {life ? (
        <LifeCrystal size={Math.min(w * 0.3, h * 0.95)} />
      ) : count !== undefined ? (
        <span
          style={{
            transform: rotateText ? 'rotate(-90deg)' : undefined,
            padding: '2px 18px',
            borderRadius: 999,
            background: 'rgba(5,10,30,0.55)',
            color: '#fff',
            fontWeight: 800,
            fontSize: Math.max(18, Math.min(w, h) * 0.3),
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}
        >
          ×{count}
        </span>
      ) : null}
    </div>
  )
}

type CardViewProps = {
  pc: PlayCard
  w: number
  h: number
  selected: boolean
  draggable: boolean
  fit?: { w: number; h: number } // レスト（横向き）にしたときに、収める範囲
  style?: CSSProperties
  p: BoardProps
  onClickOverride?: () => void
  onDoubleClickOverride?: () => void
  dragItem?: DragItem // ドラッグしたときに運ぶもの（指定しないと、このカード1枚）
  onDropOnCard?: (e: DragEvent) => void
  backKey?: ZoneKey // 置いてある場所（裏向きのとき、裏側の見た目を変える）
  backCount?: number // 裏向きの山札の枚数（裏側の中央に、×41 のように出す）
  backRotate?: boolean // 横向きのゾーン（パワー）：枚数の文字を、まっすぐに直す
  dropZone?: { zone: ZoneId; index: number } // タッチでのドロップ先として、探せるようにする（手札の並べ替え）
}

// 盤面の上の、カード1枚。ドラッグで移動、ダブルクリックでレスト、右クリックで裏返し、クリックで選択
function CardView({ pc, w, h, selected, draggable, fit, style, p, onClickOverride, onDoubleClickOverride, dragItem, onDropOnCard, dropZone, backKey, backCount, backRotate }: CardViewProps) {
  const lastTap = useRef(0) // タッチ：直前にタップした時刻（ダブルタップの判定）
  // レスト（90度回転）したとき、枠に収まるように縮小する
  const restScale = pc.rested && fit ? Math.min(fit.w / h, fit.h / w, 1) : 1
  const touch = p.touchMode
  const item: DragItem = dragItem ?? { kind: 'card', uid: pc.uid }
  return (
    <div
      draggable={draggable && !touch}
      data-pf-zone={dropZone?.zone}
      data-pf-index={dropZone?.index}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', pc.uid)
        setScaledDragImage(e) // ドラッグ中の絵は、元の70%の大きさ
        p.onDragStart(item)
      }}
      onTouchStart={(e) => {
        // 長押ししてから動かすと、ドラッグ（短くタップすると、選択）
        if (draggable && !p.moveMode) p.onTouchDragStart(e, item, ghostOf(pc, backKey))
      }}
      onDragEnd={p.onDragEnd}
      onDragOver={onDropOnCard ? (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move' } : undefined}
      onDrop={onDropOnCard}
      onClick={(e) => {
        e.stopPropagation()
        // タッチ：すぐ続けて2回タップ（ダブルタップ）すると、レスト／レスト解除
        if (touch && !onClickOverride && !onDoubleClickOverride) {
          const now = Date.now()
          if (now - lastTap.current < 320) {
            lastTap.current = 0
            p.onToggleRest(pc.uid)
            return
          }
          lastTap.current = now
        }
        if (onClickOverride) onClickOverride()
        else p.onSelect(selected ? null : pc.uid)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (touch) return // タッチは、上の onClick のダブルタップで処理する（二重に動かないように）
        if (onDoubleClickOverride) onDoubleClickOverride()
        else if (!onClickOverride) p.onToggleRest(pc.uid)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!touch) p.onFlip(pc.uid) // 長押しで裏返ってしまわないよう、タッチでは、右クリック相当の操作を無効にする
      }}
      onMouseEnter={() => {
        if (touch) return // タッチでは、選んだときに handleSelect がプレビューを更新する
        if (!pc.faceDown) p.onPreview(pc.card)
      }}
      title={pc.faceDown ? '裏向き（右クリックで表向き）' : `${pc.card.card_name}（ダブルクリック／ダブルタップでレスト、右クリックで裏返し）`}
      style={{
        width: w,
        height: h,
        cursor: draggable ? 'grab' : 'pointer',
        transform: pc.rested ? `rotate(90deg) scale(${restScale})` : undefined,
        transition: 'transform .15s',
        outline: selected ? '5px solid #ffd76a' : 'none',
        outlineOffset: 2,
        borderRadius: Math.max(6, w * 0.05),
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        // 移動先を選んでいるあいだは、カードではなく、下のゾーンをタップできるようにする
        pointerEvents: p.moveMode ? 'none' : undefined,
        ...style,
      }}
    >
      {pc.faceDown || !pc.card.image_url ? (
        pc.faceDown ? (
          <>
            <CardBack w={w} h={h} backKey={backKey} count={backCount} rotateText={backRotate} />
            {/* エールデッキの上のカードは、ドラッグ中の絵に、表側を見せる（画像は、前もって読み込んでおく。画面には出さない） */}
            {backKey === 'yellDeck' && pc.card.image_url && <img src={pc.card.image_url} alt="" draggable={false} style={{ display: 'none' }} />}
          </>
        ) : (
          <div style={{ width: w, height: h, background: '#26324f', color: '#9fc3ca', fontSize: Math.max(12, w * 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 6, boxSizing: 'border-box', borderRadius: 8 }}>
            {pc.card.card_name}
          </div>
        )
      ) : (
        <img src={pc.card.image_url} alt={pc.card.card_name} draggable={false} loading="lazy" decoding="async" style={{ width: w, height: h, objectFit: 'cover', borderRadius: Math.max(6, w * 0.05), boxShadow: '0 2px 6px rgba(0,0,0,0.5)', display: 'block' }} />
      )}
    </div>
  )
}

// エールのチップ。色は、エールカード1枚ごとの色（属性）から決める。
// 「多色[赤青]」のように複数の色を持つエールは、色ごとに分けて塗る。属性が空のときは、カード名（「赤エール」など）から探す
function yellColors(card: DeckCard): string[] {
  const hexOf = (name: string): string => (name === COLORLESS ? '#9aa5a8' : (ATTRIBUTE_COLORS.find((c) => c.name === name)?.hex ?? '#9ca3af'))
  let names = parseAttribute(card.attribute).colors
  if (names.length === 0) names = card.card_name.includes(COLORLESS) ? [COLORLESS] : ATTRIBUTE_COLORS.map((c) => c.name as string).filter((n) => card.card_name.includes(n))
  return names.length === 0 ? ['#9ca3af'] : names.map(hexOf)
}

// 色を、白（amt>0）や黒（amt<0）に近づける
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const to = amt >= 0 ? 255 : 0
  const k = Math.abs(amt)
  const ch = (v: number) => Math.round(v + (to - v) * k)
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`
}

// 補色（色相を、反対側へ回した色）。チップの色と、はっきり見分けられる枠の色にする。
// 白・灰色のような、色みの少ない色は、補色がないので、暗い色（明るい色には）／白（暗い色には）にする
function complement(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let sat = 0
  if (d > 0.0001) {
    sat = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  if (sat < 0.18) return l > 0.6 ? '#1e293b' : '#f8fafc'
  return `hsl(${Math.round((h + 180) % 360)}, 92%, ${l > 0.55 ? 36 : 64}%)`
}

// つやのある、立体のチップに見える塗り（左上に光、下にかけて暗く）。枠線は、チップの色の補色（複数色は、色ごとに分ける）
function chipBackground(hexes: string[]): string {
  const gloss = 'radial-gradient(ellipse at 32% 24%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 22%, rgba(255,255,255,0) 48%) padding-box'
  const rings = hexes.map(complement)
  const step = 100 / hexes.length
  const ring = rings.length === 1 ? `linear-gradient(${rings[0]}, ${rings[0]}) border-box` : `conic-gradient(${rings.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')}) border-box`
  if (hexes.length === 1) {
    const c = hexes[0]!
    return `${gloss}, radial-gradient(circle at 50% 60%, ${shade(c, 0.22)} 0%, ${c} 50%, ${shade(c, -0.38)} 100%) padding-box, ${ring}`
  }
  return `${gloss}, conic-gradient(${hexes.map((h, i) => `${h} ${i * step}% ${(i + 1) * step}%`).join(', ')}) padding-box, ${ring}`
}

// ドラッグで、別のカードへつけ替えたり、アーカイブへ送ったりできる
function YellIcon({ pc, size, left, z, p }: { pc: PlayCard; size: number; left: number; z: number; p: BoardProps }) {
  const card = pc.card
  const hexes = yellColors(card)
  const item: DragItem = { kind: 'card', uid: pc.uid }
  return (
    <span
      title={`エール: ${card.card_name}${card.attribute ? `（${card.attribute}）` : ''}（ドラッグで移動）`}
      draggable={!p.touchMode}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', pc.uid)
        p.onDragStart(item)
      }}
      onDragEnd={p.onDragEnd}
      onTouchStart={(e) => {
        if (!p.moveMode) p.onTouchDragStart(e, item, { w: 46, h: 46, round: true, color: hexes[0], text: '' })
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => p.onPreview(card)}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        left,
        top: 0,
        zIndex: z,
        cursor: 'grab',
        pointerEvents: p.moveMode ? 'none' : 'auto',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: chipBackground(hexes),
        border: '4px solid transparent',
        boxShadow: 'inset 0 -6px 9px rgba(0,0,0,0.4), inset 0 3px 5px rgba(255,255,255,0.65), 0 0 0 1px rgba(0,0,0,0.45), 0 3px 6px rgba(0,0,0,0.65)',
        boxSizing: 'border-box',
      }}
    />
  )
}

function Badge({ n }: { n: number }) {
  return (
    <span style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 5, minWidth: 52, textAlign: 'center', padding: '4px 12px', borderRadius: 999, background: 'rgba(10,15,30,0.9)', color: '#fff', fontWeight: 800, fontSize: 34, pointerEvents: 'none' }}>
      ×{n}
    </span>
  )
}

// ---- ゾーン1つ ----
function ZoneView({ def, side, p }: { def: ZoneDef; side: Side; p: BoardProps }) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const supRef = useRef<HTMLDivElement>(null)
  const [openSup, setOpenSup] = useState<string | null>(null) // クリックして大きく表示している、サポートのカード
  const id = zoneId(side, def.key)

  // 表示しているサポートは、ほかの場所を押すと閉じる
  useEffect(() => {
    if (!openSup) return
    const close = (e: PointerEvent) => {
      if (!supRef.current?.contains(e.target as Node)) setOpenSup(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [openSup])

  // ゾーンの中身を開く。デッキは、中身ではなく、近くにメニュー（シャッフル・ドローなど）を出す
  // 対戦中、相手の手札・デッキ・エールデッキ・ライフ・パワーの中身は、見られない（アーカイブ・ステージは、見られる）
  const concealed = p.concealSide === side
  const secretPile = concealed && (def.key === 'deck' || def.key === 'yellDeck' || def.key === 'life' || def.key === 'power')
  const openViewer = () => {
    if (!secretPile) p.onOpenZone(id)
  }
  const openZone = () => {
    if (secretPile) return
    if ((def.key === 'deck' || def.key === 'yellDeck') && zoneRef.current) {
      p.onDeckMenu(side, zoneRef.current.getBoundingClientRect(), def.key)
      return
    }
    p.onOpenZone(id)
  }
  const cards = p.state[id]
  const grayedOut = p.turn.active !== side && (def.key === 'deck' || def.key === 'yellDeck' || def.key === 'handHolder')
  const blockedSlot = slotBlocked(p.state, id, null) // バックとコラボが5枚で、空いている枠は、使えない
  const oshiSkills = def.key === 'oshi' && cards.length > 0 ? p.oshiSkills[side] : []
  const showSkills = oshiSkills.length > 0
  const allowed = dropAllowed(p.drag, id, p.state)
  const over = allowed && p.overZone === id
  const picking = !!p.pick && p.pick.zones.includes(id) // 選んでもらう枠（光らせて、クリックで選べる）
  const pickColor = p.pick?.color ?? '#ffd76a'
  const isDeck = def.key === 'deck'
  const top = cards[cards.length - 1]
  const w = def.w
  const h = def.h

  const body = (() => {
    if (def.kind === 'slot') {
      if (!top) return null
      // 枠の中身は、ひとまとまり（ユニット）：表に見えるホロメン、ブルームの回数、つけているサポート、つけているエール
      const parts = unitParts(cards)
      const face = parts.top ?? top
      const unitSelected = p.selectedUid !== null && cards.some((c) => c.uid === p.selectedUid)
      const blooms = Math.max(0, parts.holomen.length - 1)
      // 数値は、合計だけを表示する（HP：いちばん上のホロメンのHPから、ダメージを引いた残り／D：ダメージ／P：パワーアップ）。推しは、対象外
      const counterZone = def.key !== 'oshi' && isDamageableZone(p.state, id)
      const dmgTotal = counterZone ? unitDamage(cards) : 0
      const powTotal = counterZone ? unitPower(cards) : 0
      const hpUpTotal = counterZone ? unitHpUp(cards) : 0
      const baseHp = counterZone && parts.top ? p.hpOf(parts.top.card) : null
      const maxHp = baseHp === null ? null : baseHp + hpUpTotal // 最大HP＝カードのHP＋最大HPアップ
      const remain = maxHp === null ? null : Math.max(0, maxHp - dmgTotal)
      const pill = (bg: string, color: string, size = 22): CSSProperties => ({ padding: '1px 10px', borderRadius: 999, background: bg, color, fontWeight: 800, fontSize: size, lineHeight: 1.3, whiteSpace: 'nowrap' })
      const hasInfo = blooms > 0 || remain !== null || dmgTotal > 0 || powTotal > 0 || hpUpTotal > 0

      // つけているサポート：カードの右側に、横へ出して並べる。古いカードが上、新しいカードが下。クリック／タップで、カードを大きく表示する
      const sups = parts.supports
      // サポート：40%に縮小して、右へ90度回転し、ホロメンカードの右側に、上側30%だけを見せる（残りは、ホロメンカードの下に隠れる）
      const supCardW = Math.round(w * 0.4) // 縮小したカードの幅（回転したあとは、見える縦の長さ）
      const supCardH = Math.round(supCardW * (88 / 63)) // 縮小したカードの高さ（回転したあとは、横の長さ）
      const supStripT = Math.round(supCardH * 0.3) // 見せる部分の厚み（カードの上側30%）
      const supStep = sups.length <= 1 ? 0 : Math.min(supCardW + 3, (h - 6 - supCardW) / (sups.length - 1)) // 重ねるたびに、下へずらす（枠の高さに収まらないときは、重ねて詰める）
      const openCard = sups.find((sp) => sp.uid === openSup)
      const popupOnLeft = def.x + def.w + supStripT + 10 + 205 > HALF_W // 右に入らない枠は、カードの左側に出す
      const yellSize = p.touchMode ? 58 : 36 // スマホは、盤面が小さく縮むので、エールのチップを大きくする
      const yellStep = parts.yells.length <= 1 ? 0 : Math.min(yellSize + 3, (w - 16 - yellSize) / (parts.yells.length - 1))
      return (
        <>
          <CardView
            pc={face}
            w={w - 6}
            h={h - 6}
            selected={unitSelected}
            draggable
            fit={{ w: w - 6, h: h - 6 }}
            onClickOverride={picking ? () => p.onPickZone(id) : undefined}
            p={p}
            dragItem={{ kind: 'unit', zone: id }} // 中身ごと動かす（ブルーム・サポート・エールも連動）
            style={{ position: 'absolute', left: 0, top: 0 }}
          />
          {/* 上の段：左にブルーム、右にHP（残り/最大）。その下に、ダメージ（D）・パワーアップ（P）の合計 */}
          {hasInfo && (
            <div style={{ position: 'absolute', left: 8, right: 8, top: 8, zIndex: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 4, pointerEvents: 'none' }}>
              {blooms > 0 && <span style={pill('var(--hud-cyan)', '#04232a', 21)}>Bloom×{blooms}</span>}
              {remain !== null && (
                <span title="HP（残り／最大）" style={{ ...pill(dmgTotal > 0 ? '#b91c1c' : 'rgba(10,15,30,0.92)', '#fff', 22), marginLeft: 'auto', border: '2px solid rgba(255,255,255,0.85)' }}>
                  {remain}/{maxHp}
                </span>
              )}
              {(dmgTotal > 0 || powTotal > 0 || hpUpTotal > 0) && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  {hpUpTotal > 0 && <span title="最大HPアップの合計" style={pill('#16a34a', '#fff')}>H:+{hpUpTotal}</span>}
                  {dmgTotal > 0 && <span title="ダメージの合計" style={pill('#b91c1c', '#fff')}>D:{dmgTotal}</span>}
                  {powTotal > 0 && <span title="パワーアップの合計" style={pill('#f59e0b', '#3b1d00')}>P:+{powTotal}</span>}
                </div>
              )}
            </div>
          )}
          {/* つけているサポート：40%に縮小して、右へ90度回転し、カードの右側に、上側30%だけを出す。重ねるたびに、下へずらして並べる（古いカードが上、新しいカードが下）。クリック／タップで、カードを大きく表示する */}
          {sups.length > 0 && (
            <div ref={supRef} style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, zIndex: 4, pointerEvents: 'none' }}>
              {sups.map((sp, i) => {
                const open = openSup === sp.uid
                const item: DragItem = { kind: 'card', uid: sp.uid }
                return (
                  <div
                    key={sp.uid}
                    draggable={!p.touchMode}
                    title={`サポート: ${sp.card.card_name}（クリックで表示／ドラッグで移動）`}
                    onDragStart={(e) => {
                      e.stopPropagation()
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', sp.uid)
                      p.onDragStart(item)
                    }}
                    onDragEnd={p.onDragEnd}
                    onTouchStart={(e) => {
                      if (!p.moveMode) p.onTouchDragStart(e, item, { imageUrl: sp.card.image_url, text: sp.card.card_name, w: 62, h: 87 })
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenSup(open ? null : sp.uid)
                      p.onPreview(sp.card)
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{
                      position: 'absolute',
                      left: w - 6, // ホロメンカードの右端から
                      top: i * supStep,
                      width: supStripT,
                      height: supCardW,
                      zIndex: i + 1,
                      overflow: 'hidden',
                      borderRadius: '0 10px 10px 0',
                      background: '#26324f',
                      cursor: 'pointer',
                      pointerEvents: p.moveMode ? 'none' : 'auto',
                      boxShadow: open ? '0 0 0 3px var(--hud-cyan), 0 3px 6px rgba(0,0,0,0.6)' : '0 3px 6px rgba(0,0,0,0.6)',
                      userSelect: 'none',
                      WebkitTouchCallout: 'none',
                    }}
                  >
                    {/* 縮小したカードを、右へ90度回して置く。回すと、カードの上側が右端に来るので、右端から supStripT 分（上側30%）だけが見える */}
                    <div style={{ position: 'absolute', left: supStripT - supCardH, top: 0, width: supCardH, height: supCardW }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, width: supCardW, height: supCardH, transformOrigin: '0 0', transform: `translateX(${supCardH}px) rotate(90deg)` }}>
                        {sp.card.image_url ? (
                          <img src={sp.card.image_url} alt={sp.card.card_name} draggable={false} loading="lazy" decoding="async" style={{ width: supCardW, height: supCardH, objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <span style={{ color: '#fff', fontSize: 14, padding: '0 6px' }}>{sp.card.card_name}</span>
                        )}
                      </div>
                    </div>
                    {/* 赤い縁（ホロメンカード側の辺は、なし） */}
                    <div style={{ position: 'absolute', inset: 0, border: '3px solid #ef4444', borderLeft: 'none', borderRadius: '0 10px 10px 0', pointerEvents: 'none', boxSizing: 'border-box' }} />
                  </div>
                )
              })}
              {openCard && (
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenSup(null)
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    ...(popupOnLeft ? { right: w + 10 } : { left: w - 6 + supStripT + 10 }),
                    zIndex: 60,
                    width: 200,
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    borderRadius: 10,
                    border: '4px solid #ffd76a',
                    overflow: 'hidden',
                    background: '#0b1220',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.75)',
                  }}
                >
                  {openCard.card.image_url ? <img src={openCard.card.image_url} alt={openCard.card.card_name} draggable={false} style={{ width: '100%', display: 'block' }} /> : <div style={{ padding: 16, color: '#fff', fontSize: 24 }}>{openCard.card.card_name}</div>}
                </div>
              )}
            </div>
          )}
          {/* 登場したターン（手札・デッキ・アーカイブから、ステージに出したホロメン）：右下に、黄色の警告マーク */}
          {parts.top?.fresh && (
            <svg
              width="46"
              height="42"
              viewBox="0 0 44 40"
              aria-label="登場したターン"
              style={{ position: 'absolute', right: 6, bottom: parts.yells.length > 0 ? yellSize + 16 : 8, zIndex: 11, pointerEvents: 'none' }}
            >
              <path d="M22 3 L41 37 H3 Z" fill="#facc15" stroke="#92400e" strokeWidth="3" strokeLinejoin="round" />
              <rect x="20" y="14" width="4" height="12" rx="2" fill="#78350f" />
              <circle cx="22" cy="31" r="2.5" fill="#78350f" />
            </svg>
          )}
          {/* つけているエール：カードの下に、1列で並べる（多いときは、少しずつ重ねる） */}
          {parts.yells.length > 0 && (
            <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: yellSize, zIndex: 9, pointerEvents: 'none' }}>
              {parts.yells.map((y, i) => (
                <YellIcon key={y.uid} pc={y} size={yellSize} left={i * yellStep} z={i + 1} p={p} />
              ))}
            </div>
          )}
        </>
      )
    }
    if (def.key === 'archive') {
      // アーカイブは、カードのスタックと、エールのスタックを、別々に表示する（ユニットがアーカイブに行くと、エールは外れて、別のスタックになる）
      const split = archiveSplit(cards)
      const mainTop = split.main[split.main.length - 1]
      const yellTop = split.yells[split.yells.length - 1]
      const mw = Math.round((w - 6) * 0.76)
      const mh = Math.round(mw * (88 / 63))
      const yw = Math.round((w - 6) * 0.5)
      const yh = Math.round(yw * (88 / 63))
      const pill = (text: string, style: CSSProperties) => (
        <span style={{ position: 'absolute', zIndex: 12, padding: '2px 10px', borderRadius: 999, background: 'rgba(10,15,30,0.92)', color: '#fff', fontWeight: 800, fontSize: 24, pointerEvents: 'none', ...style }}>{text}</span>
      )
      return (
        <>
          {mainTop && (
            <div style={{ position: 'absolute', left: 0, top: 0, zIndex: 1 }}>
              <CardView backKey={def.key} pc={mainTop} w={mw} h={mh} selected={false} draggable p={p} onClickOverride={openZone} />
            </div>
          )}
          {mainTop && pill(`×${split.main.length}`, { left: 6, top: mh - 34 })}
          {yellTop && (
            <div style={{ position: 'absolute', right: 0, bottom: 0, zIndex: 3, outline: '3px solid #38bdf8', outlineOffset: 0, borderRadius: 8 }}>
              <CardView backKey={def.key} pc={yellTop} w={yw} h={yh} selected={false} draggable p={p} onClickOverride={openZone} />
            </div>
          )}
          {yellTop && pill(`エール×${split.yells.length}`, { right: 4, bottom: 4, zIndex: 14, background: '#0c4a6e' })}
        </>
      )
    }
    if (def.kind === 'pile') {
      if (!top) return null
      // 横向きのゾーン（パワー）は、カードを90度回して、ゾーンにぴったり収める
      const cw = def.landscape ? h - 6 : w - 6
      const ch = def.landscape ? w - 6 : h - 6
      return (
        <div style={{ position: 'absolute', left: (w - 6 - cw) / 2, top: (h - 6 - ch) / 2, transform: def.landscape ? 'rotate(90deg)' : undefined }}>
          <CardView backKey={def.key} backCount={cards.length} backRotate={def.landscape} pc={top} w={cw} h={ch} selected={false} draggable p={p} onClickOverride={openZone} onDoubleClickOverride={isDeck || def.key === 'yellDeck' ? openViewer : undefined} />
        </div>
      )
    }
    if (def.kind === 'life') {
      // ライフは、裏向きのカードを、横向きに縦へ重ねて見せる
      // ライフが7つ以上になったら、2列に並べる
      const stripeH = 68
      const twoCol = cards.length >= 7
      const innerW = w - 22
      const colW = twoCol ? Math.floor((innerW - 6) / 2) : innerW
      const rows = twoCol ? Math.ceil(cards.length / 2) : cards.length
      const step = rows > 1 ? Math.min(stripeH + 6, (h - 6 - 16 - stripeH) / (rows - 1)) : 0
      return cards.map((pc, i) => {
        const isTop = i === cards.length - 1
        const col = twoCol ? i % 2 : 0
        const row = twoCol ? Math.floor(i / 2) : i
        return (
          <div key={pc.uid} style={{ position: 'absolute', left: 8 + col * (colW + 6), top: 8 + row * step, width: colW, height: stripeH, zIndex: i }}>
            <CardView backKey={def.key} pc={pc} w={colW} h={stripeH} selected={p.selectedUid === pc.uid} draggable={isTop} p={p} onClickOverride={openZone} />
          </div>
        )
      })
    }
    // 手札：横に広げて並べる
    const ch = h - 14
    const cw = Math.round((ch * 63) / 88)
    const step = cards.length > 1 ? Math.min(cw + 10, (w - cw - 20) / (cards.length - 1)) : 0
    return cards.map((pc, i) => (
      <div key={pc.uid} style={{ position: 'absolute', left: 10 + i * step, top: 4, zIndex: i }}>
        <CardView
          pc={concealed ? (pc.revealed ? { ...pc, faceDown: false } : { ...pc, faceDown: true }) : pc}
          w={cw}
          h={ch}
          selected={!concealed && p.selectedUid === pc.uid}
          draggable={!concealed}
          onClickOverride={concealed ? (pc.revealed ? () => p.onInspect(pc.card) : () => undefined) : undefined}
          fit={{ w: cw, h: ch }}
          p={p}
          dropZone={{ zone: id, index: i }}
          onDropOnCard={(e) => {
            e.preventDefault()
            e.stopPropagation()
            p.onDropZone(id, i) // 手札のカードの上にドロップすると、そのカードの前に入る（並べ替え）
          }}
        />
        {pc.revealed && (
          <span style={{ position: 'absolute', right: 6, top: 6, zIndex: 20, padding: '0 10px', borderRadius: 999, background: '#ffd76a', color: '#3b2a00', fontWeight: 800, fontSize: 22, pointerEvents: 'none', boxShadow: '0 2px 5px rgba(0,0,0,0.6)' }}>公開中</span>
        )}
      </div>
    ))
  })()

  const shuffleFx = p.fx.find((f) => f.kind === 'shuffle' && f.zone === id)
  const downFx = p.fx.find((f) => f.kind === 'down' && f.from === id)
  const downTo = downFx && downFx.kind === 'down' ? parseZone(downFx.to) : null
  const downDef = downTo ? ZONE_BY_KEY.get(downTo.key) : undefined
  const flyFxs = p.fx.filter((f) => f.kind === 'fly' && f.from === id)
  const bloomFx = p.fx.find((f) => f.kind === 'bloom' && f.zone === id)
  return (
    <>
      <div
        ref={zoneRef}
        data-pf-zone={id}
        data-pf-halves={isDeck ? '1' : undefined}
        onDragOver={(e) => {
          if (!allowed) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          // デッキの上では、画面の上半分ならデッキトップ、下半分なら一番下
          let pos: DropPos | undefined
          if (isDeck) {
            const r = e.currentTarget.getBoundingClientRect()
            pos = e.clientY < r.top + r.height / 2 ? 'top' : 'bottom'
          }
          if (p.overZone !== id || (isDeck && p.overPos !== pos)) p.onDragOverZone(id, pos)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) p.onDragOverZone(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (!allowed) return
          let pos: DropPos | undefined
          if (isDeck) {
            const r = e.currentTarget.getBoundingClientRect()
            pos = e.clientY < r.top + r.height / 2 ? 'top' : 'bottom'
          }
          p.onDropZone(id, undefined, pos)
        }}
        onClick={() => {
          if (picking) p.onPickZone(id) // ステップの中で、この枠を選んだ
          else if (p.moveMode) p.onZoneTap(id) // 移動先として、このゾーンを選んだ
          else if (def.kind === 'pile' || def.kind === 'life') openZone()
          else p.onSelect(null)
        }}
        onDoubleClick={() => {
          if (isDeck || def.key === 'yellDeck') openViewer() // デッキ・エールデッキは、ダブルクリックで中身を見る
        }}
        style={{
          position: 'absolute',
          left: def.x,
          top: def.y,
          width: def.w,
          height: def.h,
          transition: def.key === 'hand' || def.key === 'handHolder' ? 'left 0.2s ease, width 0.2s ease, filter 0.3s ease' : 'filter 0.3s ease',
          // ターンではないプレイヤーの、デッキ・エールデッキ・ホルダーは、灰色にする
          filter: grayedOut ? 'grayscale(1) brightness(0.72)' : undefined,
          boxSizing: 'border-box',
          border: `3px solid ${def.color}`,
          background: `${def.color}2e`,
          borderRadius: 12,
          boxShadow: over ? '0 0 0 6px var(--hud-cyan), 0 0 24px var(--hud-cyan)' : picking ? `0 0 0 4px ${pickColor}, 0 0 34px ${pickColor}` : 'none',
          // 移動先を選んでいるあいだは、全部のゾーンを、黄色い点線で示す
          outline: p.moveMode ? '5px dashed #ffd76a' : picking ? `6px solid ${pickColor}` : 'none',
          outlineOffset: 2,
          cursor: p.moveMode || picking || def.kind === 'pile' || def.kind === 'life' ? 'pointer' : 'default',
        }}
      >
        {/* ゾーンの名前（カードが無いときは大きく、あるときは左上に小さく） */}
        {(!cards.length || def.kind === 'pile' || def.kind === 'life') && !def.labelBelow && (
          <span
            style={{
              position: 'absolute',
              left: 10,
              top: 6,
              zIndex: 20,
              fontWeight: 800,
              fontSize: cards.length ? 24 : def.kind === 'hand' ? 44 : 32,
              color: def.color,
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              pointerEvents: 'none',
              lineHeight: 1.1,
            }}
          >
            {def.label}
          </span>
        )}
        {body}
        {/* バックとコラボが、合わせて5枚になったら、空いている枠は、使えない（カードは入らない）。バックの枠だけ、斜線と「×」で、見分けられるようにする（コラボには、表示しない） */}
        {blockedSlot && def.key !== 'collab' && (
          <div
            aria-label="使えない枠"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 25,
              pointerEvents: 'none',
              borderRadius: 10,
              background: 'repeating-linear-gradient(135deg, rgba(0,0,0,0.62) 0 12px, rgba(60,10,10,0.5) 12px 24px)',
              border: '3px dashed rgba(248,113,113,0.85)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              color: '#fca5a5',
              fontWeight: 800,
            }}
          >
            <span style={{ fontSize: Math.min(def.w, def.h) * 0.4, lineHeight: 1 }}>×</span>
            <span style={{ fontSize: 22 }}>使用不可</span>
          </div>
        )}
        {/* シャッフルのアニメーション：カードが左右に分かれて、重なり直す */}
        {shuffleFx && (
          <div key={shuffleFx.id} className="pf-fx" style={{ position: 'absolute', inset: 0, zIndex: 35, pointerEvents: 'none' }}>
            {[
              { anim: 'pf-shuf-l', z: 1 },
              { anim: 'pf-shuf-r', z: 2 },
              { anim: 'pf-shuf-m', z: 3 },
            ].map((c) => (
              <div
                key={c.anim}
                style={{
                  position: 'absolute',
                  left: '19%',
                  top: '12%',
                  width: '62%',
                  height: '76%',
                  zIndex: c.z,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #1d3d8f, #0b1f4f)',
                  border: '3px solid #8fb4ff',
                  boxSizing: 'border-box',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
                  animation: `${c.anim} 0.55s ease-in-out 2`,
                }}
              />
            ))}
          </div>
        )}
        {/* カードが1枚ずつ、別のゾーンへ飛んでいく（ホロパワーを、アーカイブへ送るときなど） */}
        {flyFxs.map((f) => {
          if (f.kind !== 'fly') return null
          const toP = parseZone(f.to)
          const toDef = toP ? ZONE_BY_KEY.get(toP.key) : undefined
          if (!toDef) return null
          return (
            <div key={f.id} className="pf-fx" style={{ position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none' }}>
              <div
                style={
                  {
                    position: 'absolute',
                    inset: 0,
                    '--dx': `${toDef.x + toDef.w / 2 - (def.x + def.w / 2)}px`,
                    '--dy': `${toDef.y + toDef.h / 2 - (def.y + def.h / 2)}px`,
                    animation: 'pf-fly 0.6s ease-in forwards',
                  } as CSSProperties
                }
              >
                {f.card.image_url ? <img src={f.card.image_url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, display: 'block', boxShadow: '0 0 18px rgba(255,158,232,0.8)' }} /> : <div style={{ width: '100%', height: '100%', borderRadius: 10, background: '#26324f' }} />}
              </div>
            </div>
          )
        })}
        {/* ブルームのアニメーション：進化レベルの色で光って、輪とキラキラが広がり、カードの上を光が走る */}
        {bloomFx && bloomFx.kind === 'bloom' && (() => {
          const c = BLOOM_STYLE[bloomFx.stage]
          const big = Math.min(def.w * 0.2, 54)
          return (
            <div key={bloomFx.id} className="pf-fx" style={{ position: 'absolute', inset: 0, zIndex: 42, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', inset: -10, borderRadius: 16, background: `radial-gradient(circle, ${c.glow} 0%, rgba(0,0,0,0) 72%)`, animation: 'pf-bloom-flash 1.2s ease-out forwards' }} />
              {Array.from({ length: c.rings }, (_, i) => (
                <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: 14, border: `${7 - i}px solid ${i === 2 ? '#ffd76a' : c.main}`, boxShadow: `0 0 26px ${i === 2 ? '#ffd76a' : c.main}`, opacity: 0, animation: `pf-bloom-ring 1.05s ease-out ${i * 0.22}s forwards` }} />
              ))}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%', background: `linear-gradient(90deg, rgba(255,255,255,0), ${c.main}, rgba(255,255,255,0.85), rgba(255,255,255,0))`, mixBlendMode: 'screen', opacity: 0, animation: 'pf-bloom-shine 0.9s ease-out 0.15s forwards' }} />
              </div>
              {Array.from({ length: c.sparks }, (_, i) => (
                <div
                  key={i}
                  style={
                    {
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: i % 2 ? 16 : 24,
                      height: i % 2 ? 16 : 24,
                      background: i % 3 === 0 ? '#fff' : c.main,
                      clipPath: 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)',
                      filter: `drop-shadow(0 0 6px ${c.main})`,
                      opacity: 0,
                      '--a': `${(360 / c.sparks) * i}deg`,
                      '--r': `${def.h * (i % 2 ? 0.62 : 0.82)}px`,
                      animation: `pf-bloom-spark 1.1s ease-out ${(i % 4) * 0.05}s forwards`,
                    } as CSSProperties
                  }
                />
              ))}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: side === 'opp' ? 'rotate(180deg)' : undefined }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.05, fontWeight: 900, color: '#fff', textShadow: `0 0 12px ${c.main}, 0 0 4px ${c.main}, 0 3px 6px rgba(0,0,0,0.9)`, animation: 'pf-bloom-text 1.5s ease-out forwards', opacity: 0 }}>
                  <span style={{ fontSize: Math.round(big * 0.72), color: c.main, letterSpacing: 1 }}>{bloomFx.label}</span>
                  <span style={{ fontSize: Math.round(big), letterSpacing: 2 }}>BLOOM</span>
                </div>
              </div>
            </div>
          )
        })()}
        {/* ダウンのアニメーション：赤く光って震え、アーカイブへ飛んでいく */}
        {downFx && downFx.kind === 'down' && downDef && (
          <div key={downFx.id} className="pf-fx" style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: '#ef4444', animation: 'pf-down-flash 0.8s ease-out forwards' }} />
            <div
              style={
                {
                  position: 'absolute',
                  inset: 0,
                  '--dx': `${downDef.x + downDef.w / 2 - (def.x + def.w / 2)}px`,
                  '--dy': `${downDef.y + downDef.h / 2 - (def.y + def.h / 2)}px`,
                  animation: 'pf-down-card 1.1s ease-in forwards',
                } as CSSProperties
              }
            >
              {downFx.card.image_url ? (
                <img src={downFx.card.image_url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', borderRadius: 10, background: '#26324f' }} />
              )}
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 58, fontWeight: 900, color: '#fff', letterSpacing: 2, textShadow: '0 0 12px #ef4444, 0 3px 6px rgba(0,0,0,0.9)', animation: 'pf-down-text 1s ease-out forwards' }}>DOWN</div>
          </div>
        )}
        {/* デッキにドラッグしているあいだ：上半分＝デッキトップ、下半分＝デッキの一番下（相手側は、盤面ごと回転しているので、画面の上下に合わせる） */}
        {isDeck &&
          over &&
          (['top', 'bottom'] as const).map((pos) => {
            const active = p.overPos === pos
            const atLocalTop = (pos === 'top') === (side === 'me')
            return (
              <div
                key={pos}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  [atLocalTop ? 'top' : 'bottom']: 0,
                  height: '50%',
                  zIndex: 30,
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  borderRadius: 10,
                  border: active ? '4px solid var(--hud-cyan)' : '3px dashed rgba(76,224,230,0.55)',
                  background: active ? 'rgba(76,224,230,0.5)' : 'rgba(6,18,23,0.55)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textShadow: '0 1px 4px rgba(0,0,0,0.95)',
                }}
              >
                {pos === 'top' ? 'デッキトップ' : '一番下'}
              </div>
            )
          })}
        {def.kind === 'life' && cards.length > 0 && <Badge n={cards.length} />}
      </div>
      {def.labelBelow && (
        // 名前は、カードの上に、小さく出す（相手側は、盤面ごと反対向きになる）
        <span style={{ position: 'absolute', left: def.x, top: def.y - 32, width: def.w, textAlign: 'center', fontWeight: 800, fontSize: 26, lineHeight: 1.1, color: def.color, textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none' }}>
          {def.key === 'collab' ? 'Collabo' : def.key === 'center' ? 'Center' : 'Oshi'}
        </span>
      )}
      {/* 推しホロメンの固有スキル：「推し」の文字があった場所に、カードの登録内容どおりに出す。クリックで灰色（使用済み）になり、もう一度クリックで元に戻る */}
      {showSkills && (
        <div style={{ position: 'absolute', left: def.x, top: def.y + def.h + 6, width: def.w, display: 'flex', flexDirection: 'row', gap: 8, zIndex: 15 }}>
          {oshiSkills.map((sk) => {
            const used = p.skillUsed[`${side}:${sk.which}`] === true
            const sp = sk.which === 'sp'
            // 必要なホロパワーが、足りないとき：使えない（使用済みでないとき）
            const cost = skillCost(sk.powerCost)
            const lacking = !used && cost > p.state[zoneId(side, 'power')].length
            const tag = sp ? 'SP' : '推し'
            return (
              <button
                key={sk.which}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  p.onToggleSkill(side, sk.which)
                }}
                title={`${sp ? 'SP推しスキル（ゲーム中1回）' : '推しスキル（ターン1回）'}：${sk.title}${sk.powerCost ? `（ホロパワー -${sk.powerCost}）` : ''}\nクリックで「${used ? '未使用' : '使用済み'}」に切り替え`}
                aria-pressed={used}
                aria-disabled={lacking}
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  height: 52,
                  borderRadius: 26,
                  boxSizing: 'border-box',
                  border: `3px solid ${used ? '#6b7280' : lacking ? '#7f1d1d' : '#ffffff'}`,
                  background: used ? '#4b5563' : lacking ? 'repeating-linear-gradient(135deg, #1f2937 0 10px, #111827 10px 20px)' : sp ? 'linear-gradient(180deg, #ffe08a, #f59e0b)' : 'linear-gradient(180deg, #8ff3fa, #14b8c4)',
                  color: used ? '#d1d5db' : lacking ? '#fca5a5' : sp ? '#4a2c00' : '#032a30',
                  filter: used ? 'grayscale(1)' : 'none',
                  opacity: used ? 0.85 : lacking ? 0.7 : 1,
                  boxShadow: used || lacking ? 'none' : '0 3px 8px rgba(0,0,0,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  justifyContent: 'center',
                  padding: '0 6px',
                  fontWeight: 800,
                  fontSize: 22,
                  cursor: lacking ? 'not-allowed' : 'pointer',
                  pointerEvents: p.moveMode ? 'none' : 'auto',
                  WebkitTouchCallout: 'none',
                }}
              >
                <span style={{ flex: '0 0 auto', padding: '0 8px', borderRadius: 999, background: 'rgba(0,0,0,0.28)', color: '#fff', fontSize: 18, lineHeight: 1.5 }}>{tag}</span>
                <span style={{ flex: '0 0 auto', textDecoration: used ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>{used ? '使用済' : sk.powerCost ? `-${sk.powerCost}` : ''}</span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// ---- 片側（自分／相手）の盤面。相手側は、180度回転して上側に置く ----
function Half({ side, p, style }: { side: Side; p: BoardProps; style: CSSProperties }) {
  const backs = ZONES.filter((z) => z.key.startsWith('back'))
  const bx = Math.min(...backs.map((z) => z.x))
  const bw = Math.max(...backs.map((z) => z.x + z.w)) - bx
  const by = backs[0]!.y + backs[0]!.h + 12
  const row = handRowLayout(p.state[zoneId(side, 'handHolder')].length)
  const active = p.turn.active === side
  const handDef = ZONE_BY_KEY.get('hand')!
  const handCount = p.state[zoneId(side, 'hand')].length
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        width: HALF_W,
        height: HALF_H,
        ...style,
      }}
    >
      {/* 盤面の背景：ターンを進めている側は紺色、そうでない側は灰色。Center・Collabo などの名前の上まで広げる */}
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: -FIELD_EXT, width: HALF_W, height: HALF_H + FIELD_EXT, borderRadius: 24, background: active ? 'rgba(30,58,138,0.34)' : 'rgba(107,114,128,0.24)', transition: 'background 0.3s ease', pointerEvents: 'none' }} />
      {/* ターンを進めている側の盤面は、上下左右の4辺に、光るバーを出す。カードなどの中身より下（背景の上）に置く（動かさない。常時アニメーションは、発熱・電池消費の原因になるため）。枠は、Center・Collabo などの名前の上まで広げる */}
      {active && (
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: -FIELD_EXT, width: HALF_W, height: HALF_H + FIELD_EXT, zIndex: 0, pointerEvents: 'none' }}>
          <div style={{ ...TURN_BAR_H, left: TURN_BAR_INSET, right: TURN_BAR_INSET, top: TURN_BAR_EDGE, height: TURN_BAR_THICK }} />
          <div style={{ ...TURN_BAR_H, left: TURN_BAR_INSET, right: TURN_BAR_INSET, bottom: TURN_BAR_EDGE, height: TURN_BAR_THICK }} />
          <div style={{ ...TURN_BAR_V, top: TURN_BAR_INSET, bottom: TURN_BAR_INSET, left: TURN_BAR_EDGE, width: TURN_BAR_THICK }} />
          <div style={{ ...TURN_BAR_V, top: TURN_BAR_INSET, bottom: TURN_BAR_INSET, right: TURN_BAR_EDGE, width: TURN_BAR_THICK }} />
        </div>
      )}
      {ZONES.filter((z) => z.key !== 'log').map((def) => {
        // 手札とホルダーの幅は、ホルダーのカードの枚数に応じて変える
        const d = def.key === 'hand' ? { ...def, x: row.hand.x, w: row.hand.w } : def.key === 'handHolder' ? { ...def, x: row.holder.x, w: row.holder.w } : def
        return <ZoneView key={def.key} def={d} side={side} p={p} />
      })}
      {/* 手札の左：全て戻す・並び替えのボタン（対戦中、相手の側には出さない） */}
      {p.concealSide !== side && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: HAND_BTN_X, top: handDef.y, width: HAND_BTN_W, height: handDef.h, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 15 }}>
          <HandActionButton label="全て戻す" title="手札のカードを、全てデッキに戻します（シャッフルはしません）" disabled={handCount === 0} onClick={() => p.onHandReturnAll(side)} />
          <HandActionButton label="並び替え" title="手札を、ホロメン（2nd→1st→Debut）→サポート→その他の順に並べ替えます" disabled={handCount < 2} onClick={() => p.onHandSort(side)} />
        </div>
      )}
      {/* バックステージの範囲を示す印 */}
      <div style={{ position: 'absolute', left: bx, top: by, width: bw, height: 14, borderLeft: '3px solid #8fa3ad', borderRight: '3px solid #8fa3ad', borderBottom: '3px solid #8fa3ad', pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', left: bx, top: by + 18, width: bw, textAlign: 'center', fontSize: 30, color: '#8fa3ad', pointerEvents: 'none' }}>バックステージ</span>
    </div>
  )
}

// 手札の左のボタン（手札の枠の左の、空いている場所に置く）
const HAND_BTN_X = 14
const HAND_BTN_W = 82
function HandActionButton({ label, title, disabled, onClick }: { label: string; title: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        borderRadius: 14,
        border: '3px solid rgba(255,255,255,0.55)',
        background: 'rgba(6,18,23,0.88)',
        color: '#fff',
        fontWeight: 800,
        fontSize: 24,
        lineHeight: 1.2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      {label}
    </button>
  )
}

// プレイマット全体。表示する幅（と、指定があれば高さ）に合わせて、縮小して収める
// SUPPORT（旧ログ）：そのターンに使ったカードの置き場。2人でひとつの枠。
// 自分が置いたカードは、自分に向けて（右から）、相手が置いたカードは、相手に向けて（反対向きで、左から）並べる。
// 置く人は、カードの持ち主（動かしたカードが、どちらの側のものか）で決まる
function LogFrame({ p }: { p: BoardProps }) {
  const id = zoneId('me', 'log') // 枠全体のドロップ先（持ち主の側のログへ、振り分ける）
  const allowed = dropAllowed(p.drag, id, p.state)
  const over = allowed && p.overZone === id
  const mine = p.state[zoneId('me', 'log')]
  const theirs = p.state[zoneId('opp', 'log')]
  // 置いた順に、左から右へ並べる（相手のカードは、反対向き）
  const items = [...mine.map((pc) => ({ pc, owner: 'me' as const })), ...theirs.map((pc) => ({ pc, owner: 'opp' as const }))].sort((a, b) => (a.pc.logSeq ?? 0) - (b.pc.logSeq ?? 0))
  const ch = LOG_FRAME_H - 20
  const cw = Math.round((ch * 63) / 88)
  const step = items.length > 1 ? Math.min(cw + 10, (LOG_W - 30 - cw) / (items.length - 1)) : 0
  return (
    <div
      data-pf-zone={id}
      onDragOver={(e) => {
        if (!allowed) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (p.overZone !== id) p.onDragOverZone(id)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) p.onDragOverZone(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (allowed) p.onDropZone(id)
      }}
      onClick={(e) => {
        e.stopPropagation()
        p.onSelect(null)
      }}
      style={{
        position: 'absolute',
        left: LOG_X,
        top: HALF_H + LOG_LABEL_H + LOG_PAD,
        width: LOG_W,
        height: LOG_FRAME_H,
        boxSizing: 'border-box',
        border: `3px solid ${over ? 'var(--hud-cyan, #4ce0e6)' : '#4a86a3'}`,
        borderRadius: 14,
        background: over ? 'rgba(76,224,230,0.22)' : 'rgba(125,211,252,0.07)',
        zIndex: 6,
      }}
    >
      <span style={{ position: 'absolute', left: 0, right: 0, top: mine.length + theirs.length ? 4 : '50%', transform: mine.length + theirs.length ? undefined : 'translateY(-50%)', textAlign: 'center', fontWeight: 800, letterSpacing: '0.3em', fontSize: mine.length + theirs.length ? 20 : 54, color: 'rgba(159,227,238,0.45)', pointerEvents: 'none' }}>SUPPORT</span>
      {items.map(({ pc, owner }, i) => (
        <div key={pc.uid} style={{ position: 'absolute', left: 12 + i * step, top: 7, zIndex: i, transform: owner === 'opp' ? 'rotate(180deg)' : undefined }}>
          <CardView backKey="log" pc={pc} w={cw} h={ch} selected={p.selectedUid === pc.uid} draggable fit={{ w: cw, h: ch }} p={p} />
        </div>
      ))}
    </div>
  )
}

// ターン表示：先攻・後攻、ターン数、いまのステップ、ステップを進めるボタン。ログの枠の両側（自分は右、相手は左で、反対向き）。幅は、ライフの枠と同じ
// ボタンは、ステップに合わせて変わる：メインステップ → 「メインステップ終了」／パフォーマンスステップ → 「パフォーマンスステップ終了」（押すと、ターンチェンジ）。
// ドロー・エールのステップは、画面の案内に沿って進める（ボタンは、押せない）
function TurnPanel({ side, p }: { side: Side; p: BoardProps }) {
  const active = p.turn.active === side
  const turnNo = side === 'me' ? p.turn.me : p.turn.opp
  const isFirst = p.turn.first === side
  const locked = p.concealSide === side // 対戦中、相手の側のボタンは、押せない（相手が、自分の画面で押す）
  const phase = p.turn.phase
  const canPress = active && !locked && (phase === 'main' || phase === 'performance')
  const lines: [string, string] = !active ? ['待機中', ''] : phase === 'draw' ? ['ドロー', 'ステップ中'] : phase === 'yell' ? ['エール', 'ステップ中'] : phase === 'main' ? ['メインステップ', '終了'] : ['パフォーマンス', 'ステップ終了']
  const title = locked ? '相手のボタンは、押せません（相手が、自分の画面で押します）' : !active ? '相手のターンです' : phase === 'draw' ? 'ドローステップ：デッキをクリックして、1枚引きます' : phase === 'yell' ? 'エールステップ：エールをつけるホロメンを選びます' : phase === 'main' ? 'メインステップを終えて、パフォーマンスステップに進みます' : 'パフォーマンスステップを終えて、ターンチェンジします（SUPPORT のカードをアーカイブへ送り、相手のターン数を+1して、相手のステージの警告マークを消します）'
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: side === 'me' ? HALF_W - SIDE_PANEL_X - SIDE_PANEL_W : SIDE_PANEL_X,
        top: HALF_H + LOG_LABEL_H + LOG_PAD,
        width: SIDE_PANEL_W,
        height: LOG_FRAME_H,
        transform: side === 'opp' ? 'rotate(180deg)' : undefined,
        boxSizing: 'border-box',
        border: `3px solid ${active ? 'var(--hud-cyan, #4ce0e6)' : '#6b7280'}`,
        borderRadius: 14,
        background: 'rgba(6,18,23,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px 8px',
        color: '#fff',
        zIndex: 8,
      }}
    >
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <button type="button" onClick={() => p.onToggleFirst()} title="クリックで、先攻・後攻を入れ替える（先攻が1ターン目、後攻が0ターン目になります）" style={{ background: 'transparent', border: 'none', color: isFirst ? '#ffd76a' : '#9fc3ca', fontWeight: 800, fontSize: 28, lineHeight: 1, cursor: 'pointer', padding: 0 }}>
          {isFirst ? '先攻' : '後攻'}
        </button>
        {active && <span style={{ fontWeight: 800, fontSize: 16, color: '#4ce0e6', whiteSpace: 'nowrap' }}>{PHASE_LABEL[phase]}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, lineHeight: 1 }}>
        <span style={{ fontWeight: 800, fontSize: 44 }}>{turnNo}</span>
        <span style={{ fontSize: 18, color: '#9fc3ca' }}>ターン目</span>
      </div>
      <button
        type="button"
        disabled={!canPress}
        onClick={() => p.onTurnChange(side)}
        title={title}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          width: '100%',
          height: 96,
          flex: '0 0 auto',
          borderRadius: 22,
          border: `4px solid ${canPress ? '#4ce0e6' : '#6b7280'}`,
          background: canPress ? 'radial-gradient(circle at 35% 30%, rgba(76,224,230,0.55), rgba(76,224,230,0.16))' : 'rgba(255,255,255,0.07)',
          color: canPress ? '#d9fdff' : '#cbd5e1',
          fontWeight: 800,
          fontSize: lines[0].length > 6 ? 21 : 24,
          lineHeight: 1.1,
          cursor: canPress ? 'pointer' : 'not-allowed',
          opacity: canPress ? 1 : 0.5,
          padding: 0,
          boxShadow: canPress ? '0 0 16px rgba(76,224,230,0.45)' : undefined,
        }}
      >
        <span>{lines[0]}</span>
        {lines[1] && <span>{lines[1]}</span>}
      </button>
    </div>
  )
}

function PlayfieldBoardImpl(props: BoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(900)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWrapW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const byWidth = wrapW / HALF_W
  const byHeight = props.maxHeight ? props.maxHeight / MAT_H : Number.POSITIVE_INFINITY
  const scale = Math.max(0.15, Math.min(byWidth, byHeight))

  return (
    <div ref={wrapRef} style={{ width: '100%', touchAction: 'manipulation' }} onClick={() => props.onSelect(null)}>
      <style>{FX_CSS}</style>
      <div style={{ position: 'relative', width: HALF_W * scale, height: MAT_H * scale, margin: '0 auto' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: HALF_W, height: MAT_H, transform: `scale(${scale})`, transformOrigin: '0 0', background: 'rgba(6,18,23,0.55)', borderRadius: 24 }}>
          <Half side="opp" p={props} style={{ top: 0, transform: 'rotate(180deg)' }} />
          <div style={{ position: 'absolute', left: 40, right: 40, top: HALF_H + HALF_GAP / 2, borderTop: '4px dotted #5a727b' }} />
          <Half side="me" p={props} style={{ top: HALF_H + HALF_GAP }} />
          <TurnPanel side="opp" p={props} />
          <TurnPanel side="me" p={props} />
          <LogFrame p={props} />
        </div>
      </div>
    </div>
  )
}

// 盤面に関係するデータが変わったときだけ、描き直す（メッセージ・検索・プレビューなど、盤面と関係ない変更では、描き直さない）。
// コールバック（on〜）は、比べない。呼ぶ側（PlayfieldPanel）が、常に最新の処理を呼ぶ、変わらない関数を渡す
const BOARD_DATA_KEYS = ['state', 'selectedUid', 'drag', 'overZone', 'overPos', 'hpOf', 'touchMode', 'moveMode', 'maxHeight', 'fx', 'oshiSkills', 'skillUsed', 'turn', 'concealSide', 'pick'] as const satisfies readonly (keyof BoardProps)[]
const sameBoardData = (a: BoardProps, b: BoardProps): boolean => BOARD_DATA_KEYS.every((k) => a[k] === b[k])
export const PlayfieldBoard = memo(PlayfieldBoardImpl, sameBoardData)