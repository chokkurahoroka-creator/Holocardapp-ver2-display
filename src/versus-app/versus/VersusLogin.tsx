// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL, type RoleInfo } from '../utils/roles'

// 対戦ページの、ログイン欄。ルームを作る・自分のデッキを使うには、アカウントでのログインが必要（コードでの入室・観戦は、ログインなしで、できる）。
// 管理画面でも、公開サイト（display）でも、同じ部品が使える

export function VersusLogin({ info, signedIn, email }: { info: RoleInfo; signedIn: boolean; email: string }) {
  const [open, setOpen] = useState(false)
  const [mail, setMail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: mail.trim(), password })
    if (err) {
      // 期限切れの臨時アカウントは、サーバー側の設定（Custom Access Token Hook）が、理由つきで、断る
      setError(/期限|expired/i.test(err.message) ? err.message : 'メールアドレスか、パスワードが、正しくありません')
    } else {
      setPassword('')
      setOpen(false)
    }
    setBusy(false)
  }

  if (signedIn) {
    const label = info.role ? ROLE_LABEL[info.role] + (info.role === 'member' ? `（グレード${info.grade}）` : '') : info.expired ? '有効期限切れ' : '一般'
    return (
      <section className="hud-panel p-3 flex items-center gap-2 text-xs" aria-label="ログイン中のアカウント">
        <div className="min-w-0 flex-1">
          <p className="truncate text-white">{info.displayName || email}</p>
          <p className="text-[#9fc3ca]">
            ログイン中：<span className={info.expired ? 'text-[#ffcf8a]' : 'text-[#4ce0e6]'}>{label}</span>
          </p>
        </div>
        <button type="button" className="btn-secondary !px-3 !py-1 text-xs" onClick={() => void supabase.auth.signOut()}>
          ログアウト
        </button>
      </section>
    )
  }

  return (
    <section className="hud-panel p-3 text-xs">
      <button type="button" className="flex w-full items-center gap-2 text-left text-[#d7eef2]" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="font-bold">アカウントでログイン</span>
        <span className="text-[#9fc3ca]">（ルームを作る・自分のデッキを使うとき）</span>
        <span className="ml-auto text-[#9fc3ca]" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <form onSubmit={handleLogin} className="mt-3 flex flex-col gap-2">
          <input className="field w-full" type="email" required autoComplete="username" placeholder="メールアドレス" value={mail} onChange={(e) => setMail(e.target.value)} aria-label="メールアドレス" />
          <input className="field w-full" type="password" required autoComplete="current-password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="パスワード" />
          <button type="submit" className="btn-primary" disabled={busy || !mail.trim() || !password}>
            {busy ? 'ログイン中…' : 'ログイン'}
          </button>
          {error && (
            <p role="alert" className="text-[#ffb0b0]">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  )
}