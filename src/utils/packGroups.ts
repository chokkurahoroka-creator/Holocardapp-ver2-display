import { setLabel } from './setLabel'
import type { PackSet, SetInfo } from '../types/card'

// 「新着カード」を表す、特別なグループのキー（パックの選択リストの先頭に出す）
export const RECENT_GROUP_KEY = '__recent__'

// 公開側で「ひとまとまり」として扱うパックのグループ。
// パックセットに入れたパックは1つのグループにまとめ、入れていないパックは1パックだけのグループにする。
export type PackGroup = {
  key: string // パックセットは "ps:<id>"、単独パックはその弾コード
  name: string
  imageUrl: string | null
  sets: SetInfo[] // グループに含まれるパック（弾コードの小さい順）。先頭が代表パック（空き枠を表示する対象）
}

const byCode = (a: SetInfo, b: SetInfo) => a.set_code.localeCompare(b.set_code, undefined, { numeric: true })

export function packSetKey(id: number): string {
  return `ps:${id}`
}

// 弾（パック）の一覧から、グループの一覧を作る。onlyPublic のときは公開中のパックだけを対象にする
export function buildPackGroups(sets: SetInfo[], packSets: PackSet[], opts: { onlyPublic: boolean }): PackGroup[] {
  const packSetById = new Map(packSets.map((p) => [p.id, p]))
  const groups = new Map<string, PackGroup>()

  sets
    .filter((s) => !opts.onlyPublic || s.status === '公開中')
    .slice()
    .sort(byCode)
    .forEach((s) => {
      const ps = s.pack_set_id != null ? packSetById.get(s.pack_set_id) : undefined
      const key = ps ? packSetKey(ps.id) : s.set_code
      const existing = groups.get(key)
      if (existing) {
        existing.sets.push(s)
        if (!existing.imageUrl) existing.imageUrl = s.pack_image_url
      } else {
        groups.set(key, {
          key,
          // 一覧には弾コード（パック番号）を出さず、パックの名前だけを表示する
          name: ps ? ps.name : setLabel(s),
          imageUrl: s.pack_image_url,
          sets: [s],
        })
      }
    })

  // 並びは、含まれる弾コードの小さい順（名前に弾コードを入れなくなったため、名前順ではなくコード順にする）
  return Array.from(groups.values()).sort((a, b) => byCode(a.sets[0]!, b.sets[0]!))
}

// 初めて開いたときに選ぶグループ：管理画面のパック管理で「デフォルト」にしたパックを含むグループ。無ければ「新着カード」
export function defaultGroupKey(groups: PackGroup[]): string {
  return groups.find((g) => g.sets.some((s) => s.default_flag))?.key ?? RECENT_GROUP_KEY
}

// 保存されていた選択（以前の版では弾コード）を、今のグループのキーに直す。該当が無ければ null
export function resolveGroupKey(stored: string | null, groups: PackGroup[]): string | null {
  if (!stored) return null
  const direct = groups.find((g) => g.key === stored)
  if (direct) return direct.key
  const byMember = groups.find((g) => g.sets.some((s) => s.set_code === stored))
  return byMember ? byMember.key : null
}

// 弾コード → 所属グループ（全カード検索の区切り用。非公開のパックも含めて全弾を対象にする）
export function groupInfoBySetCode(sets: SetInfo[], packSets: PackSet[]): Map<string, { key: string; name: string }> {
  const info = new Map<string, { key: string; name: string }>()
  buildPackGroups(sets, packSets, { onlyPublic: false }).forEach((g) => {
    g.sets.forEach((s) => info.set(s.set_code, { key: g.key, name: g.name }))
  })
  return info
}