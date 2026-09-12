import { describe, expect, it, vi } from 'vitest';

import {
  beginGoogleAccountSwitch,
  beginGoogleSignIn,
  detectGoogleIdentityCollision,
  signOutOfSession,
  type GoogleAuthClient,
} from '../../src/platform/web';

const EXISTING_SESSION = { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } };
const OAUTH_RESPONSE = { data: { provider: 'google', url: 'https://accounts.google.com/…' }, error: null };
const REDIRECT_ORIGIN = 'http://127.0.0.1:5173';

function fakeAuth(overrides: Partial<GoogleAuthClient> = {}): GoogleAuthClient {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    linkIdentity: vi.fn().mockResolvedValue(OAUTH_RESPONSE),
    signInWithOAuth: vi.fn().mockResolvedValue(OAUTH_RESPONSE),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    initialize: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

describe('beginGoogleSignIn', () => {
  it('resolves unconfigured and calls nothing when the client is null', async () => {
    await expect(beginGoogleSignIn(null)).resolves.toEqual({ status: 'unconfigured' });
  });

  it('links Google to the existing session, keeping the same user id, rather than signing in fresh', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: EXISTING_SESSION }, error: null }),
    });

    await expect(beginGoogleSignIn(auth, REDIRECT_ORIGIN)).resolves.toEqual({ status: 'redirecting' });

    expect(auth.linkIdentity).toHaveBeenCalledExactlyOnceWith({
      provider: 'google',
      options: { redirectTo: REDIRECT_ORIGIN },
    });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('starts a fresh OAuth sign-in when there is no existing session', async () => {
    const auth = fakeAuth();

    await expect(beginGoogleSignIn(auth, REDIRECT_ORIGIN)).resolves.toEqual({ status: 'redirecting' });

    expect(auth.signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      provider: 'google',
      options: { redirectTo: REDIRECT_ORIGIN },
    });
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it('omits the options key entirely when no redirectTo is given, rather than setting it to undefined', async () => {
    const auth = fakeAuth();

    await beginGoogleSignIn(auth);

    // `toHaveBeenCalledExactlyOnceWith` is undefined-tolerant — a call with
    // `options: undefined` would satisfy an expectation of `{ provider }`
    // and vice versa — so it cannot tell "key omitted" from "key present but
    // undefined" apart. `Object.keys` can: it only lists the call's own
    // enumerable keys, `options` included or not.
    const [args] = vi.mocked(auth.signInWithOAuth).mock.calls[0];
    expect(Object.keys(args)).toEqual(['provider']);
  });

  it('resolves error, never throws, when getSession reports an error', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'boom' } }),
    });

    await expect(beginGoogleSignIn(auth)).resolves.toEqual({ status: 'error', reason: 'boom' });
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  // This models a failure of the *pre-redirect* request GoTrue makes to issue
  // an authorize URL (a misconfigured provider, the auth service unreachable,
  // rate limiting) — not Google's real "identity already linked to another
  // user" conflict. That conflict cannot surface here: GoTrue only learns
  // which identity the player picked after they choose an account on
  // Google's own page and it redirects back, which is a fresh page load long
  // after this function's promise has already resolved `redirecting`. It
  // arrives as `error_code=identity_already_exists` on the *return* URL,
  // parsed by the Supabase client's own session-detection at that next page
  // load — read by `detectGoogleIdentityCollision` below, Step 13's addition.
  it('resolves error, never throws, when linkIdentity\'s pre-redirect request itself fails', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: EXISTING_SESSION }, error: null }),
      linkIdentity: vi.fn().mockResolvedValue({ data: null, error: { message: 'rate limited' } }),
    });

    await expect(beginGoogleSignIn(auth)).resolves.toEqual({
      status: 'error',
      reason: 'rate limited',
    });
  });

  it('resolves error, never throws, when signInWithOAuth fails', async () => {
    const auth = fakeAuth({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: { message: 'provider disabled' } }),
    });

    await expect(beginGoogleSignIn(auth)).resolves.toEqual({ status: 'error', reason: 'provider disabled' });
  });

  it('resolves error, never throws, when a collaborator call rejects', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockRejectedValue(new Error('offline')),
    });

    await expect(beginGoogleSignIn(auth)).resolves.toEqual({ status: 'error', reason: 'offline' });
  });
});

