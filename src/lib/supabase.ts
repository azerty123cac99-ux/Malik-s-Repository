import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { supabaseAnonKey, supabaseUrl } from './config'

// One shared client for the whole app. It stores the login session in the
// browser and attaches it to every request, so the database's RLS policies
// know who is asking. main.tsx checks the config before this file is loaded.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

export type Profile = Database['public']['Tables']['profiles']['Row']
export type AppRole = Database['public']['Enums']['app_role']
