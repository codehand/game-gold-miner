import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
} from '../_shared/http.ts';

export interface BoostDeps {
  readonly resolveCaller: (token: string) => Promise<string | null>;
  readonly readBoost: (userId: string) => Promise<BoostRecord>;
  readonly activate: (userId: string, command: BoostCommand) => Promise<BoostActivation>;
}

interface BoostRecord {
  readonly lastActivatedAtMs: number | null;
  readonly mineId: string | null;
}

interface BoostCommand {
  readonly mineId: string;
  readonly baseRevision: number;
  readonly idempotencyKey: string;
}

type BoostActivation = {
  readonly kind: 'activated' | 'cooldown';
  readonly boost: BoostRecord;
  readonly saveRevision: number;
} | {
  readonly kind: 'rejected';
  readonly code: 'revision_conflict' | 'missing_save' | 'mine_not_active' | 'key_reused';
  readonly serverRevision?: number;
};

const MINE_IDS = new Set(['gold', 'amethyst', 'ruby', 'sapphire', 'emerald', 'diamond']);

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

  if (route === '/v1/status') {
    const boost = await deps.readBoost(userId);
    return jsonResponse(200, {
      kind: 'status',
      boost: { lastActivatedAtMs: boost.lastActivatedAtMs },
      boostMineId: boost.mineId,
      serverNowMs: Date.now(),
    }, origin);
  }

  const command = await readCommand(request);
  if (command === null) {
    return errorResponse(400, 'malformed_request', 'Invalid Boost command.', { origin });
  }
  const activated = await deps.activate(userId, command);
  if (activated.kind === 'rejected') {
    return errorResponse(409, activated.code, 'Boost activation could not be applied.', {
      detail: activated.serverRevision === undefined
        ? undefined : { serverRevision: activated.serverRevision },
      origin,
    });
  }
  return jsonResponse(200, {
    kind: activated.kind,
    boost: { lastActivatedAtMs: activated.boost.lastActivatedAtMs },
    boostMineId: activated.boost.mineId,
    saveRevision: activated.saveRevision,
    serverNowMs: Date.now(),
  }, origin);
}

async function readCommand(request: Request): Promise<BoostCommand | null> {
  try {
    const body = await request.json() as Partial<BoostCommand>;
    return typeof body.mineId === 'string' && MINE_IDS.has(body.mineId) &&
      typeof body.baseRevision === 'number' && Number.isSafeInteger(body.baseRevision) &&
      body.baseRevision > 0 &&
      typeof body.idempotencyKey === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotencyKey)
      ? body as BoostCommand : null;
  } catch {
    return null;
  }
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

async function readBoost(userId: string): Promise<BoostRecord> {
  const { data, error } = await serviceClient()
    .from('mine_boosts')
    .select('last_activated_at, mine_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Boost status read failed: ${error.message}`);
  return data === null
    ? { lastActivatedAtMs: null, mineId: null }
    : { lastActivatedAtMs: Date.parse(data.last_activated_at), mineId: data.mine_id };
}

async function activate(userId: string, command: BoostCommand): Promise<BoostActivation> {
  const fingerprint = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`boost\n${command.mineId}\n${command.baseRevision}`),
  ).then((value) => [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join(''));
  const { data, error } = await serviceClient().rpc('activate_portfolio_mine_boost', {
    p_user_id: userId,
    p_mine_id: command.mineId,
    p_base_revision: command.baseRevision,
    p_idempotency_key: command.idempotencyKey,
    p_fingerprint: fingerprint,
  });
  if (error) throw new Error(`Boost activation failed: ${error.message}`);
  const response = data as {
    status?: unknown;
    revision?: unknown;
    serverRevision?: unknown;
    result?: { mineId?: unknown; activatedAtMs?: unknown };
  };
  if (response.status === 'revision_conflict') {
    return {
      kind: 'rejected', code: 'revision_conflict',
      ...(Number.isSafeInteger(response.serverRevision)
        ? { serverRevision: response.serverRevision as number } : {}),
    };
  }
  if (response.status === 'missing_save' || response.status === 'mine_not_active' ||
      response.status === 'key_reused') {
    return { kind: 'rejected', code: response.status };
  }
  if (!['applied', 'cooldown'].includes(String(response.status)) ||
      !Number.isSafeInteger(response.revision) ||
      typeof response.result?.mineId !== 'string' || !MINE_IDS.has(response.result.mineId) ||
      !Number.isSafeInteger(response.result.activatedAtMs)) {
    throw new Error('Boost activation returned an invalid response.');
  }
  return {
    kind: response.status === 'applied' ? 'activated' : 'cooldown',
    boost: {
      lastActivatedAtMs: response.result.activatedAtMs as number,
      mineId: response.result.mineId,
    },
    saveRevision: response.revision as number,
  };
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
