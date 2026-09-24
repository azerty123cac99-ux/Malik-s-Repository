// Browser test for sign-in and /join at phone and iPad sizes.
// Needs the dev server running (npm run dev) on a freshly reset database:
//   npx supabase db reset && npm run test:e2e
// Screenshots land in test-results/.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env.mjs'
import { seedUsers } from './seed-users.mjs'

const APP = 'http://127.0.0.1:5173'
const SHOTS = new URL('../test-results/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })
await seedUsers({ skip: ['c4@demo.test', 'c5@demo.test'] })
const { url, serviceKey } = supabaseEnv()
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const tokens = Object.fromEntries((await admin.rpc('admin_invite_tokens')).data.map((r) => [r.email, r.token]))

// Uses an installed Chrome/Chromium; set CHROMIUM_PATH if it is somewhere else.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, channel: process.env.CHROMIUM_PATH ? undefined : 'chrome' })
let ok = 0, bad = 0
const step = async (name, fn) => {
  try { await fn(); ok++; console.log('  ✓', name) } catch (e) { bad++; console.log('  ✗', name, '\n     ', e.message.split('\n')[0]) }
}

for (const [device, viewport] of [['phone', { width: 390, height: 844 }], ['ipad', { width: 820, height: 1180 }]]) {
  console.log(`\n${device} ${viewport.width}x${viewport.height}`)
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: device === 'phone' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const shot = (n) => page.screenshot({ path: `${SHOTS}${device}-${n}.png` })
  const email = device === 'phone' ? 'c4@demo.test' : 'c5@demo.test'

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
    if ((await field.inputValue()) !== email) throw new Error('wrong email prefilled')
    if (!(await field.evaluate((el) => el.readOnly))) throw new Error('email is editable')
    await shot('3-join')
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
    if (page.url().includes('token')) throw new Error(`token still in URL: ${page.url()}`)
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
    if (overflow > 0) throw new Error(`page is ${overflow}px too wide`)
  })

  await step('no JavaScript errors', async () => {
    if (errors.length) throw new Error(errors.join(' | '))
  })
  await ctx.close()
}

// Deactivated user sees "No access".
console.log('\nremoved users')
await admin.from('profiles').update({ active: false }).eq('email', 'b3@demo.test')
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  await step('deactivated member signs in and sees "No access"', async () => {
    await page.goto(APP)
    await page.getByLabel('Email').fill('b3@demo.test')
    await page.getByLabel('Password').fill('demo-password-2026')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'No access' }).waitFor()
    await page.screenshot({ path: `${SHOTS}phone-6-no-access.png` })
  })
  await ctx.close()
}

await browser.close()
console.log(`\n${ok} passed, ${bad} failed`)
process.exit(bad ? 1 : 0)
