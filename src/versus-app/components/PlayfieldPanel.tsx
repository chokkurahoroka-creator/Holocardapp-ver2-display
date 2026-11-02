// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useSetsAdmin, setLabel } from '../hooks/useSetsAdmin'
import { searchDeckCards } from '../hooks/useDeckCards'
import { useCardHp } from '../hooks/useCardHp'
import { useCardDetailForPreview } from '../hooks/useCardDetailForPreview'
import { setScaledDragImage } from '../utils/dragImage'
import type { VersusSync } from '../versus/wire'
import { supabase } from '../lib/supabase'
import { useTouchDrag } from '../hooks/useTouchDrag'
import { usePlayableDecks } from '../hooks/usePlayableDecks'
import { compareDeckCards, type DeckCard } from '../utils/deckImage'
import {
  HALF_W,
  MAT_H,
  ZONES,
  addDamage,
  addHpUp,
  addNewCard,
  addPower,
  addRecipeToHolder,
  applyDamage,
  archiveSplit,
  attachYellFromDeck,
  compactBacks,
  endTurn,
  initialTurn,
  normalizeTurn,
  resetSideToInitial,
  clearDamage,
  clearPower,
  countCards,
  countReturnableToDeck,
  countYellsOutsideYellDeck,
  dealLife,
  drawCards,
  emptyState,
  findCard,
  isDamageableZone,
  isHolomenCard,
  isSlotZone,
  isSupportCard,
  isYellCard,
  moveCard,
  moveUnit,
  slotBlocked,
  normalizeState,
  parseZone,
  returnAllToDeck,
  returnHandToDeck,
  sortZone,
  hideRevealed,
  skillCost,
  returnAllYellsToYellDeck,
  setupFromRecipe,
  shuffleZone,
  toggleUnitRest,
  unitDamage,
  unitHpUp,
  unitParts,
  unitPower,
  updateCard,
  zoneId,
  zoneLabel,
  type PlayCard,
  type PlayState,
  type TurnState,
  type Side,
  type ZoneId,
  type ZoneKey,
} from '../utils/playfield'
import { DAMAGE_STRIP, PlayfieldBoard, type BoardProps, type OshiSkill, dropAllowed, type DragItem, type DropPos, type PlayDrag, type PlayFx, type PlayFxInput } from './PlayfieldBoard'
import { CardPreview } from './CardPreview'
import { CardEffects } from './CardEffects'
import { DeckMenu, type DeckMenuAction } from './DeckMenu'
import { DamageCounterStrip } from './DamageCounterStrip'
import { PlayLogPanel } from './PlayLogPanel'
import { VictoryModal } from './VictoryModal'
import { TurnChangeBanner } from './TurnChangeBanner'
import { winnerByLife } from '../utils/victory'
import { PLAY_LOG_LIMIT, diffPlayLog, diffSkillLog, diffTurnLog, type PlayLogDraft, type PlayLogEntry } from '../utils/playLog'

const STORAGE_KEY = 'horoka-admin:playfield:v1'
const UNDO_LIMIT = 3 // 戻るボタンで、何回前まで巻き戻せるか
type Snapshot = { state: PlayState; skill: Record<string, boolean>; turn: TurnState }
const SKILL_KEY = 'horoka-admin:playfield:skills:v1'
const TURN_KEY = 'horoka-admin:playfield:turn:v1'
const ZOOM_KEY = 'horoka-admin:playfield:zoom'

const KIND_OPTIONS = [
  { value: '', label: 'すべての種類' },
  { value: '推しホロメン', label: '推しホロメン' },
  { value: 'ホロメン', label: 'ホロメン' },
  { value: 'Buzzホロメン', label: 'Buzzホロメン' },
  { value: 'サポート', label: 'サポート' },
  { value: 'エール', label: 'エール' },
]

// 移動先の選択肢（ドラッグができない端末でも、移動できるようにする）
const MOVE_TARGETS: { id: ZoneId; label: string }[] = [
  ...(['me', 'opp'] as const).flatMap((side) => ZONES.map((z) => ({ id: zoneId(side, z.key), label: zoneLabel(zoneId(side, z.key)) }))),
  { id: 'holder', label: 'ホルダー' },
]

// ホルダーの色（盤面・検索の水色と見分けるため、琥珀色にする）
const HOLDER_COLOR = '#ffb454'

