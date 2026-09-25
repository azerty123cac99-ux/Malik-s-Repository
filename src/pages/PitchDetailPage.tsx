import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import StageBadge from '../components/StageBadge'
import { Alert, Button, TextArea } from '../components/ui'
import type { Database } from '../lib/database.types'
import { formatDate, formatDateTime } from '../lib/format'
import { ASSET_LABEL } from '../lib/labels'
import { money } from '../lib/portfolio'
import { Link } from '../lib/router'
import { supabase } from '../lib/supabase'
import { ActionStatus, changed, useAction, useFlash } from '../lib/useAction'
import { useLatest } from '../lib/useLatest'
import { useTeamContent } from '../lib/useTeamContent'

type Pitch = Database['public']['Views']['pitch_board']['Row']
type Comment = Database['public']['Tables']['pitch_comments']['Row']
type Trade = Database['public']['Tables']['trades']['Row']

export default function PitchDetailPage({ pitchId }: { pitchId: string }) {
  const { me, canWrite, isLeader } = useTeamContent()
  const [pitch, setPitch] = useState<Pitch | null | undefined>(undefined)
  const [comments, setComments] = useState<Comment[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [objective, setObjective] = useState<string | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const begin = useLatest()

  const load = useCallback(async () => {
    const isLatest = begin()
    const [p, c, t, n] = await Promise.all([
      supabase.from('pitch_board').select('*').eq('id', pitchId).maybeSingle(),
      supabase.from('pitch_comments').select('*').eq('pitch_id', pitchId).order('created_at'),
      supabase.from('trades').select('*').eq('pitch_id', pitchId).order('trade_date'),
      supabase.from('profiles').select('id, full_name'),
    ])
    const objective = p.data?.objective_id
      ? (await supabase.from('client_objectives').select('text').eq('id', p.data.objective_id).maybeSingle()).data
      : null
    if (!isLatest()) return // a newer load started (e.g. after a vote); keep its result
    setPitch(p.data)
    setComments(c.data ?? [])
    setTrades(t.data ?? [])
    setNames(new Map((n.data ?? []).map((x) => [x.id, x.full_name])))
    setObjective(objective?.text ?? null)
  }, [pitchId, begin])

  useEffect(() => {
    load()
  }, [load])

  // Every write on this page: one at a time, buttons disabled meanwhile,
  // then the page reloads and shows a success or error message.
  const action = useAction(load)
  const arrived = useFlash() // e.g. "Pitch saved" after the edit form

  if (pitch === undefined) return null
  if (pitch === null) return <Alert>Pitch not found.</Alert>

  const who = (id: string | null) => (id && names.get(id)) || 'Removed user'
  // Mirrors the database rules: authors edit ideas/pitches; leaders edit anything.
  const isAuthor = pitch.created_by === me?.id
  const canEdit = canWrite && (isLeader || (isAuthor && (pitch.stage === 'idea' || pitch.stage === 'pitched')))

  const busy = action.busy !== null
  const setStage = (key: string, stage: Pitch['stage'] & string, done: string) =>
    action.run(key, () => changed(supabase.from('pitches').update({ stage }).eq('id', pitchId).select('id')), done)
  const vote = (key: string, value: number | null) =>
    action.run(
      key,
      () => supabase.rpc('cast_vote', { p_pitch: pitchId, p_value: value as number }),
      value === null ? 'Vote removed' : 'Vote saved',
    )
  const label = (key: string, text: string) => (action.busy === key ? 'Saving…' : text)

  return (
    <div className="space-y-5 max-w-2xl">
      <Link to="/pipeline" className="text-sm text-slate-600 hover:underline">
        ← Pipeline
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{pitch.ticker}</h1>
          <p className="text-sm text-slate-500">
            {pitch.asset_type ? ASSET_LABEL[pitch.asset_type] : ''} · by {who(pitch.created_by)} ·{' '}
            {formatDate(pitch.created_at!)}
          </p>
        </div>
        <StageBadge stage={pitch.display_stage ?? 'idea'} />
      </div>

      <Section title="Thesis">
        <p className="whitespace-pre-wrap">{pitch.thesis}</p>
      </Section>
      <div className="grid gap-3 sm:grid-cols-3">
        <Section title="Serves objective">{objective ?? <Missing />}</Section>
        <Section title="Key risk">{pitch.key_risk || <Missing />}</Section>
        <Section title="Exit trigger">{pitch.exit_trigger || <Missing />}</Section>
      </div>
      {pitch.sources && (
        <Section title="Sources">
          <ul className="space-y-1 text-sm break-all">
            {pitch.sources.split('\n').map((line, i) => (
              <li key={i}>
                {/^https?:\/\//.test(line.trim()) ? (
                  <a href={line.trim()} target="_blank" rel="noreferrer noopener" className="text-blue-700 underline">
                    {line.trim()}
                  </a>
                ) : (
                  line
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {pitch.decided_at && (
        <p className="text-sm text-slate-500">
          {pitch.stage === 'approved' ? 'Approved' : 'Rejected'} by {who(pitch.decided_by)} on{' '}
          {formatDateTime(pitch.decided_at)}
        </p>
      )}

      {/* Actions */}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <VoteButton
            label="Vote up"
            active={pitch.my_vote === 1}
            disabled={busy}
            onClick={() => vote('up', pitch.my_vote === 1 ? null : 1)}
          >
            {action.busy === 'up' ? 'Saving…' : `▲ ${pitch.up_votes}`}
          </VoteButton>
          <VoteButton
            label="Vote down"
            active={pitch.my_vote === -1}
            disabled={busy}
            onClick={() => vote('down', pitch.my_vote === -1 ? null : -1)}
          >
            {action.busy === 'down' ? 'Saving…' : `▼ ${pitch.down_votes}`}
          </VoteButton>
          {canEdit && (
            <Link
              to={`/pipeline/${pitch.id}/edit`}
              className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-slate-300 bg-white"
            >
              Edit
            </Link>
          )}
          {isLeader && pitch.stage === 'pitched' && (
            <>
              <button
                disabled={busy}
                onClick={() => setStage('approve', 'approved', 'Pitch approved')}
                className="rounded-lg px-3 py-2 text-sm font-semibold bg-emerald-700 text-white disabled:opacity-60"
              >
                {label('approve', 'Approve')}
              </button>
              <button
                disabled={busy}
                onClick={() => confirm(`Reject ${pitch.ticker}?`) && setStage('reject', 'rejected', 'Pitch rejected')}
                className="rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-red-200 text-red-700 bg-white disabled:opacity-60"
              >
                {label('reject', 'Reject')}
              </button>
            </>
          )}
          {isLeader && pitch.stage === 'rejected' && (
            <button
              disabled={busy}
              onClick={() => setStage('reopen', 'pitched', 'Pitch reopened')}
              className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 bg-white disabled:opacity-60"
            >
              {label('reopen', 'Reopen as pitch')}
            </button>
          )}
          {isLeader && pitch.stage === 'approved' && trades.every((t) => t.voided_at) && (
            <button
              disabled={busy}
              onClick={() => setStage('unapprove', 'pitched', 'Approval undone')}
              className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 bg-white disabled:opacity-60"
            >
              {label('unapprove', 'Undo approval')}
            </button>
          )}
        </div>
      )}
      <ActionStatus status={action.status ?? arrived} />
      {!canWrite && (
        <p className="text-sm text-slate-500">
          ▲ {pitch.up_votes} · ▼ {pitch.down_votes}
        </p>
      )}
      {isAuthor && pitch.stage === 'idea' && (
        <Alert tone="info">
          This is still an idea. Edit it to add the objective, key risk and exit trigger, then pitch it to the team.
        </Alert>
      )}

      {trades.length > 0 && (
        <Section title="Trades">
          <ul className="divide-y divide-slate-100 text-sm">
            {trades.map((t) => (
              <li key={t.id} className={`py-2 ${t.voided_at ? 'line-through text-slate-400' : ''}`}>
                {formatDate(t.trade_date)} · {t.side.toUpperCase()} {Number(t.quantity).toLocaleString()} @{' '}
                {money(Number(t.price))} · {who(t.placed_by)}
                {t.voided_at && ' (voided)'}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Discussion (${comments.length})`}>
        {comments.length === 0 && <p className="text-sm text-slate-500">No comments yet.</p>}
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="text-slate-500">
                <strong className="text-slate-800">{who(c.author_id)}</strong> · {formatDateTime(c.created_at)}
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
        {canWrite && (
          <CommentForm
            busy={busy}
            saving={action.busy === 'comment'}
            onPost={(body) =>
              action.run(
                'comment',
                // team_id is re-set by the server; sent because the type requires it
                () => supabase.from('pitch_comments').insert({ pitch_id: pitchId, team_id: pitch.team_id!, body }),
                'Comment posted',
              )
            }
          />
        )}
      </Section>
    </div>
  )
}

function CommentForm({
  busy,
  saving,
  onPost,
}: {
  busy: boolean
  saving: boolean
  onPost: (body: string) => Promise<boolean>
}) {
  const [body, setBody] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !body.trim()) return
    if (await onPost(body.trim())) setBody('') // keep the text if it failed
  }

  return (
    <form onSubmit={submit} className="space-y-2 pt-3">
      <TextArea label="Add a comment" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" variant="secondary" disabled={!body.trim() || busy} loading={saving}>
        Post comment
      </Button>
    </form>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="text-slate-900">{children}</div>
    </section>
  )
}

function Missing() {
  return <span className="text-slate-400">Not filled in</span>
}

function VoteButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 tabular-nums disabled:opacity-60 ${
        active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white ring-slate-300'
      }`}
    >
      {children}
    </button>
  )
}
