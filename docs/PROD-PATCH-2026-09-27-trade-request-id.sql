-- =============================================================================
-- Production patch: duplicate-submit protection for trades.
-- Same change as supabase/migrations/20260927000001_trade_request_id.sql.
--
-- Paste into Supabase → SQL Editor → Run, ONCE, on the production project
-- that already has the first 7 migrations. Runs as one transaction: if it
-- fails, nothing changes.
--
-- Safe with existing data: existing trades get an empty request ID, which
-- the unique constraint allows.
-- =============================================================================

begin;

alter table public.trades add column client_request_id uuid;

alter table public.trades
  add constraint trades_client_request_id_key unique (client_request_id);

commit;

-- Check (run after): expect one row, client_request_id | uuid | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'trades' and column_name = 'client_request_id';
