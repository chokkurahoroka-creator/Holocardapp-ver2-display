// 表示サイト（horoka-display）の Worker。静的ファイルの配信はそのままで、「/api/decklog」だけを、ここで処理する。
//   （表示サイトは、Cloudflare Pages ではなく、Workers の静的ファイル配信でデプロイしているため、functions/ フォルダは使われない。
//     そのため、サーバー側の処理は、この Worker に置く）
//
// デッキログ（ブシロード公式のデッキ作成ツール）の、デッキコードから、デッキの中身（JSON）を取得して返す。
// ブラウザから、デッキログへ直接取得すると、CORSの制限で読み取れないため、サーバーが代わりに取得する。
//
//   GET /api/decklog?code=ABC12      Authorization: Bearer <ログイン中のアカウントのトークン>
//
// ・ログイン済み（匿名ではない）のアカウントだけが使える（Supabase に、トークンを確認する）
// ・取得先は、デッキログだけ。コードは、英数字だけを通す
// ・デッキログのAPIは、公式に公開されているものではない。デッキログのページ自身が使っているものを、同じように呼び出している
//   （仕様が変わったときは、ここと、src/versus-app/utils/decklog.ts の読み取りを直す）
//
// 必要な設定：wrangler.jsonc の vars に、SUPABASE_URL と SUPABASE_ANON_KEY
//
// もう1つ：GET /api/image?url=<画像のURL>
//   カード画像のダウンロード用。ブラウザから、R2の画像を直接取得できない（CORS・キャッシュの影響）ときに、サーバーが代わりに取得して返す。
//   取得できるのは、画像（image/*）だけ。取得先は、*.r2.dev と、vars の PUBLIC_R2_URL（独自ドメインを使うとき）・IMAGE_HOSTS（ほかのホストを、カンマ区切りで）に限る

type Env = {
    ASSETS: { fetch: (request: Request) => Promise<Response> }
    SUPABASE_URL?: string
    SUPABASE_ANON_KEY?: string
    PUBLIC_R2_URL?: string // R2の公開URL（例：https://images.example.com）。*.r2.dev 以外のドメインを使うときに、設定する
    IMAGE_HOSTS?: string // 画像を取得してよいホストを、追加する（カンマ区切り）
  }
  
  // 日本語版を先に、だめなら、英語版のデッキログで探す
  const SITES = ['https://decklog.bushiroad.com', 'https://decklog-en.bushiroad.com']
  
  function jsonError(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }
  
  // ログイン中のアカウントか、Supabase に確認する（匿名ログインは、通さない）
  async function isSignedIn(request: Request, url: string, anonKey: string): Promise<boolean> {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return false
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
    if (!res.ok) return false
    const user = (await res.json()) as { id?: string; is_anonymous?: boolean }
    return !!user.id && !user.is_anonymous
  }
  
  async function handleDecklog(request: Request, env: Env): Promise<Response> {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return jsonError('サーバーの設定（wrangler.jsonc の vars の SUPABASE_URL / SUPABASE_ANON_KEY）が足りません', 500)
    if (!(await isSignedIn(request, env.SUPABASE_URL, env.SUPABASE_ANON_KEY))) return jsonError('ログインが必要です', 401)
  
    const code = (new URL(request.url).searchParams.get('code') ?? '').trim()
    if (!/^[0-9A-Za-z]{3,12}$/.test(code)) return jsonError('デッキコードの形式が正しくありません', 400)
  
    let lastStatus = 0
    const trail: string[] = [] // 原因調べ用：どのサイトが、何を返したか
    for (const site of SITES) {
      let res: Response
      try {
        res = await fetch(`${site}/system/app/api/view/${code}`, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'ja,en;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Origin: site,
            Referer: `${site}/view/${code}`,
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: '{}',
        })
      } catch {
        continue
      }
      lastStatus = res.status
      const text = await res.text()
      trail.push(`${site.replace('https://', '')}: HTTP ${res.status} ${text.slice(0, 80).replace(/\s+/g, ' ')}`)
      if (!res.ok) continue
      // 見つからないときは、JSONではない・中身が空のことがある。デッキの形（JSONのオブジェクト）のときだけ、返す
      try {
        const parsed: unknown = JSON.parse(text)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
        }
      } catch {
        // 次のサイトを試す
      }
    }
    return jsonError(lastStatus === 404 || lastStatus === 0 ? 'このデッキコードのデッキが見つかりませんでした（コードの間違い・非公開のデッキの可能性があります）' : `デッキログから取得できませんでした（HTTP ${lastStatus}）[${trail.join(' / ')}]`, 502)
  }
  
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024 // 画像の大きさの上限（20MB）
  
  // 取得してよいホストか：*.r2.dev ／ PUBLIC_R2_URL のホスト ／ IMAGE_HOSTS に書いたホスト
  function isAllowedImageHost(host: string, env: Env): boolean {
    if (host.endsWith('.r2.dev')) return true
    const extra = (env.IMAGE_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
    if (extra.includes(host)) return true
    try {
      return !!env.PUBLIC_R2_URL && new URL(env.PUBLIC_R2_URL).host.toLowerCase() === host
    } catch {
      return false
    }
  }
  
  async function handleImage(request: Request, env: Env): Promise<Response> {
    const raw = new URL(request.url).searchParams.get('url') ?? ''
    let target: URL
    try {
      target = new URL(raw)
    } catch {
      return jsonError('画像のURLが正しくありません', 400)
    }
    if (target.protocol !== 'https:') return jsonError('https の画像だけ、取得できます', 400)
    if (!isAllowedImageHost(target.host.toLowerCase(), env)) return jsonError(`このホストの画像は、取得できません（${target.host}）。独自ドメインのときは、wrangler.jsonc の vars に PUBLIC_R2_URL を設定してください`, 403)
  
    let res: Response
    try {
      res = await fetch(target.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit)
    } catch {
      return jsonError('画像の取得先に、接続できませんでした', 502)
    }
    if (!res.ok) return jsonError(`画像を取得できませんでした（取得先の応答: HTTP ${res.status}）`, 502)
    const type = res.headers.get('Content-Type') ?? ''
    if (!type.startsWith('image/')) return jsonError('画像ではないため、取得できません', 415)
    if (Number(res.headers.get('Content-Length') ?? 0) > MAX_IMAGE_BYTES) return jsonError('画像が大きすぎます', 413)
    return new Response(res.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } })
  }
  
  export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      const { pathname } = new URL(request.url)
      if (pathname === '/api/image') {
        if (request.method !== 'GET') return jsonError('GET だけ使えます', 405)
        try {
          return await handleImage(request, env)
        } catch (err) {
          console.error('image error', err)
          return jsonError('サーバー内部エラー: ' + (err instanceof Error ? err.message : String(err)), 500)
        }
      }
      // wrangler.jsonc の run_worker_first で、「/api/*」だけが、ここに来る。それ以外は、静的ファイルが、そのまま配信される
      if (pathname === '/api/decklog') {
        if (request.method !== 'GET') return jsonError('GET だけ使えます', 405)
        try {
          return await handleDecklog(request, env)
        } catch (err) {
          console.error('decklog error', err)
          return jsonError('サーバー内部エラー: ' + (err instanceof Error ? err.message : String(err)), 500)
        }
      }
      if (pathname.startsWith('/api/')) return jsonError('見つかりません', 404)
      return env.ASSETS.fetch(request)
    },
  }