// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 画面に出すパック名。表示名が入っていればそれを、無ければ弾名（フルネーム）を使う
export function setLabel(s: { set_name: string; display_name?: string | null }): string {
  return (s.display_name ?? '').trim() || s.set_name
}

export type SetInfo = {
  set_code: string
  set_name: string
  display_name?: string | null // 表示名（弾名が長いときに、画面に出す短い名前）。空なら弾名を使う
  total_new: number
  total_rerun: number
  total_parallel: number
  pack_image_url: string | null
  banner_image_url: string | null
  pack_type: string | null
  release_date: string | null
  status: '公開中' | '公開終了'
  cardpool_status: '公開中' | '公開終了'
  default_flag: boolean
  pack_set_id?: number | null // 所属するパックセット（未所属は null）
}

// 複数のパックをひとまとまりにして、公開側でグループ表示するためのパックセット
export type PackSet = {
  id: number
  name: string
}

export type SetFormValues = {
  set_code: string
  set_name: string
  display_name: string
  total_new: number
  total_rerun: number
  total_parallel: number
  pack_type: string
  release_date: string
  pack_image_url: string
  banner_image_url: string
  pack_set_id: number | null
}

export function useSetsAdmin() {
  const [sets, setSets] = useState<SetInfo[]>([])
  const [packSets, setPackSets] = useState<PackSet[]>([])
  // pack_sets テーブルが使えるか（SQL未実行の環境では false。その間は pack_set_id を保存対象に含めない）
  const [packSetsReady, setPackSetsReady] = useState(false)
  // sets.display_name 列が使えるか（SQL未実行の環境では false。その間は display_name を保存対象に含めない）
  const [displayNameReady, setDisplayNameReady] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('sets').select('*').order('set_code')
    if (error) console.error(error)
    setSets(data ?? [])

    const dn = await supabase.from('sets').select('display_name').limit(1)
    setDisplayNameReady(!dn.error)
    if (dn.error) console.warn('sets.display_name を取得できませんでした（SQL未実行の可能性があります）', dn.error.message)

    const ps = await supabase.from('pack_sets').select('id, name').order('name')
    if (ps.error) {
      console.warn('pack_sets を取得できませんでした（SQL未実行の可能性があります）', ps.error.message)
      setPackSets([])
      setPackSetsReady(false)
    } else {
      setPackSets((ps.data ?? []) as PackSet[])
      setPackSetsReady(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // 新しい画像URLが渡されなければ既存値を維持する（GAS版と同じ挙動）
  const saveSet = async (values: SetFormValues) => {
    const existing = sets.find((s) => s.set_code === values.set_code)
    const packImageUrl = values.pack_image_url || existing?.pack_image_url || null
    const bannerImageUrl = values.banner_image_url || existing?.banner_image_url || null

    const { error } = await supabase.from('sets').upsert(
      {
        set_code: values.set_code,
        set_name: values.set_name,
        total_new: values.total_new,
        total_rerun: values.total_rerun,
        total_parallel: values.total_parallel,
        pack_type: values.pack_type || null,
        release_date: values.release_date || null,
        pack_image_url: packImageUrl,
        banner_image_url: bannerImageUrl,
        status: existing?.status ?? '公開中',
        cardpool_status: existing?.cardpool_status ?? '公開中',
        default_flag: existing?.default_flag ?? false,
        ...(packSetsReady ? { pack_set_id: values.pack_set_id } : null),
        ...(displayNameReady ? { display_name: values.display_name.trim() || null } : null),
      },
      { onConflict: 'set_code' }
    )
    if (error) throw error
    await refresh()
  }

  const updateSetStatus = async (setCode: string, status: '公開中' | '公開終了') => {
    const { error } = await supabase.from('sets').update({ status }).eq('set_code', setCode)
    if (error) throw error
    setSets((prev) => prev.map((s) => (s.set_code === setCode ? { ...s, status } : s)))
  }

  const updateSetCardpoolStatus = async (setCode: string, cardpool_status: '公開中' | '公開終了') => {
    const { error } = await supabase.from('sets').update({ cardpool_status }).eq('set_code', setCode)
    if (error) throw error
    setSets((prev) => prev.map((s) => (s.set_code === setCode ? { ...s, cardpool_status } : s)))
  }

  // default_flagは1件だけtrueという前提なので、先に全件false→対象をtrueの2段階で更新する
  const setDefaultSet = async (setCode: string) => {
    const { error: clearError } = await supabase.from('sets').update({ default_flag: false }).neq('set_code', '')
    if (clearError) throw clearError
    const { error } = await supabase.from('sets').update({ default_flag: true }).eq('set_code', setCode)
    if (error) throw error
    setSets((prev) => prev.map((s) => ({ ...s, default_flag: s.set_code === setCode })))
  }

  // ----- パックセット -----
  const addPackSet = async (name: string) => {
    const { error } = await supabase.from('pack_sets').insert({ name })
    if (error) throw error
    await refresh()
  }

  const renamePackSet = async (id: number, name: string) => {
    const { error } = await supabase.from('pack_sets').update({ name }).eq('id', id)
    if (error) throw error
    await refresh()
  }

  // 削除すると、そのパックセットに入っていたパックは「セットに入っていない」状態（pack_set_id=null）に戻る
  const deletePackSet = async (id: number) => {
    const { error: clearError } = await supabase.from('sets').update({ pack_set_id: null }).eq('pack_set_id', id)
    if (clearError) throw clearError
    const { error } = await supabase.from('pack_sets').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  return {
    sets,
    packSets,
    packSetsReady,
    displayNameReady,
    loading,
    refresh,
    saveSet,
    updateSetStatus,
    updateSetCardpoolStatus,
    setDefaultSet,
    addPackSet,
    renamePackSet,
    deletePackSet,
  }
}