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
  readonly roleId: 'elevator' | 'warehouse' | 'miner' | 'hauler';
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
  /** Included only by a successful purchase so the client can reconcile its wallet. */
  readonly walletGold?: string;
  /** The save revision incremented by the atomic purchase transaction. */
  readonly saveRevision?: number;
}

export type MarketplaceListingType = 'sale' | 'rent';
export type MarketplaceListingStatus = 'Active' | 'Sold' | 'Rented' | 'Cancelled' | 'Expired';

export interface MarketplaceListingProjection {
  readonly listingId: string;
  readonly sellerUserId: string;
  readonly sellerDisplayName: string | null;
  readonly cat: CatCollectionRow;
  readonly listingType: MarketplaceListingType;
  readonly priceExact: string;
  readonly status: MarketplaceListingStatus;
  readonly buyerUserId: string | null;
  readonly renterUserId: string | null;
  readonly durationHours: number | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface MarketplaceProjection {
  readonly listings: readonly MarketplaceListingProjection[];
}

export interface MarketplaceMutationProjection extends CatCollectionProjection, MarketplaceProjection {
  readonly listingId: string;
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
    readonly catInstanceId: string | null;
    readonly slotKey: string;
    readonly expectedAssignmentRevision: number;
  },
) => Promise<CatCollectionProjection | { readonly error: AssignmentError }>;
export type ReadMarketplace = (
  userId: string,
  listingType: MarketplaceListingType | null,
  mineOnly: boolean,
) => Promise<MarketplaceProjection>;
export type CreateListing = (
  userId: string,
  command: { readonly catInstanceId: string; readonly listingType: MarketplaceListingType; readonly priceExact: string; readonly idempotencyKey: string },
) => Promise<MarketplaceMutationProjection>;
export type CancelListing = (userId: string, listingId: string, idempotencyKey: string) => Promise<MarketplaceMutationProjection>;
export type BuyListing = (userId: string, listingId: string, idempotencyKey: string) => Promise<MarketplaceMutationProjection>;
export type RentListing = (
  userId: string,
  listingId: string,
  durationHours: number,
  idempotencyKey: string,
) => Promise<MarketplaceMutationProjection>;

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
  readonly readMarketplace?: ReadMarketplace;
  readonly createListing?: CreateListing;
  readonly cancelListing?: CancelListing;
  readonly buyListing?: BuyListing;
  readonly rentListing?: RentListing;
  readonly settleDueRentals?: () => Promise<void>;
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

  if (route === '/v1/listings' && (request.method === 'GET' || request.method === 'HEAD')) {
    if (dependencies.readMarketplace === undefined) {
      return errorResponse(500, 'server_error', 'Marketplace service unavailable.', { origin });
    }
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const listingType = type === null ? null : parseListingType(type);
    const mineOnly = url.searchParams.get('scope') === 'mine';
    if (type !== null && listingType === null) {
      return errorResponse(400, 'malformed_request', 'Listing type must be sale or rent.', { origin });
    }
    await dependencies.settleDueRentals?.();
    return jsonResponse(200, await dependencies.readMarketplace(caller.userId, listingType, mineOnly), origin);
  }

  if (route === '/v1/listings' && request.method === 'POST') {
    if (dependencies.createListing === undefined) {
      return errorResponse(500, 'server_error', 'Marketplace service unavailable.', { origin });
    }
    const body = await readObject(request);
    const listingType = body === null || !isNonEmptyString(body.listingType)
      ? null
      : parseListingType(body.listingType);
    if (
      body === null ||
      !isNonEmptyString(body.catInstanceId) ||
      listingType === null ||
      !isNonEmptyString(body.priceExact) ||
      !isNonEmptyString(body.idempotencyKey)
    ) {
      return errorResponse(400, 'malformed_request', 'Listing requires catInstanceId, listingType, priceExact, and idempotencyKey.', { origin });
    }
    try {
      return jsonResponse(200, await dependencies.createListing(caller.userId, {
        catInstanceId: body.catInstanceId,
        listingType,
        priceExact: body.priceExact,
        idempotencyKey: body.idempotencyKey,
      }), origin);
    } catch (error) {
      return mapMutationError(error, origin);
    }
  }

  const listingCommand = /^\/v1\/listings\/([^/]+)\/(cancel|buy|rent)$/.exec(route);
  if (listingCommand !== null && request.method === 'POST') {
    const listingId = listingCommand[1];
    const command = listingCommand[2];
    const body = await readObject(request);
    if (body === null || !isNonEmptyString(body.idempotencyKey)) {
      return errorResponse(400, 'malformed_request', 'Listing command requires idempotencyKey.', { origin });
    }
    try {
      if (command === 'cancel') {
        if (dependencies.cancelListing === undefined) {
          return errorResponse(500, 'server_error', 'Marketplace service unavailable.', { origin });
        }
        return jsonResponse(200, await dependencies.cancelListing(caller.userId, listingId, body.idempotencyKey), origin);
      }
      if (command === 'buy') {
        if (dependencies.buyListing === undefined) {
          return errorResponse(500, 'server_error', 'Marketplace service unavailable.', { origin });
        }
        return jsonResponse(200, await dependencies.buyListing(caller.userId, listingId, body.idempotencyKey), origin);
      }
      if (dependencies.rentListing === undefined) {
        return errorResponse(500, 'server_error', 'Marketplace service unavailable.', { origin });
      }
      if (!isSafePositiveInteger(body.durationHours) || body.durationHours > 24) {
        return body.durationHours === undefined
          ? errorResponse(400, 'malformed_request', 'Rental requires durationHours from 1 to 24.', { origin })
          : errorResponse(400, 'invalid_duration', 'Rental duration must be between 1 and 24 hours.', { origin });
      }
      return jsonResponse(200, await dependencies.rentListing(caller.userId, listingId, body.durationHours, body.idempotencyKey), origin);
    } catch (error) {
      return mapMutationError(error, origin);
    }
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
      (body.catInstanceId !== null && !isNonEmptyString(body.catInstanceId)) ||
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

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function parseListingType(value: string): MarketplaceListingType | null {
  return value === 'sale' || value === 'rent' ? value : null;
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
    'idempotency_conflict',
    'invalid_listing',
    'invalid_duration',
    'unknown_listing',
    'listing_unavailable',
    'listing_exists',
    'cat_not_listable',
    'self_trade',
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
  readonly renter_user_id: string | null;
  readonly rental_expires_at: string | null;
  readonly updated_at: string;
}

function projectCat(row: SupabaseCatRow, viewerUserId = row.owner_user_id): CatCollectionRow {
  const isRenterProjection = row.renter_user_id === viewerUserId && row.owner_user_id !== viewerUserId;
  const isOwnerWithActiveRental = row.renter_user_id !== null && row.owner_user_id === viewerUserId;
  return {
    catInstanceId: row.cat_instance_id,
    // The caller-scoped roster uses the active account as ownerUserId for a
    // rented usage projection. Legal title remains in the server listing and
    // rental tables; this keeps the existing save/assignment domain shape
    // usable without allowing the client to transfer ownership.
    ownerUserId: isRenterProjection ? viewerUserId : row.owner_user_id,
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
    availabilityState: isRenterProjection
      ? row.availability_state === 'Assigned' ? 'Assigned' : 'Idle'
      : isOwnerWithActiveRental ? 'Rented' : row.availability_state,
    assignedSlotKey: isOwnerWithActiveRental ? null : row.assigned_slot_key,
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
  const settled = await client.rpc('settle_due_cat_rentals');
  if (settled.error) {
    throw new Error('Rental settlement failed.');
  }
  const [ownedCatsResult, rentalsResult, assignmentsResult, accountResult] = await Promise.all([
    client.from('cat_instances').select('*').eq('owner_user_id', userId).order('updated_at', { ascending: false }),
    client.from('cat_rentals').select('cat_instance_id').eq('renter_user_id', userId).eq('status', 'Active'),
    client.from('cat_assignments').select('slot_key, cat_instance_id').eq('owner_user_id', userId).order('slot_key'),
    client.from('cat_collection_accounts').select('assignment_revision, collection_revision').eq('user_id', userId).maybeSingle(),
  ]);
  if (ownedCatsResult.error || rentalsResult.error || assignmentsResult.error || accountResult.error) {
    throw new Error('Collection query failed.');
  }
  const rentalCatIds = ((rentalsResult.data ?? []) as { cat_instance_id: string }[]).map((row) => row.cat_instance_id);
  const rentedCatsResult = rentalCatIds.length === 0
    ? { data: [], error: null }
    : await client.from('cat_instances').select('*').in('cat_instance_id', rentalCatIds);
  if (rentedCatsResult.error) {
    throw new Error('Collection query failed.');
  }
  const cats = new Map<string, SupabaseCatRow>();
  for (const row of [...(ownedCatsResult.data ?? []), ...(rentedCatsResult.data ?? [])] as SupabaseCatRow[]) {
    cats.set(row.cat_instance_id, row);
  }
  return {
    cats: [...cats.values()].map((row) => projectCat(row, userId)),
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
  const [projection, wallet] = await Promise.all([
    readCollectionViaSupabase(userId),
    readWalletViaSupabase(userId),
  ]);
  return { ...projection, ...wallet };
}

interface SupabaseListingRow {
  readonly listing_id: string;
  readonly seller_user_id: string;
  readonly cat_instance_id: string;
  readonly listing_type: MarketplaceListingType;
  readonly price_exact: string | number;
  readonly status: MarketplaceListingStatus;
  readonly buyer_user_id: string | null;
  readonly renter_user_id: string | null;
  readonly duration_hours: number | null;
  readonly created_at: string;
  readonly completed_at: string | null;
}

interface SupabaseProfileRow {
  readonly id: string;
  readonly display_name: string | null;
}

async function readMarketplaceViaSupabase(
  userId: string,
  listingType: MarketplaceListingType | null,
  mineOnly: boolean,
): Promise<MarketplaceProjection> {
  const client = serviceClient();
  const settled = await client.rpc('settle_due_cat_rentals');
  if (settled.error) {
    throw new Error('Rental settlement failed.');
  }

  let query = client.from('cat_marketplace_listings').select('*').order('created_at', { ascending: false });
  query = mineOnly ? query.eq('seller_user_id', userId) : query.eq('status', 'Active');
  if (!mineOnly && listingType !== null) {
    query = query.eq('listing_type', listingType);
  }
  const listingsResult = await query;
  if (listingsResult.error) {
    throw new Error('Marketplace query failed.');
  }
  const listings = listingsResult.data as SupabaseListingRow[];
  if (listings.length === 0) {
    return { listings: [] };
  }

  const catIds = [...new Set(listings.map((listing) => listing.cat_instance_id))];
  const sellerIds = [...new Set(listings.map((listing) => listing.seller_user_id))];
  const [catsResult, profilesResult] = await Promise.all([
    client.from('cat_instances').select('*').in('cat_instance_id', catIds),
    client.from('profiles').select('id, display_name').in('id', sellerIds),
  ]);
  if (catsResult.error || profilesResult.error) {
    throw new Error('Marketplace projection query failed.');
  }
  const cats = new Map(
    (catsResult.data as SupabaseCatRow[]).map((cat) => [cat.cat_instance_id, cat]),
  );
  const profiles = new Map(
    (profilesResult.data as SupabaseProfileRow[]).map((profile) => [profile.id, profile.display_name]),
  );

  return {
    listings: listings.flatMap((listing) => {
      const cat = cats.get(listing.cat_instance_id);
      if (cat === undefined) {
        return [];
      }
      return [{
        listingId: listing.listing_id,
        sellerUserId: listing.seller_user_id,
        sellerDisplayName: profiles.get(listing.seller_user_id) ?? null,
        cat: projectCat(cat, userId),
        listingType: listing.listing_type,
        priceExact: String(listing.price_exact),
        status: listing.status,
        buyerUserId: listing.buyer_user_id,
        renterUserId: listing.renter_user_id,
        durationHours: listing.duration_hours,
        expiresAt: cat.rental_expires_at,
        createdAt: listing.created_at,
        completedAt: listing.completed_at,
      } satisfies MarketplaceListingProjection];
    }),
  };
}

async function readMarketplaceMutationProjection(
  userId: string,
  listingId: string,
  includeWallet: boolean,
): Promise<MarketplaceMutationProjection> {
  const [collection, marketplace, wallet] = await Promise.all([
    readCollectionViaSupabase(userId),
    readMarketplaceViaSupabase(userId, null, true),
    includeWallet ? readWalletViaSupabase(userId) : Promise.resolve({}),
  ]);
  return { ...collection, ...marketplace, ...wallet, listingId };
}

async function createListingViaSupabase(
  userId: string,
  command: { readonly catInstanceId: string; readonly listingType: MarketplaceListingType; readonly priceExact: string; readonly idempotencyKey: string },
): Promise<MarketplaceMutationProjection> {
  const { data, error } = await serviceClient().rpc('create_cat_listing', {
    p_user_id: userId,
    p_cat_instance_id: command.catInstanceId,
    p_listing_type: command.listingType,
    p_price_exact: command.priceExact,
    p_idempotency_key: command.idempotencyKey,
  });
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Listing creation failed.');
  return readMarketplaceMutationProjection(userId, data, true);
}

async function cancelListingViaSupabase(userId: string, listingId: string, idempotencyKey: string): Promise<MarketplaceMutationProjection> {
  const { data, error } = await serviceClient().rpc('cancel_cat_listing', {
    p_user_id: userId,
    p_listing_id: listingId,
    p_idempotency_key: idempotencyKey,
  });
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Listing cancellation failed.');
  return readMarketplaceMutationProjection(userId, data, true);
}

async function buyListingViaSupabase(userId: string, listingId: string, idempotencyKey: string): Promise<MarketplaceMutationProjection> {
  const { data, error } = await serviceClient().rpc('buy_cat_listing', {
    p_buyer_user_id: userId,
    p_listing_id: listingId,
    p_idempotency_key: idempotencyKey,
  });
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Sale purchase failed.');
  return readMarketplaceMutationProjection(userId, data, true);
}

async function rentListingViaSupabase(
  userId: string,
  listingId: string,
  durationHours: number,
  idempotencyKey: string,
): Promise<MarketplaceMutationProjection> {
  const { data, error } = await serviceClient().rpc('rent_cat_listing', {
    p_renter_user_id: userId,
    p_listing_id: listingId,
    p_duration_hours: durationHours,
    p_idempotency_key: idempotencyKey,
  });
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Rental purchase failed.');
  return readMarketplaceMutationProjection(userId, data, true);
}

async function readWalletViaSupabase(userId: string): Promise<{
  readonly walletGold: string;
  readonly saveRevision: number;
}> {
  const { data, error } = await serviceClient()
    .from('saves')
    .select('document_json, revision')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || data === null) {
    throw new Error('Wallet query failed.');
  }

  let document: unknown;
  try {
    document = JSON.parse(data.document_json as string) as unknown;
  } catch {
    throw new Error('Wallet document is invalid.');
  }
  const state = isRecord(document) ? document.state : null;
  const walletGold = isRecord(document) && document.schemaVersion === 4
    ? document.walletGold
    : isRecord(state) ? state.gold : null;
  if (!isNonEmptyString(walletGold) || !isSafeNonNegativeInteger(data.revision)) {
    throw new Error('Wallet document is invalid.');
  }
  return { walletGold, saveRevision: data.revision };
}

async function replaceAssignmentViaSupabase(
  userId: string,
  command: { readonly catInstanceId: string | null; readonly slotKey: string; readonly expectedAssignmentRevision: number },
): Promise<CatCollectionProjection> {
  const { error } = await serviceClient().rpc('replace_cat_assignment', {
    p_user_id: userId,
    p_cat_instance_id: command.catInstanceId,
    p_slot_key: command.slotKey,
    p_expected_assignment_revision: command.expectedAssignmentRevision,
  });
  if (error) throw new Error(error.message);
  const [collection, wallet] = await Promise.all([
    readCollectionViaSupabase(userId),
    readWalletViaSupabase(userId),
  ]);
  return { ...collection, ...wallet };
}

async function settleDueRentalsViaSupabase(): Promise<void> {
  const { error } = await serviceClient().rpc('settle_due_cat_rentals');
  if (error) throw new Error('Rental settlement failed.');
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`cat-collection: ${name} is not configured.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleRequest(request, {
        resolveCaller: resolveCallerViaSupabaseAuth,
        readCollection: readCollectionViaSupabase,
        purchaseCat: purchaseCatViaSupabase,
        replaceAssignment: replaceAssignmentViaSupabase,
        readMarketplace: readMarketplaceViaSupabase,
        createListing: createListingViaSupabase,
        cancelListing: cancelListingViaSupabase,
        buyListing: buyListingViaSupabase,
        rentListing: rentListingViaSupabase,
        settleDueRentals: settleDueRentalsViaSupabase,
      });
    } catch (error) {
      console.error('cat-collection: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Collection service unavailable.', {
        origin: request.headers.get('origin'),
      });
    }
  });
}
