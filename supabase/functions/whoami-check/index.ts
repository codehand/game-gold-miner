/**
 * `whoami-check` Edge Function — server-milestone Step 7.
 *
 * Not part of the save-sync protocol. This is Step 7's "trivial authenticated
 * endpoint": it verifies a caller's bearer token against Supabase Auth, then
 * reads that caller's own `profiles` row with their own token so row-level
 * security enforces "own row only" — the same shape every real authenticated
 * route from Step 9 onward will need. It exists to be copied from as much as
 * to pass its own test.
 *
 * `handleWhoAmI` takes caller resolution as an injected collaborator instead
 * of calling Supabase Auth/PostgREST itself, so `index.test.ts` can exercise
 * every response this route gives — missing token, rejected token, resolved
 * caller — with zero permissions and no live database. The one real
 * collaborator, `resolveCallerViaSupabaseAuth`, is exercised only by
 * `tests/server-integration/whoami.integration.test.ts`, against the actual
 * running stack: that split is "the fixture pattern for an authenticated
 * caller" this step establishes, and `tests/server-integration/authFixture.ts`
 * is what mints the token that test uses.
 *
 * `verify_jwt = false` at the platform level, same reasoning as `save-sync`'s
 * health route: verification happens by hand inside the handler, which is the
 * pattern `save-sync`'s own authenticated routes need from Step 16 onward, so
 * platform-level verification here would just be a second, redundant check
 * exercising a different code path than the one that matters.
 *
 * The npm specifier below is pinned to an exact version, not `@2`. Locally,
 * `deno test`/`supabase start` resolve it from this repository's own
 * `node_modules` (byonm — Deno detected `package.json` at the workspace
 * root), which pins it to whatever `package.json`'s `@supabase/supabase-js`
 * devDependency resolves to. A deployed function has no such `node_modules`
 * and would otherwise let Deno fetch "latest matching `2`" from the npm
 * registry at deploy time — a version the local unit tests never ran
 * against. Pinning here removes that skew: keep this version and
 * `package.json`'s devDependency version identical — `tests/unit/server-stack.test.ts`
 * asserts the two match, so a future edit to either one alone fails CI rather
 * than depending on someone remembering by hand.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import { errorResponse, jsonResponse } from '../_shared/http.ts';

export interface WhoAmIResult {
  readonly userId: string;
  readonly displayName: string | null;
}

export type ResolveCaller = (bearerToken: string) => Promise<WhoAmIResult | null>;

/** Extracts the token from `Authorization: Bearer <token>`, or null if absent/malformed. */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match === null ? null : match[1];
}

export async function handleWhoAmI(
  request: Request,
  resolveCaller: ResolveCaller,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
      detail: { method: request.method },
    });
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.');
  }

  const result = await resolveCaller(token);
  if (result === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.');
  }

  return jsonResponse(200, result);
}

/**
 * Verifies the token against Supabase Auth and reads the caller's own
 * `profiles` row. The client is scoped to the caller's own token — not the
 * anon key alone — so every request it makes, `auth.getUser` included,
 * carries the caller's identity and row-level security applies exactly as it
 * would for a real client.
 *
 * Throws, rather than returning `null`, when the function's own environment
 * is not configured. `null` means "this specific token is not valid," which
 * `handleWhoAmI` answers `401 unauthenticated` — the correct response to give
 * a caller whose credential is bad. A missing `SUPABASE_URL`/`SUPABASE_ANON_KEY`
 * is not the caller's fault at all: it means this deployment is broken, and
 * every caller, with a token good or bad, would get the identical 401. A
 * client that treats 401 as "sign out and re-authenticate" — the ordinary,
 * reasonable reading of that code — would sign every user out in a loop
 * against a database that never had anything wrong with it, exactly the
 * failure mode `save-sync`'s own `probeDatabase`/`handleHealth` already avoid
 * by keeping "misconfigured" and "unreachable" distinct from each other and
 * from a real per-caller rejection. The thrown error propagates out of
 * `handleWhoAmI` (which does not catch it) to the `Deno.serve` wrapper below,
 * which turns it into `500 server_error` — the code that tells a caller
 * "retrying with the same token will not help, and it is not about you."
 */
async function resolveCallerViaSupabaseAuth(bearerToken: string): Promise<WhoAmIResult | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('whoami-check: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(bearerToken);
  if (userError || !userData.user) {
    return null;
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('display_name')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    // Not fatal to the response: the caller is genuinely authenticated even
    // if their profile row cannot be read for some reason, and `displayName`
    // is allowed to be null already (a profile with none set).
    console.error('whoami-check: profile lookup failed.', profileError);
  }

  return { userId: userData.user.id, displayName: profile?.display_name ?? null };
}

if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleWhoAmI(request, resolveCallerViaSupabaseAuth);
    } catch (error) {
      console.error('whoami-check: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Unhandled error.');
    }
  });
}
