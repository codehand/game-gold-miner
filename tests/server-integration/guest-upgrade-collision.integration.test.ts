import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState } from '../../src/core';
import { createSaveDocument, reconcileGuestUpgrade, type SaveDocumentV1 } from '../../src/persistence';
import { downloadCloudSaveViaFetch } from '../../src/platform/web';
import { LOCAL_ANON_KEY } from './authFixture';

/**
 * Server-milestone Step 13: proves the three required guest-upgrade flows
 * against the live stack, composing the real Step 16/17 endpoints
 * (`downloadCloudSaveViaFetch`, `PUT /v1/save`) with the real, pure
 * `reconcileGuestUpgrade` predicate from `src/persistence`.
 *
 * The real trigger — `identity_already_exists` after a `linkIdentity`
 * redirect (Google) or every sign-in (Telegram, which never links) —
 * ultimately puts the caller in exactly one situation this suite reproduces
 * directly: authenticated as some account (fresh or pre-existing), holding a
 * local device document that may or may not already match what that
 * account's cloud save holds. Nothing here needs a real Google/Telegram
 * round trip to prove that composition; `detectGoogleIdentityCollision` and
 * `beginGoogleAccountSwitch` (unit-tested with fakes in
 * `tests/unit/google-sign-in.test.ts`) are what actually gets the caller
 * into that situation for real, and their own live proof needs the same kind
 * of guided manual verification Step 10 already required.
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

function freshDocument(): SaveDocumentV1 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
}

/** A validly-upgraded elevator level `bump` past starting, so two calls with different bumps produce genuinely different documents. */
function progressingDocument(bump: number): SaveDocumentV1 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const level = state.elevator.level + bump;
  return createSaveDocument(
    {
      ...state,
      elevator: {
        ...state.elevator,
        level,
        capacity: calculateLevelEffect(BASE_GAME_BALANCE.elevator.baseCapacity, level, BASE_GAME_BALANCE.elevator.upgrade),
      },
    },
    BASE_GAME_BALANCE,
    NOW_MS,
  );
}

describe('guest-upgrade collision reconciliation (server-milestone Step 13)', () => {
  it('flow 1: a fresh identity link keeps everything — nothing to ask when the account never had a save', async () => {
    // Standing in for a successful `linkIdentity`: Steps 10/12 already prove
    // that keeps the same `auth.users` id, so this guest's own token *is*
    // the linked account from here on — there is no separate "remote" id to
    // switch to at all.
    const guest = await createGuestIdentity();
    const localDocument = progressingDocument(1);

    const remote = await downloadCloudSaveViaFetch(SAVE_URL, guest.accessToken);
    expect(remote).toBeNull();

    const decision = reconcileGuestUpgrade(localDocument, remote, BASE_GAME_BALANCE);
    expect(decision).toEqual({ kind: 'adopt-local' });

    const uploaded = await putSave(guest.accessToken, { baseRevision: null, document: localDocument });
    expect(uploaded.status).toBe(200);
  });

  it('flow 2: guest with progress signs into an account holding a different save, and is asked — each choice honoured exactly', async () => {
    const existingAccount = await createGuestIdentity();
    const existingDocument = progressingDocument(2);
    const uploadedExisting = await putSave(existingAccount.accessToken, {
      baseRevision: null,
      document: existingDocument,
    });
    expect(uploadedExisting.status).toBe(200);
    const existingRevision = (await uploadedExisting.json()).revision;

    // The still-present local device document — genuinely different progress
    // from the account's own, so this is a real fork, not a same-document
    // no-op.
    const localDocument = progressingDocument(3);

    const remote = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    expect(remote).not.toBeNull();

    const decision = reconcileGuestUpgrade(localDocument, remote, BASE_GAME_BALANCE);
    expect(decision.kind).toBe('ask');
    if (decision.kind !== 'ask') {
      throw new Error('expected an ask decision');
    }
    expect(decision.local.document).toEqual(localDocument);
    expect(decision.local.lastPlayedMs).toBe(localDocument.savedAtTimestampMs);
    expect(decision.remote.document).toEqual(existingDocument);
    expect(decision.remote.lastPlayedMs).toBe(remote?.receivedAtMs);

    // Choice A: "keep local" — uploads local, replacing the account's save.
    const keepLocal = await putSave(existingAccount.accessToken, {
      baseRevision: existingRevision,
      document: localDocument,
    });
    expect(keepLocal.status).toBe(200);
    const afterKeepLocal = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    expect(afterKeepLocal?.document).toEqual(localDocument);
  });

  it('flow 2b: choosing to keep the account\'s save instead leaves it unchanged', async () => {
    const existingAccount = await createGuestIdentity();
    const existingDocument = progressingDocument(4);
    await putSave(existingAccount.accessToken, { baseRevision: null, document: existingDocument });

    const localDocument = progressingDocument(5);
    const remote = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    const decision = reconcileGuestUpgrade(localDocument, remote, BASE_GAME_BALANCE);
    expect(decision.kind).toBe('ask');

    // Choice B: "keep account" — no upload at all; the account's save is
    // exactly what a client would now adopt locally (Step 17's reconcile
    // path).
    const stillThere = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    expect(stillThere?.document).toEqual(existingDocument);
  });

  it('flow 3: a guest with no progress signing into an existing account is not asked at all', async () => {
    const existingAccount = await createGuestIdentity();
    const existingDocument = progressingDocument(6);
    await putSave(existingAccount.accessToken, { baseRevision: null, document: existingDocument });

    const remote = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    const decision = reconcileGuestUpgrade(freshDocument(), remote, BASE_GAME_BALANCE);

    expect(decision).toEqual({ kind: 'adopt-remote' });
  });

  it('flow 3b: a fresh guest signing into an account with no save either is not asked, and has nothing to lose', async () => {
    const existingAccount = await createGuestIdentity();

    const remote = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    expect(remote).toBeNull();

    const decision = reconcileGuestUpgrade(freshDocument(), remote, BASE_GAME_BALANCE);
    expect(decision).toEqual({ kind: 'adopt-local' });
  });
});
