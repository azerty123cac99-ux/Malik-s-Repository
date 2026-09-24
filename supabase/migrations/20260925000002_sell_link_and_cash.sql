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
