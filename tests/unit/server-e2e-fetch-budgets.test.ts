import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CLOUD_SAVE_MAX_ATTEMPTS,
  readCloudSave,
  type CloudSaveBody,
} from '../server-e2e/cloudSaveFixture';

/**
 * Regression coverage for the 2026-09-16 CI cold-start fix, the server-e2e
 * half.
 *
 * `adopt-local-save.spec.ts` and `local-save-eviction.spec.ts` both read the
 * cloud save with `AbortSignal.timeout(5_000)` and no retry, **inside**
 * `expect.poll(..., { timeout: 20_000 })`. Playwright evaluates a poll's
 * callback outside its own `try/catch`, so a thrown `TimeoutError` escaped the
 * poll and failed the test on the spot while its 20 s budget was untouched:
 * the tighter budget bought nothing, and the CI failure it produced was a
 * cold-start timing artifact reported as a product defect.
 *
 * Both specs now share `readCloudSave`, whose retry loop this file drives
 * behaviourally with an injected `fetch` — no browser, no live stack, no
 * Docker. The second half of the file is the standing invariant that keeps a
 * sub-10 s per-attempt budget from reappearing unretried anywhere under
 * `tests/server-e2e/`, asserted from source rather than by review.
 */

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const SERVER_E2E_DIRECTORY = join(PROJECT_ROOT, 'tests', 'server-e2e');
const SAVE_URL = 'http://127.0.0.1:54321/functions/v1/save-sync/v1/save';

/** Every budget below this is only acceptable inside a bounded retry loop. */
const MIN_SAFE_PER_ATTEMPT_BUDGET_MS = 10_000;

/** The specs whose bare 5 s cloud-save read this change removed. */
const SPECS_THAT_MUST_NOT_DECLARE_A_BUDGET = [
  'adopt-local-save.spec.ts',
  'local-save-eviction.spec.ts',
];

/**
 * The file's code, with comments removed.
 *
 * A budget is what the code *declares*, and these files document their own
 * budgets — `cloudSaveFixture.ts` names the very `AbortSignal.timeout(5_000)`
 * this change removed. Scanning the raw text would make writing that down a
 * rule violation, which is the opposite of useful. Only whole-line and block
 * comments are stripped, so a budget written on a code line stays visible.
 */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join('\n');

const readServerE2eFile = (file: string): string =>
  stripComments(readFileSync(join(SERVER_E2E_DIRECTORY, file), 'utf8'));

const serverE2eFiles = (): string[] =>
  readdirSync(SERVER_E2E_DIRECTORY).filter((entry) => entry.endsWith('.ts'));

