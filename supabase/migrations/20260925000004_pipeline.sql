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
