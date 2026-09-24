// Reads the Supabase settings baked in at build time and checks them before
// the app starts, so a bad deploy shows a clear error instead of a blank page.
//   VITE_*        : local development (.env.local) and hand-set Vercel vars
//   NEXT_PUBLIC_* : set by the Supabase–Vercel integration
const env = import.meta.env as Record<string, string | undefined>

// First value that is actually filled in (an empty string counts as missing).
const pick = (...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => v) ?? ''

export const supabaseUrl = pick('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
export const supabaseAnonKey = pick('VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

/** What's wrong with the configuration, or an empty list if it's usable. */
export function configProblems(): string[] {
  const problems: string[] = []
  if (!supabaseUrl) problems.push('Supabase URL is missing (VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL).')
  else if (!/^https?:\/\/[^\s/]+/.test(supabaseUrl)) problems.push('Supabase URL is not a valid http(s) address.')
  if (!supabaseAnonKey) problems.push('Supabase key is missing (VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  return problems
}
