// Which team's content a screen shows. Members, leaders and the president see
// their own team only. The advisor reads every team and gets a picker.
import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'

type Team = { id: string; name: string; starting_capital: number; is_sandbox: boolean }

export function useTeamContent() {
  const auth = useAuth()
  const profile = auth.status === 'ready' ? auth.profile : null
  const isAdvisor = profile?.role === 'advisor'
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState<string | null>(profile?.team_id ?? null)

  useEffect(() => {
    supabase
      .from('teams')
      .select('id, name, starting_capital, is_sandbox')
      .order('name')
      .then(({ data }) => {
        setTeams(data ?? [])
        setTeamId((current) => current ?? data?.[0]?.id ?? null)
      })
  }, [])

  const team = teams.find((t) => t.id === teamId) ?? null
  const picker = isAdvisor && teams.length > 0 && (
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
  )

  return {
    me: profile,
    team,
    teamId,
    picker,
    // Writing is for members of that team; the advisor only reads.
    canWrite: !!profile && profile.team_id === teamId,
    isLeader: !!profile && profile.role === 'leader' && profile.team_id === teamId,
  }
}
