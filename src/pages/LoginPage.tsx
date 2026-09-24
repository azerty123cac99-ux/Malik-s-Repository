import { useState, type FormEvent } from 'react'
import { Alert, Brand, Button, Card, CenteredPage, Field } from '../components/ui'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    // On success, AuthProvider notices the new session and shows the app.
    if (error) setError('Wrong email or password.')
  }

  return (
    <CenteredPage>
      <Brand />
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <Field
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading}>
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-500">
        New? Use the invite link your team leader sent you.
        <br />
        Forgot your password? Ask the club president or advisor to reset it.
      </p>
    </CenteredPage>
  )
}
