// Runs all browser tests. Needs the dev server running (npm run dev) and a
// freshly reset local database:
//   npx supabase db reset && npm run test:e2e
// Screenshots land in test-results/.
import { finish } from './e2e-helpers.mjs'
import { run as join } from './e2e-join.mjs'
import { run as roster } from './e2e-roster.mjs'
import { run as trades } from './e2e-trades.mjs'
import { run as content } from './e2e-content.mjs'
import { run as smoke } from './e2e-smoke.mjs'
import { seedUsers } from './seed-users.mjs'

await seedUsers({ skip: ['c4@demo.test', 'c5@demo.test'] })
await join()
await roster()
await trades()
await content()
await smoke()
process.exit(finish() ? 1 : 0)
