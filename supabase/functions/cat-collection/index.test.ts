import assert from 'node:assert/strict';

import {
  handleRequest,
  type CatCollectionDependencies,
  type CatCollectionProjection,
} from './index.ts';

const EMPTY: CatCollectionProjection = {
  cats: [],
  assignments: [],
  assignmentRevision: 0,
  collectionRevision: 0,
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
  let received: { userId: string; catInstanceId: string; slotKey: string; expected: number } | null = null;
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
