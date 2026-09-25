import { supabase } from './supabase'
import type { Card } from '../types/card'

export type EventType = 'view' | 'favorite' | 'download' | 'search' | 'visit'

function detectDevice(): string {
  const ua = navigator.userAgent
  if (/iPad|Tablet/i.test(ua)) return 'タブレット'
  if (/Mobi|Android|iPhone/i.test(ua)) return 'スマートフォン'
  return 'PC'
}

function detectBrowser(): string {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'
  if (/Firefox\//.test(ua)) return 'Firefox'
  return 'その他'
}

// 記録に失敗してもユーザー体験に影響させないよう、エラーは握りつぶす（表示は継続する）
export function logEvent(
  eventType: EventType,
  extra?: { set_code?: string; type?: string; slot?: number; card_name?: string; query?: string }
) {
  supabase
    .from('events')
    .insert({ event_type: eventType, device: detectDevice(), browser: detectBrowser(), ...extra })
    .then(({ error }) => {
      if (error) console.warn('logEvent失敗:', error.message)
    })
}

// 一括ダウンロード時、選択したカード全件のdownloadイベントを1回のinsertでまとめて記録する
export function logDownloadEvents(cards: Card[]) {
  if (!cards.length) return
  const device = detectDevice()
  const browser = detectBrowser()
  supabase
    .from('events')
    .insert(cards.map((c) => ({ event_type: 'download' as const, device, browser, set_code: c.set_code, type: c.type, slot: c.slot, card_name: c.card_name })))
    .then(({ error }) => {
      if (error) console.warn('logDownloadEvents失敗:', error.message)
    })
}