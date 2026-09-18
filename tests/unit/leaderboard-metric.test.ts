import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  GameNumber,
  LIFETIME_GOLD_BOARD_KEY,
  calculateLifetimeGoldEarned,
  createInitialGameState,
  toLeaderboardMagnitude,
  type GameState,
} from '../../src/core';

/**
 * Server-milestone Step 27: leaderboard storage.
 *
 * `toLeaderboardMagnitude` is the pure half of the "magnitude-plus-exact"
 * representation `memory-bank/architecture.md`'s "How a `GameNumber` is
 * stored" requires: `leaderboard_entries.metric_exact` is what the player is
 * shown, `metric_log10` is what the ranking query sorts on, and a value past
 * `1e308` — which a plain `double` cannot hold at all — must still sort and
 * display correctly through this pair. These tests pin the pure conversion;
 * `tests/server-integration/leaderboard-storage.integration.test.ts` proves
 * the same property survives a round trip through the real table and its
 * ranking index.
 */
const TIMESTAMP_MS = 1_788_000_000_000;

function freshState(): GameState {
  return createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
}

describe('calculateLifetimeGoldEarned (Step 27 metric)', () => {
  it('is zero for a fresh save', () => {
    const state = freshState();
    expect(calculateLifetimeGoldEarned(state).equals(0)).toBe(true);
  });

  it('sums totalGoldDelivered and totalOfflineGoldClaimed, never current gold', () => {
    const state: GameState = {
      ...freshState(),
      gold: GameNumber.from(5),
      warehouse: {
        ...freshState().warehouse,
        totalGoldDelivered: GameNumber.from(120),
        totalOfflineGoldClaimed: GameNumber.from(30),
      },
    };

    const metric = calculateLifetimeGoldEarned(state);

    expect(metric.equals(150)).toBe(true);
    // A patient spender's current gold fell to 5, but the lifetime metric did
    // not — proving the metric tracks earning, not the fluctuating balance.
    expect(metric.greaterThan(state.gold)).toBe(true);
  });
});

describe('LIFETIME_GOLD_BOARD_KEY', () => {
  it('is a single all-time board key matching the table format constraint', () => {
    // Mirrors `leaderboard_entries_board_key_format`:
    // `^[a-z0-9][a-z0-9._-]{0,63}$` (supabase/migrations).
    expect(LIFETIME_GOLD_BOARD_KEY).toMatch(/^[a-z0-9][a-z0-9._-]{0,63}$/);
    expect(LIFETIME_GOLD_BOARD_KEY).toBe('lifetime-gold');
  });
});

describe('toLeaderboardMagnitude (Step 27 magnitude-plus-exact conversion)', () => {
  it('rejects zero and negative values', () => {
    expect(() => toLeaderboardMagnitude(GameNumber.from(0))).toThrow(
      /positive value/,
    );
    expect(() => toLeaderboardMagnitude(GameNumber.from(-5))).toThrow(
      /positive value/,
    );
  });

  it('produces an exact string that round-trips through GameNumber unchanged', () => {
    for (const source of ['1', '123.45', '999999', '1e50', '1e308', '1e400', '1e1000']) {
      const value = GameNumber.from(source);
      const magnitude = toLeaderboardMagnitude(value);

      expect(magnitude.exact).toBe(value.serialize());
      expect(GameNumber.from(magnitude.exact).equals(value)).toBe(true);
    }
  });

  it('computes an exact log10 for ordinary values, within floating-point precision', () => {
    const oneMagnitude = toLeaderboardMagnitude(GameNumber.from(1));
    expect(oneMagnitude.log10).toBeCloseTo(0, 10);

    const hundredMagnitude = toLeaderboardMagnitude(GameNumber.from(100));
    expect(hundredMagnitude.log10).toBeCloseTo(2, 10);

    const ordinaryMagnitude = toLeaderboardMagnitude(GameNumber.from('123.45'));
    expect(ordinaryMagnitude.log10).toBeCloseTo(Math.log10(123.45), 10);
  });

  it('stays finite past 1e308, where the value itself can no longer fit a double', () => {
    const pastDouble = toLeaderboardMagnitude(GameNumber.from('1e400'));
    expect(Number.isFinite(pastDouble.log10)).toBe(true);
    expect(pastDouble.log10).toBeCloseTo(400, 10);

    const wayPastDouble = toLeaderboardMagnitude(GameNumber.from('1e1000'));
    expect(Number.isFinite(wayPastDouble.log10)).toBe(true);
    expect(wayPastDouble.log10).toBeCloseTo(1000, 10);
  });

  it('sorts a full span — ordinary numbers through magnitudes past 1e308 — correctly by log10', () => {
    // Deliberately unordered input, spanning ordinary numbers, values that
    // straddle Number.MAX_VALUE (~1.7976931348623157e308), and magnitudes a
    // plain double cannot represent at all.
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
    ];

    const withMagnitude = sources.map((source) => ({
      source,
      value: GameNumber.from(source),
      magnitude: toLeaderboardMagnitude(GameNumber.from(source)),
    }));

    const sortedBySource = [...withMagnitude].sort(
      (a, b) => b.magnitude.log10 - a.magnitude.log10,
    );
    const sortedByTrueValue = [...withMagnitude].sort((a, b) => -a.value.compare(b.value));

    expect(sortedBySource.map((entry) => entry.source)).toEqual(
      sortedByTrueValue.map((entry) => entry.source),
    );
    // Pin the expected descending order explicitly, not just self-consistently.
    expect(sortedBySource.map((entry) => entry.source)).toEqual([
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
    ]);
  });
});
