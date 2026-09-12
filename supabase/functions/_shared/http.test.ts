/**
 * Server-milestone Step 7: the harness's simplest possible example of a "pure
 * handler" unit test — no `Deno.env`, no network, no permissions flag needed
 * to run this file at all.
 */
import assert from 'node:assert/strict';

import { corsHeaders, corsPreflightResponse, errorResponse, jsonResponse } from './http.ts';

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

// Server-milestone Step 12 (finding F11): the first function called directly
// from a browser needs a CORS policy, defined once here rather than per
// function.
Deno.test('corsHeaders is empty for a null origin', () => {
  assert.deepEqual(corsHeaders(null), {});
});

Deno.test('corsHeaders is empty for an origin not on the allow-list', () => {
  assert.deepEqual(corsHeaders('https://evil.example'), {});
});

Deno.test('corsHeaders reflects an allow-listed dev origin', () => {
  assert.deepEqual(corsHeaders('http://127.0.0.1:5173'), {
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    vary: 'Origin',
  });
});

Deno.test('jsonResponse carries no CORS header by default', () => {
  const response = jsonResponse(200, { ok: true });
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

Deno.test('jsonResponse reflects an allow-listed origin when given one', () => {
  const response = jsonResponse(200, { ok: true }, 'http://localhost:5173');
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

Deno.test('errorResponse reflects an allow-listed origin when given one', () => {
  const response = errorResponse(400, 'malformed_request', 'Bad request.', {
    origin: 'http://127.0.0.1:5173',
  });
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
});

Deno.test('corsPreflightResponse answers 204 with the allowed methods and headers', async () => {
  const request = new Request('http://example/fn', {
    method: 'OPTIONS',
    headers: { origin: 'http://127.0.0.1:5173' },
  });
  const response = corsPreflightResponse(request, 'POST, OPTIONS');

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), 'content-type');
  assert.equal(await response.text(), '');
});

Deno.test('corsPreflightResponse carries no Allow-Origin for a disallowed origin', () => {
  const request = new Request('http://example/fn', {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example' },
  });
  const response = corsPreflightResponse(request, 'POST, OPTIONS');

  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
