import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 25 — abuse limits, against the live stack.
 *
 * The Edge Function's own unit tests prove the limiter's arithmetic, the
 * refusal *order*, and that an oversized body never reaches a parse (AC5), all
 * with injected collaborators and no Docker. This suite proves what only the
 * live stack can: that a real flood of `PUT /v1/save` is actually refused with
 * a real `429` and `Retry-After`, that an honest client in the same run is
 * never throttled, that an oversized body is refused with `413`, and — Step
 * 24's L2 — that a refused flood does not grow `save_audit` by one row per
 * request.
 *
 * ## The one-address constraint (TASK-002)
 *
 * The local gateway makes this whole suite one observed address, so a
 * per-address limit that the suite's own aggregate traffic could trip would
 * fail unrelated files. That is why `SAVE_UPLOAD_MAX_PER_ADDRESS` (600) is ten
 * times the per-user budget and why the flood below spends exactly **one
 * user's** bucket — 61 requests — rather than trying to exhaust the address.
 * The `429` this suite asserts is the per-user one, which is the binding
 * constraint for an authenticated caller anyway.
 */
const API_URL = 'http://127.0.0.1:54321';
const SAVE_URL = `${API_URL}/functions/v1/save-sync/v1/save`;
const NOW_MS = 1_757_000_000_000;

/**
 * The per-user upload budget, matching `SAVE_UPLOAD_MAX_PER_USER` in
 * `supabase/functions/save-sync/index.ts`.
 *
 * Restated rather than imported: that module's import graph includes
 * `npm:@supabase/supabase-js@2.116.0` (a Deno specifier) and the Vite-built
 * core bundle, neither of which a Vitest Node process can resolve. The number
 * cannot drift unnoticed — `save-sync/index.test.ts`'s §9 cadence test drives
 * the *real* exported constant and pins the request after it as refused, so a
 * change there fails that test rather than silently changing what this one
 * asserts.
 */
const SAVE_UPLOAD_MAX_PER_USER = 60;

interface GuestIdentity {
  readonly userId: string;
  readonly accessToken: string;
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

/**
 * The flood's body.
 *
 * Deliberately cheap for the server while still an *authenticated* `PUT` that
 * writes exactly one `save_audit` row: a `schemaVersion` the server understands
 * with a body that fails validation. `handleSaveUpload` refuses it at
 * validation — after authentication and after the audit write, but before
 * `readCurrentSave` and the service-role write — so each flood request costs
 * one token verification plus one audit insert rather than a full
 * read/validate/compare-and-swap/audit cycle.
 *
 * That matters here. This suite shares one edge runtime with thirteen other
 * integration files under 16-way Vitest parallelism, and the 2026-09-16 finding
 * recorded how close that runtime runs to its budget (a warm worker stalling
 * under contention, not a cold start). A flood that made the server do *more*
 * work per request than an honest upload would be measuring the runtime's
 * throughput rather than the limiter.
 */
const CHEAP_AUTHENTICATED_BODY = { baseRevision: null, document: { schemaVersion: 2 } };

/** Sequential rather than concurrent: the limiter counts requests, and this suite wants a deterministic order to assert on. */
async function floodUploads(
  accessToken: string,
  count: number,
): Promise<readonly { readonly status: number; readonly retryAfter: string | null }[]> {
  const results: { status: number; retryAfter: string | null }[] = [];

  for (let attempt = 0; attempt < count; attempt += 1) {
    const response = await putSave(accessToken, CHEAP_AUTHENTICATED_BODY);
    results.push({ status: response.status, retryAfter: response.headers.get('retry-after') });
    // Drain the body so the connection is reusable and nothing is left pending.
    await response.arrayBuffer();
  }

  return results;
}

async function auditRowCount(userId: string): Promise<number> {
  const { count, error } = await createServiceRoleClient(API_URL)
    .from('save_audit')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`reading save_audit count failed: ${error.message}`);
  }
  return count ?? 0;
}

describe('PUT /v1/save abuse limits (Step 25)', () => {
  it('throttles a flood with 429 + Retry-After, never throttles an honest client, and does not grow save_audit per refusal', async () => {
    const flooder = await createGuestIdentity();
    const honest = await createGuestIdentity();

    // One request past the budget, so the refusal is the *last* thing that
    // happens rather than something the flood merely approaches.
    const results = await floodUploads(flooder.accessToken, SAVE_UPLOAD_MAX_PER_USER + 1);

    // Every request inside the budget was admitted — a real limiter, not a
    // blanket refusal.
    expect(results.slice(0, SAVE_UPLOAD_MAX_PER_USER).every((result) => result.status !== 429)).toBe(
      true,
    );
    expect(results[results.length - 1].status).toBe(429);

    const throttled = results.filter((result) => result.status === 429);
    expect(throttled.length).toBeGreaterThan(0);
    // §10.2 / §4: a `Retry-After` header the client is told to wait for.
    for (const result of throttled) {
      expect(result.retryAfter).not.toBeNull();
      expect(Number(result.retryAfter)).toBeGreaterThan(0);
    }

    const throttledResponse = await putSave(flooder.accessToken, CHEAP_AUTHENTICATED_BODY);
    expect(throttledResponse.status).toBe(429);
    expect(throttledResponse.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await throttledResponse.json()).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many requests.',
        detail: { retryAfterSeconds: expect.any(Number) },
      },
    });

    // Step 24's L2, bounded: one audit row per *admitted* authenticated
    // attempt, and none for the refusals — so the row count is the admitted
    // count, not the request count.
    const admitted = results.filter((result) => result.status !== 429).length;
    const auditRowsAfterFlood = await auditRowCount(flooder.userId);
    expect(admitted).toBe(SAVE_UPLOAD_MAX_PER_USER);
    expect(auditRowsAfterFlood).toBe(admitted);

    // And it stays put under continued refusal: three more requests, all
    // refused, must add zero rows.
    const extra = await floodUploads(flooder.accessToken, 3);
    expect(extra.every((result) => result.status === 429)).toBe(true);
    expect(await auditRowCount(flooder.userId)).toBe(auditRowsAfterFlood);

    // (b) An honest client in the same run, on the same observed address, is
    // never throttled: the flood spent one user's bucket, not the address's.
    // A real document, so this is the cadence §9 actually permits.
    const firstUpload = await putSave(honest.accessToken, {
      baseRevision: null,
      document: freshDocument(),
    });
    expect(firstUpload.status).toBe(200);

    const secondUpload = await putSave(honest.accessToken, {
      baseRevision: null,
      document: freshDocument(),
    });
    // The second upload carries a stale null baseRevision against revision 1,
    // which is exactly what §5's optimistic concurrency produces — a conflict,
    // not a `429`.
    expect(secondUpload.status).toBe(409);
  }, 120_000);

  it('refuses an oversized body with 413 before authenticating it, and writes no audit row for it', async () => {
    const guest = await createGuestIdentity();
    const before = await auditRowCount(guest.userId);

    // 64 KB is the §3 cap; send past it with a truthful Content-Length, which
    // is the branch that refuses before the body is buffered at all.
    const oversized = '{' + 'a'.repeat(70_000);
    const response = await fetch(SAVE_URL, {
      method: 'PUT',
      headers: {
        apikey: LOCAL_ANON_KEY,
        authorization: `Bearer ${guest.accessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: oversized,
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: 'payload_too_large' },
    });

    // The declared-size refusal sits above authentication (design constraint
    // 2), so an oversized request cannot force a service-role audit write —
    // the same amplification bound the rate-limit refusals add.
    expect(await auditRowCount(guest.userId)).toBe(before);
  }, 60_000);
});
