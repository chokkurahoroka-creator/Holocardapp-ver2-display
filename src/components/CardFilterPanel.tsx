import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Card } from '../types/card'
import { useIsMobile } from '../hooks/useGridLayout'
import { setLabel } from '../utils/setLabel'
import {
  activeFilterChips,
  distinctAttributes,
  distinctBatonTouch,
  distinctCardTypes,
  distinctSkillTypes,
  distinctSpecialAttackColors,
  distinctStages,
  hasActiveFilters,
  hpBounds,
  removeFilterChip,
  tagCounts,
  EMPTY_FILTERS,
  type CardFilters,
} from '../utils/cardFilters'

type Props = {
  cards: Card[] // 選択肢を作るのに使うカード一覧（全カード検索なら全カード、カード一覧なら選択中の弾のカード）
  filters: CardFilters
  onChange: (filters: CardFilters) => void
  sets?: { set_code: string; set_name: string; display_name?: string | null }[] // 指定した場合のみ「パック」の絞り込みも表示する
  onClose?: () => void
  resultCount?: number // 今の条件で表示されるカード枚数（「◯件を表示」ボタンと見出しに出す）
  asSheet?: boolean // true のとき、画面下から出てくるシート（スマホ向け）。false のときは、画面の中央に開くモーダル（PC向け）。どちらも、画面の上に重ねて表示する
}

// 区分の選択肢（カードの type と同じ値）
const CARD_KIND_OPTIONS = ['新規', '再録', 'パラレル']

// カード色の見分けやすさのため、色名の前に小さな色の丸を付ける
const ATTRIBUTE_DOT: Record<string, string> = {
  白: '#f1f5f9',
  緑: '#4ade80',
  赤: '#f87171',
  青: '#60a5fa',
  紫: '#c084fc',
  黄: '#facc15',
  多色: 'conic-gradient(#f87171, #facc15, #4ade80, #60a5fa, #c084fc, #f87171)',
  無色: '#9ca3af',
}

// よく使われるタグを、ワンタップで選べるように並べる数
const QUICK_TAG_COUNT = 14

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

const PANEL_CSS = `
.fp-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.fp-pill {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 34px; padding: 5px 12px; border-radius: 999px;
  font-size: 13px; line-height: 1.2;
  border: 1px solid var(--hud-line); background: transparent; color: var(--hud-ink);
  cursor: pointer; touch-action: manipulation; transition: background .12s, border-color .12s;
}
.fp-pill:hover { border-color: var(--hud-cyan); }
.fp-pill.on { border-color: var(--hud-cyan); background: rgba(76,224,230,0.18); color: var(--hud-cyan); font-weight: 700; }
.fp-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); flex: 0 0 auto; }
.fp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.fp-wide { grid-column: 1 / -1; }
/* 項目ごとの区切り：薄くて細い線で囲む */
.fp-box { border: 1px solid rgba(76,224,230,0.2); border-radius: 8px; padding: 10px 12px 12px; background: rgba(76,224,230,0.025); min-width: 0; }
.fp-stack { display: flex; flex-direction: column; gap: 8px; }
.fp-sec-title { font-size: 11px; letter-spacing: .04em; color: var(--hud-ink-dim); }
.fp-badge {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px; background: var(--hud-cyan); color: #04232a; font-size: 11px; font-weight: 700;
}
.fp-range { position: absolute; left: 0; top: 0; width: 100%; height: 28px; margin: 0; background: transparent;
  -webkit-appearance: none; appearance: none; pointer-events: none; outline: none; }
.fp-range::-webkit-slider-runnable-track { background: transparent; height: 28px; }
.fp-range::-moz-range-track { background: transparent; height: 28px; }
.fp-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; pointer-events: auto; cursor: pointer;
  width: 22px; height: 22px; margin-top: 3px; border-radius: 50%; background: var(--hud-cyan); border: 2px solid #04232a; }
.fp-range::-moz-range-thumb { pointer-events: auto; cursor: pointer; width: 18px; height: 18px; border-radius: 50%;
  background: var(--hud-cyan); border: 2px solid #04232a; }
@keyframes fp-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fp-fade { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 640px) {
  .fp-pill { min-height: 40px; padding: 7px 14px; font-size: 14px; }
}
`

