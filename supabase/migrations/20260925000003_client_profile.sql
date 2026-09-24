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
