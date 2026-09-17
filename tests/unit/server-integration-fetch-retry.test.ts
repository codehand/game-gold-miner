import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  fetchToleratingStall,
  TRANSIENT_FETCH_ATTEMPT_TIMEOUT_MS,
  TRANSIENT_FETCH_MAX_ATTEMPTS,
} from '../server-integration/transientFetchFixture';

/**
 * Regression coverage for the 2026-09-16 CI failure, the integration-suite
 * half.
 *
 * The `server` job's only failure was
 * `recovery-code.integration.test.ts`'s throttle test, on its **first**
 * iteration — 20171 ms, one request spending the whole 20 s budget — inside a
 * burst loop that treated a thrown `TimeoutError` as fatal. The loop only ever
 * needed to observe that repeated attempts eventually answer `429`, so each
 * attempt now fails fast and retries once when nothing answered at all.
 *
 * The first half of this file drives that retry loop with an injected `fetch`
 * — no live stack, no Docker, no network. The second half is the standing
 * invariant, asserted from source rather than by review: neither burst loop
 * may go back to a bare `redeemCode` call, a never-answered attempt may not be
 * recorded as a status, and the 45-attempt bound it relies on may not be
 * lowered to make a slow run fit.
 */

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const SPEC_PATH = join(
  PROJECT_ROOT,
  'tests',
  'server-integration',
  'recovery-code.integration.test.ts',
);
const REDEEM_URL = 'http://127.0.0.1:54321/functions/v1/recovery-code/v1/redeem';

/** A `fetch` that records every call and answers according to `plan`. */
function recordingFetch(
  plan: (call: number) => Promise<Response> | Response,
): { fetchImpl: typeof fetch; calls: Array<RequestInit | undefined> } {
  const calls: Array<RequestInit | undefined> = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init);
    return plan(calls.length);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A stall, as undici raises it: the fetch rejects and no response exists. */
const stall = (): Promise<Response> =>
  Promise.reject(new Error('The operation was aborted due to timeout'));

const redeemInit: RequestInit = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'ffff-ffff-ffff-ffff-ffff-ffff-ffff-ffff' }),
};

