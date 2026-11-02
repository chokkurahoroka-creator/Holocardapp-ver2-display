// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { parseZone, zoneId, type PlayState, type Side } from './playfield'

// ライフが、1枚以上あった状態から、0枚になった側を返す（その側が負け）。
// 「やり直し」や、デッキの読み込みで、ライフが空になったときは、数えない：
//  ・ライフから出たカードが、ほかの場所へ移っている（消えたカードは、数えない）
//  ・その移動先が、デッキ・エールデッキではない（やり直しは、デッキ・エールデッキへ戻す）
//  ・一度に出た枚数が、3枚まで（ホロメンが倒れたときの、通常のライフ減少は、1〜2枚）
export function lifeReachedZero(prev: PlayState, next: PlayState, side: Side): boolean {
  const life = zoneId(side, 'life')
  const before = prev[life]
  if (before.length === 0 || next[life].length !== 0) return false
  if (before.length > 3) return false
  const where = new Map<string, string>()
  for (const z of Object.keys(next)) for (const c of next[z as keyof PlayState]) where.set(c.uid, z)
  let movedElsewhere = 0
  for (const c of before) {
    const to = where.get(c.uid)
    if (!to) return false // 消えたカード（読み込み・入れ替え）がある
    const key = parseZone(to as never)?.key
    if (key === 'deck' || key === 'yellDeck') return false // やり直し
    movedElsewhere += 1
  }
  return movedElsewhere > 0
}

// 勝った側を返す（相手のライフが0になった側）。両方が同時に0になったときや、決まらないときは、null
export function winnerByLife(prev: PlayState, next: PlayState): Side | null {
  const meLost = lifeReachedZero(prev, next, 'me')
  const oppLost = lifeReachedZero(prev, next, 'opp')
  if (meLost === oppLost) return null
  return meLost ? 'opp' : 'me'
}