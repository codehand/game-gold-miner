/**
 * `account-delete` Edge Function — server-milestone Step 33.
 *
 * The caller's bearer token is resolved first. The request body is ignored on
 * purpose: the only account that can be deleted is the account represented by
 * that verified token. The service-role RPC performs audit anonymization and
 * auth.users deletion in one database transaction, allowing the existing
 * foreign-key cascades to remove every ordinary application row.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
} from '../_shared/http.ts';

export interface AccountDeleteCaller {
  readonly userId: string;
}

export type ResolveCaller = (bearerToken: string) => Promise<AccountDeleteCaller | null>;
export type DeleteAccount = (userId: string) => Promise<void>;

/** Extracts a bearer token without accepting a client-supplied account id. */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match === null ? null : match[1];
}

export async function handleAccountDelete(
  request: Request,
  resolveCaller: ResolveCaller,
  deleteAccount: DeleteAccount,
): Promise<Response> {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return corsPreflightResponse(request, 'POST, OPTIONS');
  }

  if (request.method !== 'POST') {
    return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
      detail: { method: request.method },
      origin,
    });
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const caller = await resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  await deleteAccount(caller.userId);
  return jsonResponse(200, { deleted: true }, origin);
}

async function resolveCallerViaSupabaseAuth(
  bearerToken: string,
): Promise<AccountDeleteCaller | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('account-delete: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(bearerToken);
  if (error || !data.user) {
    return null;
  }

  return { userId: data.user.id };
}

async function deleteAccountViaRpc(userId: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('account-delete: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.rpc('delete_account', { p_user_id: userId });
  if (error) {
    throw new Error(`account-delete: delete_account RPC failed: ${error.message}`);
  }
}

if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleAccountDelete(
        request,
        resolveCallerViaSupabaseAuth,
        deleteAccountViaRpc,
      );
    } catch (error) {
      console.error('account-delete: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Unhandled error.', {
        origin: request.headers.get('origin'),
      });
    }
  });
}
