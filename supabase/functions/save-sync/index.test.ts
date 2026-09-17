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

import { createInitialGameState, createSaveDocument, GameNumber, BASE_GAME_BALANCE } from '../_shared/generated/core-bundle.js';
import type { RateLimiter } from '../_shared/rateLimit.ts';
import {
  createSaveSyncRateLimiters,
  handleRequest,
  normalizeAuditRevision,
  resolveFunctionRoute,
  SAVE_UPLOAD_MAX_PER_USER,
  type SaveAuditEntry,
  type SaveSyncDeps,
  type SaveSyncRateLimiters,
  type StoredSaveRow,
} from './index.ts';

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

/** A valid document whose floor 1 and warehouse carry the given monotonic totals. */
function progressedSaveDocument(overrides: {
  readonly delivered: string;
  readonly extracted: string;
  readonly transported: string;
}): unknown {
  const base = createInitialGameState(BASE_GAME_BALANCE, NOW_MS);
  const state = {
    ...base,
    warehouse: {
      ...base.warehouse,
      totalGoldDelivered: GameNumber.from(overrides.delivered),
      totalOfflineGoldClaimed: GameNumber.from(0),
    },
    floors: base.floors.map((floor: Record<string, unknown>, index: number) =>
      index === 0
        ? {
            ...floor,
            totalExtracted: GameNumber.from(overrides.extracted),
            totalTransported: GameNumber.from(overrides.transported),
          }
        : floor,
    ),
  };

  return createSaveDocument(state, BASE_GAME_BALANCE, NOW_MS);
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
    // Step 24: the audit write is best-effort, so a no-op default keeps every
    // existing test focused on its own subject. Audit-specific tests override
    // this to capture the row.
    writeSaveAudit: async () => {},
    // Step 25: permissive limiters by default, so every test written before
    // this step keeps exercising its own subject rather than a bucket. The
    // rate-limit tests below substitute `denyAllLimiters` / a seeded factory.
    rateLimit: permissiveRateLimiters(),
    // The real reader/parser, so tests that do not care about the pre-parse
    // guard behave exactly as before it existed.
    readSaveBody: async (request) => await request.text(),
    parseSaveBody: (rawBody) => JSON.parse(rawBody),
    ...overrides,
  };
}

function permissiveLimiters(): RateLimiter {
  return { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) };
}

function permissiveRateLimiters(): SaveSyncRateLimiters {
  return {
    uploadByAddress: permissiveLimiters(),
    uploadByUser: permissiveLimiters(),
    downloadByAddress: permissiveLimiters(),
    downloadByUser: permissiveLimiters(),
  };
}

