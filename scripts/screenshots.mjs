// Takes screenshots of the main screens on the demo data, at phone and iPad
// sizes, into test-results/. Needs the dev server running.
//   npx supabase db reset && npm run seed:demo && npm run screenshots
import { APP, IPAD, PHONE, SHOTS, launch, newPage, signIn } from './e2e-helpers.mjs'

const browser = await launch()
for (const [device, viewport] of [['phone', PHONE], ['ipad', IPAD]]) {
  const page = await newPage(browser, viewport)
  await signIn(page, 'malik@demo.test')
  const shot = async (name, path, waitFor) => {
    await page.goto(`${APP}${path}`)
    await page.getByText(waitFor).first().waitFor()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}demo-${device}-${name}.png`, fullPage: true })
  }
  await shot('home', '/', 'Competition deadlines')
  await shot('pipeline', '/pipeline', 'NVDA')
  await page.getByTestId('pitch-card').filter({ hasText: 'JNJ' }).click()
  await page.getByText('Discussion (3)').waitFor()
  await page.screenshot({ path: `${SHOTS}demo-${device}-pitch.png`, fullPage: true })
  await shot('client', '/client', 'Hartwell Family Education Trust')
  await shot('trades', '/trades', 'Positions')
  await page.context().close()
}
await browser.close()
console.log(`Screenshots saved to ${SHOTS}`)
