/**
 * Writes `supabase/functions/.env` — the file `supabase start` auto-loads into
 * the Edge Function runtime — from the fixture constants the tests already
 * commit.
 *
 * Why this exists. Server-milestone Steps 12 and 14 read three variables from
 * that file, which is git-ignored because it is a developer's own local file.
 * A CI runner therefore has no copy, so `telegram-sign-in` throws
 * "TELEGRAM_BOT_TOKEN is not configured" and answers `500` to every call,
 * while `recovery-code`'s test-only rate-limit reset refuses with `400` —
 * eight failures in `npm run verify:server` that never reproduce locally.
 *
 * This writes no secret. The two values that must match are already public
 * constants in tracked test files, and this reads them from there rather than
 * restating them, so renaming a constant fails loudly here instead of leaving
 * CI silently signing with the wrong token. The pepper is generated per run:
 * the runner's database is created from scratch, so nothing depends on a
 * stable value, and generating it proves nothing does.
 *
 * Refuses to clobber an existing file, so running it on a development machine
 * cannot overwrite a real local configuration. Pass `--force` to rewrite.
 *
 * `scripts/verify-server-stack.mjs` runs this before it starts the stack, so
 * `npm run verify:server` is self-sufficient on a clean checkout and in CI —
 * the same way it builds the git-ignored `core-bundle.js` before starting.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET = 'supabase/functions/.env';

const SOURCES = [
  {
    label: 'FIXTURE_TELEGRAM_BOT_TOKEN',
    path: 'tests/server-integration/telegramInitDataFixture.ts',
    pattern: /FIXTURE_TELEGRAM_BOT_TOKEN\s*=\s*'([^']+)'/,
  },
  {
    label: 'RECOVERY_CODE_TEST_RESET_TOKEN',
    path: 'tests/server-integration/recovery-code.integration.test.ts',
    pattern: /RECOVERY_CODE_TEST_RESET_TOKEN\s*=\s*'([0-9a-f]{64})'/,
  },
];

function readConstant({ label, path, pattern }) {
  const found = readFileSync(path, 'utf8').match(pattern);
  if (found === null) {
    throw new Error(
      `write-functions-env: could not read ${label} from ${path}. ` +
        'If the constant was renamed, update scripts/write-functions-env.mjs in the same change.',
    );
  }
  return found[1];
}

if (existsSync(TARGET) && !process.argv.includes('--force')) {
  console.log(`write-functions-env: ${TARGET} already exists; leaving it untouched.`);
  process.exit(0);
}

const [botToken, resetToken] = SOURCES.map(readConstant);

writeFileSync(
  TARGET,
  [
    `TELEGRAM_BOT_TOKEN=${botToken}`,
    `RECOVERY_CODE_PEPPER=${randomBytes(32).toString('hex')}`,
    `RECOVERY_CODE_TEST_RESET_TOKEN=${resetToken}`,
    '',
  ].join('\n'),
);

console.log(`write-functions-env: wrote ${TARGET} from tracked fixture constants.`);
