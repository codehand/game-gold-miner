/**
 * Server-milestone Step 34: take a real custom-format dump of the local
 * Supabase database and restore the public schema into a fresh PostgreSQL
 * container.  This is deliberately a Docker/Postgres drill rather than a
 * mock of pg_dump: an untested backup is not a backup.
 *
 * The local Supabase database owns auth.users in a separate schema.  The
 * backup scope is intentionally `--schema=public`, so the scratch database
 * receives a minimal auth.users reference table populated with the source
 * ids before the public rows are restored.  That makes foreign keys and row
 * counts real while keeping Auth internals out of the application backup.
 */

import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(PROJECT_ROOT, 'supabase', 'config.toml');
const SCRATCH_IMAGE = process.env.BACKUP_DRILL_POSTGRES_IMAGE ?? 'postgres:17-alpine';

function readProjectId() {
  const source = readFileSync(CONFIG_PATH, 'utf8');
  const match = /^project_id\s*=\s*"([^"]+)"/m.exec(source);
  if (match === null) {
    throw new Error('Could not read project_id from supabase/config.toml.');
  }
  return match[1];
}

function runDocker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function querySource(dbContainer, sql) {
  return runDocker([
    'exec',
    dbContainer,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-A',
    '-t',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    sql,
  ]).trim();
}

function queryScratch(container, sql) {
  return runDocker([
    'exec',
    container,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-A',
    '-t',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    sql,
  ]).trim();
}

function execScratchSql(container, sql) {
  runDocker([
    'exec',
    '-i',
    container,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ], {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function waitForScratch(container) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
      { stdio: 'ignore' },
    );
    if (result.status === 0) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Scratch PostgreSQL container did not become ready: ${container}`);
}

function tableNames(container, source) {
  const output = source
    ? querySource(
        container,
        "select tablename from pg_catalog.pg_tables where schemaname = 'public' order by tablename;",
      )
    : queryScratch(
        container,
        "select tablename from pg_catalog.pg_tables where schemaname = 'public' order by tablename;",
      );
  return output === '' ? [] : output.split('\n').filter(Boolean);
}

function rowCounts(container, tables, source) {
  return Object.fromEntries(
    tables.map((table) => {
      const identifier = table.replaceAll('"', '""');
      const sql = `select count(*) from public."${identifier}";`;
      const output = source ? querySource(container, sql) : queryScratch(container, sql);
      return [table, Number.parseInt(output, 10)];
    }),
  );
}

function captureDump(dbContainer, dumpPath) {
  const fileDescriptor = openSync(dumpPath, 'w');
  const startedAt = performance.now();
  const result = spawnSync(
    'docker',
    [
      'exec',
      dbContainer,
      'pg_dump',
      '--format=custom',
      '--schema=public',
      '--no-owner',
      '--no-privileges',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { stdio: ['ignore', fileDescriptor, 'pipe'] },
  );
  closeSync(fileDescriptor);
  if (result.status !== 0) {
    throw new Error(
      `pg_dump failed: ${result.stderr?.toString().trim() ?? `exit ${result.status}`}`,
    );
  }
  return performance.now() - startedAt;
}

async function createScratch(container) {
  runDocker([
    'run',
    '--detach',
    '--name',
    container,
    '--env',
    'POSTGRES_PASSWORD=postgres',
    '--env',
    'POSTGRES_DB=postgres',
    SCRATCH_IMAGE,
  ]);
  await waitForScratch(container);
}

function seedAuthReference(container, userIds) {
  const values = userIds.length === 0
    ? ''
    : userIds.map((id) => `(${sqlLiteral(id)})`).join(', ');
  execScratchSql(
    container,
    `
      create schema auth;
      create table auth.users (id uuid primary key);
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$ select null::uuid $$;
      ${values === '' ? '' : `insert into auth.users (id) values ${values};`}
    `,
  );
  if (queryScratch(container, "select nspname from pg_namespace where nspname = 'auth';") !== 'auth') {
    throw new Error('Scratch auth reference schema was not created.');
  }
}

function restoreDump(container, dumpPath) {
  const scratchDumpPath = `/tmp/${basename(dumpPath)}`;
  runDocker(['cp', dumpPath, `${container}:${scratchDumpPath}`]);
  const startedAt = performance.now();
  runDocker([
    'exec',
    container,
    'pg_restore',
    '--exit-on-error',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--username=postgres',
    '--dbname=postgres',
    scratchDumpPath,
  ]);
  return performance.now() - startedAt;
}

async function main() {
  const dbContainer = process.env.BACKUP_DRILL_DB_CONTAINER ?? `supabase_db_${readProjectId()}`;
  const scratchContainer = `cat-mine-backup-drill-${process.pid}-${Date.now()}`;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'cat-mine-backup-drill-'));
  const dumpPath = join(tempDirectory, 'public-schema.dump');
  const startedAt = performance.now();
  let scratchCreated = false;

  try {
    const sourceTables = tableNames(dbContainer, true);
    const sourceRowCounts = rowCounts(dbContainer, sourceTables, true);
    const userIdsOutput = querySource(dbContainer, 'select id::text from auth.users order by id;');
    const userIds = userIdsOutput === '' ? [] : userIdsOutput.split('\n').filter(Boolean);

    const backupDurationMs = captureDump(dbContainer, dumpPath);
    const backupBytes = Number(statSync(dumpPath).size);

    scratchCreated = true;
    await createScratch(scratchContainer);
    seedAuthReference(scratchContainer, userIds);
    const restoreDurationMs = restoreDump(scratchContainer, dumpPath);
    const restoredTables = tableNames(scratchContainer, false);
    const restoredRowCounts = rowCounts(scratchContainer, restoredTables, false);

    const tablesMatch = JSON.stringify(sourceTables) === JSON.stringify(restoredTables);
    const rowCountsMatch = JSON.stringify(sourceRowCounts) === JSON.stringify(restoredRowCounts);
    if (!tablesMatch || !rowCountsMatch) {
      throw new Error(
        `Restore verification failed: tablesMatch=${tablesMatch}, rowCountsMatch=${rowCountsMatch}.`,
      );
    }

    const totalDurationMs = performance.now() - startedAt;
    console.log(
      JSON.stringify(
        {
          status: 'passed',
          source: {
            databaseContainer: dbContainer,
            schema: 'public',
            tables: sourceTables,
            rowCounts: sourceRowCounts,
          },
          backup: {
            format: 'custom',
            bytes: backupBytes,
            durationMs: Math.round(backupDurationMs),
          },
          restore: {
            scratchImage: SCRATCH_IMAGE,
            scratchContainer,
            tables: restoredTables,
            rowCounts: restoredRowCounts,
            durationMs: Math.round(restoreDurationMs),
          },
          verification: { tablesMatch, rowCountsMatch },
          totalDurationMs: Math.round(totalDurationMs),
          loss: [
            'Only the public application schema was restored.',
            'Supabase Auth internals, sessions, identities, runtime caches, and secrets were not in this dump.',
            'The scratch auth.users table was a minimal foreign-key reference fixture, not an Auth restore.',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (scratchCreated) {
      try {
        runDocker(['rm', '--force', scratchContainer]);
      } catch {
        console.error(`WARN  could not remove scratch container ${scratchContainer}`);
      }
    }
    try {
      unlinkSync(dumpPath);
    } catch {
      // The temp directory is process-owned; failure to unlink is non-fatal
      // and the path is printed by the OS cleanup tooling if it remains.
    }
  }
}

main().catch((error) => {
  console.error(`FAIL  backup/restore drill — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
