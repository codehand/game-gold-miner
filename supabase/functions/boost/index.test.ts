import assert from 'node:assert/strict';

import { handleBoostRequest, type BoostDeps } from './index.ts';

const endpoint = 'http://localhost:54321/functions/v1/boost';
const COMMAND = {
  mineId: 'amethyst',
  baseRevision: 7,
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
};
const request = (path: string, method = 'GET', token = 'valid') =>
  new Request(`${endpoint}${path}`, {
    method,
    headers: token === '' ? {} : {
      authorization: `Bearer ${token}`,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify(COMMAND) : undefined,
  });

Deno.test('Boost status and activation are scoped to the authenticated caller', async () => {
  const calls: string[] = [];
  const deps: BoostDeps = {
    resolveCaller: async (token) => token === 'valid' ? 'user-a' : null,
    readBoost: async (userId) => {
      calls.push(`read:${userId}`);
      return { lastActivatedAtMs: 1000, mineId: 'gold' };
    },
    activate: async (userId, command) => {
      calls.push(`activate:${userId}:${command.mineId}`);
      return {
        kind: 'activated',
        boost: { lastActivatedAtMs: 2000, mineId: command.mineId },
        saveRevision: 8,
      };
    },
  };

  const missing = await handleBoostRequest(request('/v1/activate', 'POST', ''), deps);
  assert.equal(missing.status, 401);
  assert.deepEqual(calls, []);

  const invalid = await handleBoostRequest(request('/v1/activate', 'POST', 'wrong'), deps);
  assert.equal(invalid.status, 401);
  assert.deepEqual(calls, []);

  const status = await handleBoostRequest(request('/v1/status'), deps);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).boost.lastActivatedAtMs, 1000);

  const activated = await handleBoostRequest(request('/v1/activate', 'POST'), deps);
  assert.equal(activated.status, 200);
  const activatedBody = await activated.json();
  assert.equal(activatedBody.kind, 'activated');
  assert.deepEqual(activatedBody.boost, { lastActivatedAtMs: 2000 });
  assert.equal(activatedBody.boostMineId, 'amethyst');
  assert.equal(activatedBody.saveRevision, 8);
  assert.equal(Number.isSafeInteger(activatedBody.serverNowMs), true);
  assert.deepEqual(calls, ['read:user-a', 'activate:user-a:amethyst']);
});

Deno.test('Cooldown returns the existing activation and does not mint a second boost', async () => {
  const deps: BoostDeps = {
    resolveCaller: async () => 'user-a',
    readBoost: async () => ({ lastActivatedAtMs: 1234, mineId: 'ruby' }),
    activate: async () => ({
      kind: 'cooldown',
      boost: { lastActivatedAtMs: 1234, mineId: 'ruby' },
      saveRevision: 5,
    }),
  };
  const response = await handleBoostRequest(request('/v1/activate', 'POST'), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.kind, 'cooldown');
  assert.equal(body.boost.lastActivatedAtMs, 1234);
  assert.equal(body.boostMineId, 'ruby');
});

Deno.test('Preflight and unsupported routes never authenticate', async () => {
  const deps: BoostDeps = {
    resolveCaller: async () => { throw new Error('unexpected auth'); },
    readBoost: async () => ({ lastActivatedAtMs: null, mineId: null }),
    activate: async () => ({
      kind: 'cooldown', boost: { lastActivatedAtMs: 1, mineId: 'gold' }, saveRevision: 1,
    }),
  };
  assert.equal((await handleBoostRequest(request('/v1/activate', 'OPTIONS', ''), deps)).status, 204);
  assert.equal((await handleBoostRequest(request('/v1/other', 'POST', ''), deps)).status, 400);
});

Deno.test('Kong function-relative paths resolve to the same Boost routes', async () => {
  const deps: BoostDeps = {
    resolveCaller: async () => 'user-a',
    readBoost: async () => ({ lastActivatedAtMs: null, mineId: null }),
    activate: async () => ({
      kind: 'cooldown', boost: { lastActivatedAtMs: 1, mineId: 'gold' }, saveRevision: 1,
    }),
  };
  const response = await handleBoostRequest(
    new Request('http://localhost:54321/boost/v1/status', {
      headers: { authorization: 'Bearer valid' },
    }),
    deps,
  );
  assert.equal(response.status, 200);
});
