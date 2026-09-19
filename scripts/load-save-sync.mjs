/**
 * Server-milestone Step 36: local concurrent save-sync benchmark.
 *
 * The defaults match the scale recorded in the threat model: 20 concurrent
 * players, three accepted uploads each, for 60 uploads total. Test-only
 * identities are created through the real anonymous sign-in endpoint so the
 * measured requests pass through GoTrue verification and the real save path.
 * Nothing in this script is suitable for a hosted database.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_FALLBACK = 'http://127.0.0.1:54321';
const DEFAULT_CONCURRENCY = 20;
const DEFAULT_ROUNDS = 3;
const MAX_UPLOAD_P95_MS = 500;
const MIN_THROUGHPUT_UPLOADS_PER_SECOND = 20;
const MAX_LONG_ABSENCE_RESIMULATION_MS = 250;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCliJson(stdout) {
  const start = stdout.indexOf('{');
  if (start === -1) {
    throw new Error('supabase status did not return JSON.');
  }
  return JSON.parse(stdout.slice(start));
}

function localStackStatus() {
  return parseCliJson(
    execFileSync('npx', ['--no-install', 'supabase', 'status', '--output', 'json'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    }),
  );
}

function readDbContainer() {
  const config = readFileSync(join(PROJECT_ROOT, 'supabase', 'config.toml'), 'utf8');
  const match = /^project_id\s*=\s*"([^"]+)"/m.exec(config);
  if (match === null) {
    throw new Error('Could not read project_id from supabase/config.toml.');
  }
  return `supabase_db_${match[1]}`;
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSqlAsSuperuser(sql) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      readDbContainer(),
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (result.status !== 0) {
    throw new Error(`local fixture SQL failed: ${result.stderr.trim()}`);
  }
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index];
}

function summarizeDurations(durations) {
  const sorted = [...durations].sort((left, right) => left - right);
  return {
    count: sorted.length,
    minMs: Math.round(sorted[0] ?? 0),
    p50Ms: Math.round(percentile(sorted, 0.5)),
    p95Ms: Math.round(percentile(sorted, 0.95)),
    maxMs: Math.round(sorted.at(-1) ?? 0),
  };
}

async function uploadSave(apiUrl, anonKey, token, body) {
  const startedAt = performance.now();
  const response = await fetch(`${apiUrl}/functions/v1/save-sync/v1/save`, {
    method: 'PUT',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const responseBody = await response.json();
  const durationMs = performance.now() - startedAt;
  if (response.status !== 200 || typeof responseBody.revision !== 'number') {
    throw new Error(`benchmark upload failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }
  return { durationMs, revision: responseBody.revision };
}

async function createGuest(apiUrl, anonKey) {
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ data: {} }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (
    response.status !== 200 ||
    typeof body.access_token !== 'string' ||
    typeof body.user?.id !== 'string'
  ) {
    throw new Error(`anonymous benchmark sign-in failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return { userId: body.user.id, token: body.access_token, revision: null };
}

async function measureLongAbsence() {
  execFileSync('npm', ['run', 'build:server-core'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  const bundle = await import(
    `${pathToFileURL(join(PROJECT_ROOT, 'supabase', 'functions', '_shared', 'generated', 'core-bundle.js')).href}?benchmark=${Date.now()}`,
  );
  const startedAt = performance.now();
  const initialState = bundle.createInitialGameState(bundle.BASE_GAME_BALANCE, Date.now());
  bundle.catchUpSimulation(initialState, bundle.MAX_CATCH_UP_MS);
  return {
    absenceMs: bundle.MAX_CATCH_UP_MS,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

async function main() {
  const concurrency = parsePositiveInteger(process.env.LOAD_CONCURRENCY, DEFAULT_CONCURRENCY);
  const rounds = parsePositiveInteger(process.env.LOAD_ROUNDS, DEFAULT_ROUNDS);
  const status = localStackStatus();
  const apiUrl = process.env.LOAD_API_URL ?? status.API_URL ?? API_FALLBACK;
  const anonKey = status.ANON_KEY;
  if (typeof anonKey !== 'string') {
    throw new Error('Local Supabase status did not expose ANON_KEY.');
  }

  const users = await Promise.all(
    Array.from({ length: concurrency }, () => createGuest(apiUrl, anonKey)),
  );
  const document = JSON.parse(
    readFileSync(join(PROJECT_ROOT, 'tests', 'fixtures', 'ten-minute-core-fixture.json'), 'utf8'),
  ).inputDocument;

  const measurements = [];
  const loadStartedAt = performance.now();
  try {
    for (let round = 0; round < rounds; round += 1) {
      await Promise.all(
        users.map(async (user) => {
          const result = await uploadSave(apiUrl, anonKey, user.token, {
            baseRevision: user.revision,
            document,
          });
          user.revision = result.revision;
          measurements.push(result.durationMs);
        }),
      );
    }
  } finally {
    runSqlAsSuperuser(
      `delete from auth.users where id in (${users.map(({ userId }) => sqlLiteral(userId)).join(', ')});`,
    );
  }

  const longAbsence = await measureLongAbsence();
  const wallDurationMs = performance.now() - loadStartedAt;
  const uploadLatency = summarizeDurations(measurements);
  const throughputUploadsPerSecond = measurements.length / (wallDurationMs / 1_000);
  if (
    uploadLatency.p95Ms > MAX_UPLOAD_P95_MS ||
    throughputUploadsPerSecond < MIN_THROUGHPUT_UPLOADS_PER_SECOND ||
    longAbsence.durationMs > MAX_LONG_ABSENCE_RESIMULATION_MS
  ) {
    throw new Error(
      `load budget failed: p95=${uploadLatency.p95Ms}ms, throughput=${throughputUploadsPerSecond.toFixed(2)}/s, longAbsence=${longAbsence.durationMs}ms`,
    );
  }
  const result = {
    status: 'passed',
    scale: {
      concurrentPlayers: concurrency,
      roundsPerPlayer: rounds,
      totalUploads: measurements.length,
      targetPeakUploadsPerSecond: 20,
    },
    budgets: {
      uploadP95Ms: MAX_UPLOAD_P95_MS,
      minimumThroughputUploadsPerSecond: MIN_THROUGHPUT_UPLOADS_PER_SECOND,
      longAbsenceResimulationMs: MAX_LONG_ABSENCE_RESIMULATION_MS,
    },
    uploadLatency,
    wallDurationMs: Math.round(wallDurationMs),
    throughputUploadsPerSecond: Number(throughputUploadsPerSecond.toFixed(2)),
    longAbsenceResimulation: longAbsence,
    clientFrameBudget: 'untouched: benchmark uses the background server path and does not run in the Phaser frame loop',
    fixture: basename(join(PROJECT_ROOT, 'tests', 'fixtures', 'ten-minute-core-fixture.json')),
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`FAIL  save-sync load benchmark — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
