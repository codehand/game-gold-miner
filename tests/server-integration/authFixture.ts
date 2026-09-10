/**
 * Server-milestone Step 7: "Fix the fixture pattern for an authenticated
 * caller." Every integration test that needs to call an Edge Function as a
 * signed-in user mints a token here instead of hand-rolling a JWT inline —
 * which is what Step 5's evidence-gathering did, ad hoc, before this existed.
 *
 * `FIXTURE_USER_ID` and `FIXTURE_DISPLAY_NAME` match the guest
 * `supabase/seed.sql` inserts into `auth.users` and `profiles` on every
 * `supabase db reset`, so a token minted here authenticates as a real row in
 * the local database, not a fabricated identity RLS would reject.
 *
 * `LOCAL_JWT_SECRET` is the Supabase CLI's fixed default local-development
 * secret — the same for every local stack anyone runs, printed verbatim by
 * `npx supabase status` (`JWT_SECRET`), and not a value the real deployed
 * project will ever use. It is not a secret this repository is protecting.
 */
import { createHmac } from 'node:crypto';

export const FIXTURE_USER_ID = '11111111-1111-1111-1111-111111111111';
export const FIXTURE_DISPLAY_NAME = 'Dev Guest';

const LOCAL_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

/**
 * The Supabase CLI's fixed default local `anon` key — a JWT signed with
 * `LOCAL_JWT_SECRET` above, printed verbatim by `npx supabase status` for
 * every local stack anyone runs. Required by Kong's `apikey` check on
 * `/rest/v1/*` in addition to a caller's own bearer token; like
 * `LOCAL_JWT_SECRET`, it is not a value the real deployed project will ever
 * use.
 */
export const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Deliberately no local `service_role` key here, even the CLI's harmless
// fixed local-dev one: `tests/unit/server-stack.test.ts`'s "no privileged
// credential in any tracked file" scan flags any JWT whose payload declares
// `role: service_role`, anywhere in a tracked file, with no exceptions — and
// it should stay that way, since carving one out here would be exactly the
// kind of allowance that later hides a real one.

function base64UrlEncode(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface MintTokenOptions {
  /** Defaults to the seeded fixture guest; override to mint a token for a different id (e.g. to prove cross-user isolation). */
  readonly userId?: string;
  readonly expiresInSeconds?: number;
}

/**
 * Mints an HS256 JWT shaped like the one Supabase Auth issues for a real
 * session — `sub`, `role: authenticated`, `aud: authenticated`, an
 * expiry — signed with the local stack's fixed secret. Verified against the
 * real GoTrue/PostgREST services this repository's Edge Functions call, not
 * merely decoded locally.
 */
export function mintFixtureUserToken(options: MintTokenOptions = {}): string {
  const { userId = FIXTURE_USER_ID, expiresInSeconds = 3600 } = options;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', LOCAL_JWT_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${headerPart}.${payloadPart}.${signature}`;
}

/** A syntactically well-formed but wrongly-signed token, for testing rejection. */
export function mintTokenSignedWithWrongSecret(): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: FIXTURE_USER_ID,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', 'a-completely-different-secret-value')
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${headerPart}.${payloadPart}.${signature}`;
}
