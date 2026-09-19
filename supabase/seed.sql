-- Cat Mine Idle server milestone — local development seed.
--
-- Runs after every `supabase db reset` (see `[db.seed]` in `config.toml`) and
-- only there: `supabase db push` never runs seed files, and this repository's
-- CI resets a throwaway local stack, never a remote one. Nothing here reaches
-- a deployed database.
--
-- One fixture guest — `auth.users` row, `profiles` row — exercises the schema
-- Step 5 lands without needing the anonymous sign-in flow Step 8 has not built
-- yet, so a developer running `npm run supabase:start` and opening Studio sees
-- a real row instead of six empty tables, and Step 7's fixture pattern for an
-- authenticated caller has a known id to hold a token for.
--
-- The `profiles` row is no longer inserted directly, below: Step 9's
-- `on_auth_user_created` trigger fires on the `auth.users` insert and creates
-- it, the same as it would for a real anonymous sign-up. Inserting it by hand
-- here as well would violate `profiles`'s primary key the moment that trigger
-- exists, so the fixture's `display_name` is applied with an `update`
-- afterward instead.
--
-- `saves`, `save_audit`, `leaderboard_entries`, `entitlements`, and
-- `account_audit` are left
-- unseeded on purpose: a fixture save document has to be a document the shared
-- `src/persistence` validator would accept, which does not yet run on the
-- server (Step 6), and inventing one by hand ahead of that code risks seeding
-- exactly the kind of drift this milestone exists to avoid. Steps 16, 26, and
-- 31 add fixtures for those tables once the code that produces real rows for
-- them exists.
--
-- `confirmation_token`, `recovery_token`, `email_change_token_new`, and
-- `email_change` have no column default, so an insert that omits them leaves
-- them NULL. GoTrue's own row scanner reads them as plain (non-nullable)
-- strings, so a real request through it — `auth.getUser`, which
-- `whoami-check` calls in Step 7's integration test — fails with "Unhandled
-- server error: sql: Scan error on column ... converting NULL to string is
-- unsupported" the moment it has to load this row. This was never exercised
-- before Step 7: Steps 4-6 only ever handed a manually-signed JWT to
-- PostgREST directly, which never asks GoTrue to load the user. Explicit
-- empty strings here match what GoTrue itself writes for a real sign-up.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  is_anonymous,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  true,
  '{"provider": "anonymous", "providers": ["anonymous"]}',
  '{}',
  '',
  '',
  '',
  '',
  now(),
  now()
);

update public.profiles
   set display_name = 'Dev Guest'
 where id = '11111111-1111-1111-1111-111111111111';
