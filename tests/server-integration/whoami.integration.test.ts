import { beforeAll, describe, expect, it } from 'vitest';

import {
  FIXTURE_DISPLAY_NAME,
  FIXTURE_USER_ID,
  mintFixtureUserToken,
  mintTokenSignedWithWrongSecret,
} from './authFixture';

/**
 * Server-milestone Step 7: integration tests against the local stack with a
 * real database. Assumes `supabase start` + `supabase db reset` have already
 * run against the current migrations and seed — `scripts/verify-server-stack.mjs`
 * runs this suite in that order, right after the migration/health checks.
 *
 * This is the counterpart to `supabase/functions/whoami-check/index.test.ts`:
 * that file proves the pure HTTP logic for every case with an injected fake;
 * this file proves the one real collaborator, `resolveCallerViaSupabaseAuth`,
 * actually authenticates against live GoTrue and reads the seeded fixture's
 * real `profiles` row under row-level security.
 */
const WHOAMI_URL = 'http://127.0.0.1:54321/functions/v1/whoami-check';
const WARMUP_MAX_ATTEMPTS = 20;
const WARMUP_ATTEMPT_TIMEOUT_MS = 2_000;
const WARMUP_RETRY_DELAY_MS = 1_000;
// Must exceed the worst case the loop below can actually take:
// WARMUP_MAX_ATTEMPTS * (WARMUP_ATTEMPT_TIMEOUT_MS + WARMUP_RETRY_DELAY_MS),
// plus headroom. The regular per-test timeout (20 s, `callWhoAmI` below) is
// deliberately longer than this warm-up one — a single slow response during
// an actual assertion should still be given room, where a warm-up attempt
// should fail fast so the retry loop can burn through its budget instead of
// stalling on its first attempt.
const WARMUP_HOOK_TIMEOUT_MS = 70_000;

async function callWhoAmI(authorizationHeader?: string): Promise<Response> {
  return fetch(WHOAMI_URL, {
    headers: authorizationHeader ? { authorization: authorizationHeader } : {},
    signal: AbortSignal.timeout(20_000),
  });
}

describe('whoami-check (server-milestone Step 7)', () => {
  beforeAll(async () => {
    // The edge runtime cold-starts a worker on the first request to a
    // function; give that one request room to fail on a slow first boot
    // rather than every test below racing it independently. This loop's own
    // per-attempt timeout is intentionally short (2 s, not the 20 s
    // `callWhoAmI` below uses) so 20 attempts a second apart can actually fit
    // inside the hook's own timeout — a 20 s per-attempt timeout here would
    // let one hung attempt consume the entire hook budget by itself.
    for (let attempt = 1; attempt <= WARMUP_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(WHOAMI_URL, {
          headers: { authorization: `Bearer ${mintFixtureUserToken()}` },
          signal: AbortSignal.timeout(WARMUP_ATTEMPT_TIMEOUT_MS),
        });
        await response.body?.cancel();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, WARMUP_RETRY_DELAY_MS));
      }
    }
    // Not fatal: the tests below will fail with their own specific errors if
    // the function never came up. Logged so that failure is not mistaken for
    // an unrelated one when it is actually "the warm-up never got a response
    // at all."
    console.warn(
      `whoami-check warm-up: no response after ${WARMUP_MAX_ATTEMPTS} attempts.`,
    );
  }, WARMUP_HOOK_TIMEOUT_MS);

  it('answers 200 with the seeded fixture guest for a valid token', async () => {
    const response = await callWhoAmI(`Bearer ${mintFixtureUserToken()}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: FIXTURE_USER_ID,
      displayName: FIXTURE_DISPLAY_NAME,
    });
  });

  it('answers 401 with no Authorization header', async () => {
    const response = await callWhoAmI();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('unauthenticated');
  });

  it('answers 401 for a syntactically invalid token', async () => {
    const response = await callWhoAmI('Bearer not-a-jwt');

    expect(response.status).toBe(401);
  });

  it('answers 401 for a well-formed token signed with the wrong secret', async () => {
    const response = await callWhoAmI(`Bearer ${mintTokenSignedWithWrongSecret()}`);

    expect(response.status).toBe(401);
  });

  it('answers 401 for an expired token', async () => {
    const response = await callWhoAmI(`Bearer ${mintFixtureUserToken({ expiresInSeconds: -60 })}`);

    expect(response.status).toBe(401);
  });

  it('answers 400 for a non-GET method', async () => {
    const response = await fetch(WHOAMI_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${mintFixtureUserToken()}` },
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.status).toBe(400);
  });
});
