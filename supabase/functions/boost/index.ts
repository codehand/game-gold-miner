import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
} from '../_shared/http.ts';

export interface BoostDeps {
  readonly resolveCaller: (token: string) => Promise<string | null>;
  readonly readBoost: (userId: string) => Promise<number | null>;
  /** Returns the new server timestamp, or null when still on cooldown. */
  readonly activate: (userId: string) => Promise<number | null>;
}

export async function handleBoostRequest(request: Request, deps: BoostDeps): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return corsPreflightResponse(request, 'GET, POST, OPTIONS');

  // Kong may forward either the full platform path or the function-relative path.
  const route = new URL(request.url).pathname
    .replace(/^\/(?:functions\/v1\/)?boost(?=\/|$)/, '');
  if (!((route === '/v1/status' && request.method === 'GET') ||
    (route === '/v1/activate' && request.method === 'POST'))) {
    return errorResponse(400, 'malformed_request', 'Unknown Boost route.', { origin });
  }

  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer (\S+)$/i);
  if (match === null || match === undefined) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }
  const userId = await deps.resolveCaller(match[1]);
  if (userId === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid bearer token.', { origin });
  }

  const activatedAtMs = route === '/v1/activate'
    ? await deps.activate(userId)
    : null;
  const lastActivatedAtMs = activatedAtMs ?? await deps.readBoost(userId);
  return jsonResponse(200, {
    kind: route === '/v1/activate'
      ? activatedAtMs === null ? 'cooldown' : 'activated'
      : 'status',
    boost: { lastActivatedAtMs },
    serverNowMs: Date.now(),
  }, origin);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`boost: ${name} is not configured.`);
  return value;
}

function serviceClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

async function resolveCaller(token: string): Promise<string | null> {
  const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function readBoost(userId: string): Promise<number | null> {
  const { data, error } = await serviceClient()
    .from('mine_boosts')
    .select('last_activated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Boost status read failed: ${error.message}`);
  return data === null ? null : Date.parse(data.last_activated_at);
}

async function activate(userId: string): Promise<number | null> {
  const { data, error } = await serviceClient().rpc('activate_mine_boost', { p_user_id: userId });
  if (error) throw new Error(`Boost activation failed: ${error.message}`);
  return data === null ? null : Date.parse(data);
}

if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleBoostRequest(request, { resolveCaller, readBoost, activate });
    } catch (error) {
      console.error('boost: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Boost service unavailable.', {
        origin: request.headers.get('origin'),
      });
    }
  });
}
