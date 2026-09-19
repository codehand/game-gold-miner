import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GameNumber, LIFETIME_GOLD_BOARD_KEY, toLeaderboardMagnitude } from '../../src/core';
import { FIXTURE_USER_ID, mintFixtureUserToken } from './authFixture';
import { deleteAuthUsers, seedAuthUsers } from './directSqlFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 29: leaderboard display read path.
 *
 * Direct PostgREST reads can see the public board columns but cannot select
 * `user_id`, by design. The Edge Function therefore returns the top board rows
 * plus the authenticated caller's own rank without ever returning an account
 * id. The exact metric string is kept intact for the client formatter.
 */
const API_URL = 'http://127.0.0.1:54321';
const LEADERBOARD_URL = `${API_URL}/functions/v1/leaderboard-read`;

interface SeedRow {
  readonly userId: string;
  readonly value: string;
  readonly displayName: string;
  readonly updatedAt: string;
}

function readLeaderboard(token?: string, query = ''): Promise<Response> {
  return fetch(`${LEADERBOARD_URL}${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(20_000),
  });
}

describe('leaderboard-read (server-milestone Step 29)', () => {
  const admin = createServiceRoleClient(API_URL);
  const rows: readonly SeedRow[] = [
    {
      userId: randomUUID(),
      value: '1e1000',
      displayName: 'Deep Miner',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      userId: randomUUID(),
      value: '1e400',
      displayName: 'Sky Miner',
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
    {
      userId: randomUUID(),
      value: '1e308',
      displayName: 'Dev Guest',
      updatedAt: '2026-09-03T00:00:00.000Z',
    },
    {
      userId: FIXTURE_USER_ID,
      value: '12345',
      displayName: 'Starter Miner',
      updatedAt: '2026-09-04T00:00:00.000Z',
    },
  ];

  beforeAll(async () => {
    seedAuthUsers(rows
      .filter((row) => row.userId !== FIXTURE_USER_ID)
      .map((row) => row.userId));
    const { error } = await admin.from('leaderboard_entries').insert(
      rows.map((row) => {
        const magnitude = toLeaderboardMagnitude(GameNumber.from(row.value));
        return {
          board_key: LIFETIME_GOLD_BOARD_KEY,
          user_id: row.userId,
          display_name: row.displayName,
          metric_exact: magnitude.exact,
          metric_log10: magnitude.log10,
          source_revision: 1,
          updated_at: row.updatedAt,
        };
      }),
    );
    expect(error).toBeNull();
  });

  afterAll(async () => {
    const { error } = await admin
      .from('leaderboard_entries')
      .delete()
      .eq('board_key', LIFETIME_GOLD_BOARD_KEY)
      .in('user_id', rows.map((row) => row.userId));
    expect(error).toBeNull();
    deleteAuthUsers(rows
      .filter((row) => row.userId !== FIXTURE_USER_ID)
      .map((row) => row.userId));
  });

  it('returns public top rows with exact metric strings and no account ids', async () => {
    const response = await readLeaderboard(undefined, '?limit=3');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ boardKey: LIFETIME_GOLD_BOARD_KEY, player: null });
    expect(body.entries).toEqual([
      { rank: 1, displayName: 'Deep Miner', metricExact: '1e+1000' },
      { rank: 2, displayName: 'Sky Miner', metricExact: '1e+400' },
      { rank: 3, displayName: 'Dev Guest', metricExact: '1e+308' },
    ]);
    expect(JSON.stringify(body)).not.toContain('user_id');
  });

  it('returns the authenticated player rank even when the player is outside the visible top limit', async () => {
    const caller = rows[3];
    const { data: allRows, error } = await admin
      .from('leaderboard_entries')
      .select('user_id, metric_log10, updated_at')
      .eq('board_key', LIFETIME_GOLD_BOARD_KEY);
    expect(error).toBeNull();
    const callerRow = allRows?.find((row) => row.user_id === caller.userId);
    expect(callerRow).toBeDefined();
    const expectedRank = 1 + (allRows ?? []).filter((row) =>
      row.metric_log10 > callerRow!.metric_log10 ||
      (row.metric_log10 === callerRow!.metric_log10 && row.updated_at < callerRow!.updated_at)
    ).length;

    const response = await readLeaderboard(
      mintFixtureUserToken({ userId: caller.userId }),
      '?limit=2',
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries).toHaveLength(2);
    expect(body.player).toEqual({
      rank: expectedRank,
      displayName: caller.displayName,
      metricExact: '12345',
    });
  });

  it('rejects a supplied invalid token instead of silently hiding the caller rank', async () => {
    const response = await readLeaderboard('not-a-real-token');

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthenticated');
  });
});
