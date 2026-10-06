import { Link, useLocation } from 'react-router-dom'
import { useSiteStatus } from '../hooks/useSiteStatus'

const YOUTUBE_URL = 'https://www.youtube.com/channel/UClxMlIDTNlNv4H3QsWWgZbw'

// page_keyはuseSiteStatusのDEFAULT_STATUS（display/cardpool）と合わせる。
// 全カード検索（/search）は対応するpage_keyが無いため、site_statusによる非公開設定の対象外（常に表示）
const LINKS = [
  { to: '/', code: '01', label: '新カード一覧', pageKey: 'display' },
  { to: '/search', code: '02', label: '全カード検索', pageKey: null as string | null },
  { to: '/cardpool', code: '03', label: 'カードプール・デッキ', pageKey: 'cardpool' },
]

export function SiteNav() {
  const location = useLocation()
  const { status } = useSiteStatus()
  // 非公開に設定されているページはナビから隠す（作業中は従来通り表示したままにする）
  const visibleLinks = LINKS.filter((l) => !l.pageKey || status[l.pageKey] !== '非公開')

  return (
    <header
      className="hud-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '10px 16px',
        marginBottom: 20,
      }}
    >
      <div>
        <div className="hud-font" style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
          ホロカ
        </div>
        <div className="hud-mono" style={{ fontSize: 10, color: 'var(--hud-cyan)' }}>
          SYSTEM://CARDS
        </div>
      </div>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {visibleLinks.map((l) => (
          <Link key={l.to} to={l.to} className={`hud-nav-item hud-font${location.pathname === l.to ? ' active' : ''}`}>
            <span className="hud-mono" style={{ fontSize: 10, opacity: 0.6 }}>
              {l.code}
            </span>
            {l.label}
          </Link>
        ))}

        <a
          href={YOUTUBE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hud-font"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginLeft: 4,
            padding: '6px 12px',
            borderRadius: 999,
            background: '#ff3b3b',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          ▶ youtubeもやってるよ
        </a>
      </nav>
    </header>
  )
}