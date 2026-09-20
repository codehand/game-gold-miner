import {
  validateCatRoster,
  type CatAvailabilityState,
  type CatRarityTier,
  type CatRole,
  type CatRosterState,
} from '../../core';

export interface CatCollectionAuthClient {
  getSession(): Promise<{
    readonly data: { readonly session: { readonly access_token: string } | null };
    readonly error: unknown;
  }>;
  refreshSession(): Promise<{
    readonly data: { readonly session: { readonly access_token: string } | null };
    readonly error: unknown;
  }>;
}

export type CatCollectionUnavailableReason =
  | 'unconfigured'
  | 'unauthenticated'
  | 'offline'
  | 'invalid-response';

export type CatCollectionLoadResult =
  | { readonly kind: 'ready'; readonly roster: CatRosterState }
  | { readonly kind: 'unavailable'; readonly reason: CatCollectionUnavailableReason };

export type CatCollectionCommandResult =
  | { readonly kind: 'applied'; readonly roster: CatRosterState }
  | { readonly kind: 'rejected'; readonly code: string }
  | { readonly kind: 'unavailable'; readonly reason: CatCollectionUnavailableReason };

export type CatCollectionFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const KNOWN_AVAILABILITY_STATES: readonly CatAvailabilityState[] = [
  'Idle',
  'Assigned',
  'Listed',
  'Rented',
  'Expired',
  'Locked',
];
const KNOWN_ROLES: readonly CatRole[] = ['elevator', 'warehouse', 'miner'];
const KNOWN_RARITIES: readonly CatRarityTier[] = ['N', 'R', 'SR', 'SSR', 'UR'];

export async function loadCatCollectionViaFetch(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  fetcher: CatCollectionFetch = fetch,
): Promise<CatCollectionLoadResult> {
  const response = await authenticatedRequest(edgeFunctionUrl, auth, fetcher);
  if ('kind' in response) {
    return response;
  }
  if (!response.response.ok) {
    return { kind: 'unavailable', reason: response.response.status === 401 ? 'unauthenticated' : 'offline' };
  }

  try {
    const roster = parseCatRoster(await response.response.json() as unknown);
    return roster === null
      ? { kind: 'unavailable', reason: 'invalid-response' }
      : { kind: 'ready', roster };
  } catch {
    return { kind: 'unavailable', reason: 'invalid-response' };
  }
}

export async function purchaseCatViaFetch(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  assetId: string,
  idempotencyKey: string,
  fetcher: CatCollectionFetch = fetch,
): Promise<CatCollectionCommandResult> {
  return sendMutation(
    edgeFunctionUrl,
    auth,
    { assetId, idempotencyKey },
    fetcher,
  );
}

export async function replaceCatAssignmentViaFetch(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  command: {
    readonly catInstanceId: string;
    readonly slotKey: string;
    readonly expectedAssignmentRevision: number;
  },
  fetcher: CatCollectionFetch = fetch,
): Promise<CatCollectionCommandResult> {
  return sendMutation(edgeFunctionUrl, auth, command, fetcher);
}

async function sendMutation(
  edgeFunctionUrl: string,
  auth: CatCollectionAuthClient | null,
  body: Record<string, unknown>,
  fetcher: CatCollectionFetch,
): Promise<CatCollectionCommandResult> {
  const response = await authenticatedRequest(
    `${edgeFunctionUrl}/v1/${'assetId' in body ? 'purchase' : 'assignment'}`,
    auth,
    fetcher,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    },
  );
  if ('kind' in response) {
    return response;
  }

  const payload = await response.response.json().catch(() => null) as unknown;
  if (!response.response.ok) {
    const code = readErrorCode(payload);
    return response.response.status === 401
      ? { kind: 'unavailable', reason: 'unauthenticated' }
      : { kind: 'rejected', code };
  }

  const roster = parseCatRoster(payload);
  return roster === null
    ? { kind: 'unavailable', reason: 'invalid-response' }
    : { kind: 'applied', roster };
}

async function authenticatedRequest(
  url: string,
  auth: CatCollectionAuthClient | null,
  fetcher: CatCollectionFetch,
  init: RequestInit = {},
): Promise<
  | { readonly kind: 'unavailable'; readonly reason: CatCollectionUnavailableReason }
  | { readonly response: Response }
