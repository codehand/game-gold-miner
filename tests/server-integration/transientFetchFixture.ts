/**
 * One burst attempt that survives a transient stall.
 *
 * A 2026-09-16 CI finding, from the `server` job's own log: the run's only
 * failure was `recovery-code.integration.test.ts`'s throttle test, and it died
 * on its **first** iteration — the test reported 20171 ms total, one single
 * request spending the whole 20 s budget — with undici's `TimeoutError`. By
 * that point the worker was warm (the same file had already served roughly
 * ninety requests), so this was contention or worker loss rather than cold
 * start: 16 Vitest files run in parallel against one edge-runtime container on
 * 4 vCPU shared with Postgres, GoTrue, Kong and the rest of the stack. A
 * stalled request is not a product failure — the burst loops only need to
 * observe that repeated attempts *eventually* answer `429`.
 *
 * So each attempt fails fast and, only when **no** response arrived at all,
 * retries — the shape `whoami.integration.test.ts`'s warm-up,
 * `scripts/verify-server-stack.mjs`'s health check and
 * `tests/server-e2e/cloudSaveFixture.ts` already use. A real HTTP response is
 * final: a `401` or a `429` is the function answering, and repeating an
 * identical request cannot change it.
 *
 * `null` — never a throw — is the contract, so a caller's loop decides what a
 * never-answered attempt means. What it must never mean is "rate limited": the
 * limiter answering `429` is the observation these tests exist to make, and a
 * timeout is not that observation.
 *
 * The retry loop lives here, taking an injected `fetch`, so
 * `tests/unit/server-integration-fetch-retry.test.ts` drives it with no live
 * stack and no Docker — the injected-collaborator pattern `whoami-check`'s
 * `ResolveCaller` and `guestSession.ts`'s `GuestAuthClient` already establish.
 *
 * Kept separate from `tests/server-e2e/cloudSaveFixture.ts`, which solves the
 * same problem for the Playwright suite: the two suites are separate harnesses
 * with separate configs and separate time budgets, and neither imports from the
 * other's directory. Each is paired with its own unit test.
 */

/**
 * Per-attempt budget, unchanged from the literal the burst loops carried
 * before this fix — the same 20 s the rest of the integration suite declares.
 * The budget was never what was wrong here; the missing retry around it was,
 * exactly as `vitest.server-integration.config.ts` records for `testTimeout`
 * and `hookTimeout`.
 */
export const TRANSIENT_FETCH_ATTEMPT_TIMEOUT_MS = 20_000;

/**
 * Two attempts is one retry: enough to absorb the single stall CI saw, while a
 * genuinely unresponsive function still ends the burst inside its own budget
 * instead of hanging. An attempt that timed out may or may not have been
 * counted by `recovery-code`'s limiter; the burst loops' own 45-attempt bound
 * absorbs either, which is why this does not try to be cleverer than one retry.
 */
export const TRANSIENT_FETCH_MAX_ATTEMPTS = 2;

export const TRANSIENT_FETCH_RETRY_DELAY_MS = 250;

export interface TransientFetchOptions {
  /** Injected so a unit test needs no live stack. */
  readonly fetchImpl?: typeof fetch;
  readonly attemptTimeoutMs?: number;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
}

/**
 * Sends `init` to `url`, retrying only while nothing answers at all. Resolves
 * the first `Response` whatever its status, or `null` when every attempt went
 * unanswered. The `signal` is rebuilt per attempt, so a budget spent on the
 * first attempt does not abort the second before it starts.
 */
export async function fetchToleratingStall(
  url: string,
  init: RequestInit,
  options: TransientFetchOptions = {},
): Promise<Response | null> {
  const {
    fetchImpl = fetch,
    attemptTimeoutMs = TRANSIENT_FETCH_ATTEMPT_TIMEOUT_MS,
    maxAttempts = TRANSIENT_FETCH_MAX_ATTEMPTS,
    retryDelayMs = TRANSIENT_FETCH_RETRY_DELAY_MS,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(attemptTimeoutMs) });
    } catch {
      // No response at all — still stalled, or the connection dropped. The
      // only condition worth another attempt.
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return null;
}
