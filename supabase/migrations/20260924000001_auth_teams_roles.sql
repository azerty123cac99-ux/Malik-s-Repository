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
