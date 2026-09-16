import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  GameNumber,
  PROGRESS_BOUND_TOLERANCE,
  calculateMineProductionRates,
  catchUpSimulation,
  createInitialGameState,
  evaluateProgressBound,
  simulateEconomyProgression,
  type GameState,
} from '../../src/core';

/**
 * Server-milestone Step 23: the upper-bound check on an uploaded save.
 *
 * The bound is deliberately loose (finding F3) and biased toward accepting an
 * honest save. These tests pin both directions: real sessions of varying length
 * and shape are accepted, and materially inflated counters or levels are
 * rejected. The tolerance is pinned from both sides so widening it silently
 * fails.
 */
const TIMESTAMP_MS = 1_788_000_000_000;

function freshState(): GameState {
  return createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
}

function withDelivered(state: GameState, delivered: GameNumber): GameState {
  return {
    ...state,
    warehouse: { ...state.warehouse, totalGoldDelivered: delivered },
  };
}

function withFloorLevel(state: GameState, floorIndex: number, level: number): GameState {
  return {
    ...state,
    floors: state.floors.map((floor, index) =>
      index === floorIndex ? { ...floor, mineShaftLevel: level } : floor,
    ),
  };
}

describe('evaluateProgressBound (Step 23)', () => {
  it('accepts an honest no-upgrade session at any length', () => {
    for (const durationMs of [1_000, 60_000, 2 * 60 * 60 * 1_000, 24 * 60 * 60 * 1_000]) {
      const previous = freshState();
      const candidate = catchUpSimulation(previous, durationMs);

      expect(
        evaluateProgressBound({
          previous,
          candidate,
          elapsedMs: durationMs,
          config: BASE_GAME_BALANCE,
        }),
        `a ${durationMs} ms honest session is accepted`,
      ).toBeNull();
    }
  });

  it('accepts an honest session that upgrades and unlocks as it plays', () => {
    for (const durationMs of [60_000, 10 * 60 * 1_000]) {
      const previous = freshState();
      const candidate = simulateEconomyProgression(durationMs, TIMESTAMP_MS).state;

      expect(
        evaluateProgressBound({
          previous,
          candidate,
          elapsedMs: durationMs,
          config: BASE_GAME_BALANCE,
        }),
        `a ${durationMs} ms upgrading session is accepted`,
      ).toBeNull();
    }
  });

  it('accepts an honest short interval after warm play (carried material)', () => {
    // A proportional rate term is near-zero over a second, but one completed
    // extraction cycle and one drained queue are fixed amounts. A warm mine
    // always has that material in flight, so without the carried terms an
    // honest save that simply kept playing is rejected (review finding F1).
    for (const warmMs of [5 * 60_000, 10 * 60_000, 30 * 60_000]) {
      const previous = simulateEconomyProgression(warmMs, TIMESTAMP_MS).state;

      for (const intervalMs of [1_000, 3_000, 10_000, 20_000]) {
        const candidate = catchUpSimulation(previous, intervalMs);

        expect(
          evaluateProgressBound({
            previous,
            candidate,
            elapsedMs: intervalMs,
            config: BASE_GAME_BALANCE,
          }),
          `a ${intervalMs} ms honest interval after ${warmMs} ms of play is accepted`,
        ).toBeNull();
      }
    }
  });

  it('rejects an inflated warehouse delivery', () => {
    const previous = freshState();
    const candidate = withDelivered(freshState(), GameNumber.from(1e12));

    const violation = evaluateProgressBound({
      previous,
      candidate,
      elapsedMs: 60_000,
      config: BASE_GAME_BALANCE,
    });

    expect(violation?.counter).toBe('state.warehouse.totalGoldDelivered');
  });

  it('rejects an inflated per-floor extraction total', () => {
    const previous = freshState();
    const base = freshState();
    const candidate: GameState = {
      ...base,
      floors: base.floors.map((floor, index) =>
        index === 0
          ? { ...floor, totalExtracted: GameNumber.from(1e12) }
          : floor,
      ),
    };

    const violation = evaluateProgressBound({
      previous,
      candidate,
      elapsedMs: 60_000,
      config: BASE_GAME_BALANCE,
    });

    expect(violation?.counter).toBe('state.floors[floor-1].totalExtracted');
  });

  it('rejects shaft levels the elapsed time could not pay for', () => {
    const previous = freshState();
    const candidate = withFloorLevel(freshState(), 0, 500);

    const violation = evaluateProgressBound({
      previous,
      candidate,
      elapsedMs: 60_000,
      config: BASE_GAME_BALANCE,
    });

    expect(violation?.counter).toBe('state.upgradeSpend');
  });

  it('clamps a backwards elapsed time to zero, so nothing extra is allowed', () => {
    const previous = freshState();
    const candidate = withDelivered(freshState(), GameNumber.from(1_000));

    const violation = evaluateProgressBound({
      previous,
      candidate,
      elapsedMs: -60_000,
      config: BASE_GAME_BALANCE,
    });

    expect(violation).not.toBeNull();
  });

  it('pins the tolerance from both sides so widening it silently fails', () => {
    expect(PROGRESS_BOUND_TOLERANCE).toBe(0.05);

    const previous = freshState();
    const rate = calculateMineProductionRates(previous, BASE_GAME_BALANCE)
      .effectiveProductionPerSecond;
    // A very long interval makes the proportional rate term dwarf the fixed
    // carried amount, so this pins the tolerance itself rather than the
    // carried-material allowance F1 added.
    const seconds = 1_000_000_000;
    const exactBound = rate.multiply(seconds).multiply(1 + PROGRESS_BOUND_TOLERANCE);

    const justUnder = evaluateProgressBound({
      previous,
      candidate: withDelivered(freshState(), exactBound.multiply(0.999)),
      elapsedMs: seconds * 1_000,
      config: BASE_GAME_BALANCE,
    });
    const justOver = evaluateProgressBound({
      previous,
      candidate: withDelivered(freshState(), exactBound.multiply(1.001)),
      elapsedMs: seconds * 1_000,
      config: BASE_GAME_BALANCE,
    });

    expect(justUnder).toBeNull();
    expect(justOver?.counter).toBe('state.warehouse.totalGoldDelivered');
  });

  it('rejects an invalid tolerance rather than treating it as zero', () => {
    expect(() =>
      evaluateProgressBound({
        previous: freshState(),
        candidate: freshState(),
        elapsedMs: 0,
        config: BASE_GAME_BALANCE,
        tolerance: -0.5,
      }),
    ).toThrow(/tolerance/);
  });
});
