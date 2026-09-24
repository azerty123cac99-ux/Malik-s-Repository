import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Field, TextArea } from '../components/ui'
import type { Database } from '../lib/database.types'
import { formatDateTime } from '../lib/format'
import { ASSET_CLASSES, type AssetClass } from '../lib/labels'
import { supabase } from '../lib/supabase'
import { useTeamContent } from '../lib/useTeamContent'

type Profile = Database['public']['Tables']['client_profiles']['Row']
type Objective = Database['public']['Tables']['client_objectives']['Row']
type Limit = Database['public']['Tables']['asset_class_limits']['Row']
type Risk = Database['public']['Enums']['risk_tolerance']

const RISK_LABEL: Record<Risk, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export default function ClientPage() {
  const { teamId, picker, isLeader } = useTeamContent()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [limits, setLimits] = useState<Limit[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editorName, setEditorName] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!teamId) return
    const [p, o, l] = await Promise.all([
      supabase.from('client_profiles').select('*').eq('team_id', teamId).maybeSingle(),
      supabase.from('client_objectives').select('*').eq('team_id', teamId).order('sort_order').order('created_at'),
      supabase.from('asset_class_limits').select('*').eq('team_id', teamId),
    ])
    setProfile(p.data)
    setObjectives(o.data ?? [])
    setLimits(l.data ?? [])
    setLoaded(true)
    if (p.data?.updated_by) {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', p.data.updated_by).maybeSingle()
      setEditorName(data?.full_name ?? null)
    }
  }, [teamId])

  useEffect(() => {
    load()
  }, [load])

  if (!loaded || !teamId) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Client profile</h1>
        {picker}
        {isLeader && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold"
          >
            {profile ? 'Edit' : 'Set up'}
          </button>
        )}
      </div>

      {editing ? (
        <ClientForm
          teamId={teamId}
          profile={profile}
          objectives={objectives}
          limits={limits}
          onDone={async () => {
            setEditing(false)
            await load()
          }}
        />
      ) : !profile ? (
        <Alert tone="info">
          {isLeader
            ? 'Set up the client profile first: pitches need a client objective before they can be pitched.'
            : "Your team leader hasn't filled in the client profile yet."}
        </Alert>
      ) : (
        <ClientView profile={profile} objectives={objectives} limits={limits} editorName={editorName} />
      )}
    </div>
  )
}