describe('fetchToleratingStall', () => {
  it('returns a 429 on the retry when the first attempt stalls', async () => {
    // The CI shape: the attempt that carries the assertion stalls, and the
    // retry is the one that observes the limiter. Without this the burst loop
    // dies on a request that was never a product result.
    const { fetchImpl, calls } = recordingFetch((call) =>
      call === 1 ? stall() : new Response(null, { status: 429 }),
    );

    const response = await fetchToleratingStall(REDEEM_URL, redeemInit, {
      fetchImpl,
      retryDelayMs: 0,
    });

    expect(response?.status).toBe(429);
    expect(calls).toHaveLength(2);
  });

  it('returns null rather than throwing when every attempt stalls', async () => {
    // The contract the burst loops depend on: `null` lets a loop skip the
    // attempt, a throw kills the test on the spot. It is deliberately not a
    // synthesised response — a timeout must never be counted as `429`.
    const { fetchImpl, calls } = recordingFetch(() => stall());

    await expect(
      fetchToleratingStall(REDEEM_URL, redeemInit, { fetchImpl, retryDelayMs: 0 }),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(TRANSIENT_FETCH_MAX_ATTEMPTS);
  });

  it('treats any real response as final, because the function did answer', async () => {
    // 401 is the ordinary answer for an unknown code, and retrying an identical
    // request cannot change it. Only a response-less attempt is retried.
    const { fetchImpl, calls } = recordingFetch(() => new Response(null, { status: 401 }));

    const response = await fetchToleratingStall(REDEEM_URL, redeemInit, {
      fetchImpl,
      retryDelayMs: 0,
    });

    expect(response?.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('honours an injected attempt budget', async () => {
    const { fetchImpl, calls } = recordingFetch(() => stall());

    await expect(
      fetchToleratingStall(REDEEM_URL, redeemInit, {
        fetchImpl,
        maxAttempts: 3,
        retryDelayMs: 0,
      }),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(3);
  });

  it('gives each attempt its own budget, so a spent signal cannot abort the retry', async () => {
    // A shared `AbortSignal.timeout(...)` is already aborted by the time the
    // retry runs, which would make the retry fail instantly and vacuously.
    const { fetchImpl, calls } = recordingFetch((call) =>
      call === 1 ? stall() : new Response(null, { status: 429 }),
    );

    await fetchToleratingStall(REDEEM_URL, redeemInit, { fetchImpl, retryDelayMs: 0 });

    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.signal).not.toBe(calls[1]?.signal);
    expect(calls[0]?.signal?.aborted).toBe(false);
  });

  it('sends the caller s request unchanged', async () => {
    const { fetchImpl, calls } = recordingFetch(() => new Response(null, { status: 401 }));

    await fetchToleratingStall(REDEEM_URL, redeemInit, { fetchImpl, retryDelayMs: 0 });

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toBe(redeemInit.body);
  });

  it('keeps the suite s documented per-attempt budget rather than inflating it', async () => {
    // AC11's machine-checkable half: the fix adds retries, it does not buy a
    // slow path more time. 20 s is the budget the rest of the suite declares.
    expect(TRANSIENT_FETCH_ATTEMPT_TIMEOUT_MS).toBe(20_000);
    expect(TRANSIENT_FETCH_MAX_ATTEMPTS).toBeGreaterThan(1);
  });
});

/**
 * The spec's code, with comments removed — so the assertions below police what
 * the loops *do*, not what they document. This file's own doc comment quotes
 * `redeemCode`, and so does the spec's; only whole-line and block comments are
 * stripped, so code stays visible.
 */
const specSource = readFileSync(SPEC_PATH, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
  .join('\n');

/**
 * Each burst loop's body: the text after `for (let attempt` up to the loop's
 * own closing brace, which the file's 4-space indent makes identifiable.
 */
function burstLoopBodies(): string[] {
  return specSource
    .split('for (let attempt')
    .slice(1)
    .map((segment) => segment.split('\n    }')[0]);
}

describe('the recovery-code burst loops', () => {
  const loops = burstLoopBodies();

  it('has the two loops this check is written for, so it cannot pass vacuously', () => {
    expect(loops).toHaveLength(2);
    for (const loop of loops) {
      // The bound is what tolerates the shared bucket's ambient consumption;
      // it must not be lowered to make a slow run fit.
      expect(loop).toMatch(/attempt < 45/);
      // Anti-vacuity for the two assertions below: an over-eager split that
      // returned empty strings would satisfy "no bare redeemCode" trivially.
      expect(loop).toContain('sawRateLimited');
    }
  });

  it('never calls the single-budget redeemCode inside a burst loop', () => {
    // The CI failure itself: a bare `await redeemCode(...)` throws on a stall
    // and takes the whole test with it.
    for (const loop of loops) {
      expect(loop).not.toMatch(/await redeemCode\(/);
      expect(loop).toMatch(/await redeemAttempt\(/);
    }
  });

  it('skips a never-answered attempt instead of recording it', () => {
    // AC16: `sawRateLimited` must only ever be set by a real 429. The null
    // check has to come before both the status recording and that branch.
    for (const loop of loops) {
      const nullCheck = loop.indexOf('response === null');
      expect(nullCheck).toBeGreaterThan(-1);
      expect(loop.indexOf('sawRateLimited = true')).toBeGreaterThan(nullCheck);
      expect(loop.indexOf('response.status')).toBeGreaterThan(nullCheck);
    }
  });

  it('still fails when the limiter never answers 429', () => {
    // The behaviour the test exists for is asserted on a value only a real 429
    // can set (just above each loop, outside its body), so 45 unanswered or
    // non-429 attempts still fail the test.
    expect(specSource.match(/expect\(sawRateLimited\)\.toBe\(true\);/g)).toHaveLength(2);
  });
});
