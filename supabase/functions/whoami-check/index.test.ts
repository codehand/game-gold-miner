/**
 * Server-milestone Step 7: unit tests against the pure handler. Every case
 * here injects a fake `ResolveCaller` — none reaches Supabase Auth or
 * Postgres — so this file runs with zero permission flags. The one real
 * `ResolveCaller`, `resolveCallerViaSupabaseAuth`, is exercised only by
 * `tests/server-integration/whoami.integration.test.ts` against the live
 * stack.
 */
import assert from 'node:assert/strict';

import { extractBearerToken, handleWhoAmI } from './index.ts';

Deno.test('extractBearerToken parses a well-formed header', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
});

Deno.test('extractBearerToken accepts extra whitespace and is case-insensitive on the scheme', () => {
  assert.equal(extractBearerToken('bearer   abc123'), 'abc123');
});

Deno.test('extractBearerToken rejects a missing header', () => {
  assert.equal(extractBearerToken(null), null);
});

Deno.test('extractBearerToken rejects a non-Bearer scheme', () => {
  assert.equal(extractBearerToken('Basic abc123'), null);
});

Deno.test('handleWhoAmI rejects a non-GET/HEAD method before resolving the caller', async () => {
  const request = new Request('http://localhost/v1/whoami', { method: 'POST' });
  const response = await handleWhoAmI(request, () => {
    throw new Error('resolveCaller must not be called for a rejected method.');
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'malformed_request');
});

Deno.test('handleWhoAmI answers 401 with no Authorization header', async () => {
  const request = new Request('http://localhost/v1/whoami');
  const response = await handleWhoAmI(request, () => {
    throw new Error('resolveCaller must not be called with no token.');
  });

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, 'unauthenticated');
});

Deno.test('handleWhoAmI answers 401 when the resolver rejects the token', async () => {
  const request = new Request('http://localhost/v1/whoami', {
    headers: { authorization: 'Bearer bad-token' },
  });
  const response = await handleWhoAmI(request, async () => null);

  assert.equal(response.status, 401);
});

Deno.test('handleWhoAmI answers 200 with the resolved caller for a valid token', async () => {
  const request = new Request('http://localhost/v1/whoami', {
    headers: { authorization: 'Bearer good-token' },
  });
  const response = await handleWhoAmI(request, async (token) => {
    assert.equal(token, 'good-token');
    return { userId: 'fixture-user', displayName: 'Dev Guest' };
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    userId: 'fixture-user',
    displayName: 'Dev Guest',
  });
});

Deno.test('handleWhoAmI passes displayName through as null unchanged', async () => {
  const request = new Request('http://localhost/v1/whoami', {
    headers: { authorization: 'Bearer good-token' },
  });
  const response = await handleWhoAmI(request, async () => ({
    userId: 'fixture-user',
    displayName: null,
  }));

  assert.deepEqual(await response.json(), { userId: 'fixture-user', displayName: null });
});

Deno.test(
  'handleWhoAmI does not turn a resolver failure into 401 — it must propagate',
  async () => {
    // A thrown resolver error means the resolver could not even check the
    // token — e.g. `resolveCallerViaSupabaseAuth` throws when
    // SUPABASE_URL/SUPABASE_ANON_KEY is missing — which is not the same claim
    // as "this token is invalid." `handleWhoAmI` must not catch it and answer
    // 401 either way; only the `Deno.serve` wrapper in `index.ts`, which
    // converts any propagated error to `500 server_error`, may turn this into
    // a response. Asserting the promise rejects here is what keeps that
    // conversion the *only* place a config error can end up, rather than one
    // path quietly becoming 500 and another quietly becoming 401.
    const request = new Request('http://localhost/v1/whoami', {
      headers: { authorization: 'Bearer any-token' },
    });

    await assert.rejects(
      () =>
        handleWhoAmI(request, () => {
          throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
        }),
      /SUPABASE_URL or SUPABASE_ANON_KEY is not configured\./,
    );
  },
);
