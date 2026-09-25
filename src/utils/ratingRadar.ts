import type { Card } from '../types/card'

export type RatingKey = 'hp' | 'power' | 'speed' | 'stamina' | 'luck' | 'potential'

const RATING_LABELS_BY_TYPE: Record<string, Record<RatingKey, string | null>> = {
  '推しホロメン': { hp: 'ライフ', power: 'SP・ステージ', speed: '推しスキル', stamina: '革新性', luck: '初心者お勧め度', potential: '将来性' },
  'サポート':     { hp: 'コスト', power: 'パワー', speed: '汎用性', stamina: '革新性', luck: null, potential: '将来性' },
  'ホロメン':     { hp: 'HP', power: '基本パワー', speed: '最大パワー', stamina: '継戦力', luck: '安定力', potential: '将来性' },
}

const RATING_KEYS: RatingKey[] = ['hp', 'power', 'speed', 'stamina', 'luck', 'potential']

// レーダーチャートのラベルが枠からはみ出さないよう、既知のラベルは自然な位置で改行する
// （未知のラベルが来た場合は文字数で機械的に2分割するフォールバックを使用）
const RADAR_LABEL_BREAKS: Record<string, string[]> = {
  'ライフ': ['ライフ'],
  'SP・ステージ': ['SP', 'ステージ'],
  '推しスキル': ['推し', 'スキル'],
  '革新性': ['革新性'],
  '初心者お勧め度': ['初心者', 'お勧め度'],
  '将来性': ['将来性'],
  'コスト': ['コスト'],
  'パワー': ['パワー'],
  '汎用性': ['汎用性'],
  'HP': ['HP'],
  '基本パワー': ['基本', 'パワー'],
  '最大パワー': ['最大', 'パワー'],
  '継戦力': ['継戦力'],
  '安定力': ['安定力'],
}

export function wrapRadarLabel(label: string): string[] {
  if (!label) return ['']
  if (RADAR_LABEL_BREAKS[label]) return RADAR_LABEL_BREAKS[label]
  if (label.length <= 4) return [label]
  const mid = Math.ceil(label.length / 2)
  return [label.slice(0, mid), label.slice(mid)]
}

function getRatingCategory(cardTypeStr: string | null): 'サポート' | '推しホロメン' | 'ホロメン' {
  const t = cardTypeStr || ''
  if (t.indexOf('推しホロメン') !== -1) return '推しホロメン'
  if (t.indexOf('サポート') !== -1) return 'サポート'
  return 'ホロメン' // ホロメン／Buzzホロメンなど、それ以外は現行の項目セットを使用
}

export type RatingItem = { key: RatingKey; label: string }

// カードタイプに応じて、実際にレーダーチャートへ表示する項目（キー・ラベル）だけを返す
export function getActiveRatingItems(cardType: string | null): RatingItem[] {
  const labels = RATING_LABELS_BY_TYPE[getRatingCategory(cardType)]
  return RATING_KEYS
    .filter((k) => labels[k] !== null)
    .map((k) => ({ key: k, label: labels[k] as string }))
}

export type RatingSummary = {
  sum: number
  enteredCount: number
  totalItems: number
  maxSum: number
  avg: number
  score10: number
}

// 項目数がカードタイプによって異なる（5〜6項目）ため、合計・平均に加えて
// 「10段階の相対評価点」を算出する（平均点(5点満点)を単純に2倍して10点満点に換算）
export function computeRatingSummary(
  rating: Card['rating_json'] | null | undefined,
  cardType: string | null
): RatingSummary {
  const items = getActiveRatingItems(cardType)
  let sum = 0
  let enteredCount = 0
  items.forEach((it) => {
    const raw = rating ? rating[it.key] : undefined
    if (raw !== undefined && raw !== null && (raw as unknown as string) !== '') {
      const v = Number(raw)
      if (!isNaN(v)) {
        sum += v
        enteredCount++
      }
    }
  })
  const totalItems = items.length
  const maxSum = totalItems * 5
  const avg = enteredCount > 0 ? sum / enteredCount : 0
  const score10 = enteredCount > 0 ? (avg / 5) * 10 : 0
  return { sum, enteredCount, totalItems, maxSum, avg, score10 }
}