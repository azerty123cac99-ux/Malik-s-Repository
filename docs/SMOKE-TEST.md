# Production smoke test (about 5 minutes, on your phone)

Run this after **every deploy and every migration**. It checks the real site
end to end (joining, logging a trade, voiding, positions, team privacy, and
Revoke & reissue) inside the **Sandbox** team, which a migration creates
automatically. Sandbox never shows up in the president overview, activity
counts or competition deadlines, and no real team can see it, so there is
nothing to clean up. Just run it again next time.

**You need:** your phone and your president account.

**Test user:** `smoketest@example.com`, password `smoke-test-2026`.
No email is ever sent to it. If signup rejects that address, use a Gmail
"+" address of your own instead, e.g. `yourname+smoke@gmail.com`, and use it
in every step below.

The whole checklist is also run automatically by `npm run test:e2e`
(`scripts/e2e-smoke.mjs`, twice in a row), so if a step fails on production
but passes locally, the difference is in the deployment, not the code.

---

## 1. Get the invite link (1 min), as you

1. Sign in as yourself → **Roster** → team switcher → **Sandbox**.
2. **First time ever:** under **Invite someone**, enter the test email,
   role **Member** → **Create invite link**.
   **Every time after that:** the test user is already under
   **Waiting to join** (step 6 reissued it) → **Copy invite link**.
   If it says **Link expired**, tap **Regenerate**.
3. In the sheet, tap **Copy**. ✅ It says **Copied ✓**. Tap **Done**.

## 2. Join as the test user (1 min), in a private tab

1. Open a **private tab** (Safari: tabs button → Private) so you stay signed
   in as yourself in the normal tab.
2. Paste the link. ✅ **Join Sandbox**, with the test email greyed out.
3. **Pull down to refresh.** ✅ Still the join form (proves the Vercel
   rewrite works for links opened directly).
4. Name `Smoke Test`, password `smoke-test-2026` twice → **Create account**.
5. ✅ Home says **Hi, Smoke Test** and shows the grey **Sandbox** notice.
   ✅ No "Competition deadlines" section. ✅ No **Roster** tab.

## 3. Log a trade (1 min), still in the private tab

1. **Trades** → **Log trade** → **Buy**, ticker `ZZTEST`, quantity `1`, price `1`.
2. ✅ The button reads **Add a rationale to save** and is disabled.
3. Rationale: `Smoke test, will be voided` → **Save trade**.
4. ✅ The trade shows "by Smoke Test · no pitch".
5. ✅ **Positions** shows `ZZTEST` worth $1.00 and **Cash $99,999.00**.
   (Sandbox cash is always $100,000 before the test, because every earlier
   test trade was voided.)

## 4. Void it (30 s)

1. **Void this trade** on the new trade. ✅ **Void trade** stays disabled
   until you type a reason.
2. Reason `Smoke test` → **Void trade**.
3. ✅ Struck through, with "Voided by Smoke Test … Smoke test".
4. ✅ **Cash $100,000.00** again, and no `ZZTEST` row in Positions (the
   Positions card may disappear entirely; that's correct).

## 5. Privacy (30 s)

1. **Pipeline**: ✅ "No ideas yet." **Client**: ✅ "Your team leader hasn't
   filled in the client profile yet."
2. ✅ No team switcher anywhere, and nothing from your team or the other
   teams appears on any screen.

## 6. Revoke & reissue (1 min), back in your normal tab

1. **Roster** → **Sandbox** → **Smoke Test** → **Revoke & reissue**.
2. ✅ The red button stays disabled until you type `Smoke Test`. Type it →
   **Delete account and create new link** → **Done**.
3. ✅ **Revoked accounts** lists the test email, revoked just now by you.
   ✅ The test email is back under **Waiting to join**, ready for next time.
4. In the private tab, tap **Home**. ✅ **No access** (or the sign-in page).
5. Sign in there with the test email and `smoke-test-2026`.
   ✅ "Wrong email or password."
6. Close the private tab. **Done.** Nothing to clean up.

---

## If something fails

Screenshot the screen and send it with the step number. Also useful:

- **Vercel → Deployments → the latest** for build errors.
- **Supabase → Logs → API / Postgres / Auth** for database errors (filter by
  the time you ran the step).

Errors worth knowing about in advance:

| You see | Likely cause |
|---|---|
| Blank white page | Env vars missing or misnamed in Vercel (must start with `VITE_`), or added after deploying: **Redeploy**. |
| 404 when refreshing `/join` | `vercel.json` not deployed; check the deployed branch has it. |
| No **Sandbox** in the team switcher | The migration `20260926000001_sandbox_and_overview.sql` hasn't been run. |
| "This invite link has expired…" on a fresh link | A migration didn't run or failed partway; check the SQL editor history. |
| Signup fails with the example.com address | Use a `yourname+smoke@gmail.com` address (see top). |
| `permission denied for table …` | The project doesn't grant table access to the API by default. Send me the table name. |
| Revoke fails with `permission denied for table users` | Your project restricts deleting auth users from database functions. Send me the message. |
