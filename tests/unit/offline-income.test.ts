import { describe, expect, it } from 'vitest';

import {
  BASE_GAME_BALANCE,
  type OfflineIncomeConfig,
} from '../../src/config';
import {
  GameNumber,
  calculateOfflineGrant,
  calculateOfflineIncome,
  claimOfflineReward,
  createPendingOfflineReward,
  createInitialGameState,
} from '../../src/core';
import { formatCreditedDuration } from '../../src/ui';

const SAVED_AT_MS = 1_788_000_000_000;

describe('capped offline income', () => {
  it('returns zero reward for zero elapsed time and settles the timestamp', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);
    const result = calculateOfflineIncome(
      state,
      SAVED_AT_MS,
      SAVED_AT_MS,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(result.elapsedDurationMs).toBe(0);
    expect(result.creditedDurationMs).toBe(0);
    expect(result.reward.equals(0)).toBe(true);
    expect(result.state.lastUpdateTimestampMs).toBe(SAVED_AT_MS);
    expect(result.state.gold.equals(state.gold)).toBe(true);
    expect(state.lastUpdateTimestampMs).toBe(SAVED_AT_MS);
  });

  it('uses the saved rate and configured efficiency for a normal absence', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);
    const result = calculateOfflineIncome(
      state,
      SAVED_AT_MS,
      SAVED_AT_MS + 60 * 60 * 1_000,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(result.elapsedDurationMs).toBe(3_600_000);
    expect(result.creditedDurationMs).toBe(3_600_000);
    expect(result.reward.equals(18_000)).toBe(true);
    expect(result.state.gold.equals(state.gold)).toBe(true);
  });

  it('caps credited time at two hours', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);
    const result = calculateOfflineIncome(
      state,
      SAVED_AT_MS,
      SAVED_AT_MS + 24 * 60 * 60 * 1_000,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(result.elapsedDurationMs).toBe(86_400_000);
    expect(result.creditedDurationMs).toBe(7_200_000);
    expect(result.reward.equals(36_000)).toBe(true);
  });

  it('treats a future save timestamp as zero absence and replaces it with now', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS + 5_000);
    const result = calculateOfflineIncome(
      state,
      SAVED_AT_MS + 5_000,
      SAVED_AT_MS,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(result.elapsedDurationMs).toBe(0);
    expect(result.creditedDurationMs).toBe(0);
    expect(result.reward.equals(0)).toBe(true);
    expect(result.state.lastUpdateTimestampMs).toBe(SAVED_AT_MS);
    expect(state.lastUpdateTimestampMs).toBe(SAVED_AT_MS + 5_000);
  });

  it('keeps very large saved rates inside the GameNumber boundary', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);
    const result = calculateOfflineIncome(
      state,
      SAVED_AT_MS,
      SAVED_AT_MS + 2_000,
      GameNumber.from('1e100'),
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(result.reward.equals('1e100')).toBe(true);
  });

  it('rejects invalid timestamps, rates, caps, and efficiencies', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);
    const calculate = (
      savedAtTimestampMs: number,
      currentTimestampMs: number,
      rate: GameNumber,
      config: OfflineIncomeConfig = BASE_GAME_BALANCE.offlineIncome,
    ) => calculateOfflineIncome(
      state,
      savedAtTimestampMs,
      currentTimestampMs,
      rate,
      config,
    );

    expect(() => calculate(-1, SAVED_AT_MS, GameNumber.from(1)))
      .toThrow(/Saved timestamp/);
    expect(() => calculate(SAVED_AT_MS, 1.5, GameNumber.from(1)))
      .toThrow(/Current timestamp/);
    expect(() => calculate(SAVED_AT_MS, SAVED_AT_MS, GameNumber.from(-1)))
      .toThrow(/production rate/);
    expect(() => calculate(
      SAVED_AT_MS,
      SAVED_AT_MS,
      GameNumber.from(1),
      { capDurationMs: 0, efficiency: 0.5 },
    )).toThrow(/cap/);
    expect(() => calculate(
      SAVED_AT_MS,
      SAVED_AT_MS,
      GameNumber.from(1),
      { capDurationMs: 1_000, efficiency: 1.1 },
    )).toThrow(/efficiency/);
  });
});

