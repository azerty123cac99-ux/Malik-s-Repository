import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'

// Frame around every signed-in screen: team name and sign-out on top.
export default function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.status !== 'ready') return null
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
      <main className="mx-auto max-w-3xl px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
  )
}
