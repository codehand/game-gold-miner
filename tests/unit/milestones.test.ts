import { describe, expect, it } from 'vitest';

import {
  BASE_GAME_BALANCE,
  type BaseGameBalanceConfig,
} from '../../src/config';
import {
  advanceSimulation,
  calculateLevelEffect,
  calculateMilestoneMultiplier,
  calculateMineProductionRates,
  createInitialGameState,
  GameNumber,
  purchaseElevatorUpgrade,
  purchaseMineShaftUpgrade,
  purchaseWarehouseUpgrade,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;
const FUNDED_GOLD = GameNumber.from('1e12');

describe('milestone multipliers', () => {
  it('applies each configured milestone cumulatively exactly once', () => {
    const milestones = BASE_GAME_BALANCE.floors[0].upgrade.milestones;
    const expectedByLevel = [
      [1, 1],
      [9, 1],
      [10, 2],
      [24, 2],
      [25, 4],
      [49, 4],
      [50, 12],
      [99, 12],
      [100, 48],
      [101, 48],
    ] as const;

    expectedByLevel.forEach(([level, expectedMultiplier]) => {
      expect(
        calculateMilestoneMultiplier(level, milestones).equals(
          expectedMultiplier,
        ),
      ).toBe(true);
    });
  });

  it('applies a mine-shaft milestone to actual extraction and rates', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const beforeMilestone: GameState = {
      ...initialState,
      gold: FUNDED_GOLD,
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        mineShaftLevel: index === 0 ? 9 : floor.mineShaftLevel,
      })),
    };
    const beforeRate = calculateMineProductionRates(
      beforeMilestone,
      BASE_GAME_BALANCE,
    ).floors[0].theoreticalExtractionPerSecond;
    const result = purchaseMineShaftUpgrade(
      beforeMilestone,
      'floor-1',
      BASE_GAME_BALANCE,
    );

    if (!result.success) {
      throw new Error('Expected milestone mine-shaft purchase to succeed.');
    }

    const expectedOutput = 10 * 1.1 ** 9 * 2;
    const afterRate = calculateMineProductionRates(
      result.state,
      BASE_GAME_BALANCE,
    ).floors[0].theoreticalExtractionPerSecond;
    const produced = advanceFor(result.state, 2_000);

    expect(result.state.floors[0].mineShaftLevel).toBe(10);
    expect(toNumber(produced.floors[0].totalExtracted)).toBeCloseTo(
      expectedOutput,
    );
    expect(toNumber(afterRate)).toBeCloseTo(expectedOutput / 2);
    expect(toNumber(afterRate) / toNumber(beforeRate)).toBeCloseTo(2.2);
  });

  it('applies shared-stage milestones without losing in-progress work', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const elevatorState: GameState = {
      ...initialState,
      gold: FUNDED_GOLD,
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        materialQueue: index === 0
          ? GameNumber.from(1_000_000)
          : floor.materialQueue,
      })),
      elevator: {
        ...initialState.elevator,
        level: 9,
        capacity: calculateLevelEffect(
          BASE_GAME_BALANCE.elevator.baseCapacity,
          9,
          BASE_GAME_BALANCE.elevator.upgrade,
        ),
        transitProgress: 0.4,
        carriedMaterial: GameNumber.from(10),
      },
    };
    const elevatorResult = purchaseElevatorUpgrade(
      elevatorState,
      BASE_GAME_BALANCE,
    );

    if (!elevatorResult.success) {
      throw new Error('Expected milestone elevator purchase to succeed.');
    }

    const expectedElevatorCapacity = 50 * 1.12 ** 9 * 2;
    const elevatorRates = calculateMineProductionRates(
      elevatorResult.state,
      BASE_GAME_BALANCE,
    );
    const pickupState: GameState = {
      ...elevatorResult.state,
      elevator: {
        ...elevatorResult.state.elevator,
        transitProgress: 0,
        carriedMaterial: GameNumber.from(0),
      },
    };
    const pickedUp = advanceFor(pickupState, 800);

    expect(elevatorResult.state.elevator.level).toBe(10);
    expect(elevatorResult.state.elevator.transitProgress).toBe(0.4);
    expect(elevatorResult.state.elevator.carriedMaterial).toBe(
      elevatorState.elevator.carriedMaterial,
    );
    expect(toNumber(elevatorResult.state.elevator.capacity)).toBeCloseTo(
      expectedElevatorCapacity,
    );
    expect(toNumber(pickedUp.elevator.carriedMaterial)).toBeCloseTo(
      expectedElevatorCapacity,
    );
    expect(toNumber(elevatorRates.elevatorCapacityPerSecond)).toBeCloseTo(
      expectedElevatorCapacity / 1.5,
    );

    const warehouseState: GameState = {
      ...initialState,
      gold: FUNDED_GOLD,
      warehouse: {
        ...initialState.warehouse,
        level: 9,
        capacity: calculateLevelEffect(
          BASE_GAME_BALANCE.warehouse.baseCapacity,
          9,
          BASE_GAME_BALANCE.warehouse.upgrade,
        ),
        inputQueue: GameNumber.from(1_000_000),
        conversionProgress: 0.5,
      },
    };
    const warehouseResult = purchaseWarehouseUpgrade(
      warehouseState,
      BASE_GAME_BALANCE,
    );

    if (!warehouseResult.success) {
      throw new Error('Expected milestone warehouse purchase to succeed.');
    }

    const expectedWarehouseCapacity = 60 * 1.12 ** 9 * 2;
    const warehouseRates = calculateMineProductionRates(
      warehouseResult.state,
      BASE_GAME_BALANCE,
    );
    const converted = advanceSimulation(warehouseResult.state, 600);

    expect(warehouseResult.state.warehouse.level).toBe(10);
    expect(warehouseResult.state.warehouse.conversionProgress).toBe(0.5);
    expect(warehouseResult.state.warehouse.inputQueue).toBe(
      warehouseState.warehouse.inputQueue,
    );
    expect(toNumber(warehouseResult.state.warehouse.capacity)).toBeCloseTo(
      expectedWarehouseCapacity,
    );
    expect(toNumber(converted.warehouse.totalGoldDelivered)).toBeCloseTo(
      expectedWarehouseCapacity,
    );
    expect(toNumber(warehouseRates.warehouseCapacityPerSecond)).toBeCloseTo(
      expectedWarehouseCapacity / 1.2,
    );
  });

  it('derives milestone effects after a reload without granting them twice', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const levelTenState: GameState = {
      ...initialState,
      gold: FUNDED_GOLD,
      elevator: {
        ...initialState.elevator,
        level: 10,
        capacity: calculateLevelEffect(
          BASE_GAME_BALANCE.elevator.baseCapacity,
          10,
          BASE_GAME_BALANCE.elevator.upgrade,
        ),
      },
    };
    const reloadedState = reloadAuthoritativeState(levelTenState);
    const beforeReloadRate = calculateMineProductionRates(
      levelTenState,
      BASE_GAME_BALANCE,
    ).elevatorCapacityPerSecond;
    const afterReloadRate = calculateMineProductionRates(
      reloadedState,
      BASE_GAME_BALANCE,
    ).elevatorCapacityPerSecond;
    const result = purchaseElevatorUpgrade(
      reloadedState,
      BASE_GAME_BALANCE,
    );

    if (!result.success) {
      throw new Error('Expected post-reload elevator purchase to succeed.');
    }

    const expectedLevelElevenCapacity = 50 * 1.12 ** 10 * 2;

    expect(afterReloadRate.equals(beforeReloadRate)).toBe(true);
    expect(result.state.elevator.level).toBe(11);
    expect(toNumber(result.state.elevator.capacity)).toBeCloseTo(
      expectedLevelElevenCapacity,
    );
    expect(toNumber(result.state.elevator.capacity)).not.toBeCloseTo(
      expectedLevelElevenCapacity * 2,
    );
  });

  it('initializes configured milestone levels with their complete effects', () => {
    const milestoneStartConfig: BaseGameBalanceConfig = {
      ...BASE_GAME_BALANCE,
      elevator: {
        ...BASE_GAME_BALANCE.elevator,
        startingLevel: 10,
      },
      warehouse: {
        ...BASE_GAME_BALANCE.warehouse,
        startingLevel: 25,
      },
    };
    const state = createInitialGameState(milestoneStartConfig, TIMESTAMP_MS);

    expect(toNumber(state.elevator.capacity)).toBeCloseTo(
      50 * 1.12 ** 9 * 2,
    );
    expect(toNumber(state.warehouse.capacity)).toBeCloseTo(
      60 * 1.12 ** 24 * 4,
    );
  });
});

