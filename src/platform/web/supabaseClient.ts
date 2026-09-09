import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Builds the browser's Supabase client, or resolves `null` without attempting
 * any network call — and, when unconfigured, without even downloading the
 * SDK.
 *
 * Server-milestone Step 8 is the first point where `src/` talks to the
 * network at all, and the client-only build this milestone extends must stay
 * exactly as playable as it is today for a checkout with no `.env.local` —
 * `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are the public pair
 * `.env.example` documents and `scan:secrets` permits into the bundle, and a
 * missing or blank value here means "no backend configured," not "backend
 * unreachable." `guestSession.ts` treats a `null` client the same way it
 * treats a client that failed to sign in: the game keeps playing and saving
 * locally either way.
 *
 * `@supabase/supabase-js` is dynamically imported rather than imported at the
 * top of this module: a static import ships it inside the same critical
 * chunk `main.ts` itself loads in, so its parse/eval cost would sit in front
 * of `createGame`'s own boot every time, configured or not — the same "must
 * never delay the first frame" rule this step already applies to the network
 * call itself, extended to the bundle's parse cost. A 2026-09-09 review
 * measured the gzip cost of the alternative (a static import) at +58 KB on
 * the single entry chunk before this fix.
 */
export async function createSupabaseClient(): Promise<SupabaseClient | null> {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, anonKey);
}

export type { SupabaseClient };
