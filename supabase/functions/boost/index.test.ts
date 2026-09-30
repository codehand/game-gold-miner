import assert from 'node:assert/strict';

import { handleBoostRequest, type BoostDeps } from './index.ts';

const endpoint = 'http://localhost:54321/functions/v1/boost';
const request = (path: string, method = 'GET', token = 'valid') =>
  new Request(`${endpoint}${path}`, {
    method,
    headers: token === '' ? {} : { authorization: `Bearer ${token}` },
  });

Deno.test('Boost status and activation are scoped to the authenticated caller', async () => {
  const calls: string[] = [];
  const deps: BoostDeps = {
    resolveCaller: async (token) => token === 'valid' ? 'user-a' : null,
    readBoost: async (userId) => { calls.push(`read:${userId}`); return 1000; },
    activate: async (userId) => { calls.push(`activate:${userId}`); return 2000; },
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
  assert.equal((await activated.json()).kind, 'activated');
  assert.deepEqual(calls, ['read:user-a', 'activate:user-a']);
});

Deno.test('Cooldown returns the existing activation and does not mint a second boost', async () => {
  const deps: BoostDeps = {
    resolveCaller: async () => 'user-a',
    readBoost: async () => 1234,
    activate: async () => null,
  };
  const response = await handleBoostRequest(request('/v1/activate', 'POST'), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.kind, 'cooldown');
  assert.equal(body.boost.lastActivatedAtMs, 1234);
});

Deno.test('Preflight and unsupported routes never authenticate', async () => {
  const deps: BoostDeps = {
    resolveCaller: async () => { throw new Error('unexpected auth'); },
    readBoost: async () => null,
    activate: async () => null,
  };
  assert.equal((await handleBoostRequest(request('/v1/activate', 'OPTIONS', ''), deps)).status, 204);
  assert.equal((await handleBoostRequest(request('/v1/other', 'POST', ''), deps)).status, 400);
});

Deno.test('Kong function-relative paths resolve to the same Boost routes', async () => {
  const deps: BoostDeps = {
    resolveCaller: async () => 'user-a',
    readBoost: async () => null,
    activate: async () => null,
  };
  const response = await handleBoostRequest(
    new Request('http://localhost:54321/boost/v1/status', {
      headers: { authorization: 'Bearer valid' },
    }),
    deps,
  );
  assert.equal(response.status, 200);
});
