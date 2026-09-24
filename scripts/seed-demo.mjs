// Fills Team A (and a bit of Team B) with realistic demo content: a client
// profile, pitches in every stage, votes, comments, trades (one voided) and a
// team deadline. Team C stays empty so you can see the empty screens too.
// Everything is created through the API as the demo users, so all the normal
// rules apply.
//
//   npx supabase db reset && npm run seed:users && npm run seed:demo
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env.mjs'
import { DEMO_PASSWORD, seedUsers } from './seed-users.mjs'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const { url, anonKey } = supabaseEnv()

async function as(email) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error) throw new Error(`${email}: ${error.message}`)
  return c
}
const must = async (p) => {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA')

export async function seedDemo() {
  await seedUsers()
  const malik = await as('malik@demo.test')
  const a2 = await as('a2@demo.test')
  const a3 = await as('a3@demo.test')
  const a4 = await as('a4@demo.test')
  const samantha = await as('samantha@demo.test')
  const b2 = await as('b2@demo.test')

  // --- Team A client profile ---------------------------------------------
  await must(
    malik.from('client_profiles').upsert({
      team_id: A,
      client_name: 'Hartwell Family Education Trust',
      summary:
        'A family trust saving for two children who start college in 8 and 11 years. The parents want growth but lose sleep over big swings.',
      risk_tolerance: 'medium',
      time_horizon: '8–11 years',
      liquidity_needs: 'About $5,000 withdrawn each year for tutoring and camps',
      constraints: 'No tobacco, firearms or private prison companies',
      max_position_pct: 15,
      max_sector_pct: 30,
    }),
  )
  const objectives = await must(
    malik
      .from('client_objectives')
      .insert([
        { team_id: A, text: 'Grow the college fund faster than inflation over 8–11 years', sort_order: 0 },
        { team_id: A, text: 'Provide about 2% yearly income for annual withdrawals', sort_order: 1 },
        { team_id: A, text: 'Keep drawdowns moderate: diversified, no single bet dominates', sort_order: 2 },
      ])
      .select(),
  )
  const [growth, income, stability] = objectives.map((o) => o.id)
  await must(
    malik.from('asset_class_limits').insert([
      { team_id: A, asset_class: 'stock', min_pct: 40, max_pct: 80 },
      { team_id: A, asset_class: 'etf', min_pct: 10, max_pct: 50 },
      { team_id: A, asset_class: 'bond', min_pct: 10, max_pct: 40 },
    ]),
  )

  // --- Pitches -------------------------------------------------------------
  const pitch = (client, fields) =>
    must(client.from('pitches').insert({ team_id: A, stage: 'pitched', ...fields }).select().single())
  const approve = (p) => must(malik.from('pitches').update({ stage: 'approved' }).eq('id', p.id))

  const nvda = await pitch(a2, {
    ticker: 'NVDA',
    thesis: 'Data-center GPU demand from AI training keeps growing faster than supply; strong pricing power.',
    objective_id: growth,
    key_risk: 'Valuation is high; a slowdown in AI spending would hit the stock hard.',
    exit_trigger: 'Two quarters of falling data-center revenue, or position above 15% of the portfolio.',
    sources: 'https://investor.nvidia.com\nQ2 earnings call notes',
  })
  const vti = await pitch(a3, {
    ticker: 'VTI',
    asset_type: 'etf',
    thesis: 'Whole-market index fund as the diversified core of the portfolio. Very low fees.',
    objective_id: stability,
    key_risk: 'Falls with the whole market; no protection in a crash.',
    exit_trigger: 'Only to rebalance if stocks exceed 80% of the portfolio.',
    sources: 'https://investor.vanguard.com',
  })
  const bnd = await pitch(a4, {
    ticker: 'BND',
    asset_type: 'etf',
    thesis: 'Broad bond ETF to steady the portfolio and pay regular income.',
    objective_id: income,
    key_risk: 'Bond prices drop if interest rates rise.',
    exit_trigger: 'If bonds fall below 10% of the portfolio we add; above 40% we trim.',
  })
  const jnj = await pitch(a2, {
    ticker: 'JNJ',
    thesis: 'Healthcare giant with a 60-year record of dividend increases; defensive in downturns.',
    objective_id: income,
    key_risk: 'Litigation over talc products could cost billions.',
    exit_trigger: 'A dividend cut, or a settlement above $20B.',
  })
  const xom = await pitch(a3, {
    ticker: 'XOM',
    thesis: 'High dividend and cheap valuation.',
    objective_id: income,
    key_risk: 'Oil price swings.',
    exit_trigger: 'Oil below $60.',
  })
  await must(a4.from('pitches').insert({ team_id: A, ticker: 'COST', thesis: 'Membership model is recession-resistant. Need to research valuation first.', stage: 'idea' }))

  for (const p of [nvda, vti, bnd]) await approve(p)
  await must(malik.from('pitches').update({ stage: 'rejected' }).eq('id', xom.id))

  // Votes and discussion
  for (const [c, p, v] of [
    [a2, jnj, 1], [a3, jnj, 1], [a4, jnj, -1], [malik, jnj, 1],
    [a2, nvda, 1], [a3, nvda, 1], [a4, nvda, 1],
    [a2, xom, -1], [a4, xom, -1],
  ]) await must(c.rpc('cast_vote', { p_pitch: p.id, p_value: v }))

  for (const [c, p, body] of [
    [a4, jnj, "The talc cases worry me. Is the dividend safe if they lose?"],
    [a2, jnj, 'They set aside $9B already and have $20B+ in cash. I added it as the key risk.'],
    [malik, jnj, "Let's discuss Thursday. Bring the payout ratio numbers."],
    [a2, xom, 'Oil companies may clash with the family’s values even if not excluded. Worth asking?'],
    [malik, xom, 'Rejected: doesn’t fit the moderate-drawdown objective. Commodity swings are too big.'],
  ]) await must(c.from('pitch_comments').insert({ pitch_id: p.id, team_id: A, body }))

  // --- Trades ----------------------------------------------------------------
  const trade = (c, fields) => must(c.from('trades').insert({ team_id: A, ...fields }).select().single())
  await trade(a3, {
    trade_date: daysAgo(3), ticker: 'VTI', side: 'buy', quantity: 120, price: 285, pitch_id: vti.id,
    rationale: 'Core holding (about 34%). Diversified exposure serves the moderate-drawdown objective at low cost.',
  })
  await trade(a4, {
    trade_date: daysAgo(3), ticker: 'BND', side: 'buy', quantity: 250, price: 72.5, pitch_id: bnd.id,
    rationale: 'Bond sleeve at ~18% for stability and ~3.5% yield toward the income objective.',
  })
  const wrong = await trade(a2, {
    trade_date: daysAgo(2), ticker: 'NVDA', side: 'buy', quantity: 1000, price: 118, pitch_id: nvda.id,
    rationale: 'Growth position per approved pitch.',
  })
  await must(a2.rpc('void_trade', { p_trade: wrong.id, p_reason: 'Typed 1000 shares; the order in WInS was 100.' }))
  await trade(a2, {
    trade_date: daysAgo(2), ticker: 'NVDA', side: 'buy', quantity: 100, price: 118, pitch_id: nvda.id,
    rationale: 'Growth position per approved pitch, sized at ~12% to stay under the 15% cap.',
  })
  await trade(malik, {
    trade_date: daysAgo(1), ticker: 'NVDA', side: 'sell', quantity: 20, price: 131, pitch_id: nvda.id,
    rationale: 'Up 11% in two days; trimming back toward 12% so we stay well under the 15% position limit.',
  })

  // --- Team deadline -----------------------------------------------------------
  await must(
    malik.from('deadlines').insert({ team_id: A, title: 'IPS draft to Mr. Walsworth', due_at: '2026-10-30T21:00:00Z' }),
  )

  // --- Team B: a little content so it isn't empty ------------------------------
  await must(samantha.from('client_profiles').upsert({ team_id: B, client_name: 'Dr. Okafor (retiring surgeon)', risk_tolerance: 'low', time_horizon: '5 years' }))
  const [bObj] = await must(samantha.from('client_objectives').insert({ team_id: B, text: 'Preserve capital ahead of retirement' }).select())
  const ko = await must(
    b2.from('pitches').insert({
      team_id: B, ticker: 'KO', stage: 'pitched', thesis: 'Stable dividend payer.', objective_id: bObj.id,
      key_risk: 'Slow growth', exit_trigger: 'Dividend cut',
    }).select().single(),
  )
  await must(samantha.from('pitches').update({ stage: 'approved' }).eq('id', ko.id))
  await must(b2.from('trades').insert({ team_id: B, ticker: 'KO', side: 'buy', quantity: 200, price: 62, pitch_id: ko.id, rationale: 'Defensive income.' }))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedDemo()
  console.log('Demo content created. Sign in as malik@demo.test /', DEMO_PASSWORD)
}
