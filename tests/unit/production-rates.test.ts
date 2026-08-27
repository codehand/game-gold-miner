import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateMineProductionRates,
  calculateTheoreticalFloorExtractionRate,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('production rates', () => {
  it('exposes each floor theoretical rate while aggregating unlocked floors', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const rates = calculateMineProductionRates(state, BASE_GAME_BALANCE);

    expect(
      rates.floors.map((floor) =>
        floor.theoreticalExtractionPerSecond.toJSON(),
      ),
    ).toEqual(['5', '12', '30', '77.14285714285714']);
    expect(rates.aggregateExtractionPerSecond.equals(5)).toBe(true);
    expect(rates.effectiveProductionPerSecond.equals(5)).toBe(true);
    expect(rates.bottleneck).toBe('extraction');
  });

  it('uses the current floor level in theoretical extraction', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const floor = {
      ...initialState.floors[0],
      mineShaftLevel: 3,
    };
    const rate = calculateTheoreticalFloorExtractionRate(
      floor,
      BASE_GAME_BALANCE.floors[0],
    );
    const expectedRate = GameNumber.from(10)
      .multiply(1.1 ** 2)
      .multiply(1_000 / 2_000);

    expect(rate.equals(expectedRate)).toBe(true);
  });

  it('reports the elevator when transport is the bottleneck', () => {
    const state = unlockAllFloors();
    const rates = calculateMineProductionRates(state, BASE_GAME_BALANCE);
    const expectedElevatorRate = GameNumber.from(50).multiply(1_000 / 1_500);

    expect(rates.aggregateExtractionPerSecond.greaterThan(expectedElevatorRate))
      .toBe(true);
    expect(rates.warehouseCapacityPerSecond.greaterThan(expectedElevatorRate))
      .toBe(true);
    expect(rates.effectiveProductionPerSecond.equals(expectedElevatorRate))
      .toBe(true);
    expect(rates.bottleneck).toBe('elevator');
  });

  it('reports the warehouse when conversion is the bottleneck', () => {
    const initialState = unlockAllFloors();
    const state: GameState = {
      ...initialState,
      elevator: {
        ...initialState.elevator,
        capacity: GameNumber.from(1_000),
      },
    };
    const rates = calculateMineProductionRates(state, BASE_GAME_BALANCE);
    const expectedWarehouseRate = GameNumber.from(60).multiply(1_000 / 1_200);

    expect(rates.aggregateExtractionPerSecond.greaterThan(expectedWarehouseRate))
      .toBe(true);
    expect(rates.elevatorCapacityPerSecond.greaterThan(expectedWarehouseRate))
      .toBe(true);
    expect(rates.effectiveProductionPerSecond.equals(expectedWarehouseRate))
      .toBe(true);
    expect(rates.bottleneck).toBe('warehouse');
  });

  it('does not mutate authoritative state while calculating rates', () => {
    const state = unlockAllFloors();
    const serializedBefore = JSON.stringify(state);

    calculateMineProductionRates(state, BASE_GAME_BALANCE);

    expect(JSON.stringify(state)).toBe(serializedBefore);
  });
});

function unlockAllFloors(): GameState {
  const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);

  return {
    ...state,
    floors: state.floors.map((floor) => ({
      ...floor,
      isUnlocked: true,
    })),
  };
}
