# Production smoke test (about 5 minutes, on your phone)

Run this once after deploying, and again after any migration. It checks the
real site end to end: joining, logging a trade, voiding it, positions, team
privacy, and Revoke & reissue. Then it cleans up after itself.

**You need:** your phone, your president account, and the Supabase SQL editor
open on a computer or tablet for the last step.

**Before you start, note two numbers** from the third team (Gabe's team,
"Team C" below) so you can compare later: sign in, go to **Trades**, and
if there's a Positions card write down **Cash**. If there are no trades yet,
Cash is simply the starting capital (e.g. $100,000).

The test user's email is `smoketest@example.com`. No email is ever sent to
it; it only has to be unique.

---

## 1. Invite a test user (1 min), as you

1. Sign in as yourself → **Roster** → team switcher → **Team C**.
2. **Invite someone** → email `smoketest@example.com`, role **Member** → **Create invite link**.
3. In the sheet, tap **Copy**. ✅ It says **Copied ✓**.
   (Or tap **Share…** and send it to yourself, which also proves sharing works.)

## 2. Join as the test user (1 min), in a private tab

1. Open a **private/incognito tab** (Safari: tabs button → Private).
   This keeps you signed in as yourself in the normal tab.
2. Paste the link and open it. ✅ It shows **Join Team C** with
   `smoketest@example.com` greyed out.
3. **Pull down to refresh** the page. ✅ It still shows the join form
   (this proves the Vercel rewrite works for direct links).
4. Name `Smoke Test`, password `smoke-test-2026` twice → **Create account**.
   ✅ You land on Home: **Hi, Smoke Test**, "Team C · Member".
5. ✅ Tabs are Home / Pipeline / Trades / Client. **No Roster tab.**

## 3. Log a trade (1 min), still in the private tab

1. **Trades** → **Log trade** → **Buy**, ticker `ZZTEST`, quantity `1`,
   price `1`.
2. ✅ The button says **Add a rationale to save** and is disabled.
3. Rationale: `Smoke test, will be voided` → **Save trade**.
4. ✅ The trade appears with "by Smoke Test · no pitch".
5. ✅ The **Positions** card shows a `ZZTEST` row worth $1.00, and **Cash** is
   exactly **$1.00 less** than the number you wrote down.

## 4. Void it (30 s)

1. On the trade → **Void this trade**. ✅ **Void trade** stays disabled until you type a reason.
2. Reason `Smoke test` → **Void trade**.
3. ✅ The trade is struck through, with "Voided by Smoke Test … Smoke test".
4. ✅ The `ZZTEST` row is gone from Positions and **Cash is back** to the
   number you wrote down. (If Team C had no other trades, the Positions card
   disappears entirely. That's correct too.)

## 5. Privacy check (30 s)

1. Still as Smoke Test: **Pipeline**, **Trades**, **Client** show only Team C's
   content. ✅ Nothing from your team or Samantha's team appears anywhere.

## 6. Revoke & reissue (1 min), back in your normal tab

1. **Roster** → **Team C** → find **Smoke Test** → **Revoke & reissue**.
2. ✅ The red button stays disabled until you type `Smoke Test`.
3. Type it → **Delete account and create new link**.
4. ✅ A new invite link sheet opens. Tap **Done**.
5. ✅ Smoke Test is gone from Members; **Revoked accounts** shows
   `smoketest@example.com · revoked … by Malik`.
6. Go back to the private tab and tap any tab.
   ✅ It shows **No access** (or the sign-in page).
7. In the private tab, try signing in as `smoketest@example.com` /
   `smoke-test-2026`. ✅ "Wrong email or password."
8. Still as yourself: **Trades → Team C** is not visible to you (you only see
   your own team's trades). That's expected: the president can't read other
   teams' trades.

## 7. Clean up (30 s), SQL editor

The app never deletes trades, so remove the test data by hand. In Supabase →
**SQL Editor** (role `postgres`), run:

```sql
delete from public.trades where ticker = 'ZZTEST';
delete from public.invite_revocations where email = 'smoketest@example.com';
delete from public.roster_invites where email = 'smoketest@example.com';
select count(*) as leftovers from public.trades where ticker = 'ZZTEST';  -- expect 0
```

✅ `leftovers = 0`. Close the private tab.

---

## If something fails

Screenshot the screen and send it with the step number. Also useful:

- **Vercel → Deployments → the latest → Runtime/Build logs** for build errors.
- **Supabase → Logs → API / Postgres / Auth** for database errors (filter by the time you ran the step).

Errors worth knowing about in advance:

| You see | Likely cause |
|---|---|
| Blank white page | Env vars missing or misnamed in Vercel (must start with `VITE_`), or you added them after deploying: **Redeploy**. |
| 404 when refreshing `/join` | `vercel.json` not deployed; check the deployed branch has it. |
| "This invite link has expired…" on a fresh link | A migration didn't run or failed partway; check the SQL editor history. |
| `permission denied for table …` | The project doesn't grant table access to the API by default. Send me the table name. |
| Revoke fails with `permission denied for table users` | Your project restricts the database role from deleting auth users. Send me the message. |
