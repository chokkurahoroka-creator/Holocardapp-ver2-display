import { Link, useLocation } from 'react-router-dom'

export function SiteNav() {
  const location = useLocation()

  const linkClass = (path: string) =>
    `text-sm rounded px-3 py-1.5 ${
      location.pathname === path
        ? 'bg-[#d4af6a] text-[#1a1305] font-bold'
        : 'text-[#9aa5c0] border border-[#d4af6a]/30'
    }`

  return (
    <nav className="flex gap-2 mb-4">
      <Link to="/" className={linkClass('/')}>
        カード一覧
      </Link>
      <Link to="/cardpool" className={linkClass('/cardpool')}>
        カードプール・デッキ
      </Link>
    </nav>
  )
}