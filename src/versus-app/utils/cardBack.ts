// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import type { ZoneKey } from './playfield'

// カードの裏側の見た目。置いてある場所（デッキ・エールデッキ・ライフ・パワー）に応じて、色と文字を変える
export type BackStyle = { label: string; from: string; to: string; border: string; text: string }

const BACKS: Partial<Record<ZoneKey, BackStyle>> = {
  deck: { label: 'デッキ', from: '#1d3d8f', to: '#0b1f4f', border: '#8fb4ff', text: '#bcd0ff' },
  yellDeck: { label: 'エール\nデッキ', from: '#0e7490', to: '#083344', border: '#67e8f9', text: '#cffafe' },
  life: { label: 'ライフ', from: '#be185d', to: '#500724', border: '#f9a8d4', text: '#fce7f3' },
  power: { label: 'パワー', from: '#7e22ce', to: '#2e1065', border: '#d8b4fe', text: '#f3e8ff' },
}

// 上のどれでもない場所（盤面で、裏返したカードなど）は、デッキと同じ色で、文字は無し
const DEFAULT_BACK: BackStyle = { label: '', from: '#1d3d8f', to: '#0b1f4f', border: '#8fb4ff', text: '#bcd0ff' }

export function backStyleOf(key?: ZoneKey): BackStyle {
  return (key && BACKS[key]) || DEFAULT_BACK
}