// Runs one browser test file on its own, e.g.:
//   npx supabase db reset && npm run test:e2e:one -- e2e-updates.mjs
// Add E2E_LATENCY=1 to simulate a slow phone connection.
import { finish } from './e2e-helpers.mjs'
import { seedUsers } from './seed-users.mjs'
const mod = await import(`./${process.argv[2]}`)
await seedUsers({ skip: ['c4@demo.test', 'c5@demo.test'] })
await mod.run()
process.exit(finish() ? 1 : 0)
