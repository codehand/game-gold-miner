import assert from 'node:assert/strict';

import {
  handleRequest,
  type CatCollectionDependencies,
  type CatCollectionProjection,
  type MarketplaceMutationProjection,
} from './index.ts';

const EMPTY: CatCollectionProjection = {
  cats: [],
  assignments: [],
  assignmentRevision: 0,
  collectionRevision: 0,
};

const MARKETPLACE_EMPTY: MarketplaceMutationProjection = {
  ...EMPTY,
  listings: [],
  listingId: 'listing-1',
};

function deps(overrides: Partial<CatCollectionDependencies> = {}): CatCollectionDependencies {
  return {
    resolveCaller: async (token) => token === 'valid' ? { userId: 'user-1' } : null,
    readCollection: async () => EMPTY,
    purchaseCat: async () => EMPTY,
    replaceAssignment: async () => EMPTY,
    ...overrides,
  };
}

function request(path: string, method: string, body?: unknown): Request {
  return new Request(`https://example.test/functions/v1/cat-collection${path}`, {
    method,
    headers: {
      authorization: 'Bearer valid',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test('cat collection requires an authenticated caller before reading data', async () => {
  const response = await handleRequest(
    new Request('https://example.test/functions/v1/cat-collection/v1/collection', { method: 'GET' }),
    deps(),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

Deno.test('GET collection returns only the caller projection', async () => {
  let userId: string | null = null;
  const response = await handleRequest(
    request('/v1/collection', 'GET'),
    deps({
      readCollection: async (caller) => {
        userId = caller;
        return { ...EMPTY, collectionRevision: 4 };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(userId, 'user-1');
  assert.equal((await response.json()).collectionRevision, 4);
});

Deno.test('purchase forwards only asset identity and idempotency key', async () => {
  let received: { userId: string; assetId: string; idempotencyKey: string } | null = null;
  const response = await handleRequest(
    request('/v1/purchase', 'POST', {
      assetId: 'miner:SSR:forge:idle',
      idempotencyKey: 'purchase-0001',
      ownerUserId: 'attacker',
      roleId: 'elevator',
      price: 1,
    }),
    deps({
      purchaseCat: async (userId, assetId, idempotencyKey) => {
        received = { userId, assetId, idempotencyKey };
        return { ...EMPTY, collectionRevision: 1 };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    userId: 'user-1',
    assetId: 'miner:SSR:forge:idle',
    idempotencyKey: 'purchase-0001',
  });
});

Deno.test('assignment forwards the expected revision and maps a stale command to 409', async () => {
  let received: { userId: string; catInstanceId: string | null; slotKey: string; expected: number } | null = null;
  const response = await handleRequest(
    request('/v1/assignment', 'POST', {
      catInstanceId: 'cat-2',
      slotKey: 'elevator:main',
      expectedAssignmentRevision: 7,
      ownerUserId: 'attacker',
      roleId: 'miner',
    }),
    deps({
      replaceAssignment: async (userId, command) => {
        received = {
          userId,
          catInstanceId: command.catInstanceId,
          slotKey: command.slotKey,
          expected: command.expectedAssignmentRevision,
        };
        return { error: 'stale_revision' };
      },
    }),
  );

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'stale_revision');
  assert.deepEqual(received, {
    userId: 'user-1',
    catInstanceId: 'cat-2',
    slotKey: 'elevator:main',
    expected: 7,
  });
});

Deno.test('assignment accepts explicit default reset, but not a missing cat id', async () => {
  let called = 0;
  const dependencies = deps({ replaceAssignment: async (userId, command) => {
    assert.equal(userId, 'user-1');
    assert.equal(command.catInstanceId, null);
    assert.equal(command.slotKey, 'hauler:1');
    called++;
    return EMPTY;
  } });
  const reset = await handleRequest(request('/v1/assignment', 'POST', {
    catInstanceId: null, slotKey: 'hauler:1', expectedAssignmentRevision: 1,
  }), dependencies);
  assert.equal(reset.status, 200);
  const missing = await handleRequest(request('/v1/assignment', 'POST', {
    slotKey: 'hauler:1', expectedAssignmentRevision: 1,
  }), dependencies);
  assert.equal(missing.status, 400);
  assert.equal(called, 1);
});

Deno.test('assignment rejects malformed revisions before calling the repository', async () => {
  let called = false;
  const response = await handleRequest(
    request('/v1/assignment', 'POST', {
      catInstanceId: 'cat-2',
      slotKey: 'elevator:main',
      expectedAssignmentRevision: -1,
    }),
    deps({ replaceAssignment: async () => {
      called = true;
      return EMPTY;
    } }),
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.ok((await response.json()).error);
});

Deno.test('marketplace listing routes authenticate and forward caller-scoped commands', async () => {
  let received: { userId: string; catInstanceId: string; listingType: string; priceExact: string } | null = null;
  const response = await handleRequest(
    request('/v1/listings', 'POST', {
      catInstanceId: 'cat-1',
      listingType: 'rent',
      priceExact: '250',
      idempotencyKey: 'listing-0001',
      ownerUserId: 'attacker',
    }),
    deps({
      createListing: async (userId, command) => {
        received = { userId, ...command };
        return MARKETPLACE_EMPTY;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    userId: 'user-1',
    catInstanceId: 'cat-1',
    listingType: 'rent',
    priceExact: '250',
    idempotencyKey: 'listing-0001',
  });
});

Deno.test('rent route rejects invalid duration before reaching the marketplace service', async () => {
  let called = false;
  const response = await handleRequest(
    request('/v1/listings/listing-1/rent', 'POST', {
      durationHours: 25,
      idempotencyKey: 'rent-0001',
    }),
    deps({
      rentListing: async () => {
        called = true;
        return MARKETPLACE_EMPTY;
      },
    }),
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_duration');
  assert.equal(called, false);
});

Deno.test('marketplace GET forwards type and mine scope', async () => {
  let received: { userId: string; type: string | null; mineOnly: boolean } | null = null;
  const response = await handleRequest(
    request('/v1/listings?type=sale&scope=mine', 'GET'),
    deps({
      readMarketplace: async (userId, type, mineOnly) => {
        received = { userId, type, mineOnly };
        return { listings: [] };
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, { userId: 'user-1', type: 'sale', mineOnly: true });
});
