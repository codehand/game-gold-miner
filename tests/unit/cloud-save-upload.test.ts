import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import {
  uploadCloudSaveViaFetch,
  type CloudSaveUploadAuthClient,
} from '../../src/platform/web';

/**
 * Server-milestone Step 19: the transport maps HTTP to the typed result the
 * replica's policy switches on. `fetch` and the auth client are faked, so this
 * proves every §4 code and the §4 `unauthenticated`-refresh rule without a
 * stack — the same shape `cloud-save-reconcile.test.ts` already uses for the
 * download side.
 */
const T0 = 1_788_000_000_000;
const URL = 'https://example.test/functions/v1/save-sync/v1/save';

afterEach(() => {
  vi.unstubAllGlobals();
});

function exampleDocument(): SaveDocumentV2 {
  return createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, T0),
    BASE_GAME_BALANCE,
    T0,
  );
}

function fakeAuth(
  overrides: Partial<CloudSaveUploadAuthClient> = {},
): CloudSaveUploadAuthClient {
  return {
    getSession: async () => ({ data: { session: { access_token: 'token-1' } }, error: null }),
    refreshSession: async () => ({ data: { session: { access_token: 'token-2' } }, error: null }),
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('uploadCloudSaveViaFetch success', () => {
  it('resolves unconfigured without a request when auth is null', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadCloudSaveViaFetch(URL, null, null, exampleDocument())).resolves.toEqual({
      kind: 'unconfigured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the document and baseRevision and parses the accepted revision', async () => {
    const document = exampleDocument();
    const fetchMock = vi.fn(async () => jsonResponse(200, { revision: 12, receivedAt: 'now' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), null, document);

    expect(result).toEqual({ kind: 'accepted', revision: 12 });
    expect(fetchMock).toHaveBeenCalledWith(URL, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-1', 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ baseRevision: null, document }),
    });
  });
});

describe('uploadCloudSaveViaFetch conflicts (§7 input)', () => {
  it('parses a 409 into the server revision, time, and document', async () => {
    const remote = exampleDocument();
    const fetchMock = vi.fn(async () =>
      jsonResponse(409, {
        error: {
          code: 'revision_conflict',
          message: 'Save was updated elsewhere.',
          detail: { serverRevision: 7, receivedAt: '2026-01-01T00:00:00.000Z', document: remote },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 6, exampleDocument());

    expect(result).toEqual({
      kind: 'conflict',
      serverRevision: 7,
      receivedAtMs: Date.parse('2026-01-01T00:00:00.000Z'),
      document: remote,
    });
  });

  it('refuses a 409 whose detail is incomplete rather than handing it to the policy', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(409, { error: { code: 'revision_conflict' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 6, exampleDocument());

    expect(result).toMatchObject({
      kind: 'terminal',
      code: 'malformed_request',
      keepSyncing: false,
    });
  });

  it('refuses a 409 whose receivedAt does not parse to a date', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(409, {
        error: {
          code: 'revision_conflict',
          message: 'Save was updated elsewhere.',
          detail: { serverRevision: 7, receivedAt: 'not-a-date', document: exampleDocument() },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 6, exampleDocument());

    expect(result).toMatchObject({ kind: 'terminal', code: 'malformed_request' });
  });
});

describe('uploadCloudSaveViaFetch authentication (§4 unauthenticated)', () => {
  it('refreshes the session once and retries after a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'unauthenticated' } }))
      .mockResolvedValueOnce(jsonResponse(200, { revision: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const refreshSession = vi.fn(async () => ({
      data: { session: { access_token: 'token-2' } },
      error: null,
    }));

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth({ refreshSession }), 1, exampleDocument());

    expect(result).toEqual({ kind: 'accepted', revision: 2 });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenNthCalledWith(1, URL, expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer token-1' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, URL, expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer token-2' }),
    }));
  });

  it('stops cloud sync when a 401 persists after refresh', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { error: { code: 'unauthenticated' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 1, exampleDocument());

    expect(result).toMatchObject({ kind: 'terminal', code: 'unauthenticated', keepSyncing: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops cloud sync when refresh itself returns no session', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { error: { code: 'unauthenticated' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(
      URL,
      fakeAuth({ refreshSession: async () => ({ data: { session: null }, error: null }) }),
      1,
      exampleDocument(),
    );

    expect(result).toMatchObject({ kind: 'terminal', code: 'unauthenticated' });
  });

  it('is terminal when there is no session to upload', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(
      URL,
      fakeAuth({ getSession: async () => ({ data: { session: null }, error: null }) }),
      null,
      exampleDocument(),
    );

    expect(result).toMatchObject({ kind: 'terminal', code: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a failed session lookup rather than treating it as a bad token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(
      URL,
      fakeAuth({ getSession: async () => ({ data: { session: null }, error: { message: 'network down' } }) }),
      null,
      exampleDocument(),
    );

    expect(result).toEqual({ kind: 'retryable', code: 'server_error', message: 'network down' });
  });
});

describe('uploadCloudSaveViaFetch failure mapping (§4)', () => {
  it.each([
    [429, 'rate_limited', 'retryable'],
    [503, 'service_unavailable', 'retryable'],
    [500, 'server_error', 'retryable'],
  ] as const)('maps %i to %s / %s', async (status, code, kind) => {
    const fetchMock = vi.fn(async () => jsonResponse(status, { error: { code, message: 'nope' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 1, exampleDocument());

    expect(result).toMatchObject({ kind, code });
  });

  it.each([
    [403, 'forbidden'],
    [400, 'malformed_request'],
    [413, 'payload_too_large'],
  ] as const)('maps %i to terminal %s', async (status, code) => {
    const fetchMock = vi.fn(async () => jsonResponse(status, { error: { code, message: 'nope' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 1, exampleDocument());

    expect(result).toMatchObject({ kind: 'terminal', code, keepSyncing: false });
  });

  it('drops an invalid document but keeps syncing', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(422, { error: { code: 'save_invalid', message: 'Document failed validation.' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 1, exampleDocument());

    expect(result).toMatchObject({ kind: 'terminal', code: 'save_invalid', keepSyncing: true });
  });

  it('stops syncing when the server cannot understand the schema version', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(422, { error: { code: 'schema_unsupported', message: 'Unsupported schemaVersion 3.' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 1, exampleDocument());

    expect(result).toMatchObject({ kind: 'terminal', code: 'schema_unsupported', keepSyncing: false });
  });

  it('treats a dropped connection as retryable and never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    const result = await uploadCloudSaveViaFetch(URL, fakeAuth(), 1, exampleDocument());

    expect(result).toEqual({ kind: 'retryable', code: 'server_error', message: 'offline' });
  });
});
