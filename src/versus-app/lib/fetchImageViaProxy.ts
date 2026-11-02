// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { supabase } from './supabase'

// 公式サイトの画像のURLから、画像ファイルを取得する（サーバーの /api/fetch-image 経由）
export async function fetchImageViaProxy(url: string): Promise<File> {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('ログインが必要です')

  const res = await fetch('/api/fetch-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ url }),
  })

  if (!res.ok) {
    // サーバーのエラーはJSON。関数が動いていない（ローカル開発など）ときは、本文が空・HTMLのことがある
    const text = await res.text()
    let message = ''
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? ''
    } catch {
      // JSONではない
    }
    throw new Error(message || `画像を取得できませんでした（HTTP ${res.status}）。サイトに公開した環境で試してください`)
  }

  const blob = await res.blob()
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image')
  return new File([blob], name, { type: blob.type })
}