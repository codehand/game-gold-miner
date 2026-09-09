import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { scanBuildOutputForSecrets } from '../../scripts/scan-bundle-secrets.mjs';

/**
 * Regression coverage for `npm run scan:secrets`, the build-output half of
 * server-milestone Step 4's validation.
 *
 * Every fixture lives in a temporary directory outside the repository, so the
 * scanner's `supabase status` probe finds no CLI and reports the stack as not
 * running — which is the state a CI runner is in, and the state these
 * assertions are written against.
 */

const SERVICE_ROLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  Buffer.from(JSON.stringify({ iss: 'test', role: 'service_role' })).toString('base64url') +
  '.c2lnbmF0dXJl';

const ANON_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  Buffer.from(JSON.stringify({ iss: 'test', role: 'anon' })).toString('base64url') +
  '.c2lnbmF0dXJl';

const roots: string[] = [];

const makeFixture = (options: {
  envExample?: string;
  envLocal?: string;
  bundle: string;
}): { buildDirectory: string; projectRoot: string } => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'secret-scan-'));
  roots.push(projectRoot);

  writeFileSync(
    join(projectRoot, '.env.example'),
    options.envExample ??
      'VITE_SUPABASE_URL=https://example.supabase.co\n' +
        'VITE_SUPABASE_ANON_KEY=your-anon-key\n' +
        'SUPABASE_SERVICE_ROLE_KEY=your-service-role-key\n' +
        'RECOVERY_CODE_PEPPER=generate-a-random-32-byte-value\n',
  );
  if (options.envLocal !== undefined) {
    writeFileSync(join(projectRoot, '.env.local'), options.envLocal);
  }

  const buildDirectory = join(projectRoot, 'dist', 'assets');
  mkdirSync(buildDirectory, { recursive: true });
  writeFileSync(join(buildDirectory, 'index-abc123.js'), options.bundle);

  return { buildDirectory: join(projectRoot, 'dist'), projectRoot };
};

const scan = (options: Parameters<typeof makeFixture>[0]) => {
  const { buildDirectory, projectRoot } = makeFixture(options);
  return scanBuildOutputForSecrets(buildDirectory, projectRoot);
};

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('structural detection', () => {
  it('flags a JWT whose payload declares the service role', () => {
    const result = scan({ bundle: `const t="${SERVICE_ROLE_JWT}";` });
    expect(result.findings.map((finding) => finding.reason)).toContain(
      'contains a JWT whose payload declares role=service_role',
    );
  });

  it('does not flag an anon JWT, which is public by design', () => {
    const result = scan({ bundle: `const t="${ANON_JWT}";` });
    expect(result.findings).toEqual([]);
  });

  it('flags an sb_secret_ key', () => {
    // Assembled at runtime so this file does not itself contain a literal the
    // repository-wide credential scan in `server-stack.test.ts` must reject.
    const key = `sb_${'secret'}_FIXTUREONLYNOTAKEY`;
    const result = scan({ bundle: `const k="${key}";` });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].reason).toMatch(/Supabase secret key/);
  });

  it('flags a server-only variable name reaching the bundle', () => {
    const result = scan({ bundle: 'const p=import.meta.env.RECOVERY_CODE_PEPPER;' });
    expect(result.findings.map((finding) => finding.reason)).toContain(
      'references the server-only variable RECOVERY_CODE_PEPPER',
    );
  });
});

describe('exact environment values', () => {
  it('flags a server-only value that reached the bundle', () => {
    const result = scan({
      envLocal: 'RECOVERY_CODE_PEPPER=a-real-pepper-value-abcdef\n',
      bundle: 'const p="a-real-pepper-value-abcdef";',
    });
    expect(result.findings.map((finding) => finding.reason)).toContain(
      'contains a server-only value from the environment',
    );
  });

  it('does not flag a value the client publishes under its VITE_ twin', () => {
    // The Edge Function reads `SUPABASE_ANON_KEY` and `SUPABASE_URL` without a
    // prefix. An environment carrying both spellings must not fail the build on
    // the exact anon key the client ships on purpose.
    const result = scan({
      envLocal:
        'VITE_SUPABASE_URL=http://127.0.0.1:54321\n' +
        'SUPABASE_URL=http://127.0.0.1:54321\n' +
        `VITE_SUPABASE_ANON_KEY=${ANON_JWT}\n` +
        `SUPABASE_ANON_KEY=${ANON_JWT}\n`,
      bundle: `const u="http://127.0.0.1:54321";const k="${ANON_JWT}";`,
    });
    expect(result.findings).toEqual([]);
  });

  it('still flags a secret mirrored under an unrelated VITE_ name', () => {
    // The exemption matches the twin name, not any published value: a secret
    // must not exempt itself by being copied under some other VITE_ variable.
    const result = scan({
      envLocal:
        'RECOVERY_CODE_PEPPER=a-real-pepper-value-abcdef\n' +
        'VITE_ANALYTICS_TAG=a-real-pepper-value-abcdef\n',
      bundle: 'const p="a-real-pepper-value-abcdef";',
    });
    expect(result.findings.map((finding) => finding.reason)).toContain(
      'contains a server-only value from the environment',
    );
  });
});

