import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState, GameNumber } from '../../src/core';
import { createSaveDocument } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';

/**
 * Phase 3 integration gate: the real Auth → Edge Function → service-role RPC
 * path for ownership, idempotent purchase, collection projection, and exact
 * role assignment. Direct PostgREST writes are covered separately by the
 * derived adversarial RLS matrix.
 */
const API_URL = 'http://127.0.0.1:54321';
const COLLECTION_URL = `${API_URL}/functions/v1/cat-collection`;
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;
const NOW_MS = 1_757_000_000_000;

interface GuestIdentity {
  readonly userId: string;
  readonly accessToken: string;
}

interface CatCollectionResponse {
  readonly cats: readonly {
    readonly catInstanceId: string;
    readonly ownerUserId: string;
    readonly assetId: string;
    readonly roleId: string;
    readonly availabilityState: string;
    readonly assignedSlotKey: string | null;
  }[];
  readonly assignments: readonly { readonly slotKey: string; readonly catInstanceId: string }[];
  readonly assignmentRevision: number;
  readonly collectionRevision: number;
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

function requestCollection(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${COLLECTION_URL}${path}`, {
    ...init,
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

async function uploadWallet(accessToken: string): Promise<void> {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const document = createSaveDocument(
    { ...state, gold: GameNumber.from(100_000) },
    BASE_GAME_BALANCE,
    NOW_MS,
  );
  const response = await fetch(SAVE_URL, {
    method: 'PUT',
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ baseRevision: null, document }),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 200) {
    throw new Error(`wallet upload failed: ${response.status} ${await response.text()}`);
  }
}

async function readCollection(accessToken: string): Promise<CatCollectionResponse> {
  const response = await requestCollection(accessToken, '/v1/collection');
  expect(response.status).toBe(200);
  return await response.json() as CatCollectionResponse;
}

describe('cat collection and role assignment against the live stack', () => {
  it('requires auth and keeps purchase ownership/idempotency server-authoritative', async () => {
    const unauthenticated = await fetch(`${COLLECTION_URL}/v1/collection`, {
      headers: { apikey: LOCAL_ANON_KEY },
      signal: AbortSignal.timeout(20_000),
    });
    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json()).error.code).toBe('unauthenticated');

    const guest = await createGuestIdentity();
    await uploadWallet(guest.accessToken);

    const first = await requestCollection(guest.accessToken, '/v1/purchase', {
      method: 'POST',
      body: JSON.stringify({
        assetId: 'miner:SSR:forge:idle',
        idempotencyKey: 'phase3-purchase-0001',
        ownerUserId: 'attacker',
        roleId: 'elevator',
        price: 1,
      }),
    });
    expect(first.status).toBe(200);
    const firstProjection = await first.json() as CatCollectionResponse;
    expect(firstProjection.cats).toHaveLength(1);
    expect(firstProjection.cats[0]).toMatchObject({
      ownerUserId: guest.userId,
      assetId: 'miner:SSR:forge:idle',
      roleId: 'miner',
      availabilityState: 'Idle',
      assignedSlotKey: null,
    });

    const replay = await requestCollection(guest.accessToken, '/v1/purchase', {
      method: 'POST',
      body: JSON.stringify({ assetId: 'miner:SSR:forge:idle', idempotencyKey: 'phase3-purchase-0001' }),
    });
    expect(replay.status).toBe(200);
    const replayProjection = await replay.json() as CatCollectionResponse;
    expect(replayProjection.cats).toHaveLength(1);
    expect(replayProjection.cats[0].catInstanceId).toBe(firstProjection.cats[0].catInstanceId);
  });

  it('filters assignment by role and revision, then persists the replacement', async () => {
    const guest = await createGuestIdentity();
    await uploadWallet(guest.accessToken);

    const purchase = async (assetId: string, idempotencyKey: string) => {
      const response = await requestCollection(guest.accessToken, '/v1/purchase', {
        method: 'POST',
        body: JSON.stringify({ assetId, idempotencyKey }),
      });
      expect(response.status).toBe(200);
      return await response.json() as CatCollectionResponse;
    };

    const minerProjection = await purchase('miner:SSR:forge:idle', 'phase3-purchase-0002');
    const elevatorProjection = await purchase('elevator-cargo-cat:SSR:mofy:idle', 'phase3-purchase-0003');
    const miner = minerProjection.cats.find((cat) => cat.roleId === 'miner')!;
    const elevator = elevatorProjection.cats.find((cat) => cat.roleId === 'elevator')!;

    const wrongRole = await requestCollection(guest.accessToken, '/v1/assignment', {
      method: 'POST',
      body: JSON.stringify({
        catInstanceId: elevator.catInstanceId,
        slotKey: 'miner:floor-1',
        expectedAssignmentRevision: 0,
      }),
    });
    expect(wrongRole.status).toBe(409);
    expect((await wrongRole.json()).error.code).toBe('wrong_role');

    const assignedMiner = await requestCollection(guest.accessToken, '/v1/assignment', {
      method: 'POST',
      body: JSON.stringify({
        catInstanceId: miner.catInstanceId,
        slotKey: 'miner:floor-1',
        expectedAssignmentRevision: 0,
      }),
    });
    expect(assignedMiner.status).toBe(200);
    const assignedMinerProjection = await assignedMiner.json() as CatCollectionResponse;
    expect(assignedMinerProjection.assignmentRevision).toBe(1);
    expect(assignedMinerProjection.assignments).toContainEqual({
      slotKey: 'miner:floor-1',
      catInstanceId: miner.catInstanceId,
    });

    const stale = await requestCollection(guest.accessToken, '/v1/assignment', {
      method: 'POST',
      body: JSON.stringify({
        catInstanceId: elevator.catInstanceId,
        slotKey: 'elevator:main',
        expectedAssignmentRevision: 0,
      }),
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('stale_revision');

    const assignedElevator = await requestCollection(guest.accessToken, '/v1/assignment', {
      method: 'POST',
      body: JSON.stringify({
        catInstanceId: elevator.catInstanceId,
        slotKey: 'elevator:main',
        expectedAssignmentRevision: 1,
      }),
    });
    expect(assignedElevator.status).toBe(200);
    const finalProjection = await assignedElevator.json() as CatCollectionResponse;
    expect(finalProjection.assignmentRevision).toBe(2);
    expect(finalProjection.cats.find((cat) => cat.catInstanceId === miner.catInstanceId)).toMatchObject({
      availabilityState: 'Assigned',
      assignedSlotKey: 'miner:floor-1',
    });
    expect(finalProjection.cats.find((cat) => cat.catInstanceId === elevator.catInstanceId)).toMatchObject({
      availabilityState: 'Assigned',
      assignedSlotKey: 'elevator:main',
    });
    expect((await readCollection(guest.accessToken)).collectionRevision).toBe(finalProjection.collectionRevision);
  });
});
