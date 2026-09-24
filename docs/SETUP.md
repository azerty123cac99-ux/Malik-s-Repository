# Setup checklist: Supabase + Vercel

Follow these in order. Everything here works from a browser; the optional
steps marked 💻 need a computer with Node installed.

Dashboard menus get renamed from time to time. If a label below doesn't match
exactly, look for the closest equivalent.

---

## 0. Before you start

- [ ] **Decide who owns the accounts.** Consider making Mr. Walsworth the owner
      (or at least a member) of both the Supabase and Vercel projects, so the
      club keeps access after you graduate. Both have free plans that are enough.
- [ ] Have a password manager ready. You'll create a database password you
      must not lose.

---

## 1. Create the Supabase project

- [ ] Go to <https://supabase.com> → sign in with GitHub → **New project**.
- [ ] Name: `trade-journal`. Region: the one closest to your school (e.g. East US).
- [ ] Database password: click **Generate**, save it in your password manager.
- [ ] Wait until the project finishes setting up (a minute or two).

> **Free plan note:** Supabase pauses free projects after about a week with no
> activity. During the competition that won't happen, but over a long break it
> might. Un-pausing is one click in the dashboard; no data is lost.

---

## 2. Create the database tables and rules (run the migrations)

Pick **one** option and stick to it for all future migrations.

### Option A: SQL editor (browser only)

- [ ] In the repo, open each file in `supabase/migrations/` **in filename order**
      and copy its full contents.
- [ ] Supabase dashboard → **SQL Editor** → **New query** → paste → **Run**.
- [ ] You should see "Success. No rows returned". Repeat for each file.
- [ ] Every time a new migration file is added later, run just that new file
      the same way. Never re-run an old one.

### Option B: Supabase CLI 💻 (recommended if you have a computer)

The CLI remembers which migrations have already run, so you can't
accidentally skip or repeat one.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # the ref is in the project URL
npx supabase db push                                  # runs every migration not yet applied
```

- [ ] **Do not run `supabase/seed.sql` in production.** It creates fake demo
      students. Step 6 below creates the real starting data.

---

## 3. Auth settings

Dashboard → **Authentication**.

- [ ] **Sign In / Providers → Email**: enabled.
- [ ] **Confirm email: OFF.** (Students join through invite links; there is no
      email step.)
- [ ] **Allow new users to sign up: ON.** This must stay on: the `/join` page
      creates accounts through normal signup. The database itself rejects
      anyone without a valid invite token, so this does not open the door.
- [ ] **Minimum password length: 8** (to match the app).
- [ ] Leave the other providers (Google, etc.) off for now.

---

## 4. Get the two values the app needs

Dashboard → **Project Settings → API** (may be called **API Keys** / **Data API**).

- [ ] Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
- [ ] Copy the **anon / public** key (or the **publishable** key, `sb_publishable_…`;
      either works).

> ⚠️ **Never** copy the `service_role` / secret key into Vercel or anywhere in
> the app. It bypasses every privacy rule. The anon key is safe to expose
> because RLS decides what it can see.

---

## 5. First deploy on Vercel

- [ ] Go to <https://vercel.com> → sign in with GitHub → **Add New… → Project**.
- [ ] Import `Malik-s-Repository`. If it isn't listed, click **Adjust GitHub
      App Permissions** and grant access to that repository.
- [ ] Framework preset: **Vite** (detected automatically). Leave build settings as they are.
- [ ] **If you connected the Supabase–Vercel integration**, it already sets
      `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which the
      app reads. Don't add the `VITE_` ones as well: if both exist, `VITE_`
      wins, so a stale `VITE_` value would override the correct one.
- [ ] **Otherwise**, open **Environment Variables** and add, for all environments:

      | Name                     | Value                     |
      |--------------------------|---------------------------|
      | `VITE_SUPABASE_URL`      | the Project URL from step 4 |
      | `VITE_SUPABASE_ANON_KEY` | the anon key from step 4  |

- [ ] Click **Deploy**. When it finishes you get a URL like
      `https://malik-s-repository.vercel.app`.
