import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';

/**
 * Server-milestone Step 23: upper-bound re-simulation, against the live stack.
 *
 * The pure bound and its tolerance are covered by `tests/unit/progress-bound.test.ts`
 * and the Edge Function's own unit tests; this proves the real `PUT /v1/save`
 * path produces `422 save_rejected` for an inflated document and leaves the
 * stored row and its revision untouched, while an honest document within the
 * elapsed time is accepted.
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

function freshDocument(): SaveDocumentV2 {
  return createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, NOW_MS),
    BASE_GAME_BALANCE,
    NOW_MS,
  );
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

async function getSave(accessToken: string): Promise<Response> {
  return fetch(SAVE_URL, {
    headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
}

describe('PUT /v1/save upper bound (server-milestone Step 23)', () => {
  it('rejects a document claiming more gold than the elapsed time allows, writing nothing', async () => {
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(first.status).toBe(200);

    const fresh = freshDocument();
    const inflated = {
      ...fresh,
      state: {
        ...fresh.state,
        warehouse: { ...fresh.state.warehouse, totalGoldDelivered: '1000000000000' },
      },
    };

    const rejected = await putSave(guest.accessToken, { baseRevision: 1, document: inflated });
    expect(rejected.status).toBe(422);
    const body = await rejected.json();
    expect(body.error.code).toBe('save_rejected');
    expect(body.error.detail.counter).toBe('state.warehouse.totalGoldDelivered');

    // The stored row is unchanged: revision 1, still the first document.
    const stored = await (await getSave(guest.accessToken)).json();
    expect(stored.revision).toBe(1);
    expect(stored.document.state.warehouse.totalGoldDelivered).toBe('0');
  });

  it('accepts an honest document within the elapsed time', async () => {
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(first.status).toBe(200);

    const honest = await putSave(guest.accessToken, { baseRevision: 1, document: freshDocument() });
    expect(honest.status).toBe(200);
    expect((await honest.json()).revision).toBe(2);
  });
});
