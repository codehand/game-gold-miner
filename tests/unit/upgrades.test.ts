import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  calculateElevatorUpgradeCost,
  calculateMineProductionRates,
  calculateMineShaftUpgradeCost,
  calculateWarehouseUpgradeCost,
  createInitialGameState,
  GameNumber,
  purchaseElevatorUpgrade,
  purchaseMineShaftUpgrade,
  purchaseWarehouseUpgrade,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('stage upgrades', () => {
  it('calculates exact next costs from each current stage level', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );

    expect(
      calculateMineShaftUpgradeCost(
        initialState.floors[0],
        BASE_GAME_BALANCE.floors[0],
      ).toJSON(),
    ).toBe('28.75');
    expect(
      calculateElevatorUpgradeCost(
        initialState.elevator,
        BASE_GAME_BALANCE.elevator,
      ).toJSON(),
    ).toBe('115');
    expect(
      calculateWarehouseUpgradeCost(
        initialState.warehouse,
        BASE_GAME_BALANCE.warehouse,
      ).toJSON(),
    ).toBe('138');

    const leveledState: GameState = {
      ...initialState,
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        mineShaftLevel: index === 0 ? 3 : floor.mineShaftLevel,
      })),
      elevator: { ...initialState.elevator, level: 10 },
      warehouse: { ...initialState.warehouse, level: 25 },
    };

    expect(
      calculateMineShaftUpgradeCost(
        leveledState.floors[0],
        BASE_GAME_BALANCE.floors[0],
      ).toJSON(),
    ).toBe('38.02187499999999');
    expect(
      calculateElevatorUpgradeCost(
        leveledState.elevator,
        BASE_GAME_BALANCE.elevator,
      ).toJSON(),
    ).toBe('404.5557735707907');
    expect(
      calculateWarehouseUpgradeCost(
        leveledState.warehouse,
        BASE_GAME_BALANCE.warehouse,
      ).toJSON(),
    ).toBe('3950.274314374752');
  });

  it('purchases a mine-shaft upgrade with an exact balance', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const cost = calculateMineShaftUpgradeCost(
      initialState.floors[0],
      BASE_GAME_BALANCE.floors[0],
    );
    const state = { ...initialState, gold: cost };
    const result = purchaseMineShaftUpgrade(
      state,
      'floor-1',
      BASE_GAME_BALANCE,
    );

    expect(result.success).toBe(true);

    if (!result.success) {
      throw new Error('Expected mine-shaft purchase to succeed.');
    }

    expect(result.cost.equals(cost)).toBe(true);
    expect(result.state.gold.equals(0)).toBe(true);
    expect(result.state.floors[0].mineShaftLevel).toBe(2);
    expect(result.state.floors[0].extractionProgress).toBe(
      state.floors[0].extractionProgress,
    );
    expect(result.state.floors[0].materialQueue).toBe(
      state.floors[0].materialQueue,
    );
    expect(result.state.floors[0].totalExtracted).toBe(
      state.floors[0].totalExtracted,
    );
    expect(result.state.floors[0].totalTransported).toBe(
      state.floors[0].totalTransported,
    );
    expect(result.state.floors.slice(1)).toEqual(state.floors.slice(1));
    expect(result.state.elevator).toBe(state.elevator);
    expect(result.state.warehouse).toBe(state.warehouse);
    expectSimulationMetadataPreserved(result.state, state);
  });

  it('purchases elevator and warehouse upgrades independently', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const elevatorCost = calculateElevatorUpgradeCost(
      initialState.elevator,
      BASE_GAME_BALANCE.elevator,
    );
    const elevatorState = {
      ...initialState,
      gold: elevatorCost,
      elevator: {
        ...initialState.elevator,
        roundRobinCursor: 2,
        transitProgress: 0.4,
        carriedMaterial: GameNumber.from(25),
      },
    };
    const elevatorResult = purchaseElevatorUpgrade(
      elevatorState,
      BASE_GAME_BALANCE,
    );

    expect(elevatorResult.success).toBe(true);

    if (!elevatorResult.success) {
      throw new Error('Expected elevator purchase to succeed.');
    }

    expect(elevatorResult.state.gold.equals(0)).toBe(true);
    expect(elevatorResult.state.elevator.level).toBe(2);
    expect(Number(elevatorResult.state.elevator.capacity.toJSON())).toBeCloseTo(
      56,
    );
    expect(elevatorResult.state.elevator.transitProgress).toBe(
      elevatorState.elevator.transitProgress,
    );
    expect(elevatorResult.state.elevator.carriedMaterial).toBe(
      elevatorState.elevator.carriedMaterial,
    );
    expect(elevatorResult.state.elevator.roundRobinCursor).toBe(
      elevatorState.elevator.roundRobinCursor,
    );
    expect(elevatorResult.state.floors).toBe(elevatorState.floors);
    expect(elevatorResult.state.warehouse).toBe(elevatorState.warehouse);
    expectSimulationMetadataPreserved(elevatorResult.state, elevatorState);

    const warehouseCost = calculateWarehouseUpgradeCost(
      initialState.warehouse,
      BASE_GAME_BALANCE.warehouse,
    );
    const warehouseState = {
      ...initialState,
      gold: warehouseCost,
      warehouse: {
        ...initialState.warehouse,
        inputQueue: GameNumber.from(75),
        conversionProgress: 0.6,
      },
    };
    const warehouseResult = purchaseWarehouseUpgrade(
      warehouseState,
      BASE_GAME_BALANCE,
    );

    expect(warehouseResult.success).toBe(true);

    if (!warehouseResult.success) {
      throw new Error('Expected warehouse purchase to succeed.');
    }

    expect(warehouseResult.state.gold.equals(0)).toBe(true);
    expect(warehouseResult.state.warehouse.level).toBe(2);
    expect(Number(warehouseResult.state.warehouse.capacity.toJSON())).toBeCloseTo(
      67.2,
    );
    expect(warehouseResult.state.warehouse.conversionProgress).toBe(
      warehouseState.warehouse.conversionProgress,
    );
    expect(warehouseResult.state.warehouse.inputQueue).toBe(
      warehouseState.warehouse.inputQueue,
    );
    expect(warehouseResult.state.warehouse.totalGoldDelivered).toBe(
      warehouseState.warehouse.totalGoldDelivered,
    );
    expect(warehouseResult.state.floors).toBe(warehouseState.floors);
    expect(warehouseResult.state.elevator).toBe(warehouseState.elevator);
    expectSimulationMetadataPreserved(warehouseResult.state, warehouseState);
  });

  it('improves production over equal durations for each upgraded stage', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const fundedState = { ...initialState, gold: GameNumber.from(10_000) };
    const shaftResult = purchaseMineShaftUpgrade(
      fundedState,
      'floor-1',
      BASE_GAME_BALANCE,
    );

    if (!shaftResult.success) {
      throw new Error('Expected mine-shaft purchase to succeed.');
    }

    const baseExtraction = advanceFor(initialState, 2_000);
    const upgradedExtraction = advanceFor(shaftResult.state, 2_000);

    expect(baseExtraction.floors[0].totalExtracted.equals(10)).toBe(true);
    expect(upgradedExtraction.floors[0].totalExtracted.equals(11)).toBe(true);

    const stockedFloorState: GameState = {
      ...initialState,
      gold: GameNumber.from(10_000),
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        materialQueue: index === 0
          ? GameNumber.from(100)
          : floor.materialQueue,
      })),
    };
    const elevatorResult = purchaseElevatorUpgrade(
      stockedFloorState,
      BASE_GAME_BALANCE,
    );

    if (!elevatorResult.success) {
      throw new Error('Expected elevator purchase to succeed.');
    }

    const baseTransit = advanceFor(stockedFloorState, 800);
    const upgradedTransit = advanceFor(elevatorResult.state, 800);

    expect(baseTransit.elevator.carriedMaterial.equals(50)).toBe(true);
    expect(Number(upgradedTransit.elevator.carriedMaterial.toJSON())).toBeCloseTo(
      56,
    );

    const stockedWarehouseState: GameState = {
      ...initialState,
      gold: GameNumber.from(10_000),
      warehouse: {
        ...initialState.warehouse,
        inputQueue: GameNumber.from(100),
      },
    };
    const warehouseResult = purchaseWarehouseUpgrade(
      stockedWarehouseState,
      BASE_GAME_BALANCE,
    );

    if (!warehouseResult.success) {
      throw new Error('Expected warehouse purchase to succeed.');
    }

    const baseConversion = advanceFor(stockedWarehouseState, 1_200);
    const upgradedConversion = advanceFor(warehouseResult.state, 1_200);

    expect(baseConversion.warehouse.totalGoldDelivered.equals(60)).toBe(true);
    expect(
      Number(upgradedConversion.warehouse.totalGoldDelivered.toJSON()),
    ).toBeCloseTo(
      67.2,
    );
  });

  it('preserves progress and queues while improving production-rate estimates', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const progressState: GameState = {
      ...initialState,
      gold: GameNumber.from(10_000),
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        isUnlocked: true,
        extractionProgress: index === 0 ? 0.65 : floor.extractionProgress,
        materialQueue: index === 0
          ? GameNumber.from(40)
          : floor.materialQueue,
      })),
      elevator: {
        ...initialState.elevator,
        capacity: GameNumber.from(1_000),
        roundRobinCursor: 3,
        transitProgress: 0.4,
        carriedMaterial: GameNumber.from(25),
      },
      warehouse: {
        ...initialState.warehouse,
        inputQueue: GameNumber.from(100),
        conversionProgress: 0.75,
      },
    };
    const baseRates = calculateMineProductionRates(
      progressState,
      BASE_GAME_BALANCE,
    );
    const shaftResult = purchaseMineShaftUpgrade(
      progressState,
      'floor-1',
      BASE_GAME_BALANCE,
    );
    const transportRateState: GameState = {
      ...progressState,
      elevator: {
        ...progressState.elevator,
        capacity: initialState.elevator.capacity,
      },
    };
    const elevatorResult = purchaseElevatorUpgrade(
      transportRateState,
      BASE_GAME_BALANCE,
    );
    const warehouseResult = purchaseWarehouseUpgrade(
      progressState,
      BASE_GAME_BALANCE,
    );

    if (
      !shaftResult.success ||
      !elevatorResult.success ||
      !warehouseResult.success
    ) {
      throw new Error('Expected stage purchases to succeed.');
    }

    expect(shaftResult.state.floors[0].extractionProgress).toBe(0.65);
    expect(shaftResult.state.floors[0].materialQueue).toBe(
      progressState.floors[0].materialQueue,
    );
    expect(shaftResult.state.elevator).toBe(progressState.elevator);
    expect(shaftResult.state.warehouse).toBe(progressState.warehouse);

    const shaftRates = calculateMineProductionRates(
      shaftResult.state,
      BASE_GAME_BALANCE,
    );
    const elevatorRates = calculateMineProductionRates(
      elevatorResult.state,
      BASE_GAME_BALANCE,
    );
    const warehouseRates = calculateMineProductionRates(
      warehouseResult.state,
      BASE_GAME_BALANCE,
    );

    expect(
      shaftRates.floors[0].theoreticalExtractionPerSecond.equals(5.5),
    ).toBe(true);
    expect(
      shaftRates.aggregateExtractionPerSecond.greaterThan(
        baseRates.aggregateExtractionPerSecond,
      ),
    ).toBe(true);
    expect(elevatorRates.bottleneck).toBe('elevator');
    expect(
      Number(elevatorRates.elevatorCapacityPerSecond.toJSON()),
    ).toBeCloseTo(56 * (1_000 / 1_500));
    expect(baseRates.bottleneck).toBe('warehouse');
    expect(baseRates.effectiveProductionPerSecond.equals(50)).toBe(true);
    expect(warehouseRates.bottleneck).toBe('warehouse');
    expect(
      Number(warehouseRates.effectiveProductionPerSecond.toJSON()),
    ).toBeCloseTo(56);
    expect(warehouseResult.state.warehouse.conversionProgress).toBe(0.75);
    expect(warehouseResult.state.warehouse.inputQueue).toBe(
      progressState.warehouse.inputQueue,
    );
    expect(warehouseResult.state.elevator).toBe(progressState.elevator);
    expect(warehouseResult.state.floors).toBe(progressState.floors);
  });

  it('returns insufficient funds without changing state', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state = { ...initialState, gold: GameNumber.from(0) };
    const results = [
      purchaseMineShaftUpgrade(state, 'floor-1', BASE_GAME_BALANCE),
      purchaseElevatorUpgrade(state, BASE_GAME_BALANCE),
      purchaseWarehouseUpgrade(state, BASE_GAME_BALANCE),
    ];

    results.forEach((result) => {
      expect(result.success).toBe(false);

      if (result.success) {
        throw new Error('Expected purchase to fail.');
      }

      expect(result.reason).toBe('insufficient-funds');
      expect(result.cost).not.toBeNull();
      expect(result.state).toBe(state);
    });
  });

  it('rejects locked and unknown floors without changing state', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const lockedResult = purchaseMineShaftUpgrade(
      state,
      'floor-2',
      BASE_GAME_BALANCE,
    );
    const missingResult = purchaseMineShaftUpgrade(
      state,
      'floor-missing',
      BASE_GAME_BALANCE,
    );

    expect(lockedResult).toMatchObject({
      success: false,
      reason: 'floor-locked',
      state,
    });
    expect(lockedResult.cost).not.toBeNull();
    expect(missingResult).toEqual({
      success: false,
      reason: 'floor-not-found',
      state,
      cost: null,
    });
  });

  it('rejects invalid and non-incrementable levels', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);

    expect(() =>
      calculateMineShaftUpgradeCost(
        { ...state.floors[0], mineShaftLevel: 0 },
        BASE_GAME_BALANCE.floors[0],
      ),
    ).toThrow(/positive safe integer/);
    expect(() =>
      calculateElevatorUpgradeCost(
        { ...state.elevator, level: Number.MAX_SAFE_INTEGER },
        BASE_GAME_BALANCE.elevator,
      ),
    ).toThrow(/room to increment/);
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

function expectSimulationMetadataPreserved(
  actual: GameState,
  expected: GameState,
): void {
  expect(actual.saveVersion).toBe(expected.saveVersion);
  expect(actual.lastUpdateTimestampMs).toBe(expected.lastUpdateTimestampMs);
  expect(actual.simulationTick).toBe(expected.simulationTick);
  expect(actual.simulationRemainderMs).toBe(expected.simulationRemainderMs);
}
