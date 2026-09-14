/**
 * Server-milestone Step 7: unit tests against the pure handler, importing
 * `./index.ts` directly rather than making an HTTP request. Importing this
 * file does not start a live listener — `Deno.serve` in `index.ts` is guarded
 * by `import.meta.main`, which is false here.
 *
 * Server-milestone Step 16 adds coverage for `PUT /v1/save`, the same
 * injected-`SaveSyncDeps` shape `telegram-sign-in/index.test.ts` uses for
 * `handleTelegramSignIn` — every response branch faked with zero permissions
 * and no live database; the one real collaborator each (Supabase Auth
 * verification, the `saves` read, the service-role write) is exercised only
 * by `tests/server-integration/save-upload.integration.test.ts`.
 */
import assert from 'node:assert/strict';

import { createInitialGameState, createSaveDocument, BASE_GAME_BALANCE } from '../_shared/generated/core-bundle.js';
import { handleRequest, resolveFunctionRoute, type SaveSyncDeps, type StoredSaveRow } from './index.ts';

const FIXTURE_USER_ID = '11111111-1111-1111-1111-111111111111';
const NOW_MS = 1_757_000_000_000;

function validSaveDocument(): unknown {
  const state = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
}

/** The schema version the server stamps rows with, read off a valid document rather than hardcoded. */
function serverSchemaVersion(): number {
  return (validSaveDocument() as { schemaVersion: number }).schemaVersion;
}

function noopDeps(overrides: Partial<SaveSyncDeps> = {}): SaveSyncDeps {
  return {
    resolveCaller: async () => {
      throw new Error('resolveCaller should not have been called');
    },
    readCurrentSave: async () => {
      throw new Error('readCurrentSave should not have been called');
    },
    writeSaveRow: async () => {
      throw new Error('writeSaveRow should not have been called');
    },
    ...overrides,
  };
}

function putSaveRequest(body: unknown, init: { readonly token?: string | null; readonly rawBody?: string } = {}): Request {
  const { token = 'a-valid-token', rawBody } = init;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request('http://localhost/v1/save', {
    method: 'PUT',
    headers,
    body: rawBody ?? JSON.stringify(body),
  });
}

function getSaveRequest(init: { readonly token?: string | null } = {}): Request {
  const { token = 'a-valid-token' } = init;
  const headers: Record<string, string> = {};
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request('http://localhost/v1/save', { method: 'GET', headers });
}

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

Deno.test('handleRequest answers a CORS preflight on /v1/save before any other check', async () => {
  const request = new Request('http://localhost/v1/save', { method: 'OPTIONS' });
  const response = await handleRequest(request, noopDeps());

  assert.equal(response.status, 204);
});

Deno.test('handleSaveUpload rejects an unsupported method on /v1/save', async () => {
  const request = new Request('http://localhost/v1/save', { method: 'DELETE' });
  const response = await handleRequest(request, noopDeps());

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'malformed_request');
});

