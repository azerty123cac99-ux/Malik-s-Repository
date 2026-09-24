import type { Profile } from '../lib/supabase'

// Placeholder until the team home screen (step 6). Confirms who you are
// signed in as, which is what step 1 needs to prove.
export default function HomePage({ profile, teamName }: { profile: Profile; teamName: string | null }) {
  const role = profile.is_president ? 'Leader · President' : profile.role[0].toUpperCase() + profile.role.slice(1)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Hi, {profile.full_name}</h1>
      <dl className="bg-white rounded-2xl ring-1 ring-slate-200 divide-y divide-slate-100 text-sm">
        <Row label="Team" value={teamName ?? 'All teams (advisor)'} />
        <Row label="Role" value={role} />
        <Row label="Email" value={profile.email} />
      </dl>
      <p className="text-sm text-slate-500">Roster, trade log and the other screens are coming next.</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-right break-all">{value}</dd>
    </div>
  )
}
