-- Cat Mine Idle server milestone — Step 5.
--
-- Lands the six tables Step 3 designed, byte-identically documented in
-- `memory-bank/architecture.md` and `memory-bank/techContext.md` under
-- "Complete Database Schema". This migration is that documented `create table`
-- block verbatim, plus the row-level-security policies that block enforces:
-- Step 3 wrote the RLS matrix as a design decision, and a table sitting with
-- RLS enabled and no policy already denies every non-service-role access, so
-- there is nothing later to retrofit for the "own row" cases — only later
-- steps' application logic (the Step 9 sign-up trigger, the Step 16 upload
-- function, and so on) is still to come.
--
-- Never edit this file after it merges: migrations are forward-only. A future
-- change to any table here is a new migration, and the two documentation
-- copies move in the same commit as that migration, per `AGENTS.md`.

-- Shared trigger: maintains updated_at on rows that carry it.
--
-- `set search_path = ''` pins name resolution inside the body. Without it an
-- unqualified `now()` resolves against whatever search_path the caller happens
-- to hold — the condition Supabase's database linter reports as
-- `function_search_path_mutable` — so every identifier here is schema-qualified
-- instead. This is the trigger every future `updated_at` column attaches to,
-- and migrations are forward-only, so it is pinned at creation.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles --
create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  display_name text            null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 24)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- saves --
create table public.saves (
  user_id                uuid        primary key references auth.users(id) on delete cascade,
  revision               bigint      not null,
  schema_version         integer     not null,
  document_json          text        not null,
  received_at            timestamptz not null default now(),
  previous_revision      bigint          null,
  previous_document_json text            null,
  previous_received_at   timestamptz     null,
  created_at             timestamptz not null default now(),
  constraint saves_revision_positive
    check (revision > 0),
  constraint saves_schema_version_positive
    check (schema_version > 0),
  constraint saves_document_size
    check (octet_length(document_json) <= 65536),
  constraint saves_previous_all_or_none
    check (num_nulls(previous_revision, previous_document_json, previous_received_at) in (0, 3)),
  constraint saves_previous_revision_older
    check (previous_revision is null or previous_revision < revision),
  constraint saves_previous_document_size
    check (previous_document_json is null or octet_length(previous_document_json) <= 65536)
);

-- ---------------------------------------------------------------- save_audit --
create table public.save_audit (
  id                 bigint      generated always as identity primary key,
  user_id            uuid        not null references auth.users(id) on delete cascade,
  occurred_at        timestamptz not null default now(),
  outcome            text        not null,
  error_code         text            null,
  base_revision      bigint          null,
  resulting_revision bigint          null,
  document_bytes     integer     not null,
  client_reported_at timestamptz     null,
  detail             jsonb           null,
  constraint save_audit_outcome_known
    check (outcome in ('accepted', 'rejected')),
  constraint save_audit_error_code_matches_outcome
    check ((outcome = 'accepted') = (error_code is null)),
  constraint save_audit_resulting_revision_matches_outcome
    check ((outcome = 'accepted') = (resulting_revision is not null)),
  constraint save_audit_document_bytes_non_negative
    check (document_bytes >= 0),
  constraint save_audit_detail_size
    check (detail is null or octet_length(detail::text) <= 4096)
);

create index save_audit_user_time_idx
  on public.save_audit (user_id, occurred_at desc);

create index save_audit_rejected_time_idx
  on public.save_audit (occurred_at desc)
  where outcome = 'rejected';

-- ----------------------------------------------------------- recovery_codes --
create table public.recovery_codes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  code_hash   text        not null,
  created_at  timestamptz not null default now(),
  redeemed_at timestamptz     null,
  revoked_at  timestamptz     null,
  constraint recovery_codes_hash_format
    check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint recovery_codes_single_terminal_state
    check (redeemed_at is null or revoked_at is null)
);

create unique index recovery_codes_hash_key
  on public.recovery_codes (code_hash);

create unique index recovery_codes_one_active_per_user_idx
  on public.recovery_codes (user_id)
  where redeemed_at is null and revoked_at is null;

-- ------------------------------------------------------ leaderboard_entries --
create table public.leaderboard_entries (
  board_key       text             not null,
  user_id         uuid             not null references auth.users(id) on delete cascade,
  display_name    text                 null,
  metric_exact    text             not null,
  metric_log10    double precision not null,
  source_revision bigint           not null,
  updated_at      timestamptz      not null default now(),
  primary key (board_key, user_id),
  constraint leaderboard_entries_board_key_format
    check (board_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  constraint leaderboard_entries_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 24),
  constraint leaderboard_entries_metric_exact_length
    check (char_length(metric_exact) between 1 and 64),
  constraint leaderboard_entries_metric_log10_finite
    check (metric_log10 <> 'NaN'::double precision
           and metric_log10 > '-Infinity'::double precision
           and metric_log10 < 'Infinity'::double precision),
  constraint leaderboard_entries_source_revision_positive
    check (source_revision > 0)
);

create index leaderboard_entries_rank_idx
  on public.leaderboard_entries (board_key, metric_log10 desc, updated_at asc);

create trigger leaderboard_entries_set_updated_at
  before update on public.leaderboard_entries
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ entitlements --
create table public.entitlements (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  entitlement_key text        not null,
  granted_at      timestamptz not null default now(),
  granted_by      text        not null,
  source          text            null,
  revoked_at      timestamptz     null,
  primary key (user_id, entitlement_key),
  constraint entitlements_key_known
    check (entitlement_key in ('cosmetic.supporter_badge')),
  constraint entitlements_granted_by_length
    check (char_length(granted_by) between 1 and 64)
);

-- ------------------------------------------------------- row-level security --
-- Enabling RLS with no policy already denies every access to `anon` and
-- `authenticated`; the service role bypasses RLS entirely and is the only
-- writer anywhere in this schema. The policies below add exactly the
-- read/update grants the Step 3 matrix names — nothing else is added, because
-- nothing else is in that matrix.

alter table public.profiles           enable row level security;
alter table public.saves              enable row level security;
alter table public.save_audit         enable row level security;
alter table public.recovery_codes     enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.entitlements       enable row level security;

create policy profiles_select_own on public.profiles
  for select
  using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy saves_select_own on public.saves
  for select
  using (auth.uid() = user_id);

create policy leaderboard_entries_select_all on public.leaderboard_entries
  for select
  using (true);

-- The policy above admits every row, and PostgREST lets the caller choose its
-- own column list — so the policy alone would publish `user_id`, and
-- `?select=user_id` would enumerate the `auth.users` id of every player who has
-- ever published to a board, without authenticating. Grants and row-level
-- security are independent and both must permit a read, so withholding the
-- column at the grant level keeps the board world-readable without publishing
-- ids.
--
-- Two consequences for Step 27, recorded rather than discovered. A client
-- cannot select, filter, or sort by `user_id`, so "where do I rank" is answered
-- by the Edge Function rather than by a direct query here. And `select=*` is
-- refused outright (42501), because PostgREST expands it to every column
-- including the withheld one — a board query must name its columns.
revoke select on public.leaderboard_entries from anon, authenticated;
grant select (board_key, display_name, metric_exact, metric_log10, source_revision, updated_at)
  on public.leaderboard_entries to anon, authenticated;

create policy entitlements_select_own on public.entitlements
  for select
  using (auth.uid() = user_id);

-- `save_audit` and `recovery_codes` carry no policy at all: nothing may read
-- or write them except the service role. This is the anchor the Step 15 direct-
-- write test and the Step 26 adversarial suite both check.
