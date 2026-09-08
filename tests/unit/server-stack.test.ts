import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Server-milestone Step 4 — the half of its validation that needs no Docker and
 * no build, so it runs in `npm run test` on every change.
 *
 * The rest of Step 4's test is split by what it requires: the local stack,
 * migrations, and the health check are exercised by `npm run verify:server`,
 * and the production-bundle secret scan by `npm run scan:secrets` inside
 * `npm run verify`. These are the standing invariants those two commands
 * assume.
 */

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');

const readProjectFile = (relativePath: string): string =>
  readFileSync(join(PROJECT_ROOT, relativePath), 'utf8');

/** A JWT whose payload declares the row-level-security-bypassing role. */
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const SUPABASE_SECRET_KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]{8,}/;

const declaresServiceRole = (token: string): boolean => {
  const payload = token.split('.')[1];
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
};

/**
 * Binary assets, excluded from the repository-wide credential scan below.
 * A credential cannot survive in one in a form these text patterns would match,
 * and reading them is nearly all of the scan's cost: `art-source/` alone is 363
 * images, untracked but not ignored, and it grows with the art.
 */
const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|avif|ico|mp3|ogg|wav|m4a|mp4|webm|woff2?|ttf|otf|eot|zip|gz|pdf|psd|aseprite)$/i;

const parseEnvNames = (contents: string): string[] =>
  contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
    .map((line) => line.slice(0, line.indexOf('=')).trim());

