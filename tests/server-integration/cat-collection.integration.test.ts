import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState, GameNumber } from '../../src/core';
import { createSaveDocument } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

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
  readonly walletGold?: string;
  readonly saveRevision?: number;
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
  it('buys individual Haulers, forbids reuse, and restores default without losing ownership', async () => {
    const guest = await createGuestIdentity();
    await uploadWallet(guest.accessToken);
    const purchase = async (assetId: string, idempotencyKey: string) => {
      const response = await requestCollection(guest.accessToken, '/v1/purchase', {
        method: 'POST', body: JSON.stringify({ assetId, idempotencyKey }),
      });
      expect(response.status, await response.clone().text()).toBe(200);
      return await response.json() as CatCollectionResponse;
    };
    const first = await purchase('hauler:SR:tobi:walk', 'hauler-tobi-0001');
    expect(first.walletGold).toBe('82000');
    expect(first.assignments).toHaveLength(0);
    const second = await purchase('hauler:SR:tobi:walk', 'hauler-tobi-0002');
    expect(second.walletGold).toBe('64000');
    const third = await purchase('hauler:SSR:rivet:walk', 'hauler-rivet-0001');
    expect(third.walletGold).toBe('22000');
    expect(new Set(third.cats.map((cat) => cat.catInstanceId)).size).toBe(3);
    const tobi = first.cats[0];
    const anotherTobi = second.cats.find((cat) => cat.catInstanceId !== tobi.catInstanceId)!;
    const assign = (id: string | null, slotKey: string, revision: number) =>
      requestCollection(guest.accessToken, '/v1/assignment', {
        method: 'POST', body: JSON.stringify({ catInstanceId: id, slotKey, expectedAssignmentRevision: revision }),
      });
    expect((await assign(tobi.catInstanceId, 'hauler:1', 0)).status).toBe(200);
    const reuse = await assign(tobi.catInstanceId, 'hauler:2', 1);
    expect(reuse.status).toBe(409);
    expect((await reuse.json()).error.code).toBe('cat_not_assignable');
    expect((await assign(anotherTobi.catInstanceId, 'hauler:6', 1)).status).toBe(409);
    expect((await assign(anotherTobi.catInstanceId, 'warehouse:main', 1)).status).toBe(409);
    expect((await assign(anotherTobi.catInstanceId, 'hauler:2', 1)).status).toBe(200);
    expect((await assign(null, 'hauler:1', 1)).status).toBe(409);
    const reset = await assign(null, 'hauler:1', 2);
    expect(reset.status, await reset.clone().text()).toBe(200);
    const persisted = await readCollection(guest.accessToken);
    expect(persisted.cats).toHaveLength(3);
    expect(persisted.assignments).toEqual([{ slotKey: 'hauler:2', catInstanceId: anotherTobi.catInstanceId }]);
    expect(persisted.cats.find((cat) => cat.catInstanceId === tobi.catInstanceId)).toMatchObject({
      ownerUserId: guest.userId, availabilityState: 'Idle', assignedSlotKey: null,
    });
    expect((await assign(tobi.catInstanceId, 'hauler:3', 3)).status).toBe(200);
  });

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
    expect(firstProjection.walletGold).toBe('64000');
    expect(firstProjection.saveRevision).toBe(2);

    const replay = await requestCollection(guest.accessToken, '/v1/purchase', {
      method: 'POST',
      body: JSON.stringify({ assetId: 'miner:SSR:forge:idle', idempotencyKey: 'phase3-purchase-0001' }),
    });
    expect(replay.status).toBe(200);
    const replayProjection = await replay.json() as CatCollectionResponse;
    expect(replayProjection.cats).toHaveLength(1);
    expect(replayProjection.cats[0].catInstanceId).toBe(firstProjection.cats[0].catInstanceId);
    expect(replayProjection.walletGold).toBe('64000');
    expect(replayProjection.saveRevision).toBe(firstProjection.saveRevision);

    const second = await requestCollection(guest.accessToken, '/v1/purchase', {
      method: 'POST',
      body: JSON.stringify({ assetId: 'miner:SSR:forge:idle', idempotencyKey: 'phase3-purchase-0001-b' }),
    });
    expect(second.status).toBe(200);
    const secondProjection = await second.json() as CatCollectionResponse;
    expect(secondProjection.cats).toHaveLength(2);
    expect(secondProjection.cats.map((cat) => cat.catInstanceId)).toContain(firstProjection.cats[0].catInstanceId);
    expect(new Set(secondProjection.cats.map((cat) => cat.catInstanceId)).size).toBe(2);
    expect(secondProjection.walletGold).toBe('28000');
    expect(secondProjection.saveRevision).toBe(3);
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

    const duplicateFloor = await requestCollection(guest.accessToken, '/v1/assignment', {
      method: 'POST',
      body: JSON.stringify({
        catInstanceId: miner.catInstanceId,
        slotKey: 'miner:floor-2',
        expectedAssignmentRevision: 1,
      }),
    });
    const duplicateFloorResult = await duplicateFloor.json();
    expect(duplicateFloor.status, JSON.stringify(duplicateFloorResult)).toBe(409);
    expect(duplicateFloorResult.error.code).toBe('cat_not_assignable');

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

  it('lists, sells, rents, and settles player cats through atomic marketplace commands', async () => {
    const seller = await createGuestIdentity();
    const buyer = await createGuestIdentity();
    await uploadWallet(seller.accessToken);
    await uploadWallet(buyer.accessToken);

    const sellerPurchase = await requestCollection(seller.accessToken, '/v1/purchase', {
      method: 'POST',
      body: JSON.stringify({ assetId: 'miner:SSR:forge:idle', idempotencyKey: 'market-seller-forge-0001' }),
    });
    expect(sellerPurchase.status).toBe(200);
    const sellerForgeProjection = await sellerPurchase.json() as CatCollectionResponse;
    const forge = sellerForgeProjection.cats[0];

    const createSale = await requestCollection(seller.accessToken, '/v1/listings', {
      method: 'POST',
      body: JSON.stringify({
        catInstanceId: forge.catInstanceId,
        listingType: 'sale',
        priceExact: '10000',
        idempotencyKey: 'market-sale-create-0001',
      }),
    });
    expect(createSale.status).toBe(200);
    const saleProjection = await createSale.json() as {
      readonly listingId: string;
      readonly listings: readonly { readonly listingId: string; readonly status: string }[];
    };
    const sale = saleProjection.listings.find((listing) => listing.status === 'Active')!;
    expect(sale.listingId).toBeTruthy();

    const visibleSale = await requestCollection(buyer.accessToken, '/v1/listings?type=sale', { method: 'GET' });
    expect(visibleSale.status).toBe(200);
    expect((await visibleSale.json()).listings).toEqual(expect.arrayContaining([
      expect.objectContaining({ listingId: sale.listingId, listingType: 'sale', priceExact: '10000' }),
    ]));

    const buy = await requestCollection(buyer.accessToken, `/v1/listings/${sale.listingId}/buy`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: 'market-sale-buy-0001' }),
    });
    expect(buy.status).toBe(200);
    const buyerAfterSale = await buy.json() as CatCollectionResponse & { readonly listingId: string };
    expect(buyerAfterSale.listingId).toBe(sale.listingId);
    expect(buyerAfterSale.walletGold).toBe('90000');
    expect(buyerAfterSale.cats).toEqual(expect.arrayContaining([
      expect.objectContaining({ catInstanceId: forge.catInstanceId, ownerUserId: buyer.userId, availabilityState: 'Idle' }),
    ]));

    const buyReplay = await requestCollection(buyer.accessToken, `/v1/listings/${sale.listingId}/buy`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: 'market-sale-buy-0001' }),
    });
    expect(buyReplay.status).toBe(200);
    expect((await buyReplay.json()).walletGold).toBe('90000');

    const sellerMicaPurchase = await requestCollection(seller.accessToken, '/v1/purchase', {
      method: 'POST',
      body: JSON.stringify({ assetId: 'miner:N:mica:idle', idempotencyKey: 'market-seller-mica-0001' }),
    });
    expect(sellerMicaPurchase.status).toBe(200);
    const mica = (await sellerMicaPurchase.json() as CatCollectionResponse).cats[0];
    const createRent = await requestCollection(seller.accessToken, '/v1/listings', {
      method: 'POST',
      body: JSON.stringify({
        catInstanceId: mica.catInstanceId,
        listingType: 'rent',
        priceExact: '250',
        idempotencyKey: 'market-rent-create-0001',
      }),
    });
    expect(createRent.status).toBe(200);
    const rentProjection = await createRent.json() as {
      readonly listings: readonly { readonly listingId: string; readonly status: string }[];
    };
    const rentListingId = rentProjection.listings.find((listing) => listing.status === 'Active')!.listingId;

    const visibleRent = await requestCollection(buyer.accessToken, '/v1/listings?type=rent', { method: 'GET' });
    expect(visibleRent.status).toBe(200);
    expect((await visibleRent.json()).listings).toEqual(expect.arrayContaining([
      expect.objectContaining({ listingId: rentListingId, listingType: 'rent', priceExact: '250' }),
    ]));
    const rentCommand = await requestCollection(buyer.accessToken, `/v1/listings/${rentListingId}/rent`, {
      method: 'POST',
      body: JSON.stringify({ durationHours: 2, idempotencyKey: 'market-rent-buy-0001' }),
    });
    expect(rentCommand.status).toBe(200);
    const renterProjection = await rentCommand.json() as CatCollectionResponse;
    expect(renterProjection.walletGold).toBe('89500');
    expect(renterProjection.cats).toEqual(expect.arrayContaining([
      expect.objectContaining({ catInstanceId: mica.catInstanceId, ownerUserId: buyer.userId, availabilityState: 'Idle' }),
    ]));

    const admin = createServiceRoleClient(API_URL);
    const expire = await admin.from('cat_rentals').update({ expires_at: new Date(Date.now() - 1_000).toISOString() }).eq('cat_instance_id', mica.catInstanceId);
    expect(expire.error).toBeNull();
    const afterExpiry = await readCollection(seller.accessToken);
    expect(afterExpiry.cats).toEqual(expect.arrayContaining([
      expect.objectContaining({ catInstanceId: mica.catInstanceId, ownerUserId: seller.userId, availabilityState: 'Idle' }),
    ]));
    expect((await readCollection(buyer.accessToken)).cats.some((cat) => cat.catInstanceId === mica.catInstanceId)).toBe(false);
  });
});