// ---------------------------------------------------------------------------
// 選択中の条件のチップ一覧（フィルターを開かなくても、ここから1つずつ・まとめて解除できる）
// ---------------------------------------------------------------------------
export function ActiveFilterChips({ filters, onChange }: { filters: CardFilters; onChange: (f: CardFilters) => void }) {
  const isMobile = useIsMobile()
  const chips = activeFilterChips(filters)
  if (chips.length === 0) return null

  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flex: '0 0 auto',
    padding: isMobile ? '6px 10px' : '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    whiteSpace: 'nowrap',
    border: '1px solid var(--hud-cyan)',
    background: 'rgba(76,224,230,0.18)',
    color: 'var(--hud-cyan)',
    cursor: 'pointer',
    touchAction: 'manipulation',
  }

  return (
    <>
      <style>{`.fp-chiprow::-webkit-scrollbar { display: none; }`}</style>
      <div
        className="fp-chiprow"
        style={{
          display: 'flex',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          alignItems: 'center',
          gap: 6,
          // スマホでは1行に収めて横スクロール（チップが増えても画面を押し下げない）
          overflowX: isMobile ? 'auto' : 'visible',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {chips.map((chip) => (
          <button
            key={`${chip.category}-${chip.value}`}
            type="button"
            style={chipStyle}
            onClick={() => onChange(removeFilterChip(filters, chip.category, chip.value))}
            aria-label={`${chip.label}を解除`}
          >
            {chip.label} <span style={{ opacity: 0.7 }}>×</span>
          </button>
        ))}
        {chips.length >= 2 && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, logic: filters.logic })}
            style={{ ...chipStyle, border: '1px solid var(--hud-line)', background: 'transparent', color: 'var(--hud-ink-dim)' }}
          >
            すべて解除
          </button>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

// 1項目分のまとまり。項目どうしの区切りが分かるよう、薄くて細い線で囲む。
// スマホ（シート）では開閉式にして、選択中の数をバッジで示す
function Section({
  label,
  count = 0,
  collapsible,
  defaultOpen = false,
  wide = false,
  children,
}: {
  label: string
  count?: number
  collapsible: boolean
  defaultOpen?: boolean
  wide?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen || count > 0)
  const expanded = !collapsible || open

  const title = (
    <>
      <span className="fp-sec-title hud-mono">{label}</span>
      {count > 0 && <span className="fp-badge">{count}</span>}
    </>
  )

  return (
    <div className={`fp-box${wide ? ' fp-wide' : ''}`}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            minHeight: 36,
            background: 'transparent',
            border: 'none',
            color: 'var(--hud-ink)',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
            marginBottom: expanded ? 8 : 0,
          }}
        >
          {title}
          <span style={{ marginLeft: 'auto', color: 'var(--hud-ink-dim)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>{title}</div>
      )}
      {expanded && children}
    </div>
  )
}