function loadState(): PlayState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeState(JSON.parse(raw)) : emptyState()
  } catch {
    return emptyState()
  }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function useViewportHeight(enabled: boolean): number {
  const [h, setH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 900))
  useEffect(() => {
    if (!enabled) return
    let raf: number | null = null
    const onResize = () => {
      if (raf !== null) return
      raf = requestAnimationFrame(() => {
        raf = null
        setH(window.innerHeight) // 同じ値なら、描き直されない
      })
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [enabled])
  return h
}

function Thumb({ card, w, faceDown }: { card: DeckCard; w: number; faceDown?: boolean }) {
  const h = Math.round(w * (88 / 63))
  if (faceDown) return <div style={{ width: w, height: h }} className="rounded bg-gradient-to-br from-[#1d3d8f] to-[#0b1f4f] border border-[#8fb4ff] text-[10px] text-[#bcd0ff] flex items-center justify-center">ホロカ</div>
  return card.image_url ? (
    <img src={card.image_url} alt={card.card_name} draggable={false} loading="lazy" style={{ width: w, height: h, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
  ) : (
    <div style={{ width: w, height: h }} className="rounded bg-[#26324f] text-[9px] text-[#9fc3ca] flex items-center justify-center text-center p-1">
      {card.card_name}
    </div>
  )
}

// ホルダーの小見出しの種類分け
function holderCategory(c: DeckCard): string {
  const t = c.card_type ?? ''
  if (t.includes('推し')) return '推しホロメン'
  if (isYellCard(c)) return 'エール'
  if (isSupportCard(c)) return 'サポート'
  return 'ホロメン'
}
const HOLDER_CATEGORY_ORDER = ['推しホロメン', 'ホロメン', 'サポート', 'エール']

type HolderGroup = { cardId: number; card: DeckCard; uids: string[] }

// ホルダーのカードを、種類ごとに、同じカードは1つにまとめる（枚数を表示）
function groupHolder(cards: PlayCard[]): { title: string; groups: HolderGroup[] }[] {
  const byCategory = new Map<string, Map<number, HolderGroup>>()
  cards.forEach((pc) => {
    const cat = holderCategory(pc.card)
    const map = byCategory.get(cat) ?? new Map<number, HolderGroup>()
    const g = map.get(pc.card.id)
    if (g) g.uids.push(pc.uid)
    else map.set(pc.card.id, { cardId: pc.card.id, card: pc.card, uids: [pc.uid] })
    byCategory.set(cat, map)
  })
  return HOLDER_CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((title) => ({ title, groups: Array.from(byCategory.get(title)!.values()) }))
}

function TrayIcon() {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path d="M1.5 7 L4 2 H14 L16.5 7 V13.5 H1.5 Z" fill="none" stroke={HOLDER_COLOR} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M1.5 7 H6 L7 9.5 H11 L12 7 H16.5" fill="none" stroke={HOLDER_COLOR} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

// versus を渡すと、友達との対戦ルーム（リアルタイム同期）として動く。渡さないときは、これまでどおり、ひとりで使う盤面
export function PlayfieldPanel({ versus }: { versus?: VersusSync } = {}) {
  const { sets } = useSetsAdmin()
  const saved = usePlayableDecks()
  const isTouch = useMediaQuery('(pointer: coarse)') // 指で操作する端末
  const viewportH = useViewportHeight(!isTouch)

  const [localState, setLocalState] = useState<PlayState>(() => (versus ? emptyState() : loadState()))
  // 対戦中は、ルームの盤面が正。操作は、そのつど、ルームへ保存される（連続した操作でも、最新の盤面に積み重ねる）
  const state = versus ? versus.state : localState
  const stateRef = useRef(state)
  // 巻き戻し用の履歴（操作の直前の盤面を、UNDO_LIMIT 回分とっておく）
  const historyRef = useRef<Snapshot[]>([])
  const [historyCount, setHistoryCount] = useState(0)
  const historyLocked = useRef(false) // 1回の操作の中で、続けて盤面を書き換えても、1回分にまとめる
  const undoing = useRef(false)
  const historySuspended = useRef(false) // 1つの操作が、何枚かを順に動かすあいだは、途中の状態を、履歴に残さない
  const recordHistory = () => {
    if (undoing.current || historyLocked.current || historySuspended.current) return
    historyLocked.current = true
    queueMicrotask(() => {
      historyLocked.current = false
    })
    historyRef.current = [...historyRef.current, { state: stateRef.current, skill: skillRef.current, turn: turnRef.current }].slice(-UNDO_LIMIT)
    setHistoryCount(historyRef.current.length)
  }
  useEffect(() => {
    // 対戦中、相手の操作で盤面が変わったら、巻き戻しは使えなくなる（相手の操作まで、巻き戻ってしまうため）
    if (versus && state !== stateRef.current) {
      historyRef.current = []
      setHistoryCount(0)
    }
    stateRef.current = state
  }, [state, versus])
  const versusRef = useRef(versus)
  useEffect(() => {
    versusRef.current = versus
  })
  const setState = (u: PlayState | ((s: PlayState) => PlayState)) => {
    const next = compactBacks(typeof u === 'function' ? u(stateRef.current) : u) // バックのカードは、左に詰める
    if (next !== stateRef.current) recordHistory()
    stateRef.current = next
    const v = versusRef.current
    if (v) v.onChange(next)
    else setLocalState(next)
  }
  const [drag, setDrag] = useState<PlayDrag>(null)
  const [overZone, setOverZone] = useState<ZoneId | null>(null)
  // 推しスキルを使ったか（キー：me:oshi / me:sp / opp:oshi / opp:sp）。ブラウザに保存する
  const [localSkillUsed, setLocalSkillUsed] = useState<Record<string, boolean>>(() => {
    if (versus) return {}
    try {
      const raw = localStorage.getItem(SKILL_KEY)
      const v = raw ? (JSON.parse(raw) as unknown) : null
      return v && typeof v === 'object' ? (v as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })
  const skillUsed = versus ? versus.skillUsed : localSkillUsed
  const skillRef = useRef(skillUsed)
  useEffect(() => {
    skillRef.current = skillUsed
  }, [skillUsed])
  const setSkillUsed = (u: Record<string, boolean> | ((m: Record<string, boolean>) => Record<string, boolean>)) => {
    const next = typeof u === 'function' ? u(skillRef.current) : u
    if (next !== skillRef.current) recordHistory()
    skillRef.current = next
    const v = versusRef.current
    if (v) v.onChange(stateRef.current, next)
    else setLocalSkillUsed(next)
  }
  useEffect(() => {
    if (versus) return // 対戦中は、ルームに保存される
    try {
      localStorage.setItem(SKILL_KEY, JSON.stringify(skillUsed))
    } catch {
      /* 保存できなくても、そのまま続ける */
    }
  }, [skillUsed, versus])
  const [deckPanelOpen, setDeckPanelOpen] = useState(false) // スマホ：デッキ選択のメニュー
  const [logOpen, setLogOpen] = useState(false) // スマホ：プレイログ
  const [roomInfoOpen, setRoomInfoOpen] = useState(false) // スマホ：ルームのコード・退出などは、普段は隠して、タップで開く
  useEffect(() => {
    if (!roomInfoOpen) return
    const t = window.setTimeout(() => setRoomInfoOpen(false), 10000)
    return () => window.clearTimeout(t)
  }, [roomInfoOpen])
  const [fullscreen, setFullscreen] = useState(Boolean(versus)) // 全画面モード（トップバー・タイトル・余白を消して、盤面を大きく表示）
  const [effectsOpen, setEffectsOpen] = useState(true) // スマホ：操作バーに、固有スキル・アーツを出すか
  const [stagePick, setStagePick] = useState<{ uid: string; side: Side } | null>(null) // デッキの中身から、ステージのどこへ置くかを選ぶ
  const [fxList, setFxList] = useState<PlayFx[]>([]) // 再生中のアニメーション（シャッフル・ダウン）
  const fxSeq = useRef(0)
  const [overPos, setOverPos] = useState<DropPos | null>(null) // デッキの上にドラッグしているとき：上半分（デッキトップ）／下半分（一番下）
  const [deckMenu, setDeckMenu] = useState<{ side: Side; anchor: DOMRect; kind: 'deck' | 'yellDeck' } | null>(null) // デッキ・エールデッキをクリックしたときに出すメニュー
  // ターンの状態（先攻・後攻、ターン数、いまターンを進めている側）
  const [localTurn, setLocalTurn] = useState<TurnState>(() => {
    if (versus) return initialTurn()
    try {
      const raw = localStorage.getItem(TURN_KEY)
      return raw ? normalizeTurn(JSON.parse(raw)) : initialTurn()
    } catch {
      return initialTurn()
    }
  })
  const turn = versus ? versus.turn : localTurn
  const turnRef = useRef(turn)
  useEffect(() => {
    turnRef.current = turn
  }, [turn])
  const setTurn = (t: TurnState) => {
    recordHistory()
    turnRef.current = t
    const v = versusRef.current
    if (v) v.onChange(stateRef.current, undefined, t)
    else setLocalTurn(t)
  }
  useEffect(() => {
    if (versus) return // 対戦中は、ルームに保存される
    try {
      localStorage.setItem(TURN_KEY, JSON.stringify(localTurn))
    } catch {
      /* 保存できなくても、そのまま続ける */
    }
  }, [localTurn, versus])
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [moveMode, setMoveMode] = useState(false) // 移動先のゾーンを選んでいる最中
  const [preview, setPreview] = useState<DeckCard | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [viewer, setViewer] = useState<ZoneId | null>(null)
  // ヘルパーメッセージ：画面の上部に出して、しばらくすると消える（同じ文言が続いても、そのつど出す）
  const [message, setMessageRaw] = useState('')
  const [messageSeq, setMessageSeq] = useState(0)
  const setMessage = (m: string) => {
    setMessageRaw(m)
    setMessageSeq((n) => n + 1)
  }
  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessageRaw(''), 5000)
    return () => window.clearTimeout(t)
  }, [message, messageSeq])
  const [moveTarget, setMoveTarget] = useState<ZoneId>('me:hand')
  // ブルーム・サポート・エールを、選んだ枠のカードにつけるときの、カードの選択画面
  const [picker, setPicker] = useState<{ slot: ZoneId; mode: 'bloom' | 'support' | 'yell' } | null>(null)
  // 盤面の表示サイズ（PC）。fit: 盤面全体が画面に収まる大きさ／wide: 横幅いっぱい
  const [zoom, setZoom] = useState<'fit' | 'wide'>(() => (localStorage.getItem(ZOOM_KEY) === 'wide' ? 'wide' : 'fit'))
  useEffect(() => {
    localStorage.setItem(ZOOM_KEY, zoom)
  }, [zoom])

  // デッキ読み込み
  const [deckId, setDeckId] = useState('')
  const [deckSideRaw, setDeckSide] = useState<Side>('me')
  const deckSide: Side = versus ? 'me' : deckSideRaw // 対戦中は、自分の側にだけ置ける

  // カード検索
  const [query, setQuery] = useState('')
  const [setCode, setSetCode] = useState('')
  const [kind, setKind] = useState('')
  const [results, setResults] = useState<DeckCard[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  // 盤面の状態を保存（画面を閉じても、続きから遊べる）
  useEffect(() => {
    if (versus) return // 対戦中は、ルームに保存される
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // 保存できなくても、遊ぶのは続けられる
    }
  }, [state, versus])

  // 検索（入力が止まってから実行）
  useEffect(() => {
    if (!query.trim() && !setCode && !kind) {
      setResults([])
      setSearchError('')
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const r = await searchDeckCards({ query, setCode, kind, type: '', inName: true, inSkills: true, inTags: true })
        if (!cancelled) {
          setResults(r.cards)
          setSearchError('')
        }
      } catch (err) {
        if (!cancelled) setSearchError('検索エラー: ' + (err instanceof Error ? err.message : String(err)))
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, setCode, kind])

  // 盤面の枠にいるホロメンのHP（cards テーブルから取得して覚える）
  const hpIds = useMemo(() => {
    const ids = new Set<number>()
    ;(['me', 'opp'] as const).forEach((side) =>
      ZONES.filter((z) => z.kind === 'slot' && z.key !== 'oshi').forEach((z) =>
        state[zoneId(side, z.key)].forEach((pc) => {
          if (isHolomenCard(pc.card)) ids.add(pc.card.id)
        })
      )
    )
    return Array.from(ids).sort((a, b) => a - b)
  }, [state])
  const hpMap = useCardHp(hpIds)

  // 推しホロメンカードの固有スキル（推しスキル・SP推しスキル）。盤面の推しの下に、カードの登録どおりに出す
  const meOshiId = unitParts(state[zoneId('me', 'oshi')]).top?.card.id ?? null
  const oppOshiId = unitParts(state[zoneId('opp', 'oshi')]).top?.card.id ?? null
  const meOshiDetail = useCardDetailForPreview(meOshiId).detail
  const oppOshiDetail = useCardDetailForPreview(oppOshiId).detail
  const oshiSkills = useMemo(() => {
    const pick = (skills: { skillType: string; title: string; powerCost: string }[] | undefined): OshiSkill[] => {
      const out: OshiSkill[] = []
      const oshi = skills?.find((s) => s.skillType === '推しスキル')
      const sp = skills?.find((s) => s.skillType === 'SP推しスキル')
      if (oshi) out.push({ which: 'oshi', title: oshi.title, powerCost: oshi.powerCost })
      if (sp) out.push({ which: 'sp', title: sp.title, powerCost: sp.powerCost })
      return out
    }
    return { me: pick(meOshiDetail?.skills), opp: pick(oppOshiDetail?.skills) }
  }, [meOshiDetail, oppOshiDetail])
  const hpOf = useCallback((card: DeckCard): number | null => hpMap[card.id] ?? null, [hpMap])

  const selected = useMemo(() => {
    if (!selectedUid) return null
    const loc = findCard(state, selectedUid)
    return loc ? { loc, pc: state[loc.zone][loc.index]! } : null
  }, [state, selectedUid])

  // 選んでいるのが枠のカードなら、中身ごと（ユニット）。それ以外は、そのカード1枚
  const selectedUnit = useMemo(() => {
    if (!selected || !isSlotZone(selected.loc.zone)) return null
    const cards = state[selected.loc.zone]
    return { zone: selected.loc.zone, cards, parts: unitParts(cards) }
  }, [selected, state])

  const selectedSide: Side = selected ? (parseZone(selected.loc.zone)?.side ?? 'me') : 'me'

  const clearDrag = () => {
    setDrag(null)
    setOverZone(null)
    setOverPos(null)
  }

  // カードを選ぶ（プレビューも、そのカードにする）
  const handleSelect = (uid: string | null) => {
    setSelectedUid(uid)
    setMoveMode(false)
    if (uid) {
      const loc = findCard(state, uid)
      if (loc) setPreview(state[loc.zone][loc.index]!.card)
    }
  }

  // ダメージを与える／減らす。ダメージの合計が、ホロメンのHP以上になったら、アーカイブへ送る
  // アニメーションを再生する（終わったら、自動で消す）
  // 相手から届いた出来事：サイコロの目・シャッフルやダウンの演出
  const lastEventId = versus?.lastEvent?.id
  useEffect(() => {
    const ev = versusRef.current?.lastEvent
    if (!ev) return
    if (ev.kind === 'dice') setMessage(`相手のサイコロ：${ev.n}`)
    else if (ev.kind === 'janken') receiveJanken(ev.hand)
    else pushFx(ev.fx, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEventId])
  // 推しホロメンの固有スキル：押すと、必要なホロパワーを、1枚ずつ、アニメーションでアーカイブへ送る。
  // ホロパワーが足りないときは、使えない。使用済みのスキルを、もう一度押すと、未使用に戻る（送ったパワーは、戻らない。戻したいときは、戻るボタンを使う）
  const powerBusy = useRef(false)
  const handleSkill = async (side: Side, which: 'oshi' | 'sp') => {
    const key = `${side}:${which}`
    if (skillRef.current[key]) {
      setSkillUsed((m) => ({ ...m, [key]: false }))
      return
    }
    if (powerBusy.current) return
    if (versus && side === 'opp') {
      setMessage('相手のスキルは、相手が操作します')
      return
    }
    const sk = oshiSkills[side].find((x) => x.which === which)
    const cost = skillCost(sk?.powerCost)
    const powerId = zoneId(side, 'power')
    const archiveId = zoneId(side, 'archive')
    const have = stateRef.current[powerId].length
    if (cost > have) {
      setMessage(`ホロパワーが足りません（必要${cost}枚／いま${have}枚）。このスキルは、使えません`)
      return
    }
    powerBusy.current = true
    recordHistory() // 戻るボタンで、この操作を、まとめて1回分として戻せる
    historySuspended.current = true
    try {
      setSkillUsed((m) => ({ ...m, [key]: true }))
      for (let i = 0; i < cost; i++) {
        const list = stateRef.current[powerId]
        const top = list[list.length - 1] // いちばん上のホロパワーから
        if (!top) break
        pushFx({ kind: 'fly', from: powerId, to: archiveId, card: top.card })
        setState((s) => moveCard(s, top.uid, archiveId))
        await new Promise<void>((resolve) => window.setTimeout(resolve, 520))
      }
      setMessage(cost > 0 ? `${sk?.which === 'sp' ? 'SP推しスキル' : '推しスキル'}を使いました（ホロパワー${cost}枚を、アーカイブへ送りました）` : `${which === 'sp' ? 'SP推しスキル' : '推しスキル'}を使いました`)
    } finally {
      historySuspended.current = false
      powerBusy.current = false
    }
  }

  const moveTargets = versus ? MOVE_TARGETS.filter((t) => t.id !== 'holder') : MOVE_TARGETS // 対戦中は、自分だけのホルダー（共有されない）は使わない
  const pushFx = (fx: PlayFxInput, emit = true) => {
    if (emit) versus?.onEmit({ kind: 'fx', fx })
    const id = ++fxSeq.current
    setFxList((l) => [...l, { ...fx, id }])
    window.setTimeout(() => setFxList((l) => l.filter((f) => f.id !== id)), 1300)
  }
  // シャッフル（動きつき）
  const shuffle = (zone: ZoneId) => {
    setState((s) => shuffleZone(s, zone))
    pushFx({ kind: 'shuffle', zone })
  }

  // base：カウンターを別のカードから移すとき、外したあとの盤面から計算する
  const damageUnit = (zone: ZoneId, delta: number, base: PlayState = state) => {
    if (!isDamageableZone(base, zone)) {
      setMessage('ダメージを与えられるのは、センター・コラボ・バックステージのホロメンです')
      return
    }
    const name = unitParts(base[zone]).top?.card.card_name ?? ''
    if (delta < 0) {
      setState(addDamage(base, zone, delta))
      return
    }
    const r = applyDamage(base, zone, delta, hpOf)
    setState(r.state)
    if (r.defeated) {
      const side = parseZone(zone)?.side ?? 'me'
      pushFx({ kind: 'down', from: zone, to: zoneId(side, 'archive'), card: r.defeated.card })
      setMessage(`${name}のHPが0になったため、アーカイブへ送りました`)
      if (selectedUnit?.zone === zone) handleSelect(null)
      return
    }
    const top = unitParts(r.state[zone]).top
    const baseHp = top ? hpOf(top.card) : null
    setMessage(baseHp === null ? `${name}に${delta}ダメージ（HPが分からないため、HPが0になっても、自動ではアーカイブへ送られません）` : `${name}に${delta}ダメージ（残りHP ${Math.max(0, baseHp + unitHpUp(r.state[zone]) - unitDamage(r.state[zone]))}）`)
  }

  // パワーアップカウンターを乗せる／外す
  const powerUnit = (zone: ZoneId, delta: number, base: PlayState = state) => {
    if (!isDamageableZone(base, zone)) {
      setMessage('パワーアップを乗せられるのは、センター・コラボ・バックステージのホロメンです')
      return
    }
    const next = addPower(base, zone, delta)
    setState(next)
    if (delta > 0) setMessage(`${unitParts(base[zone]).top?.card.card_name ?? ''}にパワーアップ+${delta}（合計+${unitPower(next[zone])}）`)
  }

  // 最大HPアップを乗せる／外す。外して最大HPが下がり、ダメージが最大HP以上になったときは、アーカイブへ送る
  const hpUpUnit = (zone: ZoneId, delta: number, base: PlayState = state) => {
    if (!isDamageableZone(base, zone)) {
      setMessage('最大HPアップを乗せられるのは、センター・コラボ・バックステージのホロメンです')
      return
    }
    const next = addHpUp(base, zone, delta)
    const top = unitParts(next[zone]).top
    const name = top?.card.card_name ?? ''
    const baseHp = top ? hpOf(top.card) : null
    const dmg = unitDamage(next[zone])
    if (delta < 0 && baseHp !== null && dmg > 0 && dmg >= baseHp + unitHpUp(next[zone])) {
      const side = parseZone(zone)?.side ?? 'me'
      setState(moveUnit(next, zone, zoneId(side, 'archive')))
      if (top) pushFx({ kind: 'down', from: zone, to: zoneId(side, 'archive'), card: top.card })
      setMessage(`${name}の最大HPが下がり、HPが0になったため、アーカイブへ送りました`)
      if (selectedUnit?.zone === zone) handleSelect(null)
      return
    }
    setState(next)
    if (delta > 0) setMessage(`${name}の最大HP+${delta}（合計+${unitHpUp(next[zone])}。いまの最大HP ${baseHp === null ? '？' : baseHp + unitHpUp(next[zone])}）`)
  }

  // ドロップ：盤面・ホルダーのカードは移動、枠の中身は、ブルーム・サポート・エールごと移動、検索結果は新しいカードとして置く、ダメージカウンターはホロメンに与える。
  // デッキの下半分にドロップすると、デッキの一番下に入る（上半分は、デッキトップ）
  const performDrop = (d: PlayDrag, zone: ZoneId, index?: number, pos?: DropPos) => {
    if (d === null || !dropAllowed(d, zone, state)) return
    if (d.kind === 'damage' || d.kind === 'power' || d.kind === 'hp') {
      const kind = d.kind
      const remove = (s: PlayState, z: ZoneId) => (kind === 'damage' ? addDamage(s, z, -d.amount) : kind === 'power' ? addPower(s, z, -d.amount) : addHpUp(s, z, -d.amount))
      if ((zone as string) === DAMAGE_STRIP) {
        // カードに乗っているカウンターを、置き場へ戻す
        if (d.from) {
          setState(remove(state, d.from))
          setMessage(`${kind === 'damage' ? 'ダメージ' : kind === 'power' ? 'パワーアップ' : '最大HPアップ'}カウンター${d.amount}を外しました`)
        }
      } else if (d.from !== zone) {
        // 置き場から（または別のカードから）、カードに重ねる
        const base = d.from ? remove(state, d.from) : state
        if (kind === 'damage') damageUnit(zone, d.amount, base)
        else if (kind === 'power') powerUnit(zone, d.amount, base)
        else hpUpUnit(zone, d.amount, base)
      }
      return
    }
    // ログは、2人でひとつの枠。置いたカードは、持ち主（動かしたカードが、どちらの側のものか）のログに入る。
    // 自分のカードなら自分に向き、相手のカードなら相手に向く（ホルダーや検索から置いたカードは、自分のもの）
    let dest = zone
    if (parseZone(zone)?.key === 'log') {
      let owner: Side = 'me'
      if (d.kind === 'card') {
        const loc = findCard(stateRef.current, d.uid)
        if (loc) owner = parseZone(loc.zone)?.side ?? 'me'
      } else if (d.kind === 'unit') owner = parseZone(d.zone)?.side ?? 'me'
      dest = zoneId(owner, 'log')
    }
    const at = parseZone(dest)?.key === 'deck' && pos === 'bottom' ? 0 : index
    if (d.kind === 'card') setState((s) => moveCard(s, d.uid, dest, at))
    else if (d.kind === 'unit') setState((s) => moveUnit(s, d.zone, dest, at === 0 ? 0 : undefined))
    else if (d.kind === 'search') setState((s) => addNewCard(s, d.card, dest, at))
  }
  const handleDropZone = (zone: ZoneId, index?: number, pos?: DropPos) => {
    performDrop(drag, zone, index, pos)
    clearDrag()
  }

  // スマホ・タブレット：長押ししてから動かすと、ドラッグ&ドロップができる
  const touchDrag = useTouchDrag<DragItem>({
    onStart: (d) => setDrag(d),
    onHover: (hit, d) => {
      const zone = hit ? (hit.zone as ZoneId) : null
      if (zone && dropAllowed(d, zone, state)) {
        setOverZone(zone)
        setOverPos(hit?.pos ?? null)
      } else {
        setOverZone(null)
        setOverPos(null)
      }
    },
    onDrop: (d, hit) => performDrop(d, hit.zone as ZoneId, hit.index, hit.pos),
    onEnd: clearDrag,
  })
  const cardGhost = (c: DeckCard) => ({ imageUrl: c.image_url, text: c.card_name, w: 62, h: 87 })

  // デッキのメニュー
  const closeDeckMenu = useCallback(() => setDeckMenu(null), [])
  // 推しホロメンのライフ（cards テーブルの hp）。登録されていないときは、undefined
  const fetchOshiLife = async (cardId: number): Promise<number | undefined> => {
    const { data } = await supabase.from('cards').select('hp').eq('id', cardId).maybeSingle()
    const v = (data as { hp: number | null } | null)?.hp
    return typeof v === 'number' && v > 0 ? v : undefined
  }

  const handleDeckAction = (action: DeckMenuAction) => {
    if (!deckMenu) return
    const { side, kind } = deckMenu
    const deck = zoneId(side, kind) // メニューを開いたのが、デッキかエールデッキか
    const who = side === 'me' ? '自分' : '相手'
    setDeckMenu(null)
    switch (action) {
      case 'shuffle':
        shuffle(deck)
        setMessage(`${who}の${kind === 'yellDeck' ? 'エールデッキ' : 'デッキ'}をシャッフルしました`)
        break
      case 'returnYells': {
        // 全てのエールを、エールデッキに戻す → シャッフル → 推しホロメンのライフ分を、ライフに置く
        const n = countYellsOutsideYellDeck(state, side)
        const oshi = unitParts(state[zoneId(side, 'oshi')]).top
        if (!window.confirm(`${who}のエール（${n}枚）を、すべてエールデッキに戻して、シャッフルします。\nそのあと、推しホロメンのライフ分を、ライフに置きます。よろしいですか？`)) break
        void (async () => {
          const life = oshi ? await fetchOshiLife(oshi.card.id) : undefined
          setState((s) => {
            let next = shuffleZone(returnAllYellsToYellDeck(s, side), deck)
            if (life !== undefined) next = dealLife(next, side, life)
            return next
          })
          pushFx({ kind: 'shuffle', zone: deck })
          handleSelect(null)
          const total = state[deck].length + n
          setMessage(
            life === undefined
              ? `${who}のエール${n}枚を、エールデッキに戻して、シャッフルしました。推しホロメンのライフが分からないため、ライフは置いていません`
              : `${who}のエール${n}枚を、エールデッキに戻して、シャッフルしました。ライフ${Math.min(life, total)}枚を、置きました${total < life ? `（エールが${total}枚しかありません）` : ''}`
          )
        })()
        break
      }
      case 'draw1':
        draw(side, 1)
        break
      case 'draw3':
        draw(side, 3)
        break
      case 'draw5':
        draw(side, 5)
        break
      case 'draw7':
        draw(side, 7)
        break
      case 'returnAll': {
        const n = countReturnableToDeck(state, side)
        if (n === 0) break
        if (!window.confirm(`${who}の手札・アーカイブ・ステージのカード（${n}枚）を、すべてデッキに戻しますか？\n（シャッフルはしません。エールとエールデッキは、そのままです）`)) break
        setState((s) => returnAllToDeck(s, side))
        handleSelect(null)
        setMessage(`${who}のカード${n}枚を、デッキに戻しました（シャッフルはしていません）`)
        break
      }
      case 'view':
        setViewer(deck)
        break
    }
  }

  // 移動先のゾーンをタップしたとき（タッチ操作用）：選んでいるカード（枠なら中身ごと）を、そこへ移す
  const handleZoneTap = (zone: ZoneId) => {
    setMoveMode(false)
    if (!selected) return
    if (selectedUnit) setState((s) => moveUnit(s, selectedUnit.zone, zone))
    else setState((s) => moveCard(s, selected.pc.uid, zone))
  }

  // レスト：枠のカードは、重なっているカードも、ひとまとめにして回転する
  const toggleRest = (uid: string) => {
    const loc = findCard(state, uid)
    if (!loc) return
    if (isSlotZone(loc.zone)) setState((s) => toggleUnitRest(s, loc.zone))
    else setState((s) => updateCard(s, uid, { rested: !s[loc.zone][loc.index]!.rested }))
  }

  // 対戦中：手札・手札横のホルダーのカードを、相手に見せる／見せない
  const canReveal = Boolean(versus && selected && (selected.loc.zone === zoneId('me', 'hand') || selected.loc.zone === zoneId('me', 'handHolder')))
  const toggleReveal = (uid: string) => {
    const loc = findCard(state, uid)
    if (!loc) return
    const now = state[loc.zone][loc.index]!
    setState((s) => updateCard(s, uid, { revealed: !s[loc.zone][loc.index]!.revealed }))
    setMessage(now.revealed ? `${now.card.card_name}の公開をやめました` : `${now.card.card_name}を公開しました（相手に見えます）`)
  }
  const flip = (uid: string) => {
    const loc = findCard(state, uid)
    if (loc) setState((s) => updateCard(s, uid, { faceDown: !s[loc.zone][loc.index]!.faceDown }))
  }

  // デッキの上から、n枚を手札に引く
  const draw = (side: Side, n: number) => {
    const count = state[zoneId(side, 'deck')].length
    if (count === 0) {
      setMessage(`${side === 'me' ? '自分' : '相手'}のデッキにカードがありません`)
      return
    }
    setState((s) => drawCards(s, side, n))
    setMessage(count < n ? `デッキが${count}枚しかなかったため、${count}枚引きました` : `${side === 'me' ? '自分' : '相手'}がデッキから${n}枚引きました`)
  }

  const moveSelected = (to: ZoneId) => {
    if (!selected) return
    if (selectedUnit) setState((s) => moveUnit(s, selectedUnit.zone, to))
    else setState((s) => moveCard(s, selected.pc.uid, to))
  }

  const handleSetupDeck = async () => {
    if (!deckId) return
    if (countCards(state) > 0 && !window.confirm(`${deckSide === 'me' ? '自分' : '相手'}の推し・エールデッキ・デッキを、読み込んだデッキに置き換えます。よろしいですか？`)) return
    try {
      const recipe = await saved.load(deckId)
      // 推しホロメンのライフ（cards テーブルの hp）の枚数だけ、エールデッキの上から、ライフに置く
      const life: number | undefined = recipe.oshi ? await fetchOshiLife(recipe.oshi.id) : undefined
      const yellTotal = recipe.yells.reduce((n, e) => n + e.count, 0)
      const who = deckSide === 'me' ? '自分' : '相手'
      setState((s) => setupFromRecipe(s, deckSide, recipe, Math.random, life))
      setSkillUsed((m) => ({ ...m, [`${deckSide}:oshi`]: false, [`${deckSide}:sp`]: false }))
      pushFx({ kind: 'shuffle', zone: zoneId(deckSide, 'deck') })
      pushFx({ kind: 'shuffle', zone: zoneId(deckSide, 'yellDeck') })
      setDeckPanelOpen(false)
      setMessage(
        life === undefined
          ? `${who}の側に、デッキを配置しました（推し・エールデッキ・デッキ。シャッフル済み）。推しホロメンのライフが登録されていないため、ライフは置いていません`
          : `${who}の側に、デッキを配置しました（シャッフル済み）。推しホロメンのライフ${life}枚分のエールを、ライフに置きました${yellTotal < life ? `（エールが${yellTotal}枚しかないため、${yellTotal}枚）` : ''}`
      )
    } catch (err) {
      setMessage('読み込みに失敗しました: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDeckToHolder = async () => {
    if (!deckId) return
    try {
      const recipe = await saved.load(deckId)
      setState((s) => addRecipeToHolder(s, recipe))
      setDeckPanelOpen(false)
      setMessage('デッキのカードを、ホルダーに追加しました')
    } catch (err) {
      setMessage('読み込みに失敗しました: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const holder = state.holder
  const holderGroups = useMemo(() => groupHolder(holder), [holder])
  const holderOver = drag !== null && drag.kind !== 'damage' && drag.kind !== 'power' && drag.kind !== 'hp' && overZone === 'holder'
  const viewerCards = viewer ? [...state[viewer]].reverse() : [] // 上のカードから順に
  const viewerParsed = viewer ? parseZone(viewer) : null

  // 全画面：Esc キーや、ブラウザの全画面表示の終了で、元に戻す
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFullscreen(false)
    }
    const onFs = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [fullscreen])

  // ターンチェンジ：SUPPORT（旧ログ）のカードをアーカイブへ／相手のターン数を+1／相手のステージの警告マークを消す／盤面の背景（ターンを進める側が紺色）を入れ替える
  const handleTurnChange = (side: Side) => {
    if (versus && side === 'opp') return // 対戦中、相手のターンチェンジは、押せない（相手が、自分の画面で押す）
    const r = endTurn(stateRef.current, turnRef.current, side)
    const other: Side = side === 'me' ? 'opp' : 'me'
    const next = hideRevealed(r.state, other) // 相手が公開していたカードは、非公開に戻す
    setState(next)
    setTurn(r.turn)
    const name = (s: Side) => (s === 'me' ? '自分' : '相手')
    setMessage(`${name(side)}のターンを終えました。${r.sent > 0 ? `SUPPORT のカード${r.sent}枚を、アーカイブへ送りました。` : ''}${next !== r.state ? `${name(other)}の公開中のカードは、非公開に戻しました。` : ''}${name(other)}は${r.turn[other]}ターン目です`)
  }

  // 手札の左のボタン：手札を、全てデッキに戻す（シャッフルはしない）／手札を並び替える（デッキの並びと同じ：ホロメン→サポート→その他）
  const handleHandReturnAll = (side: Side) => {
    if (versus && side === 'opp') return
    const n = stateRef.current[zoneId(side, 'hand')].length
    if (n === 0) return
    const who = side === 'me' ? '自分' : '相手'
    if (!window.confirm(`${who}の手札（${n}枚）を、すべてデッキに戻しますか？\n（シャッフルはしません）`)) return
    setState((s) => returnHandToDeck(s, side))
    setMessage(`${who}の手札${n}枚を、デッキに戻しました（シャッフルはしていません）`)
  }
  const handleHandSort = (side: Side) => {
    if (versus && side === 'opp') return
    setState((s) => sortZone(s, zoneId(side, 'hand'), compareDeckCards))
    setMessage(`${side === 'me' ? '自分' : '相手'}の手札を、並び替えました`)
  }

  // 先攻・後攻を入れ替える
  const toggleFirst = () => {
    const t = turnRef.current
    const first: Side = t.first === 'me' ? 'opp' : 'me'
    // 先攻になった人が1、後攻になった人が0。先攻が、ターンを進める側になる
    setTurn({ first, active: first, me: first === 'me' ? 1 : 0, opp: first === 'opp' ? 1 : 0 })
  }

  // RESET：自分の（ひとりのときは、両方の）カードを、デッキ・エールデッキに戻して、シャッフルして、推しのライフ分をライフに置く（初期状態）
  const resetAll = async () => {
    const sides: Side[] = versus ? ['me'] : ['me', 'opp']
    const who = versus ? '自分' : '自分と相手'
    if (!window.confirm(`${who}のカードを、すべてデッキ・エールデッキに戻して、初期状態に戻します（推しは、そのまま）。ターン数も、最初に戻ります。よろしいですか？`)) return
    const lives = await Promise.all(
      sides.map(async (sd) => {
        const oshi = unitParts(stateRef.current[zoneId(sd, 'oshi')]).top
        return oshi ? fetchOshiLife(oshi.card.id) : undefined
      })
    )
    setState((s) => sides.reduce((acc, sd, i) => resetSideToInitial(acc, sd, lives[i]), s))
    setSkillUsed((m) => {
      const next = { ...m }
      sides.forEach((sd) => {
        next[`${sd}:oshi`] = false
        next[`${sd}:sp`] = false
      })
      return next
    })
    // ターン数も、最初に戻す（先攻・後攻はそのまま。先攻が1ターン目、後攻が0ターン目で、先攻がターンを進める側）
    const t = turnRef.current
    setTurn({ first: t.first, active: t.first, me: t.first === 'me' ? 1 : 0, opp: t.first === 'opp' ? 1 : 0 })
    sides.forEach((sd) => {
      pushFx({ kind: 'shuffle', zone: zoneId(sd, 'deck') })
      pushFx({ kind: 'shuffle', zone: zoneId(sd, 'yellDeck') })
    })
    handleSelect(null)
    setMessage(`${who}のカードを、デッキ・エールデッキに戻して、初期状態に戻しました（ターン数も、最初に戻しました）`)
  }

  // じゃんけん：互いが手を出したあとに、結果を出す（ひとりのときは、相手の手は、ランダム）
  const [jankenMine, setJankenMine] = useState<number | null>(null)
  const [jankenResult, setJankenResult] = useState<{ mine: number; theirs: number; outcome: 'win' | 'lose' | 'draw' } | null>(null)
  const jankenMineRef = useRef<number | null>(null)
  const jankenTheirsRef = useRef<number | null>(null)
  const JANKEN = ['グー', 'チョキ', 'パー']
  const revealJanken = () => {
    const mine = jankenMineRef.current
    const theirs = jankenTheirsRef.current
    if (mine === null || theirs === null) return
    jankenMineRef.current = null
    jankenTheirsRef.current = null
    setJankenMine(null)
    const outcome = mine === theirs ? 'draw' : (mine - theirs + 3) % 3 === 2 ? 'win' : 'lose' // グー>チョキ>パー>グー
    setJankenResult({ mine, theirs, outcome })
    setMessage(`じゃんけん：自分 ${JANKEN[mine]} ／ 相手 ${JANKEN[theirs]} → ${outcome === 'win' ? '自分の勝ち' : outcome === 'lose' ? '相手の勝ち' : 'あいこ'}`)
  }
  const receiveJanken = (hand: number) => {
    jankenTheirsRef.current = hand
    if (jankenMineRef.current !== null) revealJanken()
    else setMessage('相手が、じゃんけんの手を出しました。あなたも、手を出してください')
  }
  const pickJanken = (hand: number) => {
    jankenMineRef.current = hand
    setJankenMine(hand)
    if (versus) {
      versus.onEmit({ kind: 'janken', hand })
      if (jankenTheirsRef.current !== null) revealJanken()
      else setMessage('じゃんけん：相手の手を待っています…（出したあとも、手は変えられます）')
    } else {
      jankenTheirsRef.current = Math.floor(Math.random() * 3)
      revealJanken()
    }
  }
  useEffect(() => {
    if (!jankenResult) return
    const t = window.setTimeout(() => setJankenResult(null), 4500)
    return () => window.clearTimeout(t)
  }, [jankenResult])

  // 全画面モード。ブラウザの全画面表示にも対応している端末では、それも合わせて使う（Esc で、どちらも解除）
  const toggleFullscreen = () => {
    const next = !fullscreen
    setFullscreen(next)
    const el = document.documentElement
    if (next) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined)
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined)
    }
  }

  // 盤面の大きさ：PCは、既定で全体が画面に収まる大きさ。タッチ端末（スマホ）は、横幅に合わせる
  // 画面の上のバー・見出し・余白の分（約250px）を引いた高さに、盤面全体を収める
  const fitHeight = !isTouch && zoom === 'fit' ? Math.max(380, viewportH - (fullscreen ? 20 : 250)) : undefined
  const boardCol = fitHeight ? `${Math.min(900, Math.round(HALF_W * (fitHeight / MAT_H)) + 28)}px` : 'minmax(0, 1fr)'

  // プレイログ：盤面・ターン・推しスキルが変わるたびに、前との差から、何が起きたかを記録する（相手の操作も、同じ差分から記録される）
  const [playLog, setPlayLog] = useState<PlayLogEntry[]>([])
  const logSeq = useRef(0)
  const logPrev = useRef({ state, turn, skillUsed })
  const pushLog = useCallback((drafts: PlayLogDraft[]) => {
    if (drafts.length === 0) return
    setPlayLog((l) => [...l, ...drafts.map((d): PlayLogEntry => ({ ...d, id: ++logSeq.current }))].slice(-PLAY_LOG_LIMIT))
  }, [])
  // 推しスキルの記録は、コスト（ホロパワーを、1枚ずつアーカイブへ送る）が払い終わってから出す。
  // ログは、新しい順（いちばん上が、最新）なので、「スキル使用」が、そのコストの記録の、いちばん上に並ぶ
  const skillPending = useRef<{ drafts: PlayLogDraft[]; timer: number | null }>({ drafts: [], timer: null })
  const flushSkillLog = useCallback(() => {
    const p = skillPending.current
    if (p.timer !== null) window.clearTimeout(p.timer)
    p.timer = null
    const drafts = p.drafts
    p.drafts = []
    pushLog(drafts)
  }, [pushLog])
  useEffect(() => () => {
    if (skillPending.current.timer !== null) window.clearTimeout(skillPending.current.timer)
  }, [])
  useEffect(() => {
    const prev = logPrev.current
    logPrev.current = { state, turn, skillUsed }
    const moveDrafts = prev.state !== state ? diffPlayLog(prev.state, state, { conceal: !!versus, hpOf }) : []
    const turnDrafts = prev.turn !== turn ? diffTurnLog(prev.turn, turn) : []
    const skillDrafts = prev.skillUsed !== skillUsed ? diffSkillLog(prev.skillUsed, skillUsed) : []
    const pend = skillPending.current
    if (turnDrafts.length > 0 && pend.drafts.length > 0) flushSkillLog() // ターンが替わるときは、先に、スキルの記録を出す
    pushLog([...moveDrafts, ...turnDrafts])
    if (skillDrafts.length > 0) pend.drafts.push(...skillDrafts)
    if (pend.drafts.length > 0 && (skillDrafts.length > 0 || moveDrafts.length > 0)) {
      // 盤面が動くたびに、待ち時間をやり直す（コストを払い終わって、動きが止まったら、スキルの記録を出す）
      if (pend.timer !== null) window.clearTimeout(pend.timer)
      pend.timer = window.setTimeout(flushSkillLog, 900)
    }
  }, [state, turn, skillUsed, versus, hpOf, pushLog, flushSkillLog])
  const clearPlayLog = useCallback(() => setPlayLog([]), [])

  // 勝利：ライフが0になったら、その相手の勝ち。モーダルで出す（相手の操作で、相手のライフが0になったときも、同じ）
  const [winner, setWinner] = useState<Side | null>(null)
  const winPrev = useRef(state)
  useEffect(() => {
    const prev = winPrev.current
    winPrev.current = state
    if (prev === state) return
    const w = winnerByLife(prev, state)
    if (w) setWinner(w)
  }, [state])
  const closeWinner = useCallback(() => setWinner(null), [])
  const myDisplayName = versus ? versus.myName : '自分'
  const oppDisplayName = versus ? versus.oppName : '相手'

  // ターンチェンジの演出：ターンが1つ進んで、ターンを進める側が替わったときだけ、右から現れて、中央で止まって、左へ消える帯を出す
  // （先攻・後攻の入れ替えや、読み込みでの大きな変化では、出さない。「動きを減らす」設定のときも、出さない）
  const [turnBanner, setTurnBanner] = useState<{ id: number; side: Side; title: string; sub: string } | null>(null)
  const bannerPrev = useRef(turn)
  const bannerSeq = useRef(0)
  useEffect(() => {
    const prev = bannerPrev.current
    bannerPrev.current = turn
    if (prev === turn || prev.active === turn.active) return
    if (turn.me + turn.opp - (prev.me + prev.opp) !== 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const who = turn.active === 'me' ? myDisplayName : oppDisplayName
    setTurnBanner({ id: ++bannerSeq.current, side: turn.active, title: `${who}のターン`, sub: `${turn[turn.active]}ターン目` })
  }, [turn, myDisplayName, oppDisplayName])
  const closeTurnBanner = useCallback(() => setTurnBanner(null), [])

  // 盤面（PlayfieldBoard）へ渡す処理。盤面は、データが変わったときだけ描き直す（メモ化）ので、渡す関数は変わらないものにして、
  // 呼ばれたときに、そのときの最新の処理（boardHandlers.current）を呼ぶ。これで、古い盤面を見た処理が呼ばれることはない
  type BoardHandlers = Pick<BoardProps, 'onTurnChange' | 'onToggleFirst' | 'onHandReturnAll' | 'onHandSort' | 'onInspect' | 'onToggleSkill' | 'onDragStart' | 'onDeckMenu' | 'onTouchDragStart' | 'onDragEnd' | 'onDragOverZone' | 'onDropZone' | 'onZoneTap' | 'onSelect' | 'onToggleRest' | 'onFlip' | 'onPreview' | 'onOpenZone'>
  const boardHandlers = useRef<BoardHandlers | null>(null)
  useEffect(() => {
    boardHandlers.current = {
      onTurnChange: handleTurnChange,
      onToggleFirst: toggleFirst,
      onHandReturnAll: handleHandReturnAll,
      onHandSort: handleHandSort,
      onInspect: (c) => {
        setPreview(c)
        setDetailOpen(true)
      },
      onToggleSkill: (side, which) => void handleSkill(side, which),
      onDragStart: setDrag,
      onDeckMenu: (side, anchor, kind) => setDeckMenu({ side, anchor, kind }),
      onTouchDragStart: (e, d, ghost) => touchDrag.begin(e, d, ghost),
      onDragEnd: clearDrag,
      onDragOverZone: (zone, pos) => {
        setOverZone(zone)
        setOverPos(zone ? (pos ?? null) : null)
      },
      onDropZone: handleDropZone,
      onZoneTap: handleZoneTap,
      onSelect: handleSelect,
      onToggleRest: toggleRest,
      onFlip: flip,
      onPreview: setPreview,
      onOpenZone: (z) => {
        setDeckMenu(null)
        setViewer(z)
      },
    }
  })
  const stableBoardHandlers = useMemo<BoardHandlers>(
    () => ({
      onTurnChange: (side) => boardHandlers.current!.onTurnChange(side),
      onToggleFirst: () => boardHandlers.current!.onToggleFirst(),
      onHandReturnAll: (side) => boardHandlers.current!.onHandReturnAll(side),
      onHandSort: (side) => boardHandlers.current!.onHandSort(side),
      onInspect: (c) => boardHandlers.current!.onInspect(c),
      onToggleSkill: (side, which) => boardHandlers.current!.onToggleSkill(side, which),
      onDragStart: (d) => boardHandlers.current!.onDragStart(d),
      onDeckMenu: (side, anchor, kind) => boardHandlers.current!.onDeckMenu(side, anchor, kind),
      onTouchDragStart: (e, d, ghost) => boardHandlers.current!.onTouchDragStart(e, d, ghost),
      onDragEnd: () => boardHandlers.current!.onDragEnd(),
      onDragOverZone: (zone, pos) => boardHandlers.current!.onDragOverZone(zone, pos),
      onDropZone: (zone, index, pos) => boardHandlers.current!.onDropZone(zone, index, pos),
      onZoneTap: (zone) => boardHandlers.current!.onZoneTap(zone),
      onSelect: (uid) => boardHandlers.current!.onSelect(uid),
      onToggleRest: (uid) => boardHandlers.current!.onToggleRest(uid),
      onFlip: (uid) => boardHandlers.current!.onFlip(uid),
      onPreview: (c) => boardHandlers.current!.onPreview(c),
      onOpenZone: (z) => boardHandlers.current!.onOpenZone(z),
    }),
    []
  )

  // 「ステージ」：ホロメンは、空いているバックステージ（バック1から順）に、自動でセットする。空きが無いとき・サポートやエールは、置き先を選ぶ
  const sendToStage = (pc: PlayCard, side: Side) => {
    if (isHolomenCard(pc.card) && !(pc.card.card_type ?? '').includes('推し')) {
      const from = findCard(stateRef.current, pc.uid)?.zone ?? null
      const empty = (['back1', 'back2', 'back3', 'back4', 'back5'] as const).map((k) => zoneId(side, k)).find((id) => stateRef.current[id].length === 0)
      if (empty && slotBlocked(stateRef.current, empty, from)) {
        setMessage('バックとコラボは、合わせて5枚までです（空いている枠は、使えません）')
        return
      }
      if (empty) {
        setState((s) => moveCard(s, pc.uid, empty))
        setMessage(`${pc.card.card_name}を、${zoneLabel(empty)}に出しました`)
        return
      }
    }
    setStagePick({ uid: pc.uid, side })
  }

  // ゾーンの中身の一覧に出す、カード1枚分（手札／ホルダー／ステージ／アーカイブ）
  const renderViewerCard = (pc: PlayCard) => (
    <div key={pc.uid} className="flex flex-col gap-1" onMouseEnter={() => setPreview(pc.card)}>
      {/* カードをタップ（クリック）すると、詳細を大きく表示する（裏向きのカードも、中身を確認できる） */}
      <button
        type="button"
        className="relative text-left"
        onClick={() => {
          setPreview(pc.card)
          setDetailOpen(true)
        }}
        aria-label={`${pc.card.card_name}の詳細を見る`}
      >
        <Thumb card={pc.card} w={96} />
      </button>
      <div className="text-[10px] text-[#d7eef2] leading-tight break-all line-clamp-2">{pc.card.card_name}</div>
      <div className="grid grid-cols-2 gap-1">
        <button type="button" className="btn-secondary !px-0 !py-1 text-[9.5px] whitespace-nowrap tracking-tighter" onClick={() => setState((s) => moveCard(s, pc.uid, zoneId(parseZone(viewer ?? 'me:hand')?.side ?? 'me', 'hand')))}>
          手札
        </button>
        {!versus && (<button type="button" className="btn-secondary !px-0 !py-1 text-[9.5px] whitespace-nowrap tracking-tighter" onClick={() => setState((s) => moveCard(s, pc.uid, 'holder'))}>
          ホルダー
        </button>)}
        <button type="button" className="btn-secondary !px-0 !py-1 text-[9.5px] whitespace-nowrap tracking-tighter" onClick={() => sendToStage(pc, parseZone(viewer ?? 'me:hand')?.side ?? 'me')}>
          ステージ
        </button>
        <button type="button" className="btn-secondary !px-0 !py-1 text-[9.5px] whitespace-nowrap tracking-tighter" onClick={() => setState((s) => moveCard(s, pc.uid, zoneId(parseZone(viewer ?? 'me:hand')?.side ?? 'me', 'archive')))}>
          アーカイブ
        </button>
      </div>
    </div>
  )

  // ブルーム・サポート・エールをつけるときの、選べるカード（その側の手札と、ホルダーから）
  const pickerSide = picker ? (parseZone(picker.slot)?.side ?? 'me') : 'me'
  const pickerCandidates = picker
    ? [...state[zoneId(pickerSide, 'hand')].map((pc) => ({ pc, from: '手札' })), ...state.holder.map((pc) => ({ pc, from: 'ホルダー' }))].filter(({ pc }) =>
        picker.mode === 'bloom' ? isHolomenCard(pc.card) && !(pc.card.card_type ?? '').includes('推し') : picker.mode === 'support' ? isSupportCard(pc.card) : isYellCard(pc.card)
      )
    : []
  const pickerTitle = picker?.mode === 'bloom' ? 'ブルームするカードを選ぶ' : picker?.mode === 'support' ? 'つけるサポートを選ぶ' : 'つけるエールを選ぶ'

  const archiveOfSelected = (): ZoneId => zoneId(selectedSide, 'archive')
  const handOfSelected = (): ZoneId => zoneId(selectedSide, 'hand')

  // 選んでいるカードの操作（PCは右側の欄、スマホは画面下の操作バーに出す）
  const unitName = selectedUnit?.parts.top?.card.card_name ?? selected?.pc.card.card_name ?? ''

  // 選んでいるホロメンのダメージ・HP（センター・コラボ・バックステージのホロメンだけ）
  const selectedDamage = (() => {
    if (!selectedUnit || !isDamageableZone(state, selectedUnit.zone)) return null
    const dmg = unitDamage(selectedUnit.cards)
    const hpUp = unitHpUp(selectedUnit.cards)
    const baseHp = selectedUnit.parts.top ? hpOf(selectedUnit.parts.top.card) : null
    const maxHp = baseHp === null ? null : baseHp + hpUp // 最大HP＝カードのHP＋最大HPアップ
    return { zone: selectedUnit.zone, dmg, pow: unitPower(selectedUnit.cards), hpUp, maxHp, remain: maxHp === null ? null : Math.max(0, maxHp - dmg) }
  })()

  // ダメージカウンターをタップ／クリックしたとき：選んでいるホロメンに与える
  const handleCounterTap = (kind: 'damage' | 'power' | 'hp', amount: number) => {
    if (!selectedDamage) setMessage('カウンターを乗せるホロメンを盤面で選ぶか、カウンターをホロメンへドラッグしてください')
    else if (kind === 'damage') damageUnit(selectedDamage.zone, amount)
    else if (kind === 'power') powerUnit(selectedDamage.zone, amount)
    else hpUpUnit(selectedDamage.zone, amount)
  }

  // 戻る：直前の操作を取り消す（UNDO_LIMIT 回前まで）
  const undo = () => {
    const snap = historyRef.current[historyRef.current.length - 1]
    if (!snap) return
    historyRef.current = historyRef.current.slice(0, -1)
    setHistoryCount(historyRef.current.length)
    undoing.current = true
    stateRef.current = snap.state
    skillRef.current = snap.skill
    turnRef.current = snap.turn
    const v = versusRef.current
    if (v) v.onChange(snap.state, snap.skill, snap.turn)
    else {
      setLocalState(snap.state)
      setLocalSkillUsed(snap.skill)
      setLocalTurn(snap.turn)
    }
    undoing.current = false
    handleSelect(null)
    setMessage(`1つ前に戻しました${historyRef.current.length > 0 ? `（あと${historyRef.current.length}回戻せます）` : ''}`)
  }

  // 保存したデッキの読み込み（PCは右の列、スマホは、上の「デッキ選択」ボタンから開く）
  const deckSetupUi = (
      <section className="hud-panel p-3">
        <h3 className="hud-font text-white text-sm font-bold mb-2">保存したデッキを読み込む</h3>
        {!saved.ready ? (
          <p className="text-xs text-[#9fc3ca]">デッキを読み込んでいます…</p>
        ) : saved.decks.length === 0 ? (
          <p className="text-xs text-[#9fc3ca]">読み込めるデッキがありません。ログインして、デッキを作ってから、ここで読み込めます（アカウントのデッキだけが、出ます）</p>
        ) : (
          <>
            <div className="flex gap-1.5 mb-2">
              <select className="field flex-1 min-w-0 text-sm" value={deckId} onChange={(e) => setDeckId(e.target.value)} aria-label="読み込むデッキ">
                <option value="">デッキを選ぶ</option>
                {(['recipe', 'user'] as const).map((src) => {
                  const list = saved.decks.filter((d) => d.source === src)
                  if (list.length === 0) return null
                  // 2種類のデッキが、両方あるときだけ、見出しを付ける
                  const options = list.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))
                  return saved.decks.some((d) => d.source !== src) ? (
                    <optgroup key={src} label={src === 'recipe' ? 'デッキレシピ' : 'マイデッキ'}>
                      {options}
                    </optgroup>
                  ) : (
                    options
                  )
                })}
              </select>
              {!versus && (
                <select className="field text-sm" value={deckSide} onChange={(e) => setDeckSide(e.target.value as Side)} aria-label="配置する側">
                  <option value="me">自分</option>
                  <option value="opp">相手</option>
                </select>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn-primary" onClick={handleSetupDeck} disabled={!deckId} title="推しを推し枠に、エールをエールデッキに、メインデッキをデッキに置き、シャッフルする">
                ゲーム準備（盤面に配置）
              </button>
              <button type="button" className="btn-secondary" onClick={handleDeckToHolder} disabled={!deckId}>
                ホルダーに追加
              </button>
            </div>
          </>
        )}
      </section>
  )

  // 確認画面などの、閉じるアイコン（画面の右上に、常に固定して置く）
  const closeIcon = (onClose: () => void) => (
    <button
      type="button"
      aria-label="閉じる"
      title="閉じる"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
      className="fixed right-3 z-[95] grid place-items-center rounded-full border border-white/70 bg-[#061217]/95 text-white shadow-lg"
      style={{ top: 'calc(10px + env(safe-area-inset-top, 0px))', width: 40, height: 40 }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-[70] overflow-y-auto flex flex-col gap-2 p-1' : 'flex flex-col gap-4'}
      style={
        fullscreen
          ? // 上に、メッセージ・アイコン・対戦の表示を出すための余白をとる（盤面と重ならないように）
            { background: 'var(--hud-bg, #061217)', paddingTop: 'calc(52px + env(safe-area-inset-top, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }
          : versus
            ? { paddingTop: 'calc(52px + env(safe-area-inset-top, 0px))' }
            : undefined
      }
    >
      {/* 対戦ルームの表示：ルームのコード・相手の状態・退出（左上に固定） */}
      {versus && !message && isTouch && !roomInfoOpen && (
        <button
          type="button"
          onClick={() => setRoomInfoOpen(true)}
          aria-label="ルームの情報を開く"
          className="fixed left-2 z-[72] inline-flex items-center gap-1.5 rounded-full border border-[#4ce0e6]/60 bg-[#061217]/90 px-2.5 py-1.5 text-[11px] text-[#d7eef2] shadow-lg"
          style={{ top: 'calc(8px + env(safe-area-inset-top, 0px))' }}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${versus.waiting ? 'bg-[#9fc3ca]' : versus.peerOnline ? 'bg-[#4ade80]' : 'bg-[#f87171]'}`} />
          ルーム
        </button>
      )}
      {versus && !message && (!isTouch || roomInfoOpen) && (
        <div className="fixed left-2 z-[72] flex max-w-[calc(100vw-156px)] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[#4ce0e6]/60 bg-[#061217]/90 px-2 py-1 text-[11px] text-[#d7eef2] shadow-lg" style={{ top: 'calc(8px + env(safe-area-inset-top, 0px))' }}>
          <span className="hud-mono text-[#4ce0e6] font-bold tracking-widest">{versus.roomCode}</span>
          <button
            type="button"
            className="underline text-[#9fc3ca]"
            onClick={() => {
              void navigator.clipboard?.writeText(versus.shareUrl).then(() => setMessage('招待URLをコピーしました。友達に送ってください'))
            }}
          >
            招待URLをコピー
          </button>
          <span className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${versus.waiting ? 'bg-[#9fc3ca]' : versus.peerOnline ? 'bg-[#4ade80]' : 'bg-[#f87171]'}`} />
            {versus.waiting ? '相手の入室待ち' : `${versus.oppName}（${versus.peerOnline ? 'オンライン' : '切断中'}）`}
          </span>
          <button
            type="button"
            className="text-[#ff8a8a]"
            onClick={() => {
              if (window.confirm('ルームを退出しますか？（ホストが退出すると、ルームは閉じられます）')) versus.onLeave()
            }}
          >
            退出
          </button>
          {isTouch && (
            <button type="button" className="text-[#9fc3ca]" onClick={() => setRoomInfoOpen(false)} aria-label="ルームの情報を閉じる">
              ✕
            </button>
          )}
        </div>
      )}
      {/* スマホ：デッキ選択のボタン（ルームのボタンの右）。メニューは、押したときだけ開く。プレイログのボタンは、じゃんけんの右隣（カウンターの列） */}
      {isTouch && !message && !roomInfoOpen && (
        <div className="fixed z-[72] flex items-center gap-2" style={{ top: 'calc(8px + env(safe-area-inset-top, 0px))', left: versus ? 98 : 8 }}>
          <button
            type="button"
            onClick={() => {
              setLogOpen(false)
              setDeckPanelOpen((o) => !o)
            }}
            aria-expanded={deckPanelOpen}
            className="inline-flex items-center gap-1 rounded-full border border-[#4ce0e6]/60 bg-[#061217]/90 px-3 py-1.5 text-[11px] font-bold text-[#d7eef2] shadow-lg"
          >
            デッキ選択 <span aria-hidden="true">{deckPanelOpen ? '▲' : '▼'}</span>
          </button>
        </div>
      )}
      {turnBanner && <TurnChangeBanner key={turnBanner.id} side={turnBanner.side} title={turnBanner.title} sub={turnBanner.sub} onDone={closeTurnBanner} />}
      {winner && (
        <VictoryModal
          name={winner === 'me' ? myDisplayName : oppDisplayName}
          subtitle={`${winner === 'me' ? oppDisplayName : myDisplayName}のライフが0になりました${versus && winner === 'me' ? '。おめでとう！' : ''}`}
          onClose={closeWinner}
        />
      )}
      {isTouch && logOpen && (
        <>
          <div className="fixed inset-0 z-[77]" onClick={() => setLogOpen(false)} />
          <div className="fixed left-2 right-2 z-[78]" style={{ top: 'calc(52px + env(safe-area-inset-top, 0px))' }}>
            <div style={{ background: 'var(--hud-bg, #061217)' }} className="shadow-2xl">
              <PlayLogPanel entries={playLog} onClear={clearPlayLog} className="max-h-[calc(100dvh-120px)]" />
            </div>
          </div>
        </>
      )}
      {isTouch && deckPanelOpen && (
        <>
          <div className="fixed inset-0 z-[77]" onClick={() => setDeckPanelOpen(false)} />
          <div className="fixed left-2 right-2 z-[78]" style={{ top: 'calc(52px + env(safe-area-inset-top, 0px))' }}>
            <div style={{ background: 'var(--hud-bg, #061217)' }} className="shadow-2xl">
              {deckSetupUi}
            </div>
          </div>
        </>
      )}

      {/* じゃんけんの結果（互いが手を出したあと） */}
      {jankenResult &&
        createPortal(
          <div className="fixed inset-0 z-[96] grid place-items-center bg-black/55" onClick={() => setJankenResult(null)}>
            <div className="hud-panel px-8 py-6 text-center" style={{ background: 'var(--hud-bg, #061217)' }}>
              <div className="flex items-end justify-center gap-6">
                <div>
                  <div className="mb-1 text-xs text-[#9fc3ca]">自分</div>
                  <div style={{ fontSize: 64, lineHeight: 1 }}>{['✊', '✌️', '✋'][jankenResult.mine]}</div>
                  <div className="mt-1 text-xs text-[#d7eef2]">{JANKEN[jankenResult.mine]}</div>
                </div>
                <div className="pb-6 text-sm text-[#9fc3ca]">VS</div>
                <div>
                  <div className="mb-1 text-xs text-[#9fc3ca]">相手</div>
                  <div style={{ fontSize: 64, lineHeight: 1 }}>{['✊', '✌️', '✋'][jankenResult.theirs]}</div>
                  <div className="mt-1 text-xs text-[#d7eef2]">{JANKEN[jankenResult.theirs]}</div>
                </div>
              </div>
              <div className="mt-4 text-2xl font-bold" style={{ color: jankenResult.outcome === 'win' ? '#4ade80' : jankenResult.outcome === 'lose' ? '#f87171' : '#ffd76a' }}>
                {jankenResult.outcome === 'win' ? '自分の勝ち！' : jankenResult.outcome === 'lose' ? '相手の勝ち' : 'あいこ'}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ヘルパーメッセージ（画面の上部。タップで閉じる） */}
      {message && (
        <div
          role="status"
          onClick={() => setMessageRaw('')}
          className="fixed z-[73] rounded-lg border border-[#4ce0e6]/60 bg-[#061217]/95 px-3 py-2 text-xs text-[#d7eef2] shadow-lg whitespace-pre-wrap cursor-pointer"
          style={{ top: fullscreen || versus ? 'calc(8px + env(safe-area-inset-top, 0px))' : 60, left: 8, right: fullscreen || versus ? 148 : 56, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', minHeight: 38 }}
        >
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{message}</span>
        </div>
      )}
      {/* 右上に固定するアイコン：全画面の切り替え・盤面のリセット */}
      <div className={`fixed right-2 z-[72] flex gap-2 ${fullscreen || versus ? 'flex-row' : 'flex-col'}`} style={{ top: fullscreen || versus ? 'calc(8px + env(safe-area-inset-top, 0px))' : 60 }}>
        <button
          type="button"
          onClick={undo}
          disabled={historyCount === 0}
          title={`1つ前の操作に戻す（${UNDO_LIMIT}回前まで。いま戻せるのは${historyCount}回）`}
          aria-label="戻る"
          className="relative grid place-items-center rounded-full border border-[#ffd76a]/70 bg-[#061217]/90 text-[#ffd76a] shadow-lg disabled:opacity-35"
          style={{ width: 38, height: 38 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
          {historyCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ffd76a] px-1 text-[10px] font-bold text-[#2b1a00]">{historyCount}</span>}
        </button>
        <button type="button" onClick={toggleFullscreen} title={fullscreen ? '全画面を終了' : '全画面表示（盤面を大きく表示）'} aria-label={fullscreen ? '全画面を終了' : '全画面表示'} className="grid place-items-center rounded-full border border-[#4ce0e6]/70 bg-[#061217]/90 text-[#4ce0e6] shadow-lg" style={{ width: 38, height: 38 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {fullscreen ? <path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" /> : <path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" />}
          </svg>
        </button>
        {(
        <button type="button" onClick={() => void resetAll()} title="RESET：カードを全てデッキ・エールデッキに戻して、初期状態に戻す" aria-label="RESET" className="grid place-items-center rounded-full border border-[#ff8a8a]/70 bg-[#061217]/90 text-[#ff8a8a] shadow-lg" style={{ width: 38, height: 38 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
        )}
      </div>
      <div className={`grid grid-cols-1 ${fullscreen ? 'gap-2' : 'gap-4'} xl:items-start ${isTouch ? 'xl:grid-cols-[var(--pf-board-col)_92px_minmax(0,1fr)]' : 'xl:grid-cols-[480px_var(--pf-board-col)_156px_minmax(0,1fr)]'}`} style={{ '--pf-board-col': boardCol } as CSSProperties}>
        {/* プレイログ（PC）：フィールドの左横に、縦長で置く（狭い画面では、いちばん下） */}
        {!isTouch && (
          <div className="order-last h-72 min-w-0 xl:order-first xl:sticky xl:top-2 xl:h-[calc(100dvh-110px)] xl:self-start">
            <PlayLogPanel entries={playLog} onClear={clearPlayLog} className="h-full" />
          </div>
        )}
        {/* プレイマット */}
        <section className={fullscreen ? 'hud-panel hud-panel-flat p-0.5 min-w-0' : 'hud-panel hud-panel-flat p-2 sm:p-3 min-w-0'}>
          {!fullscreen && (
            <>
          <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
            <h3 className="hud-font text-white text-sm font-bold">プレイフィールド</h3>
            <div className="ml-auto flex flex-wrap gap-2">
              {!isTouch && (
                <div className="inline-flex rounded border border-[#2a4a52] overflow-hidden" role="group" aria-label="盤面の表示サイズ">
                  {(
                    [
                      ['fit', '全体'],
                      ['wide', '拡大'],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setZoom(v)} aria-pressed={zoom === v} className="px-3 py-1.5 text-xs" style={{ background: zoom === v ? 'var(--hud-cyan)' : 'transparent', color: zoom === v ? '#04232a' : '#9fc3ca', fontWeight: zoom === v ? 700 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p
            className="px-1 mb-2 text-[11px] text-[#9fc3ca] truncate"
            title={
              isTouch
                ? 'カードを長押しして動かすとドラッグ（短くタップすると選択）。下の操作バーの「移動」から、移動先を選ぶこともできます。デッキをタップするとメニュー、ライフ・アーカイブなどは中身を確認できます'
                : 'ドラッグで移動（ブルーム・サポート・エールも連動。デッキの上半分＝デッキトップ、下半分＝一番下）／ ダブルクリックでレスト ／ 右クリックで裏返し ／ デッキをクリックでメニュー（シャッフル・ドロー）・ダブルクリックで中身を見る ／ エールとサポートは、ドラッグで別のカードへ移動（サポートは、クリックで大きく表示） ／ ダメージ・パワーアップのカウンターは、置き場からホロメンへドラッグ ／ ライフ・アーカイブなどをクリックで中身を確認'
            }
          >
            {isTouch ? '長押ししてドラッグで移動・タップで選ぶ' : 'ドラッグで移動・ダブルクリックでレスト・右クリックで裏返し'}
          </p>
            </>
          )}
          {moveMode && (
            <div className="mb-2 mx-1 rounded border border-[#ffd76a] bg-[#ffd76a]/10 px-3 py-2 text-xs text-[#ffd76a] flex items-center gap-2">
              移動先のゾーンをタップしてください（{unitName}）
              <button type="button" className="btn-secondary ml-auto shrink-0 whitespace-nowrap" onClick={() => setMoveMode(false)}>
                やめる
              </button>
            </div>
          )}
          <PlayfieldBoard
            state={state}
            selectedUid={selectedUid}
            drag={drag}
            overZone={overZone}
            touchMode={isTouch}
            moveMode={moveMode}
            maxHeight={fitHeight}
            overPos={overPos}
            fx={fxList}
            turn={turn}
            concealSide={versus ? 'opp' : undefined}
            oshiSkills={oshiSkills}
            skillUsed={skillUsed}
            hpOf={hpOf}
            {...stableBoardHandlers}
          />
        </section>

        {/* ダメージカウンター：プレイフィールドとホルダーの間に、縦長に置く（狭い画面では、盤面の下に横長） */}
        <div className="xl:sticky xl:top-2 xl:self-start xl:h-[calc(100dvh-110px)] min-w-0">
          <DamageCounterStrip
            compact={isTouch}
            hint={isTouch ? '長押ししてホロメンへドラッグ（選んだホロメンには、タップでも）' : 'ホロメンへドラッグ。選んでいるホロメンには、クリックでも'}
            onDragStart={setDrag}
            onDragEnd={clearDrag}
            onTouchDragStart={(e, item, ghost) => touchDrag.begin(e, item, ghost)}
            onTap={handleCounterTap}
            onRoll={(n) => {
              setMessage(`サイコロ：${n}`)
              versus?.onEmit({ kind: 'dice', n })
            }}
            jankenMine={jankenMine}
            onJanken={pickJanken}
            onLog={isTouch ? () => {
              setDeckPanelOpen(false)
              setLogOpen((o) => !o)
            } : undefined}
            logOpen={logOpen}
            acceptRemove={(drag?.kind === 'damage' || drag?.kind === 'power' || drag?.kind === 'hp') && !!drag.from}
            removeOver={(overZone as string | null) === DAMAGE_STRIP}
            onDropRemove={() => handleDropZone(DAMAGE_STRIP as ZoneId)}
          />
        </div>

        {/* プレビュー・ホルダー・デッキ読み込み・検索 */}
        <div className="flex flex-col gap-4 min-w-0 xl:sticky xl:top-2 xl:max-h-[calc(100dvh-110px)] xl:overflow-y-auto xl:pr-1">
          {/* スマホでは、プレビューは出さない（タップしたカードは、下の操作バーで確認する） */}
          {!isTouch && (
            <>
          {/* カードのプレビュー（大きな画像と、固有スキル・アーツの効果）と、選んでいるカードの操作 */}
          <section className="hud-panel p-3">
            <h3 className="hud-font text-white text-sm font-bold mb-2">カードのプレビュー</h3>
            {preview ? <CardPreview card={preview} imageWidth={isTouch ? 150 : 210} /> : <p className="text-xs text-[#9fc3ca]">{isTouch ? 'カードをタップすると、ここに大きく表示します' : 'カードにマウスを乗せると、ここに大きく表示します'}</p>}

            {!isTouch && selected && selectedUnit && (
              <div className="mt-3 pt-3 border-t border-[#143844]">
                <div className="text-xs text-[#4ce0e6] mb-2">選択中: {unitName}（{zoneLabel(selectedUnit.zone)}）</div>

                {/* 枠の中身（ブルーム・サポート・エール）。ドラッグ・レストは、これらが連動する */}
                <ul className="flex flex-col gap-1 mb-3">
                  {[...selectedUnit.cards].reverse().map((c) => {
                    const role = isYellCard(c.card) ? 'エール' : isSupportCard(c.card) ? 'サポート' : selectedUnit.parts.holomen[0]?.uid === c.uid ? 'ホロメン' : 'ブルーム'
                    return (
                      <li key={c.uid} className="flex items-center gap-2 text-xs text-[#d7eef2]" onMouseEnter={() => setPreview(c.card)}>
                        <Thumb card={c.card} w={26} />
                        <span className="hud-mono text-[10px] text-[#9fc3ca] w-14 shrink-0">{role}</span>
                        <span className="min-w-0 flex-1 truncate">{c.card.card_name}</span>
                        <button type="button" className="btn-secondary !px-1.5 !py-0.5 text-[10px]" onClick={() => setState((st) => moveCard(st, c.uid, handOfSelected()))}>
                          手札へ
                        </button>
                        <button type="button" className="btn-secondary !px-1.5 !py-0.5 text-[10px]" onClick={() => setState((st) => moveCard(st, c.uid, archiveOfSelected()))}>
                          アーカイブへ
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {selectedDamage && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs text-[#d7eef2]">
                    <span className="hud-mono text-[#9fc3ca]">HP</span>
                    <b className="text-sm">{selectedDamage.remain ?? '？'}</b>
                    <span className="text-[#9fc3ca]">/ {selectedDamage.maxHp ?? '？'}</span>
                    <span className="ml-1 text-[#fca5a5]">ダメージ {selectedDamage.dmg}</span>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => damageUnit(selectedDamage.zone, -10)} disabled={selectedDamage.dmg === 0} title="ダメージを10減らす">
                      −10
                    </button>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => damageUnit(selectedDamage.zone, 10)} title="10ダメージを与える">
                      ＋10
                    </button>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => setState((st) => clearDamage(st, selectedDamage.zone))} disabled={selectedDamage.dmg === 0}>
                      ダメージを消す
                    </button>
                    <span className="ml-2 text-[#fcd34d]">パワー+{selectedDamage.pow}</span>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => powerUnit(selectedDamage.zone, -10)} disabled={selectedDamage.pow === 0} title="パワーアップを10減らす">
                      −10
                    </button>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => powerUnit(selectedDamage.zone, 10)} title="パワーアップを10乗せる">
                      ＋10
                    </button>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => setState((st) => clearPower(st, selectedDamage.zone))} disabled={selectedDamage.pow === 0}>
                      パワーを消す
                    </button>
                    <span className="ml-2 text-[#86efac]">最大HP+{selectedDamage.hpUp}</span>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => hpUpUnit(selectedDamage.zone, -10)} disabled={selectedDamage.hpUp === 0} title="最大HPアップを10減らす">
                      −10
                    </button>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => hpUpUnit(selectedDamage.zone, 10)} title="最大HPを10増やす">
                      ＋10
                    </button>
                    <button type="button" className="btn-secondary !px-2 !py-0.5 text-[11px]" onClick={() => hpUpUnit(selectedDamage.zone, -selectedDamage.hpUp)} disabled={selectedDamage.hpUp === 0}>
                      最大HPアップを消す
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button type="button" className="btn-secondary" onClick={() => toggleRest(selected.pc.uid)}>
                    {selectedUnit.parts.top?.rested ? 'レスト解除' : 'レスト'}
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setPicker({ slot: selectedUnit.zone, mode: 'bloom' })} title="手札・ホルダーのホロメンを、このカードの上に重ねる">
                    ブルーム…
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setPicker({ slot: selectedUnit.zone, mode: 'support' })} title="ファン・マスコット・ツールなどを、このカードにつける">
                    サポートをつける…
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setPicker({ slot: selectedUnit.zone, mode: 'yell' })} title="手札・ホルダーのエールを、このカードにつける">
                    エールをつける…
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setState((st) => attachYellFromDeck(st, selectedSide, selectedUnit.zone))} disabled={state[zoneId(selectedSide, 'yellDeck')].length === 0} title="エールデッキの上から1枚を、このカードにつける">
                    エールデッキから1枚
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => moveSelected(archiveOfSelected())} title="全部をアーカイブへ。エールは、外れて別のスタックになります">
                    アーカイブへ
                  </button>
                  {!versus && (<button type="button" className="btn-secondary" onClick={() => moveSelected('holder')}>
                    ホルダーへ
                  </button>)}
                </div>
                <div className="flex gap-1.5">
                  <select className="field flex-1 min-w-0 text-sm" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value as ZoneId)} aria-label="移動先">
                    {moveTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-primary" onClick={() => moveSelected(moveTarget)} title="枠の中身ごと移動します（移動先に、カードがあるときは入れ替え）">
                    移動
                  </button>
                </div>
              </div>
            )}

            {!isTouch && selected && !selectedUnit && (
              <div className="mt-3 pt-3 border-t border-[#143844]">
                <div className="text-xs text-[#4ce0e6] mb-2">選択中: {selected.pc.card.card_name}（{zoneLabel(selected.loc.zone)}）</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button type="button" className="btn-secondary" onClick={() => toggleRest(selected.pc.uid)}>
                    {selected.pc.rested ? 'レスト解除' : 'レスト'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => flip(selected.pc.uid)}>
                    {selected.pc.faceDown ? '表向きにする' : '裏向きにする'}
                  </button>
                  {canReveal && (
                    <button type="button" className="btn-primary" onClick={() => toggleReveal(selected.pc.uid)} title="このカードを、相手に見せます（手札・ホルダーから出すと、非公開に戻ります）">
                      {selected.pc.revealed ? '公開をやめる' : '公開する'}
                    </button>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => moveSelected(archiveOfSelected())}>
                    アーカイブへ
                  </button>
                  {!versus && (<button type="button" className="btn-secondary" onClick={() => moveSelected('holder')}>
                    ホルダーへ
                  </button>)}
                </div>
                <div className="flex gap-1.5">
                  <select className="field flex-1 min-w-0 text-sm" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value as ZoneId)} aria-label="移動先">
                    {moveTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-primary" onClick={() => moveSelected(moveTarget)}>
                    移動
                  </button>
                </div>
              </div>
            )}
          </section>
            </>
          )}

          {!versus && (
            <>
          {/* ホルダー：使うカードの一覧（盤面・検索と見分けやすいよう、琥珀色の点線の枠・トレイのデザイン） */}
          <section
            data-pf-zone="holder"
            onDragOver={(e) => {
              if (drag === null || drag.kind === 'damage' || drag.kind === 'power' || drag.kind === 'hp') return
              e.preventDefault()
              if (overZone !== 'holder') setOverZone('holder')
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverZone(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              handleDropZone('holder')
            }}
            style={{
              border: `2px dashed ${HOLDER_COLOR}`,
              borderRadius: 14,
              padding: 12,
              background: `linear-gradient(180deg, ${HOLDER_COLOR}1f, ${HOLDER_COLOR}08)`,
              boxShadow: holderOver ? `0 0 0 3px ${HOLDER_COLOR}, 0 0 22px ${HOLDER_COLOR}88` : 'none',
              transition: 'box-shadow .12s',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <TrayIcon />
              <h3 className="hud-font text-sm font-bold" style={{ color: HOLDER_COLOR }}>
                ホルダー
              </h3>
              <span className="hud-mono text-[10px] tracking-widest" style={{ color: `${HOLDER_COLOR}b0` }}>
                HOLDER
              </span>
              <span className="hud-mono text-xs rounded-full px-2 py-0.5" style={{ background: `${HOLDER_COLOR}33`, color: HOLDER_COLOR }}>
                {holder.length}枚
              </span>
              {holder.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary ml-auto"
                  onClick={() => {
                    if (window.confirm('ホルダーのカードを、すべて消しますか？')) setState((s) => ({ ...s, holder: [] }))
                  }}
                >
                  空にする
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#d7eef2]/70 mb-2">使うカードを置いておく場所です。{isTouch ? 'カードを長押ししてから動かすと、盤面へドラッグできます（タップで選んで、操作バーの「移動」でも移せます）' : 'カードを盤面へドラッグして使います。盤面のカードを、ここへドラッグして戻すこともできます'}</p>

            <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto pr-1" style={{ minHeight: 56 }}>
              {holder.length === 0 && <span className="text-xs text-[#d7eef2]/70">空です。下の検索やデッキ読み込みで、カードを入れてください</span>}
              {holderGroups.map(({ title, groups }) => (
                <div key={title}>
                  <div className="hud-mono text-[10px] mb-1 flex items-center gap-1.5" style={{ color: HOLDER_COLOR }}>
                    <span>{title}</span>
                    <span className="rounded px-1.5" style={{ background: `${HOLDER_COLOR}22` }}>
                      {groups.reduce((n, g) => n + g.uids.length, 0)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map((g) => {
                      const isSel = selectedUid !== null && g.uids.includes(selectedUid)
                      return (
                        <div
                          key={g.cardId}
                          draggable={!isTouch}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', g.uids[0]!)
                            setScaledDragImage(e) // ドラッグ中の絵は、元の70%の大きさ
                            setDrag({ kind: 'card', uid: g.uids[0]! })
                          }}
                          onDragEnd={clearDrag}
                          onTouchStart={(e) => touchDrag.begin(e, { kind: 'card', uid: g.uids[0]! }, cardGhost(g.card))}
                          onContextMenu={(e) => e.preventDefault()}
                          onClick={() => handleSelect(isSel ? null : g.uids[0]!)}
                          onMouseEnter={() => setPreview(g.card)}
                          title={`${g.card.card_name}（${g.uids.length}枚）`}
                          className={isTouch ? 'relative' : 'relative cursor-grab'}
                          style={{ outline: isSel ? '3px solid #ffd76a' : `1px solid ${HOLDER_COLOR}55`, outlineOffset: 1, borderRadius: 4, userSelect: 'none', WebkitTouchCallout: 'none' }}
                        >
                          <Thumb card={g.card} w={isTouch ? 54 : 62} />
                          {g.uids.length > 1 && (
                            <span className="absolute -bottom-1 -right-1 hud-mono text-[10px] font-bold leading-none rounded-full px-1.5 py-1" style={{ background: HOLDER_COLOR, color: '#2a1600' }}>
                              ×{g.uids.length}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
            </>
          )}

          {!isTouch && deckSetupUi}

          {!versus && (
            <>
          {/* カード検索 */}
          <section className="hud-panel p-3">
            <h3 className="hud-font text-white text-sm font-bold mb-2">カードを探してホルダーへ</h3>
            <input className="field w-full mb-2 text-sm" placeholder="カード名・固有スキル・アーツ・タグ" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="カード検索" />
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <select className="field text-sm" value={setCode} onChange={(e) => setSetCode(e.target.value)} aria-label="パック">
                <option value="">すべてのパック</option>
                {sets.map((s) => (
                  <option key={s.set_code} value={s.set_code}>
                    {s.set_code}（{setLabel(s)}）
                  </option>
                ))}
              </select>
              <select className="field text-sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="種類">
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {searchError && <p className="text-xs text-[#ff4d4d]">{searchError}</p>}
            {searching && <p className="text-xs text-[#9fc3ca]">検索中...</p>}
            {!searching && (query.trim() || setCode || kind) && !searchError && <p className="text-xs text-[#9fc3ca] mb-1">{results.length}件（{isTouch ? 'タップでホルダーへ入ります。長押ししてから動かすと、盤面へ直接ドラッグできます' : 'クリックでホルダーへ入ります。盤面へ直接ドラッグもできます'}）</p>}
            <div className="grid gap-1.5 max-h-[320px] overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))' }}>
              {results.map((c) => (
                <div
                  key={c.id}
                  draggable={!isTouch}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copyMove' // ドロップ先は 'move' なので、'copy' だけだと、ドロップできない
                    e.dataTransfer.setData('text/plain', String(c.id))
                    setScaledDragImage(e) // ドラッグ中の絵は、元の70%の大きさ
                    setDrag({ kind: 'search', card: c })
                  }}
                  onDragEnd={clearDrag}
                  onTouchStart={(e) => touchDrag.begin(e, { kind: 'search', card: c }, cardGhost(c))}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    setState((s) => addNewCard(s, c, 'holder'))
                    setPreview(c)
                  }}
                  onMouseEnter={() => setPreview(c)}
                  title={`${c.card_name}（${c.set_code} ${c.type}）`}
                  className="cursor-pointer"
                  style={{ userSelect: 'none', WebkitTouchCallout: 'none' }}
                >
                  <Thumb card={c} w={62} />
                </div>
              ))}
            </div>
          </section>
            </>
          )}
        </div>
      </div>

      {/* スマホ（タッチ操作）：選んでいるカードの操作バー。画面の下に固定して、盤面から離れずに操作できるようにする */}
      {isTouch && selected && (
        <>
          <div style={{ height: effectsOpen ? 'calc(24vh + 290px)' : 260 }} aria-hidden="true" />
          {/* ボタンは、画面の下端から離して置く（下すぎると、誤って押しやすいため） */}
          <div className="fixed inset-x-0 bottom-0 z-[75] border-t-2 border-[#4ce0e6] bg-[#061217]/97 px-2 pt-2" style={{ paddingBottom: 'calc(44px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -6px 20px rgba(0,0,0,0.6)' }}>
            <div className="flex items-start gap-2 mb-1.5">
              <button type="button" onClick={() => setDetailOpen(true)} aria-label="カードを大きく表示" className="shrink-0">
                <Thumb card={selected.pc.card} w={88} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white font-bold truncate">{unitName}</div>
                <div className="text-[10px] text-[#9fc3ca] truncate">
                  {zoneLabel(selected.loc.zone)}
                  {selectedDamage && selectedDamage.maxHp !== null && `　HP ${selectedDamage.remain}/${selectedDamage.maxHp}`}
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setEffectsOpen((v) => !v)} aria-pressed={effectsOpen}>
                効果{effectsOpen ? '▼' : '▲'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setDetailOpen(true)}>
                詳細
              </button>
              <button type="button" className="btn-secondary" onClick={() => handleSelect(null)} aria-label="選択を解除">
                ✕
              </button>
            </div>
            {/* そのカードの固有スキルとアーツ（移動・レストなどのボタンの上） */}
            {effectsOpen && !selected.pc.faceDown && (
              <div className="mb-2 overflow-y-auto rounded" style={{ maxHeight: '24vh', WebkitOverflowScrolling: 'touch' }}>
                <CardEffects card={selectedUnit?.parts.top?.card ?? selected.pc.card} />
              </div>
            )}
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
              <button type="button" className={moveMode ? 'btn-primary shrink-0 whitespace-nowrap' : 'btn-primary shrink-0 whitespace-nowrap'} onClick={() => setMoveMode((v) => !v)} style={{ minHeight: 44 }}>
                {moveMode ? '移動をやめる' : '移動'}
              </button>
              <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => toggleRest(selected.pc.uid)}>
                {(selectedUnit ? selectedUnit.parts.top?.rested : selected.pc.rested) ? 'レスト解除' : 'レスト'}
              </button>
              {selectedDamage && (
                <>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => damageUnit(selectedDamage.zone, 10)}>
                    ダメージ+10
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => damageUnit(selectedDamage.zone, 50)}>
                    +50
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => damageUnit(selectedDamage.zone, -10)} disabled={selectedDamage.dmg === 0}>
                    −10
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => setState((st) => clearDamage(st, selectedDamage.zone))} disabled={selectedDamage.dmg === 0}>
                    ダメージ消去
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => powerUnit(selectedDamage.zone, 10)}>
                    パワー+10
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => powerUnit(selectedDamage.zone, -10)} disabled={selectedDamage.pow === 0}>
                    パワー−10
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => hpUpUnit(selectedDamage.zone, 10)}>
                    最大HP+10
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => hpUpUnit(selectedDamage.zone, -10)} disabled={selectedDamage.hpUp === 0}>
                    最大HP−10
                  </button>
                </>
              )}
              {!selectedUnit && (
                <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => flip(selected.pc.uid)}>
                  {selected.pc.faceDown ? '表向き' : '裏向き'}
                </button>
              )}
              {canReveal && (
                <button type="button" className="btn-primary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => toggleReveal(selected.pc.uid)}>
                  {selected.pc.revealed ? '公開をやめる' : '公開する'}
                </button>
              )}
              {selectedUnit && (
                <>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => setPicker({ slot: selectedUnit.zone, mode: 'bloom' })}>
                    ブルーム
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => setPicker({ slot: selectedUnit.zone, mode: 'support' })}>
                    サポート
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => setPicker({ slot: selectedUnit.zone, mode: 'yell' })}>
                    エール
                  </button>
                  <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => setState((st) => attachYellFromDeck(st, selectedSide, selectedUnit.zone))} disabled={state[zoneId(selectedSide, 'yellDeck')].length === 0}>
                    エールデッキから
                  </button>
                </>
              )}
              <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => moveSelected(handOfSelected())}>
                手札へ
              </button>
              <button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => moveSelected(archiveOfSelected())}>
                アーカイブへ
              </button>
              {!versus && (<button type="button" className="btn-secondary shrink-0 whitespace-nowrap" style={{ minHeight: 44 }} onClick={() => moveSelected('holder')}>
                ホルダーへ
              </button>)}
            </div>
          </div>
        </>
      )}

      {/* カードの詳細（スマホ：操作バーの「詳細」） */}
      {detailOpen &&
        preview &&
        createPortal(
          <div className="fixed inset-0 z-[90] bg-black/85 flex items-start justify-center overflow-y-auto p-2" onClick={() => setDetailOpen(false)}>
            {closeIcon(() => setDetailOpen(false))}
            <div className="hud-panel w-full max-w-xl p-3" style={{ background: 'var(--hud-bg, #061217)' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center mb-2 pr-11">
                <h3 className="hud-font text-white text-sm font-bold">カードの詳細</h3>
              </div>
              <CardPreview card={preview} imageWidth={isTouch ? Math.min(window.innerWidth - 56, 420) : 220} />

              {/* スマホ：重なっているカード（ブルーム・サポート・エール）の操作。PCの「選択中」のメニューと同じ内容 */}
              {isTouch && selectedUnit && (
                <div className="mt-4 border-t border-[#143844] pt-3">
                  <div className="mb-2 text-xs text-[#4ce0e6]">
                    重なっているカード：{unitName}（{zoneLabel(selectedUnit.zone)}）
                  </div>
                  <ul className="flex flex-col gap-2">
                    {[...selectedUnit.cards].reverse().map((c) => {
                      const role = isYellCard(c.card) ? 'エール' : isSupportCard(c.card) ? 'サポート' : selectedUnit.parts.holomen[0]?.uid === c.uid ? 'ホロメン' : 'ブルーム'
                      return (
                        <li key={c.uid} className="flex items-center gap-2 text-xs text-[#d7eef2]">
                          <button type="button" onClick={() => setPreview(c.card)} aria-label={`${c.card.card_name}を表示`} className="shrink-0">
                            <Thumb card={c.card} w={44} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="hud-mono text-[10px] text-[#9fc3ca]">{role}</div>
                            <div className="truncate">{c.card.card_name}</div>
                          </div>
                          <button type="button" className="btn-secondary !px-2 text-[11px] whitespace-nowrap" style={{ minHeight: 36 }} onClick={() => setState((st) => moveCard(st, c.uid, handOfSelected()))}>
                            手札へ
                          </button>
                          <button type="button" className="btn-secondary !px-2 text-[11px] whitespace-nowrap" style={{ minHeight: 36 }} onClick={() => setState((st) => moveCard(st, c.uid, archiveOfSelected()))}>
                            アーカイブへ
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* ブルーム・サポート・エールをつけるカードを選ぶ */}
      {picker &&
        createPortal(
          <div className="fixed inset-0 z-[85] bg-black/80 flex items-start justify-center overflow-y-auto p-2 sm:p-6" onClick={() => setPicker(null)}>
            {closeIcon(() => setPicker(null))}
            <div className="hud-panel w-full max-w-3xl p-3 sm:p-5" style={{ background: 'var(--hud-bg, #061217)' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="hud-font text-white text-base font-bold">{pickerTitle}</h3>
              </div>
              <p className="text-xs text-[#9fc3ca] mb-3">対象: {zoneLabel(picker.slot)}のカード。{pickerSide === 'me' ? '自分' : '相手'}の手札と、ホルダーのカードから選べます（{isTouch ? 'タップ' : 'クリック'}でつきます）</p>
              {pickerCandidates.length === 0 ? (
                <p className="text-sm text-[#ffd76a]">{picker.mode === 'bloom' ? 'ブルームできるホロメン' : picker.mode === 'support' ? 'つけられるサポート' : 'つけられるエール'}が、手札にもホルダーにもありません</p>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
                  {pickerCandidates.map(({ pc, from }) => (
                    <button
                      key={pc.uid}
                      type="button"
                      className="flex flex-col gap-1 text-left rounded border border-transparent hover:border-[#4ce0e6] p-0.5"
                      onMouseEnter={() => setPreview(pc.card)}
                      onClick={() => {
                        setState((s) => moveCard(s, pc.uid, picker.slot))
                        if (picker.mode === 'bloom') setPicker(null) // ブルームは1枚ずつ。サポート・エールは、続けて選べるよう、開いたままにする
                      }}
                    >
                      <Thumb card={pc.card} w={96} />
                      <span className="text-[10px] text-[#d7eef2] leading-tight break-all line-clamp-2">{pc.card.card_name}</span>
                      <span className="hud-mono text-[9px] text-[#9fc3ca]">{from}から</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* デッキなどの中身から、ステージのどこへ置くかを選ぶ */}
      {stagePick &&
        (() => {
          const found = findCard(state, stagePick.uid)
          if (!found) return null
          const card = state[found.zone][found.index]!.card
          const side = stagePick.side
          const isOshi = (card.card_type ?? '').includes('推し')
          const keys: ZoneKey[] = isOshi ? ['oshi'] : ['center', 'collab', 'back1', 'back2', 'back3', 'back4', 'back5']
          const holomen = isHolomenCard(card) && !isOshi
          return createPortal(
            <div className="fixed inset-0 z-[85] bg-black/80 flex items-start justify-center overflow-y-auto p-2 sm:p-6" onClick={() => setStagePick(null)}>
            {closeIcon(() => setStagePick(null))}
              <div className="hud-panel w-full max-w-md p-3 sm:p-5" style={{ background: 'var(--hud-bg, #061217)' }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="hud-font text-white text-base font-bold">ステージのどこへ置く？</h3>
                </div>
                <p className="text-xs text-[#9fc3ca] mb-3">
                  {card.card_name}（{side === 'me' ? '自分' : '相手'}）。{holomen ? '空いている場所に置くか、いるホロメンの上に重ねてブルームします' : isOshi ? '推しの場所へ置きます' : 'ホロメンがいる場所に、つけます'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {keys.map((k) => {
                    const id = zoneId(side, k)
                    const top = unitParts(state[id]).top
                    const ok = (holomen || isOshi || state[id].some((c) => isHolomenCard(c.card))) && !slotBlocked(state, id, found.zone)
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={!ok}
                        className="btn-secondary text-left !py-2 disabled:opacity-35"
                        onClick={() => {
                          setState((s) => moveCard(s, stagePick.uid, id))
                          setMessage(`${card.card_name}を、${zoneLabel(id)}に置きました`)
                          setStagePick(null)
                        }}
                      >
                        <div className="text-sm font-bold">{zoneLabel(id)}</div>
                        <div className="text-[11px] text-[#9fc3ca] truncate">{top ? top.card.card_name : '空き'}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>,
            document.body
          )
        })()}

      {/* デッキをクリックしたときの、メニュー */}
      {deckMenu && (
        <DeckMenu
          anchor={deckMenu.anchor}
          title={`${deckMenu.side === 'me' ? '自分' : '相手'}の${deckMenu.kind === 'yellDeck' ? 'エールデッキ' : 'デッキ'}`}
          kind={deckMenu.kind}
          deckCount={state[zoneId(deckMenu.side, deckMenu.kind)].length}
          side={deckMenu.side}
          returnCount={deckMenu.kind === 'yellDeck' ? countYellsOutsideYellDeck(state, deckMenu.side) : countReturnableToDeck(state, deckMenu.side)}
          onAction={handleDeckAction}
          onClose={closeDeckMenu}
        />
      )}

      {/* タッチ操作のドラッグ中に、指について動く絵 */}
      {touchDrag.ghostNode}

      {/* ゾーンの中身を見る（デッキ・ライフ・アーカイブなど） */}
      {viewer &&
        createPortal(
          <div className="fixed inset-0 z-[80] bg-black/80 flex items-start justify-center overflow-y-auto p-2 sm:p-6" onClick={() => setViewer(null)}>
            {closeIcon(() => setViewer(null))}
            <div className="hud-panel w-full max-w-4xl p-3 sm:p-5" style={{ background: 'var(--hud-bg, #061217)' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center gap-2 mb-3 pr-11">
                <h3 className="hud-font text-white text-base font-bold">{zoneLabel(viewer)}</h3>
                <span className="hud-mono text-xs text-[#9fc3ca]">{state[viewer].length}枚（上のカードから順に表示）</span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {viewerParsed?.key === 'deck' && (
                    <>
                      <button type="button" className="btn-primary" onClick={() => draw(viewerParsed.side, 1)} disabled={state[viewer].length === 0}>
                        1枚引く
                      </button>
                      <button type="button" className="btn-primary" onClick={() => draw(viewerParsed.side, 7)} disabled={state[viewer].length === 0}>
                        7枚引く
                      </button>
                    </>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => shuffle(viewer)} disabled={state[viewer].length < 2}>
                    シャッフル
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setState((s) => ({ ...s, [viewer]: s[viewer].map((c) => ({ ...c, faceDown: !c.faceDown })) }))} disabled={state[viewer].length === 0}>
                    全て裏返す
                  </button>
                  {!versus && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (window.confirm(`${zoneLabel(viewer)}のカードを、すべてホルダーに戻しますか？`)) {
                        setState((s) => state[viewer].reduce((acc, c) => moveCard(acc, c.uid, 'holder'), s))
                        setViewer(null)
                      }
                    }}
                    disabled={state[viewer].length === 0}
                  >
                    全てホルダーへ
                  </button>
                  )}
                </div>
              </div>
              {viewerCards.length === 0 ? (
                <p className="text-sm text-[#9fc3ca]">カードがありません</p>
              ) : viewerParsed?.key === 'archive' ? (
                // アーカイブは、カードと、エール（外れたエール）を、別のスタックとして表示する
                <div className="flex flex-col gap-4">
                  {(
                    [
                      ['カードのスタック', archiveSplit(viewerCards).main],
                      ['エールのスタック', archiveSplit(viewerCards).yells],
                    ] as const
                  ).map(([title, list]) => (
                    <div key={title}>
                      <div className="hud-mono text-xs text-[#9fc3ca] mb-1.5">
                        {title}（{list.length}枚）
                      </div>
                      {list.length === 0 ? (
                        <p className="text-xs text-[#9fc3ca]">なし</p>
                      ) : (
                        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
                          {list.map(renderViewerCard)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
                  {viewerCards.map(renderViewerCard)}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}