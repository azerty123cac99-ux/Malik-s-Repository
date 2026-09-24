// Runs docs/SMOKE-TEST.md step by step in a browser, twice, to prove the
// checklist works and can be rerun without any cleanup.
import { APP, expect, launch, newPage, signIn, step } from './e2e-helpers.mjs'

const EMAIL = 'smoketest@example.com'
const PASSWORD = 'smoke-test-2026'

export async function run() {
  const browser = await launch()
  const me = await newPage(browser) // the president's normal tab
  await signIn(me, 'malik@demo.test')

  for (const round of [1, 2]) {
    console.log(`\nSmoke test in Sandbox, run ${round}`)
    let link
    const sandboxRoster = async () => {
      await me.goto(`${APP}/roster`)
      await me.getByLabel('Team').selectOption({ label: 'Sandbox' })
      await me.getByRole('heading', { name: /Waiting to join/ }).waitFor()
    }

    await step('1. president gets the invite link for the Sandbox test user', async () => {
      await sandboxRoster()
      const pending = me.locator('li', { hasText: EMAIL })
      if (round === 1) {
        await me.getByLabel('Their email').fill(EMAIL)
        await me.getByRole('button', { name: 'Create invite link' }).click()
      } else {
        await pending.getByRole('button', { name: 'Copy invite link' }).click()
      }
      await me.getByRole('dialog', { name: 'Invite link' }).waitFor()
      link = await me.getByRole('textbox', { name: 'Invite link' }).inputValue()
      await me.getByRole('button', { name: 'Copy', exact: true }).click()
      await me.getByRole('button', { name: 'Copied ✓' }).waitFor()
      await me.getByRole('button', { name: 'Done' }).click()
    })

    const priv = await newPage(browser) // the private tab
    await step('2. join in a private tab; refresh keeps the form; no Roster tab', async () => {
      await priv.goto(link)
      await priv.getByRole('heading', { name: 'Join Sandbox' }).waitFor()
      await priv.reload()
      await priv.getByRole('heading', { name: 'Join Sandbox' }).waitFor()
      await priv.getByLabel('Your name').fill('Smoke Test')
      await priv.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await priv.getByLabel('Confirm password').fill(PASSWORD)
      await priv.getByRole('button', { name: 'Create account' }).click()
      await priv.getByText('Hi, Smoke Test').waitFor()
      await priv.getByText(/Sandbox:/).waitFor()
      expect((await priv.getByRole('link', { name: 'Roster', exact: true }).count()) === 0, 'Roster tab shown')
      expect((await priv.getByText('Competition deadlines').count()) === 0, 'Sandbox shows competition deadlines')
    })

    await step('3. log a $1 trade; Cash drops by exactly $1', async () => {
      await priv.goto(`${APP}/trades/new`)
      await priv.getByLabel('Ticker').fill('ZZTEST')
      await priv.getByLabel('Quantity').fill('1')
      await priv.getByLabel('Price per share').fill('1')
      expect(await priv.getByRole('button', { name: 'Add a rationale to save' }).isDisabled(), 'save enabled')
      await priv.getByLabel('Rationale (required)').fill('Smoke test, will be voided')
      await priv.getByRole('button', { name: 'Save trade' }).click()
      const card = priv.getByTestId('trade').filter({ hasText: 'Smoke test, will be voided' }).first()
      await card.getByText('by Smoke Test').waitFor()
      await priv.getByTestId('cash-row').getByText('$99,999.00').waitFor()
    })

    await step('4. void it; Cash is back to $100,000', async () => {
      // Only un-voided trades have this button; earlier runs' trades are voided.
      await priv.getByRole('button', { name: 'Void this trade' }).first().click()
      const go = priv.getByRole('dialog').getByRole('button', { name: 'Void trade' })
      expect(await go.isDisabled(), 'void enabled without reason')
      await priv.getByLabel('Reason (required)').fill('Smoke test')
      await go.click()
      await priv.getByText('Voided').first().waitFor()
      await priv.getByTestId('cash-row').getByText('$100,000.00').waitFor()
    })

    await step('5. the test user sees only Sandbox content', async () => {
      await priv.goto(`${APP}/pipeline`)
      await priv.getByText('No ideas yet.').waitFor()
      await priv.goto(`${APP}/client`)
      await priv.getByText("Your team leader hasn't filled in the client profile yet.").waitFor()
      expect((await priv.getByLabel('Team').count()) === 0, 'team switcher shown')
    })

    await step('6. president revokes & reissues; test user is locked out', async () => {
      await sandboxRoster()
      await me.locator('li', { hasText: 'Smoke Test' }).getByRole('button', { name: 'Revoke & reissue' }).click()
      await me.getByLabel(/Type "Smoke Test"/).fill('Smoke Test')
      await me.getByRole('button', { name: 'Delete account and create new link' }).click()
      await me.getByRole('dialog', { name: 'Invite link' }).waitFor()
      await me.getByRole('button', { name: 'Done' }).click()
      await me.getByText(new RegExp(`${EMAIL.replace('.', '\\.')} · revoked`)).first().waitFor()
      await priv.goto(APP)
      await priv.getByRole('heading', { name: /No access|Sign in/ }).waitFor()
      const login = await newPage(browser)
      await login.goto(APP)
      await login.getByLabel('Email').fill(EMAIL)
      await login.getByLabel('Password').fill(PASSWORD)
      await login.getByRole('button', { name: 'Sign in' }).click()
      await login.getByText('Wrong email or password.').waitFor()
      await login.context().close()
    })
    await priv.context().close()
  }

  await step('Sandbox never appears to a real team member', async () => {
    const p = await newPage(browser)
    await signIn(p, 'a2@demo.test')
    await p.goto(`${APP}/trades`)
    expect((await p.getByText('ZZTEST').count()) === 0, 'real team sees sandbox trade')
    await p.context().close()
  })

  await step('no JavaScript errors', async () => expect(!me.errors.length, me.errors.join(' | ')))
  await browser.close()
}
