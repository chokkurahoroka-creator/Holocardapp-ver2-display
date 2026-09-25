import type { Card } from '../types/card'

// GAS版と同じ setCode__type__slot 形式のキー
export function cardKey(c: Pick<Card, 'set_code' | 'type' | 'slot'>): string {
  return `${c.set_code}__${c.type}__${c.slot}`
}