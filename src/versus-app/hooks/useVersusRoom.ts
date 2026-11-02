// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { emptyState, initialTurn, swapTurn, type PlayState, type TurnState } from '../utils/playfield'
import type { DeckCard } from '../utils/deckImage'
import { emptyWire, fromWire, swapSides, swapSkillKeys, swapZoneId, toWire, turnFromWire, wireCardIds, type RemoteEvent, type RemoteEventInput, type WireDoc } from '../versus/wire'

const COLUMNS = 'id, set_code, type, slot, card_name, card_type, attribute, stage, rarity, card_number, image_url'
const LAST_CODE_KEY = 'horoka-versus:lastCode'
export const VERSUS_NAME_KEY = 'horoka-versus:name'

type Row = {
  id: string
  code: string
  host_id: string
  guest_id: string | null
  host_name: string
  guest_name: string | null
  state: unknown
  version: number
  status: string
}

export type VersusRoom = { id: string; code: string; seat: 'host' | 'guest'; hostName: string; guestName: string | null }

// 匿名ログインに失敗したときの、原因の説明（Supabase が返した、本当のエラーも、あわせて出す）
function explainAnonymousError(err: { code?: string; status?: number; message?: string } | null): string {
  const raw = `${err?.code ?? err?.status ?? ''} ${err?.message ?? ''}`.trim()
  const code = err?.code ?? ''
  const msg = (err?.message ?? '').toLowerCase()
  let hint = ''
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) {
    hint = 'Supabase の Authentication で「Allow new users to sign up」がOFFのため、匿名ログイン（新しいユーザーの作成）も止められています。'
  } else if (code === 'anonymous_provider_disabled' || msg.includes('anonymous sign-ins are disabled')) {
    hint = '「Allow anonymous sign-ins」がOFFです。ONにして、「Save changes」を押してください。'
  } else if (code.startsWith('captcha') || msg.includes('captcha')) {
    hint = 'CAPTCHA（ボット対策）が有効になっています。匿名ログインでは、CAPTCHAの確認が必要です。'
  } else if (code === 'over_request_rate_limit' || msg.includes('rate limit')) {
    hint = '短時間にログインが多すぎて、制限されています。しばらく待ってから、もう一度お試しください。'
  }
  return `匿名ログインできませんでした。${hint}${raw ? `（Supabase からの応答：${raw}）` : ''}`
}

