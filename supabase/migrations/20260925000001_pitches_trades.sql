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