/** Refuses every keyed check, so a test can assert the 429 branch without filling a real bucket. */
function denyAllLimiters(): RateLimiter {
  return { check: async () => ({ allowed: false, retryAfterSeconds: 17 }) };
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
    previousDocumentJson: null,
    previousReceivedAt: null,
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
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
  let readCalls = 0;
  const response = await handleRequest(
    putSaveRequest({ baseRevision: 7, document: validSaveDocument() }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => {
        readCalls += 1;
        return readCalls === 1
          ? {
              revision: 7,
              documentJson: JSON.stringify({ schemaVersion: 1, fixture: 'stale' }),
              receivedAt: '2026-01-01T00:00:00.000Z',
              previousDocumentJson: null,
              previousReceivedAt: null,
            }
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
    previousDocumentJson: null,
    previousReceivedAt: null,
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

Deno.test('handleSaveUpload answers 422 save_rejected for a document claiming more than the elapsed time allows', async () => {
  // Step 23: a fresh stored row one minute old, and a candidate claiming a
  // trillion delivered gold against it.
  const current = validSaveDocument() as {
    state: { warehouse: Record<string, unknown> };
  } & Record<string, unknown>;
  const stored: StoredSaveRow = {
    revision: 1,
    documentJson: JSON.stringify(validSaveDocument()),
    receivedAt: new Date(Date.now() - 60_000).toISOString(),
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
  const inflated = {
    ...current,
    state: {
      ...current.state,
      warehouse: { ...current.state.warehouse, totalGoldDelivered: '1000000000000' },
    },
  };

  const response = await handleRequest(
    putSaveRequest({ baseRevision: 1, document: inflated }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
      writeSaveRow: async () => {
        throw new Error('a rejected save must not be written');
      },
    }),
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, 'save_rejected');
  assert.equal(body.error.detail.counter, 'state.warehouse.totalGoldDelivered');
});

Deno.test('handleSaveUpload accepts a document within the elapsed-time bound', async () => {
  const stored: StoredSaveRow = {
    revision: 1,
    documentJson: JSON.stringify(validSaveDocument()),
    receivedAt: new Date(Date.now() - 60_000).toISOString(),
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
  let written = false;

  const response = await handleRequest(
    putSaveRequest({ baseRevision: 1, document: validSaveDocument() }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
      writeSaveRow: async () => {
        written = true;
        return true;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(written, true);
});

Deno.test('handleSaveUpload accepts a dominating branch re-uploaded after a conflict, anchored at the stored row\'s ancestor', async () => {
  // §7 makes forks first-class: a device that resolved a 409 re-uploads its
  // OWN branch, which diverged from an older common ancestor, seconds after
  // the branch that became the stored row. The tight bound (2 s since the
  // stored row) rejects the divergence; the row's `previous_*` ancestor (3 h)
  // accepts it. This is review finding F2's regression.
  const stored: StoredSaveRow = {
    revision: 2,
    documentJson: JSON.stringify(
      progressedSaveDocument({ delivered: '1000', extracted: '1000', transported: '900' }),
    ),
    receivedAt: new Date(Date.now() - 2_000).toISOString(),
    previousDocumentJson: JSON.stringify(validSaveDocument()),
    previousReceivedAt: new Date(Date.now() - 3 * 60 * 60 * 1_000).toISOString(),
  };
  let written = false;

  const response = await handleRequest(
    putSaveRequest({
      baseRevision: 2,
      document: progressedSaveDocument({
        delivered: '50000',
        extracted: '50000',
        transported: '48000',
      }),
    }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
      writeSaveRow: async () => {
        written = true;
        return true;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(written, true);
});

Deno.test('handleSaveUpload skips the bound when the stored receipt is unparseable, rather than rejecting', async () => {
  // Review finding F4: an unreadable receipt is the server's own row being
  // unreadable, not evidence against the document. It must not collapse to a
  // zero-second bound that rejects every claim.
  const stored: StoredSaveRow = {
    revision: 1,
    documentJson: JSON.stringify(validSaveDocument()),
    receivedAt: 'not-a-timestamp',
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
  let written = false;

  const response = await handleRequest(
    putSaveRequest({
      baseRevision: 1,
      document: progressedSaveDocument({
        delivered: '50000',
        extracted: '50000',
        transported: '48000',
      }),
    }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
      writeSaveRow: async () => {
        written = true;
        return true;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(written, true);
});

Deno.test('handleSaveUpload records exactly one accepted save_audit row', async () => {
  const document = validSaveDocument();
  const stored: StoredSaveRow = {
    revision: 1,
    documentJson: JSON.stringify(validSaveDocument()),
    receivedAt: new Date(Date.now() - 60_000).toISOString(),
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
  const audits: Record<string, unknown>[] = [];

  const response = await handleRequest(
    putSaveRequest({ baseRevision: 1, document }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
      writeSaveRow: async () => true,
      writeSaveAudit: async (entry) => {
        audits.push(entry as unknown as Record<string, unknown>);
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'accepted');
  assert.equal(audits[0].errorCode, null);
  assert.equal(audits[0].resultingRevision, 2);
  assert.equal(audits[0].baseRevision, 1);
  assert.equal(typeof audits[0].documentBytes, 'number');
  assert.equal(
    audits[0].clientReportedAt,
    new Date((document as { savedAtTimestampMs: number }).savedAtTimestampMs).toISOString(),
  );
});

Deno.test('handleSaveUpload records one rejected save_audit row carrying the bound violation', async () => {
  const current = validSaveDocument() as {
    state: { warehouse: Record<string, unknown> };
  } & Record<string, unknown>;
  const stored: StoredSaveRow = {
    revision: 1,
    documentJson: JSON.stringify(validSaveDocument()),
    receivedAt: new Date(Date.now() - 60_000).toISOString(),
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
  const inflated = {
    ...current,
    state: {
      ...current.state,
      warehouse: { ...current.state.warehouse, totalGoldDelivered: '1000000000000' },
    },
  };
  const audits: Record<string, unknown>[] = [];

  const response = await handleRequest(
    putSaveRequest({ baseRevision: 1, document: inflated }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
      writeSaveAudit: async (entry) => {
        audits.push(entry as unknown as Record<string, unknown>);
      },
    }),
  );

  assert.equal(response.status, 422);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'rejected');
  assert.equal(audits[0].errorCode, 'save_rejected');
  assert.equal(audits[0].resultingRevision, null);
  assert.deepEqual(
    { ...(audits[0].detail as Record<string, unknown>) }.counter,
    'state.warehouse.totalGoldDelivered',
  );
});

Deno.test('handleSaveUpload records a rejected save_audit row for a document that fails validation', async () => {
  const audits: Record<string, unknown>[] = [];

  const response = await handleRequest(
    putSaveRequest({
      baseRevision: null,
      document: { schemaVersion: 2, savedAtTimestampMs: 'nope', state: {} },
    }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      writeSaveAudit: async (entry) => {
        audits.push(entry as unknown as Record<string, unknown>);
      },
    }),
  );

  assert.equal(response.status, 422);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'rejected');
  assert.equal(audits[0].errorCode, 'save_invalid');
  assert.equal(typeof (audits[0].detail as Record<string, unknown>).reason, 'string');
});

Deno.test('handleSaveUpload writes no save_audit row when the caller cannot be resolved', async () => {
  const audits: unknown[] = [];

  const response = await handleRequest(
    putSaveRequest({ baseRevision: null, document: validSaveDocument() }),
    noopDeps({
      resolveCaller: async () => null,
      writeSaveAudit: async (entry) => {
        audits.push(entry);
      },
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(audits.length, 0);
});

Deno.test('handleSaveUpload still writes one audit row when the client clock is outside the timestamptz range', async () => {
  // Review finding H1: a `savedAtTimestampMs` at year 10000+ formats as an
  // extended-year ISO string Postgres refuses, which aborted the audit insert
  // and erased the evidence of the very clock attack the field exists to
  // expose. The row must still be written, with the raw claim kept in detail.
  const farFuture = {
    ...(validSaveDocument() as Record<string, unknown>),
    savedAtTimestampMs: 300_000_000_000_000,
  };
  const audits: Record<string, unknown>[] = [];

  const response = await handleRequest(
    putSaveRequest({ baseRevision: null, document: farFuture }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => null,
      writeSaveRow: async () => true,
      writeSaveAudit: async (entry) => {
        audits.push(entry as unknown as Record<string, unknown>);
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'accepted');
  assert.equal(audits[0].clientReportedAt, null);
  assert.equal(
    (audits[0].detail as Record<string, unknown>).clientReportedAtOutOfRangeMs,
    300_000_000_000_000,
  );
});

Deno.test('handleSaveUpload records a rejected server_error row when a collaborator throws', async () => {
  // Review finding M1: a database failure in the read must not escape as an
  // unaudited 500 — a repeated crash, or a hunt for one, would be invisible.
  const audits: Record<string, unknown>[] = [];

  const response = await handleRequest(
    putSaveRequest({ baseRevision: null, document: validSaveDocument() }),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => {
        throw new Error('database is down');
      },
      writeSaveAudit: async (entry) => {
        audits.push(entry as unknown as Record<string, unknown>);
      },
    }),
  );

  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'server_error');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'rejected');
  assert.equal(audits[0].errorCode, 'server_error');
});

Deno.test('handleSaveUpload rejects a non-integer baseRevision and still writes one audit row', async () => {
  // Review finding H2: `baseRevision` was written to the audit's `bigint`
  // column unvalidated, so a fractional or out-of-range value aborted the
  // insert and the attempt left no row. §5 requires null or a positive integer;
  // anything else is a client bug and must be recorded, not swallowed.
  for (const bad of [1.5, 1e300, -1, 0]) {
    const audits: Record<string, unknown>[] = [];

    const response = await handleRequest(
      putSaveRequest({ baseRevision: bad, document: validSaveDocument() }),
      noopDeps({
        resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
        writeSaveAudit: async (entry) => {
          audits.push(entry as unknown as Record<string, unknown>);
        },
      }),
    );

    assert.equal(response.status, 400, `baseRevision ${bad} is refused`);
    assert.equal((await response.json()).error.code, 'malformed_request');
    assert.equal(audits.length, 1);
    assert.equal(audits[0].outcome, 'rejected');
    assert.equal(audits[0].errorCode, 'malformed_request');
    assert.equal(audits[0].baseRevision, null);
  }
});

Deno.test('normalizeAuditRevision coerces anything but a safe integer to null', () => {
  assert.equal(normalizeAuditRevision(7), 7);
  assert.equal(normalizeAuditRevision(0), 0);
  assert.equal(normalizeAuditRevision(null), null);
  assert.equal(normalizeAuditRevision(1.5), null);
  assert.equal(normalizeAuditRevision(1e300), null);
  assert.equal(normalizeAuditRevision(Number.MAX_SAFE_INTEGER + 1), null);
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

Deno.test('handleSaveDownload answers 200 with the stored revision, receivedAt, parsed document, and offlineGrant', async () => {
  const document = validSaveDocument();
  const stored: StoredSaveRow = {
    revision: 4,
    documentJson: JSON.stringify(document),
    receivedAt: '2026-03-01T00:00:00.000Z',
    previousDocumentJson: null,
    previousReceivedAt: null,
  };
  const response = await handleRequest(
    getSaveRequest(),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => stored,
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.revision, 4);
  assert.equal(body.receivedAt, stored.receivedAt);
  assert.deepEqual(body.document, document);

  // Step 22: a months-old receipt is credited at the two-hour cap, never more.
  assert.equal(body.offlineGrant.creditedDurationMs, 7_200_000);
  assert.equal(typeof body.offlineGrant.reward, 'string');
  assert.equal(
    body.offlineGrant.elapsedDurationMs >= body.offlineGrant.creditedDurationMs,
    true,
  );
});

Deno.test('handleSaveDownload derives the offlineGrant from the server receipt, not the document timestamps', async () => {
  // Step 22's whole point: the document's own `savedAtTimestampMs` /
  // `lastUpdateTimestampMs` are the player's clock and must not move the grant.
  const base = validSaveDocument() as Record<string, unknown> & {
    state: Record<string, unknown>;
  };
  const movedClock = {
    ...base,
    savedAtTimestampMs: (base.savedAtTimestampMs as number) + 10 * 24 * 60 * 60 * 1_000,
    state: {
      ...base.state,
      lastUpdateTimestampMs:
        (base.state.lastUpdateTimestampMs as number) + 10 * 24 * 60 * 60 * 1_000,
    },
  };
  // `computeOfflineGrant` reads `Date.now()` once per request, so two uploads
  // that straddle a millisecond boundary legitimately differ by 1 ms — and the
  // `deepEqual` below would then fail for a reason this test is not about.
  // Pin the clock for the pair so both grants are computed at one instant.
  const frozenNowMs = Date.now();
  const receivedAt = new Date(frozenNowMs - 60_000).toISOString();
  const realDateNow = Date.now;
  Date.now = () => frozenNowMs;

  const grants: unknown[] = [];
  try {
    for (const document of [base, movedClock]) {
      const response = await handleRequest(
        getSaveRequest(),
        noopDeps({
          resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
          readCurrentSave: async () => ({
            revision: 4,
            documentJson: JSON.stringify(document),
            receivedAt,
            previousDocumentJson: null,
            previousReceivedAt: null,
          }),
        }),
      );
      grants.push((await response.json()).offlineGrant);
    }
  } finally {
    Date.now = realDateNow;
  }

  assert.deepEqual(grants[0], grants[1]);
  const grant = grants[0] as { creditedDurationMs: number };
  // The receipt is exactly 60 s old at the pinned instant, so the grant is
  // exact — a moved document clock would show up here as 10 days, not ±1 s.
  assert.equal(grant.creditedDurationMs, 60_000);
});

// ---------------------------------------------------------------------------
// Server-milestone Step 25 — abuse limits.
//
// Step 25's own test is: "A flood of uploads is throttled without affecting a
// normal player's cadence. An oversized body is refused before it is parsed.
// A test asserts no code path uses a fingerprint value to select an account or
// authorize a save write." The third assertion lives in
// `tests/unit/server-fingerprint-absence.test.ts` (it spans every function);
// the first two are pinned here on the real request path.
// ---------------------------------------------------------------------------

Deno.test('handleSaveUpload refuses a Content-Length-declared oversized body without reading or parsing it', async () => {
  let readCalled = false;
  let parseCalled = false;
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
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readSaveBody: async () => {
        readCalled = true;
        return '{}';
      },
      parseSaveBody: () => {
        parseCalled = true;
        return {};
      },
    }),
  );

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'payload_too_large');
  // AC5: proven by the collaborator never being called, not by reading the
  // source order — the body is not buffered at all on this path.
  assert.equal(readCalled, false, 'an oversized declared body must not be read');
  assert.equal(parseCalled, false, 'an oversized declared body must not be parsed');
});

Deno.test('handleSaveUpload refuses an oversized body that arrives without a truthful Content-Length, still before parsing', async () => {
  let parseCalled = false;
  // A chunked upload omits Content-Length entirely, so the declared-size check
  // above cannot catch it and the bytes actually received are what decide. The
  // parse must still not run (AC5).
  const request = putSaveRequest(undefined, { rawBody: '{' + 'a'.repeat(70_000) });

  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      parseSaveBody: () => {
        parseCalled = true;
        return {};
      },
    }),
  );

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'payload_too_large');
  assert.equal(parseCalled, false, 'an oversized body must not be parsed');
});

Deno.test('handleSaveUpload answers a §10.2 429 from the per-address limit before authentication runs', async () => {
  let resolveCallerCalled = false;
  const request = new Request('http://localhost/v1/save', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer a-valid-token',
      'x-forwarded-for': '198.51.100.9, 203.0.113.7',
    },
    body: JSON.stringify({ baseRevision: null, document: validSaveDocument() }),
  });

  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => {
        resolveCallerCalled = true;
        return { userId: FIXTURE_USER_ID };
      },
      rateLimit: { ...permissiveRateLimiters(), uploadByAddress: denyAllLimiters() },
    }),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '17');
  assert.deepEqual(await response.json(), {
    error: {
      code: 'rate_limited',
      message: 'Too many requests.',
      detail: { retryAfterSeconds: 17 },
    },
  });
  // Design constraint 2: the rate-limit refusal precedes authentication, so a
  // flood of unauthenticated requests costs no token verification at all.
  assert.equal(resolveCallerCalled, false, 'the address limit must refuse before authentication');
});

Deno.test('handleSaveUpload answers 429 from the per-user limit and writes no save_audit row for it', async () => {
  const auditRows: SaveAuditEntry[] = [];
  const request = putSaveRequest({ baseRevision: null, document: validSaveDocument() });

  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      writeSaveAudit: async (entry) => {
        auditRows.push(entry);
      },
      rateLimit: { ...permissiveRateLimiters(), uploadByUser: denyAllLimiters() },
    }),
  );

  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'rate_limited');
  // Step 24's L2, bounded: a refused flood must not grow `save_audit` by one
  // row per request. This is the mechanism, not an aspiration — the 429 is
  // returned before any audit write exists on the path.
  assert.deepEqual(auditRows, [], 'a 429 must not write a save_audit row');
});

Deno.test('handleSaveDownload answers 429 from the per-address limit before authentication runs', async () => {
  let resolveCallerCalled = false;
  const request = getSaveRequest();

  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async () => {
        resolveCallerCalled = true;
        return { userId: FIXTURE_USER_ID };
      },
      rateLimit: { ...permissiveRateLimiters(), downloadByAddress: denyAllLimiters() },
    }),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '17');
  assert.equal(resolveCallerCalled, false);
});

