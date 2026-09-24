// Database tests for the client profile, pipeline (pitches, comments, votes)
// and deadlines. Runs after test-trades.mjs (npm run test:rls runs all).
import { TEAM, as, check, expect, finish, section } from './test-helpers.mjs'
import { seedUsers } from './seed-users.mjs'

await seedUsers()

const malik = await as('malik@demo.test') // Team A leader + president
const a2 = await as('a2@demo.test') // Team A member
const a6 = await as('a6@demo.test') // Team A member
const samantha = await as('samantha@demo.test') // Team B leader
const b2 = await as('b2@demo.test') // Team B member
const walsworth = await as('walsworth@demo.test') // advisor

// ---------------------------------------------------------------------------
section('Client profile: leaders edit, team reads, other teams see nothing')

const profileA = {
  team_id: TEAM.A,
  client_name: 'The Rivera Family Foundation',
  summary: 'Mid-size foundation funding STEM scholarships.',
  risk_tolerance: 'medium',
  time_horizon: '10+ years',
  liquidity_needs: '5% paid out yearly',
  constraints: 'No tobacco or weapons companies',
  max_position_pct: 15,
  max_sector_pct: 30,
}

await check("member can't create or edit the client profile", async () => {
  const { error } = await a2.from('client_profiles').insert(profileA)
  expect(error, 'member created profile')
})

await check('leader creates the profile; who and when are recorded', async () => {
  const { data, error } = await malik.from('client_profiles').upsert(profileA).select().single()
  expect(!error && data.updated_by === malik.uid, error?.message ?? JSON.stringify(data))
})

await check("member still can't edit it once it exists", async () => {
  const { data } = await a2.from('client_profiles').update({ client_name: 'Hacked' }).eq('team_id', TEAM.A).select()
  expect(!data || data.length === 0, 'member edited profile')
})

await check("Team B leader can't edit Team A's profile", async () => {
  const { data } = await samantha.from('client_profiles').update({ client_name: 'Hacked' }).eq('team_id', TEAM.A).select()
  expect(!data || data.length === 0, 'other team edited profile')
})

await check('team member reads it; Team B and the president-of-another-team view are blocked', async () => {
  const { data: mine } = await a2.from('client_profiles').select('client_name').eq('team_id', TEAM.A)
  const { data: other } = await b2.from('client_profiles').select('*').eq('team_id', TEAM.A)
  expect(mine.length === 1 && other.length === 0, `member ${mine.length}, Team B ${other.length}`)
})

await check("president can't read Team B's profile", async () => {
  await samantha.from('client_profiles').upsert({ team_id: TEAM.B, client_name: 'Team B client' })
  const { data } = await malik.from('client_profiles').select('*').eq('team_id', TEAM.B)
  expect(data.length === 0, 'president read Team B profile')
})

await check('advisor reads every profile but cannot edit', async () => {
  const { data } = await walsworth.from('client_profiles').select('team_id')
  const { data: upd } = await walsworth.from('client_profiles').update({ client_name: 'x' }).eq('team_id', TEAM.A).select()
  expect(data.length >= 2 && (!upd || upd.length === 0), `read ${data.length}, edited ${upd?.length}`)
})

await check('percentages must be between 0 and 100', async () => {
  const { error } = await malik.from('client_profiles').update({ max_position_pct: 150 }).eq('team_id', TEAM.A)
  expect(error, '150% accepted')
})

await check('asset class limits: min above max is rejected; valid limits save', async () => {
  const { error: bad } = await malik.from('asset_class_limits').insert({ team_id: TEAM.A, asset_class: 'bond', min_pct: 40, max_pct: 20 })
  const { error: good } = await malik.from('asset_class_limits').insert({ team_id: TEAM.A, asset_class: 'bond', min_pct: 10, max_pct: 40 })
  expect(bad && !good, `bad ${bad?.message}, good ${good?.message}`)
})

await check("member can't set asset class limits", async () => {
  const { error } = await a2.from('asset_class_limits').insert({ team_id: TEAM.A, asset_class: 'etf', min_pct: 0, max_pct: 50 })
  expect(error, 'member set limits')
})

// ---------------------------------------------------------------------------
section('Objectives')

let objA
await check('leader adds objectives; member cannot', async () => {
  const { data, error } = await malik.from('client_objectives').insert({ team_id: TEAM.A, text: 'Fund 5% yearly payout' }).select().single()
  expect(!error, error?.message)
  objA = data
  const { error: e2 } = await a2.from('client_objectives').insert({ team_id: TEAM.A, text: 'x' })
  expect(e2, 'member added objective')
})

const { data: objB } = await samantha.from('client_objectives').insert({ team_id: TEAM.B, text: 'Preserve capital' }).select().single()