> {
  if (auth === null) {
    return { kind: 'unavailable', reason: 'unconfigured' };
  }

  try {
    const session = await auth.getSession();
    if (session.error) {
      return { kind: 'unavailable', reason: 'offline' };
    }
    if (session.data.session === null) {
      return { kind: 'unavailable', reason: 'unauthenticated' };
    }

    const first = await fetchWithToken(url, session.data.session.access_token, init, fetcher);
    if (first.status !== 401) {
      return { response: first };
    }

    const refreshed = await auth.refreshSession();
    if (refreshed.error || refreshed.data.session === null) {
      return { kind: 'unavailable', reason: 'unauthenticated' };
    }
    return {
      response: await fetchWithToken(url, refreshed.data.session.access_token, init, fetcher),
    };
  } catch {
    return { kind: 'unavailable', reason: 'offline' };
  }
}

function fetchWithToken(
  url: string,
  accessToken: string,
  init: RequestInit,
  fetcher: CatCollectionFetch,
): Promise<Response> {
  return fetcher(url, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
}

function parseCatRoster(value: unknown): CatRosterState | null {
  if (!isRecord(value) || !Array.isArray(value.cats) || !Array.isArray(value.assignments)) {
    return null;
  }
  if (!isSafeNonNegativeInteger(value.assignmentRevision) || !isSafeNonNegativeInteger(value.collectionRevision)) {
    return null;
  }

  const cats = value.cats.map(parseCatInstance);
  if (cats.some((cat) => cat === null)) {
    return null;
  }
  const assignments = value.assignments.map(parseAssignment);
  if (assignments.some((assignment) => assignment === null)) {
    return null;
  }

  const roster: CatRosterState = {
    cats: cats as CatRosterState['cats'],
    assignments: assignments as CatRosterState['assignments'],
    assignmentRevision: value.assignmentRevision,
    collectionRevision: value.collectionRevision,
  };
  try {
    validateCatRoster(roster);
    return roster;
  } catch {
    return null;
  }
}

function parseCatInstance(value: unknown): CatRosterState['cats'][number] | null {
  if (!isRecord(value) ||
      !isNonEmptyString(value.catInstanceId) ||
      !isNonEmptyString(value.ownerUserId) ||
      !isNonEmptyString(value.assetId) ||
      !isNonEmptyString(value.displayName) ||
      !isEnum(value.roleId, KNOWN_ROLES) ||
      !isEnum(value.rarityTier, KNOWN_RARITIES) ||
      !isSafePositiveInteger(value.level) ||
      !isSafePositiveInteger(value.calculationVersion) ||
      !isEnum(value.availabilityState, KNOWN_AVAILABILITY_STATES) ||
      (value.assignedSlotKey !== null && !isNonEmptyString(value.assignedSlotKey)) ||
      typeof value.updatedAt !== 'string') {
    return null;
  }
  if (!isRecord(value.attributes) ||
      !isAttribute(value.attributes.power) ||
      !isAttribute(value.attributes.speed) ||
      !isAttribute(value.attributes.capacity) ||
      !isAttribute(value.attributes.efficiency)) {
    return null;
  }
  const updatedAt = Date.parse(value.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return null;
  }
  return {
    catInstanceId: value.catInstanceId,
    ownerUserId: value.ownerUserId,
    assetId: value.assetId,
    displayName: value.displayName,
    roleId: value.roleId,
    rarityTier: value.rarityTier,
    level: value.level,
    attributes: {
      power: value.attributes.power,
      speed: value.attributes.speed,
      capacity: value.attributes.capacity,
      efficiency: value.attributes.efficiency,
    },
    calculationVersion: value.calculationVersion,
    availabilityState: value.availabilityState,
    assignedSlotKey: value.assignedSlotKey,
    updatedAt,
  };
}

function parseAssignment(value: unknown): CatRosterState['assignments'][number] | null {
  return isRecord(value) && isNonEmptyString(value.slotKey) && isNonEmptyString(value.catInstanceId)
    ? { slotKey: value.slotKey as CatRosterState['assignments'][number]['slotKey'], catInstanceId: value.catInstanceId }
    : null;
}

function readErrorCode(value: unknown): string {
  return isRecord(value) && isRecord(value.error) && typeof value.error.code === 'string'
    ? value.error.code
    : 'server_error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function isAttribute(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100;
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
