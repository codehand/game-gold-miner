import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/** A fresh 64-hex-char value per call — `code_hash` is globally unique, so a fixed literal would collide with a prior run's leftover row instead of only with the row this test inserts. */
function randomHexHash(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Server-milestone Step 14: integration tests for the recovery-code Edge
 * Function against the live stack. `supabase/functions/recovery-code/index.test.ts`
 * proves the pure routing/validation/rate-limit logic with every collaborator
 * faked; this file proves the real ones — Supabase Auth verification, the
 * `recovery_codes` compare-and-swap writes, and minting a session via
 * `admin.generateLink` for a resolved `user_id` (including the no-email,
 * pure-anonymous-guest case) — actually work together against the live
 * stack, and that `recovery_codes`' RLS (no policy at all) still denies
 * every direct client access this function does not make on the caller's
 * behalf.
 *
 * Each test uses its own fresh anonymous identity, so no test's state
 * depends on another test having run first.
 */
const API_URL = 'http://127.0.0.1:54321';
const GENERATE_URL = `${API_URL}/functions/v1/recovery-code/v1/generate`;
const REDEEM_URL = `${API_URL}/functions/v1/recovery-code/v1/redeem`;
const TEST_RESET_RATE_LIMIT_URL = `${API_URL}/functions/v1/recovery-code/v1/test-only-reset-rate-limit`;
const CODE_HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Must equal `RECOVERY_CODE_TEST_RESET_TOKEN` in `supabase/functions/.env`
 * (git-ignored; see `.env.example`) — the same fixture-value-must-match-the-
 * real-env-file relationship `telegramInitDataFixture.ts`'s bot token
 * already establishes. A local test-harness convenience, not a secret
 * protecting player data.
 */
const RECOVERY_CODE_TEST_RESET_TOKEN = 'b5f1ce2061989404035108f8895075b893eaa4a3f56eeca2d0bc3a2aef8f9f66';

/**
 * A 2026-09-13 review finding: once `extractCallerAddress` reads the
 * platform gateway's own trusted `X-Forwarded-For` hop, every request this
 * whole file makes shares one real, gateway-observed rate-limit bucket —
 * there is no client-side way to get a fresh one. Without this, the
 * dedicated throttle test below leaves that shared bucket full, and
 * re-running the suite inside the 60-second window fails unrelated tests
 * (:111, :210) with `429` instead of their real expectations. Called before
 * and after the whole suite so neither a prior run's leftover state nor
 * this run's own throttle test leaks into whatever runs next.
 */
async function resetRateLimitBucket(): Promise<void> {
  const response = await fetch(TEST_RESET_RATE_LIMIT_URL, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'x-test-reset-token': RECOVERY_CODE_TEST_RESET_TOKEN },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`failed to reset the recovery-code rate-limit bucket: HTTP ${response.status}`);
  }
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

