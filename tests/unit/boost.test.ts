import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  activateBoost,
  boostAvailableAtMs,
  boostOverlapMs,
  BOOST_COOLDOWN_MS,
  BOOST_DURATION_MS,
  catchUpSimulation,
  calculateOfflineGrant,
  createInitialGameState,
  EMPTY_BOOST_STATE,
  GameNumber,
  isBoostActive,
} from '../../src/core';

describe('Mine Overdrive', () => {
  it('activates once, ends after five minutes and recharges after eight hours', () => {
    const activation = activateBoost(EMPTY_BOOST_STATE, 1_000);
    expect(activation.kind).toBe('activated');
    if (activation.kind !== 'activated') return;

    expect(isBoostActive(activation.boost, 1_000)).toBe(true);
    expect(isBoostActive(activation.boost, 1_000 + BOOST_DURATION_MS - 1)).toBe(true);
    expect(isBoostActive(activation.boost, 1_000 + BOOST_DURATION_MS)).toBe(false);
    expect(activateBoost(activation.boost, 2_000)).toEqual({
      kind: 'cooldown',
      availableAtMs: 1_000 + BOOST_COOLDOWN_MS,
    });
    expect(boostAvailableAtMs(activation.boost)).toBe(1_000 + BOOST_COOLDOWN_MS);
    expect(activateBoost(activation.boost, 1_000 + BOOST_COOLDOWN_MS).kind).toBe('activated');
  });

  it('runs all fixed-step stages four times faster only inside the active interval', () => {
    const boost = { lastActivatedAtMs: 0 };
    const state = createInitialGameState(BASE_GAME_BALANCE, BOOST_DURATION_MS - 100);
    const result = catchUpSimulation(state, 200, BASE_GAME_BALANCE, undefined, boost);
    const ordinary = catchUpSimulation(state, 200, BASE_GAME_BALANCE);

    expect(result.simulationTick).toBe(5);
    expect(ordinary.simulationTick).toBe(2);
    expect(result.lastUpdateTimestampMs).toBe(BOOST_DURATION_MS + 100);
    expect(result.simulationRemainderMs).toBe(0);
  });

  it('boosts only the overlap of the credited offline interval', () => {
    const boost = { lastActivatedAtMs: 1_000 };
    expect(boostOverlapMs(boost, 0, 2_000)).toBe(1_000);
    const grant = calculateOfflineGrant(
      0,
      BOOST_DURATION_MS + 2_000,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
      boost,
    );
    const baseline = calculateOfflineGrant(
      0,
      BOOST_DURATION_MS + 2_000,
      GameNumber.from(10),
      BASE_GAME_BALANCE.offlineIncome,
    );
    expect(grant.reward.subtract(baseline.reward).serialize()).toBe('4500');
  });
});
