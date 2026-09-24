import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import StageBadge from '../components/StageBadge'
import { Alert, Button, TextArea } from '../components/ui'
import type { Database } from '../lib/database.types'
import { formatDate, formatDateTime, friendlyError } from '../lib/format'
import { ASSET_LABEL } from '../lib/labels'
import { money } from '../lib/portfolio'
import { Link } from '../lib/router'
import { supabase } from '../lib/supabase'
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
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, c, t, n] = await Promise.all([
      supabase.from('pitch_board').select('*').eq('id', pitchId).maybeSingle(),
      supabase.from('pitch_comments').select('*').eq('pitch_id', pitchId).order('created_at'),
      supabase.from('trades').select('*').eq('pitch_id', pitchId).order('trade_date'),
      supabase.from('profiles').select('id, full_name'),
    ])
    setPitch(p.data)
    setComments(c.data ?? [])
    setTrades(t.data ?? [])
    setNames(new Map((n.data ?? []).map((x) => [x.id, x.full_name])))
    if (p.data?.objective_id) {
      const { data } = await supabase.from('client_objectives').select('text').eq('id', p.data.objective_id).maybeSingle()
      setObjective(data?.text ?? null)
    } else setObjective(null)
  }, [pitchId])

  useEffect(() => {
    load()
  }, [load])

  if (pitch === undefined) return null
  if (pitch === null) return <Alert>Pitch not found.</Alert>

  const who = (id: string | null) => (id && names.get(id)) || 'Removed user'
  // Mirrors the database rules: authors edit ideas/pitches; leaders edit anything.
  const isAuthor = pitch.created_by === me?.id
  const canEdit = canWrite && (isLeader || (isAuthor && (pitch.stage === 'idea' || pitch.stage === 'pitched')))

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    const { error } = await action()
    if (error) setError(friendlyError(error.message))
    await load()
  }
  const setStage = (stage: Pitch['stage'] & string) =>
    run(() => supabase.from('pitches').update({ stage }).eq('id', pitchId))
  const vote = (value: number | null) =>
    run(() => supabase.rpc('cast_vote', { p_pitch: pitchId, p_value: value as number }))

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

      {error && <Alert>{error}</Alert>}

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
          <VoteButton label="Vote up" active={pitch.my_vote === 1} onClick={() => vote(pitch.my_vote === 1 ? null : 1)}>
            ▲ {pitch.up_votes}
          </VoteButton>
          <VoteButton
            label="Vote down"
            active={pitch.my_vote === -1}
            onClick={() => vote(pitch.my_vote === -1 ? null : -1)}
          >
            ▼ {pitch.down_votes}
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
                onClick={() => setStage('approved')}
                className="rounded-lg px-3 py-2 text-sm font-semibold bg-emerald-700 text-white"
              >
                Approve
              </button>
              <button
                onClick={() => confirm(`Reject ${pitch.ticker}?`) && setStage('rejected')}
                className="rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-red-200 text-red-700 bg-white"
              >
                Reject
              </button>
            </>
          )}
          {isLeader && pitch.stage === 'rejected' && (
            <button onClick={() => setStage('pitched')} className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 bg-white">
              Reopen as pitch
            </button>
          )}
          {isLeader && pitch.stage === 'approved' && trades.every((t) => t.voided_at) && (
            <button onClick={() => setStage('pitched')} className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 bg-white">
              Undo approval
            </button>
          )}
        </div>
      )}
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
        {canWrite && <CommentForm pitchId={pitchId} teamId={pitch.team_id!} onPosted={load} />}
      </Section>
    </div>
  )
}

function CommentForm({ pitchId, teamId, onPosted }: { pitchId: string; teamId: string; onPosted: () => Promise<void> }) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('pitch_comments')
      .insert({ pitch_id: pitchId, team_id: teamId, body: body.trim() }) // server re-sets team and author
    setSaving(false)
    if (error) return setError(error.message)
    setBody('')
    await onPosted()
  }

  return (
    <form onSubmit={submit} className="space-y-2 pt-3">
      <TextArea label="Add a comment" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="secondary" disabled={!body.trim()} loading={saving}>
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
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 tabular-nums ${
        active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white ring-slate-300'
      }`}
    >
      {children}
    </button>
  )
}
