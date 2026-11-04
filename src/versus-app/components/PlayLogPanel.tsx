// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { Fragment, memo } from 'react'
import { LOG_MARK, type LogThumb, type LogTier, type PlayLogEntry, type PlayLogTone } from '../utils/playLog'

// 枠の色：パワー関係＝紫、エール関係＝水色、ダメージ関係＝赤、シャッフル＝青（薄く出す）
const TONE_COLOR: Record<PlayLogTone, string> = { power: '#a855f7', yell: '#38bdf8', damage: '#ef4444', shuffle: '#3b66ff' }
// 進化レベルの色：Debut＝銅色、1st・1stBuzz＝銀色、2nd＝金色
const TIER_COLOR: Record<LogTier, string> = { b: '#e0955a', s: '#d5dbe3', g: '#ffd23f' }

// 文の中の数字を、目立たせる（太く、大きく、明るい色で）。進化レベルつきのカード名（⟦色:文字⟧）は、進化レベルの色で、太く出す
function Emphasized({ text }: { text: string }) {
  return (
    <>
      {text.split(LOG_MARK).map((seg, i) => {
        const m = /^⟦([bsg]):([^⟧]*)⟧$/.exec(seg)
        if (m) {
          return (
            <strong key={i} className="font-extrabold" style={{ color: TIER_COLOR[m[1] as LogTier] }}>
              {m[2]}
            </strong>
          )
        }
        return (
          <Fragment key={i}>
            {seg.split(/(\d+)/).map((part, j) =>
              /^\d+$/.test(part) ? (
                <strong key={j} className="mx-px text-[1.15em] font-extrabold text-[#ffe27a]">
                  {part}
                </strong>
              ) : (
                <Fragment key={j}>{part}</Fragment>
              )
            )}
          </Fragment>
        )
      })}
    </>
  )
}

// ログの文字の右側に出す、そのログのカード（小さな画像。最大3枚）
function Thumbs({ thumbs }: { thumbs: LogThumb[] }) {
  return (
    <span className="ml-auto flex shrink-0 items-start gap-1 pl-1">
      {thumbs.slice(0, 3).map((t, i) =>
        t.img ? (
          <img key={`${t.id}-${i}`} src={t.img} alt={t.name} title={t.name} loading="lazy" draggable={false} className="rounded-[3px] object-cover" style={{ width: 30, height: 42, border: '1px solid rgba(255,255,255,0.3)' }} />
        ) : (
          <span key={`${t.id}-${i}`} title={t.name} className="grid place-items-center rounded-[3px] bg-[#26324f] text-[8px] text-white" style={{ width: 30, height: 42 }}>
            ?
          </span>
        )
      )}
    </span>
  )
}

// プレイログ：何が起きたかを、新しい順に並べる（いちばん上が、最新）。PCでは、フィールドの左横に縦長で、スマホでは、ボタンで開いて出す
export const PlayLogPanel = memo(function PlayLogPanel({ entries, onClear, className = '' }: { entries: PlayLogEntry[]; onClear: () => void; className?: string }) {
  const list = [...entries].reverse()
  return (
    <section className={`hud-panel flex min-h-0 min-w-0 flex-col p-3 ${className}`} aria-label="プレイログ">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <h3 className="hud-font text-base font-bold text-white">プレイログ</h3>
        <button type="button" className="btn-secondary ml-auto !px-2.5 !py-1 text-xs" onClick={onClear} disabled={entries.length === 0}>
          クリア
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-[#9fc3ca]">カードを動かしたり、ターンを進めたりすると、ここに記録されます（新しい順）</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
          {list.map((e) =>
            e.kind === 'step' ? (
              <li key={e.id} className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-bold" style={{ background: e.side === 'me' ? 'rgba(76,224,230,0.1)' : 'rgba(255,112,102,0.1)', color: e.side === 'me' ? '#4ce0e6' : '#ff9a92' }}>
                <span aria-hidden="true">▶</span>
                {e.text}
              </li>
            ) : e.kind === 'turn' ? (
              <li key={e.id} className="mt-1 rounded-md border-2 border-[#ffd76a]/60 bg-[#ffd76a]/10 px-2 py-1.5 text-center text-sm font-bold text-[#ffd76a]">
                <Emphasized text={e.text} />
              </li>
            ) : (
              <li
                key={e.id}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm leading-snug text-[#d7eef2]"
                style={{
                  border: `2px solid ${e.tone ? `${TONE_COLOR[e.tone]}59` : 'rgba(159,195,202,0.2)'}`,
                  background: e.tone ? `${TONE_COLOR[e.tone]}12` : 'rgba(255,255,255,0.03)',
                }}
              >
                <span
                  className="mt-px shrink-0 rounded px-1.5 text-xs font-bold"
                  style={{ background: e.side === 'me' ? 'rgba(76,224,230,0.2)' : 'rgba(255,112,102,0.2)', color: e.side === 'me' ? '#4ce0e6' : '#ff9a92' }}
                >
                  {e.side === 'me' ? '自分' : '相手'}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-line break-words">
                  <Emphasized text={e.text} />
                </span>
                {e.thumbs && e.thumbs.length > 0 && <Thumbs thumbs={e.thumbs} />}
              </li>
            )
          )}
        </ul>
      )}
    </section>
  )
})