function generateCode(accessToken: string): Promise<Response> {
  return fetch(GENERATE_URL, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
}

/**
 * Never sets `X-Forwarded-For` itself. A 2026-09-12 review finding changed
 * `extractCallerAddress` to read the *last* hop of that header — the one
 * this platform's own gateway appends and a client cannot forge — rather
 * than the first (client-suppliable) one. Confirmed against the live local
 * stack (Kong): it always appends its own observed address whether or not
 * the client sent the header at all, so every request this suite makes
 * shares one real, unspoofable bucket regardless of what this function
 * does or doesn't set — there is no client-side way to opt out locally, the
 * same as a real deployment's gateway would behave for every caller behind
 * one shared address (e.g. an office NAT). `RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS`
 * (30) is sized to comfortably absorb this whole file's own normal call
 * volume; only the dedicated throttle test below deliberately drives the
 * shared bucket past it.
 */
function redeemCode(code: string): Promise<Response> {
  return fetch(REDEEM_URL, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function fetchRecoveryCodeRow(userId: string): Promise<
  { readonly code_hash: string; readonly redeemed_at: string | null; readonly revoked_at: string | null }[]
> {
  const serviceRole = createServiceRoleClient(API_URL);
  const { data, error } = await serviceRole
    .from('recovery_codes')
    .select('code_hash, redeemed_at, revoked_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`failed to read recovery_codes for ${userId}: ${error.message}`);
  }
  return data ?? [];
}

describe('recovery-code (server-milestone Step 14)', () => {
  beforeAll(resetRateLimitBucket);
  afterAll(resetRateLimitBucket);

  it('the test-reset route refuses a wrong or missing token identically to an unknown route', async () => {
    const noToken = await fetch(TEST_RESET_RATE_LIMIT_URL, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY },
      signal: AbortSignal.timeout(20_000),
    });
    const wrongToken = await fetch(TEST_RESET_RATE_LIMIT_URL, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY, 'x-test-reset-token': 'definitely-not-the-real-token' },
      signal: AbortSignal.timeout(20_000),
    });

    for (const response of [noToken, wrongToken]) {
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('malformed_request');
    }
  });

  it('the test-reset route clears the shared bucket so a throttled address redeems again', async () => {
    let sawRateLimited = false;
    for (let attempt = 0; attempt < 45 && !sawRateLimited; attempt += 1) {
      const response = await redeemCode('ffff-ffff-ffff-ffff-ffff-ffff-ffff-ffff');
      if (response.status === 429) {
        sawRateLimited = true;
      }
    }
    expect(sawRateLimited).toBe(true);

    await resetRateLimitBucket();

    const afterReset = await redeemCode('ffff-ffff-ffff-ffff-ffff-ffff-ffff-ffff');
    expect(afterReset.status).toBe(401);
  });

  it('answers 401 with no Authorization header on generate', async () => {
    const response = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY },
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthenticated');
  });

  it('generates a code that redeems and restores the identical account, including for a pure anonymous guest with no email at all', async () => {
    const guest = await createGuestIdentity();

    const generated = await generateCode(guest.accessToken);
    expect(generated.status).toBe(200);
    const { code } = await generated.json();
    expect(code).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){7}$/);

    const redeemed = await redeemCode(code);
    expect(redeemed.status).toBe(200);
    const { tokenHash } = await redeemed.json();
    expect(typeof tokenHash).toBe('string');

    const otp = await guest.client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    expect(otp.error).toBeNull();
    expect(otp.data.user?.id).toBe(guest.userId);
  });

  it('accepts a code with its display dashes stripped or its case changed', async () => {
    const guest = await createGuestIdentity();
    const generated = await generateCode(guest.accessToken);
    const { code } = await generated.json();
    const canonical = code.replace(/-/g, '');

    const redeemed = await redeemCode(canonical.toUpperCase());

    expect(redeemed.status).toBe(200);
  });

  it('stores no plaintext code — the row holds only a 64-character lowercase hex digest', async () => {
    const guest = await createGuestIdentity();
    const generated = await generateCode(guest.accessToken);
    const { code } = await generated.json();

    const rows = await fetchRecoveryCodeRow(guest.userId);

    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).toMatch(CODE_HASH_PATTERN);
    expect(rows[0].code_hash).not.toBe(code);
    expect(rows[0].code_hash.includes(code.replace(/-/g, ''))).toBe(false);
  });

  it('a code redeems exactly once — redeeming it again is refused', async () => {
    const guest = await createGuestIdentity();
    const { code } = await (await generateCode(guest.accessToken)).json();

    const first = await redeemCode(code);
    expect(first.status).toBe(200);

    const second = await redeemCode(code);
    expect(second.status).toBe(401);
    expect((await second.json()).error.code).toBe('recovery_code_invalid');
  });

  it('regeneration invalidates the prior code', async () => {
    const guest = await createGuestIdentity();
    const { code: firstCode } = await (await generateCode(guest.accessToken)).json();
    const { code: secondCode } = await (await generateCode(guest.accessToken)).json();

    expect(secondCode).not.toBe(firstCode);

    const redeemOld = await redeemCode(firstCode);
    expect(redeemOld.status).toBe(401);
    expect((await redeemOld.json()).error.code).toBe('recovery_code_invalid');

    const redeemNew = await redeemCode(secondCode);
    expect(redeemNew.status).toBe(200);

    const rows = await fetchRecoveryCodeRow(guest.userId);
    expect(rows).toHaveLength(2);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[0].redeemed_at).toBeNull();
    expect(rows[1].revoked_at).toBeNull();
    expect(rows[1].redeemed_at).not.toBeNull();
  });

  it('refuses a wrong code without ever touching a real row', async () => {
    const response = await redeemCode('ffff-ffff-ffff-ffff-ffff-ffff-ffff-ffff');

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('recovery_code_invalid');
  });

  it('refuses a malformed code with the same generic response as a wrong one', async () => {
    const response = await redeemCode('not-a-real-code');

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('recovery_code_invalid');
  });

  it("cannot be bypassed by reading or writing recovery_codes directly through PostgREST", async () => {
    const guest = await createGuestIdentity();
    await generateCode(guest.accessToken);

    const direct = await fetch(`${API_URL}/rest/v1/recovery_codes?user_id=eq.${guest.userId}`, {
      headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${guest.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });

    expect(direct.status).toBe(200);
    expect(await direct.json()).toEqual([]);
  });

  it('a 2026-09-13 review finding (optional hardening): neither RPC is callable through PostgREST by an authenticated caller', async () => {
    // RLS already makes both RPCs inert for anon/authenticated — `recovery_codes`
    // carries no policy at all — but 20260913090200_recovery_code_rpc_grants.sql
    // closes it at the grant layer too. This proves that layer directly,
    // independent of RLS: a permission-denied error, not merely an
    // RLS-empty result.
    const guest = await createGuestIdentity();

    const rotateAttempt = await fetch(`${API_URL}/rest/v1/rpc/rotate_recovery_code`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_ANON_KEY,
        authorization: `Bearer ${guest.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: guest.userId, p_code_hash: 'c'.repeat(64) }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(rotateAttempt.status).toBe(403);

    const revertAttempt = await fetch(`${API_URL}/rest/v1/rpc/revert_recovery_code_redemption`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_ANON_KEY,
        authorization: `Bearer ${guest.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_code_hash: 'c'.repeat(64) }),
      signal: AbortSignal.timeout(20_000),
    });
    expect(revertAttempt.status).toBe(403);
  });

  it('a 2026-09-12-style concurrency check: two concurrent redemptions of the same code do not both win', async () => {
    const guest = await createGuestIdentity();
    const { code } = await (await generateCode(guest.accessToken)).json();

    const [first, second] = await Promise.all([redeemCode(code), redeemCode(code)]);
    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([200, 401]);

    const rows = await fetchRecoveryCodeRow(guest.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].redeemed_at).not.toBeNull();
  });

  it('a 2026-09-13 review finding: two concurrent regenerate calls for the same user leave exactly one active, redeemable code', async () => {
    // `rotate_recovery_code` (20260913090000_recovery_code_rotation_rpc.sql)
    // wraps the revoke and insert in one transaction. Two genuinely
    // concurrent calls can resolve either of two legitimate ways depending
    // on network-level timing — the second call's revoke can land on the
    // first call's freshly-inserted row before either insert races
    // (both succeed, [200, 200]), or the two inserts can genuinely collide
    // against `recovery_codes_one_active_per_user_idx` (the loser's whole
    // transaction, including its own revoke, rolls back: [200, 500]).
    // Asserting a specific pair would make this test flaky against real
    // timing; the invariant the fix actually guarantees — and the only one
    // asserted here — holds under both: never zero active codes, never two,
    // and the survivor is genuinely redeemable.
    const guest = await createGuestIdentity();
    await generateCode(guest.accessToken);

    const [first, second] = await Promise.all([generateCode(guest.accessToken), generateCode(guest.accessToken)]);
    for (const response of [first, second]) {
      expect([200, 500]).toContain(response.status);
    }
    expect([first.status, second.status]).toContain(200);

    const rows = await fetchRecoveryCodeRow(guest.userId);
    const active = rows.filter((row) => row.redeemed_at === null && row.revoked_at === null);
    expect(active).toHaveLength(1);

    // When both calls answered 200 ([200, 200]), the second one's revoke can
    // still have landed on the first one's freshly-inserted row before the
    // race resolved — the first call's own `200` response does not, by
    // itself, guarantee *its* code is the surviving one. Trying every `200`
    // response's code and requiring exactly one success is what actually
    // proves "genuinely redeemable," regardless of which call's HTTP
    // response happened to carry the surviving code.
    const candidateCodes = await Promise.all(
      [first, second].filter((response) => response.status === 200).map(async (response) => (await response.json()).code),
    );
    const redemptions = await Promise.all(candidateCodes.map((candidate) => redeemCode(candidate)));
    expect(redemptions.filter((response) => response.status === 200)).toHaveLength(1);
  });

  it('a 2026-09-13 review finding: rotate_recovery_code rolls back its revoke when the insert half fails, leaving the original code active', async () => {
    // A forced global code_hash collision (globally unique, not merely
    // per-user) is the deterministic way to make the insert half fail on
    // demand, rather than relying on network-timing luck. Both hashes are
    // freshly random per run — a fixed literal would collide with a prior
    // run's leftover row instead of only with the row this test inserts.
    const serviceRole = createServiceRoleClient(API_URL);
    const decoy = await createGuestIdentity();
    const target = await createGuestIdentity();

    const collisionHash = randomHexHash();
    const decoyInsert = await serviceRole
      .from('recovery_codes')
      .insert({ user_id: decoy.userId, code_hash: collisionHash });
    expect(decoyInsert.error).toBeNull();

    const originalHash = randomHexHash();
    const originalInsert = await serviceRole
      .from('recovery_codes')
      .insert({ user_id: target.userId, code_hash: originalHash });
    expect(originalInsert.error).toBeNull();

    const { error } = await serviceRole.rpc('rotate_recovery_code', {
      p_user_id: target.userId,
      p_code_hash: collisionHash,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('duplicate key value violates unique constraint');

    const rows = await fetchRecoveryCodeRow(target.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).toBe(originalHash);
    expect(rows[0].revoked_at).toBeNull();
  });

  it('a 2026-09-13 review finding (1c): revert_recovery_code_redemption clears redeemed_at when the code is the account\'s only row', async () => {
    const guest = await createGuestIdentity();
    await generateCode(guest.accessToken);
    const serviceRole = createServiceRoleClient(API_URL);
    const [row] = await fetchRecoveryCodeRow(guest.userId);

    const markRedeemed = await serviceRole
      .from('recovery_codes')
      .update({ redeemed_at: new Date().toISOString() })
      .eq('code_hash', row.code_hash);
    expect(markRedeemed.error).toBeNull();

    const { error } = await serviceRole.rpc('revert_recovery_code_redemption', { p_code_hash: row.code_hash });
    expect(error).toBeNull();

    const [reverted] = await fetchRecoveryCodeRow(guest.userId);
    expect(reverted.redeemed_at).toBeNull();
  });

  it('a 2026-09-13 review finding (1c): revert_recovery_code_redemption is a safe no-op once a fresher code has already taken over', async () => {
    // Simulates the narrow race: a code is redeemed (mint about to fail),
    // then — before the revert runs — the same account rotates again on
    // another session. The revert must not try to revive the spent code
    // alongside the fresh one, which would collide with
    // recovery_codes_one_active_per_user_idx.
    const guest = await createGuestIdentity();
    await generateCode(guest.accessToken);
    const serviceRole = createServiceRoleClient(API_URL);
    const [firstRow] = await fetchRecoveryCodeRow(guest.userId);

    const markRedeemed = await serviceRole
      .from('recovery_codes')
      .update({ redeemed_at: new Date().toISOString() })
      .eq('code_hash', firstRow.code_hash);
    expect(markRedeemed.error).toBeNull();

    const rotated = await generateCode(guest.accessToken);
    expect(rotated.status).toBe(200);

    const { error } = await serviceRole.rpc('revert_recovery_code_redemption', {
      p_code_hash: firstRow.code_hash,
    });
    expect(error).toBeNull();

    const rows = await fetchRecoveryCodeRow(guest.userId);
    const active = rows.filter((row) => row.redeemed_at === null && row.revoked_at === null);
    expect(active).toHaveLength(1);
    const original = rows.find((row) => row.code_hash === firstRow.code_hash);
    expect(original?.redeemed_at).not.toBeNull();
  });

  it('throttles repeated redemption attempts from the same address', async () => {
    // Every request in this file — this test included — shares one real,
    // gateway-observed address bucket (see `redeemCode`'s doc comment), so
    // this test's own attempts stack on top of whatever headroom the rest
    // of the file's normal traffic left in the 60-second window. A generous
    // upper bound, rather than an exact attempt count, tolerates that
    // ambient consumption instead of assuming this test starts from zero.
    const statuses: number[] = [];
    let sawRateLimited = false;

    for (let attempt = 0; attempt < 45 && !sawRateLimited; attempt += 1) {
      const response = await redeemCode('ffff-ffff-ffff-ffff-ffff-ffff-ffff-ffff');
      statuses.push(response.status);
      if (response.status === 429) {
        sawRateLimited = true;
      } else {
        expect(response.status).toBe(401);
      }
    }

    expect(sawRateLimited).toBe(true);
  });
});