describe('signOutOfSession', () => {
  it('resolves unconfigured and calls nothing when the client is null', async () => {
    await expect(signOutOfSession(null)).resolves.toEqual({ status: 'unconfigured' });
  });

  it('resolves signed-out on success', async () => {
    const auth = fakeAuth();

    await expect(signOutOfSession(auth)).resolves.toEqual({ status: 'signed-out' });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('resolves error, never throws, when signOut reports an error', async () => {
    const auth = fakeAuth({
      signOut: vi.fn().mockResolvedValue({ error: { message: 'network down' } }),
    });

    await expect(signOutOfSession(auth)).resolves.toEqual({ status: 'error', reason: 'network down' });
  });

  it('resolves error, never throws, when signOut rejects', async () => {
    const auth = fakeAuth({
      signOut: vi.fn().mockRejectedValue(new Error('offline')),
    });

    await expect(signOutOfSession(auth)).resolves.toEqual({ status: 'error', reason: 'offline' });
  });
});

describe('detectGoogleIdentityCollision', () => {
  it('resolves false and calls nothing when the client is null', async () => {
    await expect(detectGoogleIdentityCollision(null)).resolves.toBe(false);
  });

  it('resolves false when initialize reports no error (an ordinary boot, or a successful link)', async () => {
    const auth = fakeAuth();

    await expect(detectGoogleIdentityCollision(auth)).resolves.toBe(false);
  });

  it('resolves true when the return URL carried error_code=identity_already_exists', async () => {
    const auth = fakeAuth({
      initialize: vi.fn().mockResolvedValue({
        error: { message: 'Identity is already linked to another user.', details: { code: 'identity_already_exists' } },
      }),
    });

    await expect(detectGoogleIdentityCollision(auth)).resolves.toBe(true);
  });

  it('resolves false for an unrelated initialize error, rather than treating every error as a collision', async () => {
    const auth = fakeAuth({
      initialize: vi.fn().mockResolvedValue({
        error: { message: 'Reused magic link.', details: { code: 'identity_not_found' } },
      }),
    });

    await expect(detectGoogleIdentityCollision(auth)).resolves.toBe(false);
  });

  it('resolves false, never throws, when initialize rejects', async () => {
    const auth = fakeAuth({
      initialize: vi.fn().mockRejectedValue(new Error('offline')),
    });

    await expect(detectGoogleIdentityCollision(auth)).resolves.toBe(false);
  });
});

describe('beginGoogleAccountSwitch', () => {
  it('resolves unconfigured and calls nothing when the client is null', async () => {
    await expect(beginGoogleAccountSwitch(null)).resolves.toEqual({ status: 'unconfigured' });
  });

  it('always calls signInWithOAuth, never linkIdentity, even though a guest session exists', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: EXISTING_SESSION }, error: null }),
    });

    await expect(beginGoogleAccountSwitch(auth, REDIRECT_ORIGIN)).resolves.toEqual({ status: 'redirecting' });

    expect(auth.signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      provider: 'google',
      options: { redirectTo: REDIRECT_ORIGIN },
    });
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    // Never even checks for an existing session — attempting to link again
    // would only reproduce the exact collision this function exists to
    // resolve.
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it('omits the options key entirely when no redirectTo is given', async () => {
    const auth = fakeAuth();

    await beginGoogleAccountSwitch(auth);

    const [args] = vi.mocked(auth.signInWithOAuth).mock.calls[0];
    expect(Object.keys(args)).toEqual(['provider']);
  });

  it('resolves error, never throws, when signInWithOAuth fails', async () => {
    const auth = fakeAuth({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: { message: 'rate limited' } }),
    });

    await expect(beginGoogleAccountSwitch(auth)).resolves.toEqual({ status: 'error', reason: 'rate limited' });
  });

  it('resolves error, never throws, when a collaborator call rejects', async () => {
    const auth = fakeAuth({
      signInWithOAuth: vi.fn().mockRejectedValue(new Error('offline')),
    });

    await expect(beginGoogleAccountSwitch(auth)).resolves.toEqual({ status: 'error', reason: 'offline' });
  });
});
