// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSetsAdmin, setLabel } from '../hooks/useSetsAdmin'
import { loadCardPackInfo, PACK_TYPES, type CardPackInfo, type PackType } from '../utils/packFamilies'
import { layoutPackGraph, CARD_R, HUB_R } from '../utils/packGraphLayout'
import type { DeckEntry } from '../utils/deckImage'
import type { DeckRecipeX } from '../hooks/useDeckCases'

// パック収録図（ネットワーク図）：デッキのカードが、どのパックに収録されているかを、線でつないで見せる。
//   ・パックごとに、丸いグループを作り、中心に、パックの名札（写真・コード・パック名）、その周りに、デッキのカードを並べる
//   ・カードは、仲間（元カード・再録・パラレル）の中に「新規」があれば、その新規のパックのグループに入る（新規を優先）
//   ・すべてのパックのグループを、1つの大きな円の円周に、並べる。パックの種類（ブースター・スタートデッキなど）ごとに、続けて並べ、
//     種類ごとの範囲を、円周の内側の色つきの弧と、外側の名前で示す（種類の中は、発売順）
//   ・線の色：新規＝赤、再録＝青、パラレル＝黄。カードから、そのカードが収録されているパックの名札へ、線を引く
//   ・パックにカーソルを乗せる（スマホは、タップ）と、そのパックが拡大し（名札は約2.5倍）、そのパックに収録されている（関係する）カードのアイコンが2倍になり、グループのカードが、周りに大きく広がって、
//     新規の線が、長く伸びる。大きな円からはみ出す場合は、はみ出さない位置まで、中心へ寄る。そのパックで再録のカードは、縁が青になる
//   ・カード・パックを、クリック（タップ）すると、そのカード・パックに関係する線だけを、強調する

export const PACK_LINK_COLOR: Record<PackType, string> = { 新規: '#ff4d4d', 再録: '#4da3ff', パラレル: '#ffd23f' }

const EXPAND_GAIN = 1.2 // 拡大したときの、カードの位置（名札からの距離）の伸び（1 + 1.2 ＝ 2.2倍）
const HUB_ZOOM = 1.5 // 拡大したときの、名札の大きさの伸び（1 + 1.5 ＝ 2.5倍）
const CARD_ZOOM = 1.0 // 拡大したときの、カードのアイコンの大きさの伸び（1 + 1.0 ＝ 2倍）
const TYPE_COLORS = ['#4ce0e6', '#c58bff', '#ffb454', '#7bdc8a', '#ff8fb0', '#9fb4ff'] // パックの種類ごとの色（弧・グループの円の縁）
const EXPAND_MS = 260
const HOVER_LEAVE_MS = 180 // カーソルが外れてから、閉じるまでの、猶予（名札からカードへ、移る間に、閉じないように）

type Active = { kind: 'card'; id: number } | { kind: 'pack'; code: string } | null

