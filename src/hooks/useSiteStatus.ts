import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type PageStatus = '公開' | '作業中' | '非公開'
export type SiteStatusMap = Record<string, PageStatus>

// GAS版のPAGE_STATUS_DEFAULTに相当。取得失敗時・未設定時のフォールバック
const DEFAULT_STATUS: SiteStatusMap = { display: '公開', cardpool: '公開' }

export function useSiteStatus() {
  const [status, setStatus] = useState<SiteStatusMap>(DEFAULT_STATUS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('site_status')
      .select('page_key, status')
      .then(({ data, error }) => {
        if (error) {
          console.error(error)
          setLoading(false)
          return
        }
        if (data && data.length) {
          const map: SiteStatusMap = { ...DEFAULT_STATUS }
          data.forEach((row) => {
            map[row.page_key as string] = row.status as PageStatus
          })
          setStatus(map)
        }
        setLoading(false)
      })
  }, [])

  return { status, loading }
}