/** A `fetch` that records every call and answers according to `plan`. */
function recordingFetch(
  plan: (call: number) => Promise<Response> | Response,
): { fetchImpl: typeof fetch; calls: number[] } {
  const calls: number[] = [];
  const fetchImpl = (async () => {
    calls.push(calls.length + 1);
    return plan(calls.length);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const timeoutRejection = (): Promise<Response> =>
  Promise.reject(new Error('The operation was aborted due to timeout'));

const okBody = { revision: 4, document: { schemaVersion: 2 } } as unknown as CloudSaveBody;

describe('readCloudSave', () => {
  it('returns null rather than throwing when every attempt times out', async () => {
    // The contract a poll depends on: an escaped exception kills the poll
    // immediately, a `null` value lets the poll retry until its own budget is
    // spent. This is the exact failure CI saw.
    const { fetchImpl, calls } = recordingFetch(() => timeoutRejection());

    await expect(
      readCloudSave(SAVE_URL, 'token', { fetchImpl, retryDelayMs: 0 }),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(CLOUD_SAVE_MAX_ATTEMPTS);
  });

  it('retries within its budget and still returns the parsed body', async () => {
    // What makes the short per-attempt budget safe: the first response is the
    // one a cold worker can miss, and the retry has budget left to spend on it.
    const { fetchImpl, calls } = recordingFetch((call) =>
      call === 1
        ? timeoutRejection()
        : new Response(JSON.stringify(okBody), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
    );

    await expect(
      readCloudSave(SAVE_URL, 'token', { fetchImpl, retryDelayMs: 0 }),
    ).resolves.toEqual(okBody);
    expect(calls).toHaveLength(2);
  });

  it('returns the parsed body on 200 without a second attempt', async () => {
    const { fetchImpl, calls } = recordingFetch(
      () =>
        new Response(JSON.stringify(okBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await expect(
      readCloudSave(SAVE_URL, 'token', { fetchImpl, retryDelayMs: 0 }),
    ).resolves.toEqual(okBody);
    expect(calls).toHaveLength(1);
  });

  it('treats a non-200 response as final, because the function did answer', async () => {
    // 204 is `no-cloud-save`; a 5xx is a real server answer. Retrying an
    // identical request cannot change either, and retrying a live server is
    // precisely what the pass exists to avoid.
    const { fetchImpl, calls } = recordingFetch(() => new Response(null, { status: 204 }));

    await expect(
      readCloudSave(SAVE_URL, 'token', { fetchImpl, retryDelayMs: 0 }),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('honours an injected attempt budget', async () => {
    const { fetchImpl, calls } = recordingFetch(() => timeoutRejection());

    await expect(
      readCloudSave(SAVE_URL, 'token', { fetchImpl, maxAttempts: 2, retryDelayMs: 0 }),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('sends the caller s token as a bearer credential', async () => {
    let seenHeaders: RequestInit['headers'] | undefined;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenHeaders = init?.headers;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    await readCloudSave(SAVE_URL, 'a-real-access-token', { fetchImpl, retryDelayMs: 0 });

    expect(seenHeaders).toEqual({ authorization: 'Bearer a-real-access-token' });
  });
});

/**
 * `AbortSignal.timeout(5_000)` — a budget written where it is used.
 *
 * Global, and used only with `matchAll`; the assertions below use the
 * `toMatch`-safe copies, since a global regex carries `lastIndex` state
 * between `test()` calls and would silently stop matching.
 */
const INLINE_BUDGET_PATTERN = /AbortSignal\.timeout\((\d[\d_]*)\)/g;
const INLINE_BUDGET_TEST = /AbortSignal\.timeout\((\d[\d_]*)\)/;

/** `const SOMETHING_TIMEOUT_MS = 5_000;` — a budget named and reused. */
const DECLARED_BUDGET_PATTERN = /const ([A-Z0-9_]*(?:TIMEOUT|BUDGET)[A-Z0-9_]*)\s*=\s*([\d_]+);/g;
const DECLARED_BUDGET_TEST = /const [A-Z0-9_]*(?:TIMEOUT|BUDGET)[A-Z0-9_]*\s*=\s*[\d_]+;/;

/** `for (let attempt = 1; attempt <= someBudget; attempt += 1)` */
const RETRY_LOOP_PATTERN = /for \(let \w+ = 1; \w+ <= \w+; \w+ \+= 1\)/;

/** `const SOMETHING_ATTEMPTS = 3;` or `const SOMETHING_MAX_ATTEMPTS = 20;` */
const DECLARED_ATTEMPTS_PATTERN = /const [A-Z0-9_]*ATTEMPTS[A-Z0-9_]* = (\d+);/g;

const toNumber = (literal: string): number => Number(literal.replace(/_/g, ''));

interface BudgetDeclaration {
  readonly file: string;
  readonly label: string;
  readonly budgetMs: number;
}

/** Every per-attempt budget this suite declares, inline or as a constant. */
function declaredFetchBudgets(): BudgetDeclaration[] {
  return serverE2eFiles().flatMap((file) => {
    const source = readServerE2eFile(file);
    const inline = [...source.matchAll(INLINE_BUDGET_PATTERN)].map((match) => ({
      file,
      label: `AbortSignal.timeout(${match[1]})`,
      budgetMs: toNumber(match[1]),
    }));
    const declared = [...source.matchAll(DECLARED_BUDGET_PATTERN)].map((match) => ({
      file,
      label: match[1],
      budgetMs: toNumber(match[2]),
    }));
    return [...inline, ...declared];
  });
}

describe('per-attempt fetch budgets under tests/server-e2e', () => {
  it('never drops below 10 s outside a bounded retry loop', () => {
    // The invariant, in one place: a short budget is fine only when the same
    // module actually retries it. `readCloudSave`'s retry is proven
    // behaviourally above; this keeps a new bare `AbortSignal.timeout(5_000)`
    // from being added to a spec and invisible until a cold runner fails.
    const shortBudgets = declaredFetchBudgets().filter(
      (budget) => budget.budgetMs < MIN_SAFE_PER_ATTEMPT_BUDGET_MS,
    );

    for (const budget of shortBudgets) {
      const source = readServerE2eFile(budget.file);
      const attempts = [...source.matchAll(DECLARED_ATTEMPTS_PATTERN)].map((match) =>
        Number(match[1]),
      );

      expect(
        attempts.length,
        `${budget.file}: ${budget.label} is a sub-10 s budget but the file declares no *_ATTEMPTS constant`,
      ).toBeGreaterThan(0);
      expect(
        Math.max(...attempts),
        `${budget.file}: ${budget.label} is a sub-10 s budget but no attempt budget reaches 2`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        source,
        `${budget.file}: ${budget.label} is a sub-10 s budget with no retry loop around it`,
      ).toMatch(RETRY_LOOP_PATTERN);
    }
  });

  it('found the budgets this check is meant to police, so it cannot pass vacuously', () => {
    // The same "did the scan read anything" guard `server-stack.test.ts` applies
    // to its own read-from-disk lists. Two budgets remain: the shared helper's
    // own, and `guest-session.spec.ts`'s existing warm-up loop.
    const budgets = declaredFetchBudgets();

    expect(budgets.map((budget) => budget.file).sort()).toEqual([
      'cloudSaveFixture.ts',
      'guest-session.spec.ts',
    ]);
  });

  it('removed both bare 5 s cloud-save reads', () => {
    // The two call sites this change was written for now share a retrying
    // helper, so neither declares a budget of its own any more.
    for (const file of SPECS_THAT_MUST_NOT_DECLARE_A_BUDGET) {
      const source = readServerE2eFile(file);

      expect(source, `${file} still declares a fetch budget`).not.toMatch(INLINE_BUDGET_TEST);
      expect(source, `${file} still declares a fetch budget`).not.toMatch(DECLARED_BUDGET_TEST);
      expect(source, `${file} no longer reads the cloud save through the shared helper`).toContain(
        'readCloudSave(',
      );
    }
  });
});
