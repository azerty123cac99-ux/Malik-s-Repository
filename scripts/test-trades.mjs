// Database tests for pitches and the trade log, run through the public API
// as real users. Runs after test-rls.mjs (npm run test:rls runs both).
import { TEAM, admin, as, check, expect, finish, section } from './test-helpers.mjs'
import { seedUsers } from './seed-users.mjs'
import { positionPercentAfterEachTrade } from '../src/lib/portfolio.ts'

await seedUsers()

const malik = await as('malik@demo.test') // Team A leader + president
const a2 = await as('a2@demo.test') // Team A member
const a3 = await as('a3@demo.test') // Team A member
const a5 = await as('a5@demo.test') // Team A member (gets revoked)
const samantha = await as('samantha@demo.test') // Team B leader
const b2 = await as('b2@demo.test') // Team B member
const walsworth = await as('walsworth@demo.test') // advisor

// Each team needs a client objective before anything can be "pitched".
async function objective(leader, team) {
  const { data, error } = await leader.from('client_objectives').insert({ team_id: team, text: 'Long-term growth' }).select().single()
  if (error) throw new Error(error.message)
  return data.id
}
const OBJ = {
  A: await objective(malik, TEAM.A),
  B: await objective(samantha, TEAM.B),
  C: await objective(await as('gabe@demo.test'), TEAM.C),
}
const pitchFields = (team) => ({ objective_id: OBJ[team], key_risk: 'Valuation', exit_trigger: 'Thesis breaks' })

const trade = (overrides = {}) => ({
  team_id: TEAM.A,
  ticker: 'MSFT',
  side: 'buy',
  quantity: 10,
  price: 400,
  rationale: 'Cloud growth fits our long-term growth objective.',
  ...overrides,
})