// 選択肢を横に並べて折り返す、複数選択のボタン群
function PillGroup({
  options,
  selected,
  onToggle,
  withDot = false,
}: {
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  withDot?: boolean
}) {
  return (
    <div className="fp-pills">
      {options.map((v) => {
        const on = selected.includes(v)
        return (
          <button key={v} type="button" className={`fp-pill${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onToggle(v)}>
            {withDot && ATTRIBUTE_DOT[v] && <span className="fp-dot" style={{ background: ATTRIBUTE_DOT[v] }} />}
            {v}
          </button>
        )
      })}
    </div>
  )
}

// 目安メモリ（min〜maxを5段階程度に区切った数値）。10刻みを基本に、範囲が狭くても細かくなりすぎないよう調整
function buildTicks(min: number, max: number): number[] {
  const step = Math.max(10, Math.round((max - min) / 4 / 10) * 10)
  const ticks: number[] = []
  for (let v = min; v < max; v += step) ticks.push(v)
  ticks.push(max)
  return ticks
}

// つまみが2つの範囲スライダー（下限〜上限を1本で指定する）
function HpRange({
  min,
  max,
  valueMin,
  valueMax,
  onChange,
}: {
  min: number
  max: number
  valueMin: number
  valueMax: number
  onChange: (min: number, max: number) => void
}) {
  const span = Math.max(1, max - min)
  const pMin = (valueMin - min) / span
  const pMax = (valueMax - min) / span
  const ticks = buildTicks(min, max)
  const unset = valueMin === min && valueMax === max

  return (
    <div>
      <div className="hud-font" style={{ fontSize: 16, fontWeight: 700, color: unset ? 'var(--hud-ink-dim)' : 'var(--hud-ink)', marginBottom: 6 }}>
        {unset ? '指定なし' : `${valueMin} 〜 ${valueMax}`}
      </div>
      <div style={{ position: 'relative', height: 28 }}>
        <div style={{ position: 'absolute', left: 11, right: 11, top: 12, height: 4, borderRadius: 2, background: 'var(--hud-line)' }} />
        <div
          style={{
            position: 'absolute',
            top: 12,
            height: 4,
            borderRadius: 2,
            background: 'var(--hud-cyan)',
            left: `calc(11px + (100% - 22px) * ${pMin})`,
            right: `calc(11px + (100% - 22px) * ${1 - pMax})`,
          }}
        />
        <input
          type="range"
          className="fp-range"
          aria-label="HPの下限"
          min={min}
          max={max}
          step={10}
          value={valueMin}
          // 2つのつまみが重なったとき、動かしたい方を必ず掴めるよう、位置に応じて前面を入れ替える
          style={{ zIndex: pMin > 0.5 ? 4 : 2 }}
          onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax), valueMax)}
        />
        <input
          type="range"
          className="fp-range"
          aria-label="HPの上限"
          min={min}
          max={max}
          step={10}
          value={valueMax}
          style={{ zIndex: pMin > 0.5 ? 2 : 4 }}
          onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin))}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--hud-ink-dim)', padding: '0 4px' }}>
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  )
}

// タグ：よく使われるタグをワンタップで選べるようにし、それ以外は打ち込んで探す
function TagPicker({
  cards,
  selected,
  onChange,
}: {
  cards: Card[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const counts = tagCounts(cards)
  if (counts.length === 0) return null

  const quick = counts.filter((c) => !selected.includes(c.tag)).slice(0, QUICK_TAG_COUNT).map((c) => c.tag)
  const q = query.trim().toLowerCase()
  const suggestions = q ? counts.map((c) => c.tag).filter((t) => !selected.includes(t) && t.toLowerCase().includes(q)).slice(0, 12) : []

  const add = (t: string) => {
    onChange(selected.includes(t) ? selected : [...selected, t])
    setQuery('')
  }
  const remove = (t: string) => onChange(selected.filter((s) => s !== t))

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions.length > 0) {
            add(suggestions[0])
            e.preventDefault()
          }
        }}
        placeholder="タグを検索して追加"
        className="field"
        style={{ width: '100%', fontSize: 14, marginBottom: 8 }}
      />
      {q ? (
        suggestions.length > 0 ? (
          <div className="fp-pills">
            {suggestions.map((t) => (
              <button key={t} type="button" className="fp-pill" onClick={() => add(t)}>
                {t}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--hud-ink-dim)' }}>該当するタグがありません</div>
        )
      ) : (
        <div className="fp-pills">
          {selected.map((t) => (
            <button key={t} type="button" className="fp-pill on" onClick={() => remove(t)}>
              {t} <span style={{ opacity: 0.7 }}>×</span>
            </button>
          ))}
          {quick.map((t) => (
            <button key={t} type="button" className="fp-pill" onClick={() => add(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      {!q && counts.length > QUICK_TAG_COUNT && (
        <div style={{ fontSize: 11, color: 'var(--hud-ink-dim)', marginTop: 6 }}>よく使われるタグを表示中。ほかは上の欄で検索できます</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------
export function CardFilterPanel({ cards, filters, onChange, sets, onClose, resultCount, asSheet = false }: Props) {
  const skillTypes = distinctSkillTypes(cards)
  const batonTouchValues = distinctBatonTouch(cards).map(String)
  const attributes = distinctAttributes(cards)
  const specialAttackColors = distinctSpecialAttackColors(cards)
  const cardTypes = distinctCardTypes(cards)
  const stages = distinctStages(cards)
  const { min: hpMinBound, max: hpMaxBound } = hpBounds(cards)

  const chips = activeFilterChips(filters)
  const logicChips = chips.filter((c) => c.category !== 'types').length // 区分はAND/ORの対象外
  const hasFilter = hasActiveFilters(filters)
  const hpSet = !!(filters.hpMin || filters.hpMax)
  const reset = () => onChange({ ...EMPTY_FILTERS, logic: filters.logic })

  // シート表示のあいだは、後ろのページがスクロールしないようにし、Escで閉じられるようにする
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const countText = resultCount === undefined ? '' : `${resultCount}件`

  const sections = (
    <div className={asSheet ? 'fp-stack' : 'fp-grid'}>
      <Section label="区分" count={filters.types.length} collapsible={asSheet} defaultOpen>
        <PillGroup options={CARD_KIND_OPTIONS} selected={filters.types} onToggle={(v) => onChange({ ...filters, types: toggle(filters.types, v) })} />
      </Section>

      {attributes.length > 0 && (
        <Section label="カード色" count={filters.attributes.length} collapsible={asSheet} defaultOpen>
          <PillGroup withDot options={attributes} selected={filters.attributes} onToggle={(v) => onChange({ ...filters, attributes: toggle(filters.attributes, v) })} />
        </Section>
      )}

      {specialAttackColors.length > 0 && (
        <Section label="特攻色" count={filters.specialAttackColors.length} collapsible={asSheet}>
          <PillGroup withDot options={specialAttackColors} selected={filters.specialAttackColors} onToggle={(v) => onChange({ ...filters, specialAttackColors: toggle(filters.specialAttackColors, v) })} />
        </Section>
      )}

      {cardTypes.length > 0 && (
        <Section label="カード種類" count={filters.cardTypes.length} collapsible={asSheet}>
          <PillGroup options={cardTypes} selected={filters.cardTypes} onToggle={(v) => onChange({ ...filters, cardTypes: toggle(filters.cardTypes, v) })} />
        </Section>
      )}

      {stages.length > 0 && (
        <Section label="進化レベル" count={filters.stages.length} collapsible={asSheet}>
          <PillGroup options={stages} selected={filters.stages} onToggle={(v) => onChange({ ...filters, stages: toggle(filters.stages, v) })} />
        </Section>
      )}

      {sets && sets.length > 0 && (
        <Section label="パック" count={filters.setCodes.length} collapsible={asSheet}>
          <select
            className="field"
            style={{ width: '100%', fontSize: 14 }}
            value={filters.setCodes[0] ?? ''}
            onChange={(e) => onChange({ ...filters, setCodes: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">すべてのパック</option>
            {sets.map((s) => (
              <option key={s.set_code} value={s.set_code}>
                {setLabel(s)}
              </option>
            ))}
          </select>
        </Section>
      )}

      <Section label="HP" count={hpSet ? 1 : 0} collapsible={asSheet}>
        <HpRange
          min={hpMinBound}
          max={hpMaxBound}
          valueMin={filters.hpMin ? Number(filters.hpMin) : hpMinBound}
          valueMax={filters.hpMax ? Number(filters.hpMax) : hpMaxBound}
          onChange={(min, max) =>
            onChange({
              ...filters,
              hpMin: min === hpMinBound ? '' : String(min),
              hpMax: max === hpMaxBound ? '' : String(max),
            })
          }
        />
      </Section>

      {batonTouchValues.length > 0 && (
        <Section label="バトンタッチ" count={filters.batonTouches.length} collapsible={asSheet}>
          <PillGroup options={batonTouchValues} selected={filters.batonTouches} onToggle={(v) => onChange({ ...filters, batonTouches: toggle(filters.batonTouches, v) })} />
        </Section>
      )}

      {skillTypes.length > 0 && (
        <Section label="固有スキル種類" count={filters.skillTypes.length} collapsible={asSheet} wide>
          <PillGroup options={skillTypes} selected={filters.skillTypes} onToggle={(v) => onChange({ ...filters, skillTypes: toggle(filters.skillTypes, v) })} />
        </Section>
      )}

      <Section label="タグ" count={filters.tags.length} collapsible={asSheet} wide>
        <TagPicker cards={cards} selected={filters.tags} onChange={(tags) => onChange({ ...filters, tags })} />
      </Section>
    </div>
  )

  // 条件が2つ以上あるときだけ意味を持つ、AND/ORの切り替え
  const logicSwitch =
    logicChips >= 2 ? (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
          条件の組み合わせ
        </span>
        <div style={{ display: 'inline-flex', borderRadius: 999, border: '1px solid var(--hud-line)', overflow: 'hidden' }}>
          {(['and', 'or'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...filters, logic: mode })}
              style={{
                padding: '5px 14px',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: filters.logic === mode ? 'var(--hud-cyan)' : 'transparent',
                color: filters.logic === mode ? '#04232a' : 'var(--hud-ink-dim)',
              }}
            >
              {mode === 'and' ? 'すべて満たす' : 'いずれか満たす'}
            </button>
          ))}
        </div>
      </div>
    ) : null

  // ---- 画面に重ねて表示：スマホは画面下から出るシート、PCは画面の中央に開くモーダル ----
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="絞り込み"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: asSheet ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: asSheet ? 0 : 24,
        animation: 'fp-fade .15s ease-out',
      }}
    >
      <style>{PANEL_CSS}</style>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div
        style={{
          position: 'relative',
          width: asSheet ? '100%' : 'min(980px, 100%)',
          maxHeight: asSheet ? '90dvh' : '88dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--hud-bg, #061217)',
          border: asSheet ? undefined : '1px solid var(--hud-cyan)',
          borderTop: '1px solid var(--hud-cyan)',
          borderRadius: asSheet ? '16px 16px 0 0' : 12,
          boxShadow: asSheet ? undefined : '0 16px 48px rgba(0,0,0,0.6)',
          animation: asSheet ? 'fp-sheet-up .2s ease-out' : 'fp-fade .15s ease-out',
          color: 'var(--hud-ink)',
        }}
      >
        {/* 見出し：件数・リセット・閉じるボタンは、常に見える */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: asSheet ? '12px 16px 8px' : '14px 20px 10px', flexWrap: 'wrap' }}>
          <span className="hud-font" style={{ fontSize: 16, fontWeight: 700 }}>
            {asSheet ? '絞り込み' : 'FILTER'}
          </span>
          {countText && (
            <span className="hud-mono" style={{ fontSize: 12, color: 'var(--hud-cyan)' }}>
              {asSheet ? countText : `${countText}が該当`}
            </span>
          )}
          {!asSheet && <span style={{ fontSize: 11, color: 'var(--hud-ink-dim)' }}>選ばなかった項目は、すべて表示します</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {!asSheet && (
              <button type="button" className="btn-secondary" onClick={reset} disabled={!hasFilter} style={{ opacity: hasFilter ? 1 : 0.4 }}>
                リセット
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--hud-ink)', fontSize: 22, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        </div>

        {hasFilter && (
          <div style={{ padding: asSheet ? '0 16px 8px' : '0 20px 10px', display: 'flex', flexDirection: asSheet ? 'column' : 'row', flexWrap: 'wrap', alignItems: asSheet ? 'stretch' : 'center', gap: asSheet ? 8 : 12 }}>
            <ActiveFilterChips filters={filters} onChange={onChange} />
            {logicSwitch}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: asSheet ? '0 16px 12px' : '0 20px 16px' }}>
          {asSheet && <div style={{ fontSize: 11, color: 'var(--hud-ink-dim)', padding: '2px 0 6px' }}>選ばなかった項目は、すべて表示します</div>}
          {sections}
        </div>

        {/* 下部固定：リセット（スマホ）と、結果を見るボタン */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: asSheet ? '10px 16px' : '12px 20px',
            paddingBottom: asSheet ? 'calc(10px + env(safe-area-inset-bottom, 0px))' : 12,
            borderTop: '1px solid var(--hud-line)',
          }}
        >
          {asSheet && (
            <button type="button" className="btn-secondary" onClick={reset} disabled={!hasFilter} style={{ minHeight: 44, opacity: hasFilter ? 1 : 0.4 }}>
              リセット
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onClose} style={{ flex: 1, minHeight: 44, fontWeight: 700 }}>
            {resultCount === undefined ? '閉じる' : `${resultCount}件を表示`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}