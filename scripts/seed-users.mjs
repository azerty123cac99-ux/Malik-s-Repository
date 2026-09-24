// Creates a login for every unclaimed invite, all with the same demo password,
// so you can sign in as any role during a demo. Each signup goes through the
// same invite-token check as a real student.
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

  const { data: invites, error } = await admin.rpc('admin_invite_tokens')
  if (error) throw error

  for (const { email, token } of invites) {
    if (skip.includes(email)) continue
    const full_name = NAMES[email] ?? `Student ${email.split('@')[0].toUpperCase()}`
    const { error: e } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name, invite_token: token },
    })
    if (e && !/already/i.test(e.message)) throw new Error(`${email}: ${e.message}`)
  }
  return invites.length
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = await seedUsers()
  console.log(`Seeded ${n} users. Password for all: ${DEMO_PASSWORD}`)
}
