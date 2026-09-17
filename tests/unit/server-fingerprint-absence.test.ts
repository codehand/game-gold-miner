import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Server-milestone Step 25, AC6 — the **fingerprint proof-of-absence**.
 *
 * Step 25's test reads: "A test asserts no code path uses a fingerprint value
 * to select an account or authorize a save write." That assertion is this
 * file. It is an assertion over the code, in the shape of
 * `tests/unit/architecture.test.ts`'s ESLint probe — not a comment promising
 * good behaviour.
 *
 * ## Why absence is the property, and why it is asserted rather than assumed
 *
 * Step 25's instructions permit a fingerprint-derived signal as *one weak
 * input* to abuse detection. That option was deliberately **not taken**:
 * `memory-bank/server-threat-model.md` §7.2 records the default — audience
 * Vietnam/SEA, Supabase region Singapore, the build is a public website, so
 * **GDPR is assumed to apply** — and concludes that Step 25 collects **no**
 * fingerprint-derived signals at all, relying on address and behavioural rate
 * limits only, which is exactly what `_shared/rateLimit.ts` does. The
 * deliverable is therefore the proof of absence, not a collector.
 *
 * The two ways that decision could be silently undone later are (1) somebody
 * starts *reading* a device or browser characteristic — a `User-Agent`,
 * `Sec-CH-UA-*`, `Accept-Language`, a canvas/WebGL read, a screen dimension, a
 * timezone — and (2) somebody starts *using* one to pick an account or
 * authorize a write. This file fails on the reading; the behavioural half in
 * `supabase/functions/save-sync/index.test.ts` fails on the using, by driving
 * two requests that differ only in those headers and asserting the resolved
 * identity and the authorized write are identical.
 *
 * ## Deliberately verified to go red
 *
 * During development a `request.headers.get('user-agent')` read was added to
 * `save-sync/index.ts`, this file was run and failed naming that file and
 * signal, and the read was removed — recorded in the Step 25 hand-off
 * narrative. A guard nobody has seen fail is a guard nobody knows works.
 */

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const FUNCTIONS_DIRECTORY = join(PROJECT_ROOT, 'supabase', 'functions');

/**
 * Signals banned outright. Every entry is a *client-supplied device or
 * browser characteristic* — something that describes the software or hardware
 * rather than the request. Deliberately absent from this list: the caller's
 * address (`X-Forwarded-For`, read only at its gateway-appended last hop) and
 * the bearer token, which are the two inputs Step 25 *is* allowed to key on,
 * and the `initData` a Telegram client signs, which is a credential rather
 * than a fingerprint.
 *
 * Matched case-insensitively against the whole source, comments included: a
 * collector smuggled in behind a comment that names the signal is still a
 * collector, and the list is precise enough (`screen.width`, not `screen`)
 * that legitimate prose does not trip it.
 */
const BANNED_SIGNALS: readonly string[] = [
  'user-agent',
  'sec-ch-ua',
  'accept-language',
  'x-device-id',
  'x-fingerprint',
  'client-hints',
  'deviceid',
  'device_id',
  'device-memory',
  'devicepixelratio',
  'hardwareconcurrency',
  'fingerprint',
  'webgl',
  'canvas',
  'getcontext(',
  'navigator.',
  'window.screen',
  'screen.width',
  'screen.height',
  'timezone',
];

/**
 * Server code under test. `_shared/generated/core-bundle.js` is a Vite build
 * artefact of `src/core` — not server-authored code, and not present until
 * `npm run build:server-core` — and `*.test.ts` files legitimately *name* the
 * banned signals in assertions and fixtures, so both are excluded rather than
 * exempted by per-file allowance.
 */
function serverSourceFiles(): string[] {
  const files: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (relative(FUNCTIONS_DIRECTORY, absolute) === '_shared/generated') {
          continue;
        }
        walk(absolute);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(absolute);
      }
    }
  };

  walk(FUNCTIONS_DIRECTORY);
  return files.sort();
}

interface BannedSignalHit {
  readonly file: string;
  readonly signal: string;
  readonly line: number;
  readonly text: string;
}

function findBannedSignals(): BannedSignalHit[] {
  const hits: BannedSignalHit[] = [];

  for (const file of serverSourceFiles()) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, index) => {
      const lowered = text.toLowerCase();
      for (const signal of BANNED_SIGNALS) {
        if (lowered.includes(signal)) {
          hits.push({ file: relative(PROJECT_ROOT, file), signal, line: index + 1, text: text.trim() });
        }
      }
    });
  }

  return hits;
}

describe('no server code path reads a device or browser fingerprint', () => {
  it('scans real server sources, so a broken walk cannot pass vacuously', () => {
    const files = serverSourceFiles().map((file) => relative(PROJECT_ROOT, file));

    expect(files.length).toBeGreaterThan(0);
    // Every deployable function plus the shared modules must be in scope: a
    // walk that silently skipped one would make the assertion below weaker
    // exactly where it matters.
    for (const required of [
      'supabase/functions/save-sync/index.ts',
      'supabase/functions/telegram-sign-in/index.ts',
      'supabase/functions/recovery-code/index.ts',
      'supabase/functions/whoami-check/index.ts',
      'supabase/functions/_shared/http.ts',
      'supabase/functions/_shared/rateLimit.ts',
    ]) {
      expect(files).toContain(required);
    }
    // The generated bundle is an artefact, not server-authored code.
    expect(files.some((file) => file.includes('_shared/generated'))).toBe(false);
  });

  it('names no client-supplied device or browser characteristic anywhere in server code', () => {
    const hits = findBannedSignals();

    // Failure output names the file, line and signal, so a real violation is
    // actionable rather than a bare "expected []".
    expect(
      hits.map((hit) => `${hit.file}:${hit.line} uses "${hit.signal}" — ${hit.text}`),
    ).toEqual([]);
  });

  it('keeps its own banned-signal list honest by detecting a deliberate violation', () => {
    // Proves the detector above actually detects. Without this, a typo in the
    // walk or the matcher would show up as a permanent green pass — the exact
    // failure mode a proof-of-absence test is most prone to.
    const planted = "const agent = request.headers.get('user-agent');\n";
    const lowered = planted.toLowerCase();

    // Caught, and caught by *exactly* the one signal the plant names. A bare
    // "is it caught?" check would also pass for a matcher that flagged every
    // line, which would be useless in practice; pinning the match set proves
    // the list discriminates rather than merely fires.
    expect(BANNED_SIGNALS.filter((banned) => lowered.includes(banned))).toEqual(['user-agent']);

    // And the list is not so broad that ordinary server code trips it — the
    // other way this detector could be useless while still "detecting".
    const ordinary = 'const save = await readCurrentSave(caller.userId);';
    expect(BANNED_SIGNALS.filter((banned) => ordinary.toLowerCase().includes(banned))).toEqual([]);
  });
});
