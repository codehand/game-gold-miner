/**
 * `entitlement-check` Edge Function — server-milestone Step 31.
 *
 * Entitlements are deliberately read through a client scoped to the caller's
 * bearer token. The table's RLS policy admits only that user's active rows,
 * while the absence of any INSERT/UPDATE/DELETE policy keeps the client from
 * manufacturing or changing an entitlement through PostgREST. The service
 * role is intentionally not used here: server-side grant paths (the later
 * payment milestone, or test setup) write the table, and this function only
 * exposes the resulting server decision and effect.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
} from '../_shared/http.ts';

export const SUPPORTER_BADGE_ENTITLEMENT = 'cosmetic.supporter_badge' as const;

export interface EntitlementView {
  readonly key: typeof SUPPORTER_BADGE_ENTITLEMENT;
  readonly grantedAt: string;
  readonly source: string | null;
}

export interface EntitlementEffects {
  readonly supporterBadge: boolean;
}

export interface EntitlementCheckResult {
  readonly entitlements: readonly EntitlementView[];
  readonly effects: EntitlementEffects;
}

export type ReadActiveEntitlements = (
  bearerToken: string,
) => Promise<EntitlementCheckResult | null>;

/** Extracts the token from `Authorization: Bearer <token>`, or null if absent/malformed. */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match === null ? null : match[1];
}

/** Converts the server-owned entitlement set into the effect flags the client may render. */
export function deriveEntitlementEffects(
  entitlements: readonly Pick<EntitlementView, 'key'>[],
): EntitlementEffects {
  return {
    supporterBadge: entitlements.some(
      ({ key }) => key === SUPPORTER_BADGE_ENTITLEMENT,
    ),
  };
}

export async function handleEntitlementCheck(
  request: Request,
  readActiveEntitlements: ReadActiveEntitlements,
): Promise<Response> {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return corsPreflightResponse(request, 'GET, HEAD, OPTIONS');
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
      detail: { method: request.method },
      origin,
    });
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const result = await readActiveEntitlements(token);
  if (result === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  return jsonResponse(200, result, origin);
}

interface SupabaseEntitlementRow {
  readonly entitlement_key: string;
  readonly granted_at: string;
  readonly source: string | null;
}

function toEntitlementView(row: SupabaseEntitlementRow): EntitlementView | null {
  if (row.entitlement_key !== SUPPORTER_BADGE_ENTITLEMENT) {
    return null;
  }

  return {
    key: SUPPORTER_BADGE_ENTITLEMENT,
    grantedAt: row.granted_at,
    source: typeof row.source === 'string' ? row.source : null,
  };
}

/**
 * Verifies the caller with GoTrue, then reads only active entitlement rows
 * through that same caller token. A missing function configuration throws so
 * the outer wrapper returns `server_error` rather than misreporting a healthy
 * user's token as `unauthenticated`.
 */
async function readActiveEntitlementsViaSupabaseAuth(
  bearerToken: string,
): Promise<EntitlementCheckResult | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'entitlement-check: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.',
    );
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(bearerToken);
  if (userError || !userData.user) {
    return null;
  }

  const { data, error } = await client
    .from('entitlements')
    .select('entitlement_key, granted_at, source')
    .eq('user_id', userData.user.id)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false });

  if (error) {
    throw new Error(`entitlement-check: entitlement lookup failed: ${error.message}`);
  }

  const entitlements = (data as SupabaseEntitlementRow[])
    .map(toEntitlementView)
    .filter((entitlement): entitlement is EntitlementView => entitlement !== null);

  return {
    entitlements,
    effects: deriveEntitlementEffects(entitlements),
  };
}

if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleEntitlementCheck(request, readActiveEntitlementsViaSupabaseAuth);
    } catch (error) {
      console.error('entitlement-check: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Unhandled error.', {
        origin: request.headers.get('origin'),
      });
    }
  });
}
