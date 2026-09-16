import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 24: rejection handling, against the live stack.
 *
 * The `save_audit` table was designed at Step 3 and already exists; Step 24's
 * server job is to write exactly one row for every authenticated `PUT /v1/save`
 * attempt, with enough context to tell a bug from an attack. The Edge Function's
 * own unit tests cover the row's shape with fakes; this proves the real writer
 * reaches Postgres and that no client token can touch the log.
 */
const API_URL = 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;
const REST_URL = `${API_URL}/rest/v1`;
const NOW_MS = 1_757_000_000_000;

interface GuestIdentity {
  readonly userId: string;
  readonly accessToken: string;
}

interface AuditRow {
  readonly outcome: string;
  readonly error_code: string | null;
  readonly base_revision: number | null;
  readonly resulting_revision: number | null;
  readonly document_bytes: number;
  readonly client_reported_at: string | null;
  readonly detail: Record<string, unknown> | null;
}

async function createGuestIdentity(): Promise<GuestIdentity> {
  const client = createClient(API_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no session returned'}`);
  }
  return { userId: data.user.id, accessToken: data.session.access_token };
}

function freshDocument(): SaveDocumentV2 {
  return createSaveDocument(
    createInitialGameState(BASE_GAME_BALANCE, NOW_MS),
    BASE_GAME_BALANCE,
    NOW_MS,
  );
}

function putSave(accessToken: string, body: unknown): Promise<Response> {
  return fetch(SAVE_URL, {
    method: 'PUT',
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

async function auditRowsFor(userId: string): Promise<AuditRow[]> {
  const { data, error } = await createServiceRoleClient(API_URL)
    .from('save_audit')
    .select(
      'outcome, error_code, base_revision, resulting_revision, document_bytes, client_reported_at, detail',
    )
    .eq('user_id', userId)
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`reading save_audit failed: ${error.message}`);
  }

  return (data ?? []) as AuditRow[];
}

describe('save_audit (server-milestone Step 24)', () => {
  it('writes exactly one accepted row, carrying the client clock it never trusts', async () => {
    const guest = await createGuestIdentity();

    const response = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(response.status).toBe(200);

    const rows = await auditRowsFor(guest.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outcome: 'accepted',
      error_code: null,
      base_revision: null,
      resulting_revision: 1,
      detail: null,
    });
    expect(rows[0].document_bytes).toBeGreaterThan(0);
    // The document's own timestamp is recorded verbatim, not trusted: a device
    // clock attack shows up later as divergence from `occurred_at`. Postgres
    // returns it in its own text format, so compare the instant, not the string.
    expect(Date.parse(rows[0].client_reported_at ?? '')).toBe(NOW_MS);
  });

  it('writes exactly one rejected row with the bound violation for an inflated document', async () => {
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(first.status).toBe(200);

    const fresh = freshDocument();
    const inflated = {
      ...fresh,
      state: {
        ...fresh.state,
        warehouse: { ...fresh.state.warehouse, totalGoldDelivered: '1000000000000' },
      },
    };
    const rejected = await putSave(guest.accessToken, { baseRevision: 1, document: inflated });
    expect(rejected.status).toBe(422);

    const rows = await auditRowsFor(guest.userId);
    expect(rows).toHaveLength(2);
    const rejection = rows[1];
    expect(rejection.outcome).toBe('rejected');
    expect(rejection.error_code).toBe('save_rejected');
    expect(rejection.base_revision).toBe(1);
    expect(rejection.resulting_revision).toBeNull();
    expect(rejection.detail?.counter).toBe('state.warehouse.totalGoldDelivered');
  });

  it('writes one rejected row for a stale baseRevision, with the server revision in detail', async () => {
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(first.status).toBe(200);

    const conflict = await putSave(guest.accessToken, { baseRevision: 5, document: freshDocument() });
    expect(conflict.status).toBe(409);

    const rows = await auditRowsFor(guest.userId);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      outcome: 'rejected',
      error_code: 'revision_conflict',
      base_revision: 5,
      resulting_revision: null,
    });
    expect(rows[1].detail?.serverRevision).toBe(1);
  });

  it('is invisible and unwritable to any client token', async () => {
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(first.status).toBe(200);

    const headers = {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${guest.accessToken}`,
      'content-type': 'application/json',
    };

    // No select policy exists, so the log is invisible even for the caller's
    // own rows; no insert policy exists, so a direct write is refused outright.
    const read = await fetch(`${REST_URL}/save_audit?user_id=eq.${guest.userId}&select=outcome`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual([]);

    const write = await fetch(`${REST_URL}/save_audit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: guest.userId,
        outcome: 'accepted',
        document_bytes: 0,
        resulting_revision: 1,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(write.status).toBe(403);
    expect((await write.json()).code).toBe('42501');
  });

  it('still writes the row when the client clock is past what timestamptz holds', async () => {
    // Review finding H1: a year-10000+ `savedAtTimestampMs` formatted to an
    // extended-year ISO string Postgres refuses, so the insert threw and the
    // attempt left no row — erasing the evidence of the very clock attack the
    // column exists to expose. The row must exist, with a null instant and the
    // raw claim preserved in `detail`.
    const FAR_FUTURE_MS = 300_000_000_000_000;
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(first.status).toBe(200);

    const fresh = freshDocument();
    const inflated = {
      ...fresh,
      savedAtTimestampMs: FAR_FUTURE_MS,
      state: {
        ...fresh.state,
        warehouse: { ...fresh.state.warehouse, totalGoldDelivered: '1000000000000' },
      },
    };
    const rejected = await putSave(guest.accessToken, { baseRevision: 1, document: inflated });
    expect(rejected.status).toBe(422);

    const rows = await auditRowsFor(guest.userId);
    expect(rows).toHaveLength(2);
    expect(rows[1].outcome).toBe('rejected');
    expect(rows[1].error_code).toBe('save_rejected');
    expect(rows[1].client_reported_at).toBeNull();
    expect(rows[1].detail?.clientReportedAtOutOfRangeMs).toBe(FAR_FUTURE_MS);
  });

  it('writes one row per attempt when baseRevision is not a valid revision', async () => {
    // Review finding H2: a fractional or out-of-int8 `baseRevision` used to
    // abort the `save_audit` insert (bigint) and leave the attempt unrecorded,
    // including the `server_error` row M1 added. §5 requires null or a positive
    // integer, so each bad value is now a recorded `malformed_request`.
    const guest = await createGuestIdentity();
    const first = await putSave(guest.accessToken, { baseRevision: null, document: freshDocument() });
    expect(first.status).toBe(200);

    for (const bad of [1.5, 1e300, -1]) {
      const response = await putSave(guest.accessToken, { baseRevision: bad, document: freshDocument() });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('malformed_request');
    }

    const rows = await auditRowsFor(guest.userId);
    expect(rows).toHaveLength(4);
    expect(rows[0].outcome).toBe('accepted');
    for (const row of rows.slice(1)) {
      expect(row.outcome).toBe('rejected');
      expect(row.error_code).toBe('malformed_request');
      expect(row.base_revision).toBeNull();
    }
  });
});
