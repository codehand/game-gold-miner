import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateMineProductionRates,
  calculateTheoreticalFloorExtractionRate,
  calculateLevelEffect,
  createCatProductionModifiers,
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
      ).slice(0, 4),
    ).toEqual(['5', '12', '30', '77.14285714285714']);
    expect(rates.floors).toHaveLength(15);
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

  it('applies overflow mine-floor workforce productivity after five visible cats', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state: GameState = {
      ...initialState,
      floors: [
        {
          ...initialState.floors[0],
          mineShaftLevel: 250,
        },
        ...initialState.floors.slice(1),
      ],
    };
    const rate = calculateMineProductionRates(state, BASE_GAME_BALANCE)
      .floors[0].theoreticalExtractionPerSecond;
    const expectedRate = calculateLevelEffect(
      BASE_GAME_BALANCE.floors[0].baseYield,
      250,
      BASE_GAME_BALANCE.floors[0].upgrade,
    ).multiply(1.2 * (1_000 / BASE_GAME_BALANCE.floors[0].cycleDurationMs));

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

  it('applies an assigned cat to only its role metric', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const miner = {
      catInstanceId: 'miner-1',
      ownerUserId: 'user-1',
      assetId: 'miner:SSR:forge:idle',
      displayName: 'Forge',
      roleId: 'miner' as const,
      rarityTier: 'SSR' as const,
      level: 7,
      attributes: { power: 92, speed: 79, capacity: 72, efficiency: 86 },
      calculationVersion: 1,
      availabilityState: 'Assigned' as const,
      assignedSlotKey: 'miner:floor-1' as const,
      updatedAt: TIMESTAMP_MS,
    };
    const modifiers = createCatProductionModifiers({
      cats: [miner],
      assignments: [{ slotKey: 'miner:floor-1', catInstanceId: miner.catInstanceId }],
      assignmentRevision: 1,
      collectionRevision: 1,
    });

    const base = calculateMineProductionRates(state, BASE_GAME_BALANCE);
    const boosted = calculateMineProductionRates(state, BASE_GAME_BALANCE, modifiers);

    expect(boosted.floors[0].theoreticalExtractionPerSecond.greaterThan(
      base.floors[0].theoreticalExtractionPerSecond,
    )).toBe(true);
    expect(boosted.elevatorCapacityPerSecond.equals(base.elevatorCapacityPerSecond)).toBe(true);
    expect(boosted.warehouseCapacityPerSecond.equals(base.warehouseCapacityPerSecond)).toBe(true);
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
