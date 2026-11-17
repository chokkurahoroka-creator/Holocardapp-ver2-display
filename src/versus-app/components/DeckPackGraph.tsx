// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useMemo, useState } from 'react'
import { useSetsAdmin, setLabel } from '../hooks/useSetsAdmin'
import { loadCardPackInfo, PACK_TYPES, type CardPackInfo, type PackType } from '../utils/packFamilies'
import { layoutPackGraph, CARD_R, HUB_R } from '../utils/packGraphLayout'
import type { DeckEntry } from '../utils/deckImage'
import type { DeckRecipeX } from '../hooks/useDeckCases'

// パック収録図（ネットワーク図）：デッキのカードが、どのパックに収録されているかを、線でつないで見せる。
//   ・パックごとに、丸いグループを作り、中心に、パックの名札、その周りに、デッキのカードを並べる
//   ・カードは、仲間（元カード・再録・パラレル）の中に「新規」があれば、その新規のパックのグループに入る（新規を優先）
//   ・グループは、パックの発売順に、大きな円の内側を、ぐるっと並ぶ（発売の近いパックが、隣り合う）
//   ・線の色：新規＝赤、再録＝青、パラレル＝黄。カードから、そのカードが収録されているパックの名札へ、線を引く
//   ・カード・パックを、クリック（タップ）すると、そのカード・パックに関係する線だけを、強調する

export const PACK_LINK_COLOR: Record<PackType, string> = { 新規: '#ff4d4d', 再録: '#4da3ff', パラレル: '#ffd23f' }

type Active = { kind: 'card'; id: number } | { kind: 'pack'; code: string } | null

