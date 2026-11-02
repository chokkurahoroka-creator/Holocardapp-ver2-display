import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// 「/versus」で、対戦ページ（versus.html）を開けるようにする（開発サーバー・プレビューのとき。本番の Cloudflare Pages は、versus.html を、/versus として、自動で配信する）
function versusRoute(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url && /^\/versus(?=[?#]|$)/.test(req.url)) req.url = req.url.replace(/^\/versus/, '/versus.html')
    next()
  }
  return {
    name: 'versus-route',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versusRoute()],
  build: {
    rollupOptions: {
      // サイト本体（index.html）と、友達との対戦ページ（versus.html）の、2つのページを作る。
      // 対戦ページは、別のページ（別のCSS・別のJS）なので、サイト本体の表示は、変わらず、軽いまま
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        versus: fileURLToPath(new URL('./versus.html', import.meta.url)),
      },
    },
  },
})
