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
 * rejection here. `src/main.ts` immediately hands that return to
 * `signInWithOAuth`, so the player reaches the existing Google account in one
 * visible sign-in flow instead of having to click a second time.
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
  /**
   * Server-milestone Step 13: the SDK's own `initializePromise`, memoized on
   * the client instance. Calling it again after `getSession()`/boot has
   * already triggered it costs nothing — it returns the same cached result —
   * which is exactly how the collision below is read: whatever the *first*
   * call already resolved, reflecting whether this page load's URL carried
   * `error_code=identity_already_exists` from a failed `linkIdentity`
   * redirect.
   */
  initialize(): Promise<{ error: unknown }>;
}

export type GoogleSignInResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'redirecting' }
  | { readonly status: 'error'; readonly reason: string };

export type SignOutResult =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'error'; readonly reason: string };

export interface GoogleIdentityReturnError {
  readonly code: string;
  readonly description: string | null;
}

/**
 * Reads the OAuth error that Supabase places in either the query string or
 * hash when the provider flow returns to the app. The helper accepts an href
 * so the redirect contract is testable without a browser global.
 */
export function readGoogleIdentityReturnError(
  href: string,
): GoogleIdentityReturnError | null {
  try {
    const url = new URL(href);
    const parameterSets = [
      url.searchParams,
      new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash),
    ];

    for (const params of parameterSets) {
      const code = params.get('error_code') ?? params.get('error');
      if (code !== null) {
        return {
          code,
          description: params.get('error_description'),
        };
      }
    }
  } catch {
    // A malformed location must not prevent the account surface from opening.
  }

  return null;
}

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

/**
 * Server-milestone Step 13: `identity_already_exists` is the one collision
 * `beginGoogleSignIn` cannot resolve itself — it can only be discovered
 * *after* the player has picked an account on Google's own page and the
 * browser has returned, a fresh page load long after that function's promise
 * already settled `redirecting`. `client.auth.initialize()` is the SDK's own
 * mechanism for surfacing exactly this: it parses the return URL's
 * `error_code`/`error_description` and resolves `{ error }` without ever
 * throwing or clearing the existing (still-guest) session — mirrored here
 * from the SDK's own internal check (`error.details?.code`), since there is
 * no higher-level named export for this constant. Never throws.
 */
export async function detectGoogleIdentityCollision(
  auth: GoogleAuthClient | null,
): Promise<boolean> {
  if (auth === null) {
    return false;
  }

  try {
    const { error } = await auth.initialize();
    const details = (error as {
      code?: unknown;
      details?: { code?: unknown };
    } | null);

    return details?.code === 'identity_already_exists'
      || details?.details?.code === 'identity_already_exists';
  } catch {
    return false;
  }
}

/**
 * Server-milestone Step 13: the other half of resolving a collision — once
 * the player chooses "sign in as that account instead," this authenticates
 * as whichever account the Google identity actually belongs to, abandoning
 * the current guest session. Unlike `beginGoogleSignIn`, this always calls
 * `signInWithOAuth` (never `linkIdentity`), regardless of whether a session
 * already exists: attempting to link again would only reproduce the same
 * collision. A second, full Google consent round trip is unavoidable — GoTrue
 * never reveals *which* account the identity belongs to, so there is no
 * shortcut that skips re-authenticating as it. The local IndexedDB save is
 * untouched by this call (or by the session change it causes): it is keyed
 * to the device, not the account, which is exactly what lets the reconcile
 * that runs on the next boot (Step 17) compare it against whatever the
 * regained session's cloud save turns out to hold.
 */
export async function beginGoogleAccountSwitch(
  auth: GoogleAuthClient | null,
  redirectTo?: string,
): Promise<GoogleSignInResult> {
  if (auth === null) {
    return { status: 'unconfigured' };
  }

  try {
    const credentials: { provider: 'google'; options?: { redirectTo: string } } =
      redirectTo === undefined
        ? { provider: 'google' }
        : { provider: 'google', options: { redirectTo } };
    const { error } = await auth.signInWithOAuth(credentials);

    if (error) {
      return { status: 'error', reason: describeError(error) };
    }

    return { status: 'redirecting' };
  } catch (error) {
    return { status: 'error', reason: describeError(error) };
  }
}
