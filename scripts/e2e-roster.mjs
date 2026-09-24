// Browser test for the roster screen: invite, copy link, join, regenerate,
// revoke & reissue, and who can see what.
import { APP, IPAD, SHOTS, expect, launch, newPage, signIn, step } from './e2e-helpers.mjs'

const linkInSheet = (page) => page.getByRole('textbox', { name: 'Invite link' }).inputValue()

async function joinWith(browser, url, name, password = 'new-student-pw') {
  const page = await newPage(browser)
  await page.goto(url)
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByText(`Hi, ${name}`).waitFor()
  await page.context().close()
}

async function linkIsDead(browser, url) {
  const page = await newPage(browser)
  await page.goto(url)
  await page.getByRole('heading', { name: 'Invite link not valid' }).waitFor()
  await page.context().close()
}

export async function run() {
  const browser = await launch()
  console.log('\nRoster (Team C leader, phone)')
  const gabe = await newPage(browser)
  const member = (name) => gabe.locator('li', { hasText: name })
  let firstLink

  await step('leader sees the Roster tab and their team', async () => {
    await signIn(gabe, 'gabe@demo.test')
    await gabe.getByRole('link', { name: 'Roster' }).click()
    await gabe.getByRole('heading', { name: 'Roster' }).waitFor()
    await member('c2@demo.test').first().waitFor()
    await gabe.screenshot({ path: `${SHOTS}phone-7-roster.png`, fullPage: true })
  })

  await step('creating an invite opens the link sheet with a join link', async () => {
    await gabe.getByLabel('Their email').fill('NewC@Demo.test')
    await gabe.getByRole('button', { name: 'Create invite link' }).click()
    await gabe.getByRole('dialog', { name: 'Invite link' }).waitFor()
    firstLink = await linkInSheet(gabe)
    expect(/\/join\?token=[0-9a-f]{64}$/.test(firstLink), `link was ${firstLink}`)
    await gabe.screenshot({ path: `${SHOTS}phone-8-link-sheet.png` })
  })

  await step('Copy puts the link on the clipboard', async () => {
    await gabe.getByRole('button', { name: 'Copy', exact: true }).click()
    await gabe.getByRole('button', { name: 'Copied ✓' }).waitFor()
    const clip = await gabe.evaluate(() => navigator.clipboard.readText())
    expect(clip === firstLink, `clipboard had ${clip}`)
    await gabe.getByRole('button', { name: 'Done' }).click()
  })

  await step('the invite is listed as waiting, email lowercased', async () => {
    await member('newc@demo.test').first().waitFor()
    await member('newc@demo.test').getByText(/expires in 7 days/).waitFor()
  })

  await step('Regenerate gives a new link; the old one stops working', async () => {
    await member('newc@demo.test').getByRole('button', { name: 'Regenerate' }).click()
    await gabe.getByRole('dialog', { name: 'Invite link' }).waitFor()
    const newLink = await linkInSheet(gabe)
    expect(newLink !== firstLink, 'link did not change')
    await gabe.getByRole('button', { name: 'Done' }).click()
    await linkIsDead(browser, firstLink)
    firstLink = newLink
  })

  await step('the student joins with the new link and appears under Members', async () => {
    await joinWith(browser, firstLink, 'Casey New')
    await gabe.reload()
    await member('Casey New').first().waitFor()
  })

  await step('Revoke button stays disabled until the full name is typed', async () => {
    await member('Casey New').getByRole('button', { name: 'Revoke & reissue' }).click()
    const dialog = gabe.getByRole('dialog', { name: 'Revoke & reissue' })
    await dialog.getByText("This permanently deletes Casey New's account").waitFor()
    const go = dialog.getByRole('button', { name: 'Delete account and create new link' })
    expect(await go.isDisabled(), 'enabled before typing')
    await dialog.getByLabel(/Type "Casey New"/).fill('Casey')
    expect(await go.isDisabled(), 'enabled with partial name')
    await dialog.getByLabel(/Type "Casey New"/).fill('  casey   new ')
    expect(await go.isEnabled(), 'still disabled with full name')
    await gabe.screenshot({ path: `${SHOTS}phone-9-revoke.png` })
  })

  let reissued
  await step('revoking removes the account, logs it, and shows a new link', async () => {
    await gabe.getByRole('button', { name: 'Delete account and create new link' }).click()
    await gabe.getByRole('dialog', { name: 'Invite link' }).waitFor()
    reissued = await linkInSheet(gabe)
    await gabe.getByRole('button', { name: 'Done' }).click()
    expect((await member('Casey New').count()) === 0, 'still listed as a member')
    await gabe.getByRole('heading', { name: 'Revoked accounts' }).waitFor()
    await gabe.getByText(/newc@demo\.test · revoked .* by Gabe/).waitFor()
  })

  await step("the old account's password no longer works", async () => {
    const page = await newPage(browser)
    await page.goto(APP)
    await page.getByLabel('Email').fill('newc@demo.test')
    await page.getByLabel('Password').fill('new-student-pw')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByText('Wrong email or password.').waitFor()
    await page.context().close()
  })

  await step('the real student joins with the reissued link', async () => {
    await joinWith(browser, reissued, 'Casey Real', 'real-student-pw')
  })

  await step('no JavaScript errors', async () => expect(!gabe.errors.length, gabe.errors.join(' | ')))
  await gabe.context().close()

  console.log('\nRoster: who sees what')

  await step('member has no Roster tab, and /roster shows Home instead', async () => {
    const page = await newPage(browser)
    await signIn(page, 'c2@demo.test')
    expect((await page.getByRole('link', { name: 'Roster' }).count()) === 0, 'member sees Roster tab')
    await page.goto(`${APP}/roster`)
    await page.getByText(/^Hi, /).waitFor()
    expect((await page.getByRole('heading', { name: 'Roster' }).count()) === 0, 'member sees roster')
    await page.context().close()
  })

  await step('Team B leader sees only Team B, with no team switcher', async () => {
    const page = await newPage(browser)
    await signIn(page, 'samantha@demo.test')
    await page.goto(`${APP}/roster`)
    await page.getByText('b2@demo.test').waitFor()
    expect((await page.getByText('c2@demo.test').count()) === 0, 'sees Team C')
    expect((await page.getByLabel('Team').count()) === 0, 'has team switcher')
    expect((await page.getByRole('button', { name: 'Make leader' }).count()) === 0, 'can promote')
    await page.context().close()
  })

  await step('president can switch teams and promote (iPad)', async () => {
    const page = await newPage(browser, IPAD)
    await signIn(page, 'malik@demo.test')
    await page.goto(`${APP}/roster`)
    await page.getByLabel('Team').selectOption({ label: 'Team B' })
    await page.getByText('b2@demo.test').waitFor()
    const row = page.locator('li', { hasText: 'b2@demo.test' })
    await row.getByRole('button', { name: 'Make leader' }).click()
    await row.getByText('Leader', { exact: true }).waitFor()
    await page.screenshot({ path: `${SHOTS}ipad-7-roster-president.png`, fullPage: true })
    await row.getByRole('button', { name: 'Make member' }).click()
    await row.getByRole('button', { name: 'Make leader' }).waitFor()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow <= 0, `page is ${overflow}px too wide`)
    await page.context().close()
  })

  await browser.close()
}
