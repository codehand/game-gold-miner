import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readTelegramInitData,
  signInWithTelegram,
  type TelegramAuthClient,
} from '../../src/platform/telegram';

const EDGE_FUNCTION_URL = 'http://127.0.0.1:54321/functions/v1/telegram-sign-in';

function fakeAuth(overrides: Partial<TelegramAuthClient> = {}): TelegramAuthClient {
  return {
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readTelegramInitData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves null when window does not exist (Node, and every non-Telegram player)', () => {
    expect(readTelegramInitData()).toBeNull();
  });

  it('resolves null when window.Telegram is absent — every player today, with no Mini App host yet', () => {
    vi.stubGlobal('window', {});
    expect(readTelegramInitData()).toBeNull();
  });

  it('resolves null when initData is present but empty', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: '' } } });
    expect(readTelegramInitData()).toBeNull();
  });

  it('resolves the raw initData string when a Mini App host provides one', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'auth_date=1&hash=abc' } } });
    expect(readTelegramInitData()).toBe('auth_date=1&hash=abc');
  });
});

describe('signInWithTelegram', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves unconfigured and calls no network when auth is null', async () => {
    await expect(signInWithTelegram('init-data', EDGE_FUNCTION_URL, null)).resolves.toEqual({
      status: 'unconfigured',
    });
  });

  it('posts the raw initData and completes the session on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { tokenHash: 'fixture-hash' }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = fakeAuth();

    await expect(signInWithTelegram('init-data', EDGE_FUNCTION_URL, auth)).resolves.toEqual({
      status: 'signed-in',
    });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: 'init-data' }),
    });
    expect(auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({
      token_hash: 'fixture-hash',
      type: 'email',
    });
  });

  it('resolves error, never throws, when the function rejects with a message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, { error: { code: 'unauthenticated', message: 'bad signature' } }),
      ),
    );
    const auth = fakeAuth();

    await expect(signInWithTelegram('init-data', EDGE_FUNCTION_URL, auth)).resolves.toEqual({
      status: 'error',
      reason: 'bad signature',
    });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('falls back to an HTTP status reason when the failure body is unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500 })));

    await expect(signInWithTelegram('init-data', EDGE_FUNCTION_URL, fakeAuth())).resolves.toEqual({
      status: 'error',
      reason: 'HTTP 500',
    });
  });

  it('resolves error when a 200 response carries no tokenHash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})));

    const result = await signInWithTelegram('init-data', EDGE_FUNCTION_URL, fakeAuth());

    expect(result.status).toBe('error');
  });

  it('resolves error, never throws, when verifyOtp itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { tokenHash: 'fixture-hash' })));
    const auth = fakeAuth({ verifyOtp: vi.fn().mockResolvedValue({ error: { message: 'expired' } }) });

    await expect(signInWithTelegram('init-data', EDGE_FUNCTION_URL, auth)).resolves.toEqual({
      status: 'error',
      reason: 'expired',
    });
  });

  it('resolves error, never throws, when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(signInWithTelegram('init-data', EDGE_FUNCTION_URL, fakeAuth())).resolves.toEqual({
      status: 'error',
      reason: 'offline',
    });
  });
});
