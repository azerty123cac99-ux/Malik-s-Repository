-- =============================================================================
-- ALL MIGRATIONS, combined for a FRESH Supabase project. Generated file:
-- do not edit; run `npm run db:combine` to rebuild it.
--
-- Paste the whole file into Supabase → SQL Editor → Run, once.
-- It runs as one transaction: if anything fails, nothing is kept, so you can
-- fix the problem and run it again on the same (still empty) project.
--
-- Do NOT run it on a database that already has these tables; after this first
-- setup, apply only new migration files, one at a time.
--
-- Includes, in order:
--   20260924000001_auth_teams_roles.sql
--   20260925000001_pitches_trades.sql
--   20260925000002_sell_link_and_cash.sql
--   20260925000003_client_profile.sql
--   20260925000004_pipeline.sql
--   20260925000005_deadlines.sql
--   20260926000001_sandbox_and_overview.sql
--   20260927000001_trade_request_id.sql
-- =============================================================================

begin;

-- ▼▼▼ 20260924000001_auth_teams_roles.sql ▼▼▼

-- =============================================================================
-- Step 1: teams, roles, signup by personal invite link
--
-- Who is who:
--   member    : belongs to one team
--   leader    : belongs to one team, manages it
--   advisor   : belongs to no team, reads everything, edits nothing
--   president : a leader with is_president = true (sees cross-team counts only)
--
-- How joining works:
--   1. A leader adds an email to roster_invites. A secret token is generated.
--   2. The leader copies https://<app>/join?token=... and texts it.
--   3. The student opens it, sees their email, sets a password.
--   4. The signup trigger checks the token and claims it, all in one transaction.
-- =============================================================================

create type public.app_role as enum ('member', 'leader', 'advisor');

create schema private;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.teams (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  starting_capital numeric(14, 2) not null default 100000 check (starting_capital > 0),
  created_at       timestamptz not null default now()
);

-- Who is allowed to join. Leaders can see status (pending / claimed / expired)
-- but never the token itself, which lives in private.invite_tokens below.
create table public.roster_invites (
  email        text primary key check (email = lower(email) and email like '%_@_%'),
  team_id      uuid references public.teams (id) on delete cascade,
  role         public.app_role not null default 'member',
  is_president boolean not null default false,
  invited_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  claimed_at   timestamptz,
  -- advisors have no team; everyone else must have one
  constraint invite_team_matches_role check ((role = 'advisor') = (team_id is null)),
  constraint invite_president_is_leader check (not is_president or role = 'leader')
);

-- The secret part of each invite. The "private" schema is not exposed through
-- the API, so no table query can ever return a token. The only ways out are
-- the invite_token() and regenerate_invite() functions, which check who's asking.
create table private.invite_tokens (
  email text primary key references public.roster_invites (email) on delete cascade,
  token text not null unique check (length(token) >= 32)
);

-- One row per signed-up user, created automatically from their invite.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique check (email = lower(email)),
  full_name    text not null check (length(trim(full_name)) > 0),
  team_id      uuid references public.teams (id),
  role         public.app_role not null,
  is_president boolean not null default false,
  -- Removing someone from the roster deactivates them instead of deleting them,
  -- so the pitches and trades they authored keep their name for the report.
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint profile_team_matches_role check ((role = 'advisor') = (team_id is null)),
  constraint profile_president_is_leader check (not is_president or role = 'leader')
);

create index profiles_team_id_idx on public.profiles (team_id);

-- Audit log for "Revoke & reissue" (someone else claimed a student's link).
-- No foreign key on revoked_user_id: that auth user no longer exists.
create table public.invite_revocations (
  id              bigint generated always as identity primary key,
  email           text not null,
  team_id         uuid references public.teams (id) on delete cascade,
  revoked_user_id uuid not null,
  revoked_by      uuid references public.profiles (id) on delete set null,
  revoked_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Helper functions used by the RLS policies.
--
-- SECURITY DEFINER lets them read profiles without triggering profiles' own
-- RLS (which calls these functions: that would loop forever). Every definer
-- function in this file sets search_path = '' and writes schema names in full,
-- so nobody can trick it into running a look-alike function they created.
-- Each helper only answers a question about the *current* user.
-- -----------------------------------------------------------------------------

create function private.my_team_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select team_id from public.profiles
  where id = (select auth.uid()) and active
$$;

create function private.is_leader_of(p_team uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
      and role = 'leader' and team_id = p_team
  )
$$;

create function private.is_advisor() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role = 'advisor'
  )
$$;

create function private.is_president() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and is_president
  )
$$;

create function private.is_active_user() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and active
  )
$$;

