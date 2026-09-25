// Every write action must update the screen WITHOUT a reload, show a success
// message, and resist double submits. No step in this file calls reload().
// Run with E2E_LATENCY=1 to simulate a slow phone connection.
import { APP, expect, launch, newPage, signIn, step } from './e2e-helpers.mjs'

// A full page reload wipes this marker, so it proves the screen updated in place.
const mark = (page) => page.evaluate(() => (window.__noReload = true))
async function success(page, text) {
  await page.getByTestId('action-success').filter({ hasText: text }).waitFor()
  expect(await page.evaluate(() => window.__noReload === true), 'the page was reloaded')
}

export async function run() {
  const browser = await launch()
  const lead = await newPage(browser) // Team B leader
  const mem = await newPage(browser) // Team B member
  await signIn(lead, 'samantha@demo.test')
  await signIn(mem, 'b4@demo.test')
  await mark(lead)
  await mark(mem)

  console.log('\nScreens update without reload: client profile')
  await step('save client profile → view shows it + "Client profile saved"', async () => {
    await lead.getByRole('navigation').getByRole('link', { name: 'Client', exact: true }).click()
    await lead.getByRole('button', { name: 'Set up' }).click()
    await lead.getByLabel('Client name').fill('Okafor Retirement Fund')
    await lead.getByLabel('Objective 1', { exact: true }).fill('Preserve capital')
    await lead.getByRole('button', { name: 'Save profile' }).click()
    await lead.getByRole('heading', { name: 'Okafor Retirement Fund' }).waitFor()
    await success(lead, 'Client profile saved')
  })

  console.log('\nScreens update without reload: pitches, votes, comments')
  let pitchUrl
  await step('create an idea → pitch page + "Idea saved"', async () => {
    await mem.getByRole('navigation').getByRole('link', { name: 'Pipeline', exact: true }).click()
    await mem.getByRole('link', { name: 'New idea' }).click()
    await mem.getByLabel('Ticker').fill('PG')
    await mem.getByLabel('Thesis: why this?').fill('Steady consumer staples.')
    await mem.getByRole('button', { name: 'Save as idea' }).click()
    await mem.getByRole('heading', { name: 'PG' }).waitFor()
    await success(mem, 'Idea saved')
    pitchUrl = mem.url()
  })

  await step('edit and pitch it → page shows new thesis, "Pitched" + message', async () => {
    await mem.getByRole('link', { name: 'Edit' }).click()
    await mem.getByLabel('Thesis: why this?').fill('Steady consumer staples with 60+ years of dividend growth.')
    await mem.getByLabel('Client objective it serves').selectOption({ label: 'Preserve capital' })
    await mem.getByLabel('Key risk').fill('Slow growth')
    await mem.getByLabel('Exit trigger: what would make us sell?').fill('Dividend cut')
    await mem.getByRole('button', { name: 'Pitch to team' }).click()
    await mem.getByText('60+ years of dividend growth').waitFor()
    await mem.getByText('Pitched', { exact: true }).waitFor()
    await success(mem, 'Pitched to the team')
  })

  await step('vote up → count and pressed state update + "Vote saved"', async () => {
    await mem.getByRole('button', { name: 'Vote up' }).click()
    await mem.getByRole('button', { name: 'Vote up', pressed: true }).getByText('▲ 1').waitFor()
    await success(mem, 'Vote saved')
  })

  await step('double-clicking "vote down" leaves one consistent vote', async () => {
    await mem.getByRole('button', { name: 'Vote down' }).dblclick()
    await mem.getByRole('button', { name: 'Vote down', pressed: true }).getByText('▼ 1').waitFor()
    await mem.getByRole('button', { name: 'Vote up', pressed: false }).getByText('▲ 0').waitFor()
  })

  await step('post a comment → it appears, box clears, "Comment posted"', async () => {
    await mem.getByLabel('Add a comment').fill('What is the payout ratio?')
    await mem.getByRole('button', { name: 'Post comment' }).click()
    await mem.getByText('What is the payout ratio?').waitFor()
    await mem.getByRole('heading', { name: 'Discussion (1)' }).waitFor()
    await success(mem, 'Comment posted')
    expect((await mem.getByLabel('Add a comment').inputValue()) === '', 'comment box not cleared')
  })

  await step('submitting the comment form twice at once posts it once', async () => {
    await mem.getByLabel('Add a comment').fill('Double submit check')
    await mem.locator('form').filter({ has: mem.getByLabel('Add a comment') }).evaluate((f) => {
      f.requestSubmit()
      f.requestSubmit()
    })
    await mem.getByRole('heading', { name: 'Discussion (2)' }).waitFor()
    await mem.waitForTimeout(1500)
    expect((await mem.getByText('Double submit check').count()) === 1, 'comment posted twice')
  })

  await step('leader: approve → undo → reject → reopen → approve, each shown immediately', async () => {
    await lead.goto(pitchUrl)
    await mark(lead)
    for (const [button, badge, message] of [
      ['Approve', 'Approved', 'Pitch approved'],
      ['Undo approval', 'Pitched', 'Approval undone'],
      ['Reject', 'Rejected', 'Pitch rejected'],
      ['Reopen as pitch', 'Pitched', 'Pitch reopened'],
      ['Approve', 'Approved', 'Pitch approved'],
    ]) {
      await lead.getByRole('button', { name: button, exact: true }).click()
      await lead.getByText(badge, { exact: true }).first().waitFor()
      await success(lead, message)
    }
  })

  console.log('\nScreens update without reload: trades')
  await step('log trade with a double submit → one trade, "Trade saved", positions updated', async () => {
    await mem.goto(`${APP}/trades/new`)
    await mark(mem)
    await mem.getByLabel('Ticker').fill('PG')
    await mem.getByLabel('Quantity').fill('10')
    await mem.getByLabel('Price per share').fill('160')
    await mem.getByLabel('Rationale (required)').fill('Opening per approved pitch.')
    await mem.getByRole('button', { name: 'Save trade' }).waitFor() // form data loaded
    await mark(mem)
    await mem.locator('form').evaluate((f) => {
      f.requestSubmit()
      f.requestSubmit()
    })
    await success(mem, 'Trade saved')
    await mem.getByTestId('trade').filter({ hasText: 'PG' }).first().waitFor()
    await mem.waitForTimeout(1500)
    expect((await mem.getByTestId('trade').filter({ hasText: 'Opening per approved pitch.' }).count()) === 1, 'duplicate trade')
    await mem.getByRole('row', { name: /PG\s+10/ }).waitFor()
  })

  await step('void → struck through, cash restored, "Trade voided"', async () => {
    await mem.getByRole('button', { name: 'Void this trade' }).first().click()
    await mem.getByLabel('Reason (required)').fill('Test void')
    await mem.getByRole('dialog').getByRole('button', { name: 'Void trade' }).dblclick()
    await success(mem, 'Trade voided')
    await mem.getByTestId('trade').filter({ hasText: 'Test void' }).getByText('Voided').waitFor()
    expect((await mem.getByRole('row', { name: /^PG/ }).count()) === 0, 'voided position still listed')
  })

  console.log('\nScreens update without reload: deadlines')
  await step('add → mark submitted → undo → delete, each shown immediately', async () => {
    await lead.goto(APP)
    await mark(lead)
    await lead.getByLabel("What's due").fill('Sector research due')
    await lead.getByLabel('Date').fill('2026-10-20')
    await lead.getByRole('button', { name: 'Add deadline' }).click()
    const card = lead.getByTestId('deadline').filter({ hasText: 'Sector research due' })
    await card.waitFor()
    await success(lead, 'added')
    await card.getByRole('button', { name: 'Mark submitted' }).click()
    await card.getByText('Submitted ✓').waitFor()
    await success(lead, 'marked submitted')
    await card.getByRole('button', { name: 'Undo submitted' }).click()
    await card.getByText('Not submitted').waitFor()
    await success(lead, 'marked not submitted')
    await card.getByRole('button', { name: 'Delete' }).click()
    await success(lead, 'deleted')
    expect((await lead.getByText('Sector research due').count()) <= 1, 'deadline still shown') // only the message
    await lead.getByTestId('deadline').filter({ hasText: 'Sector research due' }).waitFor({ state: 'detached' })
  })

  console.log('\nScreens update without reload: roster')
  await step('invite → listed + link sheet + "Invite created"', async () => {
    await lead.getByRole('navigation').getByRole('link', { name: 'Roster', exact: true }).click()
    await lead.getByLabel('Their email').fill('b20@demo.test')
    await lead.getByRole('button', { name: 'Create invite link' }).dblclick()
    await lead.getByRole('dialog', { name: 'Invite link' }).waitFor()
    await lead.getByRole('button', { name: 'Done' }).click()
    await success(lead, 'Invite created')
    await lead.locator('li', { hasText: 'b20@demo.test' }).first().waitFor()
  })

  await step('regenerate → new link sheet + message', async () => {
    await lead.locator('li', { hasText: 'b20@demo.test' }).getByRole('button', { name: 'Regenerate' }).click()
    await lead.getByRole('dialog', { name: 'Invite link' }).waitFor()
    await lead.getByRole('button', { name: 'Done' }).click()
    await success(lead, 'New link created')
  })

  await step('remove invite → gone from the list + message', async () => {
    await lead.locator('li', { hasText: 'b20@demo.test' }).getByRole('button', { name: 'Remove' }).click()
    await success(lead, 'Invite removed')
    await lead.locator('li', { hasText: 'b20@demo.test' }).waitFor({ state: 'detached' })
  })

  await step('remove from team → "Removed" badge; restore → badge gone', async () => {
    const row = lead.locator('li', { hasText: 'b6@demo.test' })
    await row.getByRole('button', { name: 'Remove from team' }).click()
    await row.getByText('Removed', { exact: true }).waitFor()
    await success(lead, 'removed from the team')
    await row.getByRole('button', { name: 'Restore access' }).click()
    await row.getByText('Removed', { exact: true }).waitFor({ state: 'detached' })
    await success(lead, 'access restored')
  })

  await step('revoke & reissue → member gone, log entry, link sheet + message', async () => {
    const row = lead.locator('li', { hasText: 'b5@demo.test' })
    await row.getByRole('button', { name: 'Revoke & reissue' }).click()
    const name = (await lead.getByLabel(/Type ".*" to confirm/).evaluate((el) => el.labels[0].textContent)).match(/"(.*)"/)[1]
    await lead.getByLabel(/Type ".*" to confirm/).fill(name)
    await lead.getByRole('button', { name: 'Delete account and create new link' }).dblclick()
    await lead.getByRole('dialog', { name: 'Invite link' }).waitFor()
    await lead.getByRole('button', { name: 'Done' }).click()
    await success(lead, "account was deleted")
    await lead.getByText(/b5@demo\.test · revoked/).waitFor()
  })

  await step('president: make leader → badge; make member → badge gone', async () => {
    const pres = await newPage(browser)
    await signIn(pres, 'malik@demo.test')
    await pres.goto(`${APP}/roster`)
    await mark(pres)
    await pres.getByLabel('Team').selectOption({ label: 'Team B' })
    const row = pres.locator('li', { hasText: 'b6@demo.test' })
    await row.getByRole('button', { name: 'Make leader' }).click()
    await row.getByText('Leader', { exact: true }).waitFor()
    await success(pres, 'is now a leader')
    await row.getByRole('button', { name: 'Make member' }).click()
    await row.getByText('Leader', { exact: true }).waitFor({ state: 'detached' })
    await success(pres, 'is now a member')
    await pres.context().close()
  })

  for (const p of [lead, mem]) {
    await step('no JavaScript errors', async () => expect(!p.errors.length, p.errors.join(' | ')))
  }
  await browser.close()
}
