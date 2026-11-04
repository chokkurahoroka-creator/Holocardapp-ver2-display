// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useEffect, useRef, useState } from 'react'
import { PlayfieldPanel } from '../components/PlayfieldPanel'
import { useVersusRoom, VERSUS_NAME_KEY } from '../hooks/useVersusRoom'
import { useRoleInfo } from '../hooks/useRoleInfo'
import { VersusLogin } from './VersusLogin'
import { buildRoomLink } from './roomLink'
import type { VersusSync } from './wire'

// 友達との対戦ページ：ルームを作る／コードで入る → 同じ盤面を、リアルタイムで共有して遊ぶ
export default function VersusApp() {
  const v = useVersusRoom()
  const { info: roleInfo, loading: roleLoading, signedIn, email } = useRoleInfo() // ルームを作れるのは、管理者・サブ管理者・メンバーだけ（参加・観戦は、誰でも）
  const { room, error, notice, busy } = v
  // 名前入りのリンク（?room=コード&name=名前）で開いたときは、その名前で、自動で入室する（大会で、参加者に配るリンク）
  const urlName = useRef(new URLSearchParams(window.location.search).get('name')?.trim().slice(0, 20) ?? '')
  const [name, setName] = useState(() => {
    if (urlName.current) return urlName.current
    try {
      return localStorage.getItem(VERSUS_NAME_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const urlCode = useRef(new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() ?? '')
  const [code, setCode] = useState(urlCode.current)

  const saveName = (n: string) => {
    setName(n)
    try {
      localStorage.setItem(VERSUS_NAME_KEY, n)
    } catch {
      /* 保存できなくても、そのまま続ける */
    }
  }

  // 前回のルームに、自動で戻る（再読み込みしたときなど）。招待URLで開いたときは、コードを入れて、名前を入れてもらう
  const triedRejoin = useRef(false)
  useEffect(() => {
    if (triedRejoin.current) return
    triedRejoin.current = true
    const last = v.lastCode()
    if (urlCode.current.length === 6 && urlName.current) void v.join(urlCode.current, urlName.current)
    else if (last && !urlCode.current) void v.join(last, name || 'プレイヤー')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 通知は、しばらくしたら消す
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(v.clearNotice, 5000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice])

  if (room) {
    const sync: VersusSync = {
      state: v.state,
      skillUsed: v.skillUsed,
      turn: v.turn,
      prep: v.prep,
      onChange: v.push,
      onEmit: v.emit,
      lastEvent: v.lastEvent,
      roomCode: room.code,
      shareUrl: buildRoomLink(room.code), // 表示サイト（display）の /versus のリンク
      myName: (room.seat === 'host' ? room.hostName : room.guestName) ?? '自分',
      oppName: (room.seat === 'host' ? room.guestName : room.hostName) ?? '相手',
      peerOnline: v.peerOnline,
      waiting: room.seat === 'host' && !room.guestName,
      onLeave: () => void v.leave(),
    }
    return (
      <>
        <PlayfieldPanel versus={sync} />
        {(notice || error) && (
          <div
            role="status"
            className={`fixed left-1/2 z-[90] w-[min(92vw,520px)] -translate-x-1/2 rounded-lg border px-3 py-2 text-xs shadow-lg ${error ? 'border-[#ff8a8a]/70 bg-[#2a0d0d]/95 text-[#ffd0d0]' : 'border-[#ffd76a]/70 bg-[#2a2208]/95 text-[#ffe9a8]'}`}
            style={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
            onClick={() => (error ? v.clearError() : v.clearNotice())}
          >
            {error || notice}
          </div>
        )}
      </>
    )
  }

  const canStart = name.trim().length > 0 && !busy
  return (
    <div className="min-h-screen px-4 py-8 flex justify-center">
      <div className="w-full max-w-md flex flex-col gap-4">
        <header>
          <h1 className="hud-font text-white text-xl font-bold">対戦ルーム</h1>
          <p className="text-xs text-[#9fc3ca] mt-1">ルームを作って、友達に招待URL（またはコード）を送ると、同じ盤面でリアルタイムに対戦できます。</p>
        </header>

        {!roleLoading && <VersusLogin info={roleInfo} signedIn={signedIn} email={email} />}

        <section className="hud-panel p-4 flex flex-col gap-3">
          <label className="text-xs text-[#9fc3ca]" htmlFor="versus-name">
            あなたの名前
          </label>
          <input id="versus-name" className="field w-full" value={name} maxLength={20} placeholder="例：うる" onChange={(e) => saveName(e.target.value)} />
        </section>

        <section className="hud-panel p-4 flex flex-col gap-2">
          <h2 className="hud-font text-white text-sm font-bold">ルームを作る</h2>
          {roleLoading || roleInfo.canCreateRoom ? (
            <>
              <p className="text-[11px] text-[#9fc3ca]">作ったあと、使うデッキを選んで、自分の側に置きます。</p>
              <button type="button" className="btn-primary" disabled={!canStart || roleLoading} onClick={() => void v.create(name.trim())}>
                {busy ? '準備中…' : 'ルームを作る'}
              </button>
            </>
          ) : (
            <p className="text-[11px] text-[#ffcf8a]" role="note">
              {roleInfo.role === 'temp'
                ? '臨時アカウントでは、ルームを作れません。ルームのコードやリンクを、もらって、下から入室してください。'
                : roleInfo.expired
                  ? 'アカウントの有効期限が切れています。'
                  : signedIn
                    ? 'このアカウントでは、ルームを作れません（メンバー以上のアカウントが必要です）。ルームのコードやリンクを、もらって、下から入室できます。'
                    : 'ルームを作るには、上の「アカウントでログイン」から、メンバー以上のアカウントでログインしてください（コードで入室するだけなら、ログインは、いりません）。'}
            </p>
          )}
        </section>

        <section className="hud-panel p-4 flex flex-col gap-2">
          <h2 className="hud-font text-white text-sm font-bold">コードで入る</h2>
          <input
            className="field w-full hud-mono tracking-[0.3em] text-center uppercase"
            value={code}
            maxLength={6}
            placeholder="ABC123"
            aria-label="ルームのコード"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="button" className="btn-secondary" disabled={!canStart || code.trim().length < 6} onClick={() => void v.join(code.trim(), name.trim())}>
            入室する
          </button>
        </section>

        {error && (
          <p role="alert" className="rounded-lg border border-[#ff8a8a]/60 bg-[#2a0d0d]/80 px-3 py-2 text-xs text-[#ffd0d0]">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}