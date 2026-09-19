import assert from 'node:assert/strict';

import {
  calculateLeaderboardRank,
  DEFAULT_LEADERBOARD_LIMIT,
  handleLeaderboardRead,
  LIFETIME_GOLD_BOARD_KEY,
  MAX_LEADERBOARD_LIMIT,
  parseLeaderboardLimit,
} from './index.ts';

Deno.test('parseLeaderboardLimit uses a bounded default and rejects unsafe values', () => {
  assert.equal(parseLeaderboardLimit(null), DEFAULT_LEADERBOARD_LIMIT);
  assert.equal(parseLeaderboardLimit('25'), 25);
  assert.equal(parseLeaderboardLimit(String(MAX_LEADERBOARD_LIMIT)), MAX_LEADERBOARD_LIMIT);
  assert.equal(parseLeaderboardLimit('0'), null);
  assert.equal(parseLeaderboardLimit('101'), null);
  assert.equal(parseLeaderboardLimit('1.5'), null);
});

Deno.test('handleLeaderboardRead serves public rows without requiring a caller token', async () => {
  const response = await handleLeaderboardRead(
    new Request('http://localhost/functions/v1/leaderboard-read?limit=2'),
    () => {
      throw new Error('resolveCaller must not run for a public request.');
    },
    async (boardKey, limit, callerId) => {
      assert.equal(boardKey, LIFETIME_GOLD_BOARD_KEY);
      assert.equal(limit, 2);
      assert.equal(callerId, null);
      return {
        boardKey,
        entries: [
          { rank: 1, displayName: 'Top Miner', metricExact: '1e1000' },
        ],
        player: null,
      };
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    boardKey: LIFETIME_GOLD_BOARD_KEY,
    entries: [{ rank: 1, displayName: 'Top Miner', metricExact: '1e1000' }],
    player: null,
  });
});

Deno.test('handleLeaderboardRead authenticates an optional caller before reading own rank', async () => {
  const response = await handleLeaderboardRead(
    new Request('http://localhost/functions/v1/leaderboard-read', {
      headers: { authorization: 'Bearer good-token' },
    }),
    async (token) => {
      assert.equal(token, 'good-token');
      return 'caller-id';
    },
    async (boardKey, limit, callerId) => ({
      boardKey,
      entries: [],
      player: callerId === 'caller-id'
        ? { rank: limit, displayName: 'Me', metricExact: '12345' }
        : null,
    }),
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).player.rank, DEFAULT_LEADERBOARD_LIMIT);
});

Deno.test('calculateLeaderboardRank follows metric desc and updated_at asc ordering', () => {
  const rows = [
    {
      user_id: 'top',
      display_name: 'Top',
      metric_exact: '1e1000',
      metric_log10: 1000,
      updated_at: '2026-09-03T00:00:00.000Z',
    },
    {
      user_id: 'tie-before',
      display_name: 'Tie before',
      metric_exact: '12345',
      metric_log10: 4.091491094267951,
      updated_at: '2026-09-01T00:00:00.000Z',
    },
    {
      user_id: 'caller',
      display_name: 'Caller',
      metric_exact: '12345',
      metric_log10: 4.091491094267951,
      updated_at: '2026-09-02T00:00:00.000Z',
    },
  ];

  assert.equal(calculateLeaderboardRank(rows, 'caller'), 3);
  assert.equal(calculateLeaderboardRank(rows, 'missing'), null);
});

Deno.test('handleLeaderboardRead rejects malformed board, limit, method, and token inputs', async () => {
  const read = async () => {
    throw new Error('readLeaderboard must not run for malformed requests.');
  };
  const resolve = async () => {
    throw new Error('resolveCaller must not run for malformed requests.');
  };

  const unsupportedBoard = await handleLeaderboardRead(
    new Request('http://localhost/functions/v1/leaderboard-read?board_key=weekly'),
    resolve,
    read,
  );
  assert.equal(unsupportedBoard.status, 400);

  const invalidLimit = await handleLeaderboardRead(
    new Request('http://localhost/functions/v1/leaderboard-read?limit=101'),
    resolve,
    read,
  );
  assert.equal(invalidLimit.status, 400);

  const unsupportedMethod = await handleLeaderboardRead(
    new Request('http://localhost/functions/v1/leaderboard-read', { method: 'POST' }),
    resolve,
    read,
  );
  assert.equal(unsupportedMethod.status, 400);

  const malformedToken = await handleLeaderboardRead(
    new Request('http://localhost/functions/v1/leaderboard-read', {
      headers: { authorization: 'Basic token' },
    }),
    resolve,
    read,
  );
  assert.equal(malformedToken.status, 401);
});

Deno.test('handleLeaderboardRead returns 401 when the caller token is rejected', async () => {
  const response = await handleLeaderboardRead(
    new Request('http://localhost/functions/v1/leaderboard-read', {
      headers: { authorization: 'Bearer expired-token' },
    }),
    async () => null,
    async () => {
      throw new Error('readLeaderboard must not run for an invalid token.');
    },
  );

  assert.equal(response.status, 401);
});

Deno.test('handleLeaderboardRead answers CORS preflight before auth or database access', async () => {
  const response = await handleLeaderboardRead(
    new Request('http://localhost/functions/v1/leaderboard-read', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    }),
    () => {
      throw new Error('resolveCaller must not run for preflight.');
    },
    async () => {
      throw new Error('readLeaderboard must not run for preflight.');
    },
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
});
