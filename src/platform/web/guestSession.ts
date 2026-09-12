/**
 * Server-milestone Step 8: an anonymous guest session credential.
 *
 * `ensureGuestSession` takes only the slice of `SupabaseClient['auth']` this
 * step needs — `GuestAuthClient` below — rather than the whole client, so
 * unit tests inject a fake collaborator instead of mocking the SDK. This is
 * the same shape as `ResolveCaller` in `supabase/functions/whoami-check/index.ts`
 * and `LifecycleEventTarget` in `bindSaveLifecycle.ts`: the one real
 * implementation is exercised by the Docker-backed server-e2e suite
 * (`tests/server-e2e/guest-session.spec.ts`), never by the Docker-free unit
 * suite.
 *
 * This never throws. A guest session is a convenience the milestone is
 * building toward, not a requirement of today's client-only game: a network
 * failure, a misconfigured deployment, or no Supabase project at all must
 * leave the mine exactly as playable as it always has been, so every failure
 * mode resolves to `sign-in-failed` or `unconfigured` instead of rejecting.
 */

import { describeError } from '../describeError';

export interface GuestSessionUser {
  readonly id: string;
  readonly isAnonymous: boolean;
}

export interface GuestSessionToken {
  readonly accessToken: string;
  readonly user: GuestSessionUser;
}

/** The narrow slice of `SupabaseClient['auth']` this module depends on. */
export interface GuestAuthClient {
  getSession(): Promise<{
    data: { session: { access_token: string; user: { id: string; is_anonymous?: boolean } } | null };
    error: unknown;
  }>;
  signInAnonymously(): Promise<{
    data: { session: { access_token: string; user: { id: string; is_anonymous?: boolean } } | null };
    error: unknown;
  }>;
}

export type GuestSessionResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'sign-in-failed'; readonly reason: string }
  | ({ readonly status: 'signed-in' } & GuestSessionToken);

function toSignedIn(session: {
  access_token: string;
  user: { id: string; is_anonymous?: boolean };
}): GuestSessionResult {
  return {
    status: 'signed-in',
    accessToken: session.access_token,
    user: { id: session.user.id, isAnonymous: session.user.is_anonymous ?? false },
  };
}

/**
 * Resolves an existing guest session, or mints one through anonymous
 * sign-in. `auth` is `null` when no Supabase project is configured
 * (`createSupabaseClient` returned `null`) — resolved immediately as
 * `unconfigured`, with no call made at all.
 */
export async function ensureGuestSession(
  auth: GuestAuthClient | null,
): Promise<GuestSessionResult> {
  if (auth === null) {
    return { status: 'unconfigured' };
  }

  try {
    const { data: existing, error: getSessionError } = await auth.getSession();

    if (getSessionError) {
      return { status: 'sign-in-failed', reason: describeError(getSessionError) };
    }
    if (existing.session !== null) {
      return toSignedIn(existing.session);
    }

    const { data: minted, error: signInError } = await auth.signInAnonymously();

    if (signInError || minted.session === null) {
      return {
        status: 'sign-in-failed',
        reason: signInError ? describeError(signInError) : 'no session returned',
      };
    }

    return toSignedIn(minted.session);
  } catch (error) {
    return { status: 'sign-in-failed', reason: describeError(error) };
  }
}
