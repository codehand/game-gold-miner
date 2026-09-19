import { GameNumber } from '../../core';

export interface LeaderboardEntry {
  readonly rank: number;
  readonly displayName: string | null;
  /** Canonical `GameNumber` serialization from `leaderboard_entries.metric_exact`. */
  readonly metricExact: string;
}

export interface LeaderboardPlayer {
  readonly rank: number;
  readonly displayName: string | null;
  readonly metricExact: string;
}

export interface LeaderboardSnapshot {
  readonly boardKey: 'lifetime-gold';
  readonly entries: readonly LeaderboardEntry[];
  readonly player: LeaderboardPlayer | null;
}

export type LeaderboardLoadResult =
  | { readonly kind: 'ready'; readonly snapshot: LeaderboardSnapshot }
  | { readonly kind: 'offline'; readonly message: string };

export interface LeaderboardAuthClient {
  getSession: () => Promise<{
    readonly data: {
      readonly session: { readonly access_token: string } | null;
    };
    readonly error: unknown | null;
  }>;
}

export type LeaderboardFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const LEADERBOARD_OFFLINE_MESSAGE =
  'Leaderboard is unavailable offline. Your mine is still playable.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRank(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function isMetricExact(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  try {
    return GameNumber.from(value).greaterThan(0);
  } catch {
    return false;
  }
}

function parseEntry(value: unknown): LeaderboardEntry | null {
  if (!isRecord(value) || !isRank(value.rank) || !isMetricExact(value.metricExact)) {
    return null;
  }

  if (value.displayName !== null && typeof value.displayName !== 'string') {
    return null;
  }

  return {
    rank: value.rank,
    displayName: value.displayName,
    metricExact: value.metricExact,
  };
}

function parsePlayer(value: unknown): LeaderboardPlayer | null | undefined {
  if (value === null) {
    return null;
  }
  const entry = parseEntry(value);
  return entry === null ? undefined : entry;
}

export function parseLeaderboardSnapshot(value: unknown): LeaderboardSnapshot | null {
  if (!isRecord(value) || value.boardKey !== 'lifetime-gold' || !Array.isArray(value.entries)) {
    return null;
  }

  const entries = value.entries.map(parseEntry);
  if (entries.some((entry): entry is null => entry === null)) {
    return null;
  }

  const player = parsePlayer(value.player);
  if (player === undefined) {
    return null;
  }

  return {
    boardKey: 'lifetime-gold',
    entries: entries as LeaderboardEntry[],
    player,
  };
}

/**
 * Reads a public board through the Step 29 Edge Function. A missing session is
 * allowed because the public board remains useful, while a configured but
 * failed request becomes an explicit offline state instead of breaking boot.
 */
export async function loadLeaderboardViaFetch(
  edgeFunctionUrl: string,
  auth: LeaderboardAuthClient | null,
  fetcher: LeaderboardFetch = fetch,
): Promise<LeaderboardLoadResult> {
  try {
    const sessionData = auth === null ? null : await auth.getSession();
    if (sessionData?.error !== null && sessionData?.error !== undefined) {
      return { kind: 'offline', message: LEADERBOARD_OFFLINE_MESSAGE };
    }

    const accessToken = sessionData?.data.session?.access_token;
    const response = await fetcher(`${edgeFunctionUrl}?limit=10`, {
      headers: {
        accept: 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    if (!response.ok) {
      return { kind: 'offline', message: LEADERBOARD_OFFLINE_MESSAGE };
    }

    const snapshot = parseLeaderboardSnapshot(await response.json() as unknown);
    return snapshot === null
      ? { kind: 'offline', message: LEADERBOARD_OFFLINE_MESSAGE }
      : { kind: 'ready', snapshot };
  } catch {
    return { kind: 'offline', message: LEADERBOARD_OFFLINE_MESSAGE };
  }
}
