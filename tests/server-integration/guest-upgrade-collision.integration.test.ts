import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState } from '../../src/core';
import { createSaveDocument, resolveSaveConflict, type SaveDocumentV2 } from '../../src/persistence';
import { downloadCloudSaveViaFetch } from '../../src/platform/web';
import { LOCAL_ANON_KEY } from './authFixture';
import { ageStoredSave } from './saveAgeFixture';

/**
 * Server-milestone Step 13: proves the three required guest-upgrade flows
 * against the live stack, composing the real Step 16/17 endpoints
 * (`downloadCloudSaveViaFetch`, `PUT /v1/save`) with the real, pure
 * `resolveSaveConflict` predicate from `src/persistence`.
 *
 * Step 18 completed §7's dominance rule, so a divergent pair that is a strict
 * superset no longer asks — it resolves silently, which is exactly what the
 * Step 2 protocol requires. These flows therefore build each case explicitly:
 * a fresh account (nothing to compare), a progress-free guest (adopt the
 * account's save), and a genuine fork where each side holds progress the other
 * lacks.
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

function freshDocument(): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
}

/** A validly-upgraded elevator level `bump` past starting. */
function elevatorDocument(bump: number): SaveDocumentV2 {
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

/** A validly-upgraded warehouse level `bump` past starting — progress on a different axis from the elevator. */
function warehouseDocument(bump: number): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const level = state.warehouse.level + bump;
  return createSaveDocument(
    {
      ...state,
      warehouse: {
        ...state.warehouse,
        level,
        capacity: calculateLevelEffect(BASE_GAME_BALANCE.warehouse.baseCapacity, level, BASE_GAME_BALANCE.warehouse.upgrade),
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
    const localDocument = elevatorDocument(1);

    const remote = await downloadCloudSaveViaFetch(SAVE_URL, guest.accessToken);
    expect(remote).toBeNull();

    const decision = resolveSaveConflict(localDocument, remote);
    expect(decision).toEqual({ kind: 'local-dominates' });

    const uploaded = await putSave(guest.accessToken, { baseRevision: null, document: localDocument });
    expect(uploaded.status).toBe(200);
  });

  it('flow 2: guest with progress signs into an account holding a genuinely different save, and is asked — each choice honoured exactly', async () => {
    const existingAccount = await createGuestIdentity();
    const existingDocument = warehouseDocument(1);
    const uploadedExisting = await putSave(existingAccount.accessToken, {
      baseRevision: null,
      document: existingDocument,
    });
    expect(uploadedExisting.status).toBe(200);
    const existingRevision = (await uploadedExisting.json()).revision;

    // The still-present local device document — a different axis of progress
    // (elevator rather than warehouse), so neither save dominates the other
    // and this is a real fork, not a same-document no-op.
    const localDocument = elevatorDocument(1);

    const remote = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    expect(remote).not.toBeNull();

    const decision = resolveSaveConflict(localDocument, remote);
    expect(decision.kind).toBe('fork');
    if (decision.kind !== 'fork') {
      throw new Error('expected a fork decision');
    }
    expect(decision.local.document).toEqual(localDocument);
    expect(decision.local.lastPlayedMs).toBe(localDocument.savedAtTimestampMs);
    expect(decision.remote.document).toEqual(existingDocument);
    expect(decision.remote.lastPlayedMs).toBe(remote?.receivedAtMs);

    // Choice A: "keep local" — uploads local, replacing the account's save.
    // The account's save is its own first upload, so there is no `previous_*`
    // ancestor for the branch to anchor against; the stored row's own age is
    // the only interval the server has, so age it to represent that the
    // account's save is old and the local progress is within what that time
    // allows.
    await ageStoredSave(API_URL, existingAccount.userId, 30 * 24 * 60 * 60);
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
    const existingDocument = warehouseDocument(2);
    await putSave(existingAccount.accessToken, { baseRevision: null, document: existingDocument });

    const localDocument = elevatorDocument(2);
    const remote = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    const decision = resolveSaveConflict(localDocument, remote);
    expect(decision.kind).toBe('fork');

    // Choice B: "keep account" — no upload at all; the account's save is
    // exactly what a client would now adopt locally (Step 17's reconcile
    // path).
    const stillThere = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    expect(stillThere?.document).toEqual(existingDocument);
  });

  it('flow 3: a guest with no progress signing into an existing account is not asked at all', async () => {
    const existingAccount = await createGuestIdentity();
    const existingDocument = elevatorDocument(3);
    await putSave(existingAccount.accessToken, { baseRevision: null, document: existingDocument });

    const remote = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    const decision = resolveSaveConflict(freshDocument(), remote);

    expect(decision).toEqual({ kind: 'remote-dominates' });
  });

  it('flow 3b: a fresh guest signing into an account with no save either is not asked, and has nothing to lose', async () => {
    const existingAccount = await createGuestIdentity();

    const remote = await downloadCloudSaveViaFetch(SAVE_URL, existingAccount.accessToken);
    expect(remote).toBeNull();

    const decision = resolveSaveConflict(freshDocument(), remote);
    expect(decision).toEqual({ kind: 'local-dominates' });
  });
});
