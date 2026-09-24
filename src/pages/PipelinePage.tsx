import { useEffect, useState, type ReactNode } from 'react'
import StageBadge from '../components/StageBadge'
import { ASSET_LABEL, STAGES, type DisplayStage } from '../lib/labels'
import { Link } from '../lib/router'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import { useTeamContent } from '../lib/useTeamContent'

type PitchCard = Database['public']['Views']['pitch_board']['Row']

export default function PipelinePage() {
  const { teamId, picker, canWrite } = useTeamContent()
  const [pitches, setPitches] = useState<PitchCard[]>([])
  const [objectives, setObjectives] = useState<Map<string, string>>(new Map())
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [filter, setFilter] = useState<DisplayStage | 'all'>('all')

  useEffect(() => {
    if (!teamId) return
    Promise.all([
      supabase.from('pitch_board').select('*').eq('team_id', teamId).order('updated_at', { ascending: false }),
      supabase.from('client_objectives').select('id, text').eq('team_id', teamId),
      supabase.from('profiles').select('id, full_name'),
    ]).then(([p, o, n]) => {
      setPitches(p.data ?? [])
      setObjectives(new Map((o.data ?? []).map((x) => [x.id, x.text])))
      setNames(new Map((n.data ?? []).map((x) => [x.id, x.full_name])))
    })
  }, [teamId])

  const count = (s: DisplayStage) => pitches.filter((p) => p.display_stage === s).length
  const shown = filter === 'all' ? pitches : pitches.filter((p) => p.display_stage === filter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Pipeline</h1>
        {picker}
        {canWrite && (
          <Link to="/pipeline/new" className="rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold">
            New idea
          </Link>
        )}
      </div>

      {/* Stage filter: scrolls sideways on narrow phones instead of wrapping. */}
      <div className="-mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 w-max" role="tablist" aria-label="Filter by stage">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All {pitches.length}
          </Chip>
          {STAGES.map((s) => (
            <Chip key={s.value} active={filter === s.value} onClick={() => setFilter(s.value)}>
              {s.label} {count(s.value)}
            </Chip>
          ))}
        </div>
      </div>

      {shown.length === 0 && (
        <p className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 text-sm text-slate-500">
          {pitches.length === 0 ? 'No ideas yet. Anyone on the team can add one.' : 'Nothing in this stage.'}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((p) => (
          <li key={p.id}>
            <Link
              to={`/pipeline/${p.id}`}
              className="block bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-2 hover:ring-slate-400 h-full"
              data-testid="pitch-card"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-lg">{p.ticker}</span>
                  <span className="text-xs text-slate-500">{p.asset_type ? ASSET_LABEL[p.asset_type] : ''}</span>
                </div>
                <StageBadge stage={p.display_stage ?? 'idea'} />
              </div>
              <p className="text-sm text-slate-800 line-clamp-2">{p.thesis}</p>
              {p.objective_id && objectives.get(p.objective_id) && (
                <p className="text-xs text-slate-500">Serves: {objectives.get(p.objective_id)}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>{(p.created_by && names.get(p.created_by)) || 'Removed user'}</span>
                <span aria-label={`${p.up_votes} up votes`}>▲ {p.up_votes}</span>
                <span aria-label={`${p.down_votes} down votes`}>▼ {p.down_votes}</span>
                <span aria-label={`${p.comment_count} comments`}>💬 {p.comment_count}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
        active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300'
      }`}
    >
      {children}
    </button>
  )
}
