// Shared bits for the browser tests.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env.mjs'

export const APP = process.env.APP_URL ?? 'http://127.0.0.1:5173'
export const SHOTS = new URL('../test-results/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })

const { url, serviceKey } = supabaseEnv()
export const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// Uses an installed Chrome/Chromium; set CHROMIUM_PATH if it is somewhere else.
export const launch = () =>
  chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    channel: process.env.CHROMIUM_PATH ? undefined : 'chrome',
  })

export const PHONE = { width: 390, height: 844 }
export const IPAD = { width: 820, height: 1180 }

export async function newPage(browser, viewport = PHONE) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(e.message))
  page.on('dialog', (d) => d.accept()) // say OK to confirm() prompts
  return page
}

export async function signIn(page, email, password = 'demo-password-2026') {
  await page.goto(APP)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Sign out' }).waitFor()
}

let passed = 0
let failed = 0
export async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log('  ✓', name)
  } catch (e) {
    failed++
    console.log('  ✗', name, '\n     ', e.message.split('\n')[0])
  }
}
export function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}
export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`)
  return failed
}
