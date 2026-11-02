// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getRoleInfo, type RoleInfo } from '../utils/roles'

// 今ログインしているアカウントの種類（画面の出し分け用）。ログイン・ログアウトに、追従する
//   signedIn … アカウントでログインしている（匿名ログインは、含めない）
export function useRoleInfo(): { info: RoleInfo; loading: boolean; signedIn: boolean; email: string } {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return { info: getRoleInfo(user), loading, signedIn: !!user && !user.is_anonymous, email: user?.email ?? '' }
}