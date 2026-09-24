// Browser test for sign-in and /join at phone and iPad sizes.
import { APP, IPAD, PHONE, SHOTS, admin, expect, launch, newPage, step } from './e2e-helpers.mjs'

export async function run() {
  const tokens = Object.fromEntries((await admin.rpc('admin_invite_tokens')).data.map((r) => [r.email, r.token]))
  const browser = await launch()

  for (const [device, viewport, email] of [
    ['phone', PHONE, 'c4@demo.test'],
    ['ipad', IPAD, 'c5@demo.test'],
  ]) {
    console.log(`\nSign-in and /join: ${device} ${viewport.width}x${viewport.height}`)
    const page = await newPage(browser, viewport)
    const shot = (n) => page.screenshot({ path: `${SHOTS}${device}-${n}.png` })

    await step('login page renders', async () => {
      await page.goto(APP)
      await page.getByRole('heading', { name: 'Sign in' }).waitFor()
      await shot('1-login')
    })

    await step('wrong password shows an error', async () => {
      await page.getByLabel('Email').fill('samantha@demo.test')
      await page.getByLabel('Password').fill('wrong-password')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByText('Wrong email or password.').waitFor()
    })

    await step('correct password signs in and shows team and role', async () => {
      await page.getByLabel('Password').fill('demo-password-2026')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByText('Hi, Samantha').waitFor()
      await page.getByText('Team B').first().waitFor()
      await shot('2-home')
    })

    await step('/join while signed in asks to sign out first', async () => {
      await page.goto(`${APP}/join?token=${tokens[email]}`)
      await page.getByText("You're already signed in").waitFor()
      await page.getByRole('button', { name: 'Sign out' }).click()
    })

    await step('/join shows the invite email (read-only) and team', async () => {
      await page.getByRole('heading', { name: 'Join Team C' }).waitFor()
      const field = page.getByLabel('Email')
      expect((await field.inputValue()) === email, 'wrong email prefilled')
      expect(await field.evaluate((el) => el.readOnly), 'email is editable')
      await shot('3-join')
    })

    await step('/join opened directly in a fresh tab loads, and survives a refresh', async () => {
      const fresh = await newPage(browser, viewport)
      const res = await fresh.goto(`${APP}/join?token=${tokens[email]}`)
      expect(res.status() === 200, `HTTP ${res.status()}`)
      await fresh.getByRole('heading', { name: 'Join Team C' }).waitFor()
      await fresh.reload()
      await fresh.getByRole('heading', { name: 'Join Team C' }).waitFor()
      await fresh.context().close()
    })

    await step('mismatched passwords are caught before submitting', async () => {
      await page.getByLabel('Your name').fill('Chris')
      await page.getByLabel('Password', { exact: true }).fill('correct-horse-1')
      await page.getByLabel('Confirm password').fill('correct-horse-2')
      await page.getByRole('button', { name: 'Create account' }).click()
      await page.getByText("The two passwords don't match.").waitFor()
    })

    await step('valid form creates the account and signs in; token leaves the URL', async () => {
      await page.getByLabel('Confirm password').fill('correct-horse-1')
      await page.getByRole('button', { name: 'Create account' }).click()
      await page.getByText('Hi, Chris').waitFor()
      expect(!page.url().includes('token'), `token still in URL: ${page.url()}`)
      await shot('4-joined')
      await page.getByRole('button', { name: 'Sign out' }).click()
    })

    await step('the same link again says it is no longer valid', async () => {
      await page.goto(`${APP}/join?token=${tokens[email]}`)
      await page.getByRole('heading', { name: 'Invite link not valid' }).waitFor()
      await shot('5-dead-link')
    })

    await step('a made-up token says it is not valid', async () => {
      await page.goto(`${APP}/join?token=${'0'.repeat(64)}`)
      await page.getByRole('heading', { name: 'Invite link not valid' }).waitFor()
    })

    await step('new account can sign in with its password', async () => {
      await page.goto(APP)
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill('correct-horse-1')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByText('Hi, Chris').waitFor()
      await page.getByRole('button', { name: 'Sign out' }).click()
    })

    await step('no horizontal scrolling', async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow <= 0, `page is ${overflow}px too wide`)
    })

    await step('no JavaScript errors', async () => expect(!page.errors.length, page.errors.join(' | ')))
    await page.context().close()
  }

  console.log('\nRemoved users')
  await admin.from('profiles').update({ active: false }).eq('email', 'b3@demo.test')
  const page = await newPage(browser)
  await step('deactivated member signs in and sees "No access"', async () => {
    await page.goto(APP)
    await page.getByLabel('Email').fill('b3@demo.test')
    await page.getByLabel('Password').fill('demo-password-2026')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'No access' }).waitFor()
    await page.screenshot({ path: `${SHOTS}phone-6-no-access.png` })
  })
  await admin.from('profiles').update({ active: true }).eq('email', 'b3@demo.test')
  await browser.close()
}
