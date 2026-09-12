/**
 * Server-milestone Step 10: attaching Google to the guest session Step 8
 * already established.
 *
 * `GoogleAuthClient` is the same narrow-injected-collaborator shape
 * `GuestAuthClient` in `guestSession.ts` uses, so unit tests fake this
 * interface instead of mocking the SDK. The step's own requirement — "a
 * signed-in guest must be able to attach Google to the account they already
 * have, keeping the same user id, rather than creating a second one" — is
 * exactly the difference between `linkIdentity` (attaches a new identity to
 * the *current* session's user) and `signInWithOAuth` (resolves to whichever
 * `auth.users` row that Google identity already belongs to, minting a fresh
 * one if none exists yet): `beginGoogleSignIn` calls `linkIdentity` whenever
 * a session already exists, and `signInWithOAuth` only when there is none.
 *
 * Both calls navigate the whole browser away to Google's consent page on
 * success (the SDK does this itself unless `skipBrowserRedirect` is set), so
 * this module's return value only ever describes the *pre-redirect* outcome
 * — `redirecting` once GoTrue has issued an authorize URL and the browser is
 * about to navigate to it, or a reason that initial request itself failed
 * (a misconfigured provider, the auth service unreachable, rate limiting).
 *
 * **What this does not, and cannot, resolve:** whether the Google identity
 * the player ends up picking already belongs to a different `auth.users`
 * row. GoTrue cannot know that until the player has chosen an account on
 * Google's own page and Google redirects back with an authorization code —
 * a full page reload, long after this function's promise already settled.
 * That later failure surfaces as `error`/`error_code=identity_already_exists`
 * query/hash parameters on the *return* URL, which the Supabase client
 * parses during its own session-detection at the next page load, not as a
 * rejection here. Nothing in `src/` reads those parameters yet — doing so
 * (or subscribing to `onAuthStateChange`) is what Step 13's collision
 * handling requires, not this function.
 *
 * Like `ensureGuestSession`, this never throws: a misconfigured provider or
 * a rejected pre-redirect request must not crash the game, only leave the
 * trigger available to try again.
 */

import { describeError } from '../describeError';

/** The narrow slice of `SupabaseClient['auth']` this module depends on. */
export interface GoogleAuthClient {
  getSession(): Promise<{
    // Only nullness is read — the shape of a real session is irrelevant here.
    data: { session: unknown };
    error: unknown;
  }>;
  linkIdentity(credentials: {
    provider: 'google';
    options?: { redirectTo?: string };
  }): Promise<{ data: unknown; error: unknown }>;
  signInWithOAuth(credentials: {
    provider: 'google';
    options?: { redirectTo?: string };
  }): Promise<{ data: unknown; error: unknown }>;
  signOut(): Promise<{ error: unknown }>;
}

export type GoogleSignInResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'redirecting' }
  | { readonly status: 'error'; readonly reason: string };

export type SignOutResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'error'; readonly reason: string };

/**
 * Begins Google sign-in: links to the current session if one exists,
 * otherwise starts a fresh OAuth sign-in. Never throws.
 *
 * `redirectTo` should be the calling origin (`window.location.origin`) —
 * passed in rather than read from `window` here, so this stays callable
 * under Node in tests. Without it, GoTrue's default falls back to
 * `site_url`, which would silently bounce a player who opened the game at
 * `localhost:5173` back to `127.0.0.1:5173` (or vice versa) mid-flow,
 * leaving their pre-link session behind in the origin they actually started
 * from.
 */
export async function beginGoogleSignIn(
  auth: GoogleAuthClient | null,
  redirectTo?: string,
): Promise<GoogleSignInResult> {
  if (auth === null) {
    return { status: 'unconfigured' };
  }

  try {
    const { data: existing, error: getSessionError } = await auth.getSession();

    if (getSessionError) {
      return { status: 'error', reason: describeError(getSessionError) };
    }

    // Omits the `options` key entirely rather than setting it to `undefined`
    // — not just tidier, but the only way a caller (or a test) can tell
    // "no redirectTo was given" from "redirectTo was given as undefined"
    // apart, since an object spread with an `undefined` value still leaves
    // the key present.
    const credentials: { provider: 'google'; options?: { redirectTo: string } } =
      redirectTo === undefined
        ? { provider: 'google' }
        : { provider: 'google', options: { redirectTo } };
    const { error } =
      existing.session !== null
        ? await auth.linkIdentity(credentials)
        : await auth.signInWithOAuth(credentials);

    if (error) {
      return { status: 'error', reason: describeError(error) };
    }

    return { status: 'redirecting' };
  } catch (error) {
    return { status: 'error', reason: describeError(error) };
  }
}

/** Signs out of the current session, if any. Never throws. */
export async function signOutOfSession(
  auth: GoogleAuthClient | null,
): Promise<SignOutResult> {
  if (auth === null) {
    return { status: 'unconfigured' };
  }

  try {
    const { error } = await auth.signOut();

    if (error) {
      return { status: 'error', reason: describeError(error) };
    }

    return { status: 'signed-out' };
  } catch (error) {
    return { status: 'error', reason: describeError(error) };
  }
}
