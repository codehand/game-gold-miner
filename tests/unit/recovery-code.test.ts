import { describe, expect, it, vi } from 'vitest';

import { generateRecoveryCode, redeemRecoveryCode, type RecoveryCodeAuthClient } from '../../src/platform/web';

/**
 * Server-milestone Step 14: `generateRecoveryCode`/`redeemRecoveryCode`
 * never touch the network or the SDK directly in these tests — `fetch` is
 * stubbed and `auth` is faked, the same collaborator-injection pattern
 * `google-sign-in.test.ts`/`guest-session.test.ts` already use.
 */
const EDGE_FUNCTION_URL = 'https://example.test/functions/v1/recovery-code';
const REDEEM_URL = 'https://example.test/functions/v1/recovery-code/redeem';
const ACCESS_TOKEN = 'a-real-access-token';

function fakeAuth(overrides: Partial<RecoveryCodeAuthClient> = {}): RecoveryCodeAuthClient {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: ACCESS_TOKEN } }, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('generateRecoveryCode', () => {
  it('resolves unconfigured and calls nothing when the client is null', async () => {
    await expect(generateRecoveryCode(null, EDGE_FUNCTION_URL)).resolves.toEqual({ status: 'unconfigured' });
  });

  it('resolves error, never throws, when there is no session', async () => {
    const auth = fakeAuth({ getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) });

    const result = await generateRecoveryCode(auth, EDGE_FUNCTION_URL);

    expect(result.status).toBe('error');
  });

  it('resolves error, never throws, when getSession reports an error', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'boom' } }),
    });

    await expect(generateRecoveryCode(auth, EDGE_FUNCTION_URL)).resolves.toEqual({
      status: 'error',
      reason: 'boom',
    });
  });

  it('posts the session access token and resolves the generated code', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { code: 'aaaa-bbbb-cccc-dddd-eeee-ffff-0000-1111' }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = fakeAuth();

    const result = await generateRecoveryCode(auth, EDGE_FUNCTION_URL);

    expect(result).toEqual({ status: 'generated', code: 'aaaa-bbbb-cccc-dddd-eeee-ffff-0000-1111' });
    expect(fetchMock).toHaveBeenCalledWith(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    vi.unstubAllGlobals();
  });

  it('resolves error, never throws, on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: { code: 'unauthenticated', message: 'bad token' } })),
    );

    const result = await generateRecoveryCode(fakeAuth(), EDGE_FUNCTION_URL);

    expect(result).toEqual({ status: 'error', reason: 'bad token' });
    vi.unstubAllGlobals();
  });

  it('resolves error, never throws, when a collaborator call rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const result = await generateRecoveryCode(fakeAuth(), EDGE_FUNCTION_URL);

    expect(result).toEqual({ status: 'error', reason: 'offline' });
    vi.unstubAllGlobals();
  });
});

describe('redeemRecoveryCode', () => {
  it('resolves unconfigured and calls nothing when the client is null', async () => {
    await expect(redeemRecoveryCode('a code', REDEEM_URL, null)).resolves.toEqual({ status: 'unconfigured' });
  });

  it('posts the code and completes the session via verifyOtp on success', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { tokenHash: 'a-token-hash' }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = fakeAuth();

    const result = await redeemRecoveryCode('aaaa-bbbb', REDEEM_URL, auth);

    expect(result).toEqual({ status: 'redeemed' });
    expect(fetchMock).toHaveBeenCalledWith(REDEEM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'aaaa-bbbb' }),
    });
    expect(auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: 'a-token-hash', type: 'email' });
    vi.unstubAllGlobals();
  });

  it('resolves invalid-code for a wrong or already-used code, distinct from a generic error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(401, { error: { code: 'recovery_code_invalid', message: 'Recovery code is invalid or already used.' } }),
      ),
    );

    const result = await redeemRecoveryCode('wrong', REDEEM_URL, fakeAuth());

    expect(result).toEqual({ status: 'invalid-code' });
    vi.unstubAllGlobals();
  });

  it('resolves rate-limited on a 429, distinct from a generic error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(429, { error: { code: 'rate_limited', message: 'Too many attempts.' } })),
    );

    const result = await redeemRecoveryCode('whatever', REDEEM_URL, fakeAuth());

    expect(result).toEqual({ status: 'rate-limited' });
    vi.unstubAllGlobals();
  });

  it('resolves error, never throws, on an unexpected non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: { code: 'server_error', message: 'boom' } })));

    const result = await redeemRecoveryCode('whatever', REDEEM_URL, fakeAuth());

    expect(result).toEqual({ status: 'error', reason: 'boom' });
    vi.unstubAllGlobals();
  });

  it('resolves error, never throws, when verifyOtp itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { tokenHash: 'a-token-hash' })));
    const auth = fakeAuth({ verifyOtp: vi.fn().mockResolvedValue({ error: { message: 'expired token' } }) });

    const result = await redeemRecoveryCode('whatever', REDEEM_URL, auth);

    expect(result).toEqual({ status: 'error', reason: 'expired token' });
    vi.unstubAllGlobals();
  });

  it('resolves error, never throws, when a collaborator call rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const result = await redeemRecoveryCode('whatever', REDEEM_URL, fakeAuth());

    expect(result).toEqual({ status: 'error', reason: 'offline' });
    vi.unstubAllGlobals();
  });
});
