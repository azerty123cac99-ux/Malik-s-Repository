// Browser test for the trade log: logging with a required rationale, linking
// an approved pitch, voiding, and who sees what.
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env.mjs'
import { APP, IPAD, SHOTS, expect, launch, newPage, signIn, step } from './e2e-helpers.mjs'

const TEAM_A = '00000000-0000-0000-0000-00000000000a'

async function apiAs(email) {
  const { url, anonKey } = supabaseEnv()
  const c = createClient(url, anonKey, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email, password: 'demo-password-2026' })
  return c
}

export async function run() {
  // An approved NVDA pitch for Team A, created the normal way.
  const a2api = await apiAs('a2@demo.test')
  const { data: pitch } = await a2api
    .from('pitches')
    .insert({ team_id: TEAM_A, ticker: 'NVDA', thesis: 'AI data-center demand keeps growing', stage: 'pitched' })
    .select()
    .single()
  await (await apiAs('malik@demo.test')).from('pitches').update({ stage: 'approved' }).eq('id', pitch.id)

  const browser = await launch()
  console.log('\nTrade log (Team A member, phone)')
  const page = await newPage(browser)
  const cards = page.getByTestId('trade')

  await step('member opens Trades and sees the empty log', async () => {
    await signIn(page, 'a2@demo.test')
    await page.getByRole('link', { name: 'Trades' }).click()
    await page.getByText('No trades yet.').waitFor()
  })

  await step("Save stays disabled until there's a rationale", async () => {
    await page.getByRole('link', { name: 'Log trade' }).click()
    await page.getByLabel('Ticker').fill('msft')
    await page.getByLabel('Quantity').fill('10')
    await page.getByLabel('Price per share').fill('400')
    const save = page.getByRole('button', { name: 'Add a rationale to save' })
    expect(await save.isDisabled(), 'save enabled without rationale')
    await page.getByLabel('Rationale (required)').fill('   ')
    expect(await save.isDisabled(), 'save enabled with blank rationale')
  })

  await step('preview shows total and resulting position % before saving', async () => {
    await page.getByText('Total: $4,000.00').waitFor()
    await page.getByText(/MSFT after this trade: ≈ 4\.0%/).waitFor()
    await page.screenshot({ path: `${SHOTS}phone-10-log-trade.png`, fullPage: true })
  })

  await step('with a rationale it saves and shows in the log', async () => {
    await page.getByLabel('Rationale (required)').fill('Cloud growth serves the long-term growth objective.')
    await page.getByRole('button', { name: 'Save trade' }).click()
    await page.getByRole('heading', { name: 'Trade log' }).waitFor()
    await cards.filter({ hasText: 'MSFT' }).getByText('≈ 4.0% of portfolio after').waitFor()
    await cards.filter({ hasText: 'MSFT' }).getByText('no pitch').waitFor()
  })

  await step('picking the approved pitch fills the ticker and links it', async () => {
    await page.getByRole('link', { name: 'Log trade' }).click()
    await page.getByLabel('Linked pitch').selectOption({ index: 1 })
    expect((await page.getByLabel('Ticker').inputValue()) === 'NVDA', 'ticker not filled from pitch')
    await page.getByLabel('Quantity').fill('20')
    await page.getByLabel('Price per share').fill('120')
    await page.getByLabel('Rationale (required)').fill('Approved pitch: AI demand. Serves growth objective.')
    await page.getByRole('button', { name: 'Save trade' }).click()
    await cards.filter({ hasText: 'NVDA' }).getByText('pitch: NVDA').waitFor()
  })

  await step('selling more than the log shows held gives a warning', async () => {
    await page.getByRole('link', { name: 'Log trade' }).click()
    await page.getByRole('radio', { name: 'Sell' }).click()
    await page.getByLabel('Ticker').fill('AAPL')
    await page.getByLabel('Quantity').fill('5')
    await page.getByLabel('Price per share').fill('200')
    await page.getByText(/the log shows 0 AAPL held/).waitFor()
    await page.getByRole('link', { name: 'Cancel' }).click()
  })

  await step('author sees "Void this trade" on their own trade', async () => {
    await cards.filter({ hasText: 'MSFT' }).getByRole('button', { name: 'Void this trade' }).waitFor()
  })
  await page.context().close()

  console.log('\nVoiding and visibility')

  await step("teammate (member) has no Void button on someone else's trade", async () => {
    const p = await newPage(browser)
    await signIn(p, 'a6@demo.test')
    await p.goto(`${APP}/trades`)
    await p.getByTestId('trade').filter({ hasText: 'MSFT' }).waitFor()
    expect((await p.getByRole('button', { name: 'Void this trade' }).count()) === 0, 'member can void others')
    await p.context().close()
  })

  await step('leader voids with a required reason; card is struck through', async () => {
    const p = await newPage(browser, IPAD)
    await signIn(p, 'malik@demo.test')
    await p.goto(`${APP}/trades`)
    const msft = p.getByTestId('trade').filter({ hasText: 'MSFT' })
    await msft.getByRole('button', { name: 'Void this trade' }).click()
    const go = p.getByRole('dialog').getByRole('button', { name: 'Void trade' })
    expect(await go.isDisabled(), 'void enabled without reason')
    await p.getByLabel('Reason (required)').fill('Order was never filled in WInS')
    await go.click()
    await msft.getByText('Voided').waitFor()
    await msft.getByText('Order was never filled in WInS').waitFor()
    expect((await msft.getByText('of portfolio after').count()) === 0, 'voided trade still shows a position %')
    const decoration = await msft.locator('.line-through').first().evaluate((el) => getComputedStyle(el).textDecorationLine)
    expect(decoration.includes('line-through'), `text-decoration: ${decoration}`)
    await p.screenshot({ path: `${SHOTS}ipad-8-trade-log.png`, fullPage: true })
    await p.context().close()
  })

  await step("Team B member doesn't see Team A trades", async () => {
    const p = await newPage(browser)
    await signIn(p, 'b2@demo.test')
    await p.goto(`${APP}/trades`)
    await p.getByText('No trades yet.').waitFor()
    await p.context().close()
  })

  await step('advisor can read Team A trades but has no Log or Void buttons', async () => {
    const p = await newPage(browser)
    await signIn(p, 'walsworth@demo.test')
    await p.goto(`${APP}/trades`)
    await p.getByLabel('Team').selectOption({ label: 'Team A' })
    await p.getByTestId('trade').filter({ hasText: 'NVDA' }).waitFor()
    expect((await p.getByRole('link', { name: 'Log trade' }).count()) === 0, 'advisor can log')
    expect((await p.getByRole('button', { name: 'Void this trade' }).count()) === 0, 'advisor can void')
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow <= 0, `page is ${overflow}px too wide`)
    await p.context().close()
  })

  await browser.close()
}