// 友達との対戦ルーム：作成・入室・盤面の同期（Supabase Realtime）。
// 盤面は、ルームに保存した「ホスト向き」の状態が正本。更新は、版番号つき（同時に操作して重なったら、あとから送った側が取り直す）
export function useVersusRoom() {
  const [room, setRoom] = useState<VersusRoom | null>(null)
  const [state, setState] = useState<PlayState>(emptyState)
  const [skillUsed, setSkillUsed] = useState<Record<string, boolean>>({})
  const [turn, setTurn] = useState<TurnState>(initialTurn)
  const [peerOnline, setPeerOnline] = useState(false)
  const [lastEvent, setLastEvent] = useState<RemoteEvent | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const roomRef = useRef<VersusRoom | null>(null)
  const stateRef = useRef<PlayState>(state)
  const skillRef = useRef<Record<string, boolean>>({})
  const turnRef = useRef<TurnState>(initialTurn())
  const versionRef = useRef(-1)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const cardCache = useRef<Map<number, DeckCard>>(new Map())
  const inFlight = useRef(false)
  const pending = useRef(false)
  const eventSeq = useRef(0)

  // ---- カード情報の補完 ----
  const ensureCards = useCallback(async (ids: number[]) => {
    const missing = ids.filter((id) => !cardCache.current.has(id))
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100)
      const { data, error: err } = await supabase.from('cards_list').select(COLUMNS).in('id', chunk)
      if (err) throw new Error(`カード情報を取得できませんでした：${err.message}`)
      ;(data as unknown as DeckCard[]).forEach((c) => cardCache.current.set(c.id, c))
    }
  }, [])

  // ---- ルームの内容を、画面に反映する ----
  const applyRow = useCallback(
    async (row: Row, force = false) => {
      const doc: WireDoc = row.state && (row.state as WireDoc).v === 1 ? (row.state as WireDoc) : emptyWire()
      await ensureCards(wireCardIds(doc))
      if (!force && row.version <= versionRef.current) return
      versionRef.current = row.version
      const seat = roomRef.current?.seat ?? 'host'
      let st = fromWire(doc, cardCache.current)
      let su = doc.su
      if (seat === 'guest') {
        st = swapSides(st)
        su = swapSkillKeys(su)
      }
      stateRef.current = st
      skillRef.current = su
      const tn = turnFromWire(doc, seat === 'guest')
      turnRef.current = tn
      setState(st)
      setSkillUsed(su)
      setTurn(tn)
      setRoom((r) => (r ? { ...r, hostName: row.host_name, guestName: row.guest_name } : r))
    },
    [ensureCards]
  )

  const refetch = useCallback(async () => {
    const r = roomRef.current
    if (!r) return
    const { data, error: err } = await supabase.from('versus_rooms').select('*').eq('id', r.id).maybeSingle()
    if (err || !data) return
    const row = data as Row
    if (row.status === 'closed') {
      setError('ホストが退出したため、ルームが閉じられました')
      return
    }
    await applyRow(row, true)
  }, [applyRow])

  // ---- 盤面の変更を、ルームへ保存する（連続した操作は、まとめて、順番に送る） ----
  const flush = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      while (pending.current) {
        pending.current = false
        const r = roomRef.current
        if (!r) break
        const guest = r.seat === 'guest'
        const doc = toWire(guest ? swapSides(stateRef.current) : stateRef.current, guest ? swapSkillKeys(skillRef.current) : skillRef.current, guest ? swapTurn(turnRef.current) : turnRef.current)
        const { data, error: err } = await supabase.rpc('versus_update_state', { p_room: r.id, p_expected: versionRef.current, p_state: doc })
        if (err) {
          setError(err.message)
          break
        }
        if (data === -1) {
          // 相手の操作が、先に保存されていた：最新の盤面に取り直す（いまの操作は、取り消される）
          pending.current = false
          await refetch()
          setNotice('相手の操作と重なったため、最新の盤面に戻しました。もう一度操作してください')
          break
        }
        versionRef.current = data as number
      }
    } finally {
      inFlight.current = false
    }
  }, [refetch])

  const push = useCallback(
    (next: PlayState, skills?: Record<string, boolean>, tn?: TurnState) => {
      for (const id of Object.keys(next) as (keyof PlayState)[]) next[id].forEach((c) => cardCache.current.set(c.card.id, c.card))
      stateRef.current = next
      setState(next)
      if (skills) {
        skillRef.current = skills
        setSkillUsed(skills)
      }
      if (tn) {
        turnRef.current = tn
        setTurn(tn)
      }
      pending.current = true
      void flush()
    },
    [flush]
  )

  const emit = useCallback((ev: RemoteEventInput) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ev', payload: ev })
  }, [])

  // ---- 相手から届いた出来事（向きを、こちらから見た向きに直す） ----
  const handleRemote = useCallback((payload: RemoteEventInput) => {
    const id = ++eventSeq.current
    if (payload.kind === 'dice') setLastEvent({ id, kind: 'dice', n: payload.n })
    else if (payload.kind === 'janken') setLastEvent({ id, kind: 'janken', hand: payload.hand })
    else if (payload.kind === 'fx') {
      const fx = payload.fx
      setLastEvent({ id, kind: 'fx', fx: fx.kind === 'shuffle' ? { kind: 'shuffle', zone: swapZoneId(fx.zone) } : { kind: fx.kind, from: swapZoneId(fx.from), to: swapZoneId(fx.to), card: fx.card } })
    }
  }, [])

  // ---- リアルタイム接続 ----
  const closeChannel = useCallback(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    setPeerOnline(false)
  }, [])

  const subscribe = useCallback(
    (r: VersusRoom) => {
      closeChannel()
      const ch = supabase.channel(`versus:${r.id}`, { config: { presence: { key: r.seat }, broadcast: { self: false } } })
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'versus_rooms', filter: `id=eq.${r.id}` }, (payload) => {
        const row = payload.new as Row
        // 自分の保存中は、自分の更新が戻ってきているだけ（保存の結果で、版番号が決まる）
        if (inFlight.current || pending.current) return
        if (row.status === 'closed') {
          setError('ホストが退出したため、ルームが閉じられました')
          return
        }
        void applyRow(row).catch((e: Error) => setError(e.message))
      })
      ch.on('presence', { event: 'sync' }, () => {
        const other = r.seat === 'host' ? 'guest' : 'host'
        setPeerOnline((ch.presenceState()[other] ?? []).length > 0)
      })
      ch.on('broadcast', { event: 'ev' }, ({ payload }) => handleRemote(payload as RemoteEventInput))
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void ch.track({ seat: r.seat })
          void refetch() // 切断中に、見逃した更新を取り戻す
        }
      })
      channelRef.current = ch
    },
    [applyRow, closeChannel, handleRemote, refetch]
  )

  // 画面に戻ってきたときも、最新の盤面に取り直す（スマホで、別のアプリへ行ったあとなど）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refetch])

  useEffect(() => closeChannel, [closeChannel])

  // ---- ログイン（友達は、匿名で入る） ----
  const ensureSession = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session.user.id
    const { data: d, error: err } = await supabase.auth.signInAnonymously()
    if (err || !d.user) throw new Error(explainAnonymousError(err))
    return d.user.id
  }

  const enter = useCallback(
    async (row: Row, uid: string) => {
      const r: VersusRoom = { id: row.id, code: row.code, seat: row.host_id === uid ? 'host' : 'guest', hostName: row.host_name, guestName: row.guest_name }
      roomRef.current = r
      versionRef.current = -1
      setRoom(r)
      await applyRow(row, true)
      subscribe(r)
      try {
        localStorage.setItem(LAST_CODE_KEY, r.code)
      } catch {
        /* 保存できなくても、そのまま続ける */
      }
    },
    [applyRow, subscribe]
  )

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const create = (name: string) =>
    run(async () => {
      const uid = await ensureSession()
      const { data, error: err } = await supabase.rpc('versus_create_room', { p_name: name })
      if (err) throw new Error(err.message)
      await enter(data as Row, uid)
    })

  const join = (code: string, name: string) =>
    run(async () => {
      const uid = await ensureSession()
      const { data, error: err } = await supabase.rpc('versus_join_room', { p_code: code, p_name: name })
      if (err) throw new Error(err.message)
      await enter(data as Row, uid)
    })

  const leave = async () => {
    const r = roomRef.current
    closeChannel()
    roomRef.current = null
    setRoom(null)
    setState(emptyState())
    setSkillUsed({})
    setTurn(initialTurn())
    pending.current = false
    try {
      localStorage.removeItem(LAST_CODE_KEY)
    } catch {
      /* 何もしない */
    }
    if (r) await supabase.rpc('versus_leave_room', { p_room: r.id })
  }

  // 前回のルームに、自動で戻る（再読み込みや、通信が切れたあと）
  const lastCode = () => {
    try {
      return localStorage.getItem(LAST_CODE_KEY) ?? ''
    } catch {
      return ''
    }
  }

  return { room, state, skillUsed, turn, peerOnline, lastEvent, error, notice, busy, create, join, leave, push, emit, lastCode, clearNotice: () => setNotice(''), clearError: () => setError('') }
}