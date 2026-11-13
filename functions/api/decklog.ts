// デッキログ（ブシロード公式のデッキ作成ツール）の、デッキコードから、デッキの中身（JSON）を取得して返す。
// ブラウザから、デッキログへ直接取得すると、CORSの制限で読み取れないため、サーバーが代わりに取得する。
//
//   GET /api/decklog?code=ABC12      Authorization: Bearer <ログイン中のアカウントのトークン>
//
// ・ログイン済み（匿名ではない）のアカウントだけが使える（Supabase に、トークンを確認する）
// ・取得先は、デッキログだけ。コードは、英数字だけを通す
// ・デッキログのAPIは、公式に公開されているものではない。デッキログのページ自身が使っているものを、同じように呼び出している
//   （仕様が変わったときは、ここと、src/utils/decklog.ts の読み取りを直す）
//
// 必要な環境変数（Cloudflare Pages のダッシュボードで、このプロジェクトに設定する）：SUPABASE_URL, SUPABASE_ANON_KEY

interface Env {
    SUPABASE_URL: string
    SUPABASE_ANON_KEY: string
  }
  
  type PagesFunctionContext = {
    request: Request
    env: Env
  }
  
  // 日本語版を先に、だめなら、英語版のデッキログで探す
  const SITES = ['https://decklog.bushiroad.com', 'https://decklog-en.bushiroad.com']
  
  function jsonError(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } })
  }
  
  export const onRequestGet = async (ctx: PagesFunctionContext): Promise<Response> => {
    try {
      return await handle(ctx)
    } catch (err) {
      console.error('decklog error', err)
      return jsonError('サーバー内部エラー: ' + (err instanceof Error ? err.message : String(err)), 500)
    }
  }
  
  // ログイン中のアカウントか、Supabase に確認する（匿名ログインは、通さない）
  async function isSignedIn(request: Request, env: Env): Promise<boolean> {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } })
    if (!res.ok) return false
    const user = (await res.json()) as { id?: string; is_anonymous?: boolean }
    return !!user.id && !user.is_anonymous
  }
  
  const handle = async ({ request, env }: PagesFunctionContext): Promise<Response> => {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return jsonError('サーバーの設定（SUPABASE_URL / SUPABASE_ANON_KEY）が足りません', 500)
    if (!(await isSignedIn(request, env))) return jsonError('ログインが必要です', 401)
  
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