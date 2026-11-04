// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { mulliganDrawCount, preparingSide, HAND_SIZE, type PrepState, type Side } from '../utils/playfield'

// 対戦の準備（ターンが始まる前）の、画面。
//   1 デッキをセット → 2 じゃんけん → 3 勝った人が、先攻・後攻を決める → 4 先攻が準備（7枚引く・マリガン・ホロメンをセット）→ 準備完了
//   → 5 後攻が準備 → 準備完了 → 先攻のターンが始まる
// 準備をしていない側には、「先攻プレイヤー準備中」「後攻プレイヤー準備中」とだけ、画面いっぱいに出す（セットしたホロメンは、見せない）

const HANDS = [
  { hand: 0, emoji: '✊', name: 'グー' },
  { hand: 1, emoji: '✌️', name: 'チョキ' },
  { hand: 2, emoji: '✋', name: 'パー' },
]

export type PrepFlowProps = {
  prep: PrepState
  oppName: string
  // 1 デッキ
  deckSelect: ReactNode // デッキを選ぶ、セレクトボックス
  deckListReady: boolean
  canSetDeck: boolean // デッキが選ばれている
  deckPlaced: boolean // 自分の側に、推しとデッキが置かれている
  onSetDeck: () => void
  onDeckDone: () => void
  // 2 じゃんけん
  jankenMine: number | null
  jankenResult: { mine: number; theirs: number; outcome: 'win' | 'lose' | 'draw' } | null
  onJanken: (hand: number) => void
  // 3 先攻・後攻
  onChoose: (first: Side) => void
  // 4・5 準備
  handCount: number
  centerSet: boolean // センターに、ホロメンがいる
  onDraw: () => void
  onMulligan: () => void
  onReady: () => void
  // ルーム（相手を待っている間も、招待URLのコピーと、退出ができるように）
  roomCode: string
  shareUrl: string
  onLeave: () => void
}

// 画面いっぱいの準備の画面でも、ルームの「招待URLをコピー」と「退出」は、いつでも押せる
function RoomControls({ roomCode, shareUrl, onLeave }: { roomCode: string; shareUrl: string; onLeave: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <div className="fixed left-2 z-[101] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#4ce0e6]/60 bg-[#061217]/95 px-2.5 py-1.5 text-[12px] text-[#d7eef2] shadow-lg" style={{ top: 'calc(8px + env(safe-area-inset-top, 0px))' }}>
      <span className="hud-mono font-bold tracking-widest text-[#4ce0e6]">{roomCode}</span>
      <button type="button" className="underline text-[#9fc3ca]" onClick={copy}>
        {copied ? 'コピーしました' : '招待URLをコピー'}
      </button>
      <button
        type="button"
        className="text-[#ff8a8a]"
        onClick={() => {
          if (window.confirm('ルームを退出しますか？（ホストが退出すると、ルームは閉じられます）')) onLeave()
        }}
      >
        退出
      </button>
    </div>
  )
}

const Backdrop = ({ children, label, room }: { children: ReactNode; label: string; room: { roomCode: string; shareUrl: string; onLeave: () => void } }) =>
  createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#020a0f]/90 p-4">
      <RoomControls {...room} />
      <div className="w-full pt-10">{children}</div>
    </div>,
    document.body
  )

const Card = ({ step, title, children }: { step: string; title: string; children: ReactNode }) => (
  <div className="hud-panel mx-auto w-full max-w-md p-5 text-center" style={{ background: 'var(--hud-bg, #061217)' }}>
    <p className="hud-mono text-[11px] font-bold tracking-[0.4em] text-[#4ce0e6]">{step}</p>
    <h2 className="hud-font mb-3 mt-1 text-xl font-extrabold text-white">{title}</h2>
    {children}
  </div>
)

const Waiting = ({ text, sub, room }: { text: string; sub?: string; room: { roomCode: string; shareUrl: string; onLeave: () => void } }) => (
  <Backdrop label={text} room={room}>
    <div className="text-center">
      <p className="text-3xl font-extrabold text-white sm:text-4xl" style={{ textShadow: '0 0 18px #4ce0e6' }}>
        {text}
      </p>
      {sub && <p className="mt-3 text-sm text-[#9fc3ca]">{sub}</p>}
    </div>
  </Backdrop>
)