- [ ] **Production branch:** Vercel builds the repository's default branch.
      Right now the only branch is `claude/ipad-compatibility-8dgcxr`, so that's
      what deploys. When we later merge into `main`, change it under
      Vercel → Project → **Settings → Git → Production Branch**.
- [ ] Back in Supabase → **Authentication → URL Configuration** → set **Site URL**
      to your Vercel URL.

> If you add or change an environment variable later, go to **Deployments** and
> **Redeploy**; Vite bakes the values in at build time.

---

## 6. Create the real teams and your president account

Supabase → **SQL Editor** → new query. Edit the names and emails, then run:

```sql
-- Real team names (you can rename later)
insert into public.teams (name, starting_capital) values
  ('Team Malik', 100000),
  ('Team Samantha', 100000),
  ('Team Gabe', 100000);

-- You: leader of your team and president
insert into public.roster_invites (email, team_id, role, is_president)
select 'YOUR-PERSONAL-EMAIL@example.com', id, 'leader', true
from public.teams where name = 'Team Malik';

-- Mr. Walsworth: advisor (no team)
insert into public.roster_invites (email, team_id, role)
values ('ADVISOR-EMAIL@example.com', null, 'advisor');

-- Show both invite links' tokens
select email, token from private.invite_tokens;
```

- [ ] Open `https://<your-vercel-url>/join?token=<your token>` and create your account.
- [ ] Send Mr. Walsworth his link by text or DM.
- [ ] Invite Samantha and Gabe **as leaders** from the Roster screen in the app
      (only the president and advisor can do that). They then invite their own members.
- [ ] A **Sandbox** team was created automatically by the migrations; don't
      rename or delete it. It's for the smoke test.
- [ ] Run the smoke test: [docs/SMOKE-TEST.md](SMOKE-TEST.md). Repeat it after
      every future deploy or migration.

---

## 7. Confirm row-level security is on in production

Do all three. It takes five minutes.

- [ ] **Every table has RLS enabled.** SQL Editor → run:

  ```sql
  select c.relnamespace::regnamespace as schema, c.relname as table, c.relrowsecurity as rls_on
  from pg_class c
  where c.relkind = 'r' and c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
  order by 1, 2;
  ```

  Every row must say `rls_on = true`.

- [ ] **Security Advisor is clean.** Dashboard → **Advisors → Security Advisor**.
      There should be no errors (warnings about things we chose deliberately
      are OK; send them to me if unsure).

- [ ] **A logged-out visitor sees nothing.** In the SQL editor, switch the role
      selector (top right of the editor, shows `postgres`) to **anon**, then run:

  ```sql
  select * from public.profiles;
  ```

  You should get `permission denied`. Switch back to `postgres` afterwards.

  💻 Or from a computer:

  ```bash
  curl "https://<project-ref>.supabase.co/rest/v1/profiles?select=*" \
    -H "apikey: <anon key>"
  ```

  Expected: an error or `[]`, never a list of students.

> Don't run `npm run test:rls` against production: it creates and deletes
> test accounts. It is for the local database only.

---

## 8. Everyday admin

### A student forgot their password

There are no emails, so reset it by hand. SQL Editor (role: `postgres`):

```sql
update auth.users
set encrypted_password = extensions.crypt('TEMPORARY-PASSWORD', extensions.gen_salt('bf'))
where email = 'student@example.com';
```

Send them the temporary password privately. (A "change password" screen can
come later.)

### Someone else claimed a student's link

Roster screen → the student → **Revoke & reissue**. Send the new link.

### Where things are

| I want to…                         | Go to                                        |
|------------------------------------|----------------------------------------------|
| See or edit data by hand           | Supabase → Table Editor                      |
| Run SQL                            | Supabase → SQL Editor                        |
| See who has an account             | Supabase → Authentication → Users           |
| Redeploy / see build errors        | Vercel → Project → Deployments               |
| Change environment variables       | Vercel → Project → Settings → Environment Variables |