function ClientView({
  profile: p,
  objectives,
  limits,
  editorName,
}: {
  profile: Profile
  objectives: Objective[]
  limits: Limit[]
  editorName: string | null
}) {
  return (
    <>
      <Card>
        <h2 className="text-lg font-bold">{p.client_name || 'Unnamed client'}</h2>
        {p.summary && <p className="text-slate-700 whitespace-pre-wrap">{p.summary}</p>}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <Item label="Risk tolerance">{p.risk_tolerance ? RISK_LABEL[p.risk_tolerance] : '—'}</Item>
          <Item label="Time horizon">{p.time_horizon || '—'}</Item>
          <Item label="Liquidity needs">{p.liquidity_needs || '—'}</Item>
        </dl>
        {p.constraints && (
          <dl>
            <Item label="Constraints">{p.constraints}</Item>
          </dl>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Objectives</h2>
        {objectives.length === 0 ? (
          <p className="text-sm text-slate-500">No objectives yet.</p>
        ) : (
          <ol className="list-decimal pl-5 space-y-1">
            {objectives.map((o) => (
              <li key={o.id}>{o.text}</li>
            ))}
          </ol>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Allocation limits</h2>
        <dl className="grid grid-cols-2 gap-3">
          <Item label="Max per position">{p.max_position_pct != null ? `${Number(p.max_position_pct)}%` : '—'}</Item>
          <Item label="Max per sector">{p.max_sector_pct != null ? `${Number(p.max_sector_pct)}%` : '—'}</Item>
        </dl>
        {limits.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left font-medium py-1">Asset class</th>
                <th className="text-right font-medium py-1">Min</th>
                <th className="text-right font-medium py-1">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ASSET_CLASSES.filter((c) => limits.some((l) => l.asset_class === c.value)).map((c) => {
                const l = limits.find((x) => x.asset_class === c.value)!
                return (
                  <tr key={c.value}>
                    <td className="py-1.5">{c.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(l.min_pct)}%</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(l.max_pct)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Last updated {formatDateTime(p.updated_at)}
        {editorName ? ` by ${editorName}` : ''}.
      </p>
    </>
  )
}

type ObjectiveDraft = { id?: string; text: string }
type LimitDraft = Record<AssetClass, { min: string; max: string }>

function ClientForm({
  teamId,
  profile,
  objectives,
  limits,
  onDone,
}: {
  teamId: string
  profile: Profile | null
  objectives: Objective[]
  limits: Limit[]
  onDone: () => Promise<void>
}) {
  const [f, setF] = useState({
    client_name: profile?.client_name ?? '',
    summary: profile?.summary ?? '',
    risk_tolerance: (profile?.risk_tolerance ?? '') as Risk | '',
    time_horizon: profile?.time_horizon ?? '',
    liquidity_needs: profile?.liquidity_needs ?? '',
    constraints: profile?.constraints ?? '',
    max_position_pct: profile?.max_position_pct?.toString() ?? '',
    max_sector_pct: profile?.max_sector_pct?.toString() ?? '',
  })
  const [objs, setObjs] = useState<ObjectiveDraft[]>(
    objectives.length ? objectives.map((o) => ({ id: o.id, text: o.text })) : [{ text: '' }],
  )
  const [lims, setLims] = useState<LimitDraft>(() => {
    const d = {} as LimitDraft
    for (const c of ASSET_CLASSES) {
      const l = limits.find((x) => x.asset_class === c.value)
      d[c.value] = { min: l ? String(Number(l.min_pct)) : '', max: l ? String(Number(l.max_pct)) : '' }
    }
    return d
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  async function save() {
    setSaving(true)
    setError(null)
    const fail = (msg: string) => {
      setError(msg)
      setSaving(false)
    }

    const { error: pe } = await supabase.from('client_profiles').upsert({
      team_id: teamId,
      client_name: f.client_name.trim(),
      summary: f.summary.trim(),
      risk_tolerance: f.risk_tolerance || null,
      time_horizon: f.time_horizon.trim(),
      liquidity_needs: f.liquidity_needs.trim(),
      constraints: f.constraints.trim(),
      max_position_pct: num(f.max_position_pct),
      max_sector_pct: num(f.max_sector_pct),
    })
    if (pe) return fail(pe.message)

    // Objectives: update edited ones, add new ones, delete removed ones.
    const kept = objs.filter((o) => o.text.trim())
    for (const [i, o] of kept.entries()) {
      const { error } = o.id
        ? await supabase.from('client_objectives').update({ text: o.text.trim(), sort_order: i }).eq('id', o.id)
        : await supabase.from('client_objectives').insert({ team_id: teamId, text: o.text.trim(), sort_order: i })
      if (error) return fail(error.message)
    }
    for (const o of objectives.filter((o) => !kept.some((k) => k.id === o.id))) {
      const { error } = await supabase.from('client_objectives').delete().eq('id', o.id)
      if (error) {
        return fail(
          error.code === '23503'
            ? `"${o.text}" is used by a pitch, so it can't be removed. Edit its wording instead.`
            : error.message,
        )
      }
    }

    // Asset class limits: a row for each class with a value; none if blank.
    for (const c of ASSET_CLASSES) {
      const { min, max } = lims[c.value]
      if (min.trim() === '' && max.trim() === '') {
        await supabase.from('asset_class_limits').delete().eq('team_id', teamId).eq('asset_class', c.value)
      } else {
        const { error } = await supabase
          .from('asset_class_limits')
          .upsert({ team_id: teamId, asset_class: c.value, min_pct: num(min) ?? 0, max_pct: num(max) ?? 100 })
        if (error) return fail(`${c.label}: ${error.code === '23514' ? 'min must be ≤ max, both 0–100' : error.message}`)
      }
    }

    setSaving(false)
    await onDone()
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <h2 className="font-semibold">Client</h2>
        <Field label="Client name" value={f.client_name} onChange={set('client_name')} />
        <TextArea label="Summary" rows={3} value={f.summary} onChange={set('summary')} />
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1">Risk tolerance</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Risk tolerance">
            {(['low', 'medium', 'high'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={f.risk_tolerance === r}
                onClick={() => setF({ ...f, risk_tolerance: r })}
                className={`rounded-lg py-2.5 font-medium ring-1 ${
                  f.risk_tolerance === r ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white ring-slate-300'
                }`}
              >
                {RISK_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Time horizon" placeholder="e.g. 10+ years" value={f.time_horizon} onChange={set('time_horizon')} />
        <Field
          label="Liquidity needs"
          placeholder="e.g. 5% withdrawn each year"
          value={f.liquidity_needs}
          onChange={set('liquidity_needs')}
        />
        <TextArea
          label="Constraints"
          rows={2}
          placeholder="e.g. no tobacco or weapons companies"
          value={f.constraints}
          onChange={set('constraints')}
        />
      </Card>

      <Card>
        <h2 className="font-semibold">Objectives</h2>
        <p className="text-sm text-slate-500">Every pitch must name the objective it serves.</p>
        {objs.map((o, i) => (
          <div key={o.id ?? `new-${i}`} className="flex gap-2 items-end">
            <div className="flex-1">
              <Field
                label={`Objective ${i + 1}`}
                value={o.text}
                onChange={(e) => setObjs(objs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove objective ${i + 1}`}
              onClick={() => setObjs(objs.filter((_, j) => j !== i))}
              className="rounded-lg px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200 bg-white"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setObjs([...objs, { text: '' }])}
          className="text-sm font-medium text-slate-900 hover:underline"
        >
          + Add objective
        </button>
      </Card>

      <Card>
        <h2 className="font-semibold">Allocation limits (% of portfolio)</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Max per position"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            value={f.max_position_pct}
            onChange={set('max_position_pct')}
          />
          <Field
            label="Max per sector"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            value={f.max_sector_pct}
            onChange={set('max_sector_pct')}
          />
        </div>
        <p className="text-sm text-slate-500">Per asset class (leave blank for no limit):</p>
        <div className="space-y-2">
          {ASSET_CLASSES.map((c) => (
            <div key={c.value} className="grid grid-cols-[1fr_5rem_5rem] gap-2 items-center">
              <span className="text-sm">{c.label}</span>
              {(['min', 'max'] as const).map((k) => (
                <input
                  key={k}
                  aria-label={`${c.label} ${k} %`}
                  placeholder={k}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="any"
                  value={lims[c.value][k]}
                  onChange={(e) => setLims({ ...lims, [c.value]: { ...lims[c.value], [k]: e.target.value } })}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-base text-right"
                />
              ))}
            </div>
          ))}
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button loading={saving} onClick={save}>
          Save profile
        </Button>
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <section className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">{children}</section>
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-slate-900 whitespace-pre-wrap">{children}</dd>
    </div>
  )
}
