import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  calculateMineProductionRates,
  calculateOfflineIncome,
  catchUpSimulation,
  createInitialGameState,
  createMineFloorState,
  MAX_CATCH_UP_MS,
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

  /**
   * The asymmetry this pins is deliberate, and cheap to erase by accident: a
   * backgrounded tab is treated as online and credited at full rate, while a
   * closed one is credited through `offlineIncome.efficiency`. Applying the
   * efficiency to catch-up, or dropping it from offline income, would collapse
   * the ratio to about one and pass every other test in this file.
   *
   * The horizon is asserted exactly because it is shared by construction. The
   * ratio is bracketed rather than fixed at `1 / efficiency`, because the two
   * sides are not the same calculation: offline income multiplies an analytic
   * rate by time, while catch-up runs the real pipeline, whose round-robin
   * pickup and per-cycle capacities quantize it to roughly ninety percent of
   * that rate once all four floors compete for one elevator.
   */
  it('credits a backgrounded tab about twice a closed one over the same gap', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const { efficiency } = BASE_GAME_BALANCE.offlineIncome;

    expect(MAX_CATCH_UP_MS).toBe(BASE_GAME_BALANCE.offlineIncome.capDurationMs);

    const states: readonly (readonly [string, GameState])[] = [
      ['one open floor', initialState],
      [
        'every floor open',
        {
          ...initialState,
          floors: initialState.floors.map((_, index) => {
            return createMineFloorState(BASE_GAME_BALANCE.floors[index], true);
          }),
        },
      ],
    ];

    for (const [name, state] of states) {
      const backgrounded = Number(
        catchUpSimulation(state, MAX_CATCH_UP_MS).gold.serialize(),
      );
      const closed = Number(
        calculateOfflineIncome(
          state,
          TIMESTAMP_MS,
          TIMESTAMP_MS + MAX_CATCH_UP_MS,
          calculateMineProductionRates(state, BASE_GAME_BALANCE)
            .effectiveProductionPerSecond,
          BASE_GAME_BALANCE.offlineIncome,
        ).reward.serialize(),
      );

      expect(closed, name).toBeGreaterThan(0);
      // Comfortably above one, and no higher than the analytic ceiling the
      // efficiency implies. Both bounds fail the moment either side changes.
      expect(backgrounded / closed, name).toBeGreaterThan(1.5);
      expect(backgrounded / closed, name).toBeLessThanOrEqual(1 / efficiency + 0.01);
    }
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

/**
 * A hidden tab stops the render loop, so the whole absence returns as a single
 * delta. The per-call foreground bound is meant for one slow frame and would
 * consume that absence having simulated only its first second, so catch-up
 * walks the gap instead.
 */
describe('catch-up across a render-loop gap', () => {
  it('credits a gap arriving as one delta exactly as continuous time', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const gapMs = 60_000;
    const resumed = catchUpSimulation(initialState, gapMs);
    const continuous = advanceMany(
      initialState,
      Array<number>(gapMs / 100).fill(100),
    );

    expect(serialize(resumed)).toEqual(serialize(continuous));
    // The bug this replaces: a single bounded advance simulated one second of
    // the minute and consumed the other fifty-nine.
    expect(resumed.simulationTick).toBe(gapMs / SIMULATION_STEP_MS);
    expect(advanceSimulation(initialState, gapMs).simulationTick).toBe(
      MAX_FOREGROUND_DELTA_MS / SIMULATION_STEP_MS,
    );
  });

  it('leaves a within-frame delta identical to a single advance', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );

    expect(serialize(catchUpSimulation(initialState, 17))).toEqual(
      serialize(advanceSimulation(initialState, 17)),
    );
    expect(catchUpSimulation(initialState, 0)).toBe(initialState);
  });

  it('bounds the walk while still consuming the whole gap', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const gapMs = MAX_CATCH_UP_MS + 90_000;
    const state = catchUpSimulation(initialState, gapMs);

    expect(state.simulationTick).toBe(MAX_CATCH_UP_MS / SIMULATION_STEP_MS);
    expect(serialize(state)).toEqual(
      serialize({
        ...catchUpSimulation(initialState, MAX_CATCH_UP_MS),
        lastUpdateTimestampMs: TIMESTAMP_MS + gapMs,
      }),
    );
    // Uncredited time is still consumed: an authoritative timestamp left
    // behind real time would hand the same interval to offline income.
    expect(state.lastUpdateTimestampMs).toBe(TIMESTAMP_MS + gapMs);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid elapsed time %s without changing the input state',
    (elapsedMs) => {
      const initialState = createInitialGameState(
        BASE_GAME_BALANCE,
        TIMESTAMP_MS,
      );
      const before = serialize(initialState);

      expect(() => catchUpSimulation(initialState, elapsedMs)).toThrow(
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
