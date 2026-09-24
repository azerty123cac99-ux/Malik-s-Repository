// Database tests for the Sandbox team and the president overview function.
// Runs last (npm run test:rls runs all test files).
import { TEAM, admin, as, check, expect, finish, newClient, section } from './test-helpers.mjs'
import { DEMO_PASSWORD, seedUsers } from './seed-users.mjs'

await seedUsers()

const malik = await as('malik@demo.test') // president (Team A leader)
const a2 = await as('a2@demo.test') // Team A member
const samantha = await as('samantha@demo.test') // Team B leader
const walsworth = await as('walsworth@demo.test') // advisor

const { data: sandbox } = await admin.from('teams').select('*').eq('is_sandbox', true).single()
const SMOKE = 'smoketest@demo.test'

async function joinSandbox(inviter) {
  const { data: token, error } = await inviter.rpc('invite_token', { p_email: SMOKE })
  if (error) throw new Error(error.message)
  const c = newClient()
  const { error: e } = await c.auth.signUp({
    email: SMOKE,
    password: DEMO_PASSWORD,
    options: { data: { invite_token: token, full_name: 'Smoke Test' } },
  })
  if (e) throw new Error(e.message)
  return as(SMOKE)
}

// ---------------------------------------------------------------------------
section('Sandbox team')

await check('exactly one Sandbox team exists, created by the migration', async () => {
  const { data } = await admin.from('teams').select('name').eq('is_sandbox', true)
  expect(data.length === 1 && data[0].name === 'Sandbox', JSON.stringify(data))
})

await check('a second Sandbox team is rejected', async () => {
  const { error } = await admin.from('teams').insert({ name: 'Sandbox 2', is_sandbox: true })
  expect(error, 'second sandbox created')
})

await check("a real team's leader can't invite into Sandbox", async () => {
  const { error } = await samantha.from('roster_invites').insert({ email: 'sneaky@demo.test', team_id: sandbox.id })
  expect(error, 'leader invited into sandbox')
})

await check('the president and the advisor can invite into Sandbox', async () => {
  const { error: e1 } = await malik.from('roster_invites').insert({ email: SMOKE, team_id: sandbox.id })
  const { error: e2 } = await walsworth.from('roster_invites').insert({ email: 'smoke2@demo.test', team_id: sandbox.id })
  expect(!e1 && !e2, `${e1?.message} / ${e2?.message}`)
})

let smoke
await check('the smoke-test user joins Sandbox with the link', async () => {
  smoke = await joinSandbox(malik)
  const { data } = await smoke.from('profiles').select('team_id').eq('email', SMOKE).single()
  expect(data.team_id === sandbox.id, JSON.stringify(data))
})

// ---------------------------------------------------------------------------
section('A Sandbox member cannot see real teams')

await check('sees only the Sandbox team row (no real team names)', async () => {
  const { data } = await smoke.from('teams').select('name')
  expect(data.length === 1 && data[0].name === 'Sandbox', JSON.stringify(data))
})

for (const table of [
  'profiles',
  'trades',
  'pitches',
  'pitch_board',
  'pitch_comments',
  'pitch_votes',
  'client_profiles',
  'client_objectives',
  'positions',
  'portfolio_totals',
  'deadline_submissions',
]) {
  await check(`reads nothing from real teams in ${table}`, async () => {
    const { data, error } = await smoke.from(table).select('team_id').in('team_id', [TEAM.A, TEAM.B, TEAM.C])
    expect(!error && data.length === 0, error?.message ?? `saw ${data.length} rows`)
  })
}

await check("can't read real teams' custom deadlines", async () => {
  const { data } = await smoke.from('deadlines').select('id').not('team_id', 'is', null)
  expect(data.length === 0, `saw ${data.length}`)
})

await check("can't write into a real team", async () => {
  const { error } = await smoke.from('trades').insert({
    team_id: TEAM.A, ticker: 'ZZTEST', side: 'buy', quantity: 1, price: 1, rationale: 'x',
  })
  expect(error, 'wrote a trade into Team A')
})

