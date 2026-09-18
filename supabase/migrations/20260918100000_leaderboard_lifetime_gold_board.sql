-- Server-milestone Step 27 (leaderboard storage): the decisions Step 3
-- deliberately left open for this table — see architecture.md's "What Step 3
-- does not design" and its own Step 27 section for the full reasoning.
--
-- No table, index, RLS policy, or grant change here: public.leaderboard_entries
-- (20260908130000_create_platform_tables.sql), its ranking index
-- (leaderboard_entries_rank_idx), and its RLS/grant matrix
-- (leaderboard_entries_select_all plus the column-level grant that withholds
-- user_id) already implement everything the decisions below need. That is the
-- point of the "metric-agnostic" design Step 3 recorded: a season or period is
-- a board_key value, not a schema change. This migration pins the decisions in
-- the schema itself, as a durable, queryable record alongside the Memory Bank:
--
-- - Metric: lifetime gold earned — the sum of a save's totalGoldDelivered and
--   totalOfflineGoldClaimed counters (src/core/leaderboard/leaderboardMetric.ts),
--   both monotonic, so the sum can only rise across a save's lifetime. Current
--   spendable gold is deliberately not the metric: it falls every time a
--   player buys an upgrade, which would rank a patient spender below someone
--   who never invests.
-- - Reset period: none. One board, board_key = 'lifetime-gold', all-time.
-- - Tie-break: the earlier updated_at ranks first — whoever reached a given
--   score first. leaderboard_entries_rank_idx's trailing "updated_at asc"
--   already encodes this; Step 27 confirms it rather than changing it.
comment on table public.leaderboard_entries is
  'Server-milestone Step 27: one all-time board, board_key = lifetime-gold. Metric is lifetime gold earned (totalGoldDelivered + totalOfflineGoldClaimed from the save that produced the entry), never current spendable gold. Tie-break is updated_at ascending: first to reach the score ranks higher. See memory-bank/architecture.md''s Step 27 section.';

comment on column public.leaderboard_entries.board_key is
  'Season/period selector. Step 27 populates only the literal value lifetime-gold (all-time, no reset); a future season adds a new board_key value, never a schema change.';

comment on column public.leaderboard_entries.metric_exact is
  'Canonical GameNumber.serialize() of the lifetime-gold-earned metric. Never reformatted; always what the player is shown.';

comment on column public.leaderboard_entries.metric_log10 is
  'log10 of the same metric, derived from the GameNumber''s own mantissa and exponent so it stays exact past 1e308. Used only for ORDER BY; see architecture.md''s "How a GameNumber is stored".';

comment on column public.leaderboard_entries.source_revision is
  'The saves.revision the entry was derived from, so a write can refuse to move an entry backward — Step 28''s job, not enforced here.';
