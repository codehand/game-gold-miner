/**
 * The one way this suite reads a cloud save from the Node test process.
 *
 * `adopt-local-save.spec.ts` and `local-save-eviction.spec.ts` both downloaded
 * `GET /v1/save` with `AbortSignal.timeout(5_000)` — 4× tighter than every
 * other budget in the repository, with no retry — and called it **inside**
 * `expect.poll(..., { timeout: 20_000 })`. A 2026-09-16 CI finding: that
 * combination is the worst of both, because Playwright evaluates a poll's
 * callback outside its own `try/catch` (`const value = await actual()` in its
 * `expect.js`), so a thrown `TimeoutError` escapes the poll and fails the test
 * instantly while the 20 s budget is still untouched. The 5 s budget bought
 * nothing and its expiry could not be retried; the suite still reported a
 * cold-start timeout as a product failure, which is exactly how it went red in
 * CI on a run where every assertion it makes was true.
 *
 * So the read now fails fast per attempt and retries, the shape
 * `whoami.integration.test.ts`'s warm-up and `scripts/verify-server-stack.mjs`'s
 * health check already use: a short attempt makes the budget buy attempts,
 * where one long timeout spends everything on the first, coldest response.
 *
 * A real HTTP response is final either way — a non-`200` means the function
 * answered, and retrying an identical request will not change its answer. Only
 * a fetch that produced **no** response at all (a timeout, a dropped
 * connection, a worker still booting) is retried. `null` rather than a throw
 * is the contract, so a caller inside `expect.poll` gets a retryable value
 * instead of an escaped exception.
 *
 * The retry loop lives here, taking an injected `fetch`, so
 * `tests/unit/server-e2e-fetch-budgets.test.ts` can drive it with no live
 * stack — the injected-collaborator pattern this repository already applies to
 * `whoami-check`'s `ResolveCaller` and `guestSession.ts`'s `GuestAuthClient`.
 */

import type { SaveDocumentV2 } from '../../src/persistence';

/** The `GET /v1/save` success body: the stored revision and its document. */
export interface CloudSaveBody {
  readonly revision: number;
  readonly document: SaveDocumentV2;
}

/**
 * Worst case ≈ 15.5 s, inside the 20 s `expect.poll` budget every caller
 * already declares — the poll must be able to give up before its own timeout
 * elapses, not after.
 */
export const CLOUD_SAVE_MAX_ATTEMPTS = 3;
export const CLOUD_SAVE_ATTEMPT_TIMEOUT_MS = 5_000;
export const CLOUD_SAVE_RETRY_DELAY_MS = 250;

export interface ReadCloudSaveOptions {
  /** Injected so a unit test needs no live stack and no browser. */
  readonly fetchImpl?: typeof fetch;
  readonly maxAttempts?: number;
  readonly attemptTimeoutMs?: number;
  readonly retryDelayMs?: number;
}

/**
 * Downloads the caller's cloud save, or `null` when the account has none, the
 * server answered any non-`200`, or no response arrived within the whole
 * attempt budget. Never throws.
 */
export async function readCloudSave(
  url: string,
  accessToken: string,
  options: ReadCloudSaveOptions = {},
): Promise<CloudSaveBody | null> {
  const {
    fetchImpl = fetch,
    maxAttempts = CLOUD_SAVE_MAX_ATTEMPTS,
    attemptTimeoutMs = CLOUD_SAVE_ATTEMPT_TIMEOUT_MS,
    retryDelayMs = CLOUD_SAVE_RETRY_DELAY_MS,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(attemptTimeoutMs),
      });
    } catch {
      // No response at all — still booting, or the connection dropped. The
      // only condition worth another attempt.
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
      continue;
    }

    if (response.status !== 200) {
      return null;
    }
    return (await response.json()) as CloudSaveBody;
  }

  return null;
}
