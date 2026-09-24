# Wharton Trade Journal

Records the reasoning behind every trade our Investment Club teams place in the
Wharton Global High School Investment Competition simulator (WInS), so the IPS
and final report can be assembled from what's already logged.

Stack: React + Vite + TypeScript, Tailwind, Supabase (auth, Postgres, row-level security), Vercel.

## Local development

Needs Node 20+ and Docker running.

```bash
npm install
npx supabase start      # local database + auth + API
npm run test:rls        # reset the database and prove the privacy rules
npm run seed:users      # create demo logins (password: demo-password-2026)
```

## Layout

- `supabase/migrations/` : database tables and privacy rules (RLS), in order
- `supabase/seed.sql` : 3 demo teams and a placeholder roster (fake emails only; this repo is public)
- `scripts/seed-users.mjs` : creates demo logins by claiming each invite token, like a real student would
- `scripts/test-rls.mjs` : signs in as each role and checks what it can and can't do
