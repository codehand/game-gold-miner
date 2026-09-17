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
const FUNCTIONS_DIRECTORY = join(PROJECT_ROOT, 'supabase', 'functions');

const readProjectFile = (relativePath: string): string =>
  readFileSync(join(PROJECT_ROOT, relativePath), 'utf8');

/**
 * Every deployable Edge Function, read from disk rather than hand-listed
 * (server-milestone Step 7 review) — `_shared/` holds library code with no
 * `index.ts` of its own and no `config.toml` entry, so it is excluded rather
 * than exempted by name.
 */
const edgeFunctionNames = (): string[] =>
  readdirSync(FUNCTIONS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name)
    .sort();

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

/**
 * Extracts one `[section]`'s own text from a TOML file, stopping at the
 * next `[section]` header rather than the next occurrence of `endMarker`
 * anywhere later in the file. A lazy regex like
 * `/\[auth\.email\][\s\S]*?\nfoo = false\b/` would happily cross into a
 * *later*, unrelated section (e.g. `[auth.sms]`) if that section also
 * contains a line matching the tail pattern — which is exactly how an
 * earlier version of the `enable_signup` test below passed vacuously
 * against a mutated `[auth.email]` block, because `[auth.sms]` further
 * down the file happens to default `enable_signup` to `false` too.
 */