describe('environment parsing', () => {
  // Each case below defeated the exact-value check by leaving the parsed value
  // different from the value that actually reaches a bundle — a pass that
  // checked a string which cannot occur.

  it('flags a value whose .env.local line carries a trailing comment', () => {
    const result = scan({
      envLocal: 'RECOVERY_CODE_PEPPER=a-real-pepper-value-abcdef # local only\n',
      bundle: 'const p="a-real-pepper-value-abcdef";',
    });
    expect(result.findings.map((finding) => finding.reason)).toContain(
      'contains a server-only value from the environment',
    );
  });

  it('flags a quoted value, comment and quotes both stripped', () => {
    const result = scan({
      envLocal: 'RECOVERY_CODE_PEPPER="a-real-pepper-value-abcdef" # local only\n',
      bundle: 'const p="a-real-pepper-value-abcdef";',
    });
    expect(result.findings.map((finding) => finding.reason)).toContain(
      'contains a server-only value from the environment',
    );
  });

  it('reads an export-prefixed name as the name, so a VITE_ twin still exempts', () => {
    // `export NAME=value` is valid in a file meant to be sourced by a shell.
    // Read literally, the name becomes `export VITE_SUPABASE_URL`, which does
    // not start with `VITE_` — so the published URL would fail the build.
    const result = scan({
      envLocal:
        'export VITE_SUPABASE_URL=http://127.0.0.1:54321\n' +
        'export SUPABASE_URL=http://127.0.0.1:54321\n',
      bundle: 'const u="http://127.0.0.1:54321";',
    });
    expect(result.findings).toEqual([]);
  });
});

describe('coverage reporting', () => {
  it('reports reduced coverage rather than passing silently', () => {
    // Without `.env.local` no exact value can be checked. A clean pass that
    // checked nothing must say so; the structural checks still ran.
    const result = scan({ bundle: 'const x=1;' });
    expect(result.findings).toEqual([]);
    expect(result.warnings).toContain('no .env.local, so no exact environment value was checked');
  });

  it('does not warn when the environment was fully readable', () => {
    const result = scan({
      envLocal: 'RECOVERY_CODE_PEPPER=a-real-pepper-value-abcdef\n',
      bundle: 'const x=1;',
    });
    expect(result.warnings).toEqual([]);
  });

  it('names the values it skipped as too short or still placeholder', () => {
    // Skipping is unavoidable — grepping a bundle for `true` matches noise —
    // but a skipped variable is unchecked, and unchecked must not read as safe.
    const result = scan({
      envLocal: 'TELEGRAM_BOT_TOKEN=short\nRECOVERY_CODE_PEPPER=your-value-here\n',
      bundle: 'const x=1;',
    });
    expect(result.warnings.join(' ')).toContain('TELEGRAM_BOT_TOKEN');
    expect(result.warnings.join(' ')).toContain('RECOVERY_CODE_PEPPER');
  });

  it('reports a build output that held nothing to scan', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'secret-scan-'));
    roots.push(projectRoot);
    const buildDirectory = join(projectRoot, 'dist');
    mkdirSync(buildDirectory, { recursive: true });

    const result = scanBuildOutputForSecrets(buildDirectory, projectRoot);
    expect(result.scannedFileCount).toBe(0);
    expect(result.warnings).toContain(
      'the build output held no scannable file, so nothing was checked',
    );
  });
});

describe('the CLI entry point', () => {
  it('exits non-zero rather than passing on an empty build output', () => {
    // Nothing read means nothing vouched for. Printing a pass here would report
    // the strongest possible result from the weakest possible evidence.
    const projectRoot = mkdtempSync(join(tmpdir(), 'secret-scan-'));
    roots.push(projectRoot);
    const buildDirectory = join(projectRoot, 'dist');
    mkdirSync(buildDirectory, { recursive: true });

    expect(() =>
      execFileSync(
        process.execPath,
        [join(import.meta.dirname, '..', '..', 'scripts', 'scan-bundle-secrets.mjs'), buildDirectory],
        { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' },
      ),
    ).toThrow();
  });

  it('exits non-zero when the build output holds a secret', () => {
    const { buildDirectory, projectRoot } = makeFixture({
      bundle: `const t="${SERVICE_ROLE_JWT}";`,
    });

    expect(() =>
      execFileSync(
        process.execPath,
        [join(import.meta.dirname, '..', '..', 'scripts', 'scan-bundle-secrets.mjs'), buildDirectory],
        { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' },
      ),
    ).toThrow();
  });
});
