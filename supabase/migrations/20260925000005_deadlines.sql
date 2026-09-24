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
