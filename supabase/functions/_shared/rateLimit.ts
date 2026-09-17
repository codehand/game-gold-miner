/**
 * Shared abuse limits for Cat Mine Idle Edge Functions — server-milestone
 * Step 25.
 *
 * Step 25's instruction is to "rate-limit uploads, authentication, and
 * recovery-code redemption per user and per address". `recovery-code` grew the
 * first, minimal, per-address limiter at Step 14 as a deliberate interim seam
 * ("so Step 25 can swap in a persistent, distributed implementation without
 * touching `handleRedeem` itself"). This module is that seam cashed in: the
 * mechanism moves here once, so `save-sync`, `telegram-sign-in` and
 * `recovery-code` share one implementation instead of three.
 *
 * ## What this limiter is, and is not
 *
 * **It is a fixed-window counter.** One (window start, count) pair per key, in
 * a `Map`. A key's window opens on its first attempt and admits up to `limit`
 * attempts until `windowMs` elapses, then rolls. Fixed windows have a known
 * boundary-burst weakness — a caller can spend a full window's budget just
 * before the boundary and another just after, so the instantaneous ceiling is
 * up to 2×`limit` — and that is accepted here for the same reason the
 * alternative is rejected: a sliding window needs one timestamp per attempt
 * per key, which is exactly the unbounded, attacker-growable state
 * `pruneExpiredEntries` exists to bound. The recovery-code limiter this
 * replaces was sliding; the observable contract that mattered ("30 attempts
 * per minute, then 429 with `Retry-After`") is unchanged, and the unit tests
 * pin it from both sides.
 *
 * **It is best-effort, not a security boundary (design constraint 1).**
 * Edge workers are multi-instance and recycled, so an in-memory `Map` limits
 * one worker's view, not the platform's: an attacker with parallelism — many
 * concurrent connections landing on different workers — sees an effective
 * ceiling up to `workers × limit`, and a recycling worker forgets its windows
 * entirely. That is stated here rather than hidden, and it is the same
 * position `memory-bank/server-threat-model.md` §4.6 already accepts in
 * writing ("a determined attacker with many addresses" is not defended). The
 * real backstop behind recovery-code redemption is the code's own 128-bit
 * entropy; behind an upload flood it is Step 23's progress bound plus the
 * per-account row, neither of which this limiter replaces. This limiter's job
 * is to make the *cheap* abuses — unauthenticated request floods, a single
 * session hammering an endpoint, brute-force-shaped traffic — cost the service
 * bounded work, and to bound Step 24's L2 amplification
 * (1 request → 1 service-role audit write) by refusing before that write.
 *
 * **A caller with no observable address is never throttled.** See
 * `extractCallerAddress`.
 *
 * ## Testability
 *
 * The clock and the store are both injected (`RateLimiterOptions.clockMs`,
 * `RateLimiterOptions.store`), so `rateLimit.test.ts` drives window rolls,
 * prune pressure and per-key independence deterministically under
 * `deno test supabase/functions` with no `--allow-*` flag, no Docker and no
 * waits. `Date.now()` and the module-scoped store appear only in the
 * per-function wiring at the bottom of each `index.ts`.
 */

import { errorResponse } from './http.ts';

/** One key's live fixed window. */
export interface RateLimitEntry {
  readonly windowStartMs: number;
  readonly count: number;
}

/**
 * The minimal state a limiter needs, so a test can substitute a store that
 * counts calls or a shared instance can back several limiters.
 */
export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
  keys(): IterableIterator<string>;
}

export function createInMemoryRateLimitStore(): RateLimitStore {
  const entries = new Map<string, RateLimitEntry>();
  return {
    get: (key) => entries.get(key),
    set: (key, entry) => {
      entries.set(key, entry);
    },
    delete: (key) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
    keys: () => entries.keys(),
  };
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /**
   * Seconds until the caller may retry, as `Retry-After` and §10.2's
   * `detail.retryAfterSeconds` both need. Always ≥ 1 when refused (a
   * sub-second remainder rounded down to 0 would tell a client to retry
   * immediately into the same full window) and 0 when allowed.
   */
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  /**
   * Records one attempt against `key` and reports whether it may proceed.
   * `null` means "no key to bucket this caller by" and is always allowed —
   * see `extractCallerAddress` for why funneling those into one bucket would
   * be a global-denial footgun rather than a safety margin.
   */
  check(key: string | null): Promise<RateLimitDecision>;
}

