// Shared bits for the database tests.
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env.mjs'
import { DEMO_PASSWORD } from './seed-users.mjs'

const { url, anonKey, serviceKey, dbUrl } = supabaseEnv()

export const TEAM = {
  A: '00000000-0000-0000-0000-00000000000a',
  B: '00000000-0000-0000-0000-00000000000b',
  C: '00000000-0000-0000-0000-00000000000c',
}

export const newClient = () => createClient(url, anonKey, { auth: { persistSession: false } })
export const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
export const sql = (q) => execSync(`psql "${dbUrl}" -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim()

export async function as(email, password = DEMO_PASSWORD) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  client.uid = data.user.id
  return client
}

export async function idOf(email) {
  const { data } = await admin.from('profiles').select('id').eq('email', email).single()
  return data.id
}

let passed = 0
let failed = 0
export async function check(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ✗ ${name}\n      ${e.message}`)
  }
}
export function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}
export const section = (t) => console.log(`\n${t}`)
export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