describe('local Supabase stack configuration', () => {
  const config = readProjectFile('supabase/config.toml');

  it('is committed and names this project rather than the directory', () => {
    expect(config).toContain('project_id = "cat-mine-idle"');
  });

  it('pins the ports the verification script and documentation assume', () => {
    expect(config).toMatch(/\[api\][\s\S]*?port = 54321/);
    expect(config).toMatch(/\[db\][\s\S]*?port = 54322/);
    expect(config).toMatch(/\[studio\][\s\S]*?port = 54323/);
  });

  it('keeps the migration and seed pipeline enabled so a reset applies them', () => {
    expect(config).toMatch(/\[db\.migrations\]\n(?:#[^\n]*\n)*enabled = true/);
    expect(config).toMatch(/\[db\.seed\]\n(?:#[^\n]*\n)*enabled = true/);
  });

  it('serves save-sync without platform JWT verification', () => {
    // §10.1 of the save-sync protocol requires GET /v1/health to answer an
    // unauthenticated caller. Platform-level verification would reject it
    // before the handler ran; the authenticated routes verify their own token.
    expect(config).toMatch(/\[functions\.save-sync\]\nenabled = true\nverify_jwt = false/);
  });

  it('holds at least one migration, every one named by ordering timestamp', () => {
    // Forward-only migrations apply in filename order, so the name is the
    // ordering contract. Step 5 adds the schema migrations to this directory.
    const migrations = readdirSync(join(PROJECT_ROOT, 'supabase', 'migrations'))
      .filter((entry) => entry.endsWith('.sql'));

    expect(migrations.length).toBeGreaterThan(0);
    for (const migration of migrations) {
      expect(migration).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });
});

/** True when git would ignore `path`, whether or not the file exists. */
const isIgnored = (path: string): boolean =>
  spawnSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: PROJECT_ROOT }).status === 0;

describe('secret handling', () => {
  const envExample = readProjectFile('.env.example');

  it('ignores every local environment file but the template', () => {
    // Asserted through git rather than through the text of `.gitignore`: a
    // commented-out rule still reads as present in the file.
    expect(isIgnored('.env.local')).toBe(true);
    expect(isIgnored('.env')).toBe(true);
    expect(isIgnored('.env.production.local')).toBe(true);
    expect(isIgnored('.env.example')).toBe(false);
  });

  it('ignores Supabase CLI local state but not its committed configuration', () => {
    expect(isIgnored('supabase/.temp/cli-latest')).toBe(true);
    expect(isIgnored('supabase/.branches/current-branch')).toBe(true);
    expect(isIgnored('supabase/config.toml')).toBe(false);
    expect(isIgnored('supabase/migrations/20260908120000_bootstrap_platform_requirements.sql')).toBe(
      false,
    );
  });

  it('never gives a privileged credential a VITE_ prefix', () => {
    // Vite inlines VITE_-prefixed variables into the browser bundle, so the
    // prefix is the whole boundary between a public value and a secret one.
    const privileged = ['SERVICE_ROLE', 'BOT_TOKEN', 'PEPPER', 'SECRET'];
    for (const name of parseEnvNames(envExample)) {
      if (privileged.some((fragment) => name.includes(fragment))) {
        expect(name.startsWith('VITE_')).toBe(false);
      }
    }
  });

  it('declares the server-only names the bundle scan enforces', () => {
    const names = parseEnvNames(envExample);
    expect(names).toContain('VITE_SUPABASE_URL');
    expect(names).toContain('VITE_SUPABASE_ANON_KEY');
    expect(names).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('holds placeholders rather than credentials', () => {
    expect(envExample).not.toMatch(SUPABASE_SECRET_KEY_PATTERN);
    expect(envExample.match(JWT_PATTERN) ?? []).toHaveLength(0);
  });

  it('has no privileged credential in any tracked file', () => {
    // Tracked files plus untracked-but-not-ignored ones: a credential pasted
    // into a new file must fail before it is ever committed.
    const listed = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: PROJECT_ROOT, encoding: 'utf8' },
    );
    const tracked = listed
      .split('\n')
      .filter(
        (path) =>
          path !== '' && !path.startsWith('public/assets/') && !BINARY_EXTENSIONS.test(path),
      );

    const offenders: string[] = [];
    for (const path of tracked) {
      let contents: string;
      try {
        contents = readFileSync(join(PROJECT_ROOT, path), 'utf8');
      } catch (error) {
        // Not skipped silently: a file this scan could not read is a file it
        // cannot vouch for, and "unscanned" must never report as "clean".
        offenders.push(`${path}: unreadable (${(error as Error).message})`);
        continue;
      }
      if (SUPABASE_SECRET_KEY_PATTERN.test(contents)) {
        offenders.push(`${path}: sb_secret_ key`);
      }
      for (const token of contents.match(JWT_PATTERN) ?? []) {
        if (declaresServiceRole(token)) {
          offenders.push(`${path}: service_role JWT`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('save-sync Edge Function', () => {
  const source = readProjectFile('supabase/functions/save-sync/index.ts');

  it('never reads the service-role key', () => {
    // The health route answers unauthenticated callers. It must not hold the
    // credential that bypasses row-level security and is, from Step 15, the
    // only writer of `saves`.
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toContain('SECRET_KEY');
  });

  it('answers only the routes the protocol defines', () => {
    expect(source).toContain("const HEALTH_ROUTE = '/v1/health'");
  });

  it('does not answer a configuration mistake with a retryable code', () => {
    // `service_unavailable` tells the client to retry until it succeeds. A
    // function deployed without SUPABASE_URL/SUPABASE_ANON_KEY never will, so
    // answering it would have every client back off forever against a database
    // that is perfectly healthy.
    expect(source).toContain("return errorResponse(500, 'server_error', 'Function is not configured.')");
  });

  it('carries Retry-After on the retryable failure it can return', () => {
    // §4 tells the client to retry `service_unavailable` *after* `Retry-After`,
    // so the response has to actually carry the header.
    expect(source).toContain("'retry-after'");
    expect(source).toMatch(/service_unavailable[\s\S]{0,120}retryAfterSeconds/);
  });

  it('uses codes from the protocol error vocabulary', () => {
    // §4 defines the whole vocabulary; `not_found` and `method_not_allowed`
    // are deliberately absent from it.
    expect(source).not.toContain("'not_found'");
    expect(source).not.toContain("'method_not_allowed'");
    expect(source).toContain("'malformed_request'");
    expect(source).toContain("'service_unavailable'");
    expect(source).toContain("'server_error'");
  });
});

describe('the platform tables migration', () => {
  const source = readProjectFile(
    'supabase/migrations/20260908130000_create_platform_tables.sql',
  );

  it('pins the search path of the shared updated_at trigger', () => {
    // Unqualified `now()` in a function without a pinned search_path resolves
    // against the caller's — Supabase's `function_search_path_mutable` lint.
    // Migrations are forward-only, so this is fixed at creation or not at all.
    expect(source).toContain("set search_path = ''");
    expect(source).toContain('new.updated_at = pg_catalog.now();');
  });

  it('withholds leaderboard user_id at the grant level', () => {
    // The select policy admits every row and PostgREST lets the caller pick its
    // columns, so `?select=user_id` against a world-readable table would
    // enumerate every publishing player's auth.users id unauthenticated.
    expect(source).toContain('revoke select on public.leaderboard_entries from anon, authenticated;');
    const grant = source.slice(source.indexOf('grant select (board_key'));
    expect(grant.slice(0, grant.indexOf(';'))).not.toContain('user_id');
  });
});

describe('the Step 4 verification script', () => {
  const source = readProjectFile('scripts/verify-server-stack.mjs');

  it('reads the expected migrations from disk rather than a hand-kept list', () => {
    // A hand-maintained list someone forgets to extend still reports PASS while
    // checking nothing about the migration that was just added.
    expect(source).toContain('function readExpectedMigrations()');
    expect(source).toContain('readdirSync(MIGRATIONS_DIRECTORY)');
    expect(source).not.toContain('const EXPECTED_MIGRATIONS = [');
  });

  it('fails rather than passing vacuously when no migration is found', () => {
    expect(source).toContain("'Committed migrations were found on disk'");
  });

  it('asks the Supabase CLI for JSON explicitly', () => {
    // The CLI's default output is a text table; it emits JSON on its own only
    // when it auto-detects an agent. Without the flag this check parses nothing
    // in an ordinary terminal and reports a healthy stack as a missing
    // migration.
    expect(source).toContain("'migration', 'list', '--local', '--output-format', 'json'");
  });

  it('reports an unreadable CLI response as its own failure', () => {
    // Conflating "could not parse" with "migration not applied" sends whoever
    // hits it to debug the database instead of the parser.
    expect(source).toContain("report(false, 'Migration list is readable'");
  });

  it('never slices a JSON payload it did not find', () => {
    expect(source).toContain("if (start === -1) {");
  });
});

describe('verification wiring', () => {
  const packageJson = JSON.parse(readProjectFile('package.json'));

  it('scans the build output for secrets inside the standard gate', () => {
    const verify: string = packageJson.scripts.verify;
    expect(verify).toContain('npm run scan:secrets');
    expect(verify.indexOf('npm run build')).toBeLessThan(verify.indexOf('npm run scan:secrets'));
  });

  it('exposes the local stack commands the documentation names', () => {
    for (const script of ['supabase:start', 'supabase:stop', 'supabase:reset', 'verify:server', 'scan:secrets']) {
      expect(packageJson.scripts[script]).toBeTruthy();
    }
  });
});