// カードの中心 → パックの名札の中心、の線（端は、カード・名札の縁）。bend が0以外のときは、曲げて、重ならないようにする
function linkPath(x1: number, y1: number, x2: number, y2: number, bend: number): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const sx = x1 + ux * CARD_R
  const sy = y1 + uy * CARD_R
  const ex = x2 - ux * HUB_R
  const ey = y2 - uy * HUB_R
  if (!bend) return `M${sx.toFixed(1)},${sy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`
  const mx = (sx + ex) / 2 - uy * bend * 2
  const my = (sy + ey) / 2 + ux * bend * 2
  return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`
}

const typeOrder = (t: PackType | null) => (t ? PACK_TYPES.indexOf(t) : 9)

// 図の表示部分（データは、親から受け取る）
export function PackGraphView({ infos, counts, packLabel, packRank }: { infos: CardPackInfo[]; counts: Map<number, number>; packLabel: (code: string) => string; packRank: (code: string) => number }) {
  const [hover, setHover] = useState<Active>(null)
  const [selected, setSelected] = useState<Active>(null)
  const active = hover ?? selected

  // 配置：パック（発売順）→ グループ。カードは、新規のパックのグループに入れる
  const { layout, hubs, cardPos } = useMemo(() => {
    const packCodes = new Set<string>()
    infos.forEach((i) => {
      packCodes.add(i.homePack)
      i.memberships.forEach((m) => packCodes.add(m.packCode))
    })
    const ordered = Array.from(packCodes).sort((a, b) => packRank(a) - packRank(b) || a.localeCompare(b))
    const groups = ordered.map((code) => ({
      packCode: code,
      items: infos.filter((i) => i.homePack === code).sort((a, b) => typeOrder(a.ownType) - typeOrder(b.ownType) || a.card.slot - b.card.slot || a.card.id - b.card.id),
    }))
    const l = layoutPackGraph(groups)
    const hubMap = new Map(l.groups.map((g) => [g.packCode, { x: g.cx, y: g.cy }]))
    const posMap = new Map<number, { x: number; y: number }>()
    l.groups.forEach((g) => g.items.forEach((it) => posMap.set(it.item.card.id, { x: it.x, y: it.y })))
    return { layout: l, hubs: hubMap, cardPos: posMap }
  }, [infos, packRank])

  // 線：カードごとに、収録されているパック（区分ごと）へ。同じカード→同じパックに、複数の線があるときは、曲げて、ずらす
  const links = useMemo(() => {
    const out: { key: string; cardId: number; pack: string; type: PackType; d: string }[] = []
    infos.forEach((info) => {
      const from = cardPos.get(info.card.id)
      if (!from) return
      const byPack = new Map<string, PackType[]>()
      info.memberships.forEach((m) => byPack.set(m.packCode, [...(byPack.get(m.packCode) ?? []), m.type]))
      byPack.forEach((types, pack) => {
        const to = hubs.get(pack)
        if (!to) return
        types.forEach((type, i) => out.push({ key: `${info.card.id}|${pack}|${type}`, cardId: info.card.id, pack, type, d: linkPath(from.x, from.y, to.x, to.y, (i - (types.length - 1) / 2) * 12) }))
      })
    })
    return out
  }, [infos, cardPos, hubs])

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
  const toggle = (a: NonNullable<Active>) => setSelected((cur) => (cur && cur.kind === a.kind && (cur.kind === 'card' ? cur.id === (a as { id: number }).id : cur.code === (a as { code: string }).code) ? null : a))

  const R = layout.outerR
  const packInfoLine = (code: string) => {
    const per: Record<PackType, number> = { 新規: 0, 再録: 0, パラレル: 0 }
    infos.forEach((i) => i.memberships.filter((m) => m.packCode === code).forEach((m) => (per[m.type] += 1)))
    return per
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#d7eef2]">
        {PACK_TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-6" style={{ background: PACK_LINK_COLOR[t] }} />
            {t}
          </span>
        ))}
        <span className="text-[10px] text-[#9fc3ca]">（カードの縁の色＝デッキに入っているカードの区分）</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} className="mx-auto block w-full min-w-[420px] max-w-[760px]" role="img" aria-label="デッキのカードが収録されているパックの図" onClick={() => setSelected(null)}>
          {/* 大きな円 */}
          <circle r={R - 1} fill="rgba(76, 224, 230, 0.03)" stroke="#2a4a52" strokeWidth={1} />
          {/* パックごとのグループの円 */}
          {layout.groups.map((g) => (
            <circle key={g.packCode} cx={g.cx} cy={g.cy} r={g.r} fill="rgba(76, 224, 230, 0.05)" stroke="#2a4a52" strokeWidth={1} />
          ))}

          {/* 線（カードの下に描く） */}
          <g fill="none" strokeWidth={1.6} strokeLinecap="round" pointerEvents="none">
            {links.map((l) => (
              <path key={l.key} d={l.d} stroke={PACK_LINK_COLOR[l.type]} opacity={linkOpacity(l)} />
            ))}
          </g>

          {/* パックの名札 */}
          {layout.groups.map((g) => {
            const label = packLabel(g.packCode)
            return (
              <g
                key={g.packCode}
                transform={`translate(${g.cx} ${g.cy})`}
                opacity={hubOpacity(g.packCode)}
                tabIndex={0}
                role="button"
                aria-label={`パック ${label}`}
                style={{ cursor: 'pointer', outline: 'none' }}
                onMouseEnter={() => setHover({ kind: 'pack', code: g.packCode })}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover({ kind: 'pack', code: g.packCode })}
                onBlur={() => setHover(null)}
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
                <title>{`${label}（${g.packCode}）`}</title>
                <circle r={HUB_R} fill="#0b1e26" stroke="#4ce0e6" strokeWidth={active?.kind === 'pack' && active.code === g.packCode ? 2.5 : 1.5} />
                <text textAnchor="middle" y={-2} fontSize={g.packCode.length > 6 ? 8 : 10} fontWeight={700} fill="#ffffff" style={{ fontFamily: 'ui-monospace, monospace' }}>
                  {g.packCode}
                </text>
                <text textAnchor="middle" y={9} fontSize={7} fill="#9fc3ca">
                  {label.length > 6 ? `${label.slice(0, 5)}…` : label}
                </text>
              </g>
            )
          })}

          {/* カード */}
          {layout.groups.flatMap((g) =>
            g.items.map(({ item: info, x, y }) => {
              const count = counts.get(info.card.id) ?? 1
              const ring = info.ownType ? PACK_LINK_COLOR[info.ownType] : '#9aa5a8'
              const clipId = `pg-clip-${info.card.id}`
              const isActive = active?.kind === 'card' && active.id === info.card.id
              return (
                <g
                  key={info.card.id}
                  transform={`translate(${x} ${y})`}
                  opacity={cardOpacity(info)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${info.card.card_name}（${info.ownType ?? ''}）`}
                  style={{ cursor: 'pointer', outline: 'none' }}
                  onMouseEnter={() => setHover({ kind: 'card', id: info.card.id })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ kind: 'card', id: info.card.id })}
                  onBlur={() => setHover(null)}
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
                  <circle r={CARD_R} fill="#26324f" stroke={ring} strokeWidth={isActive ? 4 : 2.5} />
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
            }),
          )}
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
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {[...activeInfo.memberships].sort((a, b) => typeOrder(a.type) - typeOrder(b.type) || packRank(a.packCode) - packRank(b.packCode)).map((m) => (
                <li key={`${m.packCode}|${m.type}`} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5" style={{ background: PACK_LINK_COLOR[m.type] }} />
                  {m.type}：{packLabel(m.packCode)}
                  <span className="hud-mono text-[#9fc3ca]">{m.packCode}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {active?.kind === 'pack' && (
          <p>
            <span className="font-bold text-white">{packLabel(active.code)}</span>
            <span className="hud-mono ml-1 text-[#9fc3ca]">{active.code}</span> に収録されている、デッキのカード：
            {PACK_TYPES.map((t) => (
              <span key={t} className="ml-3 inline-flex items-center gap-1">
                <span className="inline-block h-0.5 w-4" style={{ background: PACK_LINK_COLOR[t] }} />
                {t} {packInfoLine(active.code)[t]}種類
              </span>
            ))}
          </p>
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
      {entries.length > 0 && !loading && !setsLoading && !error && <PackGraphView infos={infos} counts={counts} packLabel={packLabel} packRank={packRank} />}
    </div>
  )
}