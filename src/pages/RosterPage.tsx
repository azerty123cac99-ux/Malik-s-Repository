import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react'
import Modal from '../components/Modal'
import { Alert, Button, Field } from '../components/ui'
import { useAuth } from '../lib/auth'
import type { Database } from '../lib/database.types'
import { daysUntil, formatDate, formatDateTime, sameName } from '../lib/format'
import { supabase, type AppRole, type Profile } from '../lib/supabase'
import { ActionStatus, changed, useAction } from '../lib/useAction'
import { useLatest } from '../lib/useLatest'

type Invite = Database['public']['Tables']['roster_invites']['Row']
type Revocation = Database['public']['Tables']['invite_revocations']['Row']
type Team = { id: string; name: string }

// What the sheet with the invite link needs to show.
type LinkInfo = { email: string; token: string; expiresAt: string }

export default function RosterPage() {
  const auth = useAuth()
  if (auth.status !== 'ready') return null
  return <Roster me={auth.profile} />
}

function Roster({ me }: { me: Profile }) {
  // The president and advisor manage every team; a leader manages their own.
  // These checks only decide which buttons to show. The database enforces
  // the same rules again, whatever the app sends.
  const managesAll = me.is_president || me.role === 'advisor'

  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState<string | null>(me.team_id)
  const [members, setMembers] = useState<Profile[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [revocations, setRevocations] = useState<Revocation[]>([])
  const [link, setLink] = useState<LinkInfo | null>(null)
  const [revoking, setRevoking] = useState<Profile | null>(null)

  useEffect(() => {
    supabase
      .from('teams')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setTeams(data ?? [])
        setTeamId((current) => current ?? data?.[0]?.id ?? null)
      })
  }, [])

  const begin = useLatest()

  const load = useCallback(async () => {
    if (!teamId) return
    const isLatest = begin()
    const [p, i, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('team_id', teamId).order('full_name'),
      supabase.from('roster_invites').select('*').eq('team_id', teamId).is('claimed_at', null).order('created_at'),
      supabase.from('invite_revocations').select('*').eq('team_id', teamId).order('revoked_at', { ascending: false }),
    ])
    // Switching teams quickly, or reloading after an action, can return
    // responses out of order; only the latest load may update the screen.
    if (!isLatest()) return
    setMembers(p.data ?? [])
    setInvites(i.data ?? [])
    setRevocations(r.data ?? [])
  }, [teamId, begin])

  useEffect(() => {
    load()
  }, [load])

  const isMyTeam = teamId === me.team_id
  const canManage = (role: AppRole, isPresident = false) =>
    !isPresident && ((role === 'member' && (managesAll || (me.role === 'leader' && isMyTeam))) || (role === 'leader' && managesAll))

  // Every roster action: one at a time (buttons disabled meanwhile), then
  // the lists reload and a success or error message is shown.
  const action = useAction(load)
  const busy = action.busy !== null
  const label = (key: string, text: string) => (action.busy === key ? 'Saving…' : text)
  const inSevenDays = () => new Date(Date.now() + 7 * 86_400_000).toISOString()

  const showLink = (invite: Invite) =>
    action.run(
      `link:${invite.email}`,
      async () => {
        const { data, error } = await supabase.rpc('invite_token', { p_email: invite.email })
        if (error || !data) return { error: error ?? { message: 'Could not get the link.' } }
        setLink({ email: invite.email, token: data, expiresAt: invite.expires_at })
      },
      'Invite link ready',
    )

  const regenerate = (invite: Invite) =>
    confirm(`Create a new link for ${invite.email}? The old link will stop working.`) &&
    action.run(
      `regen:${invite.email}`,
      async () => {
        const { data, error } = await supabase.rpc('regenerate_invite', { p_email: invite.email })
        if (error || !data) return { error: error ?? { message: 'Could not regenerate the link.' } }
        setLink({ email: invite.email, token: data, expiresAt: inSevenDays() })
      },
      'New link created. The old one no longer works.',
    )

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? 'the president or advisor'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Roster</h1>
        {managesAll && teams.length > 0 && (
          <select
            aria-label="Team"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
            value={teamId ?? ''}
            onChange={(e) => setTeamId(e.target.value)}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ActionStatus status={action.status} />

      {teamId && (canManage('member') || canManage('leader')) && (
        <AddInvite
          teamId={teamId}
          allowLeader={managesAll}
          busy={busy}
          saving={action.busy === 'invite'}
          onSubmit={(email, role) =>
            action.run(
              'invite',
              async () => {
                const { data, error } = await supabase
                  .from('roster_invites')
                  .insert({ email, team_id: teamId, role })
                  .select()
                  .single()
                if (error) {
                  return { error: { message: error.code === '23505' ? 'That email already has an invite.' : error.message } }
                }
                const { data: token, error: e2 } = await supabase.rpc('invite_token', { p_email: data.email })
                if (e2 || !token) return { error: e2 ?? { message: 'Invite created, but the link could not be shown.' } }
                setLink({ email: data.email, token, expiresAt: data.expires_at })
              },
              'Invite created',
            )
          }
        />
      )}

      <Section title={`Waiting to join (${invites.length})`}>
        {invites.length === 0 && <Empty>No pending invites.</Empty>}
        {invites.map((inv) => {
          const days = daysUntil(inv.expires_at)
          const manage = canManage(inv.role, inv.is_president)
          return (
            <li key={inv.email} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium break-all">{inv.email}</div>
                  <div className={`text-sm ${days <= 0 ? 'text-red-700' : 'text-slate-500'}`}>
                    {inv.role === 'leader' ? 'Leader · ' : ''}
                    {days <= 0 ? 'Link expired' : `Link expires in ${days} day${days === 1 ? '' : 's'}`}
                  </div>
                </div>
              </div>
              {manage && (
                <div className="flex flex-wrap gap-2">
                  {days > 0 && (
                    <SmallButton disabled={busy} onClick={() => showLink(inv)}>
                      {label(`link:${inv.email}`, 'Copy invite link')}
                    </SmallButton>
                  )}
                  <SmallButton disabled={busy} onClick={() => regenerate(inv)}>
                    {label(`regen:${inv.email}`, 'Regenerate')}
                  </SmallButton>
                  <SmallButton
                    tone="danger"
                    disabled={busy}
                    onClick={() =>
                      confirm(`Remove the invite for ${inv.email}?`) &&
                      action.run(
                        `remove:${inv.email}`,
                        () => changed(supabase.from('roster_invites').delete().eq('email', inv.email).select('email')),
                        'Invite removed',
                      )
                    }
                  >
                    {label(`remove:${inv.email}`, 'Remove')}
                  </SmallButton>
                </div>
              )}
            </li>
          )
        })}
      </Section>

      <Section title={`Members (${members.filter((m) => m.active).length} active)`}>
        {members.length === 0 && <Empty>Nobody has joined yet.</Empty>}
        {members.map((m) => {
          const isSelf = m.id === me.id
          const manage = !isSelf && canManage(m.role, m.is_president)
          return (
            <li key={m.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {m.full_name}
                    {isSelf && <span className="text-slate-500 font-normal"> (you)</span>}
                  </div>
                  <div className="text-sm text-slate-500 break-all">{m.email}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {m.is_president && <Badge>President</Badge>}
                  {m.role === 'leader' && <Badge>Leader</Badge>}
                  {!m.active && <Badge tone="danger">Removed</Badge>}
                </div>
              </div>
              {manage && (
                <div className="flex flex-wrap gap-2">
                  {managesAll && m.active && (
                    <SmallButton
                      disabled={busy}
                      onClick={() =>
                        confirm(`Make ${m.full_name} a ${m.role === 'leader' ? 'member' : 'leader'}?`) &&
                        action.run(
                          `role:${m.id}`,
                          () =>
                            supabase.rpc('set_member_role', {
                              p_user: m.id,
                              p_role: m.role === 'leader' ? 'member' : 'leader',
                            }),
                          `${m.full_name} is now a ${m.role === 'leader' ? 'member' : 'leader'}`,
                        )
                      }
                    >
                      {label(`role:${m.id}`, m.role === 'leader' ? 'Make member' : 'Make leader')}
                    </SmallButton>
                  )}
                  <SmallButton
                    disabled={busy}
                    onClick={() =>
                      confirm(
                        m.active
                          ? `Remove ${m.full_name} from the team? They lose access right away. Their pitches and trades stay.`
                          : `Give ${m.full_name} access again?`,
                      ) &&
                      action.run(
                        `active:${m.id}`,
                        () => supabase.rpc('set_member_active', { p_user: m.id, p_active: !m.active }),
                        m.active ? `${m.full_name} removed from the team` : `${m.full_name}'s access restored`,
                      )
                    }
                  >
                    {label(`active:${m.id}`, m.active ? 'Remove from team' : 'Restore access')}
                  </SmallButton>
                  <SmallButton tone="danger" disabled={busy} onClick={() => setRevoking(m)}>
                    Revoke & reissue
                  </SmallButton>
                </div>
              )}
            </li>
          )
        })}
      </Section>

      {revocations.length > 0 && (
        <Section title="Revoked accounts">
          {revocations.map((r) => (
            <li key={r.id} className="p-4 text-sm">
              <span className="font-medium break-all">{r.email}</span>
              <span className="text-slate-500">
                {' '}
                · revoked {formatDateTime(r.revoked_at)} by {nameOf(r.revoked_by)}
              </span>
            </li>
          ))}
        </Section>
      )}

      {link && <LinkSheet link={link} onClose={() => setLink(null)} />}

      {revoking && (
        <RevokeDialog
          member={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={async (token) => {
            const { email, full_name } = revoking
            await load()
            setRevoking(null)
            action.notify('success', `${full_name}'s account was deleted. Send the new link below.`)
            setLink({ email, token, expiresAt: inSevenDays() })
          }}
        />
      )}
    </div>
  )
}

function AddInvite({
  allowLeader,
  busy,
  saving,
  onSubmit,
}: {
  teamId: string
  allowLeader: boolean
  busy: boolean
  saving: boolean
  onSubmit: (email: string, role: AppRole) => Promise<boolean>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('member')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (await onSubmit(email.trim(), role)) {
      setEmail('')
      setRole('member')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">
      <h2 className="font-semibold">Invite someone</h2>
      <Field
        label="Their email"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="off"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {allowLeader && (
        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Role</legend>
          {(['member', 'leader'] as const).map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
              {r === 'member' ? 'Member' : 'Leader'}
            </label>
          ))}
        </fieldset>
      )}
      <Button type="submit" disabled={busy} loading={saving}>
        Create invite link
      </Button>
    </form>
  )
}

// Shows the link with Copy and Share buttons. The link is fetched first and
// shown here because iPhone/iPad Safari only allows copying to the clipboard
// directly inside a tap, not after waiting for the server.
function LinkSheet({ link, onClose }: { link: LinkInfo; onClose: () => void }) {
  const url = `${window.location.origin}/join?token=${link.token}`
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Clipboard blocked: select the text so the user can copy it by hand.
      document.querySelector<HTMLInputElement>('#invite-url')?.select()
    }
  }

  return (
    <Modal title="Invite link" onClose={onClose}>
      <p className="text-sm text-slate-600">
        Send this to <strong className="break-all">{link.email}</strong> only, by text or DM (not a group chat). It works
        once and expires {formatDate(link.expiresAt)}.
      </p>
      <input
        id="invite-url"
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
        aria-label="Invite link"
        className="block w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-base text-slate-700"
      />
      <div className="flex gap-2">
        <Button onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</Button>
        {canShare && (
          <Button variant="secondary" onClick={() => navigator.share({ url, title: 'Trade Journal invite' }).catch(() => {})}>
            Share…
          </Button>
        )}
      </div>
      <Button variant="secondary" onClick={onClose}>
        Done
      </Button>
    </Modal>
  )
}

