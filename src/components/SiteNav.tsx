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
  .siteNav {
    gap: 4px 8px;
    padding: 5px 8px;
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
      <header
        className="hud-panel siteNav"
        style={{ top: isMaintenance ? MAINTENANCE_BANNER_HEIGHT : 0 }}
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