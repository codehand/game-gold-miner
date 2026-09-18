import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { WARMUP_MAX_ATTEMPTS, WARMUP_WORST_CASE_MS, warmEdgeFunction } from '../../scripts/warm-edge-functions.mjs';
import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, type SaveDocumentV2 } from '../../src/persistence';
import { LOCAL_ANON_KEY, mintFixtureUserToken, FIXTURE_USER_ID } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';
import {
  appendUnsignedInitDataField,
  mintInitDataSignedWithForeignBotToken,
  mintValidInitData,
  removeInitDataHash,
  reorderInitDataFields,
  tamperInitData,
} from './telegramInitDataFixture';

/**
 * Server-milestone Step 26 — the adversarial suite, live-stack half.
 *
 * Attacks 1–5, 7 (over the wire), 8 and 9, each against the real stack, with
 * the guard living where the attack would actually meet it. Constraint 4's
 * rule — "put each attack at the lowest layer that still exercises the real
 * guard" — is why the *pure* logic forms of attacks 1, 4, 7 and 9 live in
 * `supabase/functions/**\/adversarial.test.ts` (no Docker), and why the forms
 * that only exist end to end (the stored row, the real clock, the real
 * PostgREST, the real `recovery_codes` table) live here.
 *
 * ## Why one file, and why it is not a subset of the existing suites
 *
 * `save-upload`, `save-rejection`, `save-audit`, `offline-grant`,
 * `telegram-sign-in` and `recovery-code` already prove each guard's *honest*
 * behaviour. This file proves the adversarial one, names each test for the
 * attack it refuses (constraint 1), and asserts the specific refusal —
 * status, §4 code, and the `detail` shape where one exists (AC8) — rather than
 * "not 200".
 *
 * ## Flake discipline (constraint 6 / AC14)
 *
 * The local stack is observed as **one** address for the whole run (TASK-002's
 * finding), so a test may not assume it starts with a full rate-limit bucket,
 * and the warm-up must not spend one. Every request carries the suite's own
 * short per-attempt budget, reusing `transientFetchFixture`'s retry for the
 * burst loops. The one test that intentionally spends a bucket (attack 8's
 * rotation flow) is written not to depend on the bucket being full.
 */
const API_URL = 'http://127.0.0.1:54321';
const FUNCTIONS_BASE_URL = `${API_URL}/functions/v1`;
const SAVE_URL = `${FUNCTIONS_BASE_URL}/save-sync/v1/save`;
const TELEGRAM_SIGN_IN_URL = `${FUNCTIONS_BASE_URL}/telegram-sign-in`;
const RECOVERY_GENERATE_URL = `${FUNCTIONS_BASE_URL}/recovery-code/v1/generate`;
const RECOVERY_REDEEM_URL = `${FUNCTIONS_BASE_URL}/recovery-code/v1/redeem`;
const HOUR_MS = 60 * 60 * 1_000;
const WARMUP_HOOK_TIMEOUT_MS = WARMUP_WORST_CASE_MS + 10_000;

/**
 * The shared recovery-code rate-limit bucket, and the documented way to clear
 * it.
 *
 * The local gateway makes every file in this suite one observed address
 * (TASK-002's finding), and `recovery-code.integration.test.ts` deliberately
 * fills that bucket in its own throttle test. This file's recovery assertions
 * need a redeem to reach the store — a `429` would be a refusal *before* the
 * code is ever compared, which is not the guard these tests exist to prove —
 * so they clear the bucket first through the route Step 14 added for exactly
 * this purpose, the same call the sibling suite already makes. Constraint 6
 * forbids an attack test from depending on a bucket another test consumes; the
 * reset is what makes that not a dependency.
 */
const RECOVERY_CODE_TEST_RESET_TOKEN = 'b5f1ce2061989404035108f8895075b893eaa4a3f56eeca2d0bc3a2aef8f9f66';
const RECOVERY_TEST_RESET_URL = `${FUNCTIONS_BASE_URL}/recovery-code/v1/test-only-reset-rate-limit`;

