import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GameNumber, toLeaderboardMagnitude } from '../../src/core';
import { LOCAL_ANON_KEY, mintFixtureUserToken } from './authFixture';
import { deleteAuthUsers, seedAuthUsers } from './directSqlFixture';
import {
  LEADERBOARD_ALLOWED_COLUMNS,
  LEADERBOARD_WITHHELD_COLUMN,
  refusedStatusFor,
} from './rlsMatrixFixture';
import { createServiceRoleClient } from './serviceRoleFixture';

/**
 * Server-milestone Step 27: leaderboard storage.
 *
 * `public.leaderboard_entries`, its `leaderboard_entries_rank_idx`, and its
 * RLS/grant matrix already exist from Step 3/Step 5
 * (`20260908130000_create_platform_tables.sql`) — Step 3 built the table
 * metric-agnostic on purpose (`architecture.md`'s "What Step 3 does not
 * design"). Step 27's own migration
 * (`20260918100000_leaderboard_lifetime_gold_board.sql`) pins the design
 * decisions `src/core/leaderboard/leaderboardMetric.ts` documents — metric,
 * board, tie-break — as table/column comments rather than a structural
 * change. This suite proves the two things the step's own "Test" line asks
 * for, against the real table:
 *
 * 1. "Values spanning ordinary numbers through magnitudes past `1e308` sort
 *    correctly and display exactly" — the magnitude-plus-exact round trip,
 *    plus the tie-break, through the real ranking index.
 * 2. "A ranking query over a realistic row count meets a stated latency
 *    budget" — 10,000 rows on one board (the "~10⁴ rows" scale
 *    `architecture.md`'s Indexes section already records), queried through
 *    the real REST API the way a leaderboard display would.
 *
 * A focused RLS check for this table also lives here; the exhaustive,
 * derived seven-table × four-verb × two-role matrix is Step 26's
 * `adversarial-rls.integration.test.ts` (attack 6), which already covers
 * `leaderboard_entries` and is not duplicated.
 */
const API_URL = 'http://127.0.0.1:54321';
const REST_URL = `${API_URL}/rest/v1/leaderboard_entries`;
const LATENCY_SCALE_HOOK_TIMEOUT_MS = 60_000;

