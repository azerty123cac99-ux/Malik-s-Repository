import { Brand, Button, Card, CenteredPage } from '../components/ui'

export default function NoAccessPage({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  return (
    <CenteredPage>
      <Brand />
      <Card>
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">No access</h1>
          <p className="text-sm text-slate-600">
            <strong>{email}</strong> is not on an active team roster. If you think this is a mistake, ask your team
            leader.
          </p>
          <Button onClick={onSignOut}>Sign out</Button>
        </div>
      </Card>
    </CenteredPage>
  )
}