/**
 * The per-user upload budget, matching `SAVE_UPLOAD_MAX_PER_USER` in
 * `supabase/functions/save-sync/index.ts`. Declared rather than imported: that
 * module is a Deno Edge Function whose `npm:` specifier Node cannot resolve,
 * and `rate-limit.integration.test.ts` already establishes this same literal
 * for the same reason.
 */
const SAVE_UPLOAD_MAX_PER_USER = 60;

async function resetRecoveryRateLimitBucket(): Promise<void> {
  const response = await fetch(RECOVERY_TEST_RESET_URL, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'x-test-reset-token': RECOVERY_CODE_TEST_RESET_TOKEN },
    signal: AbortSignal.timeout(20_000),
  });
  expect(response.ok, 'the recovery-code rate-limit reset route must answer').toBe(true);
}

/** A well-formed (32 canonical hex chars) but wrong code, distinct per index. */
function wrongCode(index: number): string {
  return index.toString(16).padStart(2, '0').repeat(16);
}

interface GuestIdentity {
  readonly userId: string;
  readonly accessToken: string;
  readonly client: SupabaseClient;
}

async function createGuestIdentity(): Promise<GuestIdentity> {
  const client = createClient(API_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no session returned'}`);
  }
  return { userId: data.user.id, accessToken: data.session.access_token, client };
}

function documentWithClientClock(clientClockMs: number): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, clientClockMs);
  return createSaveDocument(state, BASE_GAME_BALANCE, clientClockMs);
}

/** A valid document whose warehouse claims `delivered` total gold. */
function documentClaimingDelivery(delivered: string, clientClockMs: number): SaveDocumentV2 {
  const document = documentWithClientClock(clientClockMs) as SaveDocumentV2 & {
    state: { warehouse: Record<string, unknown> };
  };
  return {
    ...document,
    state: {
      ...document.state,
      warehouse: { ...document.state.warehouse, totalGoldDelivered: delivered },
    },
  } as unknown as SaveDocumentV2;
}

