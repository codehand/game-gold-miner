import type { SupabaseClient } from '@supabase/supabase-js';

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

function isLanDevHostname(hostname: string): boolean {
  const octets = hostname.split('.');
  return octets.length === 4
    && octets[0] === '192'
    && octets[1] === '168'
    && octets.slice(2).every((octet) => {
      const value = Number(octet);
      return Number.isInteger(value) && value >= 0 && value <= 255;
    });
}

/**
 * Keeps local Supabase reachable when the Vite page is opened from another
 * device on the developer's 192.168.x.x LAN. The checked-in local env uses
 * loopback for same-machine development; on a LAN page only the host changes,
 * while the API port and every deployed URL remain untouched.
 */
export function resolveSupabaseApiUrl(
  configuredUrl: string,
  pageHref: string | null,
): string {
  const normalized = configuredUrl.trim().replace(/\/$/, '');
  if (pageHref === null) {
    return normalized;
  }

  try {
    const apiUrl = new URL(normalized);
    const pageUrl = new URL(pageHref);
    if (
      apiUrl.protocol === 'http:'
      && pageUrl.protocol === 'http:'
      && LOOPBACK_HOSTNAMES.has(apiUrl.hostname)
      && pageUrl.port === '5173'
      && isLanDevHostname(pageUrl.hostname)
    ) {
      apiUrl.hostname = pageUrl.hostname;
      return apiUrl.toString().replace(/\/$/, '');
    }
  } catch {
    // Preserve the configured value; createClient will report malformed URLs.
  }

  return normalized;
}

export function getSupabaseApiUrl(): string | null {
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  return resolveSupabaseApiUrl(
    configuredUrl,
    typeof window === 'undefined' ? null : window.location.href,
  );
}

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
  const url = getSupabaseApiUrl();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, anonKey);
}

export type { SupabaseClient };