export interface RateLimiterOptions {
  /** Attempts admitted per window. Every call site derives this from a documented cadence — see the `*_MAX_*` constants in each function. */
  readonly limit: number;
  readonly windowMs: number;
  /** Injected so tests roll the window without waiting; `Date.now` only at the call sites. */
  readonly clockMs: () => number;
  readonly store: RateLimitStore;
  /**
   * Sweep expired keys only once the store has grown past this many entries.
   * The same rule `recovery-code`'s Step 14 limiter arrived at after a
   * 2026-09-13 review finding: sweeping every request under a rotated-address
   * attack (where nothing is expired *yet* when each new key arrives) is O(n)
   * per request, trading unbounded memory for quadratic CPU. Gating on size
   * makes the sweep amortized, and by the time the store is this large a
   * single sweep reliably drops it back under the threshold.
   */
  readonly pruneSizeThreshold?: number;
}

export const DEFAULT_PRUNE_SIZE_THRESHOLD = 1_000;

/**
 * Drops every key whose window has elapsed. Bounds the store to keys with a
 * *live* attempt inside the current window — a small, self-limiting set
 * regardless of how many distinct keys have ever been seen, which is what
 * makes an attacker rotating addresses or account ids unable to grow it
 * without bound.
 */
function pruneExpiredEntries(store: RateLimitStore, nowMs: number, windowMs: number): void {
  for (const key of [...store.keys()]) {
    const entry = store.get(key);
    if (entry === undefined || nowMs - entry.windowStartMs >= windowMs) {
      store.delete(key);
    }
  }
}

export function createFixedWindowRateLimiter(options: RateLimiterOptions): RateLimiter {
  const {
    limit,
    windowMs,
    clockMs,
    store,
    pruneSizeThreshold = DEFAULT_PRUNE_SIZE_THRESHOLD,
  } = options;

  return {
    check(key: string | null): Promise<RateLimitDecision> {
      if (key === null) {
        return Promise.resolve({ allowed: true, retryAfterSeconds: 0 });
      }

      const nowMs = clockMs();
      if (store.size > pruneSizeThreshold) {
        pruneExpiredEntries(store, nowMs, windowMs);
      }

      const entry = store.get(key);
      if (entry === undefined || nowMs - entry.windowStartMs >= windowMs) {
        store.set(key, { windowStartMs: nowMs, count: 1 });
        return Promise.resolve({ allowed: true, retryAfterSeconds: 0 });
      }

      if (entry.count >= limit) {
        return Promise.resolve({
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((entry.windowStartMs + windowMs - nowMs) / 1000)),
        });
      }

      store.set(key, { windowStartMs: entry.windowStartMs, count: entry.count + 1 });
      return Promise.resolve({ allowed: true, retryAfterSeconds: 0 });
    },
  };
}

/**
 * The *last* hop in `X-Forwarded-For` — the one this platform's own gateway
 * (Kong locally, Supabase's edge network in production) appended, and
 * therefore the one entry in the list a client cannot forge by prepending
 * fake addresses of its own — or `null` when the header is absent entirely.
 *
 * **A client-supplied `X-Forwarded-For` is never authority.** Reading the
 * first hop would let any caller mint an unlimited supply of fresh buckets by
 * prepending a random address per request, which is exactly the attack a
 * per-address limit exists to blunt. `null` means "no address to bucket by",
 * not "one shared address for every such caller": bucketing those together
 * would let a single header-less caller deny every other one.
 *
 * Extracted from `recovery-code`'s Step 14 helper unchanged (that function
 * still has the same behaviour, now via this shared copy) so `save-sync` and
 * `telegram-sign-in` can use one reading of the header rather than three that
 * could drift.
 */
export function extractCallerAddress(request: Request): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (!forwardedFor) {
    return null;
  }
  const hops = forwardedFor.split(',');
  return hops[hops.length - 1].trim();
}

/** Namespace prefix so one store can hold address and user keys without a collision. */
export function addressRateLimitKey(address: string | null): string | null {
  return address === null ? null : `address:${address}`;
}

export function userRateLimitKey(userId: string): string {
  return `user:${userId}`;
}

/**
 * The one `429` shape every endpoint answers, taken literally from
 * `memory-bank/server-save-sync-protocol.md` §10.2 and reused by §10.3:
 * code `rate_limited`, a `Retry-After` header, and the same number inside
 * `detail.retryAfterSeconds`. §4's "player sees" column for this row is empty
 * — a `429` is self-healing and must never surface a notice, so nothing here
 * adds one.
 */
export function rateLimitedResponse(origin: string | null, retryAfterSeconds: number): Response {
  return errorResponse(429, 'rate_limited', 'Too many requests.', {
    detail: { retryAfterSeconds },
    retryAfterSeconds,
    origin,
  });
}
