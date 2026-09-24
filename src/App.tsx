import AppShell from './components/AppShell'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import { useLocation } from './lib/router'
import HomePage from './pages/HomePage'
import JoinPage from './pages/JoinPage'
import LoginPage from './pages/LoginPage'
import NoAccessPage from './pages/NoAccessPage'

export default function App() {
  const { path, params } = useLocation()
  const auth = useAuth()

  // /join works whether or not you are signed in.
  if (path === '/join') return <JoinPage token={params.get('token')} />

  if (auth.status === 'loading') return <Spinner />
  if (auth.status === 'signed-out') return <LoginPage />
  if (auth.status === 'no-access') return <NoAccessPage email={auth.email} onSignOut={auth.signOut} />

  return (
    <AppShell>
      <HomePage profile={auth.profile} teamName={auth.teamName} />
    </AppShell>
  )
}
