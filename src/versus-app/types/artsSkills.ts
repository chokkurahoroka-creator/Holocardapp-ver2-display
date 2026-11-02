// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
export type YellCost = { color: string; count: number }

export type ArtRow = {
  name: string
  damage: string
  yellCost: YellCost[]
  specialAttackColor: string
  specialAttackDamage: string
  effectText: string
}

// powerCostは「推しスキル」「SP推しスキル」の時のみ使う（例: [ホロパワー:-2] → "2"）。それ以外は空文字のまま
export type SkillRow = { skillType: string; title: string; text: string; powerCost: string }

export const YELL_COLORS = ['白', '赤', '青', '緑', '紫', '黄', '無色']

// エール色 → 表示色（公開側の一覧画面と同じ色）
export const YELL_COLOR_HEX: Record<string, string> = {
  白: '#f2f2f2',
  赤: '#ff5a5a',
  青: '#4da3ff',
  緑: '#4cd68a',
  紫: '#b28ce3',
  黄: '#ffd76a',
  無色: '#9aa5a8',
}

// エール色 → 画像ファイル（public/images/ に配置）
export const YELL_IMAGE_FILE: Record<string, string> = {
  白: 'yell-white.png',
  赤: 'yell-red.png',
  青: 'yell-blue.png',
  緑: 'yell-green.png',
  紫: 'yell-purple.png',
  黄: 'yell-yellow.png',
  無色: 'yell-colorless.png',
}
export const SKILL_TYPES = [
  'ー',
  'コラボエフェクト',
  'ブルームエフェクト',
  'ギフト',
  'エクストラ',
  '推しスキル',
  'SP推しスキル',
  '推しステージスキル',
]

// パワーコストの項目を表示する対象のスキル種別
export const POWER_COST_SKILL_TYPES = ['推しスキル', 'SP推しスキル']

// 新規追加時のみ「無色1」をデフォルトでセットする（サポートカードはエールコスト自体を使わないので空配列）
export function emptyArt(isSupport: boolean): ArtRow {
  return {
    name: '',
    damage: '',
    yellCost: isSupport ? [] : [{ color: '無色', count: 1 }],
    specialAttackColor: '',
    specialAttackDamage: '',
    effectText: '',
  }
}

export function emptySkill(): SkillRow {
  return { skillType: SKILL_TYPES[0], title: '', text: '', powerCost: '' }
}