// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import type { User } from '@supabase/supabase-js'

// アカウントの種類。印は、auth.users の app_metadata（role／grade／expires_at）に入っている。
// 画面の出し分けは、この印を見て行う（本当の制限は、データベース・サーバー側が行う。画面は、使いやすさのための、出し分け）
export type Role = 'admin' | 'sub_admin' | 'member' | 'temp'
export type Grade = 1 | 2 | 3

export const ROLE_LABEL: Record<Role, string> = {
  admin: '管理者',
  sub_admin: 'サブ管理者',
  member: 'メンバー',
  temp: '臨時',
}

// メンバーのグレードごとの、デッキの上限
export const MEMBER_DECK_LIMIT: Record<Grade, number> = { 1: 6, 2: 10, 3: 20 }
export const TEMP_DECK_LIMIT = 1

export type RoleInfo = {
  role: Role | null // 権限なし（匿名・印がない・有効期限切れ）のときは null
  expired: boolean // 臨時アカウントの有効期限が、過ぎている
  grade: Grade
  expiresAt: string | null
  displayName: string
  isAdmin: boolean
  isStaff: boolean // 管理者・サブ管理者
  canCreateRoom: boolean // 対戦ルームを作れる（管理者・サブ管理者・メンバー）
  deckLimit: number | null // 作れるデッキの数（null ＝ 無制限）
}

const ROLES: readonly string[] = ['admin', 'sub_admin', 'member', 'temp']

export function getRoleInfo(user: User | null | undefined, now: number = Date.now()): RoleInfo {
  const meta = (user?.app_metadata ?? {}) as { role?: string; grade?: number | string; expires_at?: string; display_name?: string }
  const expiresAt = typeof meta.expires_at === 'string' ? meta.expires_at : null
  const expired = expiresAt !== null && now >= Date.parse(expiresAt)
  let role: Role | null = typeof meta.role === 'string' && ROLES.includes(meta.role) ? (meta.role as Role) : null
  if (user?.is_anonymous || expired) role = null

  const g = Number(meta.grade)
  const grade: Grade = g === 3 ? 3 : g === 2 ? 2 : 1
  const isStaff = role === 'admin' || role === 'sub_admin'
  return {
    role,
    expired,
    grade,
    expiresAt,
    displayName: typeof meta.display_name === 'string' ? meta.display_name : '',
    isAdmin: role === 'admin',
    isStaff,
    canCreateRoom: isStaff || role === 'member',
    deckLimit: isStaff ? null : role === 'member' ? MEMBER_DECK_LIMIT[grade] : role === 'temp' ? TEMP_DECK_LIMIT : 0,
  }
}

// 有効期限までの残り日数（切り上げ）。期限がないときは null
export function daysLeft(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null
  return Math.ceil((Date.parse(expiresAt) - now) / 86400000)
}