import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Field } from '../components/ui'
import type { Database } from '../lib/database.types'
import { formatDateTime } from '../lib/format'
import { Link } from '../lib/router'
import { supabase } from '../lib/supabase'
import { ActionStatus, changed, useAction } from '../lib/useAction'
import { useLatest } from '../lib/useLatest'
import { useTeamContent } from '../lib/useTeamContent'

type Deadline = Database['public']['Tables']['deadlines']['Row']
type Submission = Database['public']['Tables']['deadline_submissions']['Row']

// "in 12 days", "in 5 hours", "2 days overdue"
function countdown(dueIso: string, now: number) {
  const ms = new Date(dueIso).getTime() - now
  const abs = Math.abs(ms)
  const days = Math.floor(abs / 86_400_000)
  const hours = Math.floor(abs / 3_600_000)
  const amount = days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`
  return { text: ms >= 0 ? `in ${amount}` : `${amount} overdue`, days: ms / 86_400_000 }
}

export default function HomePage() {
  const { me, team, teamId, picker, canWrite, isLeader } = useTeamContent()
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [awaiting, setAwaiting] = useState(0)
  const [tradesThisWeek, setTradesThisWeek] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  // Tick once a minute so the countdowns stay current on an open screen.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const begin = useLatest()

  const load = useCallback(async () => {
    if (!teamId) return
    const isLatest = begin()
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const [d, s, n, p, t] = await Promise.all([
      supabase.from('deadlines').select('*').or(`team_id.is.null,team_id.eq.${teamId}`).order('due_at'),
      supabase.from('deadline_submissions').select('*').eq('team_id', teamId),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('pitches').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('stage', 'pitched'),
      supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .is('voided_at', null)
        .gte('created_at', weekAgo),
    ])
    if (!isLatest()) return // an older, slower load must not overwrite a newer one
    setDeadlines(d.data ?? [])
    setSubmissions(s.data ?? [])
    setNames(new Map((n.data ?? []).map((x) => [x.id, x.full_name])))
    setAwaiting(p.count ?? 0)
    setTradesThisWeek(t.count ?? 0)
  }, [teamId, begin])

  useEffect(() => {
    load()
  }, [load])

  // Every deadline action: one at a time, buttons disabled meanwhile, then
  // the screen reloads and shows a success or error message.
  const action = useAction(load)

  const toggle = (d: Deadline, submitted: boolean) =>
    action.run(
      `toggle:${d.id}`,
      () =>
        changed(
          submitted
            ? supabase.from('deadline_submissions').delete().eq('team_id', teamId!).eq('deadline_id', d.id).select('deadline_id')
            : supabase.from('deadline_submissions').insert({ team_id: teamId!, deadline_id: d.id }).select('deadline_id'),
        ),
      submitted ? `"${d.title}" marked not submitted` : `"${d.title}" marked submitted`,
    )

  if (!me) return null
  const official = deadlines.filter((d) => d.team_id === null)
  const custom = deadlines.filter((d) => d.team_id !== null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Hi, {me.full_name}</h1>
          <p className="text-sm text-slate-500">
            {me.role === 'advisor' ? 'Advisor · read-only' : `${team?.name ?? ''} · ${me.is_president ? 'Leader · President' : me.role === 'leader' ? 'Leader' : 'Member'}`}
          </p>
        </div>
        {picker}
      </div>

      <ActionStatus status={action.status} />

      {team?.is_sandbox && (
        <Alert tone="info">
          <strong>Sandbox:</strong> a test team for checking the app after each deploy. Nothing here counts toward the
          competition, and it doesn't appear in the president overview.
        </Alert>
      )}

      {!team?.is_sandbox && (
        <section aria-labelledby="official-title" className="space-y-3">
          <h2 id="official-title" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Competition deadlines
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {official.map((d) => (
              <DeadlineCard
                key={d.id}
                deadline={d}
                now={now}
                submission={submissions.find((s) => s.deadline_id === d.id)}
                submittedBy={(id) => (id && names.get(id)) || 'Removed user'}
                isLeader={isLeader}
                busyKey={action.busy}
                onToggle={(sub) => toggle(d, sub)}
                big
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="team-deadlines" className="space-y-3">
        <h2 id="team-deadlines" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Team deadlines
        </h2>
        {custom.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {custom.map((d) => (
            <DeadlineCard
              key={d.id}
              deadline={d}
              now={now}
              submission={submissions.find((s) => s.deadline_id === d.id)}
              submittedBy={(id) => (id && names.get(id)) || 'Removed user'}
              isLeader={isLeader}
              busyKey={action.busy}
              onToggle={(sub) => toggle(d, sub)}
              onDelete={
                isLeader
                  ? () =>
                      confirm(`Delete "${d.title}"?`) &&
                      action.run(
                        `delete:${d.id}`,
                        () => changed(supabase.from('deadlines').delete().eq('id', d.id).select('id')),
                        `"${d.title}" deleted`,
                      )
                  : undefined
              }
            />
          ))}
        </div>
        {isLeader && teamId && (
          <AddDeadline
            busy={action.busy !== null}
            saving={action.busy === 'add-deadline'}
            onSubmit={(title, due) =>
              action.run(
                'add-deadline',
                () => supabase.from('deadlines').insert({ team_id: teamId, title, due_at: due }),
                `"${title}" added`,
              )
            }
          />
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link to="/pipeline" className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 hover:ring-slate-400">
          <div className="text-3xl font-bold tabular-nums">{awaiting}</div>
          <div className="text-sm text-slate-600">pitch{awaiting === 1 ? '' : 'es'} awaiting a leader decision</div>
        </Link>
        <Link to="/trades" className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 hover:ring-slate-400">
          <div className="text-3xl font-bold tabular-nums">{tradesThisWeek}</div>
          <div className="text-sm text-slate-600">trade{tradesThisWeek === 1 ? '' : 's'} logged in the last 7 days</div>
        </Link>
      </section>

      {canWrite && (
        <div className="grid grid-cols-2 gap-3">
          <Link to="/pipeline/new" className="rounded-lg bg-white ring-1 ring-slate-300 py-3 text-center font-semibold">
            New idea
          </Link>
          <Link to="/trades/new" className="rounded-lg bg-slate-900 text-white py-3 text-center font-semibold">
            Log trade
          </Link>
        </div>
      )}
    </div>
  )
}

function DeadlineCard({
  deadline: d,
  now,
  submission,
  submittedBy,
  isLeader,
  busyKey,
  onToggle,
  onDelete,
  big,
}: {
  deadline: Deadline
  now: number
  submission?: Submission
  submittedBy: (id: string | null) => string
  isLeader: boolean
  busyKey: string | null
  onToggle: (currentlySubmitted: boolean) => void
  onDelete?: () => void
  big?: boolean
}) {
  const c = countdown(d.due_at, now)
  const urgent = !submission && c.days < 7
  return (
    <div
      className={`bg-white rounded-2xl ring-1 p-4 space-y-2 ${urgent ? 'ring-amber-300' : 'ring-slate-200'}`}
      data-testid="deadline"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{d.title}</h3>
        {submission ? (
          <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-semibold">Submitted ✓</span>
        ) : (
          <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-semibold">Not submitted</span>
        )}
      </div>
      <div className={big ? 'text-3xl font-bold tabular-nums' : 'text-xl font-bold tabular-nums'}>
        {submission ? '—' : c.text}
      </div>
      <p className="text-sm text-slate-500">
        Due {formatDateTime(d.due_at)}
        {submission && ` · submitted ${formatDateTime(submission.submitted_at)} by ${submittedBy(submission.submitted_by)}`}
      </p>
      {(isLeader || onDelete) && (
        <div className="flex gap-3 text-sm">
          {isLeader && (
            <button
              disabled={busyKey !== null}
              onClick={() => onToggle(!!submission)}
              className="font-medium text-slate-900 hover:underline disabled:opacity-50"
            >
              {busyKey === `toggle:${d.id}` ? 'Saving…' : submission ? 'Undo submitted' : 'Mark submitted'}
            </button>
          )}
          {onDelete && (
            <button
              disabled={busyKey !== null}
              onClick={onDelete}
              className="font-medium text-red-700 hover:underline disabled:opacity-50"
            >
              {busyKey === `delete:${d.id}` ? 'Saving…' : 'Delete'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AddDeadline({
  busy,
  saving,
  onSubmit,
}: {
  busy: boolean
  saving: boolean
  onSubmit: (title: string, dueIso: string) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('17:00')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    // The browser turns local date + time into an exact moment.
    const due = new Date(`${date}T${time || '17:00'}`).toISOString()
    if (await onSubmit(title.trim(), due)) {
      setTitle('')
      setDate('')
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">
      <h3 className="font-semibold">Add a team deadline</h3>
      <Field label="What's due" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Field label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <Button type="submit" variant="secondary" disabled={!title.trim() || !date || busy} loading={saving}>
        Add deadline
      </Button>
    </form>
  )
}
