/**
 * Server-milestone Step 14: the client half of the recovery code — "the only
 * mechanism in the plan that survives storage loss for an unlinked guest."
 *
 * `generateRecoveryCode` needs the caller's own current session (guest or
 * otherwise): a recovery code is issued to whoever is already signed in,
 * exactly the account it will later restore. `redeemRecoveryCode` needs no
 * session at all — recovering access *without* one is the entire point —
 * and completes the exchange with `auth.verifyOtp({token_hash, type:'email'})`,
 * the identical `generateLink`/`verifyOtp` pattern
 * `src/platform/telegram/telegramSignIn.ts` already established. Once that
 * resolves, `src/main.ts` runs the same `triggerCloudSaveReconcile()` every
 * other sign-in path already runs — the redeeming device's local save is
 * untouched by the session swap, so Step 17's collision flow applies exactly
 * as it would for a Google or Telegram sign-in, with no new logic needed
 * here for that part.
 *
 * Same never-throws, injected-collaborator shape as
 * `guestSession.ts`/`googleSignIn.ts`/`telegramSignIn.ts`: a network
 * failure, a misconfigured deployment, or a rejected call must not crash the
 * game, only leave the player exactly as they were.
 */
import { describeError } from '../describeError';

/** The narrow slice of `SupabaseClient['auth']` this module depends on. */
export interface RecoveryCodeAuthClient {
  getSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown;
  }>;
  verifyOtp(params: { token_hash: string; type: 'email' }): Promise<{ error: unknown }>;
}

export type GenerateRecoveryCodeResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'generated'; readonly code: string }
  | { readonly status: 'error'; readonly reason: string };

export type RedeemRecoveryCodeResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'redeemed' }
  | { readonly status: 'invalid-code' }
  | { readonly status: 'rate-limited' }
  | { readonly status: 'error'; readonly reason: string };

interface ErrorEnvelopeBody {
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

/**
 * Generates (or rotates) the caller's own recovery code, shown exactly once
 * — this module never persists it anywhere. Never throws.
 */
export async function generateRecoveryCode(
  auth: RecoveryCodeAuthClient | null,
  edgeFunctionUrl: string,
): Promise<GenerateRecoveryCodeResult> {
  if (auth === null) {
    return { status: 'unconfigured' };
  }

  try {
    const { data, error: sessionError } = await auth.getSession();
    if (sessionError) {
      return { status: 'error', reason: describeError(sessionError) };
    }
    if (data.session === null) {
      return { status: 'error', reason: 'no session to generate a recovery code for' };
    }

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${data.session.access_token}` },
    });
    const body = (await response.json().catch(() => null)) as
      | ({ readonly code?: unknown } & ErrorEnvelopeBody)
      | null;

    if (!response.ok) {
      const reason = typeof body?.error?.message === 'string' ? body.error.message : `HTTP ${response.status}`;
      return { status: 'error', reason };
    }
    if (typeof body?.code !== 'string') {
      return { status: 'error', reason: 'generate response carried no code' };
    }

    return { status: 'generated', code: body.code };
  } catch (error) {
    return { status: 'error', reason: describeError(error) };
  }
}

/**
 * Redeems a recovery code and completes the resulting session. Distinguishes
 * a wrong/already-used code and a rate limit from any other failure, so a
 * caller can tell "try a different code" from "something is broken" apart —
 * neither ever throws.
 */
export async function redeemRecoveryCode(
  code: string,
  edgeFunctionUrl: string,
  auth: RecoveryCodeAuthClient | null,
): Promise<RedeemRecoveryCodeResult> {
  if (auth === null) {
    return { status: 'unconfigured' };
  }

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = (await response.json().catch(() => null)) as
      | ({ readonly tokenHash?: unknown } & ErrorEnvelopeBody)
      | null;

    if (response.status === 429) {
      return { status: 'rate-limited' };
    }
    if (response.status === 401 && body?.error?.code === 'recovery_code_invalid') {
      return { status: 'invalid-code' };
    }
    if (!response.ok) {
      const reason = typeof body?.error?.message === 'string' ? body.error.message : `HTTP ${response.status}`;
      return { status: 'error', reason };
    }
    if (typeof body?.tokenHash !== 'string') {
      return { status: 'error', reason: 'redeem response carried no tokenHash' };
    }

    const { error } = await auth.verifyOtp({ token_hash: body.tokenHash, type: 'email' });
    if (error) {
      return { status: 'error', reason: describeError(error) };
    }

    return { status: 'redeemed' };
  } catch (error) {
    return { status: 'error', reason: describeError(error) };
  }
}