await check("a pitch can't use another team's objective", async () => {
  const { error } = await a2.from('pitches').insert({
    team_id: TEAM.A, ticker: 'JNJ', thesis: 't', stage: 'pitched', objective_id: objB.id, key_risk: 'r', exit_trigger: 'e',
  })
  expect(error, 'cross-team objective accepted')
})

// ---------------------------------------------------------------------------
section('Pitches: ideas are free-form, pitches must be complete')

let idea
await check('an idea can be saved with just a ticker and thesis', async () => {
  const { data, error } = await a2.from('pitches').insert({ team_id: TEAM.A, ticker: 'JNJ', thesis: 'Healthcare defensive', stage: 'idea' }).select().single()
  expect(!error, error?.message)
  idea = data
})

await check('moving to Pitched without objective, key risk and exit trigger is rejected', async () => {
  const { error } = await a2.from('pitches').update({ stage: 'pitched' }).eq('id', idea.id)
  expect(error && /objective/.test(error.message), error?.message ?? 'incomplete pitch accepted')
})

await check('with all three filled in, the author can move it to Pitched', async () => {
  const { error } = await a2
    .from('pitches')
    .update({ stage: 'pitched', objective_id: objA.id, key_risk: 'Litigation', exit_trigger: 'Dividend cut' })
    .eq('id', idea.id)
  expect(!error, error?.message)
})

await check("another member can't edit someone else's pitch", async () => {
  const { data } = await a6.from('pitches').update({ thesis: 'rewritten' }).eq('id', idea.id).select()
  expect(!data || data.length === 0, 'teammate edited pitch')
})

await check("an objective used by a pitch can't be deleted (edit it instead)", async () => {
  const { error } = await malik.from('client_objectives').delete().eq('id', objA.id)
  const { error: e2 } = await malik.from('client_objectives').update({ text: 'Fund a 5% yearly payout' }).eq('id', objA.id)
  expect(error && !e2, `delete ${error?.message}, edit ${e2?.message}`)
})

// ---------------------------------------------------------------------------
section('Comments')

await check('team member comments; author and team are set by the server', async () => {
  const { data, error } = await a6
    .from('pitch_comments')
    .insert({ pitch_id: idea.id, body: 'What about the talc lawsuits?', author_id: malik.uid, team_id: TEAM.B })
    .select()
    .single()
  expect(!error && data.author_id === a6.uid && data.team_id === TEAM.A, error?.message ?? JSON.stringify(data))
})

await check('empty comments are rejected', async () => {
  const { error } = await a6.from('pitch_comments').insert({ pitch_id: idea.id, body: '   ' })
  expect(error, 'empty comment saved')
})

await check("Team B can't comment on or read Team A's pitch comments", async () => {
  const { error } = await b2.from('pitch_comments').insert({ pitch_id: idea.id, body: 'spying' })
  const { data } = await b2.from('pitch_comments').select('*').eq('pitch_id', idea.id)
  expect(error && data.length === 0, `insert ${error?.message}, read ${data.length}`)
})

await check("comments can't be edited or deleted", async () => {
  const { data: c } = await a6.from('pitch_comments').select('id').eq('pitch_id', idea.id).limit(1).single()
  const { error } = await a6.from('pitch_comments').update({ body: 'changed' }).eq('id', c.id)
  await a6.from('pitch_comments').delete().eq('id', c.id)
  const { data: still } = await a6.from('pitch_comments').select('body').eq('id', c.id).single()
  expect(error && still.body === 'What about the talc lawsuits?', 'comment changed')
})

await check("advisor can read comments but can't comment", async () => {
  const { data } = await walsworth.from('pitch_comments').select('id').eq('pitch_id', idea.id)
  const { error } = await walsworth.from('pitch_comments').insert({ pitch_id: idea.id, body: 'advisor note' })
  expect(data.length === 1 && error, `read ${data.length}, insert ${error?.message}`)
})

// ---------------------------------------------------------------------------
section('Votes')

const board = async (c) => (await c.from('pitch_board').select('up_votes, down_votes, my_vote, comment_count').eq('id', idea.id).single()).data

const vote = (c, value) => c.rpc('cast_vote', { p_pitch: idea.id, p_value: value })

await check('one vote per person; changing it replaces it', async () => {
  await vote(a2, 1)
  await vote(a6, 1)
  await vote(a6, -1)
  const b = await board(a6)
  expect(b.up_votes === 1 && b.down_votes === 1 && b.my_vote === -1, JSON.stringify(b))
})

await check('votes other than +1 / −1 are rejected', async () => {
  const { error } = await vote(a2, 5)
  expect(error, 'vote of 5 accepted')
})

