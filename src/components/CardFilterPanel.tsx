import type { Card } from '../types/card'
import {
  distinctAttributes,
  distinctBatonTouch,
  distinctCardTypes,
  distinctSkillTypes,
  distinctStages,
  distinctTags,
  hasActiveFilters,
  type CardFilters,
} from '../utils/cardFilters'

type Props = {
  cards: Card[] // 現在選択中の弾の全カード（フィルター選択肢を作るのに使う）
  filters: CardFilters
  onChange: (filters: CardFilters) => void
}

const selectStyle: React.CSSProperties = { minWidth: 120 }

export function CardFilterPanel({ cards, filters, onChange }: Props) {
  const set = (patch: Partial<CardFilters>) => onChange({ ...filters, ...patch })

  const skillTypes = distinctSkillTypes(cards)
  const tags = distinctTags(cards)
  const batonTouchValues = distinctBatonTouch(cards)
  const attributes = distinctAttributes(cards)
  const cardTypes = distinctCardTypes(cards)
  const stages = distinctStages(cards)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
      <label className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
        固有スキル種類
        <select className="field" style={selectStyle} value={filters.skillType} onChange={(e) => set({ skillType: e.target.value })}>
          <option value="">すべて</option>
          {skillTypes.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
        HP
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            className="field"
            type="number"
            placeholder="下限"
            value={filters.hpMin}
            onChange={(e) => set({ hpMin: e.target.value })}
            style={{ width: 72 }}
          />
          <span style={{ color: 'var(--hud-ink-dim)' }}>〜</span>
          <input
            className="field"
            type="number"
            placeholder="上限"
            value={filters.hpMax}
            onChange={(e) => set({ hpMax: e.target.value })}
            style={{ width: 72 }}
          />
        </div>
      </label>

      <label className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
        タグ
        <select className="field" style={selectStyle} value={filters.tag} onChange={(e) => set({ tag: e.target.value })}>
          <option value="">すべて</option>
          {tags.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
        バトンタッチ
        <select className="field" style={selectStyle} value={filters.batonTouch} onChange={(e) => set({ batonTouch: e.target.value })}>
          <option value="">すべて</option>
          {batonTouchValues.map((v) => (
            <option key={v} value={String(v)}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
        カード色
        <select className="field" style={selectStyle} value={filters.attribute} onChange={(e) => set({ attribute: e.target.value })}>
          <option value="">すべて</option>
          {attributes.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
        カード種類
        <select className="field" style={selectStyle} value={filters.cardType} onChange={(e) => set({ cardType: e.target.value })}>
          <option value="">すべて</option>
          {cardTypes.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-ink-dim)' }}>
        進化レベル
        <select className="field" style={selectStyle} value={filters.stage} onChange={(e) => set({ stage: e.target.value })}>
          <option value="">すべて</option>
          {stages.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      {hasActiveFilters(filters) && (
        <button className="btn-secondary" onClick={() => onChange({ ...filters, skillType: '', hpMin: '', hpMax: '', tag: '', batonTouch: '', attribute: '', cardType: '', stage: '' })}>
          フィルターをリセット
        </button>
      )}
    </div>
  )
}