async function logTrade(client, overrides) {
  const { data, error } = await client.from('trades').insert(trade(overrides)).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function newPitch(client, overrides = {}) {
  const { data, error } = await client
    .from('pitches')
    .insert({ team_id: TEAM.A, ticker: 'NVDA', thesis: 'AI chip demand', stage: 'pitched', ...pitchFields('A'), ...overrides })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

const stageOf = async (client, id) =>
  (await client.from('pitch_board').select('display_stage').eq('id', id).single()).data?.display_stage

const positionOf = async (client, team, ticker) =>
  Number((await client.from('positions').select('quantity').eq('team_id', team).eq('ticker', ticker).maybeSingle()).data?.quantity ?? 0)

// ---------------------------------------------------------------------------
section('Rationale is required')

for (const [label, rationale] of [
  ['missing', undefined],
  ['empty', ''],
  ['only spaces', '    '],
]) {
  await check(`trade with ${label} rationale is rejected`, async () => {
    const t = trade()
    if (rationale === undefined) delete t.rationale
    else t.rationale = rationale
    const { error } = await a2.from('trades').insert(t)
    expect(error, 'trade saved without a rationale')
  })
}

await check('trade with a rationale is saved, placed by the signed-in member', async () => {
  const t = await logTrade(a2, { placed_by: malik.uid })
  expect(t.placed_by === a2.uid, `placed_by = ${t.placed_by}`)
})

// ---------------------------------------------------------------------------
section('Team privacy for trades')

await check("member can't log a trade for another team", async () => {
  const { error } = await a2.from('trades').insert(trade({ team_id: TEAM.B }))
  expect(error, 'cross-team trade saved')
})

await check("advisor can't log trades", async () => {
  const { error } = await walsworth.from('trades').insert(trade())
  expect(error, 'advisor logged a trade')
})

await logTrade(b2, { team_id: TEAM.B, ticker: 'KO', rationale: 'Defensive dividend stock.' })

await check("Team A member can't read Team B trades or positions", async () => {
  const { data: t } = await a2.from('trades').select('*').eq('team_id', TEAM.B)
  const { data: p } = await a2.from('positions').select('*').eq('team_id', TEAM.B)
  expect(t.length === 0 && p.length === 0, `saw ${t.length} trades, ${p.length} positions`)
})

await check("president (Team A) can't read Team B trades or positions", async () => {
  const { data: t } = await malik.from('trades').select('*').eq('team_id', TEAM.B)
  const { data: p } = await malik.from('positions').select('*').eq('team_id', TEAM.B)
  expect(t.length === 0 && p.length === 0, `saw ${t.length} trades, ${p.length} positions`)
})

await check('advisor can read every team\'s trades', async () => {
  const { data } = await walsworth.from('trades').select('team_id')
  const teams = new Set(data.map((t) => t.team_id))
  expect(teams.has(TEAM.A) && teams.has(TEAM.B), `saw teams ${[...teams]}`)
})

// ---------------------------------------------------------------------------
section('Trades are never edited or deleted')

const fixed = await logTrade(a2, { ticker: 'AAPL', price: 200 })

await check("author can't edit their trade's price", async () => {
  const { error } = await a2.from('trades').update({ price: 1 }).eq('id', fixed.id)
  expect(error, 'price edited')
})

await check("leader can't edit a trade either", async () => {
  const { error } = await malik.from('trades').update({ rationale: 'rewritten' }).eq('id', fixed.id)
  expect(error, 'rationale edited')
})

await check('nobody can delete a trade', async () => {
  for (const c of [a2, malik, walsworth]) await c.from('trades').delete().eq('id', fixed.id)
  const { data } = await admin.from('trades').select('id').eq('id', fixed.id)
  expect(data.length === 1, 'trade was deleted')
})

// ---------------------------------------------------------------------------
section('Voiding')

const mine = await logTrade(a2, { ticker: 'AMZN', price: 180 })
const other = await logTrade(a3, { ticker: 'AMZN', price: 181 })

await check("member can't void a teammate's trade", async () => {
  const { error } = await a2.rpc('void_trade', { p_trade: other.id, p_reason: 'looks wrong' })
  expect(error, 'teammate voided')
})

await check("other team's leader can't void it", async () => {
  const { error } = await samantha.rpc('void_trade', { p_trade: other.id, p_reason: 'nope' })
  expect(error, 'other team voided')
})

await check("advisor can't void", async () => {
  const { error } = await walsworth.rpc('void_trade', { p_trade: other.id, p_reason: 'nope' })
  expect(error, 'advisor voided')
})

await check('a reason is required (empty or spaces rejected)', async () => {
  for (const reason of ['', '   ', null]) {
    const { error } = await a2.rpc('void_trade', { p_trade: mine.id, p_reason: reason })
    expect(error, `voided with reason ${JSON.stringify(reason)}`)
  }
})

await check('author can void their own trade', async () => {
  const { error } = await a2.rpc('void_trade', { p_trade: mine.id, p_reason: 'Entered 180 instead of 18.0' })
  expect(!error, error?.message)
  const { data } = await a2.from('trades').select('voided_at, voided_by, void_reason').eq('id', mine.id).single()
  expect(data.voided_at && data.voided_by === a2.uid && data.void_reason === 'Entered 180 instead of 18.0', JSON.stringify(data))
})

await check("leader can void a teammate's trade", async () => {
  const { error } = await malik.rpc('void_trade', { p_trade: other.id, p_reason: 'Duplicate entry' })
  expect(!error, error?.message)
})

await check("nobody can un-void (direct update or voiding again)", async () => {
  const { error: e1 } = await malik.from('trades').update({ voided_at: null, void_reason: null }).eq('id', mine.id)
  const { error: e2 } = await malik.rpc('void_trade', { p_trade: mine.id, p_reason: 'again' })
  const { data } = await admin.from('trades').select('voided_at').eq('id', mine.id).single()
  expect(e1 && e2 && data.voided_at, 'trade was un-voided or re-voided')
})

await check('voided trade is excluded from positions', async () => {
  // Two AMZN buys (10 each), both voided → position 0.
  expect((await positionOf(a2, TEAM.A, 'AMZN')) === 0, 'AMZN position still counts voided trades')
  // MSFT buy (10) is live; add a buy and void it → still 10.
  const extra = await logTrade(a2, { quantity: 5 })
  expect((await positionOf(a2, TEAM.A, 'MSFT')) === 15, 'MSFT before void should be 15')
  await a2.rpc('void_trade', { p_trade: extra.id, p_reason: 'Order was not filled' })
  expect((await positionOf(a2, TEAM.A, 'MSFT')) === 10, 'MSFT after void should be 10')
})

// ---------------------------------------------------------------------------
section('Pitch decisions')

await check("member can't create a pitch that is already approved", async () => {
  const { error } = await a2.from('pitches').insert({ team_id: TEAM.A, ticker: 'X', thesis: 't', stage: 'approved' })
  expect(error, 'pre-approved pitch created')
})

await check("member can't create a pitch in another team", async () => {
  const { error } = await a2.from('pitches').insert({ team_id: TEAM.B, ticker: 'X', thesis: 't', stage: 'idea' })
  expect(error, 'cross-team pitch created')
})

const nvda = await newPitch(a2)

await check("member can't approve or reject a pitch (even their own)", async () => {
  for (const stage of ['approved', 'rejected']) {
    const { error } = await a2.from('pitches').update({ stage }).eq('id', nvda.id)
    expect(error, `member set ${stage}`)
  }
})

await check('Team B leader cannot approve a Team A pitch', async () => {
  const { data } = await samantha.from('pitches').update({ stage: 'approved' }).eq('id', nvda.id).select()
  expect(!data || data.length === 0, 'other team approved')
})

await check('Team A leader approves; decision is recorded', async () => {
  const { data, error } = await malik.from('pitches').update({ stage: 'approved' }).eq('id', nvda.id).select().single()
  expect(!error && data.stage === 'approved' && data.decided_by === malik.uid, error?.message ?? JSON.stringify(data))
})

// ---------------------------------------------------------------------------
section('Trades link only to approved pitches')

const draft = await newPitch(a2, { ticker: 'TSLA' })
const bPitch = await newPitch(b2, { team_id: TEAM.B, ticker: 'NVDA', ...pitchFields('B') })
await samantha.from('pitches').update({ stage: 'approved' }).eq('id', bPitch.id)

await check('linking to a pitch that is not approved is rejected', async () => {
  const { error } = await a2.from('trades').insert(trade({ ticker: 'TSLA', pitch_id: draft.id }))
  expect(error, 'linked to an unapproved pitch')
})

await check("linking to another team's approved pitch is rejected", async () => {
  const { error } = await a2.from('trades').insert(trade({ ticker: 'NVDA', pitch_id: bPitch.id }))
  expect(error, 'linked across teams')
})

await check("linking with a different ticker than the pitch is rejected", async () => {
  const { error } = await a2.from('trades').insert(trade({ ticker: 'AMD', pitch_id: nvda.id }))
  expect(error, 'ticker mismatch accepted')
})

await check('no-pitch trades are allowed', async () => {
  const t = await logTrade(a2, { ticker: 'SPY', pitch_id: null, rationale: 'Rebalance toward index exposure.' })
  expect(t.pitch_id === null, 'pitch_id not null')
})

// ---------------------------------------------------------------------------
section('Displayed stage is derived from non-voided trades')

let buy, sell
await check('approved pitch with no trades shows Approved', async () => {
  expect((await stageOf(a2, nvda.id)) === 'approved', `got ${await stageOf(a2, nvda.id)}`)
})

await check('after a linked buy it shows Bought', async () => {
  buy = await logTrade(a2, { ticker: 'NVDA', pitch_id: nvda.id, quantity: 20, price: 120 })
  expect((await stageOf(a2, nvda.id)) === 'bought', `got ${await stageOf(a2, nvda.id)}`)
})

await check('after selling the whole position it shows Sold', async () => {
  sell = await logTrade(a3, { ticker: 'NVDA', side: 'sell', pitch_id: nvda.id, quantity: 20, price: 130, rationale: 'Exit trigger hit.' })
  expect((await stageOf(a2, nvda.id)) === 'sold', `got ${await stageOf(a2, nvda.id)}`)
})

await check('voiding the sell reverts it to Bought', async () => {
  await malik.rpc('void_trade', { p_trade: sell.id, p_reason: 'Sell was never executed in WInS' })
  expect((await stageOf(a2, nvda.id)) === 'bought', `got ${await stageOf(a2, nvda.id)}`)
})

await check('voiding the buy too reverts it to Approved', async () => {
  await a2.rpc('void_trade', { p_trade: buy.id, p_reason: 'Logged on the wrong day' })
  expect((await stageOf(a2, nvda.id)) === 'approved', `got ${await stageOf(a2, nvda.id)}`)
})

await check('stored stage never changed: it is still the human decision "approved"', async () => {
  const { data } = await a2.from('pitches').select('stage').eq('id', nvda.id).single()
  expect(data.stage === 'approved', `stored stage ${data.stage}`)
})

await check("a pitch with live trades can't be un-approved or have its ticker changed", async () => {
  await logTrade(a2, { ticker: 'NVDA', pitch_id: nvda.id })
  const { error: e1 } = await malik.from('pitches').update({ stage: 'rejected' }).eq('id', nvda.id)
  const { error: e2 } = await malik.from('pitches').update({ ticker: 'AMD' }).eq('id', nvda.id)
  expect(e1 && e2, 'pitch changed under live trades')
})

await check('Team B cannot see Team A pitches; advisor can', async () => {
  const { data: b } = await b2.from('pitch_board').select('id').eq('team_id', TEAM.A)
  const { data: pres } = await malik.from('pitch_board').select('id').eq('team_id', TEAM.B)
  const { data: adv } = await walsworth.from('pitch_board').select('id').eq('id', nvda.id)
  expect(b.length === 0 && pres.length === 0 && adv.length === 1, `B ${b.length}, president ${pres.length}, advisor ${adv.length}`)
})

// ---------------------------------------------------------------------------
section('Revoked authors: content stays, shown as "Removed user"')

await check("revoking a member keeps their trades and pitches with author set to null", async () => {
  const t = await logTrade(a5, { ticker: 'GOOG', rationale: 'Search moat.' })
  const p = await newPitch(a5, { ticker: 'META' })
  const { error } = await malik.rpc('revoke_and_reissue', { p_email: 'a5@demo.test' })
  expect(!error, error?.message)
  const { data: tr } = await a2.from('trades').select('id, placed_by').eq('id', t.id).single()
  const { data: pi } = await a2.from('pitches').select('id, created_by').eq('id', p.id).single()
  expect(tr && tr.placed_by === null && pi && pi.created_by === null, `trade ${JSON.stringify(tr)}, pitch ${JSON.stringify(pi)}`)
})

await check('voided_by also survives a revoked voider', async () => {
  const t = await logTrade(a3, { ticker: 'IBM', rationale: 'Test' })
  await a3.rpc('void_trade', { p_trade: t.id, p_reason: 'Mistake' })
  await malik.rpc('revoke_and_reissue', { p_email: 'a3@demo.test' })
  const { data } = await a2.from('trades').select('voided_at, voided_by, void_reason').eq('id', t.id).single()
  expect(data.voided_at && data.voided_by === null && data.void_reason === 'Mistake', JSON.stringify(data))
})

await check('revoking a leader who approved a pitch works; the decision stays', async () => {
  const { error: e0 } = await malik.rpc('set_member_role', { p_user: (await as('a4@demo.test')).uid, p_role: 'leader' })
  expect(!e0, e0?.message)
  const a4 = await as('a4@demo.test')
  const p = await newPitch(a2, { ticker: 'ORCL' })
  const { error: e1 } = await a4.from('pitches').update({ stage: 'approved' }).eq('id', p.id)
  expect(!e1, e1?.message)
  const { error } = await malik.rpc('revoke_and_reissue', { p_email: 'a4@demo.test' })
  expect(!error, error?.message)
  const { data } = await a2.from('pitches').select('stage, decided_by, decided_at').eq('id', p.id).single()
  expect(data.stage === 'approved' && data.decided_by === null && data.decided_at, JSON.stringify(data))
})

// ---------------------------------------------------------------------------
section('A sell must link to the Bought pitch for that ticker')

const gabe = await as('gabe@demo.test') // Team C leader
const c3 = await as('c3@demo.test') // Team C member
const cTrade = (o) => trade({ team_id: TEAM.C, ...o })
async function approvedPitchC(ticker) {
  const { data: p } = await c3.from('pitches').insert({ team_id: TEAM.C, ticker, thesis: `${ticker} thesis`, stage: 'pitched', ...pitchFields('C') }).select().single()
  await gabe.from('pitches').update({ stage: 'approved' }).eq('id', p.id)
  return p
}

const cost1 = await approvedPitchC('COST')
await logTrade(c3, { team_id: TEAM.C, ticker: 'COST', quantity: 10, price: 900, pitch_id: cost1.id })

await check('sell without a pitch link is rejected while a Bought pitch holds the ticker', async () => {
  const { error } = await c3.from('trades').insert(cTrade({ ticker: 'COST', side: 'sell', quantity: 5, price: 950 }))
  expect(error && /SELL_NEEDS_PITCH/.test(error.message), error?.message ?? 'sell saved without link')
})

await check('the error message says what to do', async () => {
  const { error } = await c3.from('trades').insert(cTrade({ ticker: 'COST', side: 'sell', quantity: 5, price: 950 }))
  expect(/Link this sell to the pitch it closes/.test(error?.message ?? ''), error?.message)
})

await check('sell linked to the Bought pitch is accepted', async () => {
  const t = await logTrade(c3, { team_id: TEAM.C, ticker: 'COST', side: 'sell', quantity: 5, price: 950, pitch_id: cost1.id })
  expect(t.pitch_id === cost1.id, 'not linked')
})

const cost2 = await approvedPitchC('COST')

await check('sell linked to an approved-but-not-Bought pitch is rejected when another is Bought', async () => {
  const { error } = await c3.from('trades').insert(cTrade({ ticker: 'COST', side: 'sell', quantity: 1, price: 950, pitch_id: cost2.id }))
  expect(error && /SELL_NEEDS_PITCH/.test(error.message), error?.message ?? 'accepted')
})

await check('with two Bought pitches for one ticker, a sell must link to one of them', async () => {
  await logTrade(c3, { team_id: TEAM.C, ticker: 'COST', quantity: 4, price: 960, pitch_id: cost2.id })
  const { error } = await c3.from('trades').insert(cTrade({ ticker: 'COST', side: 'sell', quantity: 1, price: 950 }))
  expect(error && /2 Bought pitch/.test(error.message), error?.message ?? 'unlinked sell accepted')
  const a = await logTrade(c3, { team_id: TEAM.C, ticker: 'COST', side: 'sell', quantity: 1, price: 950, pitch_id: cost1.id })
  const b = await logTrade(c3, { team_id: TEAM.C, ticker: 'COST', side: 'sell', quantity: 1, price: 950, pitch_id: cost2.id })
  expect(a && b, 'linked sells rejected')
})

await check('once nothing is Bought for the ticker, an unlinked sell is allowed again', async () => {
  await logTrade(c3, { team_id: TEAM.C, ticker: 'COST', side: 'sell', quantity: 4, price: 950, pitch_id: cost1.id })
  await logTrade(c3, { team_id: TEAM.C, ticker: 'COST', side: 'sell', quantity: 3, price: 950, pitch_id: cost2.id })
  const { error } = await c3.from('trades').insert(cTrade({ ticker: 'COST', side: 'sell', quantity: 1, price: 950, rationale: 'Selling a share bought before the app existed.' }))
  expect(!error, error?.message)
})

await check('voiding the buy that made a pitch Bought lifts the requirement', async () => {
  const p = await approvedPitchC('WMT')
  const buyT = await logTrade(c3, { team_id: TEAM.C, ticker: 'WMT', quantity: 10, price: 80, pitch_id: p.id })
  const { error: e1 } = await c3.from('trades').insert(cTrade({ ticker: 'WMT', side: 'sell', quantity: 1, price: 80 }))
  expect(e1, 'unlinked sell accepted while Bought')
  await gabe.rpc('void_trade', { p_trade: buyT.id, p_reason: 'Wrong ticker' })
  const { error: e2 } = await c3.from('trades').insert(cTrade({ ticker: 'WMT', side: 'sell', quantity: 1, price: 80, rationale: 'x' }))
  expect(!e2, e2?.message)
})

// ---------------------------------------------------------------------------
section('Cash and portfolio value: worked example')

// Start Team B from a clean slate: void its earlier test trades.
const { data: bTrades } = await samantha.from('trades').select('id').eq('team_id', TEAM.B).is('voided_at', null)
for (const t of bTrades) await samantha.rpc('void_trade', { p_trade: t.id, p_reason: 'Reset for worked example' })

// Starting capital 100,000.
//   buy  100 AAA @ 50   → cash  95,000
//   buy  200 BBB @ 25   → cash  90,000
//   sell  50 AAA @ 60   → cash  93,000   (AAA now 50 shares, last price 60)
//   buy   10 CCC @ 100  → voided, ignored
// Holdings: AAA 50 × 60 = 3,000; BBB 200 × 25 = 5,000 → 8,000
// Total = 93,000 + 8,000 = 101,000
// AAA after the sell = 3,000 / 101,000 = 2.970%
const ex = [
  { ticker: 'AAA', side: 'buy', quantity: 100, price: 50, trade_date: '2026-10-01' },
  { ticker: 'BBB', side: 'buy', quantity: 200, price: 25, trade_date: '2026-10-02' },
  { ticker: 'AAA', side: 'sell', quantity: 50, price: 60, trade_date: '2026-10-03' },
  { ticker: 'CCC', side: 'buy', quantity: 10, price: 100, trade_date: '2026-10-04' },
]
const exRows = []
for (const t of ex) exRows.push(await logTrade(b2, { team_id: TEAM.B, rationale: 'Worked example', ...t }))
await samantha.rpc('void_trade', { p_trade: exRows[3].id, p_reason: 'Worked example: voided' })

const { data: totals } = await b2.from('portfolio_totals').select('*').eq('team_id', TEAM.B).single()

await check('cash = 100,000 − 5,000 − 5,000 + 3,000 = 93,000 (voided buy ignored)', async () => {
  expect(Number(totals.cash) === 93000, `cash ${totals.cash}`)
})

await check('holdings = AAA 50×60 + BBB 200×25 = 8,000', async () => {
  expect(Number(totals.holdings_value) === 8000, `holdings ${totals.holdings_value}`)
})

await check('total (the % denominator) = 93,000 + 8,000 = 101,000', async () => {
  expect(Number(totals.total_value) === 101000, `total ${totals.total_value}`)
})

await check('positions view: AAA 50 @ 60 = 3,000; BBB 200 @ 25 = 5,000; no CCC', async () => {
  const { data } = await b2.from('positions').select('ticker, quantity, last_price, market_value').eq('team_id', TEAM.B).order('ticker')
  const live = data.filter((p) => Number(p.quantity) !== 0)
  const got = live.map((p) => `${p.ticker}:${Number(p.quantity)}@${Number(p.last_price)}=${Number(p.market_value)}`).join(' ')
  expect(got === 'AAA:50@60=3000 BBB:200@25=5000', got)
})

await check("the app's position % for the AAA sell is 3,000 / 101,000 = 2.970%", async () => {
  const { data } = await b2.from('trades').select('*').eq('team_id', TEAM.B)
  const pctAfter = positionPercentAfterEachTrade(data, 100000).get(exRows[2].id)
  expect(Math.abs(pctAfter - (3000 / 101000) * 100) < 1e-9, `got ${pctAfter}`)
})

await check("Team A can't see Team B's cash; president only sees own team", async () => {
  const { data: a } = await a2.from('portfolio_totals').select('team_id')
  const { data: p } = await malik.from('portfolio_totals').select('team_id')
  expect(a.length === 1 && a[0].team_id === TEAM.A && p.length === 1 && p[0].team_id === TEAM.A, `a2 ${JSON.stringify(a)}, malik ${JSON.stringify(p)}`)
})

finish()