function randomBoardKey(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`;
}

function leaderboardRequest(query: string, accessToken?: string): Promise<Response> {
  return fetch(`${REST_URL}${query}`, {
    headers: {
      apikey: LOCAL_ANON_KEY,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

describe('leaderboard storage (Step 27)', () => {
  describe('magnitude-plus-exact sort and display, through the real table', () => {
    const boardKey = randomBoardKey('sort');
    const admin = createServiceRoleClient(API_URL);
    const userIds: string[] = [];

    // Deliberately unordered, spanning ordinary numbers, values that straddle
    // Number.MAX_VALUE (~1.7976931348623157e308, past which a plain double
    // cannot hold the value at all), and magnitudes further still.
    const sources = [
      '1e1000',
      '0.01',
      '1',
      '1e308',
      '999999',
      '9.999e307',
      '123.45',
      '1e400',
      '1e309',
      '1.0000001e308',
    ] as const;
    const expectedDescendingOrder = [
      '1e1000',
      '1e400',
      '1e309',
      '1.0000001e308',
      '1e308',
      '9.999e307',
      '999999',
      '123.45',
      '1',
      '0.01',
    ];

    beforeAll(async () => {
      userIds.push(...sources.map(() => randomUUID()));
      seedAuthUsers(userIds);

      const rows = sources.map((source, index) => {
        const magnitude = toLeaderboardMagnitude(GameNumber.from(source));
        return {
          board_key: boardKey,
          user_id: userIds[index],
          display_name: `Sort Probe ${index}`,
          metric_exact: magnitude.exact,
          metric_log10: magnitude.log10,
          source_revision: 1,
        };
      });

      const { error } = await admin.from('leaderboard_entries').insert(rows);
      if (error) {
        throw new Error(`seeding sort-order rows failed: ${error.message}`);
      }
    });

    afterAll(async () => {
      await admin.from('leaderboard_entries').delete().eq('board_key', boardKey);
      deleteAuthUsers(userIds);
    });

    it('sorts every magnitude from ordinary numbers through past 1e308 correctly, and displays each exactly', async () => {
      const response = await leaderboardRequest(
        `?board_key=eq.${boardKey}&select=display_name,metric_exact,metric_log10&order=metric_log10.desc,updated_at.asc`,
      );

      expect(response.status).toBe(200);
      const board = (await response.json()) as Array<{
        display_name: string;
        metric_exact: string;
        metric_log10: number;
      }>;

      expect(board).toHaveLength(sources.length);

      // Ranking order matches the true magnitude order, not merely a stable
      // re-ordering of the input.
      const orderedBySourceIndex = board.map((row) =>
        Number(row.display_name.replace('Sort Probe ', '')),
      );
      const expectedIndices = expectedDescendingOrder.map((source) =>
        sources.indexOf(source as (typeof sources)[number]),
      );
      expect(orderedBySourceIndex).toEqual(expectedIndices);

      // Display is exact: what comes back is GameNumber's own canonical
      // serialization of the original source, unchanged by the round trip
      // through Postgres `text` storage and PostgREST JSON encoding.
      for (const [index, source] of expectedDescendingOrder.entries()) {
        const expectedExact = GameNumber.from(source).serialize();
        expect(board[index].metric_exact).toBe(expectedExact);
        expect(GameNumber.from(board[index].metric_exact).equals(GameNumber.from(source))).toBe(
          true,
        );
      }
    });
  });

  describe('tie-break: earliest to reach the score ranks first', () => {
    const boardKey = randomBoardKey('tie');
    const admin = createServiceRoleClient(API_URL);
    const earlierUserId = randomUUID();
    const laterUserId = randomUUID();
    const userIds = [earlierUserId, laterUserId];

    beforeAll(async () => {
      seedAuthUsers(userIds);

      const tiedMagnitude = toLeaderboardMagnitude(GameNumber.from('5000'));
      const { error } = await admin.from('leaderboard_entries').insert([
        {
          board_key: boardKey,
          user_id: earlierUserId,
          display_name: 'Earlier',
          metric_exact: tiedMagnitude.exact,
          metric_log10: tiedMagnitude.log10,
          source_revision: 1,
          updated_at: '2026-09-01T00:00:00Z',
        },
        {
          board_key: boardKey,
          user_id: laterUserId,
          display_name: 'Later',
          metric_exact: tiedMagnitude.exact,
          metric_log10: tiedMagnitude.log10,
          source_revision: 1,
          updated_at: '2026-09-02T00:00:00Z',
        },
      ]);
      if (error) {
        throw new Error(`seeding tie-break rows failed: ${error.message}`);
      }
    });

    afterAll(async () => {
      await admin.from('leaderboard_entries').delete().eq('board_key', boardKey);
      deleteAuthUsers(userIds);
    });

    it('ranks the earlier updated_at first when metric_log10 ties', async () => {
      const response = await leaderboardRequest(
        `?board_key=eq.${boardKey}&select=display_name&order=metric_log10.desc,updated_at.asc`,
      );

      expect(response.status).toBe(200);
      const board = (await response.json()) as Array<{ display_name: string }>;
      expect(board.map((row) => row.display_name)).toEqual(['Earlier', 'Later']);
    });
  });

  describe('row-level security for the new table', () => {
    const boardKey = randomBoardKey('rls');
    const admin = createServiceRoleClient(API_URL);
    const userId = randomUUID();

    beforeAll(async () => {
      seedAuthUsers([userId]);
      const magnitude = toLeaderboardMagnitude(GameNumber.from('42'));
      const { error } = await admin.from('leaderboard_entries').insert({
        board_key: boardKey,
        user_id: userId,
        display_name: 'RLS Probe',
        metric_exact: magnitude.exact,
        metric_log10: magnitude.log10,
        source_revision: 1,
      });
      if (error) {
        throw new Error(`seeding RLS-probe row failed: ${error.message}`);
      }
    });

    afterAll(async () => {
      await admin.from('leaderboard_entries').delete().eq('board_key', boardKey);
      deleteAuthUsers([userId]);
    });

    it('lets an unauthenticated caller read every published column of the board', async () => {
      const response = await leaderboardRequest(
        `?board_key=eq.${boardKey}&select=${LEADERBOARD_ALLOWED_COLUMNS.join(',')}`,
      );

      expect(response.status).toBe(200);
      const board = (await response.json()) as Array<Record<string, unknown>>;
      expect(board).toHaveLength(1);
      expect(board[0].display_name).toBe('RLS Probe');
      expect(board[0]).not.toHaveProperty(LEADERBOARD_WITHHELD_COLUMN);
    });

    it("withholds user_id even from an authenticated caller reading their own board entry", async () => {
      const token = mintFixtureUserToken({ userId });
      const response = await leaderboardRequest(
        `?board_key=eq.${boardKey}&select=${LEADERBOARD_WITHHELD_COLUMN}`,
        token,
      );

      // Full matrix (per-role status, §4 code) is attack 6's job; this pins
      // the property Step 27 cares about — the column stays unreadable even
      // for the row's own owner, because the control is the grant, not a row
      // policy that could be read as "owners see their own id".
      expect(response.status).toBe(refusedStatusFor('authenticated'));
      expect((await response.json()).code).toBe('42501');
    });

    it('refuses a direct client write, from anon and from the row owner alike', async () => {
      const token = mintFixtureUserToken({ userId });
      const magnitude = toLeaderboardMagnitude(GameNumber.from('999'));
      const body = JSON.stringify({
        board_key: boardKey,
        user_id: userId,
        metric_exact: magnitude.exact,
        metric_log10: magnitude.log10,
        source_revision: 2,
      });

      for (const role of ['anon', 'authenticated'] as const) {
        const accessToken = role === 'authenticated' ? token : undefined;
        const response = await fetch(`${REST_URL}?board_key=eq.${boardKey}`, {
          method: 'PATCH',
          headers: {
            apikey: LOCAL_ANON_KEY,
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
            'content-type': 'application/json',
            prefer: 'return=representation',
          },
          body,
          signal: AbortSignal.timeout(20_000),
        });

        // No UPDATE policy exists for either client role, which would
        // ordinarily mean "filtered, 200 with []" — but this table's
        // table-level SELECT grant is also revoked (only specific columns are
        // granted; see the RLS-read tests above), so the `RETURNING`
        // representation this `Prefer` header asks for cannot be built at
        // all. `rlsMatrixFixture.ts`'s `rlsCellExpectation` derives exactly
        // this refusal (`tableSelectRevoked`) for this table's UPDATE cell —
        // the specific `42501` refusal, not merely "not 200".
        expect(response.status, role).toBe(refusedStatusFor(role));
        expect((await response.json()).code, role).toBe('42501');
      }

      const stored = await admin
        .from('leaderboard_entries')
        .select('source_revision')
        .eq('board_key', boardKey)
        .eq('user_id', userId)
        .single();
      expect(stored.data?.source_revision).toBe(1);
    });
  });

  describe('ranking query latency at a realistic row count (~10^4 rows, one board)', () => {
    const boardKey = randomBoardKey('scale');
    const admin = createServiceRoleClient(API_URL);
    const ROW_COUNT = 10_000;
    const INSERT_BATCH_SIZE = 1_000;
    /**
     * Stated budget: the ranking query — `board_key=eq.<key>`, ordered by
     * `metric_log10 desc, updated_at asc`, `limit=100` — end-to-end through
     * the real REST API (Kong → PostgREST → the indexed query), over the
     * ~10⁴-row scale `architecture.md`'s Indexes section already records for
     * this schema. 300 ms leaves generous headroom above a local, indexed,
     * top-100-of-10,000 query for the CI/runner variance every other budget
     * in this suite already accepts.
     */
    const LATENCY_BUDGET_MS = 300;
    let userIds: string[] = [];

    beforeAll(async () => {
      userIds = Array.from({ length: ROW_COUNT }, () => randomUUID());
      seedAuthUsers(userIds);

      const rows = userIds.map((userId, index) => {
        // A wide, realistic-looking spread: ordinary balances through
        // magnitudes an idle economy can plausibly reach over its lifetime,
        // generated directly in magnitude-plus-exact form rather than through
        // 10,000 `GameNumber` constructions, which the latency budget below
        // is not measuring.
        const mantissa = 1 + ((index * 9301 + 49297) % 9000) / 1000;
        const exponent = index % 60;
        return {
          board_key: boardKey,
          user_id: userId,
          display_name: `Scale ${index}`,
          metric_exact: `${mantissa.toFixed(4)}e+${exponent}`,
          metric_log10: Math.log10(mantissa) + exponent,
          source_revision: 1,
        };
      });

      for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
        const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
        const { error } = await admin.from('leaderboard_entries').insert(batch);
        if (error) {
          throw new Error(`seeding scale rows [${start}, ${start + batch.length}) failed: ${error.message}`);
        }
      }
    }, LATENCY_SCALE_HOOK_TIMEOUT_MS);

    afterAll(() => {
      // One bulk delete via the same escape hatch — 10,000 individual
      // PostgREST deletes would itself blow every timeout in this suite, and
      // `on delete cascade` from `auth.users` removes the leaderboard rows in
      // the same statement.
      deleteAuthUsers(userIds);
    }, LATENCY_SCALE_HOOK_TIMEOUT_MS);

    it(`ranks the top 100 of ${ROW_COUNT} rows within ${LATENCY_BUDGET_MS} ms, through the real REST API`, async () => {
      const query = `?board_key=eq.${boardKey}&select=display_name,metric_exact,metric_log10&order=metric_log10.desc,updated_at.asc&limit=100`;

      // One untimed warm-up request first, so the measurement below is not
      // dominated by connection setup / plan-cache cold-start noise that has
      // nothing to do with the index the assertion is actually about.
      const warmUp = await leaderboardRequest(query);
      expect(warmUp.status).toBe(200);

      const measurements: number[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const startedAtMs = performance.now();
        const response = await leaderboardRequest(query);
        const elapsedMs = performance.now() - startedAtMs;

        expect(response.status).toBe(200);
        const board = (await response.json()) as Array<{ metric_log10: number }>;
        expect(board).toHaveLength(100);
        // The result is actually ranked, not merely fast: descending log10.
        for (let index = 1; index < board.length; index += 1) {
          expect(board[index].metric_log10).toBeLessThanOrEqual(board[index - 1].metric_log10);
        }

        measurements.push(elapsedMs);
      }

      for (const elapsedMs of measurements) {
        expect(elapsedMs).toBeLessThan(LATENCY_BUDGET_MS);
      }
    });
  });
});
