// 対戦ページ（src/versus-app/）を、管理画面（horoka-admin）の最新のコードから、作り直す（同期する）。
//
//   使い方（horoka-display のフォルダで）
//     node scripts/sync-versus.mjs           … 管理画面のコードを、src/versus-app/ に、上書きコピーする
//     node scripts/sync-versus.mjs --check   … コピーが、古くなっていないか、確認だけする（古ければ、終了コード 1）
//
//   ・対戦のコードは、管理画面側（horoka-admin/src）で、直す。ここ（display）の src/versus-app/ は、同期したコピーなので、直接は、直さない
//   ・管理画面の場所が違うときは、環境変数 HOROKA_ADMIN_DIR で指定する（既定：../horoka-admin）
//   ・コピーする、ファイルの一覧は、下の FILES。対戦ページが、新しいファイルを使うようになったときは、ここに足す
//     （一覧の作り直し：horoka-admin で  npx esbuild src/versus-main.tsx --bundle --metafile=meta.json --outfile=/dev/null --loader:.css=empty --jsx=automatic
//       → meta.json の inputs のうち、src/ で始まるもの）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adminSrc = resolve(root, process.env.HOROKA_ADMIN_DIR ?? '../horoka-admin', 'src')
const outDir = resolve(root, 'src/versus-app')
const check = process.argv.includes('--check')

const FILES = [
  'components/ArtPickModal.tsx',
  'components/CardEffects.tsx',
  'components/CardPreview.tsx',
  'components/DamageCounterStrip.tsx',
  'components/DeckMenu.tsx',
  'components/DrawStepOverlay.tsx',
  'components/PlayLogPanel.tsx',
  'components/PrepFlow.tsx',
  'components/PlayfieldBoard.tsx',
  'components/PlayfieldPanel.tsx',
  'components/SupportCastOverlay.tsx',
  'components/TurnChangeBanner.tsx',
  'components/VictoryModal.tsx',
  'components/ZoneActionMenu.tsx',
  'hooks/useCardDetailForPreview.ts',
  'hooks/useCardHp.ts',
  'hooks/useDeckCards.ts',
  'hooks/usePlayableDecks.ts',
  'hooks/useRoleInfo.ts',
  'hooks/useSetsAdmin.ts',
  'hooks/useTouchDrag.tsx',
  'hooks/useVersusRoom.ts',
  'index.css',
  'lib/fetchImageViaProxy.ts',
  'lib/supabase.ts',
  'types/artsSkills.ts',
  'utils/attribute.ts',
  'utils/cardBack.ts',
  'utils/deckImage.ts',
  'utils/dragImage.ts',
  'utils/playLog.ts',
  'utils/playfield.ts',
  'utils/roles.ts',
  'utils/victory.ts',
  'versus-main.tsx',
  'versus/VersusApp.tsx',
  'versus/VersusLogin.tsx',
  'versus/roomLink.ts',
  'versus/wire.ts',
]

const NOTE = 'このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。'
const header = (file) => (file.endsWith('.css') ? `/* ${NOTE} */\n` : `// ${NOTE}\n`)

if (!existsSync(adminSrc)) {
  console.error(`管理画面のコードが、見つかりません：${adminSrc}\n場所が違うときは、HOROKA_ADMIN_DIR で指定してください`)
  process.exit(2)
}

let stale = 0
for (const file of FILES) {
  const from = resolve(adminSrc, file)
  if (!existsSync(from)) {
    console.error(`見つかりません（一覧から外すか、管理画面側を確認してください）：${file}`)
    process.exit(2)
  }
  const next = header(file) + readFileSync(from, 'utf8')
  const to = resolve(outDir, file)
  const current = existsSync(to) ? readFileSync(to, 'utf8') : null
  if (current === next) continue
  stale++
  if (check) {
    console.log(`古い：${file}`)
  } else {
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, next)
    console.log(`更新：${file}`)
  }
}

if (check) {
  console.log(stale === 0 ? '同期済みです（管理画面と、同じ内容）' : `${stale}個のファイルが、古くなっています。node scripts/sync-versus.mjs を実行してください`)
  process.exit(stale === 0 ? 0 : 1)
}
console.log(stale === 0 ? '変更なし（すでに、最新です）' : `${stale}個のファイルを、更新しました`)
