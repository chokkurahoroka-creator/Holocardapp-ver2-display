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

// 選択肢を縦一列に並べるトグルグループ
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

// HPの範囲指定スライダー（2つのrangeを重ねて二重ハンドルにする定番のやり方）。10刻み
function HpRangeSlider({
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
  const pctMin = ((valueMin - min) / (max - min)) * 100
  const pctMax = ((valueMax - min) / (max - min)) * 100
  return (
    <div style={{ marginBottom: 14 }}>
      <style>{`
        .hud-range { -webkit-appearance: none; appearance: none; background: transparent; pointer-events: none; }
        .hud-range::-webkit-slider-runnable-track { background: transparent; height: 3px; }
        .hud-range::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; pointer-events: auto;
          width: 14px; height: 14px; border-radius: 50%;
          background: var(--hud-cyan); border: 2px solid #04232a; cursor: pointer; margin-top: -5.5px;
        }
        .hud-range::-moz-range-track { background: transparent; height: 3px; border: none; }
        .hud-range::-moz-range-thumb {
          pointer-events: auto; width: 14px; height: 14px; border-radius: 50%;
          background: var(--hud-cyan); border: 2px solid #04232a; cursor: pointer;
        }
      `}</style>
      <div className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)', marginBottom: 4 }}>
        HP: {valueMin}〜{valueMax}
      </div>
      <div style={{ position: 'relative', height: 28 }}>
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 0,
            right: 0,
            height: 3,
            borderRadius: 2,
            background: 'var(--hud-line)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: `${pctMin}%`,
            width: `${Math.max(0, pctMax - pctMin)}%`,
            height: 3,
            borderRadius: 2,
            background: 'var(--hud-cyan)',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={10}
          value={valueMin}
          onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax), valueMax)}
          style={{ position: 'absolute', width: '100%', top: 6, margin: 0, background: 'transparent', pointerEvents: 'auto' }}
          className="hud-range"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={10}
          value={valueMax}
          onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin))}
          style={{ position: 'absolute', width: '100%', top: 6, margin: 0, background: 'transparent', pointerEvents: 'auto' }}
          className="hud-range"
        />
      </div>
    </div>
  )
}

export function CardFilterPanel({ cards, filters, onChange, sets }: Props) {
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
      {/* カテゴリ間の組み合わせ方（AND/OR）の切り替え */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
          <button type="button" className="btn-secondary" onClick={() => onChange({ ...EMPTY_FILTERS, logic: filters.logic })}>
            すべて解除
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 16 }}>
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

        <HpRangeSlider
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

        <ToggleGroup label="タグ" options={tags} selected={filters.tags} onToggle={(v) => onChange({ ...filters, tags: toggle(filters.tags, v) })} />

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