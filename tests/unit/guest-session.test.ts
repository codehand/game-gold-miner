import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSupabaseClient,
  ensureGuestSession,
  type GuestAuthClient,
} from '../../src/platform/web';

const SESSION_A = {
  access_token: 'token-a',
  user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', is_anonymous: true },
};
const SESSION_B = {
  access_token: 'token-b',
  user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', is_anonymous: true },
};

function fakeAuth(overrides: Partial<GuestAuthClient> = {}): GuestAuthClient {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInAnonymously: vi.fn().mockResolvedValue({ data: { session: SESSION_A }, error: null }),
    ...overrides,
  };
}

describe('createSupabaseClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves null and attempts no network call when the project is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    await expect(createSupabaseClient()).resolves.toBeNull();
  });

  it('resolves null when only one of the two values is set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    await expect(createSupabaseClient()).resolves.toBeNull();
  });

  it('builds a real client once both values are set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    await expect(createSupabaseClient()).resolves.not.toBeNull();
  });
});

describe('ensureGuestSession', () => {
  it('resolves unconfigured and calls nothing when the client is null', async () => {
    await expect(ensureGuestSession(null)).resolves.toEqual({ status: 'unconfigured' });
  });

  it('reuses an existing session without signing in again', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: SESSION_B }, error: null }),
    });

    const result = await ensureGuestSession(auth);

    expect(result).toEqual({
      status: 'signed-in',
      accessToken: 'token-b',
      user: { id: SESSION_B.user.id, isAnonymous: true },
    });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when there is no existing session', async () => {
    const auth = fakeAuth();

    const result = await ensureGuestSession(auth);

    expect(result).toEqual({
      status: 'signed-in',
      accessToken: 'token-a',
      user: { id: SESSION_A.user.id, isAnonymous: true },
    });
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('resolves sign-in-failed, never throws, when getSession reports an error', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'boom' } }),
    });

    await expect(ensureGuestSession(auth)).resolves.toEqual({
      status: 'sign-in-failed',
      reason: 'boom',
    });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('resolves sign-in-failed, never throws, when signInAnonymously reports an error', async () => {
    const auth = fakeAuth({
      signInAnonymously: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: { message: 'network down' } }),
    });

    await expect(ensureGuestSession(auth)).resolves.toEqual({
      status: 'sign-in-failed',
      reason: 'network down',
    });
  });

  it('resolves sign-in-failed, never throws, when a collaborator call rejects', async () => {
    const auth = fakeAuth({
      getSession: vi.fn().mockRejectedValue(new Error('offline')),
    });

    await expect(ensureGuestSession(auth)).resolves.toEqual({
      status: 'sign-in-failed',
      reason: 'offline',
    });
  });

  // Token expiry and refresh are entirely the real SDK's job: `getSession()`
  // on the actual `SupabaseClient` already refreshes an expiring token before
  // returning it, or returns `null` if refresh failed, so nothing here
  // re-implements or second-guesses that — `ensureGuestSession` trusts
  // whatever session `getSession()` hands back, exactly as it does above for
  // a `null` session.

  it('reuses an existing linked (non-anonymous) session without treating it as a fresh guest', async () => {
    // Relevant from Step 9 onward, once a session can belong to a linked
    // provider identity rather than only an anonymous one.
    const linkedSession = {
      access_token: 'token-linked',
      user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', is_anonymous: false },
    };
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: linkedSession }, error: null }),
    });

    const result = await ensureGuestSession(auth);

    expect(result).toEqual({
      status: 'signed-in',
      accessToken: 'token-linked',
      user: { id: linkedSession.user.id, isAnonymous: false },
    });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('defaults isAnonymous to false when the session omits is_anonymous entirely', async () => {
    const sessionWithoutFlag = {
      access_token: 'token-no-flag',
      user: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    };
    const auth = fakeAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: sessionWithoutFlag }, error: null }),
    });

    const result = await ensureGuestSession(auth);

    expect(result).toEqual({
      status: 'signed-in',
      accessToken: 'token-no-flag',
      user: { id: sessionWithoutFlag.user.id, isAnonymous: false },
    });
  });
});
