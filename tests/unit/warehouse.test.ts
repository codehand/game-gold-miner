import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('warehouse conversion', () => {
  it('idles without queued input', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state = advanceFor(initialState, 1_200);

    expect(state.warehouse).toEqual(initialState.warehouse);
    expect(state.gold.equals(initialState.gold)).toBe(true);
  });

  it('adds gold only at the conversion boundary and respects capacity', () => {
    const initialState = withWarehouseInput(80);
    const inProgress = advanceSimulation(initialState, 100);

    expect(inProgress.warehouse.conversionProgress).toBeCloseTo(1 / 12);
    expect(inProgress.warehouse.inputQueue.equals(80)).toBe(true);
    expect(inProgress.warehouse.totalGoldDelivered.equals(0)).toBe(true);
    expect(inProgress.gold.equals(initialState.gold)).toBe(true);
    expect(initialState.warehouse.conversionProgress).toBe(0);
    expect(initialState.warehouse.inputQueue.equals(80)).toBe(true);

    const beforeBoundary = advanceFor(inProgress, 1_000);

    expect(beforeBoundary.warehouse.conversionProgress).toBeCloseTo(11 / 12);
    expect(beforeBoundary.warehouse.inputQueue.equals(80)).toBe(true);
    expect(beforeBoundary.gold.equals(initialState.gold)).toBe(true);

    const atBoundary = advanceSimulation(beforeBoundary, 100);

    expect(atBoundary.warehouse.conversionProgress).toBe(0);
    expect(atBoundary.warehouse.inputQueue.equals(20)).toBe(true);
    expect(atBoundary.warehouse.totalGoldDelivered.equals(60)).toBe(true);
    expect(atBoundary.gold.equals(initialState.gold.add(60))).toBe(true);

    const completed = advanceFor(atBoundary, 1_200);

    expect(completed.warehouse.conversionProgress).toBe(0);
    expect(completed.warehouse.inputQueue.equals(0)).toBe(true);
    expect(completed.warehouse.totalGoldDelivered.equals(80)).toBe(true);
    expect(completed.gold.equals(initialState.gold.add(80))).toBe(true);
  });

  it('traces extracted material through queues, transit, and delivered gold', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const beforeDelivery = advanceFor(initialState, 4_400);

    expect(beforeDelivery.gold.equals(initialState.gold)).toBe(true);
    expect(beforeDelivery.warehouse.inputQueue.equals(10)).toBe(true);
    expect(beforeDelivery.warehouse.conversionProgress).toBeCloseTo(11 / 12);

    const state = advanceSimulation(beforeDelivery, 100);
    const accountedMaterial = sumFloorQueues(state)
      .add(state.elevator.carriedMaterial)
      .add(state.warehouse.inputQueue)
      .add(state.warehouse.totalGoldDelivered);

    expect(state.floors[0].totalExtracted.equals(20)).toBe(true);
    expect(state.warehouse.totalGoldDelivered.equals(10)).toBe(true);
    expect(state.gold.equals(initialState.gold.add(10))).toBe(true);
    expect(accountedMaterial.equals(sumExtracted(state))).toBe(true);
  });

  it('preserves conversion results across equivalent update chunking', () => {
    const initialState = withWarehouseInput(125);
    const regularUpdates = advanceFor(initialState, 2_500);
    const mixedUpdates = [700, 300, 900, 600].reduce(
      (state, elapsedMs) => advanceSimulation(state, elapsedMs),
      initialState,
    );

    expect(JSON.parse(JSON.stringify(mixedUpdates))).toEqual(
      JSON.parse(JSON.stringify(regularUpdates)),
    );
  });
});

function withWarehouseInput(input: number): GameState {
  const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);

  return {
    ...state,
    warehouse: {
      ...state.warehouse,
      inputQueue: GameNumber.from(input),
    },
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
