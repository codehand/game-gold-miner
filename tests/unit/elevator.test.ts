import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('shared elevator', () => {
  it('idles without material', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state = advanceFor(initialState, 1_500);

    expect(state.elevator).toEqual(initialState.elevator);
    expect(state.warehouse.inputQueue.equals(0)).toBe(true);
    expect(state.gold.equals(initialState.gold)).toBe(true);
  });

  it('respects capacity, leaves excess queued, and delivers only at completion', () => {
    const initialState = withFloorQueues([80, 0, 0, 0]);
    const inTransit = advanceSimulation(initialState, 100);

    expect(inTransit.floors[0].materialQueue.equals(30)).toBe(true);
    expect(inTransit.floors[0].totalTransported.equals(50)).toBe(true);
    expect(inTransit.elevator.carriedMaterial.equals(50)).toBe(true);
    expect(inTransit.elevator.transitProgress).toBeCloseTo(1 / 15);
    expect(inTransit.warehouse.inputQueue.equals(0)).toBe(true);
    expect(initialState.floors[0].materialQueue.equals(80)).toBe(true);
    expect(initialState.floors[0].totalTransported.equals(0)).toBe(true);
    expect(initialState.elevator.carriedMaterial.equals(0)).toBe(true);

    const beforeDelivery = advanceFor(inTransit, 1_300);

    expect(beforeDelivery.elevator.carriedMaterial.equals(50)).toBe(true);
    expect(beforeDelivery.elevator.transitProgress).toBeCloseTo(14 / 15);
    expect(beforeDelivery.warehouse.inputQueue.equals(0)).toBe(true);

    const delivered = advanceSimulation(beforeDelivery, 100);

    expect(delivered.elevator.carriedMaterial.equals(0)).toBe(true);
    expect(delivered.elevator.transitProgress).toBe(0);
    expect(delivered.warehouse.inputQueue.equals(50)).toBe(true);
    expect(delivered.gold.equals(initialState.gold)).toBe(true);
  });

  it('skips empty and locked floors when selecting a pickup', () => {
    const initialState = withFloorQueues([0, 100, 40, 0], [0, 2]);
    const state = advanceSimulation(initialState, 100);

    expect(state.floors[1].materialQueue.equals(100)).toBe(true);
    expect(state.floors[2].materialQueue.equals(0)).toBe(true);
    expect(state.floors[2].totalTransported.equals(40)).toBe(true);
    expect(state.elevator.carriedMaterial.equals(40)).toBe(true);
    expect(state.elevator.roundRobinCursor).toBe(3);
  });

  it('rotates pickups so one busy floor cannot starve another', () => {
    const initialState = withFloorQueues([200, 200, 0, 0], [0, 1]);
    const state = advanceFor(initialState, 3_000);

    expect(state.floors[0].totalTransported.equals(50)).toBe(true);
    expect(state.floors[1].totalTransported.equals(50)).toBe(true);
    expect(state.elevator.roundRobinCursor).toBe(2);
    expect(state.elevator.carriedMaterial.equals(0)).toBe(true);
    expect(state.warehouse.inputQueue.equals(100)).toBe(true);
  });

  it('preserves all material across multiple extraction and transit cycles', () => {
    const initialState = withFloorQueues([80, 40, 0, 0], [0, 1]);
    const state = advanceFor(initialState, 4_500);
    const initialMaterial = sumQueues(initialState);
    const newlyExtracted = sumExtracted(state).subtract(
      sumExtracted(initialState),
    );
    const accountedMaterial = sumQueues(state)
      .add(state.elevator.carriedMaterial)
      .add(state.warehouse.inputQueue);

    expect(accountedMaterial.equals(initialMaterial.add(newlyExtracted))).toBe(
      true,
    );
    expect(state.gold.equals(initialState.gold)).toBe(true);
  });
});

function withFloorQueues(
  queues: readonly number[],
  unlockedIndexes: readonly number[] = [0],
): GameState {
  const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);

  return {
    ...state,
    floors: state.floors.map((floor, index) => ({
      ...floor,
      isUnlocked: unlockedIndexes.includes(index),
      materialQueue: GameNumber.from(queues[index] ?? 0),
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

function sumQueues(state: GameState): GameNumber {
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
