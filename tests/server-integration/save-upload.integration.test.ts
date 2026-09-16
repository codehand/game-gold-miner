import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';

/**
 * Server-milestone Step 16: integration tests for `PUT /v1/save` against the
 * live stack. `supabase/functions/save-sync/index.test.ts` proves the pure
 * routing/validation/concurrency logic with every collaborator faked; this
 * file proves the three real ones — Supabase Auth verification, the
 * `saves_select_own` read, and the service-role write — actually work
 * together, and that `saves`' RLS (Step 15) still denies every write this
 * function does not make on the caller's behalf.
 *
 * Each test uses its own fresh anonymous identity (`signInAnonymously()`,
 * same call `guestSession.ts` makes) rather than the shared seeded fixture
 * user, so no test's revision state depends on another test having run
 * first.
 */
const API_URL = 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;
const NOW_MS = 1_757_000_000_000;

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

function validDocument(): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
}

function putSave(accessToken: string, body: unknown, rawBody?: string): Promise<Response> {
  return fetch(SAVE_URL, {
    method: 'PUT',
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: rawBody ?? JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

describe('PUT /v1/save (server-milestone Step 16)', () => {
  it('answers 401 with no Authorization header', async () => {
    const response = await fetch(SAVE_URL, {
      method: 'PUT',
      headers: { apikey: LOCAL_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: null, document: validDocument() }),
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthenticated');
  });

  it('accepts a first upload at revision 1', async () => {
    const guest = await createGuestIdentity();
    const response = await putSave(guest.accessToken, { baseRevision: null, document: validDocument() });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.revision).toBe(1);
    expect(typeof body.receivedAt).toBe('string');
  });

  it('accepts a second upload against the revision it just received, advancing to revision 2', async () => {
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: validDocument() });
    expect(first.status).toBe(200);

    const second = await putSave(guest.accessToken, { baseRevision: 1, document: validDocument() });
    expect(second.status).toBe(200);
    expect((await second.json()).revision).toBe(2);
  });

  it('rejects a stale baseRevision with 409 and the server\'s current document, writing nothing', async () => {
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: validDocument() });
    expect(first.status).toBe(200);
    const second = await putSave(guest.accessToken, { baseRevision: 1, document: validDocument() });
    expect(second.status).toBe(200);

    // Retries with the now-stale baseRevision=1, even though it was correct
    // a moment ago — exactly the D2 "server's current revision has moved on"
    // case.
    const stale = await putSave(guest.accessToken, { baseRevision: 1, document: validDocument() });

    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error.code).toBe('revision_conflict');
    expect(body.error.detail.serverRevision).toBe(2);
    expect(body.error.detail.document).toEqual(validDocument());
  });

  it('rejects a malformed body', async () => {
    const guest = await createGuestIdentity();
    const response = await putSave(guest.accessToken, undefined, 'not json');

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('malformed_request');
  });

  it('rejects an unsupported schemaVersion', async () => {
    const guest = await createGuestIdentity();
    const document = { ...validDocument(), schemaVersion: 999 };
    const response = await putSave(guest.accessToken, { baseRevision: null, document });

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('schema_unsupported');
  });

  it('rejects a document that fails validation', async () => {
    const guest = await createGuestIdentity();
    const document = { ...validDocument(), state: { ...validDocument().state, floors: [] } };
    const response = await putSave(guest.accessToken, { baseRevision: null, document });

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('save_invalid');
  });

  it('rejects a body over the 64 KB cap before parsing it', async () => {
    const guest = await createGuestIdentity();
    const response = await putSave(guest.accessToken, undefined, '{' + 'a'.repeat(70_000));

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
  });

  it("cannot be bypassed by writing to saves directly through PostgREST", async () => {
    // The whole point of Step 15's RLS and this function's service-role
    // write: even after a real accepted upload exists, the same token that
    // uploaded it still cannot write `saves` directly.
    const guest = await createGuestIdentity();
    const uploaded = await putSave(guest.accessToken, { baseRevision: null, document: validDocument() });
    expect(uploaded.status).toBe(200);

    const direct = await fetch(`${API_URL}/rest/v1/saves?user_id=eq.${guest.userId}`, {
      method: 'PATCH',
      headers: {
        apikey: LOCAL_ANON_KEY,
        authorization: `Bearer ${guest.accessToken}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({ revision: 999 }),
      signal: AbortSignal.timeout(20_000),
    });

    expect(direct.status).toBe(200);
    expect(await direct.json()).toEqual([]);
  });

  it('a 2026-09-12 review finding: two concurrent first uploads do not both win', async () => {
    const guest = await createGuestIdentity();
    const documentA = { ...validDocument(), savedAtTimestampMs: NOW_MS + 1 };
    const documentB = { ...validDocument(), savedAtTimestampMs: NOW_MS + 2 };

    const [responseA, responseB] = await Promise.all([
      putSave(guest.accessToken, { baseRevision: null, document: documentA }),
      putSave(guest.accessToken, { baseRevision: null, document: documentB }),
    ]);
    const statuses = [responseA.status, responseB.status].sort();

    // Exactly one insert can win the user_id primary key; the loser must be
    // told to retry, never silently accepted alongside the winner.
    expect(statuses).toEqual([200, 409]);

    const [bodyA, bodyB] = await Promise.all([responseA.json(), responseB.json()]);
    const winnerBody = responseA.status === 200 ? bodyA : bodyB;
    const loserBody = responseA.status === 200 ? bodyB : bodyA;

    expect(winnerBody.revision).toBe(1);
    expect(loserBody.error.code).toBe('revision_conflict');
    expect(loserBody.error.detail.serverRevision).toBe(1);

    const stored = await fetch(`${SAVE_URL}`, {
      headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${guest.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    }).then((response) => response.json());
    expect(stored.revision).toBe(1);
    expect([documentA, documentB]).toContainEqual(stored.document);
  });

  it('a 2026-09-12 review finding: two concurrent subsequent uploads racing the same revision do not both win', async () => {
    const guest = await createGuestIdentity();
    const seeded = await putSave(guest.accessToken, { baseRevision: null, document: validDocument() });
    expect(seeded.status).toBe(200);

    const documentA = { ...validDocument(), savedAtTimestampMs: NOW_MS + 3 };
    const documentB = { ...validDocument(), savedAtTimestampMs: NOW_MS + 4 };

    const [responseA, responseB] = await Promise.all([
      putSave(guest.accessToken, { baseRevision: 1, document: documentA }),
      putSave(guest.accessToken, { baseRevision: 1, document: documentB }),
    ]);
    const statuses = [responseA.status, responseB.status].sort();

    expect(statuses).toEqual([200, 409]);

    const [bodyA, bodyB] = await Promise.all([responseA.json(), responseB.json()]);
    const winnerBody = responseA.status === 200 ? bodyA : bodyB;
    const loserBody = responseA.status === 200 ? bodyB : bodyA;

    // The revision must have advanced exactly once — not skipped to 3 (both
    // applied) and not stuck at 1 (neither applied).
    expect(winnerBody.revision).toBe(2);
    expect(loserBody.error.code).toBe('revision_conflict');
    expect(loserBody.error.detail.serverRevision).toBe(2);

    const stored = await fetch(`${SAVE_URL}`, {
      headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${guest.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    }).then((response) => response.json());
    expect(stored.revision).toBe(2);
    expect([documentA, documentB]).toContainEqual(stored.document);
  });
});
