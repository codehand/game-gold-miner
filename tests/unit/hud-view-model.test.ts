import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateLevelEffect,
  calculateMineProductionRates,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';
import {
  createHudViewModel,
  createMineViewModel,
  formatAmount,
} from '../../src/game/view-model';

const FIXTURE_TIMESTAMP_MS = 1_700_000_000_000;

function createFreshState(): GameState {
  return createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);
}

function readHud(state: GameState) {
  return createHudViewModel(state, BASE_GAME_BALANCE);
}

/** The rate the core itself would calculate, so no expectation restates it. */
function expectedIncomeLabel(state: GameState): string {
  return formatAmount(
    calculateMineProductionRates(state, BASE_GAME_BALANCE)
      .effectiveProductionPerSecond,
  );
}

describe('hud view model', () => {
  it('uses resource icons without duplicate HUD captions', () => {
    const hud = readHud(createFreshState());

    expect(hud.goldLabel).toBe('');
    expect(hud.incomeLabel).toBe('');
  });

  it('shows the authoritative gold balance', () => {
    const state = createFreshState();

    expect(readHud(state).goldValueLabel).toBe(
      formatAmount(GameNumber.from(BASE_GAME_BALANCE.startingGold)),
    );
    expect(
      readHud({ ...state, gold: GameNumber.from(4_212.7) }).goldValueLabel,
    ).toBe('4.2k');
    expect(
      readHud({ ...state, gold: GameNumber.from(2_000_000) }).goldValueLabel,
    ).toBe('2.0m');
  });

  it('abbreviates a balance far past the safe numeric range', () => {
    const state = createFreshState();

    expect(
      readHud({ ...state, gold: GameNumber.from('1.46e16') }).goldValueLabel,
    ).toBe('14.6qa');
  });

  it('estimates income from the mine rate, not from the shafts alone', () => {
    const state = createFreshState();
    const rates = calculateMineProductionRates(state, BASE_GAME_BALANCE);

    // A fresh mine runs one level-one shaft, so extraction is the slow stage
    // and the estimate is that shaft's own rate.
    expect(rates.bottleneck).toBe('extraction');
    expect(readHud(state).incomeValueLabel).toBe(expectedIncomeLabel(state));
    expect(readHud(state).incomeValueLabel).toBe(
      formatAmount(rates.aggregateExtractionPerSecond),
    );
  });

  it('follows the bottleneck down to the slowest shared stage', () => {
    const base = createFreshState();
    // Four high-level shafts out-produce the starting elevator by a wide
    // margin, so the HUD must promise what transport can move.
    const extractionHeavy: GameState = {
      ...base,
      floors: base.floors.map((floor) => {
        return { ...floor, isUnlocked: true, mineShaftLevel: 30 };
      }),
    };
    const rates = calculateMineProductionRates(
      extractionHeavy,
      BASE_GAME_BALANCE,
    );

    expect(rates.bottleneck).toBe('elevator');
    expect(
      rates.effectiveProductionPerSecond.lessThan(
        rates.aggregateExtractionPerSecond,
      ),
    ).toBe(true);
    expect(readHud(extractionHeavy).incomeValueLabel).toBe(
      expectedIncomeLabel(extractionHeavy),
    );
  });

  it('rises when an upgrade widens the stage the mine is waiting on', () => {
    const base = createFreshState();
    const upgradedElevatorCapacity = calculateLevelEffect(
      BASE_GAME_BALANCE.elevator.baseCapacity,
      12,
      BASE_GAME_BALANCE.elevator.upgrade,
    );
    const transportLimited: GameState = {
      ...base,
      floors: base.floors.map((floor) => {
        return { ...floor, isUnlocked: true, mineShaftLevel: 30 };
      }),
    };
    const widened: GameState = {
      ...transportLimited,
      elevator: {
        ...transportLimited.elevator,
        level: 12,
        capacity: upgradedElevatorCapacity,
      },
    };

    expect(readHud(widened).incomeValueLabel).not.toBe(
      readHud(transportLimited).incomeValueLabel,
    );
    expect(
      calculateMineProductionRates(widened, BASE_GAME_BALANCE)
        .effectiveProductionPerSecond.greaterThan(
          calculateMineProductionRates(transportLimited, BASE_GAME_BALANCE)
            .effectiveProductionPerSecond,
        ),
    ).toBe(true);
  });

  it('is carried on the same snapshot the mine views are bound from', () => {
    const state = { ...createFreshState(), gold: GameNumber.from(7_500) };

    expect(createMineViewModel(state, BASE_GAME_BALANCE).hud).toEqual(
      readHud(state),
    );
  });

  it('does not mutate the authoritative snapshot it reads', () => {
    const state = createFreshState();
    const before = JSON.stringify(state);

    readHud(state);

    expect(JSON.stringify(state)).toBe(before);
  });
});
