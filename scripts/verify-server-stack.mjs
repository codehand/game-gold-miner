/**
 * Server-milestone Step 4 validation: "A clean checkout starts the local stack,
 * applies migrations, and responds to a health check." Reused unchanged by
 * Step 5's CI job and its "CI applies every migration to an empty database and
 * passes" test — the expected migration list is read from
 * `supabase/migrations/`, so adding a migration extends the check without
 * anyone editing this file.
 *
 * Also runs Step 6's validation: "An Edge Function imports the real
 * `advanceSimulation`, `catchUpSimulation`, `migrateSaveDocument`, and
 * `validateSaveDocument`, and reproduces a known ten-minute result
 * byte-for-byte identical to the client unit test's expectation." Before the
 * stack starts, this rebuilds `supabase/functions/_shared/generated/core-bundle.js`
 * from the current source (`npm run build:server-core`), so the check can never
 * pass against a stale bundle; it then asks the live `core-portability-check`
 * function to run the fixture and diffs its response against
 * `tests/fixtures/ten-minute-core-fixture.json`, the same fixture
 * `tests/unit/server-core-portability.test.ts` asserts against on the
 * unbundled source.
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
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIRECTORY = join(PROJECT_ROOT, 'supabase', 'migrations');
const HEALTH_URL = 'http://127.0.0.1:54321/functions/v1/save-sync/v1/health';
const CORE_PORTABILITY_URL =
  'http://127.0.0.1:54321/functions/v1/core-portability-check';
const CORE_PORTABILITY_FIXTURE_PATH = join(
  PROJECT_ROOT,
  'tests',
  'fixtures',
  'ten-minute-core-fixture.json',
);
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

/**
 * Structural equality, order-insensitive for object keys and order-sensitive
 * for arrays. This is the actual invariant Step 6 cares about — "the same
 * document" — and matches what `tests/unit/server-core-portability.test.ts`'s
 * `toEqual` checks against the unbundled source; comparing serialized JSON
 * text directly would fail on a harmless key-order difference that `toEqual`
 * would accept, so the two checks would disagree about what "identical"
 * means.
 */
function deepEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    left === null ||
    right === null
  ) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]),
  );
}

/**
 * Step 6: asks the live `core-portability-check` function to reproduce the
 * fixed ten-minute fixture through the real, Deno-bundled `advanceSimulation`,
 * `catchUpSimulation`, `migrateSaveDocument`, and `validateSaveDocument`, and
 * diffs its response against the exact document
 * `tests/unit/server-core-portability.test.ts` pins for the same fixture run
 * through the unbundled source. A mismatch names the first differing
 * top-level `state` field rather than dumping two multi-kilobyte documents.
 */
async function checkCorePortability() {
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(CORE_PORTABILITY_FIXTURE_PATH, 'utf8'));
  } catch (error) {
    report(false, 'Ten-minute core fixture is readable', String(error));
    return;
  }

  // This function has never been called yet in a fresh `supabase start`, so it
  // pays its own cold-start cost independently of the health route's — the
  // same reason that route retries. Unlike health, a real HTTP response here
  // (even a non-200 one) means the worker booted and answered; retrying an
  // identical request twenty times will not change a deterministic failure, so
  // only a fetch that never got a response at all (still booting, or the
  // container is not yet reachable) is worth retrying.
  let body = null;
  let status = 0;
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(CORE_PORTABILITY_URL, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      status = response.status;
      if (response.ok) {
        body = await response.json();
      } else {
        await response.body?.cancel();
      }
      break;
    } catch {
      status = 0;
      await delay(HEALTH_RETRY_DELAY_MS);
    }
  }

  report(status === 200, 'core-portability-check answers 200', `status ${status}`);

  const expectedDocument = fixture.expectedOutputDocument;
  const actualDocument = body?.outputDocument;
  const identical = deepEqual(expectedDocument, actualDocument);

  let detail;
  if (!identical) {
    const stateFields = Object.keys(expectedDocument?.state ?? {});
    const firstMismatchedStateField = stateFields.find(
      (field) => !deepEqual(expectedDocument.state[field], actualDocument?.state?.[field]),
    );
    detail = firstMismatchedStateField
      ? `first mismatch at state.${firstMismatchedStateField}`
      : 'first mismatch outside state (schemaVersion, savedAtTimestampMs, or effectiveProductionRatePerSecond)';
  } else if (JSON.stringify(expectedDocument) !== JSON.stringify(actualDocument)) {
    // Both sides build the document through the identical `createSaveDocument`
    // call, so this should never fire — recorded rather than silently passed
    // over, since it would mean the "byte-for-byte" half of Step 6's own test
    // wording is not actually true even though the documents agree in value.
    detail = 'identical values, differing key order';
  }

  report(
    identical,
    'Ten-minute reproduction is byte-for-byte identical to the pinned fixture',
    detail,
  );
}

async function main() {
  console.log('Step 4 — Supabase project and local stack\n');

  const docker = run('docker', ['info'], { capture: true });
  report(docker.status === 0, 'Docker daemon is reachable');
  if (docker.status !== 0) {
    console.error('\nThe local stack needs Docker. Start Docker and retry.');
    process.exit(1);
  }

  console.log('\n> npm run build:server-core');
  const bundleBuild = run('npm', ['run', 'build:server-core']);
  report(
    bundleBuild.status === 0,
    "core-portability-check's bundle builds from current source",
  );
  if (bundleBuild.status !== 0) {
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

  console.log('\n> core portability check (Step 6)');
  await checkCorePortability();

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
