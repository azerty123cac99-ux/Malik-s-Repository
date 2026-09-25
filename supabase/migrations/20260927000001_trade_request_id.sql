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
