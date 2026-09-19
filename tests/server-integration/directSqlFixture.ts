/**
 * Server-milestone Step 27: a superuser SQL escape hatch for integration-test
 * setup that PostgREST cannot reach at all.
 *
 * Every table this schema exposes lives in `public`, and the service-role
 * client (`serviceRoleFixture.ts`) reaches it by bypassing row-level security,
 * not by reaching another schema — PostgREST's `db-schemas` configuration
 * exposes only `public` (and a couple of Supabase-internal ones), never
 * `auth`. `leaderboard_entries.user_id` carries a `not null` foreign key to
 * `auth.users(id)` (`on delete cascade`), and `(board_key, user_id)` is the
 * primary key, so proving a ranking query holds its latency budget at a
 * realistic row count needs that many *distinct* `auth.users` rows to
 * reference — one leaderboard entry per user.
 *
 * Minting each one through GoTrue (a real anonymous sign-in, the path every
 * other fixture in this suite uses for a *handful* of identities) would turn
 * one latency assertion into the slowest, flakiest thing `verify:server`
 * runs. This fixture instead runs one bulk `insert` as the Postgres
 * superuser — the same account `supabase db reset` itself uses — directly
 * against the database container Docker already starts for the whole local
 * stack. No new runtime dependency: `psql` lives inside that container
 * regardless of what the host has installed, so this shells out to `docker
 * exec` rather than requiring a host-level Postgres client or a new npm
 * dependency. No credential of its own either — nothing here is a secret:
 * the local stack's Postgres user and password are the well-known literal
 * `postgres`/`postgres` every `supabase start` publishes.
 *
 * A row minted this way authenticates against RLS just as well as a real
 * GoTrue session would: `mintFixtureUserToken` (`authFixture.ts`) signs a JWT
 * with the local stack's own fixed secret, and PostgREST/Postgres trust any
 * validly-signed JWT's `sub` claim as `auth.uid()` — no live GoTrue session
 * is consulted. The `auth.users` row still has to exist for the foreign key,
 * which is exactly what this fixture is for.
 *
 * Test setup only, exactly like `serviceRoleFixture.ts` — never call this
 * from application code, and never anywhere near a deployed database.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cachedContainerName: string | null = null;

/** `supabase start`/`db reset` name the db container `supabase_db_<project_id>`, and `project_id` is read from disk rather than hardcoded. */
function readDbContainerName(): string {
  if (cachedContainerName !== null) {
    return cachedContainerName;
  }

  const configPath = join(PROJECT_ROOT, 'supabase', 'config.toml');
  const source = readFileSync(configPath, 'utf8');
  const match = /^project_id\s*=\s*"([^"]+)"/m.exec(source);

  if (match === null) {
    throw new Error(
      "directSqlFixture: could not read 'project_id' from supabase/config.toml — the local db container name is derived from it.",
    );
  }

  cachedContainerName = `supabase_db_${match[1]}`;
  return cachedContainerName;
}

/**
 * Runs `sql` as the Postgres superuser inside the local stack's own database
 * container, piped over `docker exec`'s stdin rather than passed as a
 * command-line argument, so an arbitrarily large bulk statement never risks
 * `ARG_MAX`. Throws (via `execFileSync`) on any non-zero exit — `psql -v
 * ON_ERROR_STOP=1` turns the first SQL error into one.
 */
export function runSqlAsSuperuser(sql: string): void {
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      readDbContainerName(),
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

/** Runs a read-only query as the local Postgres superuser and returns `psql`'s
 * unaligned, tuples-only output. This is intentionally a test-only escape
 * hatch for catalog assertions and auth.users checks that PostgREST cannot
 * express; application code must use the Edge Function path instead. */
export function querySqlAsSuperuser(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      readDbContainerName(),
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-A',
      '-t',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { input: sql, encoding: 'utf8' },
  ).trim();
}

/** Escapes a value for a single-quoted SQL literal. Test-fixture use only — never with untrusted input. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Bulk-inserts minimal, valid `auth.users` rows for the given ids in one
 * statement — enough to satisfy every foreign key in `public` that references
 * `auth.users(id)`, nothing more. `is_anonymous = true` mirrors what a real
 * guest session's row looks like.
 */
export function seedAuthUsers(userIds: readonly string[]): void {
  if (userIds.length === 0) {
    return;
  }

  const values = userIds
    .map((id) => `(${sqlLiteral(id)}, 'authenticated', 'authenticated', true)`)
    .join(',\n');

  runSqlAsSuperuser(
    `insert into auth.users (id, aud, role, is_anonymous) values\n${values};`,
  );
}

/** Deletes the given `auth.users` rows; `on delete cascade` removes every dependent row this schema holds for them, including `leaderboard_entries`. */
export function deleteAuthUsers(userIds: readonly string[]): void {
  if (userIds.length === 0) {
    return;
  }

  const list = userIds.map((id) => sqlLiteral(id)).join(', ');
  runSqlAsSuperuser(`delete from auth.users where id in (${list});`);
}
