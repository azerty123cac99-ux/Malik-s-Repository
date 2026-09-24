// Concatenates supabase/migrations/*.sql, in filename order, into
// docs/ALL-MIGRATIONS.sql for pasting once into the Supabase SQL editor on a
// fresh project. Regenerate with: npm run db:combine
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'supabase/migrations'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

const header = `-- =============================================================================
-- ALL MIGRATIONS, combined for a FRESH Supabase project. Generated file:
-- do not edit; run \`npm run db:combine\` to rebuild it.
--
-- Paste the whole file into Supabase → SQL Editor → Run, once.
-- It runs as one transaction: if anything fails, nothing is kept, so you can
-- fix the problem and run it again on the same (still empty) project.
--
-- Do NOT run it on a database that already has these tables; after this first
-- setup, apply only new migration files, one at a time.
--
-- Includes, in order:
${files.map((f) => `--   ${f}`).join('\n')}
-- =============================================================================

begin;
`

const body = files
  .map((f) => `\n-- ▼▼▼ ${f} ▼▼▼\n\n${readFileSync(`${dir}/${f}`, 'utf8').trim()}\n\n-- ▲▲▲ end of ${f} ▲▲▲\n`)
  .join('')

writeFileSync('docs/ALL-MIGRATIONS.sql', `${header}${body}\ncommit;\n`)
console.log(`docs/ALL-MIGRATIONS.sql: ${files.length} migrations combined`)
