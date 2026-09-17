/**
 * Server-milestone Step 25 — `deno test supabase/functions`, no `--allow-*`
 * flag, no Docker, no waiting: the clock and the store are both injected, so
 * every window roll below is arithmetic rather than elapsed time.
 *
 * The four properties Step 25's acceptance criteria name for the shared
 * limiter are each pinned here: admit up to the limit inside a window and
 * refuse the next with `429` + `Retry-After` + §10.2's body; admit again after
 * the window rolls; key independently per user and per address; and prune so
 * the store cannot grow without bound.
 */
import assert from 'node:assert/strict';

import {
  addressRateLimitKey,
  createFixedWindowRateLimiter,
  createInMemoryRateLimitStore,
  extractCallerAddress,
  rateLimitedResponse,
  userRateLimitKey,
  type RateLimitStore,
} from './rateLimit.ts';

/** A clock the test moves by hand, so no assertion depends on elapsed time. */
function controllableClock(startMs = 0): { readonly nowMs: () => number; readonly set: (ms: number) => void } {
  let current = startMs;
  return { nowMs: () => current, set: (ms) => { current = ms; } };
}

interface LimiterHarness {
  readonly limiter: ReturnType<typeof createFixedWindowRateLimiter>;
  readonly store: RateLimitStore;
  readonly clock: ReturnType<typeof controllableClock>;
}

function harness(limit: number, windowMs: number, pruneSizeThreshold?: number): LimiterHarness {
  const clock = controllableClock();
  const store = createInMemoryRateLimitStore();
  return {
    store,
    clock,
    limiter: createFixedWindowRateLimiter({
      limit,
      windowMs,
      clockMs: clock.nowMs,
      store,
      ...(pruneSizeThreshold === undefined ? {} : { pruneSizeThreshold }),
    }),
  };
}

Deno.test('admits exactly up to the limit inside one window, then refuses with Retry-After', async () => {
  const { limiter, clock } = harness(3, 60_000);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const decision = await limiter.check('user:a');
    assert.equal(decision.allowed, true, `attempt ${attempt} should have been admitted`);
    assert.equal(decision.retryAfterSeconds, 0);
  }

  const refused = await limiter.check('user:a');
  assert.equal(refused.allowed, false);
  // The window opened at t=0 with windowMs=60_000, so a refusal at t=0 is a
  // full 60 seconds of waiting — never 0, which would send the client
  // straight back into the same full window.
  assert.equal(refused.retryAfterSeconds, 60);
});

Deno.test('Retry-After counts down with the window and never rounds down to zero', async () => {
  const { limiter, clock } = harness(1, 60_000);

  await limiter.check('user:a');
  clock.set(30_500);
  const refused = await limiter.check('user:a');

  assert.equal(refused.allowed, false);
  // 29.5 s remain; telling the client 29 would have it retry while the window
  // is still open, so the remainder rounds *up*.
  assert.equal(refused.retryAfterSeconds, 30);

  // A sub-second remainder still has to be at least 1 second.
  clock.set(59_999);
  const atTheEdge = await limiter.check('user:a');
  assert.equal(atTheEdge.allowed, false);
  assert.equal(atTheEdge.retryAfterSeconds, 1);
});

Deno.test('admits again once the window rolls', async () => {
  const { limiter, clock } = harness(2, 60_000);

  await limiter.check('user:a');
  await limiter.check('user:a');
  assert.equal((await limiter.check('user:a')).allowed, false);

  clock.set(60_000);
  const afterRoll = await limiter.check('user:a');
  assert.equal(afterRoll.allowed, true);
  assert.equal(afterRoll.retryAfterSeconds, 0);

  // The rolled window is a *fresh* window, not a reset of the old one: the
  // budget is the full limit again, and the next refusal is one attempt later.
  assert.equal((await limiter.check('user:a')).allowed, true);
  assert.equal((await limiter.check('user:a')).allowed, false);
});

