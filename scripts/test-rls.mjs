// Proves the database rules (RLS) by signing in as real users through the
// same public API the app uses, then trying things they should and should
// not be able to do.
//
//   npm run test:rls      (resets the local database first)
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env.mjs'
import { seedUsers, DEMO_PASSWORD } from './seed-users.mjs'

const { url, anonKey } = supabaseEnv()
const TEAM = {
  A: '00000000-0000-0000-0000-00000000000a',
  B: '00000000-0000-0000-0000-00000000000b',
  C: '00000000-0000-0000-0000-00000000000c',
}

const newClient = () => createClient(url, anonKey, { auth: { persistSession: false } })

async function as(email) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  client.uid = data.user.id
  return client
}

let passed = 0
let failed = 0
async function check(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ✗ ${name}\n      ${e.message}`)
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}
const section = (t) => console.log(`\n${t}`)

// ---------------------------------------------------------------------------
// Setup: create logins for everyone except c5, who will sign up in a test.
await seedUsers({ skip: ['c5@demo.test'] })

const anon = newClient()
const malik = await as('malik@demo.test') // Team A leader + president
const a2 = await as('a2@demo.test') // Team A member
const samantha = await as('samantha@demo.test') // Team B leader
const b2 = await as('b2@demo.test') // Team B member
const walsworth = await as('walsworth@demo.test') // advisor

const idOf = async (email) => {
  const { data } = await walsworth.from('profiles').select('id').eq('email', email).single()
  return data.id
}

// ---------------------------------------------------------------------------
section('Signup is invite-only (enforced in the database)')

await check('email not on any roster cannot create an account', async () => {
  const { error } = await newClient().auth.signUp({ email: 'stranger@demo.test', password: DEMO_PASSWORD })
  expect(error, 'signup succeeded but should have been rejected')
})

await check('invited email can sign up and gets the right team and role', async () => {
  const c = newClient()
  const { error } = await c.auth.signUp({
    email: 'c5@demo.test',
    password: DEMO_PASSWORD,
    options: { data: { full_name: 'Student C5' } },
  })
  expect(!error, error?.message)
  const { data } = await c.from('profiles').select('team_id, role, full_name').eq('email', 'c5@demo.test').single()
  expect(data?.team_id === TEAM.C && data.role === 'member', `got ${JSON.stringify(data)}`)
})

// ---------------------------------------------------------------------------
section('Logged-out visitors see nothing')

for (const table of ['teams', 'profiles', 'roster_invites']) {
  await check(`anon cannot read ${table}`, async () => {
    const { data, error } = await anon.from(table).select('*')
    expect(error || data.length === 0, `anon read ${data?.length} rows`)
  })
}

// ---------------------------------------------------------------------------
section('Team A member cannot see Team B')

await check('a2 sees exactly the 6 Team A profiles', async () => {
  const { data } = await a2.from('profiles').select('team_id')
  expect(data.length === 6 && data.every((p) => p.team_id === TEAM.A), `saw ${JSON.stringify(data)}`)
})

await check('a2 asking directly for Team B profiles gets 0 rows', async () => {
  const { data } = await a2.from('profiles').select('*').eq('team_id', TEAM.B)
  expect(data.length === 0, `saw ${data.length} Team B rows`)
})

await check('a2 cannot read roster invites', async () => {
  const { data } = await a2.from('roster_invites').select('*')
  expect(data.length === 0, `saw ${data.length} invites`)
})

await check('Team B leader sees only Team B invites', async () => {
  const { data } = await samantha.from('roster_invites').select('team_id')
  expect(data.length > 0 && data.every((i) => i.team_id === TEAM.B), `saw ${JSON.stringify(data)}`)
})

// ---------------------------------------------------------------------------
section('Members cannot raise their own access')

await check('a2 cannot change own role to leader', async () => {
  const { error } = await a2.from('profiles').update({ role: 'leader' }).eq('id', a2.uid)
  expect(error, 'update succeeded')
})

await check('a2 cannot make self president', async () => {
  const { error } = await a2.from('profiles').update({ is_president: true }).eq('id', a2.uid)
  expect(error, 'update succeeded')
})

await check('a2 cannot move self to Team B', async () => {
  const { error } = await a2.from('profiles').update({ team_id: TEAM.B }).eq('id', a2.uid)
  expect(error, 'update succeeded')
})

await check('a2 can change own display name', async () => {
  const { data, error } = await a2.from('profiles').update({ full_name: 'Ana' }).eq('id', a2.uid).select()
  expect(!error && data.length === 1, error?.message ?? 'no row updated')
})

await check("a2 cannot change a teammate's name", async () => {
  const a3 = await idOf('a3@demo.test')
  const { data } = await a2.from('profiles').update({ full_name: 'Hacked' }).eq('id', a3).select()
  expect(!data || data.length === 0, 'teammate renamed')
})

await check('a2 cannot promote anyone', async () => {
  const { error } = await a2.rpc('set_member_role', { p_user: a2.uid, p_role: 'leader' })
  expect(error, 'promotion succeeded')
})

// ---------------------------------------------------------------------------
section('Starting capital: leaders of that team only')

await check('member a2 cannot change Team A capital', async () => {
  const { data } = await a2.from('teams').update({ starting_capital: 1 }).eq('id', TEAM.A).select()
  expect(!data || data.length === 0, 'capital changed')
})

await check('leader Malik can change Team A capital', async () => {
  const { data, error } = await malik.from('teams').update({ starting_capital: 100000 }).eq('id', TEAM.A).select()
  expect(!error && data.length === 1, error?.message ?? 'no row updated')
})

await check('leader Malik cannot change Team B capital', async () => {
  const { data } = await malik.from('teams').update({ starting_capital: 1 }).eq('id', TEAM.B).select()
  expect(!data || data.length === 0, 'Team B capital changed')
})

// ---------------------------------------------------------------------------
section('Roster management')

await check('Team B leader can invite a member to Team B', async () => {
  const { error } = await samantha.from('roster_invites').insert({ email: 'b7@demo.test', team_id: TEAM.B })
  expect(!error, error?.message)
})

await check('Team B leader cannot invite into Team A', async () => {
  const { error } = await samantha.from('roster_invites').insert({ email: 'spy@demo.test', team_id: TEAM.A })
  expect(error, 'invite succeeded')
})

await check('Team B leader cannot invite someone as leader', async () => {
  const { error } = await samantha
    .from('roster_invites')
    .insert({ email: 'b8@demo.test', team_id: TEAM.B, role: 'leader' })
  expect(error, 'invite succeeded')
})

await check('member b2 cannot invite anyone', async () => {
  const { error } = await b2.from('roster_invites').insert({ email: 'b9@demo.test', team_id: TEAM.B })
  expect(error, 'invite succeeded')
})

// ---------------------------------------------------------------------------
section('Promoting leaders: president and advisor only')

await check('Team B leader cannot promote b2', async () => {
  const { error } = await samantha.rpc('set_member_role', { p_user: await idOf('b2@demo.test'), p_role: 'leader' })
  expect(error, 'promotion succeeded')
})

await check('president can promote b2, then demote back', async () => {
  const id = await idOf('b2@demo.test')
  let { error } = await malik.rpc('set_member_role', { p_user: id, p_role: 'leader' })
  expect(!error, error?.message)
  ;({ error } = await malik.rpc('set_member_role', { p_user: id, p_role: 'member' }))
  expect(!error, error?.message)
})

await check('advisor can promote c2', async () => {
  const { error } = await walsworth.rpc('set_member_role', { p_user: await idOf('c2@demo.test'), p_role: 'leader' })
  expect(!error, error?.message)
})

await check('president cannot change own role', async () => {
  const { error } = await malik.rpc('set_member_role', { p_user: malik.uid, p_role: 'member' })
  expect(error, 'self role change succeeded')
})

// ---------------------------------------------------------------------------
section('Who sees which rosters')

await check('advisor sees all 18 profiles', async () => {
  const { data } = await walsworth.from('profiles').select('id')
  expect(data.length === 18, `saw ${data.length}`)
})

await check('president sees all 18 profiles (roster only, needed to promote leaders)', async () => {
  const { data } = await malik.from('profiles').select('id')
  expect(data.length === 18, `saw ${data.length}`)
})

await check('Team B leader sees only 6 Team B profiles', async () => {
  const { data } = await samantha.from('profiles').select('team_id')
  expect(data.length === 6 && data.every((p) => p.team_id === TEAM.B), `saw ${data.length}`)
})

// ---------------------------------------------------------------------------
section('Removing someone from the team')

await check('member b2 cannot deactivate a teammate', async () => {
  const { error } = await b2.rpc('set_member_active', { p_user: await idOf('b4@demo.test'), p_active: false })
  expect(error, 'deactivation succeeded')
})

await check('Team B leader cannot deactivate a Team A member', async () => {
  const { error } = await samantha.rpc('set_member_active', { p_user: a2.uid, p_active: false })
  expect(error, 'deactivation succeeded')
})

await check('Team B leader can deactivate b3, who then sees nothing', async () => {
  const b3 = await as('b3@demo.test')
  const { error } = await samantha.rpc('set_member_active', { p_user: b3.uid, p_active: false })
  expect(!error, error?.message)
  const { data: teams } = await b3.from('teams').select('*')
  const { data: people } = await b3.from('profiles').select('*').neq('id', b3.uid)
  expect(teams.length === 0 && people.length === 0, `still sees ${teams.length} teams, ${people.length} profiles`)
})

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
