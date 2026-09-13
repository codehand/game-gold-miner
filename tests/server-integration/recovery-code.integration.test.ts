import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY } from './authFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

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
const CODE_HASH_PATTERN = /^[0-9a-f]{64}$/;

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