Deno.test('handleSaveDownload answers 429 from the per-user limit without reading the stored save', async () => {
  let readCalled = false;
  const response = await handleRequest(
    getSaveRequest(),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      readCurrentSave: async () => {
        readCalled = true;
        return null;
      },
      rateLimit: { ...permissiveRateLimiters(), downloadByUser: denyAllLimiters() },
    }),
  );

  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'rate_limited');
  assert.equal(readCalled, false);
});

Deno.test('a warm-up probe on an unrouted path never consults a limiter', async () => {
  // Design constraint 3: `scripts/warm-edge-functions.mjs` pays every
  // function's first-request cost with one refused `DELETE` on an unrouted
  // path, before any suite runs. If that probe consumed a bucket, the suites
  // it exists to protect would start from a partly-spent budget. The router's
  // unknown-route branch returns before `defaultSaveSyncDeps` is reached at
  // all — asserted here with limiters that would record a call.
  let limiterCalls = 0;
  const counting: RateLimiter = {
    check: async () => {
      limiterCalls += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
  const spyLimiters: SaveSyncRateLimiters = {
    uploadByAddress: counting,
    uploadByUser: counting,
    downloadByAddress: counting,
    downloadByUser: counting,
  };

  for (const route of ['__warmup', 'v1/save/__warmup']) {
    const response = await handleRequest(
      new Request(`http://localhost/${route}`, { method: 'DELETE' }),
      { ...noopDeps(), rateLimit: spyLimiters },
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'malformed_request');
  }

  assert.equal(limiterCalls, 0, 'a warm-up probe must not consume a rate-limit bucket');
});

Deno.test("the §9 worst-case honest upload burst is admitted; the limit refuses only past it", async () => {
  // AC7: ping the honest-cadence floor. §9 (decision D5) fixes the legitimate
  // traffic a session may produce — one routine upload per 60 s, forced
  // uploads that ignore the interval (lifecycle flush, claimed offline reward,
  // boot reconcile), and a 1/2/4/8/16 s retry ladder of at most five retries
  // per trigger. Replayed against the *real* configured limiter, with an
  // injected clock so no test waits.
  let nowMs = 0;
  const limiters = createSaveSyncRateLimiters({ clockMs: () => nowMs });

  // Three forced triggers, each spending the full retry ladder (six requests:
  // the initial one plus five retries, the last 16 s after the one before).
  const retryOffsetsMs = [0, 1_000, 3_000, 7_000, 15_000, 31_000];
  const decisions: { readonly allowed: boolean }[] = [];
  for (let trigger = 0; trigger < 3; trigger += 1) {
    for (const offsetMs of retryOffsetsMs) {
      nowMs = offsetMs;
      decisions.push(await limiters.uploadByUser.check('user:honest-session'));
    }
  }
  // Plus the one routine upload that came due.
  nowMs = 60_000 - 1;
  decisions.push(await limiters.uploadByUser.check('user:honest-session'));

  assert.equal(decisions.length, 19);
  assert.equal(
    decisions.every((decision) => decision.allowed),
    true,
    'the §9 worst-case honest burst must never be throttled',
  );

  // Pinned from the other side, so the constant cannot drift up unnoticed
  // either: the budget really is SAVE_UPLOAD_MAX_PER_USER, and the request
  // after it is refused.
  let admitted = decisions.length;
  while ((await limiters.uploadByUser.check('user:honest-session')).allowed) {
    admitted += 1;
  }
  assert.equal(admitted, SAVE_UPLOAD_MAX_PER_USER);
});

// ---------------------------------------------------------------------------
// Server-milestone Step 25 — the behavioural half of the fingerprint
// proof-of-absence (AC6). `tests/unit/server-fingerprint-absence.test.ts`
// asserts no server source *reads* a device or browser characteristic; these
// two assert that no such characteristic changes which account is selected or
// which write is authorized, by driving requests that differ in nothing else.
// ---------------------------------------------------------------------------

/** Every class of client-supplied device/browser characteristic Step 25's threat model §7.2 forbids collecting. */
const DEVICE_CHARACTERISTIC_HEADERS: readonly (readonly [string, string])[] = [
  ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'],
  ['sec-ch-ua', '"Chromium";v="120", "Not:A-Brand";v="99"'],
  ['sec-ch-ua-mobile', '?1'],
  ['sec-ch-ua-platform', '"iOS"'],
  ['accept-language', 'vi-VN,vi;q=0.9,en;q=0.8'],
  ['x-device-id', 'a-browser-minted-device-id'],
];

interface UploadOutcome {
  readonly status: number;
  readonly revision: number;
  readonly resolvedTokens: readonly string[];
  readonly writtenUserIds: readonly string[];
}

async function uploadWithHeaders(
  headers: readonly (readonly [string, string])[],
): Promise<UploadOutcome> {
  const resolvedTokens: string[] = [];
  const writtenUserIds: string[] = [];
  const request = new Request('http://localhost/v1/save', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer the-callers-token',
      ...Object.fromEntries(headers),
    },
    body: JSON.stringify({ baseRevision: null, document: validSaveDocument() }),
  });

  const response = await handleRequest(
    request,
    noopDeps({
      resolveCaller: async (token) => {
        resolvedTokens.push(token);
        return { userId: FIXTURE_USER_ID };
      },
      readCurrentSave: async () => null,
      writeSaveRow: async (userId) => {
        writtenUserIds.push(userId);
        return true;
      },
    }),
  );

  const body = (await response.json()) as { revision?: number };
  return { status: response.status, revision: body.revision ?? 0, resolvedTokens, writtenUserIds };
}

