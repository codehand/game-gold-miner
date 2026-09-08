/**
 * Server-milestone Step 4 validation: "A clean checkout starts the local stack,
 * applies migrations, and responds to a health check." Reused unchanged by
 * Step 5's CI job and its "CI applies every migration to an empty database and
 * passes" test — the expected migration list is read from
 * `supabase/migrations/`, so adding a migration extends the check without
 * anyone editing this file.
 *
 * Run with `npm run verify:server`. It requires Docker; the stack runs entirely
 * offline once the CLI images are cached.
 *
 * The second half of Step 4's test — that a production build ships no
 * service-role key and no non-public secret — lives in
 * `scripts/scan-bundle-secrets.mjs` and runs inside `npm run verify`, because it
 * needs a build rather than a database. `--with-bundle-scan` runs both halves
 * here.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIRECTORY = join(PROJECT_ROOT, 'supabase', 'migrations');
const HEALTH_URL = 'http://127.0.0.1:54321/functions/v1/save-sync/v1/health';
const HEALTH_ATTEMPTS = 20;
const HEALTH_RETRY_DELAY_MS = 1_000;
/** The edge runtime cold-starts a worker on the first request to a function. */
const HEALTH_TIMEOUT_MS = 20_000;
/** A server clock more than a minute from ours is not the clock we asked for. */
const SERVER_TIME_TOLERANCE_MS = 60_000;

let failures = 0;

function report(ok, label, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

function run(command, args, { capture = false } = {}) {
  return spawnSync(command, args, {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
}

function supabase(args, options) {
  return run('npx', ['--no-install', 'supabase', ...args], options);
}

/**
 * Every committed migration's version, read from disk rather than listed by
 * hand. A hand-maintained list is the failure this check cannot afford: someone
 * adds a migration, forgets the list, and the run still reports PASS while
 * checking nothing about the new file.
 */
function readExpectedMigrations() {
  return readdirSync(MIGRATIONS_DIRECTORY)
    .filter((entry) => entry.endsWith('.sql'))
    .map((entry) => entry.split('_')[0])
    .filter((version) => /^\d{14}$/.test(version))
    .sort();
}

/**
 * Parses a Supabase CLI JSON payload, which may be preceded on the same stream
 * by progress notices and ANSI escapes. Returns null when there is nothing
 * parseable, so callers can report a parse failure rather than an empty result.
 */
function parseCliJson(stdout) {
  const text = stdout ?? '';
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

async function main() {
  console.log('Step 4 — Supabase project and local stack\n');

  const docker = run('docker', ['info'], { capture: true });
  report(docker.status === 0, 'Docker daemon is reachable');
  if (docker.status !== 0) {
    console.error('\nThe local stack needs Docker. Start Docker and retry.');
    process.exit(1);
  }

  console.log('\n> supabase start');
  const start = supabase(['start']);
  report(start.status === 0, 'Local stack starts');
  if (start.status !== 0) {
    process.exit(1);
  }

  console.log('\n> supabase db reset');
  const reset = supabase(['db', 'reset']);
  report(reset.status === 0, 'Migrations apply to an empty database');

  const expectedMigrations = readExpectedMigrations();
  // A zero-length list would make the comparison below vacuously true, which is
  // the same silent pass this check exists to prevent.
  report(
    expectedMigrations.length > 0,
    'Committed migrations were found on disk',
    `${expectedMigrations.length} in supabase/migrations`,
  );

  // `--output-format json` is required, not incidental: the CLI's default is a
  // text table and it only emits JSON on its own when it auto-detects an agent.
  // Without the flag this check parses nothing in an ordinary terminal and
  // reports a healthy stack as a missing migration.
  const list = supabase(['migration', 'list', '--local', '--output-format', 'json'], {
    capture: true,
  });
  const parsed = parseCliJson(list.stdout);

  if (parsed === null) {
    // Distinguished from "the migration is missing" on purpose: conflating an
    // unreadable response with an unapplied migration sends whoever hits it to
    // debug the database instead of the parser.
    report(false, 'Migration list is readable', 'could not parse the CLI response');
  } else {
    const appliedVersions = (parsed.migrations ?? [])
      .filter((migration) => migration.remote)
      .map((migration) => migration.local);
    const missing = expectedMigrations.filter((version) => !appliedVersions.includes(version));
    report(
      missing.length === 0,
      'Every committed migration is recorded as applied',
      missing.length === 0 ? `${appliedVersions.length} applied` : `missing ${missing.join(', ')}`,
    );
  }

  console.log('\n> health check');
  let health = null;
  let status = 0;
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      status = response.status;
      if (response.ok) {
        health = await response.json();
        break;
      }
      await response.body?.cancel();
    } catch {
      status = 0;
    }
    await delay(HEALTH_RETRY_DELAY_MS);
  }

  report(status === 200, 'GET /v1/health answers 200 without a bearer token', `status ${status}`);
  report(health?.status === 'ok', "Health body reports status 'ok'");

  const serverTime = health?.serverTime ? Date.parse(health.serverTime) : Number.NaN;
  const skewMs = Math.abs(serverTime - Date.now());
  report(
    Number.isFinite(serverTime) && skewMs < SERVER_TIME_TOLERANCE_MS,
    'Health body carries a current server timestamp',
    Number.isFinite(serverTime) ? `${skewMs} ms from local clock` : 'unparseable',
  );

  if (process.argv.includes('--with-bundle-scan')) {
    console.log('\n> npm run build');
    report(run('npm', ['run', 'build']).status === 0, 'Production build succeeds');
    console.log('\n> npm run scan:secrets');
    report(run('npm', ['run', 'scan:secrets']).status === 0, 'Build output holds no server secret');
  }

  console.log(
    `\n${failures === 0 ? 'Step 4 validation passed.' : `Step 4 validation failed: ${failures} check(s).`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