// カードの中心 → パックの名札の中心、の線（端は、カード・名札の縁）。bend が0以外のときは、曲げて、重ならないようにする
function linkPath(x1: number, y1: number, x2: number, y2: number, bend: number, r1: number, r2: number): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const sx = x1 + ux * r1
  const sy = y1 + uy * r1
  const ex = x2 - ux * r2
  const ey = y2 - uy * r2
  if (!bend) return `M${sx.toFixed(1)},${sy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`
  const mx = (sx + ex) / 2 - uy * bend * 2
  const my = (sy + ey) / 2 + ux * bend * 2
  return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`
}

const typeOrder = (t: PackType | null) => (t ? PACK_TYPES.indexOf(t) : 9)

const sameActive = (a: Active, b: NonNullable<Active>): boolean => !!a && a.kind === b.kind && (a.kind === 'card' ? a.id === (b as { id: number }).id : a.code === (b as { code: string }).code)

// 図の表示部分（データは、親から受け取る）
export function PackGraphView({ infos, counts, packLabel, packRank, packType, packImage }: { infos: CardPackInfo[]; counts: Map<number, number>; packLabel: (code: string) => string; packRank: (code: string) => number; packType: (code: string) => string; packImage: (code: string) => string | null }) {
  const [hover, setHover] = useState<Active>(null)
  const [selected, setSelected] = useState<Active>(null)
  const active = hover ?? selected

  // ---- 拡大の動き ----
  const [focusCode, setFocusCode] = useState<string | null>(null) // 拡大している（拡大が終わるまでの間も含む）パック
  const [expand, setExpand] = useState(0) // 0（ふつう）〜1（拡大）
  const anim = useRef<{ cur: number; raf: number; code: string | null }>({ cur: 0, raf: 0, code: null })
  const hoverTimer = useRef<number | undefined>(undefined)

  const homeOf = useMemo(() => new Map(infos.map((i) => [i.card.id, i.homePack])), [infos])
  const hoveredCardHome = hover?.kind === 'card' ? homeOf.get(hover.id) : undefined
  // 拡大するパック：カーソルのあるパック → （拡大中のパックのカードに触れている間は、そのまま）→ タップして選んだパック
  const wantedFocus: string | null = hover?.kind === 'pack' ? hover.code : hoveredCardHome && hoveredCardHome === focusCode ? hoveredCardHome : selected?.kind === 'pack' ? selected.code : null

  useEffect(() => {
    const a = anim.current
    cancelAnimationFrame(a.raf)
    let from = a.cur
    let to = 0
    if (wantedFocus) {
      if (wantedFocus !== a.code) {
        from = 0
        a.code = wantedFocus
        setFocusCode(wantedFocus)
      }
      to = 1
    }
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      a.cur = to
      setExpand(to)
      if (!wantedFocus) {
        a.code = null
        setFocusCode(null)
      }
      return
    }
    let start: number | null = null // 最初の描画の時刻を、開始とする（時計の取り方の違いで、ずれないように）
    const tick = (now: number) => {
      if (start === null) start = now
      const t = Math.min(1, Math.max(0, (now - start) / EXPAND_MS))
      a.cur = from + (to - from) * (1 - Math.pow(1 - t, 3))
      setExpand(a.cur)
      if (t < 1) a.raf = requestAnimationFrame(tick)
      else if (to === 0) {
        a.code = null
        setFocusCode(null)
      }
    }
    a.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(a.raf)
  }, [wantedFocus])

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])
  const enter = (a: NonNullable<Active>) => {
    window.clearTimeout(hoverTimer.current)
    setHover(a)
  }
  const leave = () => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHover(null), HOVER_LEAVE_MS)
  }
  const toggle = (a: NonNullable<Active>) => setSelected((cur) => (sameActive(cur, a) ? null : a))

  // ---- 配置：すべてのパックを、1つの円周に。パックの種類ごとに続けて（種類の順 → 発売順）並べる ----
  const { layout, groupMap, cardPos, typeSpans } = useMemo(() => {
    const packCodes = new Set<string>()
    infos.forEach((i) => {
      packCodes.add(i.homePack)
      i.memberships.forEach((m) => packCodes.add(m.packCode))
    })
    const byType = new Map<string, string[]>()
    Array.from(packCodes).forEach((code) => byType.set(packType(code), [...(byType.get(packType(code)) ?? []), code]))
    const types = Array.from(byType.entries())
      .map(([typeName, codes]) => {
        const sorted = codes.sort((a, b) => packRank(a) - packRank(b) || a.localeCompare(b))
        return { typeName, rank: packRank(sorted[0] ?? ''), codes: sorted }
      })
      .sort((a, b) => a.rank - b.rank || a.typeName.localeCompare(b.typeName))
    const ordered = types.flatMap((t) => t.codes.map((code) => ({ code, typeName: t.typeName })))
    const l = layoutPackGraph(
      ordered.map(({ code }) => ({
        packCode: code,
        items: infos.filter((i) => i.homePack === code).sort((a, b) => typeOrder(a.ownType) - typeOrder(b.ownType) || a.card.slot - b.card.slot || a.card.id - b.card.id),
      })),
    )
    const gMap = new Map(l.groups.map((g) => [g.packCode, g]))
    const posMap = new Map<number, { x: number; y: number; cx: number; cy: number; pack: string }>()
    l.groups.forEach((g) => g.items.forEach((it) => posMap.set(it.item.card.id, { x: it.x, y: it.y, cx: g.cx, cy: g.cy, pack: g.packCode })))

    // 種類ごとの範囲（円周上の、角度）。種類が2つ以上のときだけ、弧と名前を出す
    const spans: { typeName: string; color: string; a0: number; a1: number; mid: number }[] = []
    if (types.length >= 2 && l.groups.length >= 2) {
      let prev = -Infinity
      const angles = l.groups.map((g) => {
        let ang = Math.atan2(g.cy, g.cx)
        while (ang < prev) ang += 2 * Math.PI // 円周を、時計回りに、たどる（角度が、増え続けるようにそろえる）
        prev = ang
        return { ang, half: Math.asin(Math.min(0.99, g.r / (Math.hypot(g.cx, g.cy) || 1))) }
      })
      let index = 0
      types.forEach((t, ti) => {
        const first = angles[index]
        const last = angles[index + t.codes.length - 1]
        index += t.codes.length
        if (!first || !last) return
        const a0 = first.ang - first.half
        const a1 = last.ang + last.half
        spans.push({ typeName: t.typeName, color: TYPE_COLORS[ti % TYPE_COLORS.length] ?? '#4ce0e6', a0, a1, mid: (a0 + a1) / 2 })
      })
    }
    return { layout: l, groupMap: gMap, cardPos: posMap, typeSpans: spans }
  }, [infos, packRank, packType])

  // 拡大中のパックの倍率
  const spread = (code: string) => (code === focusCode ? 1 + EXPAND_GAIN * expand : 1)
  const hubScale = (code: string) => (code === focusCode ? 1 + HUB_ZOOM * expand : 1)
  // 拡大中のパックに収録されている（関係する）カードは、どのグループにいても、アイコンが大きくなる
  const isRelated = (info: CardPackInfo) => !!focusCode && info.memberships.some((m) => m.packCode === focusCode)
  const cardScale = (info: CardPackInfo) => (isRelated(info) ? 1 + CARD_ZOOM * expand : 1)
  // グループの、今の中心の位置：拡大中は、大きくなった円が、いちばん大きな円からはみ出さないように、中心へ寄る
  const groupCenter = (code: string) => {
    const g = groupMap.get(code)
    if (!g) return { x: 0, y: 0 }
    if (code !== focusCode) return { x: g.cx, y: g.cy }
    const dist = Math.hypot(g.cx, g.cy)
    const limit = Math.max(0, layout.outerR - 8 - g.r * spread(code))
    const k = dist > limit && dist > 0 ? limit / dist : 1
    return { x: g.cx * k, y: g.cy * k }
  }
  const nowPos = (id: number) => {
    const p = cardPos.get(id)
    if (!p) return null
    const f = spread(p.pack)
    const c = groupCenter(p.pack)
    return { x: c.x + (p.x - p.cx) * f, y: c.y + (p.y - p.cy) * f, pack: p.pack }
  }

  // 線：カードごとに、収録されているパック（区分ごと）へ。同じカード→同じパックに、複数の線があるときは、曲げて、ずらす
  const links = infos.flatMap((info) => {
    const from = nowPos(info.card.id)
    if (!from) return []
    const byPack = new Map<string, PackType[]>()
    info.memberships.forEach((m) => byPack.set(m.packCode, [...(byPack.get(m.packCode) ?? []), m.type]))
    const out: { key: string; cardId: number; pack: string; type: PackType; d: string }[] = []
    byPack.forEach((types, pack) => {
      if (!groupMap.has(pack)) return
      const to = groupCenter(pack)
      types.forEach((type, i) => out.push({ key: `${info.card.id}|${pack}|${type}`, cardId: info.card.id, pack, type, d: linkPath(from.x, from.y, to.x, to.y, (i - (types.length - 1) / 2) * 12, CARD_R * cardScale(info), HUB_R * hubScale(pack)) }))
    })
    return out
  })

  const packsOf = (info: CardPackInfo) => new Set(info.memberships.map((m) => m.packCode))
  const activeInfo = active?.kind === 'card' ? infos.find((i) => i.card.id === active.id) : undefined
  const linkOpacity = (l: { cardId: number; pack: string }) => {
    if (!active) return 0.75
    if (active.kind === 'card') return l.cardId === active.id ? 1 : 0.06
    return l.pack === active.code ? 1 : 0.06
  }
  const cardOpacity = (info: CardPackInfo) => {
    if (!active) return 1
    if (active.kind === 'card') return info.card.id === active.id ? 1 : 0.35
    return packsOf(info).has(active.code) ? 1 : 0.25
  }
  const hubOpacity = (code: string) => {
    if (!active) return 1
    if (active.kind === 'pack') return active.code === code ? 1 : 0.5
    return activeInfo && packsOf(activeInfo).has(code) ? 1 : 0.45
  }

  // カードの縁の色：ふだんは、デッキに入っているカードの区分の色。拡大しているパックで「再録」のカードは、青にする（外れると、元に戻る）
  const ringColor = (info: CardPackInfo) => (wantedFocus && info.memberships.some((m) => m.packCode === wantedFocus && m.type === '再録') ? PACK_LINK_COLOR['再録'] : info.ownType ? PACK_LINK_COLOR[info.ownType] : '#9aa5a8')

  // 表示範囲：いちばん大きな円と、種類の名前（円の外側）が、入る大きさ
  const R = layout.outerR
  const typeLabels = typeSpans.map((t) => {
    const lx = (R + 10) * Math.cos(t.mid)
    const ly = (R + 10) * Math.sin(t.mid)
    const anchor: 'start' | 'end' | 'middle' = Math.cos(t.mid) > 0.3 ? 'start' : Math.cos(t.mid) < -0.3 ? 'end' : 'middle'
    const w = t.typeName.length * 11 + 6
    const x0 = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2
    return { ...t, lx, ly: ly + (Math.sin(t.mid) > 0.3 ? 8 : Math.sin(t.mid) < -0.3 ? -8 : 0), anchor, x0, x1: x0 + w }
  })
  const minX = Math.min(-R, ...typeLabels.map((t) => t.x0)) - 6
  const maxX = Math.max(R, ...typeLabels.map((t) => t.x1)) + 6
  const minY = Math.min(-R, ...typeLabels.map((t) => t.ly - 10)) - 6
  const maxY = Math.max(R, ...typeLabels.map((t) => t.ly + 10)) + 6
  const allGroups = layout.groups
  const packCountLine = (code: string) => {
    const per: Record<PackType, number> = { 新規: 0, 再録: 0, パラレル: 0 }
    infos.forEach((i) => i.memberships.filter((m) => m.packCode === code).forEach((m) => (per[m.type] += 1)))
    return per
  }
  const thumb = (code: string, w: number, h: number) => {
    const url = packImage(code)
    return url ? <img src={url} alt="" loading="lazy" className="shrink-0 rounded-sm object-cover" style={{ width: w, height: h }} /> : null
  }

  // 名札・カードの描き方（重なる順番は、下の「描く順番」を参照）
  const renderHub = (g: (typeof allGroups)[number]) => {
    const label = packLabel(g.packCode)
    const img = packImage(g.packCode)
    const hs = hubScale(g.packCode)
    const hubClip = `pg-hub-${allGroups.indexOf(g)}-${g.packCode.replace(/[^0-9A-Za-z_-]/g, '_')}`
    const isFocus = g.packCode === focusCode
    return (
      <g
        key={`hub-${g.packCode}`}
        transform={`translate(${groupCenter(g.packCode).x} ${groupCenter(g.packCode).y}) scale(${hs})`}
        opacity={hubOpacity(g.packCode)}
        tabIndex={0}
        role="button"
        aria-label={`パック ${label}`}
        style={{ cursor: 'pointer', outline: 'none' }}
        onMouseEnter={() => enter({ kind: 'pack', code: g.packCode })}
        onMouseLeave={leave}
        onFocus={() => enter({ kind: 'pack', code: g.packCode })}
        onBlur={leave}
        onClick={(e) => {
          e.stopPropagation()
          toggle({ kind: 'pack', code: g.packCode })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle({ kind: 'pack', code: g.packCode })
          }
        }}
      >
        <title>{`${label}（${g.packCode}／${packType(g.packCode)}）`}</title>
        <clipPath id={hubClip}>
          <circle r={HUB_R - 1} />
        </clipPath>
        <circle r={HUB_R} fill="#0b1e26" stroke="#4ce0e6" strokeWidth={(active?.kind === 'pack' && active.code === g.packCode ? 2.5 : 1.5) / hs} />
        {img && (
          <>
            <image href={img} x={-HUB_R} y={-HUB_R} width={2 * HUB_R} height={2 * HUB_R} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${hubClip})`} />
            <rect x={-HUB_R} y={3} width={2 * HUB_R} height={HUB_R} fill="rgba(4, 18, 24, 0.8)" clipPath={`url(#${hubClip})`} />
          </>
        )}
        <text textAnchor="middle" y={img ? 13 : -2} fontSize={g.packCode.length > 6 ? 8 : 10} fontWeight={700} fill="#ffffff" style={{ fontFamily: 'ui-monospace, monospace' }}>
          {g.packCode}
        </text>
        <text textAnchor="middle" y={img ? 23 : 9} fontSize={6.5} fill="#cfe6ea">
          {label.length > 8 ? `${label.slice(0, 7)}…` : label}
        </text>
        {/* 拡大したときは、パック名の全体を、名札の下に出す */}
        {isFocus && expand > 0.5 && (
          <text textAnchor="middle" y={HUB_R + 10} fontSize={8} fontWeight={700} fill="#ffffff" stroke="#071820" strokeWidth={3} paintOrder="stroke" opacity={Math.min(1, (expand - 0.5) * 2)}>
            {label}
          </text>
        )}
      </g>
    )
  }
  const renderCard = (info: CardPackInfo) => {
    const p = nowPos(info.card.id)
    if (!p) return null
    const count = counts.get(info.card.id) ?? 1
    const ring = ringColor(info)
    const clipId = `pg-clip-${info.card.id}`
    const isActive = active?.kind === 'card' && active.id === info.card.id
    const cs = cardScale(info)
    return (
      <g
        key={info.card.id}
        transform={`translate(${p.x} ${p.y}) scale(${cs})`}
        opacity={cardOpacity(info)}
        tabIndex={0}
        role="button"
        aria-label={`${info.card.card_name}（${info.ownType ?? ''}）`}
        style={{ cursor: 'pointer', outline: 'none' }}
        onMouseEnter={() => enter({ kind: 'card', id: info.card.id })}
        onMouseLeave={leave}
        onFocus={() => enter({ kind: 'card', id: info.card.id })}
        onBlur={leave}
        onClick={(e) => {
          e.stopPropagation()
          toggle({ kind: 'card', id: info.card.id })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle({ kind: 'card', id: info.card.id })
          }
        }}
      >
        <title>{`${info.card.card_name}（${info.ownType ?? ''}・${info.card.set_code}）`}</title>
        <clipPath id={clipId}>
          <circle r={CARD_R - 1.5} />
        </clipPath>
        <circle r={CARD_R} fill="#26324f" stroke={ring} strokeWidth={isActive ? 4 : 2.5} style={{ transition: 'stroke 0.2s' }} />
        {info.card.image_url && <image href={info.card.image_url} x={-(CARD_R - 1.5)} y={-CARD_R - 2} width={2 * (CARD_R - 1.5)} height={(2 * (CARD_R - 1.5) * 88) / 63} preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clipId})`} />}
        {count > 1 && (
          <g transform={`translate(${CARD_R - 3} ${CARD_R - 3})`}>
            <circle r={7} fill="#0a0f1e" stroke="#ffffff" strokeWidth={0.8} />
            <text textAnchor="middle" y={2.6} fontSize={7.5} fontWeight={700} fill="#ffffff">
              {count}
            </text>
          </g>
        )}
      </g>
    )
  }
  const allInfos = layout.groups.flatMap((g) => g.items.map((it) => it.item))

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#d7eef2]">
        {PACK_TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-6" style={{ background: PACK_LINK_COLOR[t] }} />
            {t}
          </span>
        ))}
        <span className="text-[10px] text-[#9fc3ca]">（カードの縁の色＝デッキに入っているカードの区分。パックにカーソルを乗せる／タップすると、拡大し、そのパックで再録のカードの縁が、青になります）</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="mx-auto block w-full min-w-[420px] max-w-[760px]" role="img" aria-label="デッキのカードが収録されているパックの図" onClick={() => setSelected(null)}>
          {/* いちばん大きな円 */}
          <circle r={R - 1} fill="rgba(76, 224, 230, 0.03)" stroke="#2a4a52" strokeWidth={1} />

          {/* パックの種類ごとの範囲：円周の内側の弧と、外側の名前（種類が2つ以上のときだけ） */}
          {typeLabels.map((t) => {
            const ar = R - 7
            const large = t.a1 - t.a0 > Math.PI ? 1 : 0
            return (
              <g key={t.typeName} pointerEvents="none" data-role="type-arc">
                <path d={`M${(ar * Math.cos(t.a0)).toFixed(1)},${(ar * Math.sin(t.a0)).toFixed(1)} A${ar},${ar} 0 ${large} 1 ${(ar * Math.cos(t.a1)).toFixed(1)},${(ar * Math.sin(t.a1)).toFixed(1)}`} fill="none" stroke={t.color} strokeWidth={5} strokeLinecap="round" opacity={0.85} />
                <text x={t.lx} y={t.ly} textAnchor={t.anchor} dominantBaseline="middle" fontSize={11} fontWeight={700} fill={t.color}>
                  {t.typeName}
                </text>
              </g>
            )
          })}

          {/* パックごとのグループの円（拡大中は、広がる） */}
          {allGroups.map((g) => {
            const on = g.packCode === focusCode
            const c = groupCenter(g.packCode)
            const typeColor = typeSpans.find((t) => t.typeName === packType(g.packCode))?.color
            return <circle key={g.packCode} cx={c.x} cy={c.y} r={g.r * spread(g.packCode)} fill={on ? 'rgba(76, 224, 230, 0.1)' : 'rgba(76, 224, 230, 0.05)'} stroke={on ? '#4ce0e6' : (typeColor ?? '#2a4a52')} strokeOpacity={on ? 1 : typeColor ? 0.55 : 1} strokeWidth={on ? 1.6 : 1} />
          })}

          {/* 線（カードの下に描く） */}
          <g fill="none" strokeWidth={1.6} strokeLinecap="round" pointerEvents="none">
            {links.map((l) => (
              <path key={l.key} d={l.d} stroke={PACK_LINK_COLOR[l.type]} opacity={linkOpacity(l)} />
            ))}
          </g>

          {/* パックの名札・カード（拡大中のパックは、最後＝手前に描く） */}
          {/* 描く順番（下から）：①拡大していないパックの名札 → ②関係のないカード → ③拡大中のパックの名札 → ④関係するカード（どのグループにいても、いちばん手前） */}
          {allGroups.filter((g) => g.packCode !== focusCode).map(renderHub)}
          {allInfos.filter((i) => !isRelated(i)).map(renderCard)}
          {allGroups.filter((g) => g.packCode === focusCode).map(renderHub)}
          {allInfos.filter(isRelated).map(renderCard)}
        </svg>
      </div>

      {/* 選んだカード・パックの説明 */}
      <div className="mt-2 min-h-[3.5rem] rounded border border-[#2a4a52] bg-[#071820]/60 p-2 text-xs text-[#d7eef2]" aria-live="polite">
        {!active && <p className="text-[#9fc3ca]">カードやパックを、クリック（タップ）すると、そのカードが収録されているパックが、線で強調されます。</p>}
        {active?.kind === 'card' && activeInfo && (
          <>
            <p className="mb-1 font-bold text-white">
              {activeInfo.card.card_name}
              <span className="ml-2 font-normal text-[#9fc3ca]">
                デッキに {counts.get(activeInfo.card.id) ?? 1}枚 ／ 入っているのは {activeInfo.ownType ?? '不明'}（{activeInfo.card.set_code}）
              </span>
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {[...activeInfo.memberships]
                .sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || packRank(a.packCode) - packRank(b.packCode))
                .map((m) => (
                  <li key={`${m.packCode}|${m.type}`} className="flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-5" style={{ background: PACK_LINK_COLOR[m.type] }} />
                    {thumb(m.packCode, 18, 25)}
                    {m.type}：{packLabel(m.packCode)}
                    <span className="hud-mono text-[#9fc3ca]">{m.packCode}</span>
                  </li>
                ))}
            </ul>
          </>
        )}
        {active?.kind === 'pack' && (
          <div className="flex items-start gap-2">
            {thumb(active.code, 36, 50)}
            <p>
              <span className="font-bold text-white">{packLabel(active.code)}</span>
              <span className="hud-mono ml-1 text-[#9fc3ca]">
                {active.code}（{packType(active.code)}）
              </span>
              に収録されている、デッキのカード：
              {PACK_TYPES.map((t) => (
                <span key={t} className="ml-3 inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-4" style={{ background: PACK_LINK_COLOR[t] }} />
                  {t} {packCountLine(active.code)[t]}種類
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// データを取って、図を出す（エールを、図に含めるかを選べる。初めは、推しホロメンとメインデッキだけ）
export function DeckPackGraph({ recipe }: { recipe: DeckRecipeX }) {
  const { sets, loading: setsLoading } = useSetsAdmin()
  const [includeYells, setIncludeYells] = useState(false)
  const [infos, setInfos] = useState<CardPackInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const entries: DeckEntry[] = useMemo(() => {
    const list: DeckEntry[] = [...(recipe.oshi ? [{ card: recipe.oshi, count: 1 }] : []), ...recipe.main, ...(includeYells ? recipe.yells : [])]
    const merged = new Map<number, DeckEntry>()
    list.forEach((e) => merged.set(e.card.id, merged.has(e.card.id) ? { card: e.card, count: (merged.get(e.card.id)?.count ?? 0) + e.count } : e))
    return Array.from(merged.values())
  }, [recipe, includeYells])
  const counts = useMemo(() => new Map(entries.map((e) => [e.card.id, e.count])), [entries])

  // パックの順番：発売日の古い順（発売日が無いパックは、後ろ）→ パックのコード順
  const rankMap = useMemo(() => {
    const sorted = [...sets].sort((a, b) => (a.release_date ?? '9999-12-31').localeCompare(b.release_date ?? '9999-12-31') || a.set_code.localeCompare(b.set_code))
    return new Map(sorted.map((s, i) => [s.set_code, i]))
  }, [sets])
  const packRank = useMemo(() => (code: string) => rankMap.get(code) ?? 100000, [rankMap])
  const labelMap = useMemo(() => new Map(sets.map((s) => [s.set_code, setLabel(s)])), [sets])
  const packLabel = useMemo(() => (code: string) => labelMap.get(code) ?? code, [labelMap])
  const typeMap = useMemo(() => new Map(sets.map((s) => [s.set_code, (s.pack_type ?? '').trim() || 'その他'])), [sets])
  const packType = useMemo(() => (code: string) => typeMap.get(code) ?? 'その他', [typeMap])
  const imageMap = useMemo(() => new Map(sets.map((s) => [s.set_code, s.pack_image_url || null])), [sets])
  const packImage = useMemo(() => (code: string) => imageMap.get(code) ?? null, [imageMap])

  const idsKey = entries.map((e) => e.card.id).sort((a, b) => a - b).join(',')
  useEffect(() => {
    if (setsLoading) return
    let cancelled = false
    setLoading(true)
    setError('')
    loadCardPackInfo(
      entries.map((e) => e.card),
      packRank,
    )
      .then((r) => {
        if (!cancelled) setInfos(r)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // entries は、idsKey の変化で、取り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, setsLoading, packRank])

  return (
    <div>
      <label className="mb-2 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-[#d7eef2]">
        <input type="checkbox" checked={includeYells} onChange={(e) => setIncludeYells(e.target.checked)} />
        エールデッキも、図に含める
      </label>
      {entries.length === 0 && <p className="text-xs text-[#ffd76a]">カードが入っていません。「編集」から、カードを入れてください</p>}
      {entries.length > 0 && (loading || setsLoading) && <p className="text-xs text-[#9fc3ca]">収録パックを調べています...</p>}
      {error && <p className="text-xs text-[#ff8a8a]">収録パックを調べられませんでした：{error}</p>}
      {entries.length > 0 && !loading && !setsLoading && !error && <PackGraphView infos={infos} counts={counts} packLabel={packLabel} packRank={packRank} packType={packType} packImage={packImage} />}
    </div>
  )
}