function advanceFor(initialState: GameState, elapsedMs: number): GameState {
  const fullUpdates = Math.floor(elapsedMs / 1_000);
  const remainderMs = elapsedMs % 1_000;
  const updates = [
    ...Array<number>(fullUpdates).fill(1_000),
    ...(remainderMs === 0 ? [] : [remainderMs]),
  ];

  return updates.reduce(
    (state, updateMs) => advanceSimulation(state, updateMs),
    initialState,
  );
}

function reloadAuthoritativeState(state: GameState): GameState {
  return {
    ...state,
    gold: GameNumber.deserialize(state.gold.serialize()),
    floors: state.floors.map((floor) => ({
      ...floor,
      materialQueue: GameNumber.deserialize(floor.materialQueue.serialize()),
      totalExtracted: GameNumber.deserialize(floor.totalExtracted.serialize()),
      totalTransported: GameNumber.deserialize(
        floor.totalTransported.serialize(),
      ),
    })),
    elevator: {
      ...state.elevator,
      capacity: GameNumber.deserialize(state.elevator.capacity.serialize()),
      carriedMaterial: GameNumber.deserialize(
        state.elevator.carriedMaterial.serialize(),
      ),
    },
    warehouse: {
      ...state.warehouse,
      capacity: GameNumber.deserialize(state.warehouse.capacity.serialize()),
      inputQueue: GameNumber.deserialize(
        state.warehouse.inputQueue.serialize(),
      ),
      totalGoldDelivered: GameNumber.deserialize(
        state.warehouse.totalGoldDelivered.serialize(),
      ),
    },
  };
}

function toNumber(value: GameNumber): number {
  return Number(value.serialize());
}
