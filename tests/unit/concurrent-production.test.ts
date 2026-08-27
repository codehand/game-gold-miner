import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('concurrent production pipeline', () => {
  it('advances every unlocked floor from its configured duration', () => {
    const initialState = unlockAllFloors();
    const elapsedMs = 7_000;
    const state = advanceFor(initialState, elapsedMs);

    state.floors.forEach((floor, index) => {
      const config = BASE_GAME_BALANCE.floors[index];
      const expectedCycles = Math.floor(elapsedMs / config.cycleDurationMs);
      const expectedProgress =
        (elapsedMs % config.cycleDurationMs) / config.cycleDurationMs;
      const expectedOutput = GameNumber.from(config.baseYield).multiply(
        expectedCycles,
      );

      expect(floor.totalExtracted.equals(expectedOutput)).toBe(true);
      expect(floor.extractionProgress).toBeCloseTo(expectedProgress);
    });
  });

  it('hands output through stages in extraction, elevator, warehouse order', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const extractionBoundary: GameState = {
      ...initialState,
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        extractionProgress: index === 0 ? 0.95 : floor.extractionProgress,
      })),
    };
    const transported = advanceSimulation(extractionBoundary, 100);

    expect(transported.floors[0].materialQueue.equals(0)).toBe(true);
    expect(transported.floors[0].totalExtracted.equals(10)).toBe(true);
    expect(transported.elevator.carriedMaterial.equals(10)).toBe(true);
    expect(transported.elevator.transitProgress).toBeCloseTo(1 / 15);

    const deliveryBoundary: GameState = {
      ...initialState,
      elevator: {
        ...initialState.elevator,
        transitProgress: 14 / 15,
        carriedMaterial: GameNumber.from(50),
      },
    };
    const delivered = advanceSimulation(deliveryBoundary, 100);

    expect(delivered.elevator.carriedMaterial.equals(0)).toBe(true);
    expect(delivered.warehouse.inputQueue.equals(50)).toBe(true);
    expect(delivered.warehouse.conversionProgress).toBeCloseTo(1 / 12);
  });

  it('keeps locked floors completely inert', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state = advanceFor(initialState, 7_000);

    expect(state.floors[0].totalExtracted.equals(30)).toBe(true);
    state.floors.slice(1).forEach((floor) => {
      expect(floor.extractionProgress).toBe(0);
      expect(floor.materialQueue.equals(0)).toBe(true);
      expect(floor.totalExtracted.equals(0)).toBe(true);
      expect(floor.totalTransported.equals(0)).toBe(true);
    });
  });

  it('conserves all material through concurrent production', () => {
    const initialState = unlockAllFloors();
    const state = advanceFor(initialState, 7_000);
    const accountedMaterial = sumFloorQueues(state)
      .add(state.elevator.carriedMaterial)
      .add(state.warehouse.inputQueue)
      .add(state.warehouse.totalGoldDelivered);

    expect(accountedMaterial.equals(sumExtracted(state))).toBe(true);
    expect(
      state.gold.equals(initialState.gold.add(state.warehouse.totalGoldDelivered)),
    ).toBe(true);
  });

  it('produces identical concurrent state for equivalent update chunking', () => {
    const initialState = unlockAllFloors();
    const regularUpdates = advanceFor(initialState, 7_000);
    const mixedUpdates = [800, 200, 1_000, 500, 500, 1_000, 900, 100, 1_000, 1_000]
      .reduce(
        (state, elapsedMs) => advanceSimulation(state, elapsedMs),
        initialState,
      );

    expect(JSON.parse(JSON.stringify(mixedUpdates))).toEqual(
      JSON.parse(JSON.stringify(regularUpdates)),
    );
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

function sumFloorQueues(state: GameState): GameNumber {
  return state.floors.reduce(
    (total, floor) => total.add(floor.materialQueue),
    GameNumber.from(0),
  );
}

function sumExtracted(state: GameState): GameNumber {
  return state.floors.reduce(
    (total, floor) => total.add(floor.totalExtracted),
    GameNumber.from(0),
  );
}