function RevokeDialog({
  member,
  onClose,
  onRevoked,
}: {
  member: Profile
  onClose: () => void
  onRevoked: (token: string) => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmed = sameName(typed, member.full_name)

  const submitting = useRef(false) // synchronous guard against a fast double tap

  async function revoke() {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('revoke_and_reissue', { p_email: member.email })
    if (error || !data) {
      submitting.current = false
      setLoading(false)
      return setError(error?.message ?? 'Could not revoke.')
    }
    // Stay disabled until the roster has reloaded and the dialog closes.
    await onRevoked(data)
  }

  return (
    <Modal title="Revoke & reissue" onClose={onClose}>
      <p className="text-sm text-slate-700">
        This permanently deletes <strong>{member.full_name}</strong>'s account and signs them out everywhere. Their
        pitches and trades stay, marked 'Removed user'. A new invite link will be created.
      </p>
      <Field
        label={`Type "${member.full_name}" to confirm`}
        autoComplete="off"
        autoCapitalize="none"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      {error && <Alert>{error}</Alert>}
      <Button variant="danger" disabled={!confirmed} loading={loading} onClick={revoke}>
        Delete account and create new link
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</h2>
      <ul className="bg-white rounded-2xl ring-1 ring-slate-200 divide-y divide-slate-100">{children}</ul>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <li className="p-4 text-sm text-slate-500">{children}</li>
}

function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'danger'; children: ReactNode }) {
  const styles = tone === 'danger' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>
}

function SmallButton({
  tone = 'neutral',
  ...props
}: { tone?: 'neutral' | 'danger' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = tone === 'danger' ? 'text-red-700 ring-red-200 hover:bg-red-50' : 'text-slate-800 ring-slate-300 hover:bg-slate-50'
  return <button className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 bg-white disabled:opacity-60 ${styles}`} {...props} />
}