await check("nobody can write votes directly (so no one can change someone else's)", async () => {
  const { error: e1 } = await a2.from('pitch_votes').update({ value: 1 }).eq('pitch_id', idea.id).eq('user_id', a6.uid)
  const { error: e2 } = await a2.from('pitch_votes').insert({ pitch_id: idea.id, user_id: a6.uid, team_id: TEAM.A, value: 1 })
  await a2.from('pitch_votes').delete().eq('pitch_id', idea.id).eq('user_id', a6.uid)
  const b = await board(a6)
  expect(e1 && e2 && b.my_vote === -1, JSON.stringify(b))
})

await check("Team B and the advisor can't vote on Team A's pitch", async () => {
  const { error: e1 } = await vote(b2, 1)
  const { error: e2 } = await vote(walsworth, 1)
  expect(e1 && e2, 'outsider voted')
})

await check('removing your own vote works; counts update', async () => {
  await vote(a6, null)
  const b = await board(a6)
  expect(b.up_votes === 1 && b.down_votes === 0 && b.my_vote === null && b.comment_count === 1, JSON.stringify(b))
})

// ---------------------------------------------------------------------------
section('Deadlines and per-team submissions')

const { data: official } = await a2.from('deadlines').select('id, title, due_at').is('team_id', null).order('due_at')

await check('the two official deadlines exist and are visible to members', async () => {
  const titles = official.map((d) => d.title).join(' | ')
  expect(official.length === 2 && /IPS/.test(titles) && /Final report/.test(titles), titles)
  expect(official[0].due_at.startsWith('2026-11-07T04:59') && official[1].due_at.startsWith('2026-12-05T04:59'), official.map((d) => d.due_at).join(', '))
})

const ips = official[0]

await check("member can't tick IPS as submitted", async () => {
  const { error } = await a2.from('deadline_submissions').insert({ team_id: TEAM.A, deadline_id: ips.id })
  expect(error, 'member ticked')
})

await check('Team A leader ticks IPS; it does NOT show as submitted for Team B', async () => {
  const { error } = await malik.from('deadline_submissions').insert({ team_id: TEAM.A, deadline_id: ips.id })
  expect(!error, error?.message)
  const { data: bSees } = await samantha.from('deadline_submissions').select('*').eq('deadline_id', ips.id)
  expect(bSees.length === 0, `Team B sees ${bSees.length} submissions`)
})

await check("Team A leader can't tick for Team B", async () => {
  const { error } = await malik.from('deadline_submissions').insert({ team_id: TEAM.B, deadline_id: ips.id })
  expect(error, 'ticked for another team')
})

await check('Team B leader ticks their own separately; advisor sees both', async () => {
  await samantha.from('deadline_submissions').insert({ team_id: TEAM.B, deadline_id: ips.id })
  const { data } = await walsworth.from('deadline_submissions').select('team_id').eq('deadline_id', ips.id)
  expect(data.length === 2, `advisor sees ${data.length}`)
})

await check('leader can untick; advisor cannot tick', async () => {
  const { data } = await malik.from('deadline_submissions').delete().eq('team_id', TEAM.A).eq('deadline_id', ips.id).select()
  const { error } = await walsworth.from('deadline_submissions').insert({ team_id: TEAM.A, deadline_id: ips.id })
  expect(data.length === 1 && error, `untick ${data.length}, advisor ${error?.message}`)
})

let custom
await check('leader adds a custom team deadline; member cannot', async () => {
  const { data, error } = await malik.from('deadlines').insert({ team_id: TEAM.A, title: 'IPS draft to Mr. W', due_at: '2026-10-30T20:00:00Z' }).select().single()
  expect(!error, error?.message)
  custom = data
  const { error: e2 } = await a2.from('deadlines').insert({ team_id: TEAM.A, title: 'x', due_at: '2026-10-30T20:00:00Z' })
  expect(e2, 'member added deadline')
})

await check("custom deadlines are private to the team (not even the president's other teams)", async () => {
  const { data: b } = await b2.from('deadlines').select('id').eq('id', custom.id)
  const { data: adv } = await walsworth.from('deadlines').select('id').eq('id', custom.id)
  expect(b.length === 0 && adv.length === 1, `Team B ${b.length}, advisor ${adv.length}`)
})

await check("nobody can create or delete official deadlines from the app", async () => {
  const { error } = await malik.from('deadlines').insert({ team_id: null, title: 'Fake', due_at: '2026-10-01T00:00:00Z' })
  await malik.from('deadlines').delete().eq('id', ips.id)
  const { data } = await a2.from('deadlines').select('id').eq('id', ips.id)
  expect(error && data.length === 1, 'official deadline changed')
})

await check("a team can't tick another team's custom deadline", async () => {
  const { error } = await samantha.from('deadline_submissions').insert({ team_id: TEAM.B, deadline_id: custom.id })
  expect(error, 'ticked another team deadline')
})

finish()