Deno.test('handleSaveUpload answers 401 with no Authorization header', async () => {
  const request = new Request('http://localhost/v1/save', {
    method: 'PUT',
    body: JSON.stringify({ baseRevision: null, document: validSaveDocument() }),
  });
  const response = await handleRequest(request, noopDeps());

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

Deno.test('handleSaveUpload answers 401 when the resolver rejects the token', async () => {
  const request = putSaveRequest({ baseRevision: null, document: validSaveDocument() });
  const response = await handleRequest(
    request,
    noopDeps({ resolveCaller: async () => null }),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

Deno.test('handleSaveUpload answers 413 for a body over the size cap, before parsing it', async () => {
  const request = putSaveRequest(undefined, { rawBody: '{' + 'a'.repeat(70_000) });
  const response = await handleRequest(
    request,
    noopDeps({ resolveCaller: async () => ({ userId: FIXTURE_USER_ID }) }),
  );

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'payload_too_large');
});

Deno.test('handleSaveUpload answers 413 via the Content-Length pre-check, before the body is even read', async () => {
  // A 2026-09-12 review finding: `new Request` with a plain string `body`
  // never populates `Content-Length` on its own, so the test above only
  // ever exercises the *post-read* check — nothing distinguished "refused
  // before buffering" from "refused after buffering," which is the entire
  // property the pre-check exists to add. Setting the header explicitly (it
  // does survive on Deno's `Request`, unlike a browser's fetch) reproduces a
  // client that declares a body far larger than what it actually sends, so
  // only the pre-check — not the post-read one — can catch this: the real
  // body is 2 bytes, comfortably under the cap.
  const request = new Request('http://localhost/v1/save', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer a-valid-token',
      'content-length': '70000',
    },
    body: '{}',
  });
  const response = await handleRequest(
    request,
    noopDeps({ resolveCaller: async () => ({ userId: FIXTURE_USER_ID }) }),
  );

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'payload_too_large');
});

Deno.test('handleSaveUpload answers 400 for a body that is not valid JSON', async () => {
  const request = putSaveRequest(undefined, { rawBody: 'not json' });
  const response = await handleRequest(
    request,
    noopDeps({ resolveCaller: async () => ({ userId: FIXTURE_USER_ID }) }),
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'malformed_request');
});

Deno.test('handleSaveUpload answers 400 for a body missing document or baseRevision', async () => {
  const request = putSaveRequest({ document: validSaveDocument() });
  const response = await handleRequest(
    request,
    noopDeps({ resolveCaller: async () => ({ userId: FIXTURE_USER_ID }) }),
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'malformed_request');
});

Deno.test('handleSaveUpload answers 400 when baseRevision is neither a number nor null', async () => {
  const request = putSaveRequest({ baseRevision: 'seven', document: validSaveDocument() });
  const response = await handleRequest(
    request,
    noopDeps({ resolveCaller: async () => ({ userId: FIXTURE_USER_ID }) }),
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'malformed_request');
});

Deno.test('handleSaveUpload answers 422 schema_unsupported for a schemaVersion the server does not understand', async () => {
  const document = { ...(validSaveDocument() as Record<string, unknown>), schemaVersion: 3 };
  const request = putSaveRequest({ baseRevision: null, document });
  const response = await handleRequest(
    request,
    noopDeps({ resolveCaller: async () => ({ userId: FIXTURE_USER_ID }) }),
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, 'schema_unsupported');
  assert.deepEqual(body.error.detail.supported, [serverSchemaVersion()]);
});

Deno.test('handleSaveUpload migrates and accepts an older version-1 document rather than refusing it', async () => {
  const current = validSaveDocument() as Record<string, unknown> & {
    state: { warehouse: Record<string, unknown> };
  };
  const legacyWarehouse = Object.fromEntries(
    Object.entries(current.state.warehouse).filter(
      ([key]) => key !== 'totalOfflineGoldClaimed',
    ),
  );
  const legacy = {
    ...current,
    schemaVersion: 1,
    state: { ...current.state, warehouse: legacyWarehouse },
  };
  const request = putSaveRequest({ baseRevision: null, document: legacy });
  let writtenDocumentJson = '';
  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => null,
      writeSaveRow: async (_userId, row) => {
        writtenDocumentJson = row.documentJson;
        return true;
      },
    }),
  );

  assert.equal(response.status, 200);
  const written = JSON.parse(writtenDocumentJson) as {
    schemaVersion: number;
    state: { warehouse: Record<string, unknown> };
  };
  assert.equal(written.schemaVersion, serverSchemaVersion());
  assert.equal(written.state.warehouse.totalOfflineGoldClaimed, '0');
});

Deno.test('handleSaveUpload answers 422 save_invalid for a document that fails validation', async () => {
  const document = { ...(validSaveDocument() as Record<string, unknown>), state: 'not-an-object' };
  const request = putSaveRequest({ baseRevision: null, document });
  const response = await handleRequest(
    request,
    noopDeps({ resolveCaller: async () => ({ userId: FIXTURE_USER_ID }) }),
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, 'save_invalid');
  assert.equal(typeof body.error.detail.reason, 'string');
});

Deno.test('handleSaveUpload accepts a first upload (baseRevision null, no stored row) at revision 1', async () => {
  const document = validSaveDocument();
  const request = putSaveRequest({ baseRevision: null, document });
  let written: unknown;
  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => null,
      writeSaveRow: async (userId, row) => {
        written = { userId, row };
        return true;
      },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.revision, 1);
  assert.equal(typeof body.receivedAt, 'string');
  assert.deepEqual(written, {
    userId: FIXTURE_USER_ID,
    row: {
      revision: 1,
      schemaVersion: serverSchemaVersion(),
      documentJson: JSON.stringify(document),
      receivedAt: body.receivedAt,
      previousRevision: null,
      previousDocumentJson: null,
      previousReceivedAt: null,
    },
  });
});

