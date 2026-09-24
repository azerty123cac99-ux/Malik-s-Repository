// Creates a login for every email in roster_invites, all with the same demo
// password, so you can sign in as any role during a demo.
//   npm run seed:users
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env.mjs'

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password-2026'

const NAMES = {
  'malik@demo.test': 'Malik',
  'samantha@demo.test': 'Samantha',
  'gabe@demo.test': 'Gabe',
  'walsworth@demo.test': 'Mr. Walsworth',
}

export async function seedUsers({ skip = [] } = {}) {
  const { url, serviceKey } = supabaseEnv()
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: invites, error } = await admin.from('roster_invites').select('email')
  if (error) throw error

  for (const { email } of invites) {
    if (skip.includes(email)) continue
    const full_name = NAMES[email] ?? `Student ${email.split('@')[0].toUpperCase()}`
    const { error: e } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (e && !/already/i.test(e.message)) throw new Error(`${email}: ${e.message}`)
  }
  return invites.length
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = await seedUsers()
  console.log(`Seeded ${n} users. Password for all: ${DEMO_PASSWORD}`)
}
