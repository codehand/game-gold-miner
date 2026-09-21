import type { CatInstance, CatRosterState } from '../../core';
import {
  parseCatRosterResponse,
  type CatCollectionAuthClient,
  type CatCollectionFetch,
} from './catCollection';

export type MarketplaceListingType = 'sale' | 'rent';
export type MarketplaceListingStatus = 'Active' | 'Sold' | 'Rented' | 'Cancelled' | 'Expired';

export interface MarketplaceListingRecord {
  readonly listingId: string;
  readonly sellerUserId: string;
  readonly sellerDisplayName: string | null;
  readonly cat: CatInstance;
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

export type MarketplaceUnavailableReason =
  | 'unconfigured'
  | 'unauthenticated'
  | 'offline'
  | 'invalid-response';

export type MarketplaceListingsResult =
  | { readonly kind: 'ready'; readonly listings: readonly MarketplaceListingRecord[] }
  | { readonly kind: 'unavailable'; readonly reason: MarketplaceUnavailableReason };

export type MarketplaceCommandResult =
  | {
      readonly kind: 'applied';
      readonly listingId: string;
      readonly roster: CatRosterState;
      readonly listings: readonly MarketplaceListingRecord[];
      readonly walletGold?: string;
      readonly saveRevision?: number;
    }
  | { readonly kind: 'rejected'; readonly code: string }
  | { readonly kind: 'unavailable'; readonly reason: MarketplaceUnavailableReason };

export async function loadMarketplaceListingsViaFetch(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  listingType: MarketplaceListingType | null,
  mineOnly = false,
  fetcher: CatCollectionFetch = fetch,
): Promise<MarketplaceListingsResult> {
  const params = new URLSearchParams();
  if (listingType !== null) params.set('type', listingType);
  if (mineOnly) params.set('scope', 'mine');
  const result = await authenticatedRequest(
    `${edgeFunctionUrl}/v1/listings${params.size > 0 ? `?${params.toString()}` : ''}`,
    auth,
    fetcher,
  );
  if ('kind' in result) return result;
  if (!result.response.ok) {
    return { kind: 'unavailable', reason: result.response.status === 401 ? 'unauthenticated' : 'offline' };
  }
  const parsed = parseMarketplaceProjection(await result.response.json().catch(() => null));
  return parsed === null ? { kind: 'unavailable', reason: 'invalid-response' } : { kind: 'ready', listings: parsed.listings };
}

export function createMarketplaceListingViaFetch(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  command: { readonly catInstanceId: string; readonly listingType: MarketplaceListingType; readonly priceExact: string; readonly idempotencyKey: string },
  fetcher: CatCollectionFetch = fetch,
): Promise<MarketplaceCommandResult> {
  return sendCommand(edgeFunctionUrl, auth, '/v1/listings', command, fetcher);
}

export function cancelMarketplaceListingViaFetch(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  listingId: string,
  idempotencyKey: string,
  fetcher: CatCollectionFetch = fetch,
): Promise<MarketplaceCommandResult> {
  return sendCommand(edgeFunctionUrl, auth, `/v1/listings/${encodeURIComponent(listingId)}/cancel`, { idempotencyKey }, fetcher);
}

export function buyMarketplaceListingViaFetch(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  listingId: string,
  idempotencyKey: string,
  fetcher: CatCollectionFetch = fetch,
): Promise<MarketplaceCommandResult> {
  return sendCommand(edgeFunctionUrl, auth, `/v1/listings/${encodeURIComponent(listingId)}/buy`, { idempotencyKey }, fetcher);
}

export function rentMarketplaceListingViaFetch(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  listingId: string,
  durationHours: number,
  idempotencyKey: string,
  fetcher: CatCollectionFetch = fetch,
): Promise<MarketplaceCommandResult> {
  return sendCommand(edgeFunctionUrl, auth, `/v1/listings/${encodeURIComponent(listingId)}/rent`, { durationHours, idempotencyKey }, fetcher);
}

async function sendCommand(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  path: string,
  body: Record<string, unknown>,
  fetcher: CatCollectionFetch,
): Promise<MarketplaceCommandResult> {
  const result = await authenticatedRequest(`${edgeFunctionUrl}${path}`, auth, fetcher, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  if ('kind' in result) return result;
  const payload = await result.response.json().catch(() => null) as unknown;
  if (!result.response.ok) {
    const code = isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string'
      ? payload.error.code
      : 'server_error';
    return result.response.status === 401
      ? { kind: 'unavailable', reason: 'unauthenticated' }
      : { kind: 'rejected', code };
  }
  const projection = parseMarketplaceCommandProjection(payload);
  return projection === null ? { kind: 'unavailable', reason: 'invalid-response' } : { kind: 'applied', ...projection };
}

async function authenticatedRequest(
  url: string,
  auth: CatCollectionAuthClient | null,
  fetcher: CatCollectionFetch,
  init: RequestInit = {},
): Promise<{ readonly response: Response } | { readonly kind: 'unavailable'; readonly reason: MarketplaceUnavailableReason }> {
  if (auth === null) return { kind: 'unavailable', reason: 'unconfigured' };
  try {
    const session = await auth.getSession();
    if (session.error) return { kind: 'unavailable', reason: 'offline' };
    if (session.data.session === null) return { kind: 'unavailable', reason: 'unauthenticated' };
    const first = await fetchWithToken(url, session.data.session.access_token, init, fetcher);
    if (first.status !== 401) return { response: first };
    const refreshed = await auth.refreshSession();
    if (refreshed.error || refreshed.data.session === null) return { kind: 'unavailable', reason: 'unauthenticated' };
    return { response: await fetchWithToken(url, refreshed.data.session.access_token, init, fetcher) };
  } catch {
    return { kind: 'unavailable', reason: 'offline' };
  }
}

function fetchWithToken(url: string, token: string, init: RequestInit, fetcher: CatCollectionFetch): Promise<Response> {
  return fetcher(url, {
    ...init,
    headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

function parseMarketplaceCommandProjection(value: unknown): {
  listingId: string;
  roster: CatRosterState;
  listings: readonly MarketplaceListingRecord[];
  walletGold?: string;
  saveRevision?: number;
} | null {
  if (!isRecord(value) || typeof value.listingId !== 'string') return null;
  const roster = parseCatRosterResponse(value);
  const projection = parseMarketplaceProjection(value);
  if (roster === null || projection === null) return null;
  if (value.walletGold !== undefined && typeof value.walletGold !== 'string') return null;
  if (value.saveRevision !== undefined && !isSafeNonNegativeInteger(value.saveRevision)) return null;
  return { listingId: value.listingId, roster, listings: projection.listings, walletGold: value.walletGold, saveRevision: value.saveRevision };
}

function parseMarketplaceProjection(value: unknown): { listings: readonly MarketplaceListingRecord[] } | null {
  if (!isRecord(value) || !Array.isArray(value.listings)) return null;
  const listings = value.listings.map(parseListing);
  return listings.some((listing) => listing === null) ? null : { listings: listings as MarketplaceListingRecord[] };
}

function parseListing(value: unknown): MarketplaceListingRecord | null {
  if (!isRecord(value) || !isNonEmptyString(value.listingId) || !isNonEmptyString(value.sellerUserId) ||
      (value.sellerDisplayName !== null && typeof value.sellerDisplayName !== 'string') ||
      !isRecord(value.cat) || !isEnum(value.listingType, ['sale', 'rent'] as const) ||
      !isNonEmptyString(value.priceExact) || !isEnum(value.status, ['Active', 'Sold', 'Rented', 'Cancelled', 'Expired'] as const) ||
      (value.buyerUserId !== null && !isNonEmptyString(value.buyerUserId)) ||
      (value.renterUserId !== null && !isNonEmptyString(value.renterUserId)) ||
      (value.durationHours !== null && !isSafePositiveInteger(value.durationHours)) ||
      (value.expiresAt !== null && typeof value.expiresAt !== 'string') ||
      !isNonEmptyString(value.createdAt) ||
      (value.completedAt !== null && typeof value.completedAt !== 'string')) return null;
  const cat = parseCatFromListing(value.cat);
  if (cat === null) return null;
  return {
    listingId: value.listingId,
    sellerUserId: value.sellerUserId,
    sellerDisplayName: value.sellerDisplayName,
    cat,
    listingType: value.listingType,
    priceExact: value.priceExact,
    status: value.status,
    buyerUserId: value.buyerUserId,
    renterUserId: value.renterUserId,
    durationHours: value.durationHours,
    expiresAt: value.expiresAt,
    createdAt: value.createdAt,
    completedAt: value.completedAt,
  };
}

function parseCatFromListing(value: Record<string, unknown>): CatInstance | null {
  const assigned = typeof value.assignedSlotKey === 'string'
    ? [{ slotKey: value.assignedSlotKey, catInstanceId: value.catInstanceId }]
    : [];
  const roster = parseCatRosterResponse({ cats: [value], assignments: assigned, assignmentRevision: 0, collectionRevision: 0 });
  return roster?.cats[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function isSafeNonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function isSafePositiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T { return typeof value === 'string' && values.includes(value as T); }
