// Browser test for the client profile, pipeline, sell-link rule, positions
// card and team home. Everything is built through the UI on Team C.
import { APP, IPAD, expect, launch, newPage, signIn, step } from './e2e-helpers.mjs'

export async function run() {
  const browser = await launch()
  const gabe = await newPage(browser) // Team C leader
  const c2 = await newPage(browser) // Team C member
  await signIn(gabe, 'gabe@demo.test')
  await signIn(c2, 'c2@demo.test')

  console.log('\nClient profile')

  await step('member sees "not filled in yet" and no Edit button', async () => {
    await c2.getByRole('navigation').getByRole('link', { name: 'Client', exact: true }).click()
    await c2.getByText("Your team leader hasn't filled in the client profile yet.").waitFor()
    expect((await c2.getByRole('button', { name: /Set up|Edit/ }).count()) === 0, 'member has edit')
  })

  await step('leader sets up the profile, objectives and limits', async () => {
    await gabe.getByRole('navigation').getByRole('link', { name: 'Client', exact: true }).click()
    await gabe.getByRole('button', { name: 'Set up' }).click()
    await gabe.getByLabel('Client name').fill('Maple Street Credit Union')
    await gabe.getByRole('radio', { name: 'Medium' }).click()
    await gabe.getByLabel('Time horizon').fill('7 years')
    await gabe.getByLabel('Objective 1', { exact: true }).fill('Beat inflation by 3% a year')
    await gabe.getByRole('button', { name: '+ Add objective' }).click()
    await gabe.getByLabel('Objective 2', { exact: true }).fill('Keep 10% in cash-like assets')
    await gabe.getByLabel('Max per position').fill('15')
    await gabe.getByLabel('Stocks min %').fill('40')
    await gabe.getByLabel('Stocks max %').fill('80')
    await gabe.getByRole('button', { name: 'Save profile' }).click()
    await gabe.getByRole('heading', { name: 'Maple Street Credit Union' }).waitFor()
    await gabe.getByText('Medium', { exact: true }).waitFor()
    await gabe.getByText('Keep 10% in cash-like assets').waitFor()
    await gabe.getByText('15%', { exact: true }).waitFor()
  })

  await step('asset class min above max shows a clear error', async () => {
    await gabe.getByRole('button', { name: 'Edit' }).click()
    await gabe.getByLabel('Bonds min %').fill('50')
    await gabe.getByLabel('Bonds max %').fill('20')
    await gabe.getByRole('button', { name: 'Save profile' }).click()
    await gabe.getByText(/Bonds: min must be ≤ max/).waitFor()
    await gabe.getByLabel('Bonds min %').fill('')
    await gabe.getByLabel('Bonds max %').fill('')
    await gabe.getByRole('button', { name: 'Save profile' }).click()
    await gabe.getByRole('heading', { name: 'Maple Street Credit Union' }).waitFor()
  })

  await step('member now reads the profile (still no Edit)', async () => {
    await c2.reload()
    await c2.getByRole('heading', { name: 'Maple Street Credit Union' }).waitFor()
    expect((await c2.getByRole('button', { name: 'Edit' }).count()) === 0, 'member has edit')
  })

  console.log('\nPipeline')
  let pitchUrl

  await step("an idea saves with just ticker + thesis; 'Pitch to team' waits for the rest", async () => {
    await c2.getByRole('navigation').getByRole('link', { name: 'Pipeline', exact: true }).click()
    await c2.getByRole('link', { name: 'New idea' }).click()
    await c2.getByLabel('Ticker').fill('cost')
    await c2.getByLabel('Thesis: why this?').fill('Membership fees make earnings steady in recessions.')
    expect(await c2.getByRole('button', { name: 'Pitch to team' }).isDisabled(), 'pitch enabled too early')
    await c2.getByRole('button', { name: 'Save as idea' }).click()
    await c2.getByRole('heading', { name: 'COST' }).waitFor()
    await c2.getByText('Idea', { exact: true }).waitFor()
    pitchUrl = c2.url()
  })

  await step('after adding objective, key risk and exit trigger it can be pitched', async () => {
    await c2.getByRole('link', { name: 'Edit' }).click()
    await c2.getByLabel('Client objective it serves').selectOption({ label: 'Beat inflation by 3% a year' })
    await c2.getByLabel('Key risk').fill('Premium valuation')
    await c2.getByLabel('Exit trigger: what would make us sell?').fill('Membership renewals fall below 88%')
    await c2.getByRole('button', { name: 'Pitch to team' }).click()
    await c2.getByText('Pitched', { exact: true }).waitFor()
    await c2.getByText('Beat inflation by 3% a year').waitFor()
  })

  await step('member votes and comments; no Approve button for members', async () => {
    await c2.getByRole('button', { name: 'Vote up' }).click()
    await c2.getByRole('button', { name: 'Vote up', pressed: true }).waitFor()
    await c2.getByLabel('Add a comment').fill('Renewal rate is 90%+ in the US.')
    await c2.getByRole('button', { name: 'Post comment' }).click()
    await c2.getByText('Renewal rate is 90%+ in the US.').waitFor()
    await c2.getByRole('heading', { name: 'Discussion (1)' }).waitFor()
    expect((await c2.getByRole('button', { name: 'Approve' }).count()) === 0, 'member can approve')
  })

  await step('leader approves from the pitch page', async () => {
    await gabe.goto(pitchUrl)
    await gabe.getByRole('button', { name: 'Approve' }).click()
    await gabe.getByText('Approved', { exact: true }).waitFor()
    await gabe.getByText(/Approved by Gabe/).waitFor()
  })

  await step('pipeline filter chips count by stage', async () => {
    await c2.getByRole('navigation').getByRole('link', { name: 'Pipeline', exact: true }).click()
    await c2.getByRole('tab', { name: 'Approved 1' }).click()
    await c2.getByTestId('pitch-card').filter({ hasText: 'COST' }).waitFor()
    await c2.getByRole('tab', { name: 'Idea 0' }).click()
    await c2.getByText('Nothing in this stage.').waitFor()
  })

  console.log('\nSell must link to the Bought pitch (form)')

  const logTrade = async (page, { side, ticker, qty, price, pitchLabel, rationale }) => {
    await page.goto(`${APP}/trades/new`)
    if (side === 'sell') await page.getByRole('radio', { name: 'Sell' }).click()
    await page.getByLabel('Ticker').fill(ticker)
    await page.getByLabel('Quantity').fill(String(qty))
    await page.getByLabel('Price per share').fill(String(price))
    if (pitchLabel) await page.getByLabel('Linked pitch').selectOption({ label: pitchLabel })
    await page.getByLabel('Rationale (required)').fill(rationale)
    // Wait until the form has loaded its trades and pitches (Save stops saying "Loading…").
    await page.getByRole('button', { name: /Save trade|Choose a pitch to save|Add a rationale to save/ }).waitFor()
  }

  await step('buying COST auto-links the one approved pitch; the pitch shows Bought', async () => {
    await logTrade(c2, { side: 'buy', ticker: 'COST', qty: 10, price: 900, rationale: 'Opening position per pitch.' })
    expect((await c2.getByLabel('Linked pitch').inputValue()) !== '', 'pitch not auto-linked')
    await c2.getByRole('button', { name: 'Save trade' }).click()
    await c2.getByRole('heading', { name: 'Trade log' }).waitFor()
    await c2.goto(pitchUrl)
    await c2.getByText('Bought', { exact: true }).waitFor()
  })

  await step('selling COST locks the link to the Bought pitch (no "No pitch" option)', async () => {
    await logTrade(c2, { side: 'sell', ticker: 'COST', qty: 1, price: 950, rationale: 'x' })
    await c2.getByText('COST is held under this pitch, so the sell links to it.').waitFor()
    const options = await c2.getByLabel('Linked pitch').locator('option').allTextContents()
    expect(!options.some((o) => o.startsWith('No pitch')), `options: ${options}`)
  })

  await step('with two Bought COST pitches, the student must choose before saving', async () => {
    // Second COST pitch, approved and bought.
    await c2.goto(`${APP}/pipeline/new`)
    await c2.getByLabel('Ticker').fill('COST')
    await c2.getByLabel('Thesis: why this?').fill('Second look: store expansion in Asia.')
    await c2.getByLabel('Client objective it serves').selectOption({ label: 'Beat inflation by 3% a year' })
    await c2.getByLabel('Key risk').fill('Execution abroad')
    await c2.getByLabel('Exit trigger: what would make us sell?').fill('Asia store growth stalls')
    await c2.getByRole('button', { name: 'Pitch to team' }).click()
    await c2.getByText('Pitched', { exact: true }).waitFor()
    const second = c2.url()
    await gabe.goto(second)
    await gabe.getByRole('button', { name: 'Approve' }).click()
    await gabe.getByText('Approved', { exact: true }).waitFor()
    await logTrade(c2, { side: 'buy', ticker: 'COST', qty: 5, price: 910, rationale: 'Adding per second pitch.' })
    const label2 = (await c2.getByLabel('Linked pitch').locator('option', { hasText: 'Second look' }).textContent()).trim()
    await c2.getByLabel('Linked pitch').selectOption({ label: label2 })
    await c2.getByRole('button', { name: 'Save trade' }).click()
    await c2.getByRole('heading', { name: 'Trade log' }).waitFor()

    await logTrade(c2, { side: 'sell', ticker: 'COST', qty: 2, price: 950, rationale: 'Trimming the first thesis position.' })
    await c2.getByText('COST is held under 2 pitches. Pick the one this sell closes.').waitFor()
    const save = c2.getByRole('button', { name: 'Choose a pitch to save' })
    expect(await save.isDisabled(), 'save enabled without choosing')
    const label1 = (await c2.getByLabel('Linked pitch').locator('option', { hasText: 'Membership fees' }).textContent()).trim()
    await c2.getByLabel('Linked pitch').selectOption({ label: label1 })
    await c2.getByRole('button', { name: 'Save trade' }).click()
    await c2.getByRole('heading', { name: 'Trade log' }).waitFor()
  })

  await step('positions card: COST 13 shares and Cash = 100,000 − 9,000 − 4,550 + 1,900', async () => {
    // Cash: 100,000 − 10×900 − 5×910 + 2×950 = 88,350
    const cash = c2.getByTestId('cash-row')
    await cash.getByText('$88,350.00').waitFor()
    await c2.getByRole('row', { name: /COST\s+13/ }).waitFor()
    // Total: 88,350 + 13 × 950 (last traded price) = 100,700
    await c2.getByTestId('total-row').getByText('$100,700.00').waitFor()
  })

  console.log('\nTeam home and deadlines')

  await step('home shows IPS and final report countdowns', async () => {
    await c2.goto(APP)
    const ips = c2.getByTestId('deadline').filter({ hasText: 'Investment Policy Statement' })
    await ips.getByText(/^in \d+ days$/).waitFor()
    await c2.getByTestId('deadline').filter({ hasText: 'Final report' }).getByText(/^in \d+ days$/).waitFor()
    expect((await c2.getByRole('button', { name: 'Mark submitted' }).count()) === 0, 'member can mark submitted')
  })

  await step('leader marks IPS submitted; member sees it; Team B still "Not submitted"', async () => {
    await gabe.goto(APP)
    const ips = gabe.getByTestId('deadline').filter({ hasText: 'Investment Policy Statement' })
    await ips.getByRole('button', { name: 'Mark submitted' }).click()
    await ips.getByText('Submitted ✓').waitFor()
    await c2.reload()
    await c2.getByTestId('deadline').filter({ hasText: 'Investment Policy Statement' }).getByText('Submitted ✓').waitFor()
    const b = await newPage(browser)
    await signIn(b, 'samantha@demo.test')
    await b.getByTestId('deadline').filter({ hasText: 'Investment Policy Statement' }).getByText('Not submitted').waitFor()
    await b.context().close()
  })

  await step('leader adds a team deadline; member sees it; Team B does not', async () => {
    await gabe.getByLabel("What's due").fill('Pitch night')
    await gabe.getByLabel('Date').fill('2026-10-15')
    await gabe.getByRole('button', { name: 'Add deadline' }).click()
    await gabe.getByTestId('deadline').filter({ hasText: 'Pitch night' }).waitFor()
    await c2.reload()
    await c2.getByTestId('deadline').filter({ hasText: 'Pitch night' }).waitFor()
    const b = await newPage(browser)
    await signIn(b, 'b2@demo.test')
    await b.getByTestId('deadline').first().waitFor()
    expect((await b.getByText('Pitch night').count()) === 0, 'Team B sees Team C deadline')
    await b.context().close()
  })

  console.log('\nAdvisor is read-only everywhere')

  await step('advisor can browse Team C but gets no write buttons (iPad)', async () => {
    const adv = await newPage(browser, IPAD)
    await signIn(adv, 'walsworth@demo.test')
    await adv.getByRole('navigation').getByRole('link', { name: 'Pipeline', exact: true }).click()
    await adv.getByLabel('Team').selectOption({ label: 'Team C' })
    await adv.getByTestId('pitch-card').first().waitFor()
    expect((await adv.getByRole('link', { name: 'New idea' }).count()) === 0, 'advisor can add ideas')
    await adv.getByTestId('pitch-card').first().click()
    await adv.getByRole('heading', { name: /Discussion/ }).waitFor()
    for (const name of ['Vote up', 'Approve', 'Post comment']) {
      expect((await adv.getByRole('button', { name }).count()) === 0, `advisor sees ${name}`)
    }
    await adv.getByRole('navigation').getByRole('link', { name: 'Client', exact: true }).click()
    await adv.getByLabel('Team').selectOption({ label: 'Team C' })
    await adv.getByRole('heading', { name: 'Maple Street Credit Union' }).waitFor()
    expect((await adv.getByRole('button', { name: 'Edit' }).count()) === 0, 'advisor can edit profile')
    await adv.context().close()
  })

  for (const p of [gabe, c2]) {
    await step('no JavaScript errors', async () => expect(!p.errors.length, p.errors.join(' | ')))
  }
  await browser.close()
}
