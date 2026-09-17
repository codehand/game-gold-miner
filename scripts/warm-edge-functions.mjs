/**
 * Pays every Edge Function's first-request cost once, before any suite runs.
 *
 * A 2026-09-16 finding: `npm run verify:server` passes on a developer machine
 * and failed on the GitHub Actions `server` job with undici's
 * `TimeoutError: The operation was aborted due to timeout`. Nothing is
 * configured differently in CI — the asymmetry is the edge runtime's module
 * cache. Four functions import `npm:@supabase/supabase-js@2.116.0`, which the
 * runtime resolves from an empty cache on a cold runner, so the first request
 * to each function boots a worker that has to fetch and instantiate that
 * dependency before it can answer anything. Locally the container's cache is
 * warm from earlier runs, so the same request answers in milliseconds. Every
 * timing-sensitive call in this stack therefore had a hard budget and no retry
 * against a first response that is slow only on a cold machine.
 *
 * The fix here is the general one rather than a patch per caller: warm every
 * function once, with a retry budget, after the stack is confirmed live and
 * before any suite runs. `whoami-check` and `telegram-sign-in` still warm
 * themselves in their own `beforeAll` (that keeps each suite runnable on its
 * own, without this script), and `save-sync`/`core-portability-check` already
 * have retrying checks in `scripts/verify-server-stack.mjs`; this pass removes
 * the class instead of adding a fourth special case. The function list is read
 * from `supabase/functions/` for the same reason `readExpectedMigrations` reads
 * `supabase/migrations/` from disk: a hand-kept list stops covering the next
 * function someone adds, and says nothing about it.
 *
 * ## Why the probe is a refused request, not a CORS preflight
 *
 * The obvious side-effect-free probe is an `OPTIONS` preflight — every
 * function answers one before its router, per finding F11. On this local stack
 * it does not work: the Kong gateway in front of the edge runtime answers
 * `OPTIONS` itself (`Server: kong/2.8.1`, a synthesised `Access-Control-Allow-
 * Origin: *`, no function envelope, 0-4 ms), exactly the same gateway finding
 * F12 already records for CORS headers. A preflight therefore proves the
 * gateway is up and does **not** boot the worker this module exists to warm.
 *
 * What is used instead is a request every function refuses: `DELETE` on a path
 * no function routes. That reaches the worker (each answer carries that
 * function's own envelope, e.g. `{"error":{"code":"malformed_request",
 * "message":"Unknown route."}}`), and returns from the router's default branch
 * before any auth, body read, rate-limit or database work. **Any** HTTP
 * response, including a refusal, proves the worker booted — which is the only
 * property a warm-up needs. It is also specifically safe for `recovery-code`'s
 * shared bucket: `handleRequest` resolves the route first and returns the
 * unknown-route refusal at `index.ts:775`, long before `handleRedeem` calls
 * `checkRedemptionRateLimit`.
 *
 * ## Why a short attempt with retries
 *
 * The same shape `whoami.integration.test.ts`'s own warm-up documents: a
 * warm-up attempt should fail fast so the attempt budget buys retries, rather
 * than one long attempt stalling on a machine that is cold and slow. This
 * module's per-attempt timeout is deliberately much shorter than any real
 * assertion's, and it is never a caller's assertion budget.
 *
 * The retry loop lives here, in plain JavaScript, rather than inline in each
 * caller, so `tests/unit/edge-function-warmup.test.ts` can drive it with an
 * injected `fetch` and no Docker — the same injected-collaborator pattern
 * `whoami-check`'s `ResolveCaller` and `guestSession.ts`'s `GuestAuthClient`
 * already establish.
 */

import { readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Attempts per function. Generous because the budget is cheap: each failed
 * attempt is a fast timeout, and a cold worker that resolves a fresh npm
 * dependency can take tens of seconds on a loaded runner.
 */
export const WARMUP_MAX_ATTEMPTS = 20;

/**
 * Intentionally short (see "Why a short attempt with retries" above). A real
 * assertion against a warmed function keeps its own, much longer, single
 * budget.
 */
export const WARMUP_ATTEMPT_TIMEOUT_MS = 2_000;

export const WARMUP_RETRY_DELAY_MS = 1_000;

/**
 * The worst case the retry loop below can actually take, so a caller that wraps
 * a warm-up in a hook can size that hook above it rather than guessing.
 */
export const WARMUP_WORST_CASE_MS =
  WARMUP_MAX_ATTEMPTS * (WARMUP_ATTEMPT_TIMEOUT_MS + WARMUP_RETRY_DELAY_MS);

/** See "Why the probe is a refused request, not a CORS preflight" above. */
export const WARMUP_PROBE_METHOD = 'DELETE';
export const WARMUP_PROBE_PATH_SUFFIX = '__warmup';

/**
 * Every deployable Edge Function, read from disk rather than hand-listed.
 * `_shared/` holds library code with no `index.ts` and no `config.toml` entry,
 * so it is excluded rather than exempted by name — the same rule
 * `tests/unit/server-stack.test.ts`'s `edgeFunctionNames` applies.
 */
export function readEdgeFunctionNames(functionsDirectory) {
  return readdirSync(functionsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name)
    .sort();
}

/**
 * Warms one function's worker. Resolves `responded: false` — never throws —
 * when the function answered nothing at all within the attempt budget, so a
 * caller can report or log the failure instead of dying on it.
 */
export async function warmEdgeFunction(name, options = {}) {
  const {
    functionsBaseUrl,
    fetchImpl = fetch,
    maxAttempts = WARMUP_MAX_ATTEMPTS,
    attemptTimeoutMs = WARMUP_ATTEMPT_TIMEOUT_MS,
    retryDelayMs = WARMUP_RETRY_DELAY_MS,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(
        `${functionsBaseUrl}/${name}/${WARMUP_PROBE_PATH_SUFFIX}`,
        { method: WARMUP_PROBE_METHOD, signal: AbortSignal.timeout(attemptTimeoutMs) },
      );
      await response.body?.cancel();
      // Any status counts: a refusal is the expected answer, and it already
      // proves the worker booted and ran its router.
      return { name, responded: true, attempts: attempt, status: response.status };
    } catch {
      // No HTTP response at all — still booting, or the container is not
      // reachable yet. The only condition worth retrying.
    }
    if (attempt < maxAttempts) {
      await delay(retryDelayMs);
    }
  }

  return { name, responded: false, attempts: maxAttempts, status: 0 };
}

/**
 * Warms every function under `functionsDirectory`, oldest-first by name.
 * Sequential rather than concurrent: each function cold-starts its own worker,
 * and booting five isolates at once on a 4-vCPU CI runner competes for exactly
 * the resource this pass exists to leave free for the suites.
 */
export async function warmEdgeFunctions(options) {
  const { functionsDirectory, ...perFunctionOptions } = options;
  const results = [];
  for (const name of readEdgeFunctionNames(functionsDirectory)) {
    results.push(await warmEdgeFunction(name, perFunctionOptions));
  }
  return results;
}