await check("real teams can't see Sandbox (name or trades)", async () => {
  await smoke.from('trades').insert({ team_id: sandbox.id, ticker: 'ZZTEST', side: 'buy', quantity: 1, price: 1, rationale: 'Smoke test' })
  const { data: t } = await a2.from('teams').select('id').eq('id', sandbox.id)
  const { data: tr } = await a2.from('trades').select('id').eq('team_id', sandbox.id)
  const { data: pres } = await malik.from('trades').select('id').eq('team_id', sandbox.id)
  expect(t.length === 0 && tr.length === 0 && pres.length === 0, `team ${t.length}, trades ${tr.length}, president ${pres.length}`)
})

await check('smoke trade: log, void, cash back to starting capital', async () => {
  const { data: t } = await smoke.from('trades').select('id').eq('team_id', sandbox.id).is('voided_at', null).single()
  const before = (await smoke.from('portfolio_totals').select('cash').eq('team_id', sandbox.id).single()).data
  await smoke.rpc('void_trade', { p_trade: t.id, p_reason: 'Smoke test' })
  const after = (await smoke.from('portfolio_totals').select('cash').eq('team_id', sandbox.id).single()).data
  expect(Number(before.cash) === 99999 && Number(after.cash) === 100000, `before ${before.cash}, after ${after.cash}`)
})

await check("Sandbox can't tick official competition deadlines", async () => {
  // Give Sandbox a leader so the only thing stopping the tick is the Sandbox rule.
  await malik.rpc('set_member_role', { p_user: smoke.uid, p_role: 'leader' })
  const leaderClient = await as(SMOKE)
  const { data: ips } = await leaderClient.from('deadlines').select('id').is('team_id', null).limit(1).single()
  const { error } = await leaderClient.from('deadline_submissions').insert({ team_id: sandbox.id, deadline_id: ips.id })
  expect(error && /Sandbox/.test(error.message), error?.message ?? 'sandbox ticked an official deadline')
  await malik.rpc('set_member_role', { p_user: smoke.uid, p_role: 'member' })
})

// ---------------------------------------------------------------------------
section('President overview function')

await check('only the president and advisor can call it', async () => {
  for (const c of [a2, samantha, smoke, newClient()]) {
    const { error } = await c.rpc('team_overview')
    expect(error, 'overview returned to a non-president')
  }
})

let overview
await check('returns the 3 real teams and excludes Sandbox (president and advisor)', async () => {
  const { data, error } = await malik.rpc('team_overview')
  expect(!error, error?.message)
  overview = data
  const names = data.map((r) => r.team_name).join(',')
  expect(data.length === 3 && !data.some((r) => r.team_id === sandbox.id), names)
  const { data: adv } = await walsworth.rpc('team_overview')
  expect(adv.length === 3 && !adv.some((r) => r.team_id === sandbox.id), 'advisor sees sandbox')
})

await check('returns counts and deadline status only, no content', async () => {
  const keys = Object.keys(overview[0]).sort().join(',')
  expect(
    keys === 'active_members,at_risk_members,below_minimum,comments_7d,deadlines,inactive_members,members,pitches_7d,team_id,team_name,trades_7d,votes_7d',
    keys,
  )
  const d = overview[0].deadlines
  expect(d.length === 2 && Object.keys(d[0]).sort().join(',') === 'due_at,submitted_at,title', JSON.stringify(d))
})

await check('Sandbox activity is not counted in any real team', async () => {
  const total = overview.reduce((n, r) => n + r.trades_7d, 0)
  const { count } = await admin
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .neq('team_id', sandbox.id)
    .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
  expect(total === count, `overview trades ${total}, real-team trades ${count}`)
})

await check('flags a team below 4 active members', async () => {
  const teamC = overview.find((r) => r.team_id === TEAM.C)
  expect(teamC.below_minimum === teamC.active_members < 4, JSON.stringify(teamC))
})

// ---------------------------------------------------------------------------
section('Rerunnable: revoke, then the same invite works again')

await check('president revokes the smoke user; the reissued link lets a new run join', async () => {
  const { error } = await malik.rpc('revoke_and_reissue', { p_email: SMOKE })
  expect(!error, error?.message)
  const again = await joinSandbox(malik)
  const { data } = await again.from('profiles').select('team_id').eq('email', SMOKE).single()
  expect(data.team_id === sandbox.id, JSON.stringify(data))
  await malik.rpc('revoke_and_reissue', { p_email: SMOKE })
})

finish()
