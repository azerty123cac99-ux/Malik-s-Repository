import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.')
}

// One shared client for the whole app. It stores the login session in the
// browser and attaches it to every request, so the database's RLS policies
// know who is asking.
export const supabase = createClient<Database>(url, anonKey)

export type Profile = Database['public']['Tables']['profiles']['Row']
export type AppRole = Database['public']['Enums']['app_role']
