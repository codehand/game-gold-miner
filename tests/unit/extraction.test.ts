import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;
const FIXED_STEP_MS = 100;

describe('mine-floor extraction', () => {
  it('creates output only at a cycle boundary and carries overflow', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const beforeBoundary = advanceFor(initialState, 1_900);

    expectFloor(beforeBoundary, 0.95, 0);
    expect(beforeBoundary.gold.equals(BASE_GAME_BALANCE.startingGold)).toBe(true);

    const atBoundary = advanceSimulation(beforeBoundary, FIXED_STEP_MS);

    expectFloor(atBoundary, 0, 10);
    expect(atBoundary.gold.equals(BASE_GAME_BALANCE.startingGold)).toBe(true);

    const beyondBoundary = advanceSimulation(atBoundary, FIXED_STEP_MS);

    expectFloor(beyondBoundary, 0.05, 10);
    expect(beyondBoundary.gold.equals(BASE_GAME_BALANCE.startingGold)).toBe(true);
  });

  it('applies level-adjusted yield without milestone multipliers', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const floor = initialState.floors[0];
    const level = 3;
    const leveledState: GameState = {
      ...initialState,
      floors: [
        {
          ...floor,
          mineShaftLevel: level,
        },
        ...initialState.floors.slice(1),
      ],
    };
    const state = advanceFor(leveledState, 2_000);
    const expectedYield = GameNumber.from(
      BASE_GAME_BALANCE.floors[0].baseYield,
    ).multiply(
      BASE_GAME_BALANCE.floors[0].upgrade.outputGrowthRate ** (level - 1),
    );

    expect(state.floors[0].materialQueue.equals(expectedYield)).toBe(true);
    expect(state.floors[0].totalExtracted.equals(expectedYield)).toBe(true);
    expect(state.gold.equals(BASE_GAME_BALANCE.startingGold)).toBe(true);
  });

  it('keeps locked floors inert and leaves later production stages untouched', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state = advanceFor(initialState, 5_000);

    expectFloor(state, 0.5, 20);
    state.floors.slice(1).forEach((floor) => {
      expect(floor.extractionProgress).toBe(0);
      expect(floor.materialQueue.equals(0)).toBe(true);
      expect(floor.totalExtracted.equals(0)).toBe(true);
    });
    expect(state.elevator).toEqual(initialState.elevator);
    expect(state.warehouse).toEqual(initialState.warehouse);
    expect(state.gold.equals(initialState.gold)).toBe(true);
  });

  it('applies each unlocked floor\'s own duration and yield', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const unlockedState: GameState = {
      ...initialState,
      floors: initialState.floors.map((floor) => ({
        ...floor,
        isUnlocked: true,
      })),
    };
    const state = advanceFor(unlockedState, 3_500);

    expect(state.floors.map(({ materialQueue }) => materialQueue.toJSON())).toEqual(
      ['10', '30', '90', '270'],
    );
    [0.75, 0.4, 1 / 6, 0].forEach((expectedProgress, index) => {
      expect(state.floors[index].extractionProgress).toBeCloseTo(
        expectedProgress,
      );
    });
    expect(state.gold.equals(initialState.gold)).toBe(true);
  });

  it('preserves extraction results across equivalent update chunking', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const regularUpdates = advanceFor(initialState, 4_100);
    const mixedUpdates = [1_000, 700, 400, 1_000, 600, 400].reduce(
      (state, elapsedMs) => advanceSimulation(state, elapsedMs),
      initialState,
    );

    expect(JSON.parse(JSON.stringify(mixedUpdates))).toEqual(
      JSON.parse(JSON.stringify(regularUpdates)),
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

function expectFloor(
  state: GameState,
  extractionProgress: number,
  extracted: number,
): void {
  const floor = state.floors[0];

  expect(floor.extractionProgress).toBeCloseTo(extractionProgress);
  expect(floor.materialQueue.equals(extracted)).toBe(true);
  expect(floor.totalExtracted.equals(extracted)).toBe(true);
}
