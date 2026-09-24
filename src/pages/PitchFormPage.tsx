import { useEffect, useState } from 'react'
import { Alert, Button, Field, TextArea } from '../components/ui'
import type { Database } from '../lib/database.types'
import { friendlyError } from '../lib/format'
import { ASSET_CLASSES, type AssetClass } from '../lib/labels'
import { Link, navigate } from '../lib/router'
import { supabase } from '../lib/supabase'
import { useTeamContent } from '../lib/useTeamContent'

type Pitch = Database['public']['Tables']['pitches']['Row']
type Objective = { id: string; text: string }

// New idea (pitchId undefined) or edit an existing pitch.
export default function PitchFormPage({ pitchId }: { pitchId?: string }) {
  const { teamId, canWrite } = useTeamContent()
  const [existing, setExisting] = useState<Pitch | null>(null)
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [f, setF] = useState({
    ticker: '',
    asset_type: 'stock' as AssetClass,
    thesis: '',
    objective_id: '',
    key_risk: '',
    exit_trigger: '',
    sources: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!teamId) return
    supabase
      .from('client_objectives')
      .select('id, text')
      .eq('team_id', teamId)
      .order('sort_order')
      .then(({ data }) => setObjectives(data ?? []))
    if (pitchId) {
      supabase
        .from('pitches')
        .select('*')
        .eq('id', pitchId)
        .single()
        .then(({ data }) => {
          if (!data) return
          setExisting(data)
          setF({
            ticker: data.ticker,
            asset_type: data.asset_type,
            thesis: data.thesis,
            objective_id: data.objective_id ?? '',
            key_risk: data.key_risk,
            exit_trigger: data.exit_trigger,
            sources: data.sources,
          })
        })
    }
  }, [teamId, pitchId])

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const ticker = f.ticker.trim().toUpperCase()
  const basicsOk = ticker !== '' && f.thesis.trim() !== ''
  const readyToPitch = basicsOk && f.objective_id !== '' && f.key_risk.trim() !== '' && f.exit_trigger.trim() !== ''
  const stage = existing?.stage ?? 'idea'

  async function save(nextStage: Pitch['stage']) {
    if (!teamId) return
    setSaving(true)
    setError(null)
    const fields = {
      ticker,
      asset_type: f.asset_type,
      thesis: f.thesis.trim(),
      objective_id: f.objective_id || null,
      key_risk: f.key_risk.trim(),
      exit_trigger: f.exit_trigger.trim(),
      sources: f.sources.trim(),
      stage: nextStage,
    }
    const res = existing
      ? await supabase.from('pitches').update(fields).eq('id', existing.id).select('id').single()
      : await supabase.from('pitches').insert({ ...fields, team_id: teamId }).select('id').single()
    setSaving(false)
    if (res.error) return setError(friendlyError(res.error.message))
    navigate(`/pipeline/${res.data.id}`)
  }

  if (!canWrite) return <Alert tone="info">Only members of this team can add or edit pitches.</Alert>
  // When editing, wait for the pitch to load before showing the form;
  // otherwise the loaded values could overwrite what the student already typed.
  if (pitchId && !existing) return null

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{existing ? `Edit ${existing.ticker}` : 'New idea'}</h1>
        <Link to={existing ? `/pipeline/${existing.id}` : '/pipeline'} className="text-sm text-slate-600 hover:underline">
          Cancel
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Ticker"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={f.ticker}
          onChange={set('ticker')}
        />
        <div>
          <label htmlFor="asset" className="block text-sm font-medium text-slate-700 mb-1">
            Asset type
          </label>
          <select
            id="asset"
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            value={f.asset_type}
            onChange={set('asset_type')}
          >
            {ASSET_CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label.replace(/s$/, '')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <TextArea label="Thesis: why this?" rows={4} value={f.thesis} onChange={set('thesis')} />

      <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 space-y-4">
        <p className="text-sm text-slate-600">Needed before it can be pitched to the team:</p>
        <div>
          <label htmlFor="objective" className="block text-sm font-medium text-slate-700 mb-1">
            Client objective it serves
          </label>
          <select
            id="objective"
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            value={f.objective_id}
            onChange={set('objective_id')}
          >
            <option value="">Choose an objective…</option>
            {objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.text}
              </option>
            ))}
          </select>
          {objectives.length === 0 && (
            <p className="text-xs text-amber-800 mt-1">
              No objectives yet. A team leader adds them on the Client profile screen.
            </p>
          )}
        </div>
        <TextArea label="Key risk" rows={2} value={f.key_risk} onChange={set('key_risk')} />
        <TextArea
          label="Exit trigger: what would make us sell?"
          rows={2}
          value={f.exit_trigger}
          onChange={set('exit_trigger')}
        />
      </div>

      <TextArea
        label="Sources and links"
        rows={3}
        placeholder="One per line"
        value={f.sources}
        onChange={set('sources')}
      />

      {error && <Alert>{error}</Alert>}

      {stage === 'idea' ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={!basicsOk} loading={saving} onClick={() => save('idea')}>
            Save as idea
          </Button>
          <Button disabled={!readyToPitch} loading={saving} onClick={() => save('pitched')}>
            Pitch to team
          </Button>
        </div>
      ) : (
        <Button
          disabled={stage === 'pitched' ? !readyToPitch : !basicsOk}
          loading={saving}
          onClick={() => save(stage)}
        >
          Save changes
        </Button>
      )}
    </div>
  )
}