function extractTomlSection(toml: string, sectionHeader: string): string {
  const start = toml.indexOf(sectionHeader);
  if (start === -1) {
    throw new Error(`extractTomlSection: section not found: ${sectionHeader}`);
  }
  const nextSection = toml.indexOf('\n[', start + sectionHeader.length);
  return nextSection === -1 ? toml.slice(start) : toml.slice(start, nextSection);
}

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

  it.each(edgeFunctionNames())(
    '%s is declared with an explicit enabled/verify_jwt pair',
    (name) => {
      // Read from disk rather than hardcoded per function (server-milestone
      // Step 7 review), the same fix Step 4's review applied to
      // `EXPECTED_MIGRATIONS`: a function added without its own config block
      // would otherwise go unchecked rather than failing. All three functions
      // that exist today set `verify_jwt = false` and verify by hand inside
      // the handler instead; a function that legitimately needs platform
      // verification is a deliberate exception this test must gain, not a
      // silent gap in it.
      expect(config).toMatch(
        new RegExp(`\\[functions\\.${name}\\]\\nenabled = true\\nverify_jwt = false`),
      );
    },
  );

  it('enables manual linking, without which Step 10 linkIdentity() is refused', () => {
    // `linkIdentity()` is how a signed-in guest attaches Google while keeping
    // the same `auth.users` id (`src/platform/web/googleSignIn.ts`); Supabase
    // refuses it outright with "Manual linking is disabled" unless this flag
    // is on.
    expect(config).toMatch(/\nenable_manual_linking = true\b/);
  });

  it('configures the Google OAuth provider from environment substitution, never a literal secret', () => {
    expect(config).toMatch(
      /\[auth\.external\.google\]\nenabled = true\nclient_id = "env\(GOOGLE_CLIENT_ID\)"\nsecret = "env\(GOOGLE_CLIENT_SECRET\)"/,
    );
  });

  it('disables public email signup, closing the Telegram placeholder-email pre-account-takeover', () => {
    // Critical finding, server-milestone Step 12: `telegram-sign-in` maps a
    // Telegram user to the deterministic `telegram-<id>@telegram.invalid`
    // and relies on `admin.generateLink` to find-or-create that
    // `auth.users` row. With public email signup open, an attacker who
    // knows a Telegram id could `POST /auth/v1/signup` with that exact
    // email and a password of their own choosing before the real user ever
    // signs in — `enable_confirmations = false` lets it complete
    // immediately, no delivery to the unreachable `.invalid` address
    // required — and `generateLink` would then hand the real Telegram user
    // a session into the attacker's own, password-protected account.
    // Reproduced live against the local stack and fixed by this flag;
    // nothing in this codebase uses `signUp`/`signInWithPassword`, so
    // closing it costs nothing, and `admin.generateLink`/`verifyOtp` are
    // admin/OTP paths this flag does not gate.
    expect(extractTomlSection(config, '[auth.email]')).toMatch(/\nenable_signup = false\b/);
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
    expect(names).toContain('GOOGLE_CLIENT_ID');
    expect(names).toContain('GOOGLE_CLIENT_SECRET');
    expect(names).toContain('TELEGRAM_BOT_TOKEN');
    expect(names).toContain('RECOVERY_CODE_PEPPER');
    expect(names).toContain('RECOVERY_CODE_TEST_RESET_TOKEN');
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

describe('every Edge Function', () => {
  const functionNames = edgeFunctionNames();

  it('found more than one function, so the checks below cover something real', () => {
    // Guards the loop the way Step 4's review made every "reads everything,
    // finds nothing wrong" check assert it actually read something — an
    // empty function list would make every `it.each` below pass vacuously.
    expect(functionNames.length).toBeGreaterThan(1);
  });

  // `telegram-sign-in` (Step 12) is the first function that legitimately
  // needs the service-role key: minting a session for a caller who isn't
  // signed in yet requires `admin.generateLink`, which only the service
  // role can call. `save-sync` (Step 16) is the second: `saves` denies every
  // client write (Step 15), so accepting an upload needs it too.
  // `recovery-code` (Step 14) is the third: `recovery_codes` carries no
  // policy at all, and minting a session for a redeemed code's owner needs
  // `admin.getUserById`/`updateUserById`/`generateLink`. All three are
  // excluded from the blanket check below and given their own positive
  // assertion instead, exactly as this test's own prior comment
  // anticipated — a future function needing it must add its own exception
  // here too, not find this check silently no longer covering it.
  const FUNCTIONS_ALLOWED_THE_SERVICE_ROLE_KEY = ['telegram-sign-in', 'save-sync', 'recovery-code'];

  it.each(functionNames.filter((name) => !FUNCTIONS_ALLOWED_THE_SERVICE_ROLE_KEY.includes(name)))(
    '%s never reads the service-role key',
    (name) => {
      // True of every other function today: the health and portability
      // routes answer unauthenticated callers, and whoami-check verifies
      // identity through the caller's own token. None needs the credential
      // that bypasses row-level security.
      const source = readProjectFile(`supabase/functions/${name}/index.ts`);
      expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(source).not.toContain('SECRET_KEY');
    },
  );

  it('telegram-sign-in does read the service-role key, and only for admin.generateLink', () => {
    const source = readProjectFile('supabase/functions/telegram-sign-in/index.ts');
    expect(source).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(source).toContain('admin.generateLink');
  });

  it('save-sync does read the service-role key, and only to write saves through a compare-and-swap and append one audit row', () => {
    const source = readProjectFile('supabase/functions/save-sync/index.ts');
    expect(source).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    // A 2026-09-12 review found a blind `upsert` here let two concurrent
    // uploads both win, silently discarding one and breaking §5's monotonic
    // revision guarantee — fixed with an atomic insert (first write) or a
    // conditional `update ... where revision = ?` (subsequent write),
    // neither of which is a plain `upsert` any more.
    expect(source).not.toContain('.upsert(');
    expect(source).toContain("admin.from('saves').insert(");
    expect(source).toMatch(/admin\s*\.from\('saves'\)\s*\.update\(/);
    // Step 24: the service-role key is also the only way to append to
    // `save_audit`, which carries no RLS policy for any client role.
    expect(source).toContain("admin.from('save_audit').insert(");
  });

  it('recovery-code does read the service-role key, and only to rotate/redeem codes and mint a session', () => {
    const source = readProjectFile('supabase/functions/recovery-code/index.ts');
    expect(source).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    // Redemption is an atomic compare-and-swap, the same lesson save-sync's
    // own review just taught: never a read-then-write.
    expect(source).toMatch(/admin\s*\.from\('recovery_codes'\)\s*\.update\(/);
    expect(source).toContain('admin.auth.admin.generateLink');
    expect(source).toContain('admin.auth.admin.getUserById');
    expect(source).toContain('admin.auth.admin.updateUserById');
  });

  it('recovery-code rotates a code through a single RPC, not two separate non-transactional statements', () => {
    // A 2026-09-12 review found rotation was a separate `.update()` (revoke)
    // then `.insert()` (new code) — two independent PostgREST requests, so
    // an insert failure after a successful revoke could strand a user with
    // no active code, and two concurrent rotations for the same user could
    // both pass the revoke before racing the insert. `rotate_recovery_code`
    // (`supabase/migrations/20260913090000_recovery_code_rotation_rpc.sql`)
    // wraps both statements in one Postgres function/transaction.
    const source = readProjectFile('supabase/functions/recovery-code/index.ts');
    expect(source).toContain("admin.rpc('rotate_recovery_code'");
    expect(source).not.toContain("admin.from('recovery_codes').insert(");

    const migration = readProjectFile('supabase/migrations/20260913090000_recovery_code_rotation_rpc.sql');
    expect(migration).toContain('create function public.rotate_recovery_code(p_user_id uuid, p_code_hash text)');
    expect(migration).toContain('insert into public.recovery_codes (user_id, code_hash)');
  });

  it('recovery-code reverts a redemption rather than burning the code when session minting fails', () => {
    // A 2026-09-12 review found a failed mint after a successful redemption
    // permanently destroyed the account: the code was already spent and no
    // session was ever delivered. `revertRecoveryCodeRedemption` clears
    // `redeemed_at` so the same code stays usable. A follow-up 2026-09-13
    // finding (1c) moved that clear into its own RPC, since a `generate`
    // landing in the narrow window before this runs could otherwise collide
    // with the one-active-code-per-user index.
    const source = readProjectFile('supabase/functions/recovery-code/index.ts');
    expect(source).toContain('revertRecoveryCodeRedemption');
    expect(source).toContain("admin.rpc('revert_recovery_code_redemption'");

    const migration = readProjectFile('supabase/migrations/20260913090100_recovery_code_revert_rpc.sql');
    expect(migration).toContain('create function public.revert_recovery_code_redemption(p_code_hash text)');
    expect(migration).toContain('set redeemed_at = null');
  });

  it('recovery-code RPCs are execute-restricted to service_role at the grant layer, belt-and-braces over RLS', () => {
    // A 2026-09-13 review finding (optional hardening): `recovery_codes`
    // RLS already makes both RPCs inert for anon/authenticated, but
    // Supabase's own bootstrap grants `execute` to anon/authenticated
    // individually (not merely through `public`) when a function is
    // created, so both need revoking by name, not just `from public`.
    const migration = readProjectFile('supabase/migrations/20260913090200_recovery_code_rpc_grants.sql');
    expect(migration).toMatch(
      /revoke execute on function public\.rotate_recovery_code\(uuid, text\) from public, anon, authenticated;/,
    );
    expect(migration).toContain('grant execute on function public.rotate_recovery_code(uuid, text) to service_role;');
    expect(migration).toMatch(
      /revoke execute on function public\.revert_recovery_code_redemption\(text\) from public, anon, authenticated;/,
    );
    expect(migration).toContain(
      'grant execute on function public.revert_recovery_code_redemption(text) to service_role;',
    );
  });

  it("recovery-code's rate limiter never buckets a caller with no X-Forwarded-For into a shared address", () => {
    // A 2026-09-12 review found the prior fallback ('unknown' for every
    // header-less caller) was a global-denial footgun, not a safety margin —
    // one such caller could throttle every other one. `null` now means "let
    // this request through," not "share a bucket."
    const source = readProjectFile('supabase/functions/recovery-code/index.ts');
    expect(source).not.toContain("'unknown'");
    expect(source).toContain('address: string | null');
  });

  it('the shared rate-limit sweep is gated by store size, not run on every request', () => {
    // A 2026-09-13 review finding: sweeping the whole map on every request
    // is O(n) per request under the exact rotated-address attack it exists
    // to bound, trading unbounded memory for unbounded (quadratic) CPU.
    // Step 25 moved the mechanism into `_shared/rateLimit.ts`, so the
    // assertion follows it there rather than being dropped — the property it
    // protects is unchanged, and `_shared/rateLimit.test.ts` now pins the
    // behaviour (a store that stays bounded under 200 rotating keys) as well
    // as this grep pins the shape.
    const shared = readProjectFile('supabase/functions/_shared/rateLimit.ts');
    expect(shared).toContain('pruneSizeThreshold');
    expect(shared).toMatch(/store\.size > pruneSizeThreshold/);

    // Each limited function still carries its own threshold and passes it in,
    // rather than inheriting the shared default silently.
    const source = readProjectFile('supabase/functions/recovery-code/index.ts');
    expect(source).toContain('RATE_LIMIT_PRUNE_SIZE_THRESHOLD');
    expect(source).toMatch(/pruneSizeThreshold: RATE_LIMIT_PRUNE_SIZE_THRESHOLD/);
  });

  it('recovery-code gates its test-only rate-limit reset route behind a token unset in any real deployment', () => {
    // A 2026-09-13 review finding: the integration suite shares one
    // real, gateway-observed rate-limit bucket across its whole run once
    // the limiter reads the trusted last hop, so a re-run inside the
    // 60-second window fails unrelated tests with 429 unless something can
    // reset that shared state between runs.
    const source = readProjectFile('supabase/functions/recovery-code/index.ts');
    expect(source).toContain('test-only-reset-rate-limit');
    expect(source).toContain("Deno.env.get('RECOVERY_CODE_TEST_RESET_TOKEN')");
    // Step 25: the reset now clears both of this function's limiter stores
    // through the shared module rather than one in-file Map. `index.test.ts`'s
    // "the reset route really clears it" proves the behaviour; this pins that
    // the route is still wired to it.
    expect(source).toContain('RECOVERY_CODE_RATE_LIMITERS.resetRateLimitState()');
    expect(source).toMatch(
      /resetRateLimitState: \(\) => \{[\s\S]{0,120}redemptionStore\.clear\(\);[\s\S]{0,80}generateStore\.clear\(\);/,
    );

    const envExample = readProjectFile('.env.example');
    expect(envExample).toContain('RECOVERY_CODE_TEST_RESET_TOKEN');
  });
});

describe('save-sync Edge Function', () => {
  const source = readProjectFile('supabase/functions/save-sync/index.ts');

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
    // so the response has to actually carry the header. The header itself is
    // set in `../_shared/http.ts` (server-milestone Step 7 extracted the
    // envelope for reuse); the call site naming the retryable code and the
    // seconds to wait still lives here.
    const sharedHttpSource = readProjectFile('supabase/functions/_shared/http.ts');
    expect(sharedHttpSource).toContain("'retry-after'");
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

describe('whoami-check Edge Function', () => {
  const source = readProjectFile('supabase/functions/whoami-check/index.ts');

  it('does not answer a server misconfiguration as an authentication failure', () => {
    // A caller cannot fix a missing SUPABASE_URL/SUPABASE_ANON_KEY by
    // presenting a different token, so a missing one must not produce the
    // same 401 a genuinely bad token gets — every caller, valid token or not,
    // would otherwise see "unauthenticated" and a client that treats 401 as
    // "sign out and re-authenticate" would sign every user out in a loop
    // against a database that was never the problem. This is the identical
    // distinction save-sync's own "does not answer a configuration mistake
    // with a retryable code" test protects, applied to whoami-check's
    // mechanism: throwing, so `Deno.serve`'s catch turns it into `500
    // server_error`, rather than returning `null`, which `handleWhoAmI` reads
    // as "invalid token" and answers 401.
    const guardClause = source.slice(source.indexOf('if (!supabaseUrl || !anonKey)'));
    const guardBody = guardClause.slice(0, guardClause.indexOf('}') + 1);

    expect(guardBody).toMatch(/throw new Error/);
    expect(guardBody).not.toContain('return null');
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

/**
 * Every per-request budget the integration suite declares as a literal, e.g.
 * `signal: AbortSignal.timeout(20_000)`. Non-literal budgets — the warm-up
 * hooks' own, deliberately much shorter, per-attempt constants — are not part
 * of this maximum, because they are not what a hook or a test waits on.
 */
function integrationPerRequestBudgets(): number[] {
  const directory = join(PROJECT_ROOT, 'tests', 'server-integration');
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.ts'))
    .flatMap((entry) => [
      ...readFileSync(join(directory, entry), 'utf8').matchAll(
        /AbortSignal\.timeout\((\d[\d_]*)\)/g,
      ),
    ])
    .map((match) => Number(match[1].replace(/_/g, '')));
}

describe("the server-integration suite's own timeouts", () => {
  // A 2026-09-16 CI finding: the config set only `testTimeout`, which leaves
  // `hookTimeout` at Vitest's own 10 s default — below the 20 s per-request
  // budget the suite's `fetch` calls declare, and below the same bug the
  // config's own comment already records for `testTimeout` (found
  // 2026-09-12). A hook is killed 10 s in, before the request it is waiting on
  // has had the room its own code asked for.
  const config = readProjectFile('vitest.server-integration.config.ts');

  const declaredHookTimeoutMs = (): number => {
    const match = config.match(/hookTimeout:\s*([\d_]+)/);
    return match === null ? Number.NaN : Number(match[1].replace(/_/g, ''));
  };

  it('sets hookTimeout at all, rather than inheriting Vitest s 10 s default', () => {
    expect(declaredHookTimeoutMs()).not.toBeNaN();
  });

  it('sets hookTimeout at or above every per-request budget the suite declares', () => {
    const budgets = integrationPerRequestBudgets();

    // Anti-vacuity: an empty scan would make the comparison below pass while
    // checking nothing — the same guard this file already applies to its
    // read-from-disk lists.
    expect(budgets.length).toBeGreaterThan(0);
    // The suite's documented per-request budget, named by the AC this pins.
    expect(Math.max(...budgets)).toBeGreaterThanOrEqual(20_000);
    expect(declaredHookTimeoutMs()).toBeGreaterThanOrEqual(Math.max(...budgets));
  });
});

describe('the Edge Function warm-up pass (2026-09-16 CI cold-start fix)', () => {
  it('runs after the health and portability checks and before the suites', () => {
    // The order is the point: a cold worker must have answered once before
    // anything with a budget of its own starts asking it to be fast.
    const verify = readProjectFile('scripts/verify-server-stack.mjs');
    const portability = verify.indexOf('await checkCorePortability()');
    const warmup = verify.indexOf('await warmFunctionsBeforeSuites()');
    const integration = verify.indexOf("'test:server-integration'");

    expect(portability).toBeGreaterThan(-1);
    expect(warmup).toBeGreaterThan(portability);
    expect(integration).toBeGreaterThan(warmup);
  });

  it('reads the function list from disk rather than a hand-kept list', () => {
    const helper = readProjectFile('scripts/warm-edge-functions.mjs');

    expect(helper).toContain('function readEdgeFunctionNames(');
    expect(helper).toContain('readdirSync(functionsDirectory');
    expect(helper).toContain("entry.name !== '_shared'");
  });

  it('warms recovery-code before the rate-limit reset that was its first request', () => {
    // `recovery-code` was the one function no warm-up covered, so
    // `beforeAll(resetRateLimitBucket)` — one shot, a 20 s budget, no retry —
    // was the run's first request to it. The warm-up must precede it, and must
    // not itself touch the shared bucket: it goes through the same refused
    // probe every other function gets.
    const source = readProjectFile('tests/server-integration/recovery-code.integration.test.ts');

    expect(source).toMatch(/beforeAll\(async \(\) => \{[\s\S]*warmEdgeFunction\('recovery-code'/);
    expect(source).toContain('WARMUP_HOOK_TIMEOUT_MS');
    expect(source.indexOf("warmEdgeFunction('recovery-code'")).toBeLessThan(
      source.indexOf('beforeAll(resetRateLimitBucket)'),
    );
  });
});

/**
 * Extracts one top-level boot block from `src/main.ts` by a pair of unique
 * anchor strings, rather than by counting `void supabaseClientPromise`
 * occurrences — Step 12 added a third independent consumer of that promise
 * before the two existing ones, so an order-based index would silently pick
 * up the wrong block instead of failing loudly.
 */
function extractMainBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`extractMainBlock: start marker not found: ${startMarker}`);
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    throw new Error(`extractMainBlock: end marker not found after start: ${endMarker}`);
  }
  return source.slice(start, end);
}

describe('the guest-session bootstrap in src/main.ts', () => {
  // A static-source assertion, deliberately, and for the reason this file
  // already applies the pattern to `save-sync`/`whoami-check`: the contract
  // lives in `src/main.ts`, a module of top-level side effects that no unit
  // test can import, and the only behavioural test of it —
  // `tests/production/production-smoke.spec.ts`'s lazy-chunk spec — can run
  // solely against a *configured* build. CI has no `.env.local`, so that build
  // eliminates the SDK entirely and the spec skips. This runs on every push.
  const mainSource = readProjectFile('src/main.ts');
  // Step 12: this is now the `else` branch of "Telegram replaces the guest
  // path entirely" — it still runs unconditionally in every test/build today,
  // since `readTelegramInitData()` always resolves `null` with no Mini App
  // host in existence.
  const bootstrap = extractMainBlock(mainSource, '} else {', "\n/**\n * Server-milestone Step 10");

  it('is never awaited before the game boots', () => {
    // `void`, not `await`: identity resolution must not delay the first frame.
    expect(bootstrap).toContain('void supabaseClientPromise');
    expect(bootstrap).not.toContain('await supabaseClientPromise');
  });

  it('catches a rejected client promise instead of leaving it unhandled', () => {
    // `ensureGuestSession`'s own try/catch covers only the collaborator calls
    // made *inside* it, not `createSupabaseClient`'s dynamic `import()` one
    // level above — which can reject on a flaky network or a stale chunk hash
    // after a redeploy. Without a `.catch` here that rejection escapes the
    // `void`-ed chain as an unhandled rejection, breaking the "this never
    // throws" contract `src/platform/web/guestSession.ts` documents for the
    // whole bootstrap. A 2026-09-09 review found exactly that defect.
    expect(bootstrap).toContain('.catch(');
    expect(bootstrap.indexOf('.catch(')).toBeLessThan(
      bootstrap.lastIndexOf('.then('),
    );
  });

  it('publishes the diagnostic without the live access token', () => {
    // The dev-only `data-guest-session` attribute carries status and user id
    // only: a live credential in the DOM bought no coverage the client's own
    // storage did not already provide.
    expect(bootstrap).toContain('toPublicGuestSessionDiagnostic');
    expect(mainSource).not.toMatch(/dataset\.guestSession\s*=\s*JSON\.stringify\(result\)/);
  });
});

describe('the Telegram sign-in bootstrap in src/main.ts (Step 12)', () => {
  const mainSource = readProjectFile('src/main.ts');
  const bootstrap = extractMainBlock(mainSource, 'if (telegramInitData !== null) {', '} else {');

  it('is never awaited before the game boots', () => {
    expect(bootstrap).toContain('void supabaseClientPromise');
    expect(bootstrap).not.toContain('await supabaseClientPromise');
  });

  it('is a third, independent consumer of supabaseClientPromise, and catches its own rejection', () => {
    // Same class of bug Step 10's own DEV hook review already found once:
    // a `.catch` on one chain does not settle another chain derived from
    // the same promise.
    expect(bootstrap).toContain('.catch(');
    expect(bootstrap.indexOf('.catch(')).toBeLessThan(bootstrap.lastIndexOf('.then('));
  });

  it('runs signInWithTelegram, not ensureGuestSession — Telegram replaces the guest path entirely', () => {
    expect(bootstrap).toContain('signInWithTelegram(');
    expect(bootstrap).not.toContain('ensureGuestSession(');
  });

  it('is gated on readTelegramInitData computed before either boot chain', () => {
    const telegramCheck = mainSource.indexOf('if (telegramInitData !== null) {');
    const computed = mainSource.indexOf('const telegramInitData = readTelegramInitData();');
    expect(computed).toBeGreaterThan(-1);
    expect(computed).toBeLessThan(telegramCheck);
  });
});

describe('the Step 10 DEV account hook in src/main.ts', () => {
  // `supabaseClientPromise` now has three independent consumers — the guest
  // and Telegram boot chains above, and this one — and a `.catch` on one
  // chain does not settle another's derived promise. A review of the first
  // implementation found exactly that: this chain rejected with no handler
  // of its own, reintroducing the same class of unhandled rejection Step 8
  // had already fixed once, DEV-only.
  const mainSource = readProjectFile('src/main.ts');
  const hookBootstrap = extractMainBlock(
    mainSource,
    'if (import.meta.env.DEV) {',
    "\n/**\n * Drops the live access token",
  );

  it('catches a rejected client promise instead of leaving it unhandled', () => {
    expect(hookBootstrap).toContain('.catch(');
    expect(hookBootstrap.indexOf('.catch(')).toBeGreaterThan(
      hookBootstrap.indexOf('.then('),
    );
  });

  it('passes the calling origin as redirectTo, so the OAuth return trip lands back where it started', () => {
    // Without this, GoTrue falls back to `site_url`, silently bouncing a
    // player who opened `localhost:5173` (an origin `.env.example` tells them
    // to authorize) to `127.0.0.1:5173` mid-flow, stranding their pre-link
    // session in the first origin's storage.
    expect(hookBootstrap).toContain('window.location.origin');
  });
});

describe('the Step 13 Google identity-collision hook in src/main.ts', () => {
  // Same DEV-only-hook block Step 10 established, extended rather than
  // duplicated: `beginGoogleAccountSwitch` and the collision diagnostic are
  // both set from the same `client` already in scope there.
  const mainSource = readProjectFile('src/main.ts');
  const hookBootstrap = extractMainBlock(
    mainSource,
    'if (import.meta.env.DEV) {',
    "\n/**\n * Drops the live access token",
  );

  it('exposes beginGoogleAccountSwitch alongside beginGoogleSignIn', () => {
    expect(hookBootstrap).toContain('beginGoogleAccountSwitch: () =>');
    expect(hookBootstrap).toContain('beginGoogleAccountSwitch(client?.auth ?? null, window.location.origin)');
  });

  it('publishes the collision diagnostic from detectGoogleIdentityCollision', () => {
    expect(hookBootstrap).toContain('app.dataset.googleIdentityCollision');
    expect(hookBootstrap).toContain('detectGoogleIdentityCollision(client?.auth ?? null)');
  });
});

describe('the Step 14 recovery-code hooks in src/main.ts', () => {
  const mainSource = readProjectFile('src/main.ts');
  const hookBootstrap = extractMainBlock(
    mainSource,
    'if (import.meta.env.DEV) {',
    "\n/**\n * Drops the live access token",
  );

  it('exposes generateRecoveryCode and redeemRecoveryCode alongside the Google hooks', () => {
    expect(hookBootstrap).toContain('generateRecoveryCode: () =>');
    expect(hookBootstrap).toContain('redeemRecoveryCode: async (code: string) =>');
  });

  it('reconciles the redeeming device only when redemption actually succeeded', () => {
    const redeemHook = hookBootstrap.slice(hookBootstrap.indexOf('redeemRecoveryCode: async (code: string) =>'));
    const redeemHookBody = redeemHook.slice(0, redeemHook.indexOf('\n      };'));

    expect(redeemHookBody).toContain("result.status === 'redeemed'");
    expect(redeemHookBody).toContain('triggerCloudSaveReconcile();');
  });
});

describe('the Step 17 cloud-save reconcile trigger in src/main.ts', () => {
  const mainSource = readProjectFile('src/main.ts');

  it('is triggered from both sign-in chains, only once each resolves signed-in', () => {
    const telegramBootstrap = extractMainBlock(mainSource, 'if (telegramInitData !== null) {', '} else {');
    const guestBootstrap = extractMainBlock(mainSource, '} else {', "\n/**\n * Server-milestone Step 10");

    // Step 21 records `sessionIsNew` between the `signed-in` check and the
    // trigger, so the two are no longer adjacent.
    expect(telegramBootstrap).toMatch(/status === 'signed-in'\)\s*\{[\s\S]*triggerCloudSaveReconcile\(\);/);
    expect(guestBootstrap).toMatch(/status === 'signed-in'\)\s*\{[\s\S]*triggerCloudSaveReconcile\(\);/);
  });

  it('catches a rejected reconcile instead of leaving it unhandled', () => {
    const trigger = mainSource.slice(mainSource.indexOf('function triggerCloudSaveReconcile'));
    const body = trigger.slice(0, trigger.indexOf('\n}\n') + 3);

    expect(body).toContain('.catch(');
    expect(body).toContain('void runCloudSaveReconcile()');
  });

  it('unbinds the save lifecycle before reloading, so pagehide cannot journal the stale pre-adoption document (2026-09-13 review)', () => {
    const runFn = mainSource.slice(mainSource.indexOf('async function runCloudSaveReconcile'));
    const body = runFn.slice(0, runFn.indexOf('\n}\n') + 3);
    const reloadCallback = body.slice(body.indexOf('reload: () => {'), body.indexOf('},', body.indexOf('reload: () => {')));

    expect(reloadCallback).toMatch(/unbindSaveLifecycle\?\.\(\)/);
    expect(reloadCallback.indexOf('unbindSaveLifecycle?.()')).toBeLessThan(reloadCallback.indexOf('window.location.reload()'));
  });
});

describe('the Step 18 conflict policy in src/', () => {
  const reconcileSource = readProjectFile('src/platform/web/cloudSaveReconcile.ts');
  const policySource = readProjectFile('src/persistence/saveConflictPolicy.ts');

  it('applies the single §7 dominance policy rather than keeping a second, narrower one', () => {
    // Step 17 shipped a placeholder ("does each side have any progress at
    // all") and Step 18 replaces it. Both callers must share the one predicate
    // so an upload `409` and a boot reconcile can never disagree.
    expect(reconcileSource).toContain('resolveSaveConflict');
    expect(reconcileSource).not.toContain('reconcileGuestUpgrade');
    expect(policySource).toContain('export function compareProgress');
    expect(policySource).toContain('export function resolveSaveConflict');
  });

  it('is pure save code beside saveSchema.ts, with no network or renderer reachable from it', () => {
    expect(policySource).toContain("from './saveSchema'");
    expect(policySource).not.toContain('fetch(');
    expect(policySource).not.toContain('phaser');
  });

  it('retains both fork candidates for the session in src/main.ts (§7.3)', () => {
    const mainSource = readProjectFile('src/main.ts');

    expect(mainSource).toContain('pendingSaveConflict');
    expect(mainSource).toMatch(/outcome\.kind === 'deferred-conflict'/);
    expect(mainSource).toContain('pendingSaveConflict: () => pendingSaveConflict');
  });
});

describe('the Step 19 client remote repository in src/', () => {
  const mainSource = readProjectFile('src/main.ts');
  const replicaSource = readProjectFile('src/persistence/cloudSaveReplica.ts');
  const compositionSource = readProjectFile('src/persistence/ReplicatingActiveSaveRepository.ts');
  const uploadSource = readProjectFile('src/platform/web/cloudSaveUpload.ts');
  const eslintConfig = readProjectFile('eslint.config.mjs');

  it('composes the Dexie repository with a cloud replica, local first', () => {
    expect(mainSource).toContain('new ReplicatingActiveSaveRepository(localRepository, cloudReplica)');
    expect(compositionSource).toContain("await this.#primary.storeActiveSave(document)");
    expect(compositionSource).toContain('this.#replica.enqueue(document)');
    // The replica is offered only after the local write succeeds, so a failed
    // local save still rejects and the coordinator still reports it.
    expect(compositionSource.indexOf('await this.#primary.storeActiveSave(document)'))
      .toBeLessThan(compositionSource.indexOf('this.#replica.enqueue(document)'));
  });

  it('keeps the conflict policy pure — the replica reuses it rather than reimplementing §7', () => {
    expect(replicaSource).toContain('resolveSaveConflict');
    expect(replicaSource).not.toContain('fetch(');
    expect(replicaSource).not.toContain('phaser');
    expect(compositionSource).not.toContain('fetch(');
  });

  it('puts the one network call in src/platform, never in src/persistence or src/core', () => {
    expect(uploadSource).toContain('export async function uploadCloudSaveViaFetch');
    expect(uploadSource).toContain('method: \'PUT\'');
    expect(eslintConfig).toContain("name: 'fetch'");
    expect(eslintConfig).toContain('Core modules must not depend on the network.');
  });

  it('forces the three §9 triggers: lifecycle flush, claimed reward, post-reconcile', () => {
    expect(mainSource).toContain('onForceSave: (document) => repository.forceCloudUpload(document)');
    expect(mainSource).toContain("outcome.kind === 'kept-local' || outcome.kind === 'no-cloud-save'");
    expect(mainSource).toContain('forceCloudUploadLatestLocalDocument');
    expect(mainSource).toContain('repository.forceCloudUpload(claimedDocument)');
  });

  it('retains an upload fork’s candidates through the same session hook as a boot fork', () => {
    expect(mainSource).toMatch(/onFork: \(local, remote\) => \{[\s\S]*pendingSaveConflict = \{ kind: 'deferred-conflict', local, remote \}/);
    expect(mainSource).toContain('toPublicCloudUploadEvent');
  });

  it('stops cloud sync on an upload fork, so the unshown remote branch cannot be replaced', () => {
    // §7.3: with no chooser, a fork must stop. The client holds the server's
    // revision after the conflict, so one more routine save would be accepted
    // and would silently replace the branch the player never saw.
    expect(replicaSource).toMatch(/case 'fork':[\s\S]*this\.stop\(\)/);
  });

  it('surfaces a terminal cloud failure through the §4 banner copy', () => {
    // §4 fixes the exact player-facing copy; it must reach the banner, not
    // only a DEV diagnostic.
    expect(mainSource).toContain('describeCloudSaveNotice');
    expect(mainSource).toMatch(/'sync-stopped' \|\| event\.kind === 'document-dropped'/);
    expect(mainSource).toContain('saveDiagnostics.report(describeCloudSaveNotice(event.code))');
  });

  it('suspends local saves while a mid-session remote save is adopted and reloaded', () => {
    // 2026-09-13 follow-up: `reload()` keeps running the current script, so the
    // driver's purchase/heartbeat paths could overwrite the just-adopted
    // document with a stale one. The flag, the cancel, and both guards are the
    // fix.
    expect(mainSource).toContain('suspendLocalSavesForCloudAdopt');
    expect(mainSource).toContain('localSavesSuspended = true');
    expect(mainSource).toContain('persistence.cancelScheduledSave()');
    expect(mainSource).toMatch(/if \(localSavesSuspended\) \{\s*return;/);
    const adoptFn = mainSource.slice(mainSource.indexOf('async function adoptRemoteDocumentFromUpload'));
    const adoptBody = adoptFn.slice(0, adoptFn.indexOf('\n}\n') + 3);
    expect(adoptBody.indexOf('suspendLocalSavesForCloudAdopt()')).toBeLessThan(
      adoptBody.indexOf('await localRepository.storeActiveSave(document)'),
    );
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
    for (const script of [
      'supabase:start',
      'supabase:stop',
      'supabase:reset',
      'verify:server',
      'scan:secrets',
      'test:server-unit',
      'test:server-integration',
      'test:server-e2e',
    ]) {
      expect(packageJson.scripts[script]).toBeTruthy();
    }
  });

  it('pins @supabase/supabase-js as a client dependency', () => {
    // Step 8 added the first `src/` import (`src/platform/web/supabaseClient.ts`,
    // for anonymous guest sign-in), promoting the package out of
    // `devDependencies` in the same change — it now ships in the browser
    // bundle, not just this repository's own tooling and
    // `supabase/functions/**` (Deno, via an `npm:` specifier).
    expect(packageJson.devDependencies['@supabase/supabase-js']).toBeUndefined();
    expect(packageJson.dependencies['@supabase/supabase-js']).toBeTruthy();
  });

  it('pins the Deno import of @supabase/supabase-js to the installed dependency version', () => {
    // Locally, `deno test`/`supabase start` resolve the bare `npm:` specifier
    // from this repository's own `node_modules` (Deno's byonm mode, since a
    // `package.json` exists at the workspace root) — but a function deployed
    // without that `node_modules` context would let Deno fetch whatever
    // version currently satisfies the specifier from the npm registry
    // instead. A floating `@2` would let local tests pass against a version
    // no deployment ever runs. Pinning both to the identical exact version
    // removes the skew instead of merely documenting it.
    const whoamiSource = readProjectFile('supabase/functions/whoami-check/index.ts');
    const installedVersion: string = packageJson.dependencies['@supabase/supabase-js'];
    expect(installedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(whoamiSource).toContain(`npm:@supabase/supabase-js@${installedVersion}`);
  });
});
