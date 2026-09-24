// Proves the database rules (RLS) by signing in as real users through the
// same public API the app uses, then trying things they should and should
// not be able to do.
//
//   npm run test:rls      (resets the local database first)
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env.mjs'
import { seedUsers, DEMO_PASSWORD } from './seed-users.mjs'

const { url, anonKey, serviceKey, dbUrl } = supabaseEnv()
const TEAM = {
  A: '00000000-0000-0000-0000-00000000000a',
  B: '00000000-0000-0000-0000-00000000000b',
  C: '00000000-0000-0000-0000-00000000000c',
}

const newClient = () => createClient(url, anonKey, { auth: { persistSession: false } })
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const sql = (q) => execSync(`psql "${dbUrl}" -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim()

async function as(email) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  client.uid = data.user.id
  return client
}

// What the /join page will do.
const join = (email, token) =>
  newClient().auth.signUp({
    email,
    password: DEMO_PASSWORD,
    options: { data: token === undefined ? {} : { invite_token: token, full_name: email.split('@')[0] } },
  })

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
// Setup: create logins for everyone except c4 and c5, who join during tests.
await seedUsers({ skip: ['c4@demo.test', 'c5@demo.test'] })

const anon = newClient()
const malik = await as('malik@demo.test') // Team A leader + president
const a2 = await as('a2@demo.test') // Team A member
const samantha = await as('samantha@demo.test') // Team B leader
const b2 = await as('b2@demo.test') // Team B member
const gabe = await as('gabe@demo.test') // Team C leader
const walsworth = await as('walsworth@demo.test') // advisor

const idOf = async (email) => {
  const { data } = await admin.from('profiles').select('id').eq('email', email).single()
  return data.id
}

// ---------------------------------------------------------------------------
section('Joining requires a valid personal invite link')

const c4Token = (await gabe.rpc('invite_token', { p_email: 'c4@demo.test' })).data
const c5Token = (await gabe.rpc('invite_token', { p_email: 'c5@demo.test' })).data

await check('tokens are 64 random hex characters', async () => {
  expect(/^[0-9a-f]{64}$/.test(c4Token) && c4Token !== c5Token, `got ${c4Token}`)
})

await check('no token: rejected', async () => {
  const { error } = await join('c5@demo.test')
  expect(error, 'signup succeeded')
})

await check('wrong token: rejected', async () => {
  const { error } = await join('c5@demo.test', randomBytes(32).toString('hex'))
  expect(error, 'signup succeeded')
})

await check("token for c4 can't create an account for c5", async () => {
  const { error } = await join('c5@demo.test', c4Token)
  expect(error, 'signup succeeded')
})

await check('email not on any roster: rejected even with a real token', async () => {
  const { error } = await join('stranger@demo.test', c4Token)
  expect(error, 'signup succeeded')
})

await check('/join lookup returns only email and team name', async () => {
  const { data, error } = await anon.rpc('lookup_invite', { p_token: c5Token })
  expect(!error, error?.message)
  expect(
    data.length === 1 && JSON.stringify(Object.keys(data[0]).sort()) === '["email","team_name"]',
    `got ${JSON.stringify(data)}`,
  )
  expect(data[0].email === 'c5@demo.test' && data[0].team_name === 'Team C', `got ${JSON.stringify(data)}`)
})

await check('valid token: account created with the right team and role', async () => {
  const { error } = await join('c5@demo.test', c5Token)
  expect(!error, error?.message)
  const { data } = await admin.from('profiles').select('team_id, role').eq('email', 'c5@demo.test').single()
  expect(data?.team_id === TEAM.C && data.role === 'member', `got ${JSON.stringify(data)}`)
})

await check('invite is marked claimed, and the token is not kept in user metadata', async () => {
  const { data: inv } = await gabe.from('roster_invites').select('claimed_at').eq('email', 'c5@demo.test').single()
  expect(inv.claimed_at, 'claimed_at not set')
  const meta = sql("select raw_user_meta_data::text from auth.users where email = 'c5@demo.test'")
  expect(!meta.includes('invite_token'), `metadata still has token: ${meta}`)
})

await check('used token: /join lookup returns nothing', async () => {
  const { data } = await anon.rpc('lookup_invite', { p_token: c5Token })
  expect(data.length === 0, `got ${JSON.stringify(data)}`)
})

await check('used token: rejected even if that account is deleted and re-created', async () => {
  const id = await idOf('c5@demo.test')
  await admin.auth.admin.deleteUser(id)
  const { error } = await join('c5@demo.test', c5Token)
  expect(error, 'token was reused')
})

// Expiry and regeneration, on a fresh invite.
let b7Old
await check('expired token: rejected', async () => {
  const { error: e1 } = await samantha.from('roster_invites').insert({ email: 'b7@demo.test', team_id: TEAM.B })
  expect(!e1, e1?.message)
  b7Old = (await samantha.rpc('invite_token', { p_email: 'b7@demo.test' })).data
  await admin
    .from('roster_invites')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('email', 'b7@demo.test')
  const { error } = await join('b7@demo.test', b7Old)
  expect(error, 'signup succeeded with expired token')
})

await check('expired invite: "copy link" refuses and asks to regenerate', async () => {
  const { error } = await samantha.rpc('invite_token', { p_email: 'b7@demo.test' })
  expect(error, 'copy link returned an expired token')
})

let b7New
await check('regenerate: new token, old token rejected', async () => {
  const { data, error } = await samantha.rpc('regenerate_invite', { p_email: 'b7@demo.test' })
  expect(!error, error?.message)
  b7New = data
  expect(b7New && b7New !== b7Old, 'token did not change')
  const { error: e2 } = await join('b7@demo.test', b7Old)
  expect(e2, 'old token still works')
})

await check('regenerated token works', async () => {
  const { error } = await join('b7@demo.test', b7New)
  expect(!error, error?.message)
})

// ---------------------------------------------------------------------------
section('Revoke & reissue (someone else claimed a link)')

const WRONG_PASSWORD = 'not-the-real-student'
let impostor
let c4New

await check('setup: wrong person claims c4\'s link with their own password', async () => {
  const { error } = await newClient().auth.signUp({
    email: 'c4@demo.test',
    password: WRONG_PASSWORD,
    options: { data: { invite_token: c4Token, full_name: 'Impostor' } },
  })
  expect(!error, error?.message)
  impostor = newClient()
  const { error: e2 } = await impostor.auth.signInWithPassword({ email: 'c4@demo.test', password: WRONG_PASSWORD })
  expect(!e2, e2?.message)
})

await check('member b2 cannot revoke', async () => {
  const { error } = await b2.rpc('revoke_and_reissue', { p_email: 'c4@demo.test' })
  expect(error, 'member revoked')
})

await check('Team B leader cannot revoke a Team C account', async () => {
  const { error } = await samantha.rpc('revoke_and_reissue', { p_email: 'c4@demo.test' })
  expect(error, 'other team leader revoked')
})

await check('an unclaimed invite cannot be revoked (use Regenerate)', async () => {
  await gabe.from('roster_invites').insert({ email: 'c6@demo.test', team_id: TEAM.C })
  const { error } = await gabe.rpc('revoke_and_reissue', { p_email: 'c6@demo.test' })
  expect(error, 'revoked an unclaimed invite')
})

await check('Team C leader revokes & reissues: new token returned', async () => {
  const { data, error } = await gabe.rpc('revoke_and_reissue', { p_email: 'c4@demo.test' })
  expect(!error, error?.message)
  c4New = data
  expect(/^[0-9a-f]{64}$/.test(c4New) && c4New !== c4Token, `got ${c4New}`)
})

await check("impostor's old password no longer logs in", async () => {
  const { error } = await newClient().auth.signInWithPassword({ email: 'c4@demo.test', password: WRONG_PASSWORD })
  expect(error, 'impostor logged in')
})

await check("impostor's still-open session sees nothing", async () => {
  const { data: people } = await impostor.from('profiles').select('*')
  const { data: teams } = await impostor.from('teams').select('*')
  expect((people ?? []).length === 0 && (teams ?? []).length === 0, 'session still has access')
})

await check('the originally claimed token does not work again', async () => {
  const { error } = await join('c4@demo.test', c4Token)
  expect(error, 'old token worked')
})

await check('real student joins with the new link and logs in', async () => {
  const { error } = await join('c4@demo.test', c4New)
  expect(!error, error?.message)
  const c4 = await as('c4@demo.test')
  const { data } = await c4.from('profiles').select('team_id, role').eq('id', c4.uid).single()
  expect(data?.team_id === TEAM.C && data.role === 'member', `got ${JSON.stringify(data)}`)
})

await check('revocation is logged with who and when', async () => {
  const { data } = await gabe.from('invite_revocations').select('*').eq('email', 'c4@demo.test')
  expect(data.length === 1 && data[0].revoked_by === gabe.uid && data[0].revoked_at, `got ${JSON.stringify(data)}`)
})

await check('revocation log: hidden from members and other teams, visible to advisor', async () => {
  const { data: m } = await a2.from('invite_revocations').select('*')
  const { data: o } = await samantha.from('invite_revocations').select('*')
  const { data: adv } = await walsworth.from('invite_revocations').select('*')
  expect(m.length === 0 && o.length === 0 && adv.length === 1, `member ${m.length}, other ${o.length}, advisor ${adv.length}`)
})

await check('nobody can write to the revocation log directly', async () => {
  const { error } = await gabe
    .from('invite_revocations')
    .insert({ email: 'fake@demo.test', team_id: TEAM.C, revoked_user_id: gabe.uid })
  expect(error, 'insert succeeded')
})

await check('a leader cannot revoke their own account', async () => {
  const { error } = await gabe.rpc('revoke_and_reissue', { p_email: 'gabe@demo.test' })
  expect(error, 'self revoke succeeded')
})

await check('Team C leader cannot revoke a promoted Team C leader (president/advisor only)', async () => {
  await walsworth.rpc('set_member_role', { p_user: await idOf('c3@demo.test'), p_role: 'leader' })
  const { error } = await gabe.rpc('revoke_and_reissue', { p_email: 'c3@demo.test' })
  expect(error, 'leader revoked another leader')
  await walsworth.rpc('set_member_role', { p_user: await idOf('c3@demo.test'), p_role: 'member' })
})

// ---------------------------------------------------------------------------
section('Tokens are never readable through table queries')

await malik.from('roster_invites').insert({ email: 'a7@demo.test', team_id: TEAM.A })

await check('leader reading roster_invites gets no token field', async () => {
  const { data } = await malik.from('roster_invites').select('*')
  expect(data.length > 0 && data.every((r) => !('token' in r)), `row keys: ${Object.keys(data[0] ?? {})}`)
})

await check('private.invite_tokens is not reachable through the API', async () => {
  for (const c of [anon, a2, malik, walsworth]) {
    const { data, error } = await c.schema('private').from('invite_tokens').select('*')
    expect(error && !data, `got ${JSON.stringify(data)}`)
  }
})

await check('member a2 cannot copy a Team A invite link', async () => {
  const { error } = await a2.rpc('invite_token', { p_email: 'a7@demo.test' })
  expect(error, 'member got a token')
})

await check('Team B leader cannot copy a Team A invite link', async () => {
  const { error } = await samantha.rpc('invite_token', { p_email: 'a7@demo.test' })
  expect(error, 'other team leader got a token')
})

await check('Team B leader cannot regenerate a Team A invite link', async () => {
  const { error } = await samantha.rpc('regenerate_invite', { p_email: 'a7@demo.test' })
  expect(error, 'other team leader regenerated a token')
})

await check('logged-out visitor cannot copy an invite link', async () => {
  const { error } = await anon.rpc('invite_token', { p_email: 'a7@demo.test' })
  expect(error, 'anon got a token')
})

await check('Team A leader and the advisor can copy it', async () => {
  for (const c of [malik, walsworth]) {
    const { data, error } = await c.rpc('invite_token', { p_email: 'a7@demo.test' })
    expect(!error && /^[0-9a-f]{64}$/.test(data), error?.message)
  }
})

await check('seed-only token list is closed to users and visitors', async () => {
  for (const c of [anon, malik, walsworth]) {
    const { error } = await c.rpc('admin_invite_tokens')
    expect(error, 'got the token list')
  }
})

// ---------------------------------------------------------------------------
section('Emails are always stored lowercase')

await check('invite typed as "  NewKid@Demo.TEST " is stored as newkid@demo.test', async () => {
  const { error } = await gabe.from('roster_invites').insert({ email: '  NewKid@Demo.TEST ', team_id: TEAM.C })
  expect(!error, error?.message)
  const { data } = await gabe.from('roster_invites').select('email').ilike('email', 'newkid%')
  expect(data.length === 1 && data[0].email === 'newkid@demo.test', `got ${JSON.stringify(data)}`)
})

await check('joining with a mixed-case email still matches the invite', async () => {
  const token = (await gabe.rpc('invite_token', { p_email: 'newkid@demo.test' })).data
  const { error } = await join('NewKid@Demo.test', token)
  expect(!error, error?.message)
  const { data } = await admin.from('profiles').select('email').eq('email', 'newkid@demo.test')
  expect(data.length === 1, 'profile not found under lowercase email')
})

await check('invite records who really sent it', async () => {
  const { error } = await gabe
    .from('roster_invites')
    .insert({ email: 'c8@demo.test', team_id: TEAM.C, invited_by: malik.uid })
  expect(!error, error?.message)
  const { data } = await gabe.from('roster_invites').select('invited_by').eq('email', 'c8@demo.test').single()
  expect(data.invited_by === gabe.uid, `invited_by = ${data.invited_by}`)
})

// ---------------------------------------------------------------------------
section('Every SECURITY DEFINER function pins search_path')

await check('no definer function in public or private is missing search_path', async () => {
  const bad = sql(`
    select string_agg(p.oid::regprocedure::text, ', ')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)
  expect(bad === '', `missing search_path: ${bad}`)
})

