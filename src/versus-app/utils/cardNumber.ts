// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
// カード番号の末尾の数字だけを+1する（先頭の文字列・ゼロ埋め桁数は維持。例: "038" -> "039"）
export function incrementNumberString(str: string): string {
  const s = String(str || '')
  const m = s.match(/^(.*?)(\d+)$/)
  if (!m) return s
  const digits = m[2]
  const next = String(Number(digits) + 1).padStart(digits.length, '0')
  return m[1] + next
}

// カード番号を、数字の部分が3桁になるようにそろえる（"2" → "002"、"10" → "010"、"038" → "038"）。
// 全角の数字も、半角にする。先頭の数字の並びだけをそろえるので、後ろに文字が付く番号も、そのまま使える
export function padCardNumber(str: string | null | undefined): string {
const s = String(str ?? '').trim().normalize('NFKC')
return s.replace(/^\d+/, (d) => d.padStart(3, '0'))
}

// オリジナル番号（"hBP01-4" など）の、いちばん後ろの「-」より右側の数字を、3桁にそろえる（"hBP01-4" → "hBP01-004"）
export function padOriginalNumber(str: string | null | undefined): string {
const s = String(str ?? '').trim().normalize('NFKC')
return s.replace(/-(\d+)([^-]*)$/, (_m, d: string, rest: string) => `-${d.padStart(3, '0')}${rest}`)
}