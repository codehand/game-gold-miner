/**
 * Server-milestone Step 7: the harness's simplest possible example of a "pure
 * handler" unit test — no `Deno.env`, no network, no permissions flag needed
 * to run this file at all.
 */
import assert from 'node:assert/strict';

import { errorResponse, jsonResponse } from './http.ts';

Deno.test('jsonResponse serializes the body under the JSON envelope headers', async () => {
  const response = jsonResponse(200, { ok: true });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true });
});

Deno.test('errorResponse omits detail and retry-after when neither is given', async () => {
  const response = errorResponse(400, 'malformed_request', 'Bad request.');

  assert.deepEqual(await response.json(), {
    error: { code: 'malformed_request', message: 'Bad request.' },
  });
  assert.equal(response.headers.get('retry-after'), null);
});

Deno.test('errorResponse includes detail when given', async () => {
  const response = errorResponse(400, 'malformed_request', 'Bad request.', {
    detail: { method: 'POST' },
  });

  assert.deepEqual(await response.json(), {
    error: { code: 'malformed_request', message: 'Bad request.', detail: { method: 'POST' } },
  });
});

Deno.test('errorResponse sets Retry-After when given', async () => {
  const response = errorResponse(503, 'service_unavailable', 'Down.', {
    retryAfterSeconds: 5,
  });

  assert.equal(response.headers.get('retry-after'), '5');
});