-- The key rule for all team content (pitches, trades, ...) in later steps:
-- you can read a team's rows if it is your team, or if you are the advisor.
-- The president is deliberately NOT included.
create function private.can_read_team(p_team uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_team = private.my_team_id() or private.is_advisor()
$$;

-- Who may create, delete, copy or regenerate a given invite:
--   leaders: member invites for their own team
--   president and advisor: member or leader invites for any team
-- Advisor and president invites are only ever created by hand in SQL.
create function private.can_manage_invite(p_team uuid, p_role public.app_role, p_is_president boolean)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not p_is_president and (
    (p_role = 'member' and private.is_leader_of(p_team))
    or (p_role in ('member', 'leader') and (private.is_president() or private.is_advisor()))
  )
$$;

create function private.new_token() returns text
language sql volatile set search_path = ''
as $$
  -- 32 random bytes from a cryptographic source = 64 hex characters
  select encode(extensions.gen_random_bytes(32), 'hex')
$$;

-- -----------------------------------------------------------------------------
-- Invite housekeeping triggers
-- -----------------------------------------------------------------------------

-- Store emails lowercased and trimmed, whatever the user typed, and record
-- who really created the invite (the app can't claim it was someone else).
create function private.normalize_invite() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  new.invited_by := auth.uid();
  return new;
end;
$$;

create trigger normalize_invite
  before insert on public.roster_invites
  for each row execute function private.normalize_invite();

-- Every new invite gets a token automatically.
create function private.create_invite_token() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.invite_tokens (email, token) values (new.email, private.new_token());
  return new;
end;
$$;

create trigger create_token
  after insert on public.roster_invites
  for each row execute function private.create_invite_token();

-- -----------------------------------------------------------------------------
-- Signup, enforced in the database.
--
-- The /join page calls signUp with the token in the user metadata. This
-- trigger runs inside the same transaction that creates the auth user: if the
-- token is missing, wrong, expired, already claimed or for a different email,
-- it raises an error, everything is rolled back, and no account exists.
-- -----------------------------------------------------------------------------

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text := new.raw_user_meta_data ->> 'invite_token';
  inv     public.roster_invites;
begin
  if v_token is null or v_token = '' then
    raise exception 'INVITE_REQUIRED: signup needs an invite link' using errcode = 'P0001';
  end if;

  -- "for update" locks the invite row, so two signups racing with the same
  -- token cannot both succeed.
  select i.* into inv
  from private.invite_tokens t
  join public.roster_invites i on i.email = t.email
  where t.token = v_token
  for update of i;

  if not found then
    raise exception 'INVITE_INVALID: invite link is not valid' using errcode = 'P0001';
  end if;
  if inv.email <> lower(new.email) then
    raise exception 'INVITE_INVALID: invite link is for a different email' using errcode = 'P0001';
  end if;
  if inv.claimed_at is not null then
    raise exception 'INVITE_USED: invite link has already been used' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    raise exception 'INVITE_EXPIRED: invite link has expired' using errcode = 'P0001';
  end if;

  update public.roster_invites set claimed_at = now() where email = inv.email;

  insert into public.profiles (id, email, full_name, team_id, role, is_president)
  values (
    new.id,
    inv.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(inv.email, '@', 1)),
    inv.team_id,
    inv.role,
    inv.is_president
  );

  -- Don't keep the (now useless) token in the user's stored metadata.
  -- (strip_invite_token below removes it again if Supabase Auth writes it back.)
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'invite_token'
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Right after signup, Supabase Auth re-saves the user's metadata from its own
-- in-memory copy, which still contains the token. This strips it on every
-- update so it never stays in the database.
create function private.strip_invite_token() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.raw_user_meta_data := new.raw_user_meta_data - 'invite_token';
  return new;
end;
$$;

create trigger strip_invite_token
  before update on auth.users
  for each row
  when (new.raw_user_meta_data ? 'invite_token')
  execute function private.strip_invite_token();

-- -----------------------------------------------------------------------------
-- Invite functions the app calls
-- -----------------------------------------------------------------------------

-- /join page: who is this link for? Callable while logged out. Returns nothing
-- for a bad, expired or used token. A 64-hex-character token cannot be guessed.
create function public.lookup_invite(p_token text)
returns table (email text, team_name text)
language sql stable security definer set search_path = ''
as $$
  select i.email, coalesce(tm.name, 'Faculty advisor')
  from private.invite_tokens t
  join public.roster_invites i on i.email = t.email
  left join public.teams tm on tm.id = i.team_id
  where t.token = p_token
    and i.claimed_at is null
    and i.expires_at > now()
$$;

-- "Copy invite link": returns the token for an invite you manage.
-- The app turns it into https://<app>/join?token=...
create function public.invite_token(p_email text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  inv public.roster_invites;
  v_token text;
begin
  select * into inv from public.roster_invites where email = lower(trim(p_email));
  if not found or not private.can_manage_invite(inv.team_id, inv.role, inv.is_president) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if inv.claimed_at is not null then
    raise exception 'This invite has already been used' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invite has expired; regenerate it' using errcode = 'P0001';
  end if;
  select token into v_token from private.invite_tokens where email = inv.email;
  return v_token;
end;
$$;

-- "Regenerate link": replaces the token (the old link stops working) and
-- restarts the 7-day clock. Returns the new token.
create function public.regenerate_invite(p_email text) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  inv public.roster_invites;
  v_token text := private.new_token();
begin
  select * into inv from public.roster_invites where email = lower(trim(p_email)) for update;
  if not found or not private.can_manage_invite(inv.team_id, inv.role, inv.is_president) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if inv.claimed_at is not null then
    raise exception 'This invite has already been used' using errcode = 'P0001';
  end if;

  update private.invite_tokens set token = v_token where email = inv.email;
  update public.roster_invites set expires_at = now() + interval '7 days' where email = inv.email;
  return v_token;
end;
$$;

-- For the seed script only: every unclaimed token. Callable with the service
-- role key and nothing else (that key already bypasses all rules anyway).
create function public.admin_invite_tokens()
returns table (email text, token text)
language sql stable security definer set search_path = ''
as $$
  select t.email, t.token
  from private.invite_tokens t
  join public.roster_invites i on i.email = t.email
  where i.claimed_at is null
$$;

-- "Revoke & reissue": the wrong person claimed a student's link.
--   1. deletes the account that claimed it (it has the student's email but
--      someone else's password). Their profile goes with it; content they
--      authored stays, with the author set to null ("Removed user").
--   2. resets the invite to unclaimed with a new token and a fresh 7 days.
--   3. records who did it and when in invite_revocations.
-- Returns the new token. All three happen together or not at all.
create function public.revoke_and_reissue(p_email text) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  inv     public.roster_invites;
  prof    public.profiles;
  v_role  public.app_role;
  v_token text := private.new_token();
begin
  select * into inv from public.roster_invites where email = lower(trim(p_email)) for update;
  if not found then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into prof from public.profiles where email = inv.email;

  -- If the account was promoted since the invite, treat it as a leader:
  -- only the president or advisor may revoke a leader.
  v_role := case when inv.role = 'leader' or prof.role = 'leader' then 'leader' else inv.role end;
  if not private.can_manage_invite(inv.team_id, v_role, inv.is_president or coalesce(prof.is_president, false)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if inv.claimed_at is null or prof.id is null then
    raise exception 'This invite has not been claimed; use Regenerate instead' using errcode = 'P0001';
  end if;
  if prof.id = auth.uid() then
    raise exception 'You cannot revoke your own account' using errcode = '42501';
  end if;

  insert into public.invite_revocations (email, team_id, revoked_user_id, revoked_by)
  values (inv.email, inv.team_id, prof.id, auth.uid());

  -- Deleting the auth user also deletes their sessions and refresh tokens,
  -- so they are signed out everywhere. Their profile is removed by cascade.
  delete from auth.users where id = prof.id;

  update private.invite_tokens set token = v_token where email = inv.email;
  update public.roster_invites
  set claimed_at = null, expires_at = now() + interval '7 days'
  where email = inv.email;

  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Roster actions that change roles or access. These go through functions
-- rather than direct UPDATEs so each rule is checked explicitly in one place.
-- -----------------------------------------------------------------------------

-- Promote a member to leader, or demote a leader to member.
-- Only the president and the advisor can do this.
create function public.set_member_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  target public.profiles;
begin
  if not (private.is_president() or private.is_advisor()) then
    raise exception 'Only the president or the advisor can change roles' using errcode = '42501';
  end if;
  if p_role not in ('member', 'leader') then
    raise exception 'Role must be member or leader' using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = p_user;
  if not found or target.role = 'advisor' or target.is_president then
    raise exception 'That user''s role cannot be changed here' using errcode = '42501';
  end if;

  update public.profiles set role = p_role where id = p_user;
end;
$$;

-- Deactivate (remove from roster) or reactivate a member.
-- Leaders can do this for members of their own team; president and advisor
-- can do it for anyone except themselves and each other.
create function public.set_member_active(p_user uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  target public.profiles;
begin
  select * into target from public.profiles where id = p_user;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if p_user = auth.uid() or target.role = 'advisor' or target.is_president then
    raise exception 'That user cannot be deactivated here' using errcode = '42501';
  end if;
  if not (
    (target.role = 'member' and private.is_leader_of(target.team_id))
    or private.is_president()
    or private.is_advisor()
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.profiles set active = p_active where id = p_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges.
--
-- Postgres lets everyone (PUBLIC) run new functions by default, and Supabase
-- grants every table to the logged-out `anon` role. We undo both, then grant
-- back exactly what each role needs.
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

revoke execute on function
  public.lookup_invite(text),
  public.invite_token(text),
  public.regenerate_invite(text),
  public.admin_invite_tokens(),
  public.revoke_and_reissue(text),
  public.set_member_role(uuid, public.app_role),
  public.set_member_active(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.lookup_invite(text) to anon, authenticated;
grant execute on function
  public.invite_token(text),
  public.regenerate_invite(text),
  public.revoke_and_reissue(text),
  public.set_member_role(uuid, public.app_role),
  public.set_member_active(uuid, boolean)
to authenticated;
grant execute on function public.admin_invite_tokens() to service_role;

revoke all on public.teams, public.roster_invites, public.profiles, public.invite_revocations from anon;
-- The revocation log is written only by revoke_and_reissue().
revoke insert, update, delete on public.invite_revocations from authenticated;

-- RLS decides *which rows* you can touch but not *which columns*,
-- so UPDATE is limited to specific columns here.
revoke update on public.teams from authenticated;
grant update (starting_capital) on public.teams to authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

revoke update on public.roster_invites from authenticated;

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.roster_invites enable row level security;
alter table public.profiles enable row level security;
alter table public.invite_revocations enable row level security;
alter table private.invite_tokens enable row level security; -- no policies: nobody reads it directly

-- teams: names and starting capital are not secret; any active user can read.
create policy "teams: active users read"
  on public.teams for select to authenticated
  using (private.is_active_user());

create policy "teams: leaders update own team"
  on public.teams for update to authenticated
  using (private.is_leader_of(id))
  with check (private.is_leader_of(id));

-- profiles: you see yourself and your teammates. The advisor and president
-- also see every roster (names/roles only) so they can promote leaders.
-- This is roster data, not research: pitches and trades stay team-private.
-- There is deliberately no INSERT or DELETE policy: profiles are created only
-- by the signup trigger, and "removing" someone means deactivating them.
create policy "profiles: read self, team, or all if advisor/president"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or team_id = private.my_team_id()
    or private.is_advisor()
    or private.is_president()
  );

-- Only full_name is updatable (see column grant above), and only your own.
create policy "profiles: update own name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and private.is_active_user())
  with check (id = (select auth.uid()));

-- roster_invites: see, add and remove the invites you manage.
create policy "invites: read"
  on public.roster_invites for select to authenticated
  using (
    private.is_leader_of(team_id)
    or private.is_advisor()
    or private.is_president()
  );

create policy "invites: add"
  on public.roster_invites for insert to authenticated
  with check (
    claimed_at is null
    and expires_at <= now() + interval '7 days'
    and private.can_manage_invite(team_id, role, is_president)
  );

-- Only unclaimed invites can be deleted. A claimed invite is what
-- Revoke & reissue works from, so it stays.
create policy "invites: remove"
  on public.roster_invites for delete to authenticated
  using (claimed_at is null and private.can_manage_invite(team_id, role, is_president));

-- invite_revocations: the same people who can see a team's invites.
create policy "revocations: read"
  on public.invite_revocations for select to authenticated
  using (
    private.is_leader_of(team_id)
    or private.is_advisor()
    or private.is_president()
  );

-- ▲▲▲ end of 20260924000001_auth_teams_roles.sql ▲▲▲

-- ▼▼▼ 20260925000001_pitches_trades.sql ▼▼▼

-- =============================================================================
-- Step 2: pitches (minimal, so trades can link to them) and the trade log.
--
-- Rules that matter:
--   * A trade can't be saved without a rationale (checked by the database).
--   * Trades are never edited or deleted. A mistake is "voided" with a
--     required reason; the voided row stays visible for the record.
--   * A trade can only link to an APPROVED pitch of the same team.
--   * A pitch's stored stage is only a human decision (idea / pitched /
--     approved / rejected). Bought / Sold are computed from its trades, so
--     voiding a trade changes the displayed stage automatically.
--   * Authors are stored with ON DELETE SET NULL: if an account is revoked,
--     its pitches and trades stay, and the app shows "Removed user".
-- =============================================================================

create type public.pitch_stage as enum ('idea', 'pitched', 'approved', 'rejected');
create type public.asset_type as enum ('stock', 'etf', 'bond', 'fund', 'other');
create type public.trade_side as enum ('buy', 'sell');

-- Tickers: letters, digits, dot or dash, stored uppercase (e.g. AAPL, BRK.B).
create domain public.ticker as text
  check (value = upper(value) and value ~ '^[A-Z0-9][A-Z0-9.\-]{0,11}$');

-- -----------------------------------------------------------------------------
-- Pitches
-- -----------------------------------------------------------------------------

create table public.pitches (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  ticker       public.ticker not null,
  asset_type   public.asset_type not null default 'stock',
  thesis       text not null check (length(trim(thesis)) > 0),
  objective_id uuid, -- links to a client objective; foreign key added with the client profile
  key_risk     text not null default '',
  exit_trigger text not null default '',
  sources      text not null default '',
  stage        public.pitch_stage not null default 'idea',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  decided_by   uuid references public.profiles (id) on delete set null,
  decided_at   timestamptz
);

create index pitches_team_idx on public.pitches (team_id);

-- -----------------------------------------------------------------------------
-- Trades
-- -----------------------------------------------------------------------------

create table public.trades (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  trade_date  date not null default current_date,
  ticker      public.ticker not null,
  side        public.trade_side not null,
  quantity    numeric(18, 6) not null check (quantity > 0),
  price       numeric(18, 4) not null check (price > 0),
  pitch_id    uuid references public.pitches (id) on delete restrict,
  rationale   text not null check (length(trim(rationale)) > 0),
  placed_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   uuid references public.profiles (id) on delete set null,
  void_reason text,
  -- Either not voided (no reason), or voided with a real reason.
  constraint void_needs_reason check (
    (voided_at is null and void_reason is null)
    or (voided_at is not null and length(trim(void_reason)) > 0)
  )
);

create index trades_team_idx on public.trades (team_id, trade_date);
create index trades_pitch_idx on public.trades (pitch_id);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- New pitch: the author is whoever is signed in; timestamps are the server's.
create function private.pitch_before_insert() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  new.decided_by := null;
  new.decided_at := null;
  return new;
end;
$$;

create trigger pitch_before_insert
  before insert on public.pitches
  for each row execute function private.pitch_before_insert();

-- Pitch edits: only leaders approve or reject; nobody moves a pitch to
-- another team; an approved pitch with live trades stays approved.
create function private.pitch_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- (created_by may become null: that's ON DELETE SET NULL when the author's
  -- account is revoked.)
  if new.team_id <> old.team_id or new.created_at <> old.created_at
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then
    raise exception 'team, author and creation time cannot change' using errcode = '42501';
  end if;

  if new.ticker <> old.ticker and exists (
    select 1 from public.trades where pitch_id = old.id and voided_at is null
  ) then
    raise exception 'This pitch has trades; its ticker cannot change' using errcode = 'P0001';
  end if;

  if new.stage <> old.stage then
    if (new.stage in ('approved', 'rejected') or old.stage in ('approved', 'rejected'))
       and not private.is_leader_of(old.team_id) then
      raise exception 'Only a team leader can approve or reject a pitch' using errcode = '42501';
    end if;
    if old.stage = 'approved' and exists (
      select 1 from public.trades where pitch_id = old.id and voided_at is null
    ) then
      raise exception 'This pitch has trades; void them before changing its stage' using errcode = 'P0001';
    end if;
    if new.stage in ('approved', 'rejected') then
      new.decided_by := auth.uid();
      new.decided_at := now();
    else
      new.decided_by := null;
      new.decided_at := null;
    end if;
  else
    -- Keep the recorded decision, except let decided_by become null when the
    -- decider's account is revoked (ON DELETE SET NULL).
    new.decided_by := case when new.decided_by is null then null else old.decided_by end;
    new.decided_at := old.decided_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger pitch_before_update
  before update on public.pitches
  for each row execute function private.pitch_before_update();

-- New trade: the placer is whoever is signed in, it starts un-voided, and a
-- linked pitch must be an approved pitch of the same team.
create function private.trade_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.pitches;
begin
  new.placed_by := auth.uid();
  new.created_at := now();
  new.voided_at := null;
  new.voided_by := null;
  new.void_reason := null;
  new.ticker := upper(trim(new.ticker));

  if new.pitch_id is not null then
    select * into p from public.pitches where id = new.pitch_id;
    if not found or p.team_id <> new.team_id then
      raise exception 'Linked pitch not found on this team' using errcode = 'P0001';
    end if;
    if p.stage <> 'approved' then
      raise exception 'Trades can only link to an approved pitch' using errcode = 'P0001';
    end if;
    if p.ticker <> new.ticker then
      raise exception 'Trade ticker (%) does not match the pitch (%)', new.ticker, p.ticker using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trade_before_insert
  before insert on public.trades
  for each row execute function private.trade_before_insert();

-- -----------------------------------------------------------------------------
-- Voiding a trade: the only change a trade can ever receive.
-- The author or a leader of the team can void; nobody can un-void.
-- -----------------------------------------------------------------------------

create function public.void_trade(p_trade uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.trades;
begin
  select * into t from public.trades where id = p_trade for update;
  if not found or not private.can_read_team(t.team_id) then
    raise exception 'Trade not found' using errcode = 'P0002';
  end if;
  if not (
    (t.placed_by = auth.uid() and t.team_id = private.my_team_id())
    or private.is_leader_of(t.team_id)
  ) then
    raise exception 'Only the person who logged this trade or a team leader can void it' using errcode = '42501';
  end if;
  if t.voided_at is not null then
    raise exception 'This trade is already voided' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to void a trade' using errcode = '22023';
  end if;

  update public.trades
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_trade;
end;
$$;

-- -----------------------------------------------------------------------------
-- Computed views. security_invoker = true makes each view run with the
-- permissions of whoever queries it, so the tables' RLS still applies:
-- a view can't be used to peek at another team.
-- -----------------------------------------------------------------------------

-- Current holdings per team and ticker, from non-voided trades only.
create view public.positions with (security_invoker = true) as
select
  team_id,
  ticker,
  sum(case side when 'buy' then quantity else -quantity end) as quantity,
  (array_agg(price order by trade_date desc, created_at desc))[1] as last_price,
  max(trade_date) as last_trade_date
from public.trades
where voided_at is null
group by team_id, ticker;

-- Pitches with the stage to display. Approved pitches become Bought or Sold
-- based on their non-voided trades.
create view public.pitch_board with (security_invoker = true) as
select
  p.*,
  coalesce(t.net_quantity, 0) as net_quantity,
  coalesce(t.trade_count, 0) as trade_count,
  case
    when p.stage <> 'approved' then p.stage::text
    when coalesce(t.trade_count, 0) = 0 then 'approved'
    when t.net_quantity > 0 then 'bought'
    else 'sold'
  end as display_stage
from public.pitches p
left join (
  select
    pitch_id,
    count(*) as trade_count,
    sum(case side when 'buy' then quantity else -quantity end) as net_quantity
  from public.trades
  where voided_at is null and pitch_id is not null
  group by pitch_id
) t on t.pitch_id = p.id;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

revoke all on public.pitches, public.trades, public.positions, public.pitch_board from anon;

-- Trades: insert and read only. No UPDATE or DELETE for anyone using the app;
-- void_trade() is the single way a trade row changes.
revoke update, delete on public.trades from authenticated;

-- Pitches: no deletes (Rejected is the end of the road). Editable columns only.
revoke delete on public.pitches from authenticated;
revoke update on public.pitches from authenticated;
grant update (ticker, asset_type, thesis, objective_id, key_risk, exit_trigger, sources, stage)
  on public.pitches to authenticated;

revoke execute on function public.void_trade(uuid, text) from public, anon;
grant execute on function public.void_trade(uuid, text) to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------

alter table public.pitches enable row level security;
alter table public.trades enable row level security;

-- Read: your team, or the advisor. The president is not included.
create policy "pitches: read team"
  on public.pitches for select to authenticated
  using (private.can_read_team(team_id));

-- Create: into your own team, as an idea or a pitch (not pre-approved).
create policy "pitches: create in own team"
  on public.pitches for insert to authenticated
  with check (team_id = private.my_team_id() and stage in ('idea', 'pitched'));

-- Edit: the author while it's still an idea/pitch, or any leader of the team.
-- (Who may approve/reject is checked again in pitch_before_update.)
create policy "pitches: author or leader edits"
  on public.pitches for update to authenticated
  using (
    team_id = private.my_team_id()
    and ((created_by = (select auth.uid()) and stage in ('idea', 'pitched')) or private.is_leader_of(team_id))
  )
  with check (team_id = private.my_team_id());

create policy "trades: read team"
  on public.trades for select to authenticated
  using (private.can_read_team(team_id));

-- Log: into your own team only. The advisor has no team, so can't log.
create policy "trades: log in own team"
  on public.trades for insert to authenticated
  with check (team_id = private.my_team_id());

-- ▲▲▲ end of 20260925000001_pitches_trades.sql ▲▲▲

-- ▼▼▼ 20260925000002_sell_link_and_cash.sql ▼▼▼

-- =============================================================================
-- 1. A sell must link to the pitch that holds the position.
--    If the team has a pitch currently showing Bought for that ticker, a sell
--    of that ticker has to link to it (or to one of them, if there are
--    several). This keeps Bought/Sold accurate.
-- 2. Cash and portfolio totals, so students can check against WInS.
--    Portfolio value = cash + every position at its last traded price, where
--    cash = starting capital − buys + sells (non-voided trades only).
-- =============================================================================

create or replace function private.trade_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.pitches;
  bought_ids uuid[];
  bought_count int;
begin
  new.placed_by := auth.uid();
  new.created_at := now();
  new.voided_at := null;
  new.voided_by := null;
  new.void_reason := null;
  new.ticker := upper(trim(new.ticker));

  if new.pitch_id is not null then
    select * into p from public.pitches where id = new.pitch_id;
    if not found or p.team_id <> new.team_id then
      raise exception 'Linked pitch not found on this team' using errcode = 'P0001';
    end if;
    if p.stage <> 'approved' then
      raise exception 'Trades can only link to an approved pitch' using errcode = 'P0001';
    end if;
    if p.ticker <> new.ticker then
      raise exception 'Trade ticker (%) does not match the pitch (%)', new.ticker, p.ticker using errcode = 'P0001';
    end if;
  end if;

  if new.side = 'sell' then
    -- Pitches of this team and ticker that currently hold shares ("Bought").
    select array_agg(pb.id), count(*) into bought_ids, bought_count
    from (
      select p2.id
      from public.pitches p2
      join public.trades t on t.pitch_id = p2.id and t.voided_at is null
      where p2.team_id = new.team_id and p2.ticker = new.ticker and p2.stage = 'approved'
      group by p2.id
      having sum(case t.side when 'buy' then t.quantity else -t.quantity end) > 0
    ) pb;

    if bought_count > 0 and (new.pitch_id is null or not new.pitch_id = any (bought_ids)) then
      raise exception 'SELL_NEEDS_PITCH: % is held under % Bought pitch(es). Link this sell to the pitch it closes.',
        new.ticker, bought_count
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

-- Positions now also carry their market value at the last traded price.
create or replace view public.positions with (security_invoker = true) as
select
  team_id,
  ticker,
  sum(case side when 'buy' then quantity else -quantity end) as quantity,
  (array_agg(price order by trade_date desc, created_at desc))[1] as last_price,
  max(trade_date) as last_trade_date,
  sum(case side when 'buy' then quantity else -quantity end)
    * (array_agg(price order by trade_date desc, created_at desc))[1] as market_value
from public.trades
where voided_at is null
group by team_id, ticker;

-- One row per team you can read: cash, holdings value and total value.
-- (The can_read_team filter matters: teams are readable by everyone, so
-- without it you'd see other teams' rows with their cash untouched.)
create view public.portfolio_totals with (security_invoker = true) as
select
  tm.id as team_id,
  tm.starting_capital,
  coalesce(tr.bought, 0) as total_bought,
  coalesce(tr.sold, 0) as total_sold,
  tm.starting_capital - coalesce(tr.bought, 0) + coalesce(tr.sold, 0) as cash,
  coalesce(pos.holdings_value, 0) as holdings_value,
  tm.starting_capital - coalesce(tr.bought, 0) + coalesce(tr.sold, 0) + coalesce(pos.holdings_value, 0) as total_value
from public.teams tm
left join (
  select
    team_id,
    sum(case when side = 'buy' then quantity * price else 0 end) as bought,
    sum(case when side = 'sell' then quantity * price else 0 end) as sold
  from public.trades
  where voided_at is null
  group by team_id
) tr on tr.team_id = tm.id
left join (
  select team_id, sum(market_value) as holdings_value from public.positions group by team_id
) pos on pos.team_id = tm.id
where private.can_read_team(tm.id);

revoke all on public.positions, public.portfolio_totals from anon;
grant select on public.positions, public.portfolio_totals to authenticated;

-- ▲▲▲ end of 20260925000002_sell_link_and_cash.sql ▲▲▲

-- ▼▼▼ 20260925000003_client_profile.sql ▼▼▼

-- =============================================================================
-- Client profile (one per team), its objectives, and allocation limits.
-- Everyone on the team reads it; only that team's leaders change it.
-- =============================================================================

create type public.risk_tolerance as enum ('low', 'medium', 'high');

create table public.client_profiles (
  team_id          uuid primary key references public.teams (id) on delete cascade,
  client_name      text not null default '',
  summary          text not null default '',
  risk_tolerance   public.risk_tolerance,
  time_horizon     text not null default '',
  liquidity_needs  text not null default '',
  constraints      text not null default '',
  max_position_pct numeric(5, 2) check (max_position_pct > 0 and max_position_pct <= 100),
  max_sector_pct   numeric(5, 2) check (max_sector_pct > 0 and max_sector_pct <= 100),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null
);

create table public.client_objectives (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index client_objectives_team_idx on public.client_objectives (team_id, sort_order);

-- Min/max share of the portfolio per asset class (uses the same list as
-- pitches' asset type: stock, etf, bond, fund, other).
create table public.asset_class_limits (
  team_id     uuid not null references public.teams (id) on delete cascade,
  asset_class public.asset_type not null,
  min_pct     numeric(5, 2) not null default 0 check (min_pct >= 0 and min_pct <= 100),
  max_pct     numeric(5, 2) not null default 100 check (max_pct >= 0 and max_pct <= 100),
  primary key (team_id, asset_class),
  constraint min_not_above_max check (min_pct <= max_pct)
);

-- Pitches now point at a real objective. An objective that pitches use can't
-- be deleted (edit its wording instead), so pitches never lose their "why".
alter table public.pitches
  add constraint pitches_objective_fk
  foreign key (objective_id) references public.client_objectives (id) on delete restrict;

-- A pitch's objective must belong to the pitch's own team.
create function private.check_pitch_objective() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.objective_id is not null and not exists (
    select 1 from public.client_objectives where id = new.objective_id and team_id = new.team_id
  ) then
    raise exception 'That objective is not in this team''s client profile' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_pitch_objective
  before insert or update of objective_id on public.pitches
  for each row execute function private.check_pitch_objective();

-- Record who last edited the profile.
create function private.client_profile_stamp() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger client_profile_stamp
  before insert or update on public.client_profiles
  for each row execute function private.client_profile_stamp();

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------

revoke all on public.client_profiles, public.client_objectives, public.asset_class_limits from anon;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

alter table public.client_profiles enable row level security;
alter table public.client_objectives enable row level security;
alter table public.asset_class_limits enable row level security;

create policy "client_profiles: read team" on public.client_profiles
  for select to authenticated using (private.can_read_team(team_id));
create policy "client_profiles: leaders insert" on public.client_profiles
  for insert to authenticated with check (private.is_leader_of(team_id));
create policy "client_profiles: leaders update" on public.client_profiles
  for update to authenticated using (private.is_leader_of(team_id)) with check (private.is_leader_of(team_id));

create policy "objectives: read team" on public.client_objectives
  for select to authenticated using (private.can_read_team(team_id));
create policy "objectives: leaders insert" on public.client_objectives
  for insert to authenticated with check (private.is_leader_of(team_id));
create policy "objectives: leaders update" on public.client_objectives
  for update to authenticated using (private.is_leader_of(team_id)) with check (private.is_leader_of(team_id));
create policy "objectives: leaders delete" on public.client_objectives
  for delete to authenticated using (private.is_leader_of(team_id));

create policy "limits: read team" on public.asset_class_limits
  for select to authenticated using (private.can_read_team(team_id));
create policy "limits: leaders insert" on public.asset_class_limits
  for insert to authenticated with check (private.is_leader_of(team_id));
create policy "limits: leaders update" on public.asset_class_limits
  for update to authenticated using (private.is_leader_of(team_id)) with check (private.is_leader_of(team_id));
create policy "limits: leaders delete" on public.asset_class_limits
  for delete to authenticated using (private.is_leader_of(team_id));

-- ▲▲▲ end of 20260925000003_client_profile.sql ▲▲▲

-- ▼▼▼ 20260925000004_pipeline.sql ▼▼▼

-- =============================================================================
-- Pipeline: comments, votes, and what a pitch needs before it is "Pitched".
-- =============================================================================

-- An idea can be rough. A pitch (and so anything a leader approves) must say
-- which client objective it serves, its key risk, and what would make us sell.
create function private.check_pitch_complete() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.stage = 'pitched' and (
    new.objective_id is null
    or length(trim(new.key_risk)) = 0
    or length(trim(new.exit_trigger)) = 0
  ) then
    raise exception 'PITCH_INCOMPLETE: a pitch needs a client objective, a key risk and an exit trigger'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_pitch_complete
  before insert or update on public.pitches
  for each row execute function private.check_pitch_complete();

-- -----------------------------------------------------------------------------
-- Comments: anyone on the team; never edited or deleted (like a meeting record).
-- -----------------------------------------------------------------------------

create table public.pitch_comments (
  id         uuid primary key default gen_random_uuid(),
  pitch_id   uuid not null references public.pitches (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index pitch_comments_pitch_idx on public.pitch_comments (pitch_id, created_at);
create index pitch_comments_team_idx on public.pitch_comments (team_id, created_at);

-- Team and author come from the server, not the app.
create function private.comment_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select team_id into new.team_id from public.pitches where id = new.pitch_id;
  new.author_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create trigger comment_before_insert
  before insert on public.pitch_comments
  for each row execute function private.comment_before_insert();

-- -----------------------------------------------------------------------------
-- Votes: one per person per pitch, up (+1) or down (−1). Change or remove your own.
-- -----------------------------------------------------------------------------

create table public.pitch_votes (
  pitch_id   uuid not null references public.pitches (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pitch_id, user_id)
);

create index pitch_votes_team_idx on public.pitch_votes (team_id, updated_at);

-- The only way to vote: cast_vote(pitch, 1 | -1), or null to remove your vote.
-- Only members of the pitch's team can vote (not the advisor).
create function public.cast_vote(p_pitch uuid, p_value smallint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.pitches where id = p_pitch;
  if v_team is null or v_team is distinct from private.my_team_id() then
    raise exception 'You can only vote on your own team''s pitches' using errcode = '42501';
  end if;
  if p_value is null then
    delete from public.pitch_votes where pitch_id = p_pitch and user_id = auth.uid();
  elsif p_value in (-1, 1) then
    insert into public.pitch_votes (pitch_id, user_id, team_id, value)
    values (p_pitch, auth.uid(), v_team, p_value)
    on conflict (pitch_id, user_id) do update set value = excluded.value, updated_at = now();
  else
    raise exception 'A vote is +1 or -1' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- pitch_board gains vote and comment counts, and the viewer's own vote.
-- -----------------------------------------------------------------------------

create or replace view public.pitch_board with (security_invoker = true) as
select
  p.*,
  coalesce(t.net_quantity, 0) as net_quantity,
  coalesce(t.trade_count, 0) as trade_count,
  case
    when p.stage <> 'approved' then p.stage::text
    when coalesce(t.trade_count, 0) = 0 then 'approved'
    when t.net_quantity > 0 then 'bought'
    else 'sold'
  end as display_stage,
  coalesce(v.up_votes, 0) as up_votes,
  coalesce(v.down_votes, 0) as down_votes,
  coalesce(c.comment_count, 0) as comment_count,
  (select value from public.pitch_votes mv where mv.pitch_id = p.id and mv.user_id = (select auth.uid())) as my_vote
from public.pitches p
left join (
  select
    pitch_id,
    count(*) as trade_count,
    sum(case side when 'buy' then quantity else -quantity end) as net_quantity
  from public.trades
  where voided_at is null and pitch_id is not null
  group by pitch_id
) t on t.pitch_id = p.id
left join (
  select pitch_id, count(*) filter (where value = 1) as up_votes, count(*) filter (where value = -1) as down_votes
  from public.pitch_votes
  group by pitch_id
) v on v.pitch_id = p.id
left join (
  select pitch_id, count(*) as comment_count from public.pitch_comments group by pitch_id
) c on c.pitch_id = p.id;

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------

revoke all on public.pitch_comments, public.pitch_votes from anon;
revoke update, delete on public.pitch_comments from authenticated;
revoke insert, update, delete on public.pitch_votes from authenticated;
revoke execute on function public.cast_vote(uuid, smallint) from public, anon;
grant execute on function public.cast_vote(uuid, smallint) to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

alter table public.pitch_comments enable row level security;
alter table public.pitch_votes enable row level security;

create policy "comments: read team" on public.pitch_comments
  for select to authenticated using (private.can_read_team(team_id));
create policy "comments: write in own team" on public.pitch_comments
  for insert to authenticated with check (team_id = private.my_team_id());

create policy "votes: read team" on public.pitch_votes
  for select to authenticated using (private.can_read_team(team_id));
-- No insert/update/delete policies: votes change only through cast_vote().

-- ▲▲▲ end of 20260925000004_pipeline.sql ▲▲▲

-- ▼▼▼ 20260925000005_deadlines.sql ▼▼▼

-- =============================================================================
-- Deadlines.
--   Official deadlines (team_id is null) apply to every team.
--   Custom deadlines belong to one team; its leaders add and remove them.
--   "Submitted" is tracked per team in deadline_submissions, so Team A
--   ticking the IPS never marks it done for Team B.
-- =============================================================================

create table public.deadlines (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references public.teams (id) on delete cascade, -- null = official, all teams
  title      text not null check (length(trim(title)) > 0),
  due_at     timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index deadlines_team_idx on public.deadlines (team_id, due_at);

create table public.deadline_submissions (
  team_id      uuid not null references public.teams (id) on delete cascade,
  deadline_id  uuid not null references public.deadlines (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  submitted_by uuid references public.profiles (id) on delete set null,
  primary key (team_id, deadline_id)
);

-- The two competition deadlines. Due at 11:59 pm New York time; change here
-- (in a new migration) if Wharton announces a different cut-off time.
insert into public.deadlines (team_id, title, due_at) values
  (null, 'Investment Policy Statement (IPS)', '2026-11-06 23:59:00 America/New_York'),
  (null, 'Final report', '2026-12-04 23:59:00 America/New_York');

create function private.deadline_before_insert() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create trigger deadline_before_insert
  before insert on public.deadlines
  for each row execute function private.deadline_before_insert();

-- A submission can only be for an official deadline or the team's own one.
create function private.submission_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.deadlines d
    where d.id = new.deadline_id and (d.team_id is null or d.team_id = new.team_id)
  ) then
    raise exception 'That deadline does not apply to this team' using errcode = 'P0001';
  end if;
  new.submitted_by := auth.uid();
  new.submitted_at := now();
  return new;
end;
$$;

create trigger submission_before_insert
  before insert on public.deadline_submissions
  for each row execute function private.submission_before_insert();

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------

revoke all on public.deadlines, public.deadline_submissions from anon;
revoke update on public.deadlines, public.deadline_submissions from authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

alter table public.deadlines enable row level security;
alter table public.deadline_submissions enable row level security;

-- Official deadlines: every active user. Custom ones: that team (or advisor).
create policy "deadlines: read" on public.deadlines
  for select to authenticated
  using ((team_id is null and private.is_active_user()) or private.can_read_team(team_id));

-- Only leaders add or remove custom deadlines for their team. Official ones
-- (team_id null) can't be created or deleted from the app.
create policy "deadlines: leaders add custom" on public.deadlines
  for insert to authenticated with check (team_id is not null and private.is_leader_of(team_id));
create policy "deadlines: leaders remove custom" on public.deadlines
  for delete to authenticated using (team_id is not null and private.is_leader_of(team_id));

create policy "submissions: read team" on public.deadline_submissions
  for select to authenticated using (private.can_read_team(team_id));
create policy "submissions: leaders tick" on public.deadline_submissions
  for insert to authenticated with check (private.is_leader_of(team_id));
create policy "submissions: leaders untick" on public.deadline_submissions
  for delete to authenticated using (private.is_leader_of(team_id));

-- ▲▲▲ end of 20260925000005_deadlines.sql ▲▲▲

-- ▼▼▼ 20260926000001_sandbox_and_overview.sql ▼▼▼

-- =============================================================================
-- 1. A permanent "Sandbox" team for smoke tests after each deploy.
--    It works like a real team, but it is left out of the president overview
--    (activity counts, inactive members, deadline status) and can't tick
--    official competition deadlines. Only the president and the advisor
--    invite people into it (it has no leader).
-- 2. Team names are no longer visible to everyone: members and leaders see
--    only their own team; the president and advisor see all (for rosters).
-- 3. team_overview(): the counts-only data behind the president overview.
-- =============================================================================

alter table public.teams add column is_sandbox boolean not null default false;

-- At most one Sandbox team.
create unique index teams_one_sandbox on public.teams (is_sandbox) where is_sandbox;

insert into public.teams (name, starting_capital, is_sandbox)
values ('Sandbox', 100000, true);

create function private.is_sandbox(p_team uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_sandbox from public.teams where id = p_team), false)
$$;

-- Team names: your own team, or all of them if you are president/advisor.
drop policy "teams: active users read" on public.teams;
create policy "teams: read own, or all for president/advisor"
  on public.teams for select to authenticated
  using (private.can_read_team(id) or private.is_president());

-- Sandbox can't tick official competition deadlines.
create or replace function private.submission_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  d public.deadlines;
begin
  select * into d from public.deadlines where id = new.deadline_id;
  if not found or (d.team_id is not null and d.team_id <> new.team_id) then
    raise exception 'That deadline does not apply to this team' using errcode = 'P0001';
  end if;
  if d.team_id is null and private.is_sandbox(new.team_id) then
    raise exception 'The Sandbox team does not track competition deadlines' using errcode = 'P0001';
  end if;
  new.submitted_by := auth.uid();
  new.submitted_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- team_overview(): one row per real team, counts only. No research, pitch or
-- trade content ever leaves this function. President and advisor only.
--
-- "Active" = at least one pitch, comment, vote or trade in the last 7 days.
-- "At risk" = no activity for 5+ days (a warning before they turn inactive).
-- below_minimum = fewer than 4 active members (disqualification risk).
-- -----------------------------------------------------------------------------

create function public.team_overview()
returns table (
  team_id           uuid,
  team_name         text,
  members           int,
  active_members    int,
  at_risk_members   int,
  inactive_members  int,
  below_minimum     boolean,
  pitches_7d        int,
  comments_7d       int,
  votes_7d          int,
  trades_7d         int,
  deadlines         jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
-- The output columns (team_id, ...) share names with table columns; inside
-- the queries, a bare name means the table column.
#variable_conflict use_column
begin
  if not (private.is_president() or private.is_advisor()) then
    raise exception 'Only the president or the advisor can see the overview' using errcode = '42501';
  end if;

  return query
  -- Every activity row carries its own team_id, so team counts don't depend
  -- on the author still existing (revoked authors are null).
  with events as (
    select team_id, created_by as user_id, created_at as at, 'pitch' as kind from public.pitches
    union all select team_id, author_id, created_at, 'comment' from public.pitch_comments
    union all select team_id, user_id, updated_at, 'vote' from public.pitch_votes
    union all select team_id, placed_by, created_at, 'trade' from public.trades
  ),
  last_seen as (
    select p.id, p.team_id, max(e.at) as last_at
    from public.profiles p
    left join events e on e.user_id = p.id
    where p.active and p.role in ('member', 'leader')
    group by p.id, p.team_id
  ),
  per_team as (
    select
      ls.team_id,
      count(*)::int as members,
      count(*) filter (where ls.last_at >= now() - interval '7 days')::int as active_members,
      count(*) filter (where ls.last_at >= now() - interval '7 days' and ls.last_at < now() - interval '5 days')::int as at_risk_members,
      count(*) filter (where ls.last_at is null or ls.last_at < now() - interval '7 days')::int as inactive_members
    from last_seen ls
    group by ls.team_id
  ),
  recent as (
    select e.team_id, e.kind, count(*)::int as n
    from events e
    where e.at >= now() - interval '7 days'
    group by e.team_id, e.kind
  )
  select
    t.id,
    t.name,
    coalesce(pt.members, 0),
    coalesce(pt.active_members, 0),
    coalesce(pt.at_risk_members, 0),
    coalesce(pt.inactive_members, 0),
    coalesce(pt.active_members, 0) < 4,
    coalesce((select n from recent r where r.team_id = t.id and r.kind = 'pitch'), 0),
    coalesce((select n from recent r where r.team_id = t.id and r.kind = 'comment'), 0),
    coalesce((select n from recent r where r.team_id = t.id and r.kind = 'vote'), 0),
    coalesce((select n from recent r where r.team_id = t.id and r.kind = 'trade'), 0),
    coalesce((
      select jsonb_agg(jsonb_build_object('title', d.title, 'due_at', d.due_at, 'submitted_at', s.submitted_at) order by d.due_at)
      from public.deadlines d
      left join public.deadline_submissions s on s.deadline_id = d.id and s.team_id = t.id
      where d.team_id is null
    ), '[]'::jsonb)
  from public.teams t
  left join per_team pt on pt.team_id = t.id
  where not t.is_sandbox
  order by t.name;
end;
$$;

revoke execute on function public.team_overview() from public, anon;
grant execute on function public.team_overview() to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ▲▲▲ end of 20260926000001_sandbox_and_overview.sql ▲▲▲

-- ▼▼▼ 20260927000001_trade_request_id.sql ▼▼▼

-- =============================================================================
-- Duplicate-submit protection for trades.
--
-- The Log trade form creates a random ID when it opens and sends it with the
-- trade. If the same form is submitted twice (double tap, slow network, retry),
-- the second insert hits this unique constraint and no second trade is created.
-- The app treats that as "already saved".
--
-- Nullable so trades logged before this change stay valid; the app always
-- sends one from now on.
-- =============================================================================

alter table public.trades add column client_request_id uuid;

alter table public.trades
  add constraint trades_client_request_id_key unique (client_request_id);

-- ▲▲▲ end of 20260927000001_trade_request_id.sql ▲▲▲

commit;
