import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  readEdgeFunctionNames,
  WARMUP_PROBE_METHOD,
  WARMUP_PROBE_PATH_SUFFIX,
  warmEdgeFunction,
  warmEdgeFunctions,
} from '../../scripts/warm-edge-functions.mjs';

/**
 * Regression coverage for the 2026-09-16 CI cold-start fix: the `server` job
 * failed with undici's `TimeoutError` on the first, cold, request to an Edge
 * Function, while the same run passed locally against a warm module cache.
 * `scripts/verify-server-stack.mjs` now warms every function once, before any
 * suite runs.
 *
 * Every test here injects a `fetch`, so none of them needs Docker, a live
 * stack, or the network — the reason the retry loop was extracted into
 * `scripts/warm-edge-functions.mjs` rather than written inline in the script
 * that calls it. `retryDelayMs: 0` keeps the retries instantaneous instead of
 * making these tests wait out a real backoff.
 */

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const FUNCTIONS_DIRECTORY = join(PROJECT_ROOT, 'supabase', 'functions');
const BASE_URL = 'http://127.0.0.1:54321/functions/v1';

const FAST_RETRY = { retryDelayMs: 0 } as const;

/** A `fetch` that records every call and answers according to `plan`. */
function recordingFetch(
  plan: (call: number, url: string, init: RequestInit | undefined) => Promise<Response> | Response,
): { fetchImpl: typeof fetch; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(_input), init });
    return plan(calls.length, String(_input), init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A timeout, as undici raises it: the fetch rejects and no response exists. */
const timeoutRejection = (): Promise<Response> =>
  Promise.reject(new Error('The operation was aborted due to timeout'));

const temporaryDirectories: string[] = [];

/** A stand-in `supabase/functions/` tree, so a "seventh function" is addable. */
function fakeFunctionsDirectory(names: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'edge-function-warmup-'));
  temporaryDirectories.push(root);
  for (const name of names) {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, 'index.ts'), '// stand-in\n');
  }
  // `_shared` is library code with no `index.ts` and no deployable function.
  mkdirSync(join(root, '_shared'));
  writeFileSync(join(root, 'README.md'), 'not a directory\n');
  return root;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('readEdgeFunctionNames', () => {
  it('reads the real functions directory from disk and skips _shared', () => {
    const names = readEdgeFunctionNames(FUNCTIONS_DIRECTORY);

    // Anti-vacuity: an empty list would make every caller's pass cover nothing
    // while still reporting success — the same guard `server-stack.test.ts`
    // applies to its own read-from-disk list.
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual([...names].sort());
    expect(names).toContain('save-sync');
    expect(names).toContain('recovery-code');
    expect(names).not.toContain('_shared');
  });

  it('picks up a newly added function with no edit to any list', () => {
    // The whole reason the list is read from disk: someone adds a function and
    // the warm-up extends itself, rather than silently not covering it.
    const before = readEdgeFunctionNames(fakeFunctionsDirectory(['alpha', 'beta']));
    const after = readEdgeFunctionNames(fakeFunctionsDirectory(['alpha', 'beta', 'gamma']));

    expect(before).toEqual(['alpha', 'beta']);
    expect(after).toEqual(['alpha', 'beta', 'gamma']);
  });
});

