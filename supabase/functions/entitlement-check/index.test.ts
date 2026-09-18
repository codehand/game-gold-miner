import assert from 'node:assert/strict';

import {
  deriveEntitlementEffects,
  extractBearerToken,
  handleEntitlementCheck,
  SUPPORTER_BADGE_ENTITLEMENT,
} from './index.ts';

Deno.test('extractBearerToken parses a bearer token and rejects other schemes', () => {
  assert.equal(extractBearerToken('bearer   token-value'), 'token-value');
  assert.equal(extractBearerToken('Basic token-value'), null);
  assert.equal(extractBearerToken(null), null);
});

Deno.test('deriveEntitlementEffects activates only the server-owned supporter badge key', () => {
  assert.deepEqual(
    deriveEntitlementEffects([{ key: SUPPORTER_BADGE_ENTITLEMENT }]),
    { supporterBadge: true },
  );
  assert.deepEqual(deriveEntitlementEffects([]), { supporterBadge: false });
});

Deno.test('handleEntitlementCheck rejects unsupported methods before reading entitlements', async () => {
  const response = await handleEntitlementCheck(
    new Request('http://localhost/functions/v1/entitlement-check', { method: 'POST' }),
    () => {
      throw new Error('readActiveEntitlements must not run for an unsupported method.');
    },
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'malformed_request');
});

Deno.test('handleEntitlementCheck answers 401 without a bearer token', async () => {
  const response = await handleEntitlementCheck(
    new Request('http://localhost/functions/v1/entitlement-check'),
    () => {
      throw new Error('readActiveEntitlements must not run without a token.');
    },
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

Deno.test('handleEntitlementCheck answers 401 when the token is rejected', async () => {
  const response = await handleEntitlementCheck(
    new Request('http://localhost/functions/v1/entitlement-check', {
      headers: { authorization: 'Bearer bad-token' },
    }),
    async () => null,
  );

  assert.equal(response.status, 401);
});

Deno.test('handleEntitlementCheck exposes the server-granted effect', async () => {
  const response = await handleEntitlementCheck(
    new Request('http://localhost/functions/v1/entitlement-check', {
      headers: { authorization: 'Bearer good-token' },
    }),
    async (token) => {
      assert.equal(token, 'good-token');
      return {
        entitlements: [
          {
            key: SUPPORTER_BADGE_ENTITLEMENT,
            grantedAt: '2026-09-19T00:00:00.000Z',
            source: 'server-test',
          },
        ],
        effects: { supporterBadge: true },
      };
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    entitlements: [
      {
        key: SUPPORTER_BADGE_ENTITLEMENT,
        grantedAt: '2026-09-19T00:00:00.000Z',
        source: 'server-test',
      },
    ],
    effects: { supporterBadge: true },
  });
});

Deno.test('handleEntitlementCheck returns CORS preflight before authentication', async () => {
  const response = await handleEntitlementCheck(
    new Request('http://localhost/functions/v1/entitlement-check', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    }),
    () => {
      throw new Error('readActiveEntitlements must not run for a preflight.');
    },
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
});

Deno.test('handleEntitlementCheck propagates resolver errors for the outer 500 wrapper', async () => {
  await assert.rejects(
    () =>
      handleEntitlementCheck(
        new Request('http://localhost/functions/v1/entitlement-check', {
          headers: { authorization: 'Bearer good-token' },
        }),
        () => {
          throw new Error('entitlement lookup failed');
        },
      ),
    /entitlement lookup failed/,
  );
});
