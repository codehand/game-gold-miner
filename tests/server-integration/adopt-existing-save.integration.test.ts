import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState, GameNumber, type GameState } from '../../src/core';
import {
  createSaveDocument,
  validateSaveDocument,
  type SaveDocumentV2,
  type SerializedGameState,
} from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';

/**
 * Server-milestone Step 20: adopt existing local saves.
 *
 * A player who has been playing the pre-milestone client holds a version-1
 * `SaveDocument` in IndexedDB. This suite proves the server end of "adopt it as
 * the account's cloud save rather than replace it with a fresh one": a
 * version-1 document is accepted exactly as the client would send it (already
 * migrated by `validateSaveDocument`), stored, and returned by download
 * **byte-for-byte**. The client half — the first-sign-in upload itself — is
 * proven by `tests/server-e2e/adopt-local-save.spec.ts`.
 *
 * The plan's Step 18 interaction note governs the comparison: a pre-milestone
 * save is version 1, Step 18 bumped the schema to version 2, and the migration
 * is lossless, so the adopted document is the *migrated* version-2 document.
 * This suite asserts that explicitly rather than pretending the original v1
 * bytes come back.
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

/** A pre-milestone version-1 save with real progress, missing only the Step 18 counter. */
function preMilestoneVersionOneDocument(): Record<string, unknown> {
  const base = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const elevatorLevel = base.elevator.level + 3;
  const state: GameState = {
    ...base,
    gold: GameNumber.from(500),
    elevator: {
      ...base.elevator,
      level: elevatorLevel,
      capacity: calculateLevelEffect(
        BASE_GAME_BALANCE.elevator.baseCapacity,
        elevatorLevel,
        BASE_GAME_BALANCE.elevator.upgrade,
      ),
    },
  };
  const current = createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
  const warehouse = Object.fromEntries(
    Object.entries(current.state.warehouse).filter(
      ([key]) => key !== 'totalOfflineGoldClaimed',
    ),
  );

  return {
    ...current,
    schemaVersion: 1,
    state: { ...current.state, warehouse },
  };
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

describe('adopt an existing local save on first sign-in (server-milestone Step 20)', () => {
  it('stores the migrated version-2 document and returns it byte-for-byte', async () => {
    const guest = await createGuestIdentity();
    const preMilestone = preMilestoneVersionOneDocument();
    // Exactly what the client uploads: `adoptExistingLocalSave` runs the local
    // document through the shared migration before handing it to the replica.
    const adopted = validateSaveDocument(preMilestone, BASE_GAME_BALANCE);

    const upload = await putSave(guest.accessToken, { baseRevision: null, document: adopted });
    expect(upload.status).toBe(200);
    expect((await upload.json()).revision).toBe(1);

    const download = await getSave(guest.accessToken);
    expect(download.status).toBe(200);
    const body = (await download.json()) as { revision: number; document: SaveDocumentV2 };

    expect(body.revision).toBe(1);
    // Byte-for-byte: the exact serialization the player's device adopted.
    expect(JSON.stringify(body.document)).toBe(JSON.stringify(adopted));
  });

  it('preserves the pre-milestone progress and changes only schemaVersion and the added counter', async () => {
    const guest = await createGuestIdentity();
    const preMilestone = preMilestoneVersionOneDocument();

    const upload = await putSave(guest.accessToken, {
      baseRevision: null,
      document: validateSaveDocument(preMilestone, BASE_GAME_BALANCE),
    });
    expect(upload.status).toBe(200);

    const body = (await (await getSave(guest.accessToken)).json()) as {
      document: SaveDocumentV2;
    };
    const adoptedState = body.document.state as SerializedGameState;

    // The fields the player actually earned survive intact.
    const originalState = (preMilestone as { state: SerializedGameState }).state;
    expect(adoptedState.gold).toBe(originalState.gold);
    expect(adoptedState.gold).toBe('500');
    expect(adoptedState.elevator.level).toBe(originalState.elevator.level);
    expect(adoptedState.elevator.capacity).toBe(originalState.elevator.capacity);
    expect(adoptedState.floors).toEqual(originalState.floors);

    // The migration is the only difference.
    expect(body.document.schemaVersion).toBe(2);
    expect(adoptedState.warehouse.totalOfflineGoldClaimed).toBe('0');
    const adoptedWarehouse = Object.fromEntries(
      Object.entries(adoptedState.warehouse).filter(
        ([key]) => key !== 'totalOfflineGoldClaimed',
      ),
    );
    expect(adoptedWarehouse).toEqual(originalState.warehouse);
  });

  it('lets the server itself migrate a raw version-1 upload, so a pre-milestone payload is never refused', async () => {
    const guest = await createGuestIdentity();
    const preMilestone = preMilestoneVersionOneDocument();
    const expected = validateSaveDocument(preMilestone, BASE_GAME_BALANCE);

    const upload = await putSave(guest.accessToken, { baseRevision: null, document: preMilestone });
    expect(upload.status).toBe(200);

    const body = (await (await getSave(guest.accessToken)).json()) as {
      document: SaveDocumentV2;
    };
    expect(JSON.stringify(body.document)).toBe(JSON.stringify(expected));
  });
});
