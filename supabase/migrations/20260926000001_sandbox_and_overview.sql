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
