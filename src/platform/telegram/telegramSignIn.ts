/**
 * Server-milestone Step 12: the client half of Telegram sign-in.
 *
 * "Inside Telegram this replaces the guest path entirely" — unlike Google
 * (Step 10), which attaches to a session `ensureGuestSession` already
 * established, Telegram sign-in is not a linking flow. `src/main.ts` calls
 * `readTelegramInitData()` before deciding whether to run the Step 8 guest
 * bootstrap at all: a non-null result means `signInWithTelegram` runs
 * instead, and the anonymous path never starts.
 *
 * `readTelegramInitData` reads `window.Telegram.WebApp.initData` — the raw,
 * **still-signed** string, never `initDataUnsafe` (that object is the
 * Telegram SDK's own convenience parse of the same data with no signature
 * check, trivially forgeable from devtools, and this module never touches
 * it). No Telegram Web App `<script>` tag is added to `index.html`: that is
 * the still-unbuilt "Mini App host" `memory-bank/server-threat-model.md`
 * finding F1 names as separate, later work, so `window.Telegram` is simply
 * absent for every player today and this always resolves `null` — the
 * anonymous guest path is unaffected until that host exists.
 *
 * `signInWithTelegram` POSTs the raw `initData` to the `telegram-sign-in`
 * Edge Function, which verifies it server-side and returns a `tokenHash`;
 * this module then calls `auth.verifyOtp({ token_hash, type: 'email' })` to
 * complete the same `generateLink`/`verifyOtp` session-minting exchange the
 * function's own doc comment explains. Same never-throws, typed-result
 * shape as `guestSession.ts`/`googleSignIn.ts` — a network failure, a
 * misconfigured deployment, or a rejected `initData` must not crash the
 * game, only leave the player on whatever identity state they already had.
 */

import { describeError } from '../describeError';

/** The narrow slice of `SupabaseClient['auth']` this module depends on. */
export interface TelegramAuthClient {
  verifyOtp(params: { token_hash: string; type: 'email' }): Promise<{ error: unknown }>;
}

export type TelegramSignInResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'signed-in' }
  | { readonly status: 'error'; readonly reason: string };

/**
 * Reads the raw, signed `initData` string Telegram's own Mini App SDK
 * exposes, or `null` when not running inside one (every player today,
 * until the Mini App host exists — see the module doc comment).
 */
export function readTelegramInitData(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const telegramWindow = window as unknown as {
    Telegram?: { WebApp?: { initData?: unknown } };
  };
  const initData = telegramWindow.Telegram?.WebApp?.initData;

  return typeof initData === 'string' && initData !== '' ? initData : null;
}

interface TelegramSignInResponseBody {
  readonly tokenHash?: unknown;
  readonly error?: { readonly message?: unknown };
}

/**
 * Verifies `initData` against the `telegram-sign-in` Edge Function and
 * completes the resulting session. Never throws.
 */
export async function signInWithTelegram(
  initData: string,
  edgeFunctionUrl: string,
  auth: TelegramAuthClient | null,
): Promise<TelegramSignInResult> {
  if (auth === null) {
    return { status: 'unconfigured' };
  }

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });

    const body = (await response.json().catch(() => null)) as TelegramSignInResponseBody | null;

    if (!response.ok) {
      const reason =
        typeof body?.error?.message === 'string' ? body.error.message : `HTTP ${response.status}`;
      return { status: 'error', reason };
    }
    if (typeof body?.tokenHash !== 'string') {
      return { status: 'error', reason: 'sign-in response carried no tokenHash' };
    }

    const { error } = await auth.verifyOtp({ token_hash: body.tokenHash, type: 'email' });
    if (error) {
      return { status: 'error', reason: describeError(error) };
    }

    return { status: 'signed-in' };
  } catch (error) {
    return { status: 'error', reason: describeError(error) };
  }
}
