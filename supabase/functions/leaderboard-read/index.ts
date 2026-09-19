/**
 * `leaderboard-read` Edge Function — server-milestone Step 29.
 *
 * The leaderboard is public, but `leaderboard_entries.user_id` is deliberately
 * withheld from the PostgREST grant. That prevents a direct client query from
 * enumerating account ids, while this function can still calculate the caller's
 * own rank after authenticating the optional bearer token. The response never
 * exposes an id: it contains only display-safe board rows and the caller's
 * rank/value projection.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  corsPreflightResponse,
  errorResponse,
  jsonResponse,
} from '../_shared/http.ts';

export const LIFETIME_GOLD_BOARD_KEY = 'lifetime-gold' as const;
export const DEFAULT_LEADERBOARD_LIMIT = 10;
export const MAX_LEADERBOARD_LIMIT = 100;
const LEADERBOARD_PAGE_SIZE = 1_000;

export interface LeaderboardEntryView {
  readonly rank: number;
  readonly displayName: string | null;
  readonly metricExact: string;
}

export interface LeaderboardPlayerView {
  readonly rank: number;
  readonly displayName: string | null;
  readonly metricExact: string;
}

export interface LeaderboardReadResult {
  readonly boardKey: typeof LIFETIME_GOLD_BOARD_KEY;
  readonly entries: readonly LeaderboardEntryView[];
  readonly player: LeaderboardPlayerView | null;
}

export type ResolveCaller = (bearerToken: string) => Promise<string | null>;
export type ReadLeaderboard = (
  boardKey: typeof LIFETIME_GOLD_BOARD_KEY,
  limit: number,
  callerId: string | null,
) => Promise<LeaderboardReadResult>;

/** Extracts the token from `Authorization: Bearer <token>`, or null if absent/malformed. */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match === null ? null : match[1];
}

export function parseLeaderboardLimit(value: string | null): number | null {
  if (value === null || value === '') {
    return DEFAULT_LEADERBOARD_LIMIT;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LEADERBOARD_LIMIT
    ? limit
    : null;
}

export async function handleLeaderboardRead(
  request: Request,
  resolveCaller: ResolveCaller,
  readLeaderboard: ReadLeaderboard,
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

  const url = new URL(request.url);
  const boardKey = url.searchParams.get('board_key') ?? LIFETIME_GOLD_BOARD_KEY;
  if (boardKey !== LIFETIME_GOLD_BOARD_KEY) {
    return errorResponse(400, 'malformed_request', 'Unsupported leaderboard board.', {
      detail: { boardKey },
      origin,
    });
  }

  const limit = parseLeaderboardLimit(url.searchParams.get('limit'));
  if (limit === null) {
    return errorResponse(400, 'malformed_request', 'Leaderboard limit is invalid.', {
      detail: { max: MAX_LEADERBOARD_LIMIT },
      origin,
    });
  }

  const authorization = request.headers.get('authorization');
  let callerId: string | null = null;
  if (authorization !== null) {
    const token = extractBearerToken(authorization);
    if (token === null) {
      return errorResponse(401, 'unauthenticated', 'Malformed bearer token.', { origin });
    }

    callerId = await resolveCaller(token);
    if (callerId === null) {
      return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
    }
  }

  return jsonResponse(200, await readLeaderboard(LIFETIME_GOLD_BOARD_KEY, limit, callerId), origin);
}

interface SupabaseLeaderboardRow {
  readonly display_name: string | null;
  readonly metric_exact: string;
  readonly metric_log10: number;
  readonly updated_at: string;
}

interface SupabaseOwnLeaderboardRow extends SupabaseLeaderboardRow {
  readonly user_id: string;
}

export function calculateLeaderboardRank(
  rows: readonly SupabaseOwnLeaderboardRow[],
  callerId: string,
): number | null {
  const caller = rows.find((row) => row.user_id === callerId);
  if (caller === undefined) {
    return null;
  }

  return (
    rows.filter(
      (row) =>
        row.metric_log10 > caller.metric_log10 ||
        (row.metric_log10 === caller.metric_log10 && row.updated_at < caller.updated_at),
    ).length + 1
  );
}

function toEntryView(row: SupabaseLeaderboardRow, rank: number): LeaderboardEntryView {
  return {
    rank,
    displayName: row.display_name,
    metricExact: row.metric_exact,
  };
}

function toPlayerView(row: SupabaseLeaderboardRow, rank: number): LeaderboardPlayerView {
  return {
    rank,
    displayName: row.display_name,
    metricExact: row.metric_exact,
  };
}

/**
 * Resolves the optional caller through GoTrue, then reads board data with the
 * service role so it can calculate a rank without returning `user_id` to the
 * browser. This function is read-only; `save-sync` remains the sole publisher.
 */
async function resolveCallerViaSupabaseAuth(bearerToken: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('leaderboard-read: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(bearerToken);
  return error || !data.user ? null : data.user.id;
}

async function readLeaderboardViaSupabase(
  boardKey: typeof LIFETIME_GOLD_BOARD_KEY,
  limit: number,
  callerId: string | null,
): Promise<LeaderboardReadResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('leaderboard-read: Supabase service configuration is missing.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [topRows, ownRow] = await Promise.all([
    admin
      .from('leaderboard_entries')
      .select('display_name, metric_exact, metric_log10, updated_at')
      .eq('board_key', boardKey)
      .order('metric_log10', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(limit),
    callerId === null
      ? Promise.resolve({ data: null, error: null })
      : admin
        .from('leaderboard_entries')
        .select('user_id, display_name, metric_exact, metric_log10, updated_at')
        .eq('board_key', boardKey)
        .eq('user_id', callerId)
        .maybeSingle(),
  ]);

  if (topRows.error) {
    throw new Error(`leaderboard-read: board lookup failed: ${topRows.error.message}`);
  }
  if (ownRow.error) {
    throw new Error(`leaderboard-read: player lookup failed: ${ownRow.error.message}`);
  }

  const own = ownRow.data as SupabaseOwnLeaderboardRow | null;
  let player: LeaderboardPlayerView | null = null;
  if (own !== null) {
    const rankingRows: SupabaseOwnLeaderboardRow[] = [];
    for (let offset = 0; ; offset += LEADERBOARD_PAGE_SIZE) {
      const page = await admin
        .from('leaderboard_entries')
        .select('user_id, display_name, metric_exact, metric_log10, updated_at')
        .eq('board_key', boardKey)
        .order('metric_log10', { ascending: false })
        .order('updated_at', { ascending: true })
        .range(offset, offset + LEADERBOARD_PAGE_SIZE - 1);

      if (page.error) {
        throw new Error(`leaderboard-read: rank lookup failed: ${page.error.message}`);
      }

      rankingRows.push(...(page.data as SupabaseOwnLeaderboardRow[]));
      if (page.data.length < LEADERBOARD_PAGE_SIZE) {
        break;
      }
    }

    const rank = calculateLeaderboardRank(rankingRows, own.user_id);
    if (rank !== null) {
      player = toPlayerView(own, rank);
    }
  }

  const entries = (topRows.data as SupabaseLeaderboardRow[]).map((row, index) =>
    toEntryView(row, index + 1),
  );

  return { boardKey, entries, player };
}

if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleLeaderboardRead(
        request,
        resolveCallerViaSupabaseAuth,
        readLeaderboardViaSupabase,
      );
    } catch (error) {
      console.error('leaderboard-read: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Unhandled error.', {
        origin: request.headers.get('origin'),
      });
    }
  });
}
