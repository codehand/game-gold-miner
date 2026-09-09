/**
 * Server-milestone Step 7: unit tests against the pure handler, importing
 * `./index.ts` directly rather than making an HTTP request. Importing this
 * file does not start a live listener — `Deno.serve` in `index.ts` is guarded
 * by `import.meta.main`, which is false here.
 */
import assert from 'node:assert/strict';

import { handleRequest, resolveFunctionRoute } from './index.ts';

Deno.test('resolveFunctionRoute strips the platform and function route prefixes', () => {
  assert.equal(
    resolveFunctionRoute('https://x.supabase.co/functions/v1/save-sync/v1/health'),
    '/v1/health',
  );
});

Deno.test('resolveFunctionRoute strips a trailing slash', () => {
  assert.equal(
    resolveFunctionRoute('https://x.supabase.co/functions/v1/save-sync/v1/health/'),
    '/v1/health',
  );
});

Deno.test('resolveFunctionRoute returns / for the bare function root', () => {
  assert.equal(resolveFunctionRoute('https://x.supabase.co/functions/v1/save-sync'), '/');
});

Deno.test('resolveFunctionRoute works without the platform prefix too', () => {
  assert.equal(resolveFunctionRoute('http://localhost/v1/health'), '/v1/health');
});

Deno.test('handleRequest answers malformed_request for an unknown route', async () => {
  const request = new Request('http://localhost/v1/does-not-exist');
  const response = await handleRequest(request);

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'malformed_request');
});

Deno.test('handleRequest rejects a non-GET/HEAD method on the health route', async () => {
  const request = new Request('http://localhost/v1/health', { method: 'POST' });
  const response = await handleRequest(request);

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'malformed_request');
  assert.equal(body.error.detail.method, 'POST');
});

// `handleHealth` itself calls `fetch` against `Deno.env.get('SUPABASE_URL')`
// and is not exported separately from `handleRequest`, so a true 200/503/500
// health-body assertion belongs to the integration suite in
// `tests/server-integration/`, against the real running stack — that is
// exactly the boundary Step 7 draws between the two test categories.
