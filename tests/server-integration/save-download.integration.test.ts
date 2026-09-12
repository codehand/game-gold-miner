import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV1 } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';

/**
 * Server-milestone Step 17: integration tests for `GET /v1/save` against the
 * live stack, the download half of §10 this step adds alongside the boot-time
 * reconcile in `src/platform/web/cloudSaveReconcile.ts`.
 * `supabase/functions/save-sync/index.test.ts` proves the pure handler with
 * every collaborator faked; this file proves the two real ones (Supabase Auth
 * verification and the `saves_select_own` read) actually work together, most
 * importantly the step's own test: "a player with a cloud save on a new
 * device restores it."
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

function validDocument(): SaveDocumentV1 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
}

function putSave(accessToken: string, body: unknown): Promise<Response> {
  return fetch(SAVE_URL, {
    method: 'PUT',
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

function getSave(accessToken: string): Promise<Response> {
  return fetch(SAVE_URL, {
    headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
}

describe('GET /v1/save (server-milestone Step 17)', () => {
  it('answers 401 with no Authorization header', async () => {
    const response = await fetch(SAVE_URL, {
      headers: { apikey: LOCAL_ANON_KEY },
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthenticated');
  });

  it('answers 204 with no body for an account with no cloud save yet', async () => {
    const guest = await createGuestIdentity();
    const response = await getSave(guest.accessToken);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('a player with a cloud save on a new device restores it', async () => {
    // "New device" here means: a second, independent client session for the
    // same authenticated user — exactly what the download endpoint alone can
    // prove; the local-storage side of "new device" is Step 17's client
    // reconcile, covered by `tests/unit/cloudSaveReconcile.test.ts`.
    const guest = await createGuestIdentity();
    const document = validDocument();
    const uploaded = await putSave(guest.accessToken, { baseRevision: null, document });
    expect(uploaded.status).toBe(200);
    const uploadedBody = await uploaded.json();

    const downloaded = await getSave(guest.accessToken);

    expect(downloaded.status).toBe(200);
    const body = await downloaded.json();
    expect(body.revision).toBe(uploadedBody.revision);
    // Round-trips through a `timestamptz` column: PostgREST renders it back
    // as `+00:00` rather than the `Z` suffix the Edge Function's own
    // `toISOString()` used, so this compares the represented instant rather
    // than the literal string.
    expect(Date.parse(body.receivedAt)).toBe(Date.parse(uploadedBody.receivedAt));
    expect(body.document).toEqual(document);
  });

  it('reflects the latest revision after a second upload', async () => {
    const guest = await createGuestIdentity();
    await putSave(guest.accessToken, { baseRevision: null, document: validDocument() });
    const secondDocument = { ...validDocument(), savedAtTimestampMs: NOW_MS + 1_000 };
    const second = await putSave(guest.accessToken, { baseRevision: 1, document: secondDocument });
    expect(second.status).toBe(200);

    const downloaded = await getSave(guest.accessToken);

    expect(downloaded.status).toBe(200);
    const body = await downloaded.json();
    expect(body.revision).toBe(2);
    expect(body.document.savedAtTimestampMs).toBe(NOW_MS + 1_000);
  });

  it("cannot see another user's cloud save", async () => {
    const owner = await createGuestIdentity();
    const other = await createGuestIdentity();
    const uploaded = await putSave(owner.accessToken, { baseRevision: null, document: validDocument() });
    expect(uploaded.status).toBe(200);

    const response = await getSave(other.accessToken);

    expect(response.status).toBe(204);
  });
});