Deno.test('keys independently per user and per address', async () => {
  const { limiter } = harness(2, 60_000);

  const sharedAddress = addressRateLimitKey('203.0.113.7');
  const firstUser = userRateLimitKey('user-1');
  const secondUser = userRateLimitKey('user-2');

  // Exhaust user 1's bucket without touching the address bucket.
  await limiter.check(firstUser);
  await limiter.check(firstUser);
  assert.equal((await limiter.check(firstUser)).allowed, false);

  // A different user from the same address is unaffected...
  assert.equal((await limiter.check(secondUser)).allowed, true);
  // ...and the address bucket still has its whole budget, because neither
  // user check consumed it.
  assert.equal((await limiter.check(sharedAddress)).allowed, true);
  assert.equal((await limiter.check(sharedAddress)).allowed, true);
  assert.equal((await limiter.check(sharedAddress)).allowed, false);

  // Exhausting the address does not retroactively refuse the users on it.
  assert.equal((await limiter.check(secondUser)).allowed, true);
});

Deno.test('a null key is never throttled', async () => {
  const { limiter } = harness(1, 60_000);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const decision = await limiter.check(null);
    assert.equal(decision.allowed, true);
    assert.equal(decision.retryAfterSeconds, 0);
  }
});

Deno.test('prunes expired keys once the store passes the size threshold, bounding memory', async () => {
  const PRUNE_THRESHOLD = 10;
  const { limiter, store, clock } = harness(1, 1_000, PRUNE_THRESHOLD);

  // Below the threshold the sweep is deliberately skipped (that is the
  // amortization: sweeping under a rotated-key attack is O(n) per request
  // when nothing is expired yet), so the store simply grows.
  for (let index = 0; index < PRUNE_THRESHOLD; index += 1) {
    await limiter.check(`address:10.0.0.${index}`);
  }
  assert.equal(store.size, PRUNE_THRESHOLD);

  // Rotate through many more keys, each in its own window, without ever
  // advancing the clock far enough for them to expire: the store must stay
  // bounded by the threshold plus one sweep's worth of live keys, not grow by
  // one entry per request forever.
  for (let index = 0; index < 200; index += 1) {
    await limiter.check(`address:10.0.1.${index}`);
  }

  // Nothing has expired yet, so every sweep finds nothing to drop — this is
  // the worst case the threshold exists to bound, and the store is still only
  // the number of *live* keys.
  assert.equal(store.size, PRUNE_THRESHOLD + 200);

  // Once a window has elapsed, the next request's sweep clears the backlog in
  // one pass.
  clock.set(1_000);
  await limiter.check('address:10.0.2.1');
  assert.equal(store.size, 1);
});

Deno.test('extractCallerAddress reads the gateway-appended last hop, and null when absent', () => {
  const forged = new Request('http://localhost/v1/save', {
    headers: { 'x-forwarded-for': '198.51.100.9, 203.0.113.7' },
  });
  // The client can send whatever it likes first; only the hop the platform's
  // own gateway appended (last) is read.
  assert.equal(extractCallerAddress(forged), '203.0.113.7');

  const single = new Request('http://localhost/v1/save', {
    headers: { 'x-forwarded-for': '203.0.113.7' },
  });
  assert.equal(extractCallerAddress(single), '203.0.113.7');

  const absent = new Request('http://localhost/v1/save');
  assert.equal(extractCallerAddress(absent), null);
  assert.equal(addressRateLimitKey(null), null);
});

Deno.test('rateLimitedResponse matches §10.2 exactly: code, Retry-After header, detail, no notice', async () => {
  const response = rateLimitedResponse('http://127.0.0.1:5173', 30);

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '30');
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'http://127.0.0.1:5173',
  );

  const body = (await response.json()) as {
    error: { code: string; message: string; detail?: { retryAfterSeconds?: number } };
  };
  assert.deepEqual(body, {
    error: {
      code: 'rate_limited',
      message: 'Too many requests.',
      detail: { retryAfterSeconds: 30 },
    },
  });
  // §4's "player sees" column for `rate_limited` is empty — there is no
  // notice field to add and this response carries none.
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'detail', 'message']);
});

Deno.test('a response without an allow-listed origin carries no CORS header, as elsewhere', () => {
  const response = rateLimitedResponse('https://not-our-origin.example', 5);

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