export function PrepFlow(p: PrepFlowProps) {
  const { prep } = p
  const room = { roomCode: p.roomCode, shareUrl: p.shareUrl, onLeave: p.onLeave }
  const who = preparingSide(prep)
  const firstLabel = (s: Side) => (prep.first === s ? '先攻' : '後攻')

  // ---- 1 デッキ ----
  if (prep.step === 'deck') {
    if (prep.deck.me) return <Waiting room={room} text="デッキをセットしました" sub={`${p.oppName}が、デッキをセットするのを待っています…`} />
    return (
      <Backdrop label="デッキをセット" room={room}>
        <Card step="対戦の準備 1/4" title="デッキをセット">
          {!p.deckListReady ? <p className="text-sm text-[#9fc3ca]">デッキを読み込んでいます…</p> : <div className="mb-3 flex justify-center">{p.deckSelect}</div>}
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-secondary" disabled={!p.canSetDeck} onClick={p.onSetDeck}>
              デッキを配置
            </button>
            <button type="button" className="btn-primary" disabled={!p.deckPlaced} onClick={p.onDeckDone} title={p.deckPlaced ? '' : '先に、デッキを配置してください'}>
              準備OK
            </button>
          </div>
          <p className="mt-3 text-xs text-[#9fc3ca]">推し・エールデッキ・デッキを置いて（シャッフル済み）、ライフが置かれます。{p.oppName}：{prep.deck.opp ? 'セット済み' : 'デッキを選んでいます'}</p>
        </Card>
      </Backdrop>
    )
  }

  // ---- 2 じゃんけん ----
  if (prep.step === 'janken') {
    return (
      <Backdrop label="じゃんけん" room={room}>
        <Card step="対戦の準備 2/4" title="じゃんけん">
          <p className="mb-3 text-sm text-[#d7eef2]">勝った人が、先攻・後攻を決めます。互いが手を出すと、結果が出ます。</p>
          <div className="mb-3 flex justify-center gap-3">
            {HANDS.map((h) => (
              <button key={h.hand} type="button" onClick={() => p.onJanken(h.hand)} aria-label={h.name} aria-pressed={p.jankenMine === h.hand} className="grid place-items-center rounded-full" style={{ width: 84, height: 84, fontSize: 44, background: 'radial-gradient(circle at 35% 30%, #fff, #cbd5e1)', border: `4px solid ${p.jankenMine === h.hand ? '#4ce0e6' : 'rgba(255,255,255,0.9)'}`, boxShadow: p.jankenMine === h.hand ? '0 0 0 3px #4ce0e6' : '0 3px 8px rgba(0,0,0,0.6)' }}>
                {h.emoji}
              </button>
            ))}
          </div>
          {p.jankenResult && (
            <p className="mb-1 text-lg font-bold" style={{ color: p.jankenResult.outcome === 'win' ? '#4ade80' : p.jankenResult.outcome === 'lose' ? '#f87171' : '#ffd76a' }}>
              {HANDS[p.jankenResult.mine]?.emoji} vs {HANDS[p.jankenResult.theirs]?.emoji}　{p.jankenResult.outcome === 'win' ? 'あなたの勝ち！' : p.jankenResult.outcome === 'lose' ? `${p.oppName}の勝ち` : 'あいこ！もう一度'}
            </p>
          )}
          <p className="text-xs text-[#9fc3ca]">{p.jankenMine !== null ? `${p.oppName}の手を待っています…（出したあとも、手は変えられます）` : '手を選んでください'}</p>
        </Card>
      </Backdrop>
    )
  }

  // ---- 3 先攻・後攻を決める ----
  if (prep.step === 'choose') {
    if (prep.jankenWinner !== 'me') return <Waiting room={room} text={`${p.oppName}が、先攻・後攻を選んでいます…`} />
    return (
      <Backdrop label="先攻・後攻を決める" room={room}>
        <Card step="対戦の準備 3/4" title="じゃんけんに勝ちました！">
          <p className="mb-3 text-sm text-[#d7eef2]">先攻・後攻を選んでください。</p>
          <div className="flex justify-center gap-3">
            <button type="button" className="btn-primary !px-6 !py-3 text-lg" onClick={() => p.onChoose('me')}>
              先攻
            </button>
            <button type="button" className="btn-secondary !px-6 !py-3 text-lg" onClick={() => p.onChoose('opp')}>
              後攻
            </button>
          </div>
        </Card>
      </Backdrop>
    )
  }

  // ---- 4・5 先攻・後攻の準備 ----
  if (who !== 'me') return <Waiting room={room} text={`${firstLabel(who ?? 'opp') === '先攻' ? '先攻' : '後攻'}プレイヤー準備中`} />

  const drawn = prep.drawn.me
  const times = prep.mulligan.me
  const nextDraw = mulliganDrawCount(times + 1)
  return (
    <div role="region" aria-label="準備" className="fixed left-2 right-2 z-[74] mx-auto flex max-w-2xl flex-col gap-1.5 rounded-lg border-2 border-[#4ce0e6] bg-[#061217]/95 px-3 py-2 text-xs text-[#d7eef2] shadow-lg" style={{ top: 'calc(62px + env(safe-area-inset-top, 0px))' }}>
      <p className="font-bold text-[#4ce0e6]">
        対戦の準備 4/4：あなた（{firstLabel('me')}）の準備{times > 0 ? `（マリガン ${times}回）` : ''}
      </p>
      <p>
        {!drawn ? `① デッキから${HAND_SIZE}枚を引いて、手札にします。` : '② 手札を見て、よければ、デッキに戻さず、このまま進めます。引き直したいときは、マリガン（手札を全てデッキに戻して、シャッフルして、引き直す）。'}
        　③ ホロメン（センターは、必ず）を、手札からステージにドラッグしてセットします（相手には、見えません）。④ 準備完了を押します。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {!drawn ? (
          <button type="button" className="btn-primary" onClick={p.onDraw}>
            {HAND_SIZE}枚引く
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={p.onMulligan} title="手札を全てデッキに戻して、シャッフルして、引き直します。2回目からは、引く枚数が1枚ずつ減ります">
            マリガン（{nextDraw}枚引き直す）
          </button>
        )}
        <span className="text-[#9fc3ca]">手札 {p.handCount}枚</span>
        <button type="button" className="btn-primary ml-auto" disabled={!drawn || !p.centerSet} onClick={p.onReady} title={!drawn ? '先に、手札を引いてください' : !p.centerSet ? 'センターに、ホロメンをセットしてください' : ''}>
          準備完了
        </button>
      </div>
    </div>
  )
}