import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY } from './authFixture';

/**
 * Server-milestone Step 9: "Add the profiles table with RLS allowing a user
 * to read and update only their own row. Create the profile on sign-up
 * through a trigger or the sign-in function, not from the client." Test:
 * "An integration test proves user A cannot read or write user B's profile
 * through PostgREST with A's token, for select, insert, update, and delete."
 *
 * `profiles` and its select/update-own-row policies already exist as part of
 * the Step 5 migration; what this step adds is the `on_auth_user_created`
 * trigger, so this suite also has to prove that trigger, not a manual seed,
 * is what puts a row there. Three *real* anonymous identities — minted
 * through live Supabase Auth via `signInAnonymously()`, the same call
 * `src/platform/web/guestSession.ts` makes — give each test a genuine second
 * (or third) user whose profile row only exists because the trigger created
 * it, rather than a hand-signed token for an id nothing backs.
 *
 * `userA` and `userB` are never mutated by any test below; only `userC` is
 * ever written to, so no test's outcome depends on another test having run
 * first — the suite passes under `--sequence.shuffle` or any reordering.
 *
 * Assumes `supabase start` + `supabase db reset` have already run against the
 * current migrations — `scripts/verify-server-stack.mjs` runs this suite
 * after both, alongside `whoami.integration.test.ts`.
 */
const API_URL = 'http://127.0.0.1:54321';
const REST_URL = `${API_URL}/rest/v1`;
/** The database and this test process have separate clocks; allow for their skew. */
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

interface GuestIdentity {
  readonly userId: string;
  readonly accessToken: string;
}

async function createGuestIdentity(): Promise<GuestIdentity> {
  const client = createClient(API_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no session returned'}`);
  }
  return { userId: data.user.id, accessToken: data.session.access_token };
}

/** Direct PostgREST call against `profiles`, exactly as a client would make it. */
function profilesRequest(accessToken: string, query: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${REST_URL}/profiles${query}`, {
    ...init,
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

describe('profiles row-level security (server-milestone Step 9)', () => {
  let userA: GuestIdentity;
  let userB: GuestIdentity;
  let userC: GuestIdentity;
  /** Captured immediately before `userA` signs up, to bound how fresh its trigger-created row must be. */
  let beforeUserASignUp: number;

  beforeAll(async () => {
    // Three independent real anonymous sign-ins, the same call every guest
    // makes at boot; each must land its own `auth.users` row and — the thing
    // this step actually adds — its own `profiles` row, with nothing here
    // inserting one by hand. `userC` is dedicated to the one test that
    // mutates a row, so `userA`/`userB` stay read-only fixtures the rest of
    // this suite can depend on regardless of test order.
    beforeUserASignUp = Date.now();
    [userA, userB, userC] = await Promise.all([
      createGuestIdentity(),
      createGuestIdentity(),
      createGuestIdentity(),
    ]);
    expect(new Set([userA.userId, userB.userId, userC.userId]).size).toBe(3);
  }, 30_000);

  it('creates a profile row on sign-up through the trigger, not the client', async () => {
    // Distinct from "lets a user select their own row" below, which is only
    // a policy check: this asserts the row's `created_at` falls inside the
    // sign-up call itself, which is what proves the trigger — not a manual
    // seed, and not a row that merely happened to already exist — is what
    // put it there.
    const response = await profilesRequest(
      userA.accessToken,
      `?id=eq.${userA.userId}&select=id,display_name,created_at`,
    );
    const afterUserASignUp = Date.now();

    expect(response.status).toBe(200);
    const [row] = await response.json();
    expect(row).toMatchObject({ id: userA.userId, display_name: null });
    const createdAtMs = Date.parse(row.created_at);
    // `created_at` is the database's clock and the bounds are the test
    // process's, so a small skew between the Postgres container and the host
    // must be tolerated on both sides or this fails on a clock difference that
    // says nothing about the trigger.
    expect(createdAtMs).toBeGreaterThanOrEqual(beforeUserASignUp - CLOCK_SKEW_TOLERANCE_MS);
    expect(createdAtMs).toBeLessThanOrEqual(afterUserASignUp + CLOCK_SKEW_TOLERANCE_MS);
  });

  it('lets a user select their own row', async () => {
    const response = await profilesRequest(userA.accessToken, `?id=eq.${userA.userId}&select=id,display_name`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: userA.userId, display_name: null }]);
  });

  it('lets a user update their own row', async () => {
    const response = await profilesRequest(
      userC.accessToken,
      `?id=eq.${userC.userId}&select=id,display_name`,
      {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ display_name: 'Alice' }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: userC.userId, display_name: 'Alice' }]);
  });

  it("hides another user's row from select", async () => {
    const response = await profilesRequest(userA.accessToken, `?id=eq.${userB.userId}&select=id,display_name`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("refuses to update another user's row", async () => {
    const attempt = await profilesRequest(userA.accessToken, `?id=eq.${userB.userId}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ display_name: 'Hijacked' }),
    });

    // The row-visibility filter behind the update policy excludes B's row
    // entirely, so PostgREST reports success against zero matched rows
    // rather than an error.
    expect(attempt.status).toBe(200);
    expect(await attempt.json()).toEqual([]);

    const verify = await profilesRequest(userB.accessToken, `?id=eq.${userB.userId}&select=display_name`);
    expect(await verify.json()).toEqual([{ display_name: null }]);
  });

  it("refuses to insert a row impersonating another user's id", async () => {
    // `profiles` carries no insert policy at all, so every client insert is
    // refused outright — proven with B's real, FK-satisfying id rather than
    // an arbitrary one, so the rejection is RLS denying the write, not the
    // foreign key rejecting an id that does not exist.
    const response = await profilesRequest(userA.accessToken, '', {
      method: 'POST',
      body: JSON.stringify({ id: userB.userId, display_name: 'Forged' }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('42501');
  });

  it("refuses to delete another user's row", async () => {
    const attempt = await profilesRequest(userA.accessToken, `?id=eq.${userB.userId}`, {
      method: 'DELETE',
      headers: { prefer: 'return=representation' },
    });

    // `profiles` carries no delete policy for anyone, own row included, so
    // this affects zero rows the same way the refused update above does.
    expect(attempt.status).toBe(200);
    expect(await attempt.json()).toEqual([]);

    const verify = await profilesRequest(userB.accessToken, `?id=eq.${userB.userId}&select=id`);
    expect(await verify.json()).toEqual([{ id: userB.userId }]);
  });
});
