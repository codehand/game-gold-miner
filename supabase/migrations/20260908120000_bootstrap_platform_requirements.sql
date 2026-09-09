-- Cat Mine Idle server milestone — Step 4, bootstrap.
--
-- This is the first forward-only migration and it deliberately creates nothing.
-- The six tables designed in Step 3 are landed by Step 5, which also adds CI;
-- pre-landing them here would move that step's work and its review.
--
-- What this migration does own is the platform premise the Step 3 schema was
-- written against and never checked: `memory-bank/architecture.md` states that
-- `gen_random_uuid()` is built into PostgreSQL 13+ "which Supabase provides,
-- no extension is required", and every table's primary-key default relies on
-- it. An older server would accept the migration and fail at the first insert.
--
-- It also gives the migration pipeline something real to apply, so that Step 4's
-- "applies migrations" check and Step 5's "a deliberately broken migration fails
-- CI" check both exercise a file rather than an empty directory.

do $$
declare
  server_version_num integer := current_setting('server_version_num')::integer;
begin
  if server_version_num < 130000 then
    raise exception
      'Cat Mine Idle requires PostgreSQL 13 or newer for the built-in gen_random_uuid(); this server reports %.',
      current_setting('server_version');
  end if;

  -- Resolve it rather than trust the version number: a stripped build, or a
  -- search_path that hides pgcrypto, would pass the check above and still break
  -- every primary-key default in the Step 3 schema.
  perform gen_random_uuid();
end;
$$;