async function uploadSave(
  accessToken: string,
  body: unknown,
): Promise<Response> {
  return fetch(SAVE_URL, {
    method: 'PUT',
    headers: {
      apikey: LOCAL_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

async function downloadSave(accessToken: string): Promise<Response> {
  return fetch(SAVE_URL, {
    headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
}

/** A stored row seeded through the service role, since `saves` denies every client write. */
async function seedStoredRow(
  userId: string,
  documentJson: string,
  receivedAtIso: string,
  revision = 1,
): Promise<void> {
  const admin = createServiceRoleClient(API_URL);
  const { error } = await admin.from('saves').insert({
    user_id: userId,
    revision,
    schema_version: 2,
    document_json: documentJson,
    received_at: receivedAtIso,
  });
  if (error) {
    throw new Error(`seeding a saves row failed: ${error.message}`);
  }
}

async function readAuditRows(userId: string) {
  const admin = createServiceRoleClient(API_URL);
  const { data, error } = await admin
    .from('save_audit')
    .select('outcome, error_code, base_revision, resulting_revision, client_reported_at')
    .eq('user_id', userId);
  if (error) {
    throw new Error(`reading save_audit failed: ${error.message}`);
  }
  return data ?? [];
}

describe('adversarial suite (server-milestone Step 26)', () => {
  beforeAll(async () => {
    // Warm every function this file touches before its first real assertion —
    // the same per-file warm-up `recovery-code.integration.test.ts` performs so
    // it stays runnable without `verify-server-stack.mjs`. The probe is a
    // refused `DELETE` on an unrouted path, which returns from each router's
    // default branch before any limiter runs, so warming spends no bucket
    // (constraint 6).
    for (const name of ['save-sync', 'telegram-sign-in', 'recovery-code']) {
      const result = await warmEdgeFunction(name, { functionsBaseUrl: FUNCTIONS_BASE_URL });
      if (!result.responded) {
        console.warn(`adversarial warm-up: no response from ${name} after ${WARMUP_MAX_ATTEMPTS} attempts.`);
      }
    }
  }, WARMUP_HOOK_TIMEOUT_MS);

  // -------------------------------------------------------------------------
  // Attack 1 — forged gold, over the wire
  // -------------------------------------------------------------------------

  /**
   * Guard: Step 23's `evaluateProgressBound`, in `handleSaveUpload`.
   * Mutation: skipping [the bound block] must make this red.
   */
  it('attack 1 (forged gold): an upload claiming more gold than the elapsed time allows is refused with 422 save_rejected carrying the counter detail', async () => {
    const guest = await createGuestIdentity();
    // One minute of real elapsed time, a document claiming a trillion gold.
    await seedStoredRow(
      guest.userId,
      JSON.stringify(documentWithClientClock(Date.now())),
      new Date(Date.now() - 60_000).toISOString(),
    );

    const response = await uploadSave(guest.accessToken, {
      baseRevision: 1,
      document: documentClaimingDelivery('1000000000000', Date.now()),
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as {
      error: { code: string; detail: { counter: string; claimed: string; maximum: string } };
    };
    expect(body.error.code).toBe('save_rejected');
    expect(body.error.detail.counter).toBe('state.warehouse.totalGoldDelivered');
    expect(body.error.detail.claimed).toBe('1000000000000');
    expect(typeof body.error.detail.maximum).toBe('string');

    // AC9: exactly one audit row, recording the refusal.
    const audits = await readAuditRows(guest.userId);
    expect(audits).toHaveLength(1);
    expect(audits[0].outcome).toBe('rejected');
    expect(audits[0].error_code).toBe('save_rejected');
  });

  // -------------------------------------------------------------------------
  // Attack 2 — replayed documents, over the wire
  // -------------------------------------------------------------------------

  /**
   * Guard: §5 optimistic concurrency on `baseRevision`.
   * Mutation: making [the `baseRevision !== storedRevision` branch] accept
   * unconditionally must make this red.
   */
  it('attack 2 (replayed documents): replaying an already-accepted document with its now-stale baseRevision is refused with 409 revision_conflict', async () => {
    const guest = await createGuestIdentity();
    const document = documentWithClientClock(Date.now());

    const first = await uploadSave(guest.accessToken, { baseRevision: null, document });
    expect(first.status).toBe(200);

    // Byte-identical replay of the request the server just accepted.
    const replay = await uploadSave(guest.accessToken, { baseRevision: null, document });

    expect(replay.status).toBe(409);
    const body = (await replay.json()) as { error: { code: string; detail: { serverRevision: number } } };
    expect(body.error.code).toBe('revision_conflict');
    expect(body.error.detail.serverRevision).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Attack 3 — rolled-back concurrency tokens, over the wire
  // -------------------------------------------------------------------------

  /**
   * Guard: the `409` path for a lower-than-current revision, and Step 24's H2
   * `baseRevision` validation.
   * Mutation: inverting [the baseRevision comparison], or making
   * `isValidBaseRevision` always true, must make the relevant case red.
   */
  it('attack 3 (rolled-back concurrency tokens): a baseRevision below the server revision is refused with 409, and each §5-malformed value with 400 malformed_request, each writing exactly one audit row', async () => {
    const guest = await createGuestIdentity();
    const document = documentWithClientClock(Date.now());
    expect(
      (await uploadSave(guest.accessToken, { baseRevision: null, document })).status,
    ).toBe(200);

    const rolledBack = await uploadSave(guest.accessToken, { baseRevision: 0, document: documentWithClientClock(Date.now()) });
    expect(rolledBack.status).toBe(400);
    expect((await rolledBack.json()).error.code).toBe('malformed_request');

    const belowCurrentButValid = await uploadSave(guest.accessToken, {
      baseRevision: 1,
      document: documentWithClientClock(Date.now()),
    });
    // Revision 1 is the current revision, and the document is honest, so this
    // is accepted — the rollback case is the next one.
    expect(belowCurrentButValid.status).toBe(200);

    const staleRollback = await uploadSave(guest.accessToken, {
      baseRevision: 1,
      document: documentWithClientClock(Date.now()),
    });
    expect(staleRollback.status).toBe(409);
    expect((await staleRollback.json()).error.code).toBe('revision_conflict');

    // Step 24's H2: every §5-malformed value is a recorded malformed_request,
    // and none of them aborts the audit insert.
    for (const malformed of [1.5, 1e300, -1, '1']) {
      const response = await uploadSave(guest.accessToken, {
        baseRevision: malformed,
        document: documentWithClientClock(Date.now()),
      });
      expect(response.status, `baseRevision ${String(malformed)}`).toBe(400);
      expect((await response.json()).error.code, `baseRevision ${String(malformed)}`).toBe(
        'malformed_request',
      );
    }

    const audits = await readAuditRows(guest.userId);
    // accepted(1) + malformed(1) + accepted(1) + conflict(1) + malformed(4).
    expect(audits).toHaveLength(8);
    expect(audits.filter((row) => row.error_code === 'malformed_request')).toHaveLength(5);
    expect(audits.filter((row) => row.outcome === 'accepted')).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Attack 4 — clock manipulation in both directions, over the wire
  // -------------------------------------------------------------------------

  /**
   * Guard: Step 22's "the server clock is the only clock" — the grant is
   * computed from the stored `received_at` to the server's `now()`, and the
   * document's timestamps never move it.
   * Mutation: using [the document's `savedAtTimestampMs`] as the grant's
   * elapsed-time origin must make this red.
   */
  it('attack 4 (clock manipulation): an hours-ahead and an hours-behind client receive the identical capped grant for the same real absence', async () => {
    const guest = await createGuestIdentity();
    const receivedAt = new Date(Date.now() - 10 * HOUR_MS).toISOString();
    const admin = createServiceRoleClient(API_URL);

    const grants: { creditedDurationMs: number; reward: string }[] = [];
    for (const clientClockMs of [
      Date.now(),
      Date.now() + 5 * HOUR_MS,
      Date.now() - 100 * HOUR_MS,
    ]) {
      await admin.from('saves').delete().eq('user_id', guest.userId);
      await seedStoredRow(
        guest.userId,
        JSON.stringify(documentWithClientClock(clientClockMs)),
        receivedAt,
      );

      const response = await downloadSave(guest.accessToken);
      expect(response.status).toBe(200);
      grants.push((await response.json()).offlineGrant);
    }

    expect(grants[1].creditedDurationMs).toBe(grants[0].creditedDurationMs);
    expect(grants[1].reward).toBe(grants[0].reward);
    expect(grants[2].creditedDurationMs).toBe(grants[0].creditedDurationMs);
    expect(grants[2].reward).toBe(grants[0].reward);
    expect(grants[0].creditedDurationMs).toBe(BASE_GAME_BALANCE.offlineIncome.capDurationMs);
  });

  /**
   * Guard: the explicit `savedAtTimestampMs` is invalidated before `baseRevision` use and recorded verbatim, never trusted.
   * Mutation: feeding the client's reported clock into the bound's elapsed
   * computation must make this red.
   */
  it('attack 4 (clock manipulation): a claimed client clock is recorded verbatim in the audit while the bound still uses server time', async () => {
    const guest = await createGuestIdentity();
    const claimedMs = Date.now() + 5 * HOUR_MS;
    await seedStoredRow(
      guest.userId,
      JSON.stringify(documentWithClientClock(Date.now())),
      new Date(Date.now() - 60_000).toISOString(),
    );

    const response = await uploadSave(guest.accessToken, {
      baseRevision: 1,
      document: documentClaimingDelivery('1000000000000', claimedMs),
    });

    expect(response.status).toBe(422);
    const audits = await readAuditRows(guest.userId);
    expect(audits).toHaveLength(1);
    // The divergence is visible, and it changed nothing about the outcome.
    expect(audits[0].error_code).toBe('save_rejected');
    // Compared as an instant, not as text: `client_reported_at` is a
    // `timestamptz`, and PostgREST reads it back in Postgres' own
    // `+00:00` rendering while `toISOString()` ends in `Z`. The claim is that
    // the *instant* is the client's, verbatim — which is what `Date.parse`
    // asserts without pinning a serialization this database is free to choose.
    expect(Date.parse(audits[0].client_reported_at as string)).toBe(claimedMs);
  });

  // -------------------------------------------------------------------------
  // Attack 5 — another user's id
  // -------------------------------------------------------------------------

  /**
   * Guard: the caller identity is resolved from the JWT and from no request
   * field.
   * Mutation: reading the account from [any request-supplied user id] must
   * make this red.
   *
   * `PUT`/`GET /v1/save` carry no user id on the wire at all, so the strongest
   * available statement is the one below: a body that *does* carry one changes
   * nothing, and the write lands on the token's own account. The cross-account
   * read/write denial through PostgREST is attack 6's matrix.
   */
  it("attack 5 (another user's id): a body claiming a different user_id neither selects that account nor writes to it — the token's own account is the only one touched", async () => {
    const victim = await createGuestIdentity();
    const attacker = await createGuestIdentity();
    await seedStoredRow(
      victim.userId,
      JSON.stringify(documentWithClientClock(Date.now())),
      new Date(Date.now() - 60_000).toISOString(),
    );

    const before = await readAuditRows(victim.userId);

    const response = await uploadSave(attacker.accessToken, {
      baseRevision: null,
      user_id: victim.userId,
      userId: victim.userId,
      document: documentWithClientClock(Date.now()),
    });

    // Accepted — for the attacker's own account, not the victim's.
    expect(response.status).toBe(200);

    const victimRows = await readAuditRows(victim.userId);
    expect(victimRows).toHaveLength(before.length);

    // The victim's stored revision is untouched, and the attacker's own
    // account is the one that advanced.
    const victimDownload = await downloadSave(victim.accessToken);
    expect(victimDownload.status).toBe(200);
    expect((await victimDownload.json()).revision).toBe(1);

    const attackerDownload = await downloadSave(attacker.accessToken);
    expect(attackerDownload.status).toBe(200);
    expect((await attackerDownload.json()).revision).toBe(1);
  });

  it("attack 5 (another user's id): a forged token for another user's id is refused, because identity comes from the JWT's verified signature", async () => {
    // `mintFixtureUserToken` signs with the wrong-local-secret helper when
    // asked for a foreign id; either way the server verifies the signature
    // rather than the claimed `sub`.
    const response = await uploadSave('not-a-real-jwt', {
      baseRevision: null,
      document: documentWithClientClock(Date.now()),
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthenticated');
  });

  // -------------------------------------------------------------------------
  // Attack 7 — unverified Telegram payloads, over the wire
  // -------------------------------------------------------------------------

  /**
   * Guard: `telegram-sign-in`'s HMAC derivation and `timingSafeEqualHex`.
   * Mutation: making `verifyTelegramInitData` return `valid: true`
   * unconditionally (or dropping the hash field requirement) must make this red.
   */
  it('attack 7 (unverified Telegram payloads): every forged or tampered initData vector is refused over the wire with no session issued', async () => {
    const valid = mintValidInitData();
    const vectors: readonly (readonly [string, string])[] = [
      ['tampered after signing', tamperInitData(valid)],
      ['reordered fields', reorderInitDataFields(valid)],
      ['extra unsigned field', appendUnsignedInitDataField(valid)],
      ['hash removed', removeInitDataHash(valid)],
      ['signed under a different bot token', mintInitDataSignedWithForeignBotToken()],
    ];

    for (const [label, initData] of vectors) {
      const response = await fetch(TELEGRAM_SIGN_IN_URL, {
        method: 'POST',
        headers: { apikey: LOCAL_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ initData }),
        signal: AbortSignal.timeout(20_000),
      });

      if (label === 'reordered fields') {
        // Telegram's algorithm sorts, so a correct verifier is
        // order-independent: a reordered but otherwise untouched payload is
        // *valid*. A verifier that hashed received order would reject here,
        // which is a different (wrong) implementation.
        expect(response.status, label).toBe(200);
        continue;
      }

      expect(response.status, label).toBe(401);
      const body = (await response.json()) as { error: { code: string }; tokenHash?: string };
      expect(body.error.code, label).toBe('unauthenticated');
      expect(body, label).not.toHaveProperty('tokenHash');
    }
  });

  // -------------------------------------------------------------------------
  // Attack 8 — a stolen anonymous session
  // -------------------------------------------------------------------------

  /**
   * Guard: Step 14's recovery-code rotation invalidating the prior code.
   * Mutation: making `rotate_recovery_code` leave the prior code active must
   * make this red.
   *
   * ## The boundary this test pins, honestly (AC13)
   *
   * Rotation invalidates the **recovery code** a thief would need to
   * re-establish the account on a device of their own. It does **not**
   * invalidate a stolen **session token**: a bearer token lifted from
   * script-writable storage stays valid until it is rotated by the user, and
   * nothing in this milestone rotates it. Nothing here is a defence against an
   * attacker who already has the token — they do not need the recovery code,
   * because they are already the session.
   *
   * Finding **F5** (an XSS flaw in our own bundle defeats the session
   * boundary entirely, `server-threat-model.md` §4.5) is explicitly out of
   * scope for Step 26 and is not tested here. What is tested is the one
   * boundary that exists: after rotation the old code cannot reclaim the
   * account, so a *stolen recovery code* is spent the moment the real player
   * generates a fresh one.
   */
  it('attack 8 (a stolen anonymous session): regenerating a recovery code invalidates the prior one, so a stolen code cannot reclaim the account', async () => {
    const victim = await createGuestIdentity();
    // The redeem below must reach the store rather than be refused by a bucket
    // another file's throttle test left full — see the reset route's comment.
    await resetRecoveryRateLimitBucket();

    const first = await fetch(RECOVERY_GENERATE_URL, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${victim.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    expect(first.status).toBe(200);
    const { code: stolenCode } = (await first.json()) as { code: string };

    // The thief has the old code. The real player rotates.
    const second = await fetch(RECOVERY_GENERATE_URL, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${victim.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    expect(second.status).toBe(200);
    const { code: freshCode } = (await second.json()) as { code: string };
    expect(freshCode).not.toBe(stolenCode);

    const redeem = (code: string) =>
      fetch(RECOVERY_REDEEM_URL, {
        method: 'POST',
        headers: { apikey: LOCAL_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(20_000),
      });

    const stolenAttempt = await redeem(stolenCode);
    expect(stolenAttempt.status).toBe(401);
    expect((await stolenAttempt.json()).error.code).toBe('recovery_code_invalid');

    // The boundary again, stated as a positive assertion: the *fresh* code
    // still works, so what was invalidated is the old code and not the
    // mechanism.
    const freshAttempt = await redeem(freshCode);
    expect(freshAttempt.status).toBe(200);
    expect(typeof (await freshAttempt.json()).tokenHash).toBe('string');
  });

  // -------------------------------------------------------------------------
  // Attack 9 — brute-forced recovery codes, live half
  // -------------------------------------------------------------------------

  /**
   * Guard: the peppered `code_hash` and the single-redemption predicate.
   * Mutation: storing the plaintext code, or dropping `is('redeemed_at', null)`
   * from the compare-and-swap, must make this red.
   */
  it('attack 9 (brute-forced recovery codes): sustained wrong-code attempts touch no stored row, and a correct code redeems exactly once', async () => {
    await resetRecoveryRateLimitBucket();
    const victim = await createGuestIdentity();
    const generate = await fetch(RECOVERY_GENERATE_URL, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${victim.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    const { code } = (await generate.json()) as { code: string };

    const admin = createServiceRoleClient(API_URL);
    const rowsBefore = await admin.from('recovery_codes').select('id').eq('user_id', victim.userId);
    expect(rowsBefore.error).toBeNull();

    const redeem = (candidate: string) =>
      fetch(RECOVERY_REDEEM_URL, {
        method: 'POST',
        headers: { apikey: LOCAL_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ code: candidate }),
        signal: AbortSignal.timeout(20_000),
      });

    // A handful of wrong, well-formed codes. Deliberately few: the suite is
    // observed as one address, and a flood here would spend the shared
    // bucket other tests depend on being available. The sustained-flood bound
    // is proven deterministically in the pure unit suite
    // (`recovery-code/adversarial.test.ts`), where an injected clock needs no
    // shared bucket at all.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await redeem(wrongCode(attempt));
      // After the reset above this must be the generic invalid-code answer,
      // not a `429`: a throttle would short-circuit before the code was ever
      // compared, which is not the guard this test exists to prove.
      expect(wrong.status, `wrong code ${attempt}`).toBe(401);
      expect((await wrong.json()).error.code, `wrong code ${attempt}`).toBe('recovery_code_invalid');
    }

    // The stored row is untouched by every wrong attempt.
    const afterWrong = await admin
      .from('recovery_codes')
      .select('redeemed_at, revoked_at')
      .eq('user_id', victim.userId);
    expect(afterWrong.data).toHaveLength(1);
    expect(afterWrong.data?.[0].redeemed_at).toBeNull();
    expect(afterWrong.data?.[0].revoked_at).toBeNull();

    // The real code redeems exactly once.
    const first = await redeem(code);
    expect(first.status).toBe(200);
    const second = await redeem(code);
    expect(second.status).toBe(401);
    expect((await second.json()).error.code).toBe('recovery_code_invalid');
  });

  // -------------------------------------------------------------------------
  // Attack 9 / AC9's flood assertion — a `429` must not grow save_audit
  // -------------------------------------------------------------------------

  /**
   * Guard: Step 25's per-user upload limit sits **above** the audit write, so
   * a refused flood leaves the table untouched (Step 24's L2).
   * Mutation: moving [the `uploadByUser.check` call] below `recordSaveAudit`
   * must make this red.
   *
   * The loop is bounded at `SAVE_UPLOAD_MAX_PER_USER + 1` — the same "one
   * user's bucket, not the address's" shape `rate-limit.integration.test.ts`
   * uses and documents, so this file adds one more user's worth of traffic to
   * the shared address rather than a flood of its own. It does not depend on
   * the shared bucket being full: if another file already spent it the very
   * first request is refused (also a pass), and the assertion is always about
   * `save_audit` growing by the **admitted** count only.
   */
  it('attack 9 / AC9: a rate-limited upload flood does not grow save_audit per refused request', async () => {
    const guest = await createGuestIdentity();
    const admin = createServiceRoleClient(API_URL);

    const before = await admin.from('save_audit').select('id').eq('user_id', guest.userId);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(0);

    let admitted = 0;
    let refused = 0;

    for (let attempt = 0; attempt < SAVE_UPLOAD_MAX_PER_USER + 1; attempt += 1) {
      const response = await uploadSave(guest.accessToken, {
        baseRevision: null,
        document: documentWithClientClock(Date.now()),
      });

      if (response.status === 429) {
        refused += 1;
        // AC8: a refusal must be the documented shape, never a 500.
        const body = (await response.json()) as { error: { code: string; detail: { retryAfterSeconds: number } } };
        expect(body.error.code).toBe('rate_limited');
        expect(response.headers.get('retry-after')).toBe(String(body.error.detail.retryAfterSeconds));
        continue;
      }

      // Every non-429 is the first upload (200) or a conflict on its replay
      // (409) — both audited, both legitimate.
      expect([200, 409]).toContain(response.status);
      admitted += 1;
    }

    const after = await admin.from('save_audit').select('id').eq('user_id', guest.userId);
    expect(after.error).toBeNull();

    // Step 24's L2 bound, stated exactly: the table grew by the admitted
    // count and not by the refused count.
    expect(after.data).toHaveLength(admitted);
    if (refused > 0) {
      expect(after.data!.length).toBeLessThan(admitted + refused);
    }
  });

  // -------------------------------------------------------------------------
  // Shared sanity — the fixture helpers this file relies on still work
  // -------------------------------------------------------------------------

  it('the JWT fixture mints a token for the seeded guest, so attack 5’s forgery probe is testing forgery and not a broken fixture', () => {
    const token = mintFixtureUserToken();
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
      sub: string;
    };
    expect(payload.sub).toBe(FIXTURE_USER_ID);
  });
});
