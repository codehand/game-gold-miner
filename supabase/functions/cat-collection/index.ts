/**
 * Account-scoped Collection and role-assignment API.
 *
 * The platform JWT switch is disabled so CORS and response shape remain under
 * the same explicit handler contract as the other functions. Every mutation
 * uses the verified bearer identity and a service-role RPC; the browser never
 * writes cat tables directly.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
} from '../_shared/http.ts';

export interface CatCollectionRow {
  readonly catInstanceId: string;
  readonly ownerUserId: string;
  readonly assetId: string;
  readonly displayName: string;
  readonly roleId: 'elevator' | 'warehouse' | 'miner';
  readonly rarityTier: 'N' | 'R' | 'SR' | 'SSR' | 'UR';
  readonly level: number;
  readonly attributes: {
    readonly power: number;
    readonly speed: number;
    readonly capacity: number;
    readonly efficiency: number;
  };
  readonly calculationVersion: number;
  readonly availabilityState: 'Idle' | 'Assigned' | 'Listed' | 'Rented' | 'Expired' | 'Locked';
  readonly assignedSlotKey: string | null;
  readonly updatedAt: string;
}

export interface CatCollectionProjection {
  readonly cats: readonly CatCollectionRow[];
  readonly assignments: readonly { readonly slotKey: string; readonly catInstanceId: string }[];
  readonly assignmentRevision: number;
  readonly collectionRevision: number;
}

export interface Caller {
  readonly userId: string;
}

export type ResolveCaller = (bearerToken: string) => Promise<Caller | null>;
export type ReadCollection = (userId: string) => Promise<CatCollectionProjection>;
export type PurchaseCat = (userId: string, assetId: string, idempotencyKey: string) => Promise<CatCollectionProjection>;
export type ReplaceAssignment = (
  userId: string,
  command: {
    readonly catInstanceId: string;
    readonly slotKey: string;
    readonly expectedAssignmentRevision: number;
  },
) => Promise<CatCollectionProjection | { readonly error: AssignmentError }>;

export type AssignmentError =
  | 'stale_revision'
  | 'unknown_slot'
  | 'unknown_cat'
  | 'wrong_role'
  | 'cat_not_assignable'
  | 'no_op';

export interface CatCollectionDependencies {
  readonly resolveCaller: ResolveCaller;
  readonly readCollection: ReadCollection;
  readonly purchaseCat: PurchaseCat;
  readonly replaceAssignment: ReplaceAssignment;
}

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1] ?? null;
}

export function resolveFunctionRoute(pathname: string): string {
  const withoutPlatform = pathname.startsWith('/functions/v1/cat-collection')
    ? pathname.slice('/functions/v1/cat-collection'.length)
    : pathname.startsWith('/cat-collection')
      ? pathname.slice('/cat-collection'.length)
      : pathname;
  return withoutPlatform === '' ? '/' : withoutPlatform;
}

export async function handleRequest(
  request: Request,
  dependencies: CatCollectionDependencies,
): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    return corsPreflightResponse(request, 'GET, POST, OPTIONS');
  }

  const route = resolveFunctionRoute(new URL(request.url).pathname);
  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }
  const caller = await dependencies.resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  if (route === '/v1/collection' && (request.method === 'GET' || request.method === 'HEAD')) {
    return jsonResponse(200, await dependencies.readCollection(caller.userId), origin);
  }

  if (route === '/v1/purchase' && request.method === 'POST') {
    const body = await readObject(request);
    if (body === null || !isNonEmptyString(body.assetId) || !isNonEmptyString(body.idempotencyKey)) {
      return errorResponse(400, 'malformed_request', 'Purchase requires assetId and idempotencyKey.', { origin });
    }
    try {
      return jsonResponse(200, await dependencies.purchaseCat(caller.userId, body.assetId, body.idempotencyKey), origin);
    } catch (error) {
      return mapMutationError(error, origin);
    }
  }

  if (route === '/v1/assignment' && request.method === 'POST') {
    const body = await readObject(request);
    if (
      body === null ||
      !isNonEmptyString(body.catInstanceId) ||
      !isNonEmptyString(body.slotKey) ||
      !isSafeNonNegativeInteger(body.expectedAssignmentRevision)
    ) {
      return errorResponse(400, 'malformed_request', 'Assignment requires catInstanceId, slotKey, and expectedAssignmentRevision.', { origin });
    }
    try {
      const result = await dependencies.replaceAssignment(caller.userId, {
        catInstanceId: body.catInstanceId,
        slotKey: body.slotKey,
        expectedAssignmentRevision: body.expectedAssignmentRevision,
      });
      if ('error' in result) {
        return errorResponse(409, result.error, 'Assignment was not applied.', { origin });
      }
      return jsonResponse(200, result, origin);
    } catch (error) {
      return mapMutationError(error, origin);
    }
  }

  return errorResponse(400, 'malformed_request', 'Unknown Collection route or method.', { origin });
}

async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function mapMutationError(error: unknown, origin: string | null): Response {
  const message = error instanceof Error ? error.message : String(error);
  const known = [
    'unknown_asset',
    'wallet_unavailable',
    'insufficient_funds',
    'stale_revision',
    'unknown_slot',
    'unknown_cat',
    'wrong_role',
    'cat_not_assignable',
    'no_op',
  ] as const;
  const code = known.find((candidate) => message.includes(candidate));
  if (code === 'insufficient_funds') {
    return errorResponse(409, code, 'The purchase could not be completed.', { origin });
  }
  if (code !== undefined) {
    return errorResponse(409, code, 'The Collection command was rejected.', { origin });
  }
  return errorResponse(500, 'server_error', 'Collection service unavailable.', { origin });
}

interface SupabaseCatRow {
  readonly cat_instance_id: string;
  readonly owner_user_id: string;
  readonly asset_id: string;
  readonly display_name: string;
  readonly role_id: CatCollectionRow['roleId'];
  readonly rarity_tier: CatCollectionRow['rarityTier'];
  readonly level: number;
  readonly power: number;
  readonly speed: number;
  readonly capacity: number;
  readonly efficiency: number;
  readonly calculation_version: number;
  readonly availability_state: CatCollectionRow['availabilityState'];
  readonly assigned_slot_key: string | null;
  readonly updated_at: string;
}

function projectCat(row: SupabaseCatRow): CatCollectionRow {
  return {
    catInstanceId: row.cat_instance_id,
    ownerUserId: row.owner_user_id,
    assetId: row.asset_id,
    displayName: row.display_name,
    roleId: row.role_id,
    rarityTier: row.rarity_tier,
    level: row.level,
    attributes: {
      power: row.power,
      speed: row.speed,
      capacity: row.capacity,
      efficiency: row.efficiency,
    },
    calculationVersion: row.calculation_version,
    availabilityState: row.availability_state,
    assignedSlotKey: row.assigned_slot_key,
    updatedAt: row.updated_at,
  };
}

async function resolveCallerViaSupabaseAuth(token: string): Promise<Caller | null> {
  const client = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } },
  );
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : { userId: data.user.id };
}

function serviceClient() {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

async function readCollectionViaSupabase(userId: string): Promise<CatCollectionProjection> {
  const client = serviceClient();
  const [catsResult, assignmentsResult, accountResult] = await Promise.all([
    client.from('cat_instances').select('*').eq('owner_user_id', userId).order('updated_at', { ascending: false }),
    client.from('cat_assignments').select('slot_key, cat_instance_id').eq('owner_user_id', userId).order('slot_key'),
    client.from('cat_collection_accounts').select('assignment_revision, collection_revision').eq('user_id', userId).maybeSingle(),
  ]);
  if (catsResult.error || assignmentsResult.error || accountResult.error) {
    throw new Error('Collection query failed.');
  }
  return {
    cats: (catsResult.data as SupabaseCatRow[]).map(projectCat),
    assignments: (assignmentsResult.data as { slot_key: string; cat_instance_id: string }[]).map((row) => ({
      slotKey: row.slot_key,
      catInstanceId: row.cat_instance_id,
    })),
    assignmentRevision: accountResult.data?.assignment_revision ?? 0,
    collectionRevision: accountResult.data?.collection_revision ?? 0,
  };
}

async function purchaseCatViaSupabase(userId: string, assetId: string, idempotencyKey: string): Promise<CatCollectionProjection> {
  const { error } = await serviceClient().rpc('purchase_cat_instance', {
    p_user_id: userId,
    p_asset_id: assetId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return readCollectionViaSupabase(userId);
}

async function replaceAssignmentViaSupabase(
  userId: string,
  command: { readonly catInstanceId: string; readonly slotKey: string; readonly expectedAssignmentRevision: number },
): Promise<CatCollectionProjection> {
  const { error } = await serviceClient().rpc('replace_cat_assignment', {
    p_user_id: userId,
    p_cat_instance_id: command.catInstanceId,
    p_slot_key: command.slotKey,
    p_expected_assignment_revision: command.expectedAssignmentRevision,
  });
  if (error) throw new Error(error.message);
  return readCollectionViaSupabase(userId);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`cat-collection: ${name} is not configured.`);
  return value;
}

if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleRequest(request, {
        resolveCaller: resolveCallerViaSupabaseAuth,
        readCollection: readCollectionViaSupabase,
        purchaseCat: purchaseCatViaSupabase,
        replaceAssignment: replaceAssignmentViaSupabase,
      });
    } catch (error) {
      console.error('cat-collection: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Collection service unavailable.', {
        origin: request.headers.get('origin'),
      });
    }
  });
}
