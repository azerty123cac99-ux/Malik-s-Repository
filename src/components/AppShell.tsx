import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { Link, useLocation } from '../lib/router'

type Tab = { to: string; label: string; show: boolean }

// Frame around every signed-in screen: team name and sign-out on top, tabs
// at the bottom (where thumbs reach on a phone).
export default function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { path } = useLocation()
  if (auth.status !== 'ready') return null
  const { profile } = auth
  const managesRoster = profile.role !== 'member' || profile.is_president

  const tabs: Tab[] = [
    { to: '/', label: 'Home', show: true },
    { to: '/pipeline', label: 'Pipeline', show: true },
    { to: '/trades', label: 'Trades', show: true },
    { to: '/client', label: 'Client', show: true },
    { to: '/roster', label: 'Roster', show: managesRoster },
  ]

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-slate-900 text-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 h-14">
          <div className="min-w-0">
            <div className="text-xs text-slate-400 leading-none">Trade Journal</div>
            <div className="font-semibold truncate">{auth.teamName ?? 'Advisor'}</div>
          </div>
          <button onClick={auth.signOut} className="text-sm text-slate-300 hover:text-white px-2 py-2">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-28">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-10 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto max-w-3xl flex">
          {tabs
            .filter((t) => t.show)
            .map((t) => {
              const active = t.to === '/' ? path === '/' : path.startsWith(t.to)
              return (
                <li key={t.to} className="flex-1">
                  <Link
                    to={t.to}
                    aria-current={active ? 'page' : undefined}
                    className={`block text-center py-3.5 text-sm font-medium ${active ? 'text-slate-900' : 'text-slate-500'}`}
                  >
                    {t.label}
                  </Link>
                </li>
              )
            })}
        </ul>
      </nav>
    </div>
  )
}
