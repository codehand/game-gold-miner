import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  createInitialGameState,
  MAX_FOREGROUND_DELTA_MS,
  SIMULATION_STEP_MS,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('fixed-step simulation time', () => {
  it('produces identical state for equal bounded elapsed time', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const oneUpdate = advanceSimulation(initialState, 1_000);
    const tenUpdates = advanceMany(initialState, Array(10).fill(100));
    const irregularUpdates = advanceMany(initialState, [17, 83, 250, 333, 317]);

    expect(serialize(oneUpdate)).toEqual(serialize(tenUpdates));
    expect(serialize(oneUpdate)).toEqual(serialize(irregularUpdates));
    expect(oneUpdate.simulationTick).toBe(10);
    expect(oneUpdate.simulationRemainderMs).toBe(0);
    expectProductionState(oneUpdate, initialState);
    expect(initialState.simulationTick).toBe(0);
    expect(initialState.simulationRemainderMs).toBe(0);
    expect(initialState.lastUpdateTimestampMs).toBe(TIMESTAMP_MS);
  });

  it('carries partial time and executes only complete fixed ticks', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const partialState = advanceSimulation(initialState, 40);
    const completedState = advanceSimulation(partialState, 70);

    expect(partialState.simulationTick).toBe(0);
    expect(partialState.simulationRemainderMs).toBe(40);
    expect(completedState.simulationTick).toBe(1);
    expect(completedState.simulationRemainderMs).toBe(10);
    expect(completedState.lastUpdateTimestampMs).toBe(TIMESTAMP_MS + 110);
  });

  it('bounds credited foreground time while consuming the full wall-clock delta', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const elapsedMs = 60_000;
    const state = advanceSimulation(initialState, elapsedMs);

    expect(state.simulationTick).toBe(
      MAX_FOREGROUND_DELTA_MS / SIMULATION_STEP_MS,
    );
    expect(state.simulationRemainderMs).toBe(0);
    expect(state.lastUpdateTimestampMs).toBe(TIMESTAMP_MS + elapsedMs);
    expectProductionState(state, initialState);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid elapsed time %s without changing the input state',
    (elapsedMs) => {
      const initialState = createInitialGameState(
        BASE_GAME_BALANCE,
        TIMESTAMP_MS,
      );
      const before = serialize(initialState);

      expect(() => advanceSimulation(initialState, elapsedMs)).toThrow(
        /elapsed time/i,
      );
      expect(serialize(initialState)).toEqual(before);
    },
  );
});

function advanceMany(
  initialState: GameState,
  elapsedChunksMs: readonly number[],
): GameState {
  return elapsedChunksMs.reduce(advanceSimulation, initialState);
}

function expectProductionState(
  actual: GameState,
  expected: GameState,
): void {
  expect(actual.floors.map(({ materialQueue }) => materialQueue.toJSON())).toEqual(
    expected.floors.map(({ materialQueue }) => materialQueue.toJSON()),
  );
  expect(actual.floors.map(({ totalExtracted }) => totalExtracted.toJSON())).toEqual(
    expected.floors.map(({ totalExtracted }) => totalExtracted.toJSON()),
  );
  expect(actual.gold.equals(expected.gold)).toBe(true);
}

function serialize(state: GameState): unknown {
  return JSON.parse(JSON.stringify(state));
}
