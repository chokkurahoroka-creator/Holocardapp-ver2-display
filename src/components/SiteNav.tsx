import { Link, useLocation } from 'react-router-dom'
import { useSiteStatus } from '../hooks/useSiteStatus'

const YOUTUBE_URL = 'https://www.youtube.com/channel/UClxMlIDTNlNv4H3QsWWgZbw'

// 作業中バナー（MaintenanceBanner）の高さ。上部バナーが出ているページではその下に固定する
const MAINTENANCE_BANNER_HEIGHT = 28

// page_keyはuseSiteStatusのDEFAULT_STATUS（display/cardpool）と合わせる。
// 全カード検索（/search）は対応するpage_keyが無いため、site_statusによる非公開設定の対象外（常に表示）
const LINKS = [
  { to: '/', code: '01', label: '新カード一覧', pageKey: 'display' },
  { to: '/search', code: '02', label: '全カード検索', pageKey: null as string | null },
  { to: '/cardpool', code: '03', label: 'カードプール・デッキ', pageKey: 'cardpool' },
]

// メディアクエリはインラインstyleで書けないため、<style>で定義する。
// 既存の .hud-nav-item のスタイルを上書きするので !important を付けている
const NAV_CSS = `
/* iPhoneのステータスバー（時計・電波）の裏側。ここにスクロール中のカードが透けて見えないよう、不透明な色で塞ぐ。
   index.html に viewport-fit=cover を指定しているため、この領域の高さは env(safe-area-inset-top) で取れる */
.siteNavSafeCover {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: env(safe-area-inset-top, 0px);
  background: var(--hud-bg, #061217);
  z-index: 950;
  pointer-events: none;
}
/* 作業中バナーも、ステータスバーの下から始める */
.maintenanceBanner.top { top: env(safe-area-inset-top, 0px) !important; }
.siteNav {
  position: sticky;
  z-index: 800;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px clamp(10px, 4vw, 16px);
  margin-bottom: 20px;
  background: var(--hud-panel);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
.siteNavBrand { order: 1; margin-right: auto; }
.siteNavLinks { order: 2; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.siteNavYoutube {
  order: 3;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #ff3b3b;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.siteNavYoutube .short { display: none; }

@media (max-width: 640px) {
  /* スマホでは、ナビ・操作バー・操作パネルを画面の横幅いっぱいに広げる
     （親が中央寄せの90%幅なので、左右へ「親の半分 − 画面の半分」だけはみ出させる） */
  .mobileBleed {
    margin-left: calc(50% - 50vw) !important;
    margin-right: calc(50% - 50vw) !important;
    border-left: 0 !important;
    border-right: 0 !important;
    border-radius: 0 !important;
    clip-path: none !important;
  }
  .mobileBleed::before,
  .mobileBleed::after { display: none !important; }

  .siteNav {
    gap: 4px 8px;
    padding: 5px max(8px, env(safe-area-inset-left, 0px)) 5px max(8px, env(safe-area-inset-right, 0px));
    margin-bottom: 10px;
  }
  .siteNavBrandTitle { font-size: 13px !important; line-height: 1.2; }
  .siteNavBrandSub { display: none; }

  /* 1行目: ホロカ ＋ YouTube / 2行目: ナビリンク */
  .siteNavYoutube {
    order: 2;
    margin-left: 0;
    padding: 3px 8px;
    font-size: 10px;
  }
  .siteNavYoutube .full { display: none; }
  .siteNavYoutube .short { display: inline; }

  .siteNavLinks {
    order: 3;
    width: 100%;
    gap: 4px;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .siteNavLinks::-webkit-scrollbar { display: none; }
  .siteNavLinks .hud-nav-item {
    flex: 0 0 auto;
    padding: 3px 8px !important;
    font-size: 11px !important;
    white-space: nowrap;
  }
  .siteNavLinks .hud-nav-item .code { display: none; }
}
`

export function SiteNav() {
  const location = useLocation()
  const { status } = useSiteStatus()
  // 非公開に設定されているページはナビから隠す（作業中は従来通り表示したままにする）
  const visibleLinks = LINKS.filter((l) => !l.pageKey || status[l.pageKey] !== '非公開')

  // 現在のページが「作業中」なら上部バナーの分だけ下げて固定する
  const currentPageKey = LINKS.find((l) => l.to === location.pathname)?.pageKey ?? null
  const isMaintenance = currentPageKey !== null && status[currentPageKey] === '作業中'

  return (
    <>
      <style>{NAV_CSS}</style>
      <div className="siteNavSafeCover" aria-hidden="true" />
      <header
        className="hud-panel siteNav mobileBleed"
        style={{
          // ステータスバーの下（セーフエリアの分）から固定する。作業中バナーが出ているときはその分さらに下げる
          top: isMaintenance
            ? `calc(${MAINTENANCE_BANNER_HEIGHT}px + env(safe-area-inset-top, 0px))`
            : 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="siteNavBrand">
          <div className="hud-font siteNavBrandTitle" style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
            ホロカ
          </div>
          <div className="hud-mono siteNavBrandSub" style={{ fontSize: 10, color: 'var(--hud-cyan)' }}>
            SYSTEM://CARDS
          </div>
        </div>

        <nav className="siteNavLinks">
          {visibleLinks.map((l) => (
            <Link key={l.to} to={l.to} className={`hud-nav-item hud-font${location.pathname === l.to ? ' active' : ''}`}>
              <span className="hud-mono code" style={{ fontSize: 10, opacity: 0.6 }}>
                {l.code}
              </span>
              {l.label}
            </Link>
          ))}
        </nav>

        <a
          href={YOUTUBE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hud-font siteNavYoutube"
        >
          <span className="full">▶ youtubeもやってるよ</span>
          <span className="short">▶ YouTube</span>
        </a>
      </header>
    </>
  )
}