Deno.test('handleSaveUpload accepts a subsequent upload matching the stored revision, shifting current to previous', async () => {
  const document = validSaveDocument();
  const stored: StoredSaveRow = {
    revision: 7,
    documentJson: JSON.stringify({ schemaVersion: 1, fixture: 'old' }),
    receivedAt: '2026-01-01T00:00:00.000Z',
  };
  const request = putSaveRequest({ baseRevision: 7, document });
  let written: unknown;
  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
      writeSaveRow: async (userId, row) => {
        written = { userId, row };
        return true;
      },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.revision, 8);
  assert.deepEqual(written, {
    userId: FIXTURE_USER_ID,
    row: {
      revision: 8,
      schemaVersion: serverSchemaVersion(),
      documentJson: JSON.stringify(document),
      receivedAt: body.receivedAt,
      previousRevision: 7,
      previousDocumentJson: stored.documentJson,
      previousReceivedAt: stored.receivedAt,
    },
  });
});

Deno.test('handleSaveUpload answers 409 revision_conflict when writeSaveRow loses a compare-and-swap race, re-reading the actual winner', async () => {
  // Both requests read revision 7 and pass the baseRevision check; this one
  // loses the race at the write itself (the real `writeSaveRowViaServiceRole`
  // resolves false here, having failed its own `where revision = 7` update).
  // The handler must not report the 200 it would have if the write were a
  // blind upsert — it re-reads and reports the actual current state instead.
  const winner: StoredSaveRow = {
    revision: 8,
    documentJson: JSON.stringify({ schemaVersion: 1, fixture: 'the-other-request-won' }),
    receivedAt: '2026-01-03T00:00:00.000Z',
  };
  let readCalls = 0;
  const response = await handleRequest(
    putSaveRequest({ baseRevision: 7, document: validSaveDocument() }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => {
        readCalls += 1;
        return readCalls === 1
          ? { revision: 7, documentJson: JSON.stringify({ schemaVersion: 1, fixture: 'stale' }), receivedAt: '2026-01-01T00:00:00.000Z' }
          : winner;
      },
      writeSaveRow: async () => false,
    }),
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, 'revision_conflict');
  assert.equal(body.error.detail.serverRevision, 8);
  assert.deepEqual(body.error.detail.document, JSON.parse(winner.documentJson));
  assert.equal(readCalls, 2);
});

Deno.test('handleSaveUpload answers 409 revision_conflict for a stale baseRevision, with the server document and no write', async () => {
  const stored: StoredSaveRow = {
    revision: 9,
    documentJson: JSON.stringify({ schemaVersion: 1, fixture: 'server-side' }),
    receivedAt: '2026-01-02T00:00:00.000Z',
  };
  const request = putSaveRequest({ baseRevision: 7, document: validSaveDocument() });
  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
    }),
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, 'revision_conflict');
  assert.equal(body.error.detail.serverRevision, 9);
  assert.equal(body.error.detail.receivedAt, stored.receivedAt);
  assert.deepEqual(body.error.detail.document, JSON.parse(stored.documentJson));
});

Deno.test('handleSaveUpload answers 409 revision_conflict when the client claims a prior sync but the server has none', async () => {
  const request = putSaveRequest({ baseRevision: 3, document: validSaveDocument() });
  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => null,
    }),
  );

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'revision_conflict');
});

Deno.test('handleSaveDownload answers 401 with no Authorization header', async () => {
  const response = await handleRequest(getSaveRequest({ token: null }), noopDeps());

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

Deno.test('handleSaveDownload answers 401 when the resolver rejects the token', async () => {
  const response = await handleRequest(
    getSaveRequest(),
    noopDeps({ resolveCaller: async () => null }),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

Deno.test('handleSaveDownload answers 204 with no body when the account has no cloud save', async () => {
  const response = await handleRequest(
    getSaveRequest(),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => null,
    }),
  );

  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
});

Deno.test('handleSaveDownload answers 200 with the stored revision, receivedAt, and parsed document', async () => {
  const document = validSaveDocument();
  const stored: StoredSaveRow = {
    revision: 4,
    documentJson: JSON.stringify(document),
    receivedAt: '2026-03-01T00:00:00.000Z',
  };
  const response = await handleRequest(
    getSaveRequest(),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    revision: 4,
    receivedAt: stored.receivedAt,
    document,
  });
});
