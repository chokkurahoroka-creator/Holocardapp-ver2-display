import { useState } from 'react'
import type { Card } from '../types/card'
import {
  activeFilterChips,
  distinctAttributes,
  distinctBatonTouch,
  distinctCardTypes,
  distinctSkillTypes,
  distinctStages,
  distinctTags,
  hpBounds,
  EMPTY_FILTERS,
  type CardFilters,
} from '../utils/cardFilters'

type Props = {
  cards: Card[] // 選択肢を作るのに使うカード一覧（全カード検索なら全カード、カード一覧なら選択中の弾のカード）
  filters: CardFilters
  onChange: (filters: CardFilters) => void
  sets?: { set_code: string; set_name: string }[] // 指定した場合のみ「弾」の絞り込みボタンも表示する
  onClose?: () => void // 指定した場合、パネル内に「閉じる」ボタンを表示する
}

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    textAlign: 'left',
    border: active ? '1px solid var(--hud-cyan)' : '1px solid var(--hud-line)',
    background: active ? 'rgba(76,224,230,0.18)' : 'transparent',
    color: active ? 'var(--hud-cyan)' : 'var(--hud-ink)',
    cursor: 'pointer',
  }
}

// 選択肢を縦一列に並べるトグルグループ（ボタン方式）
function ToggleGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {options.map((v) => (
          <button key={v} type="button" style={pillStyle(selected.includes(v))} onClick={() => onToggle(v)}>
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

// タグ用：打ち込んで候補を絞り込み、クリック（またはEnter）で追加する複数選択式の入力欄
function TagInput({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  if (options.length === 0) return null

  const suggestions = options.filter((o) => !selected.includes(o) && o.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)

  const addTag = (v: string) => {
    onChange(selected.includes(v) ? selected : [...selected, v])
    setQuery('')
  }
  const removeTag = (v: string) => onChange(selected.filter((s) => s !== v))

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)', marginBottom: 4 }}>
        {label}
      </div>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
          {selected.map((v) => (
            <button key={v} type="button" onClick={() => removeTag(v)} style={{ ...pillStyle(true), display: 'inline-flex', gap: 4 }}>
              {v} <span style={{ opacity: 0.7 }}>×</span>
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions.length > 0) {
            addTag(suggestions[0])
            e.preventDefault()
          }
        }}
        placeholder="入力して検索・選択"
        className="field"
        style={{ width: '100%', fontSize: 12 }}
      />
      {query.trim() && suggestions.length > 0 && (
        <div style={{ border: '1px solid var(--hud-line)', borderRadius: 6, marginTop: 4, maxHeight: 140, overflowY: 'auto' }}>
          {suggestions.map((v) => (
            <div
              key={v}
              onClick={() => addTag(v)}
              style={{ padding: '5px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--hud-ink)' }}
            >
              {v}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 目安メモリ（min〜maxを5段階程度に区切った数値）を作る。10刻みを基本に、範囲が狭い場合は細かくなりすぎないよう調整
function buildTicks(min: number, max: number): number[] {
  const span = max - min
  const rawStep = span / 4
  const step = Math.max(10, Math.round(rawStep / 10) * 10)
  const ticks: number[] = []
  for (let v = min; v < max; v += step) ticks.push(v)
  ticks.push(max)
  return ticks
}

// 単一ハンドルのスライダー（上限用・下限用をそれぞれ別のスライダーとして使う）。目安メモリ付き、10刻み
function SingleSlider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}) {
  const ticks = buildTicks(min, max)
  return (
    <div style={{ marginBottom: 10 }}>
      <style>{`
        .hud-range-single { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: var(--hud-line); outline: none; margin: 0; cursor: pointer; }
        .hud-range-single::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: var(--hud-cyan); border: 2px solid #04232a; cursor: pointer; margin-top: -5px;
        }
        .hud-range-single::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: var(--hud-cyan); border: 2px solid #04232a; cursor: pointer;
        }
      `}</style>
      <div className="hud-font" style={{ fontSize: 15, fontWeight: 700, color: 'var(--hud-ink)', marginBottom: 4 }}>
        {label}: {value}
      </div>
      <input
        type="range"
        className="hud-range-single"
        min={min}
        max={max}
        step={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--hud-ink-dim)', marginTop: 2 }}>
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  )
}

// HP範囲を「上限スライダー」「下限スライダー」の2本に分けて表示する
function HpRangeSliders({
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
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-cyan)', marginBottom: 6 }}>
        HP
      </div>
      <SingleSlider label="上限" min={min} max={max} value={valueMax} onChange={(v) => onChange(Math.min(valueMin, v), v)} />
      <SingleSlider label="下限" min={min} max={max} value={valueMin} onChange={(v) => onChange(v, Math.max(valueMax, v))} />
    </div>
  )
}

export function CardFilterPanel({ cards, filters, onChange, sets, onClose }: Props) {
  const skillTypes = distinctSkillTypes(cards)
  const tags = distinctTags(cards)
  const batonTouchValues = distinctBatonTouch(cards)
  const attributes = distinctAttributes(cards)
  const cardTypes = distinctCardTypes(cards)
  const stages = distinctStages(cards)
  const { min: hpMinBound, max: hpMaxBound } = hpBounds(cards)

  const chips = activeFilterChips(filters)

  const removeChip = (category: keyof CardFilters, value: string) => {
    if (category === 'hpMin') {
      onChange({ ...filters, hpMin: '', hpMax: '' })
      return
    }
    const current = filters[category] as string[]
    onChange({ ...filters, [category]: current.filter((v) => v !== value) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .filter-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
        @media (max-width: 900px) { .filter-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 560px) { .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } }
      `}</style>

      {/* パネル内の操作ボタン：リセット・閉じる */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <button type="button" className="btn-secondary" onClick={() => onChange({ ...EMPTY_FILTERS, logic: filters.logic })}>
          リセット
        </button>
        {onClose && (
          <button type="button" className="btn-secondary" onClick={onClose}>
            閉じる
          </button>
        )}
      </div>

      {/* 選択したすべての条件（チップ）の組み合わせ方（AND/OR）の切り替え */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
          条件の組み合わせ:
        </span>
        <div style={{ display: 'inline-flex', borderRadius: 999, border: '1px solid var(--hud-line)', overflow: 'hidden' }}>
          {(['and', 'or'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...filters, logic: mode })}
              style={{
                padding: '4px 14px',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: filters.logic === mode ? 'var(--hud-cyan)' : 'transparent',
                color: filters.logic === mode ? '#04232a' : 'var(--hud-ink-dim)',
              }}
            >
              {mode === 'and' ? 'AND（すべて満たす）' : 'OR（いずれか満たす）'}
            </button>
          ))}
        </div>
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <span className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-cyan)' }}>
            {filters.logic === 'or' ? 'OR条件:' : 'AND条件:'}
          </span>
          {chips.map((chip) => (
            <button
              key={`${chip.category}-${chip.value}`}
              type="button"
              onClick={() => removeChip(chip.category, chip.value)}
              style={{ ...pillStyle(true), display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {chip.label} <span style={{ opacity: 0.7 }}>×</span>
            </button>
          ))}
        </div>
      )}

      <div className="filter-grid">
        {sets && sets.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)', marginBottom: 4 }}>
              パック
            </div>
            <select
              className="field"
              style={{ width: '100%', fontSize: 12 }}
              value={filters.setCodes[0] ?? ''}
              onChange={(e) => onChange({ ...filters, setCodes: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">すべてのパック</option>
              {sets.map((s) => (
                <option key={s.set_code} value={s.set_code}>
                  {s.set_code}（{s.set_name}）
                </option>
              ))}
            </select>
          </div>
        )}

        <ToggleGroup
          label="固有スキル種類"
          options={skillTypes}
          selected={filters.skillTypes}
          onToggle={(v) => onChange({ ...filters, skillTypes: toggle(filters.skillTypes, v) })}
        />

        <HpRangeSliders
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

        <TagInput label="タグ（複数選択可）" options={tags} selected={filters.tags} onChange={(tags) => onChange({ ...filters, tags })} />

        <ToggleGroup
          label="バトンタッチ"
          options={batonTouchValues.map(String)}
          selected={filters.batonTouches}
          onToggle={(v) => onChange({ ...filters, batonTouches: toggle(filters.batonTouches, v) })}
        />

        <ToggleGroup
          label="カード色"
          options={attributes}
          selected={filters.attributes}
          onToggle={(v) => onChange({ ...filters, attributes: toggle(filters.attributes, v) })}
        />

        <ToggleGroup
          label="カード種類"
          options={cardTypes}
          selected={filters.cardTypes}
          onToggle={(v) => onChange({ ...filters, cardTypes: toggle(filters.cardTypes, v) })}
        />

        <ToggleGroup
          label="進化レベル"
          options={stages}
          selected={filters.stages}
          onToggle={(v) => onChange({ ...filters, stages: toggle(filters.stages, v) })}
        />
      </div>
    </div>
  )
}