Deno.test('handleSaveUpload selects no account and authorizes no write from a device characteristic', async () => {
  const withoutCharacteristics = await uploadWithHeaders([]);
  const withCharacteristics = await uploadWithHeaders(DEVICE_CHARACTERISTIC_HEADERS);

  assert.equal(withoutCharacteristics.status, 200);
  assert.equal(withCharacteristics.status, 200);

  // The only input to account selection is the bearer token, and the only
  // input to save ownership is what that token resolved to. Adding a full set
  // of device/browser characteristics to the request changes neither.
  assert.deepEqual(withCharacteristics.resolvedTokens, ['the-callers-token']);
  assert.deepEqual(withCharacteristics.resolvedTokens, withoutCharacteristics.resolvedTokens);
  assert.deepEqual(withCharacteristics.writtenUserIds, [FIXTURE_USER_ID]);
  assert.deepEqual(withCharacteristics.writtenUserIds, withoutCharacteristics.writtenUserIds);
  assert.equal(withCharacteristics.revision, withoutCharacteristics.revision);
});

Deno.test('handleSaveDownload selects no account from a device characteristic', async () => {
  const readUserIds: string[] = [];

  const download = async (
    headers: readonly (readonly [string, string])[],
  ): Promise<{ readonly status: number; readonly readUserIds: readonly string[] }> => {
    const response = await handleRequest(
      new Request('http://localhost/v1/save', {
        method: 'GET',
        headers: {
          authorization: 'Bearer the-callers-token',
          ...Object.fromEntries(headers),
        },
      }),
      noopDeps({
        resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
        readCurrentSave: async (userId) => {
          readUserIds.push(userId);
          return null;
        },
      }),
    );
    return { status: response.status, readUserIds: [...readUserIds] };
  };

  const withoutCharacteristics = await download([]);
  readUserIds.length = 0;
  const withCharacteristics = await download(DEVICE_CHARACTERISTIC_HEADERS);

  assert.equal(withoutCharacteristics.status, 204);
  assert.equal(withCharacteristics.status, 204);
  assert.deepEqual(withCharacteristics.readUserIds, [FIXTURE_USER_ID]);
  assert.deepEqual(withCharacteristics.readUserIds, withoutCharacteristics.readUserIds);
});
