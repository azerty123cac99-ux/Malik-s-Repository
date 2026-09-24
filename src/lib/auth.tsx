// Keeps track of who is signed in and loads their profile (team, role).
// Any component can call useAuth() to read it.
import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, type Profile } from './supabase'

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  // Signed in, but no active profile: deactivated or revoked.
  | { status: 'no-access'; email: string }
  | { status: 'ready'; session: Session; profile: Profile; teamName: string | null }

type AuthContextValue = AuthState & { signOut: () => Promise<void>; reloadProfile: () => Promise<void> }

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  // 1. Follow the session. Supabase restores it from the browser on load and
  //    tells us whenever someone signs in or out.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  // 2. Whenever the signed-in user changes, load their profile. (This is kept
  //    out of the onAuthStateChange callback on purpose: Supabase warns that
  //    making database calls inside it can hang.)
  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setState({ status: 'signed-out' })
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('*, teams(name)')
      .eq('id', s.user.id)
      .maybeSingle()

    if (!data || !data.active) {
      setState({ status: 'no-access', email: s.user.email ?? '' })
      return
    }
    const { teams, ...profile } = data
    setState({ status: 'ready', session: s, profile, teamName: teams?.name ?? null })
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (session === undefined) return
    loadProfile(session)
    // Only reload when the user changes, not on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, session === undefined])

  const value: AuthContextValue = {
    ...state,
    signOut: async () => {
      await supabase.auth.signOut()
    },
    reloadProfile: () => loadProfile(session ?? null),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
