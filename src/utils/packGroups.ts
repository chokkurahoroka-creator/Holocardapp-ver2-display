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
  releaseDate?: string | null // グループ内で、いちばん新しい発売日（YYYY-MM-DD）。未設定なら null
  packType?: string | null // パックの種類（グループ内の最初に入力のあるもの）
  sets: SetInfo[] // グループに含まれるパック（弾コードの小さい順）。先頭が代表パック（空き枠を表示する対象）
}

const byCode = (a: SetInfo, b: SetInfo) => a.set_code.localeCompare(b.set_code, undefined, { numeric: true })

// パックの並べ方。code: 弾コード順 / type: 種類順（パックの種類 → 弾コード）/ release: 発売日が新しい順
export type PackOrder = 'code' | 'type' | 'release'

type PackMeta = { releaseDate?: string | null; packType?: string | null; code: string }

const codeCmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

// パックの並び替えの比較。発売日が未設定のパックは、発売日順のときは最後（弾コードの大きい順）、種類が未設定のパックは、種類順のときは最後
export function comparePackMeta(order: PackOrder): (a: PackMeta, b: PackMeta) => number {
  return (a, b) => {
    if (order === 'release') {
      const da = a.releaseDate || ''
      const db = b.releaseDate || ''
      if (da !== db) {
        if (!da) return 1
        if (!db) return -1
        return db.localeCompare(da) // 新しい順
      }
      return codeCmp(b.code, a.code) // 同じ発売日（または、どちらも未設定）は、弾コードの大きい（新しい）順
    }
    if (order === 'type') {
      const ta = (a.packType || '').trim()
      const tb = (b.packType || '').trim()
      if (ta !== tb) {
        if (!ta) return 1
        if (!tb) return -1
        return ta.localeCompare(tb, 'ja')
      }
    }
    return codeCmp(a.code, b.code)
  }
}

export function packSetKey(id: number): string {
  return `ps:${id}`
}

// 弾（パック）の一覧から、グループの一覧を作る。onlyPublic のときは公開中のパックだけを対象にする
export function buildPackGroups(sets: SetInfo[], packSets: PackSet[], opts: { onlyPublic: boolean; order?: PackOrder }): PackGroup[] {
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
        if (s.release_date && (!existing.releaseDate || s.release_date > existing.releaseDate)) existing.releaseDate = s.release_date
        if (!existing.packType && s.pack_type) existing.packType = s.pack_type
      } else {
        groups.set(key, {
          key,
          // 一覧には弾コード（パック番号）を出さず、パックの名前だけを表示する
          name: ps ? ps.name : setLabel(s),
          imageUrl: s.pack_image_url,
          releaseDate: s.release_date || null,
          packType: s.pack_type || null,
          sets: [s],
        })
      }
    })

  // 並びは、既定では含まれる弾コードの小さい順（名前に弾コードを入れなくなったため、名前順ではなくコード順にする）。
  // order を指定したときは、種類順・発売日順（新しい順）にする
  const cmp = comparePackMeta(opts.order ?? 'code')
  return Array.from(groups.values()).sort((a, b) => cmp({ releaseDate: a.releaseDate, packType: a.packType, code: a.sets[0]!.set_code }, { releaseDate: b.releaseDate, packType: b.packType, code: b.sets[0]!.set_code }))
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
export type PackGroupInfo = { key: string; name: string; releaseDate: string | null; packType: string | null }

export function groupInfoBySetCode(sets: SetInfo[], packSets: PackSet[]): Map<string, PackGroupInfo> {
  const info = new Map<string, PackGroupInfo>()
  buildPackGroups(sets, packSets, { onlyPublic: false }).forEach((g) => {
    g.sets.forEach((s) => info.set(s.set_code, { key: g.key, name: g.name, releaseDate: g.releaseDate ?? null, packType: g.packType ?? null }))
  })
  return info
}