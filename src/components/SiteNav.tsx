import { Link, useLocation } from 'react-router-dom'

const LINKS = [
  { to: '/', code: '01', label: 'カード一覧' },
  { to: '/cardpool', code: '02', label: 'カードプール・デッキ' },
]

export function SiteNav() {
  const location = useLocation()

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

      <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className={`hud-nav-item hud-font${location.pathname === l.to ? ' active' : ''}`}>
            <span className="hud-mono" style={{ fontSize: 10, opacity: 0.6 }}>
              {l.code}
            </span>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}