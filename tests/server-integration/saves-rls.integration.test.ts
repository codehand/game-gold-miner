import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 15: "Add the saves table. RLS permits a user to read
 * only their own row and permits no client write at all... An integration
 * test attempts every direct write a client could make to `saves` with a
 * valid user token — insert, update, upsert, delete, and via any view or
 * RPC — and every one is refused."
 *
 * The table, its one `saves_select_own` policy, and no write policy of any
 * kind already exist as part of the Step 5 migration
 * (`20260908130000_create_platform_tables.sql`) — this step's own job is the
 * evidence, the same split Step 9's `profiles-rls.integration.test.ts` drew
 * between "the migration already did this" and "prove it."
 *
 * No client upload path exists yet (Step 16), so `userB`'s row is seeded
 * directly with a service-role client — the only way to get a row into this
 * table at all before that endpoint exists. `userA` never has a row of its
 * own; every one of its tests is read-only or an attempted write, so this
 * suite is order-independent.
 */
const API_URL = 'http://127.0.0.1:54321';
const REST_URL = `${API_URL}/rest/v1`;

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

/** Direct PostgREST call against `saves`, exactly as a client would make it. */
function savesRequest(accessToken: string, query: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${REST_URL}/saves${query}`, {
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

function fixtureDocumentJson(): string {
  return JSON.stringify({ schemaVersion: 1, savedAtTimestampMs: 0, state: 'fixture' });
}

describe('saves row-level security (server-milestone Step 15)', () => {
  let userA: GuestIdentity;
  let userB: GuestIdentity;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createGuestIdentity(), createGuestIdentity()]);
    expect(userA.userId).not.toBe(userB.userId);

    // Seeds B's own row with the one client this table ever grants a write
    // to. Not a stand-in for Step 16's upload endpoint — just the only way
    // to put a row here before that endpoint exists.
    const serviceRole = createServiceRoleClient(API_URL);
    const { error } = await serviceRole.from('saves').insert({
      user_id: userB.userId,
      revision: 1,
      schema_version: 1,
      document_json: fixtureDocumentJson(),
    });
    if (error) {
      throw new Error(`failed to seed userB's save: ${error.message}`);
    }
  }, 30_000);

  it('lets a user select their own row, empty when none exists', async () => {
    const response = await savesRequest(userA.accessToken, `?user_id=eq.${userA.userId}&select=user_id`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('lets a user select their own row once one exists', async () => {
    const response = await savesRequest(userB.accessToken, `?user_id=eq.${userB.userId}&select=user_id,revision`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ user_id: userB.userId, revision: 1 }]);
  });

  it("hides another user's row from select", async () => {
    const response = await savesRequest(userA.accessToken, `?user_id=eq.${userB.userId}&select=user_id`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('refuses to insert a row, even a real one impersonating another user', async () => {
    // `saves` carries no insert policy at all, so every client insert is
    // refused outright — proven with B's real, FK-satisfying id rather than
    // an arbitrary one, so the rejection is RLS denying the write, not the
    // foreign key rejecting an id that does not exist.
    const response = await savesRequest(userA.accessToken, '', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userB.userId,
        revision: 1,
        schema_version: 1,
        document_json: fixtureDocumentJson(),
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('42501');
  });

  it("refuses to insert the caller's own row", async () => {
    const response = await savesRequest(userA.accessToken, '', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userA.userId,
        revision: 1,
        schema_version: 1,
        document_json: fixtureDocumentJson(),
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('42501');
  });

  it("refuses to update another user's row", async () => {
    const attempt = await savesRequest(userA.accessToken, `?user_id=eq.${userB.userId}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ revision: 999 }),
    });

    // No update policy exists at all, so the row-visibility filter behind an
    // (absent) update policy excludes every row — PostgREST reports success
    // against zero matched rows rather than an error, the same shape
    // `profiles-rls.integration.test.ts` documents for its own no-policy cases.
    expect(attempt.status).toBe(200);
    expect(await attempt.json()).toEqual([]);

    const verify = await savesRequest(userB.accessToken, `?user_id=eq.${userB.userId}&select=revision`);
    expect(await verify.json()).toEqual([{ revision: 1 }]);
  });

  it('refuses to update the caller\'s own row', async () => {
    const attempt = await savesRequest(userB.accessToken, `?user_id=eq.${userB.userId}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ revision: 999 }),
    });

    expect(attempt.status).toBe(200);
    expect(await attempt.json()).toEqual([]);

    const verify = await savesRequest(userB.accessToken, `?user_id=eq.${userB.userId}&select=revision`);
    expect(await verify.json()).toEqual([{ revision: 1 }]);
  });

  it("refuses to upsert over another user's row", async () => {
    const attempt = await savesRequest(userA.accessToken, '', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: userB.userId,
        revision: 2,
        schema_version: 1,
        document_json: fixtureDocumentJson(),
      }),
    });

    // Upsert is an insert at the wire level; with no insert policy at all it
    // is refused the identical way a plain insert is.
    expect(attempt.status).toBe(403);
    expect((await attempt.json()).code).toBe('42501');

    const verify = await savesRequest(userB.accessToken, `?user_id=eq.${userB.userId}&select=revision`);
    expect(await verify.json()).toEqual([{ revision: 1 }]);
  });

  it("refuses to delete another user's row", async () => {
    const attempt = await savesRequest(userA.accessToken, `?user_id=eq.${userB.userId}`, {
      method: 'DELETE',
      headers: { prefer: 'return=representation' },
    });

    // No delete policy exists for anyone, own row included, so this affects
    // zero rows the same way the refused update above does.
    expect(attempt.status).toBe(200);
    expect(await attempt.json()).toEqual([]);

    const verify = await savesRequest(userB.accessToken, `?user_id=eq.${userB.userId}&select=user_id`);
    expect(await verify.json()).toEqual([{ user_id: userB.userId }]);
  });

  it("refuses to delete the caller's own row", async () => {
    const attempt = await savesRequest(userB.accessToken, `?user_id=eq.${userB.userId}`, {
      method: 'DELETE',
      headers: { prefer: 'return=representation' },
    });

    expect(attempt.status).toBe(200);
    expect(await attempt.json()).toEqual([]);

    const verify = await savesRequest(userB.accessToken, `?user_id=eq.${userB.userId}&select=user_id`);
    expect(await verify.json()).toEqual([{ user_id: userB.userId }]);
  });
});
