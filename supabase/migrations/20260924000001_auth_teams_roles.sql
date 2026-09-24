-- =============================================================================
-- Step 1: teams, roles, invite-only signup
--
-- Who is who:
--   member    : belongs to one team
--   leader    : belongs to one team, manages it
--   advisor   : belongs to no team, reads everything, edits nothing
--   president : a leader with is_president = true (sees cross-team counts only)
-- =============================================================================

create type public.app_role as enum ('member', 'leader', 'advisor');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.teams (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  starting_capital numeric(14, 2) not null default 100000 check (starting_capital > 0),
  created_at       timestamptz not null default now()
);

-- The allow-list. Nobody can create an account unless their email is here.
create table public.roster_invites (
  email        text primary key check (email = lower(email) and email like '%@%'),
  team_id      uuid references public.teams (id) on delete cascade,
  role         public.app_role not null default 'member',
  is_president boolean not null default false,
  invited_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  -- advisors have no team; everyone else must have one
  constraint invite_team_matches_role check ((role = 'advisor') = (team_id is null)),
  constraint invite_president_is_leader check (not is_president or role = 'leader')
);

-- One row per signed-up user, created automatically from their invite.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
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

-- -----------------------------------------------------------------------------
-- Helper functions used by the RLS policies.
--
-- They live in a "private" schema that the public API does not expose, and are
-- SECURITY DEFINER so they can read profiles without triggering profiles' own
-- RLS policies (which would otherwise call these functions again, forever).
-- Each one only ever answers a question about the *current* user.
-- -----------------------------------------------------------------------------

create schema private;
grant usage on schema private to authenticated;

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

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Invite-only signup, enforced in the database.
--
-- This trigger runs inside the same transaction that creates the auth user.
-- If the email is not on roster_invites, it raises an error, the whole signup
-- is rolled back, and no account exists. The UI cannot bypass this.
-- -----------------------------------------------------------------------------

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.roster_invites;
begin
  select * into inv from public.roster_invites where email = lower(new.email);

  if not found then
    raise exception 'NOT_ON_ROSTER: % is not on any team roster', new.email
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, full_name, team_id, role, is_president)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    inv.team_id,
    inv.role,
    inv.is_president
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Privileges.
--
-- Supabase grants every table to the `anon` (logged-out) role by default.
-- We take that away entirely: nothing in this app is public.
-- For `authenticated`, UPDATE is limited to specific columns, because RLS
-- decides *which rows* you can touch but not *which columns*.
-- -----------------------------------------------------------------------------

revoke all on public.teams, public.roster_invites, public.profiles from anon;

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

-- roster_invites: leaders manage their own team's members;
-- president and advisor can also invite leaders to any team.
create policy "invites: leaders, president, advisor read"
  on public.roster_invites for select to authenticated
  using (
    private.is_leader_of(team_id)
    or private.is_advisor()
    or private.is_president()
  );

create policy "invites: add members or leaders"
  on public.roster_invites for insert to authenticated
  with check (
    not is_president
    and (
      (role = 'member' and private.is_leader_of(team_id))
      or (role in ('member', 'leader') and (private.is_president() or private.is_advisor()))
    )
  );

create policy "invites: remove"
  on public.roster_invites for delete to authenticated
  using (
    not is_president
    and (
      (role = 'member' and private.is_leader_of(team_id))
      or (role in ('member', 'leader') and (private.is_president() or private.is_advisor()))
    )
  );

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

revoke execute on function public.set_member_role(uuid, public.app_role) from public, anon;
revoke execute on function public.set_member_active(uuid, boolean) from public, anon;
grant execute on function public.set_member_role(uuid, public.app_role) to authenticated;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;