describe('warmEdgeFunction', () => {
  it('retries a rejected attempt and stops at the first HTTP response', async () => {
    // The cold-start shape: the first two requests never come back at all,
    // the third is answered. Any status counts — a refusal is the expected
    // answer and already proves the worker booted.
    const { fetchImpl, calls } = recordingFetch((call) =>
      call < 3 ? timeoutRejection() : new Response(null, { status: 400 }),
    );

    const result = await warmEdgeFunction('recovery-code', {
      functionsBaseUrl: BASE_URL,
      fetchImpl,
      ...FAST_RETRY,
    });

    expect(result).toEqual({ name: 'recovery-code', responded: true, attempts: 3, status: 400 });
    expect(calls).toHaveLength(3);
  });

  it('stops at the first response even when it is a server error', async () => {
    // A response, whatever its status, is proof the worker ran; retrying an
    // identical request cannot change a deterministic failure.
    const { fetchImpl, calls } = recordingFetch(() => new Response(null, { status: 500 }));

    const result = await warmEdgeFunction('save-sync', {
      functionsBaseUrl: BASE_URL,
      fetchImpl,
      maxAttempts: 5,
      ...FAST_RETRY,
    });

    expect(result).toEqual({ name: 'save-sync', responded: true, attempts: 1, status: 500 });
    expect(calls).toHaveLength(1);
  });

  it('honours its attempt budget and reports the failure instead of throwing', async () => {
    const { fetchImpl, calls } = recordingFetch(() => timeoutRejection());

    const result = await warmEdgeFunction('whoami-check', {
      functionsBaseUrl: BASE_URL,
      fetchImpl,
      maxAttempts: 4,
      ...FAST_RETRY,
    });

    expect(result).toEqual({ name: 'whoami-check', responded: false, attempts: 4, status: 0 });
    expect(calls).toHaveLength(4);
  });

  it('probes with a refused request that cannot carry a credential or a body', async () => {
    // The probe has to boot the worker without mutating stack state. It is a
    // method/path every function refuses from its router's default branch, sent
    // with no `authorization` header and no body — so it cannot reach an
    // authenticated handler, consume `recovery-code`'s shared rate-limit
    // bucket, or write anything. `OPTIONS` would be the more natural probe, but
    // the local Kong gateway answers that itself without booting a worker.
    const { fetchImpl, calls } = recordingFetch(() => new Response(null, { status: 400 }));

    await warmEdgeFunction('recovery-code', {
      functionsBaseUrl: BASE_URL,
      fetchImpl,
      ...FAST_RETRY,
    });

    expect(calls[0].url).toBe(`${BASE_URL}/recovery-code/${WARMUP_PROBE_PATH_SUFFIX}`);
    expect(calls[0].init?.method).toBe(WARMUP_PROBE_METHOD);
    expect(calls[0].init?.headers).toBeUndefined();
    expect(calls[0].init?.body).toBeUndefined();
  });
});

describe('warmEdgeFunctions', () => {
  it('warms every function the directory holds, including one added later', async () => {
    const { fetchImpl, calls } = recordingFetch(() => new Response(null, { status: 400 }));

    const results = await warmEdgeFunctions({
      functionsDirectory: fakeFunctionsDirectory(['save-sync', 'recovery-code', 'gamma']),
      functionsBaseUrl: BASE_URL,
      fetchImpl,
      ...FAST_RETRY,
    });

    // `_shared` is not a function and is not warmed; the three directories are,
    // in name order, with no list to edit for the third.
    expect(results.map((result) => result.name)).toEqual(['gamma', 'recovery-code', 'save-sync']);
    expect(results.every((result) => result.responded)).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      `${BASE_URL}/gamma/${WARMUP_PROBE_PATH_SUFFIX}`,
      `${BASE_URL}/recovery-code/${WARMUP_PROBE_PATH_SUFFIX}`,
      `${BASE_URL}/save-sync/${WARMUP_PROBE_PATH_SUFFIX}`,
    ]);
  });

  it('warms sequentially, so a cold runner is not booting five workers at once', async () => {
    // Ordering is the resource claim the pass exists to protect: on 4 vCPU the
    // point is to leave CPU free for the suites, not to boot every isolate
    // simultaneously and contend with itself.
    let inFlight = 0;
    let peakInFlight = 0;
    const { fetchImpl } = recordingFetch(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return new Response(null, { status: 400 });
    });

    const results = await warmEdgeFunctions({
      functionsDirectory: fakeFunctionsDirectory(['alpha', 'beta', 'gamma', 'delta']),
      functionsBaseUrl: BASE_URL,
      fetchImpl,
      ...FAST_RETRY,
    });

    expect(results).toHaveLength(4);
    expect(peakInFlight).toBe(1);
  });
});