describe('pending offline reward claims', () => {
  it('creates pending rewards only for positive calculated income', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);
    const positive = calculateOfflineIncome(
      state,
      SAVED_AT_MS,
      SAVED_AT_MS + 60_000,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );
    const zero = calculateOfflineIncome(
      state,
      SAVED_AT_MS,
      SAVED_AT_MS,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(createPendingOfflineReward(positive)).toMatchObject({
      creditedDurationMs: 60_000,
      reward: positive.reward,
    });
    expect(createPendingOfflineReward(zero)).toBeNull();
    expect(createPendingOfflineReward(null)).toBeNull();
  });

  it('adds the exact reward once and consumes the pending value', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);
    const pendingReward = {
      creditedDurationMs: 60_000,
      reward: GameNumber.from('12345678901234567890'),
    };
    const firstClaim = claimOfflineReward(state, pendingReward);
    const secondClaim = claimOfflineReward(
      firstClaim.state,
      firstClaim.pendingReward,
    );

    expect(firstClaim.status).toBe('claimed');
    expect(firstClaim.state.gold.equals(
      state.gold.add(pendingReward.reward),
    )).toBe(true);
    expect(firstClaim.pendingReward).toBeNull();
    expect(state.gold.equals(BASE_GAME_BALANCE.startingGold)).toBe(true);
    expect(secondClaim.status).toBe('no-pending-reward');
    expect(secondClaim.state).toBe(firstClaim.state);
    expect(secondClaim.state.gold.equals(firstClaim.state.gold)).toBe(true);
  });

  it('rejects malformed pending rewards', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);

    expect(() => claimOfflineReward(state, {
      creditedDurationMs: 0,
      reward: GameNumber.from(1),
    })).toThrow(/duration/);
    expect(() => claimOfflineReward(state, {
      creditedDurationMs: 1_000,
      reward: GameNumber.from(0),
    })).toThrow(/reward/);
  });

  it('formats credited time without introducing Step 28 number notation', () => {
    expect(formatCreditedDuration(30_000)).toBe('<1m');
    expect(formatCreditedDuration(60_000)).toBe('1m');
    expect(formatCreditedDuration(3_660_000)).toBe('1h 1m');
    expect(formatCreditedDuration(7_200_000)).toBe('2h');
    expect(() => formatCreditedDuration(-1)).toThrow(/duration/);
  });
});

describe('calculateOfflineGrant (Step 22)', () => {
  it('shares one formula with the client projection, so the two cannot drift (F4)', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, SAVED_AT_MS);
    const rate = GameNumber.from(12.5);
    const income = calculateOfflineIncome(
      state,
      SAVED_AT_MS,
      SAVED_AT_MS + 3_600_000,
      rate,
      BASE_GAME_BALANCE.offlineIncome,
    );
    const grant = calculateOfflineGrant(
      SAVED_AT_MS,
      SAVED_AT_MS + 3_600_000,
      rate,
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(grant.elapsedDurationMs).toBe(income.elapsedDurationMs);
    expect(grant.creditedDurationMs).toBe(income.creditedDurationMs);
    expect(grant.reward.serialize()).toBe(income.reward.serialize());
  });

  it('preserves the 7,200,000 ms cap and 0.5 efficiency exactly', () => {
    const grant = calculateOfflineGrant(
      SAVED_AT_MS,
      SAVED_AT_MS + 10 * 60 * 60 * 1_000,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(grant.creditedDurationMs).toBe(BASE_GAME_BALANCE.offlineIncome.capDurationMs);
    expect(grant.creditedDurationMs).toBe(7_200_000);
    // 10 × 7,200 s × 0.5.
    expect(grant.reward.serialize()).toBe('36000');
  });

  it('awards zero for a receipt after the current time, never a negative reward', () => {
    const grant = calculateOfflineGrant(
      SAVED_AT_MS,
      SAVED_AT_MS - 60_000,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );

    expect(grant.elapsedDurationMs).toBe(0);
    expect(grant.creditedDurationMs).toBe(0);
    expect(grant.reward.equals(0)).toBe(true);
  });

  it('rejects the same invalid inputs the income projection rejects', () => {
    const config = BASE_GAME_BALANCE.offlineIncome;
    const rate = GameNumber.from(10);

    expect(() => calculateOfflineGrant(-1, SAVED_AT_MS, rate, config)).toThrow(/Saved timestamp/);
    expect(() => calculateOfflineGrant(SAVED_AT_MS, -1, rate, config)).toThrow(/Current timestamp/);
    expect(() => calculateOfflineGrant(SAVED_AT_MS, SAVED_AT_MS, GameNumber.from(-1), config)).toThrow(/production rate/);
    expect(() => calculateOfflineGrant(
      SAVED_AT_MS,
      SAVED_AT_MS,
      rate,
      { ...config, capDurationMs: 0 },
    )).toThrow(/cap/);
    expect(() => calculateOfflineGrant(
      SAVED_AT_MS,
      SAVED_AT_MS,
      rate,
      { ...config, efficiency: 2 as OfflineIncomeConfig['efficiency'] },
    )).toThrow(/efficiency/);
  });
});