// ---------------------------------------------------------------------------
section('Nobody can insert or delete profiles directly')

await check('member cannot insert a profile', async () => {
  const { error } = await a2
    .from('profiles')
    .insert({ id: a2.uid, email: 'x@demo.test', full_name: 'X', team_id: TEAM.B, role: 'leader' })
  expect(error, 'insert succeeded')
})

await check('leader, president and advisor cannot insert a profile', async () => {
  for (const c of [samantha, malik, walsworth]) {
    const { error } = await c
      .from('profiles')
      .insert({ id: c.uid, email: 'y@demo.test', full_name: 'Y', team_id: TEAM.A, role: 'member' })
    expect(error, 'insert succeeded')
  }
})

await check('nobody can delete a profile (own or others)', async () => {
  for (const [c, target] of [
    [a2, a2.uid],
    [samantha, await idOf('b2@demo.test')],
    [walsworth, a2.uid],
  ]) {
    await c.from('profiles').delete().eq('id', target)
  }
  const count = sql(`select count(*) from public.profiles where id in ('${a2.uid}', '${await idOf('b2@demo.test')}')`)
  expect(count === '2', `only ${count} of 2 profiles remain`)
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

await check('leader cannot create an invite that lasts longer than 7 days', async () => {
  const { error } = await samantha
    .from('roster_invites')
    .insert({ email: 'b9@demo.test', team_id: TEAM.B, expires_at: '2030-01-01T00:00:00Z' })
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

const totalProfiles = Number(sql('select count(*) from public.profiles'))

await check(`advisor sees all ${totalProfiles} profiles`, async () => {
  const { data } = await walsworth.from('profiles').select('id')
  expect(data.length === totalProfiles, `saw ${data.length}`)
})

await check(`president sees all ${totalProfiles} profiles (roster only, needed to promote leaders)`, async () => {
  const { data } = await malik.from('profiles').select('id')
  expect(data.length === totalProfiles, `saw ${data.length}`)
})

await check('Team B leader sees only Team B profiles', async () => {
  const { data } = await samantha.from('profiles').select('team_id')
  expect(data.length > 0 && data.every((p) => p.team_id === TEAM.B), `saw ${data.length}`)
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
