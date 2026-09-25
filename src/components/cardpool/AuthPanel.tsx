import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'

export function AuthPanel() {
  const { signUp, signIn } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const { error } = mode === 'signup' ? await signUp(email, password) : await signIn(email, password)
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(mode === 'signup' ? '確認メールを送信しました。メール内のリンクを開いてからログインしてください。' : '')
  }

  return (
    <div className="max-w-sm mx-auto mt-16 rounded-xl border border-[#d4af6a]/20 bg-[#1a1305] p-6 text-white">
      <h2 className="text-base font-bold mb-4">
        {mode === 'signup' ? '新規登録' : 'ログイン'}（カードプール・デッキ管理）
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded bg-black/30 border border-[#d4af6a]/30 px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="パスワード（6文字以上）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="rounded bg-black/30 border border-[#d4af6a]/30 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-[#d4af6a] text-[#1a1305] font-bold py-2 text-sm disabled:opacity-50"
        >
          {busy ? '処理中...' : mode === 'signup' ? '登録する' : 'ログイン'}
        </button>
      </form>
      <button
        onClick={() => {
          setMode(mode === 'signup' ? 'signin' : 'signup')
          setMessage('')
        }}
        className="mt-3 text-xs text-[#9aa5c0] underline"
      >
        {mode === 'signup' ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントをお持ちでない方はこちら'}
      </button>
      {message && <p className="mt-3 text-xs text-[#d4af6a]">{message}</p>}
    </div>
  )
}