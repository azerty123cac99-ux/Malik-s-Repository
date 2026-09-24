import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Brand, Button, Card, CenteredPage, Field, Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { navigate } from '../lib/router'
import { supabase } from '../lib/supabase'

const MIN_PASSWORD = 8
const DEAD_LINK = 'This invite link has expired, was already used, or was replaced. Ask your team leader for a new one.'

type Invite = { email: string; team_name: string }

export default function JoinPage({ token }: { token: string | null }) {
  const auth = useAuth()
  // undefined = still checking, null = no valid invite
  const [invite, setInvite] = useState<Invite | null | undefined>(token ? undefined : null)

  // Check the link before showing the form, so a dead link gets a clear
  // message instead of a failed signup after the student types a password.
  useEffect(() => {
    if (!token) return
    supabase.rpc('lookup_invite', { p_token: token }).then(({ data }) => setInvite(data?.[0] ?? null))
  }, [token])

  if (invite === undefined || auth.status === 'loading') return <Spinner />

  return (
    <CenteredPage>
      <Brand />
      <Card>
        {auth.status === 'ready' || auth.status === 'no-access' ? (
          <SignedInAlready email={auth.status === 'ready' ? auth.profile.email : auth.email} onSignOut={auth.signOut} />
        ) : invite ? (
          <JoinForm invite={invite} token={token!} />
        ) : (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">Invite link not valid</h1>
            <Alert>{DEAD_LINK}</Alert>
            <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
              Go to sign in
            </Button>
          </div>
        )}
      </Card>
    </CenteredPage>
  )
}

function SignedInAlready({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">You're already signed in</h1>
      <p className="text-sm text-slate-600">
        This device is signed in as <strong>{email}</strong>. Sign out first to use this invite link.
      </p>
      <Button onClick={onSignOut}>Sign out</Button>
      <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
        Stay signed in
      </Button>
    </div>
  )
}

function JoinForm({ invite, token }: { invite: Invite; token: string }) {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`)
    if (password !== confirm) return setError("The two passwords don't match.")

    setLoading(true)
    // The token travels with the signup. The database checks it and creates
    // the account and profile only if it is valid (see handle_new_user).
    const { error } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: { data: { invite_token: token, full_name: fullName.trim() } },
    })
    setLoading(false)

    if (error) {
      // The database rejects bad tokens with a generic "Database error saving
      // new user", so translate it. Password rules come back as readable text.
      setError(/database error/i.test(error.message) ? DEAD_LINK : error.message)
      return
    }
    // Signed in. Drop the token from the address bar and go to the app.
    navigate('/', { replace: true })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Join {invite.team_name}</h1>
        <p className="text-sm text-slate-600">Choose a password to create your account.</p>
      </div>
      <Field label="Email" type="email" autoComplete="username" value={invite.email} readOnly />
      <Field
        label="Your name"
        autoComplete="name"
        required
        maxLength={80}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD}
        hint={`At least ${MIN_PASSWORD} characters.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Field
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={loading}>
        Create account
      </Button>
    </form>
  )
}
