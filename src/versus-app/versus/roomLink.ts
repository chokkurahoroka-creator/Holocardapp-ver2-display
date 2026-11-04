// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
// 対戦ルームのリンク。すべて、表示サイト（display）の「/versus」のものに、そろえる。
//   形：https://（displayのURL）/versus?room=ABC123（&name=名前）
// ・管理画面から作るリンクの、もとになる displayのURL は、環境変数 VITE_DISPLAY_URL（.env）か、管理画面で保存したURLから取る
// ・どちらも無いとき、管理画面では「未設定」として、リンクを出さない（管理画面自身のURLを、間違って配らないため）。
//   対戦ページ（display の中）では、いま開いているサイトのURLを使う（そこが display だから）

const SAVED_KEY = 'horoka-admin:displayUrl'
export const VERSUS_PATH = '/versus'

export type DisplayBaseSource = 'env' | 'saved' | 'origin'
export type DisplayBase = { base: string; source: DisplayBaseSource }

// 入力された URL を、「https://example.com」の形（末尾の / ・ /versus ・ /versus.html を除く）にそろえる。URL として読めないときは null
export function normalizeDisplayBase(raw: string | null | undefined): string | null {
  let s = (raw ?? '').trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const path = u.pathname.replace(/\/+$/, '').replace(/\/versus(\.html)?$/i, '')
    return `${u.origin}${path}`
  } catch {
    return null
  }
}

export function savedDisplayBase(): string | null {
  try {
    return normalizeDisplayBase(localStorage.getItem(SAVED_KEY))
  } catch {
    return null
  }
}

export function saveDisplayBase(raw: string): string | null {
  const base = normalizeDisplayBase(raw)
  try {
    if (base) localStorage.setItem(SAVED_KEY, base)
    else localStorage.removeItem(SAVED_KEY)
  } catch {
    /* 保存できなくても、そのまま続ける */
  }
  return base
}

export function getDisplayBase(): DisplayBase {
  const env = normalizeDisplayBase(import.meta.env.VITE_DISPLAY_URL as string | undefined)
  if (env) return { base: env, source: 'env' }
  const saved = savedDisplayBase()
  if (saved) return { base: saved, source: 'saved' }
  return { base: window.location.origin, source: 'origin' }
}

// ルームのリンク（base を省くと、getDisplayBase() のもの）
export function buildRoomLink(code: string, opts: { name?: string; base?: string } = {}): string {
  const base = opts.base ?? getDisplayBase().base
  const q = new URLSearchParams({ room: code.trim().toUpperCase() })
  if (opts.name?.trim()) q.set('name', opts.name.trim())
  return `${base}${VERSUS_PATH}?${q.toString()}`
}

export type LinkCheck = { ok: boolean; problems: string[] }

// リンクが、display の /versus のものか、確かめる
export function checkRoomLink(url: string, base: string, adminOrigin: string = window.location.origin): LinkCheck {
  const problems: string[] = []
  let u: URL | null = null
  try {
    u = new URL(url)
  } catch {
    return { ok: false, problems: ['URLとして読めません'] }
  }
  const b = normalizeDisplayBase(base)
  if (!b) problems.push('表示サイト（display）のURLが、設定されていません')
  else {
    const bu = new URL(b)
    if (u.origin !== bu.origin) problems.push(`表示サイトのURL（${bu.origin}）と、リンクのサイトが違います（${u.origin}）`)
    if (bu.origin === adminOrigin) problems.push('管理画面のURLが、表示サイトのURLとして、設定されています')
  }
  if (u.pathname !== VERSUS_PATH) problems.push(`パスが「${VERSUS_PATH}」ではありません（${u.pathname}）`)
  if (!/^[A-Z0-9]{6}$/.test(u.searchParams.get('room') ?? '')) problems.push('ルームのコード（room=）が、6文字の英数字ではありません')
  return { ok: problems.length === 0, problems }
}

// 表示サイトの /versus に、つながるか確かめる（CORS で中身は読めないが、サイトに届くかは、わかる）
export async function probeDisplayVersus(base: string, timeoutMs = 7000): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    await fetch(`${base}${VERSUS_PATH}`, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
    return true
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}