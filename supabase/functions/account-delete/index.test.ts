import assert from 'node:assert/strict';

import {
  extractBearerToken,
  handleAccountDelete,
} from './index.ts';

function request(method = 'POST', token: string | null = 'token'): Request {
  const headers = new Headers();
  if (token !== null) {
    headers.set('authorization', `Bearer ${token}`);
  }
  return new Request('http://localhost/functions/v1/account-delete/v1/account/delete', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify({ userId: 'attacker-id' }) : undefined,
  });
}

Deno.test('extractBearerToken accepts only a bearer credential', () => {
  assert.equal(extractBearerToken('Bearer abc'), 'abc');
  assert.equal(extractBearerToken('bearer   abc'), 'abc');
  assert.equal(extractBearerToken('Basic abc'), null);
  assert.equal(extractBearerToken(null), null);
});

Deno.test('account deletion requires POST and a bearer token', async () => {
  const noToken = await handleAccountDelete(request('POST', null), async () => ({ userId: 'user' }), async () => {});
  assert.equal(noToken.status, 401);

  const wrongMethod = await handleAccountDelete(request('GET'), async () => ({ userId: 'user' }), async () => {});
  assert.equal(wrongMethod.status, 400);
});

Deno.test('account deletion answers a CORS preflight before authentication', async () => {
  const response = await handleAccountDelete(
    new Request('http://localhost/functions/v1/account-delete/v1/account/delete', {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:5173' },
    }),
    async () => {
      throw new Error('must not authenticate a preflight');
    },
    async () => {
      throw new Error('must not delete on a preflight');
    },
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});

Deno.test('only the authenticated caller id reaches the deletion collaborator', async () => {
  let deletedUserId: string | null = null;
  const response = await handleAccountDelete(
    request(),
    async (token) => ({ userId: `resolved-${token}` }),
    async (userId) => {
      deletedUserId = userId;
    },
  );

  assert.equal(response.status, 200);
  assert.equal(deletedUserId, 'resolved-token');
  assert.deepEqual(await response.json(), { deleted: true });
});

Deno.test('invalid callers never reach the deletion collaborator', async () => {
  let called = false;
  const response = await handleAccountDelete(
    request(),
    async () => null,
    async () => {
      called = true;
    },
  );

  assert.equal(response.status, 401);
  assert.equal(called, false);
});

Deno.test('deletion errors remain visible to the function wrapper boundary', async () => {
  await assert.rejects(
    () => handleAccountDelete(request(), async () => ({ userId: 'user' }), async () => {
      throw new Error('database unavailable');
    }),
    Error,
    'database unavailable',
  );
});
