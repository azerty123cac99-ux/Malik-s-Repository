import AppShell from './components/AppShell'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import { useLocation } from './lib/router'
import ClientPage from './pages/ClientPage'
import HomePage from './pages/HomePage'
import JoinPage from './pages/JoinPage'
import LoginPage from './pages/LoginPage'
import NoAccessPage from './pages/NoAccessPage'
import PipelinePage from './pages/PipelinePage'
import PitchDetailPage from './pages/PitchDetailPage'
import PitchFormPage from './pages/PitchFormPage'
import RosterPage from './pages/RosterPage'
import TradeFormPage from './pages/TradeFormPage'
import TradesPage from './pages/TradesPage'

const UUID = '[0-9a-f-]{36}'

export default function App() {
  const { path, params } = useLocation()
  const auth = useAuth()

  // /join works whether or not you are signed in.
  if (path === '/join') return <JoinPage token={params.get('token')} />

  if (auth.status === 'loading') return <Spinner />
  if (auth.status === 'signed-out') return <LoginPage />
  if (auth.status === 'no-access') return <NoAccessPage email={auth.email} onSignOut={auth.signOut} />

  const { profile } = auth
  const managesRoster = profile.role !== 'member' || profile.is_president
  const pitchEdit = path.match(new RegExp(`^/pipeline/(${UUID})/edit$`))
  const pitchView = path.match(new RegExp(`^/pipeline/(${UUID})$`))

  let page
  if (path === '/roster' && managesRoster) page = <RosterPage />
  else if (path === '/client') page = <ClientPage />
  else if (path === '/pipeline') page = <PipelinePage />
  else if (path === '/pipeline/new') page = <PitchFormPage />
  else if (pitchEdit) page = <PitchFormPage key={pitchEdit[1]} pitchId={pitchEdit[1]} />
  else if (pitchView) page = <PitchDetailPage key={pitchView[1]} pitchId={pitchView[1]} />
  else if (path === '/trades') page = <TradesPage />
  else if (path === '/trades/new') page = <TradeFormPage />
  else page = <HomePage />

  return <AppShell>{page}</AppShell>
}
