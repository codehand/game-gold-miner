import { describe, expect, it } from 'vitest';

import {
  calculateMineProductionRates,
  chooseBestAffordableUpgrade,
  createInitialGameState,
  DEFAULT_ECONOMY_SIMULATION_DURATION_MS,
  GameNumber,
  simulateEconomyProgression,
  type GameState,
} from '../../src/core';
import { BASE_GAME_BALANCE } from '../../src/config';

describe('economy progression simulation', () => {
  it('chooses the affordable upgrade with the largest bottleneck improvement', () => {
    const initialState = createInitialGameState(BASE_GAME_BALANCE, 0);
    const state: GameState = {
      ...initialState,
      gold: GameNumber.from(10_000),
      floors: initialState.floors.map((floor) => ({
        ...floor,
        isUnlocked: true,
      })),
    };
    const choice = chooseBestAffordableUpgrade(state, BASE_GAME_BALANCE);

    expect(choice).toMatchObject({
      type: 'elevator-upgrade',
      targetId: 'elevator',
    });
    expect(choice?.modeledImprovementPerSecond.greaterThan(0)).toBe(true);
  });

  it('breaks zero-improvement ties toward the next unlock prerequisite', () => {
    const initialState = createInitialGameState(BASE_GAME_BALANCE, 0);
    const state: GameState = {
      ...initialState,
      gold: GameNumber.from(10_000),
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        mineShaftLevel: index === 0 ? 4 : floor.mineShaftLevel,
      })),
      elevator: {
        ...initialState.elevator,
        capacity: GameNumber.from(1),
      },
      warehouse: {
        ...initialState.warehouse,
        capacity: GameNumber.from(0.8),
      },
    };
    const choice = chooseBestAffordableUpgrade(state, BASE_GAME_BALANCE);

    expect(choice).toMatchObject({
      type: 'mine-shaft-upgrade',
      targetId: 'floor-1',
      advancesNextUnlock: true,
    });
    expect(choice?.modeledImprovementPerSecond.equals(0)).toBe(true);
  });

  it('reaches the ten-minute progression targets without a stall', () => {
    const report = simulateEconomyProgression();
    const rates = calculateMineProductionRates(
      report.state,
      BASE_GAME_BALANCE,
    );

    expect(report.durationMs).toBe(DEFAULT_ECONOMY_SIMULATION_DURATION_MS);
    expect(report.unlockedFloorCount).toBe(4);
    expect(report.milestoneReached).toBe(true);
    expect(report.highestStageLevel).toBeGreaterThanOrEqual(10);
    expect(report.highestStageLevel).toBeLessThan(100);
    expect(
      report.events
        .filter(({ type }) => type === 'floor-unlock')
        .map(({ elapsedMs, targetId }) => ({ elapsedMs, targetId })),
    ).toEqual([
      { elapsedMs: 45_000, targetId: 'floor-2' },
      { elapsedMs: 139_000, targetId: 'floor-3' },
      { elapsedMs: 317_000, targetId: 'floor-4' },
    ]);
    expect(report.events.some(({ type }) => type.endsWith('upgrade'))).toBe(true);
    expect(rates.effectiveProductionPerSecond.greaterThan(0)).toBe(true);
    expectNonNegativeFiniteState(report.state);
  });

  it('produces exactly the same report for the same inputs', () => {
    const first = simulateEconomyProgression();
    const second = simulateEconomyProgression();

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('records only non-negative modeled improvements and balances', () => {
    const report = simulateEconomyProgression();

    for (const event of report.events) {
      expect(event.elapsedMs).toBeGreaterThan(0);
      expect(event.elapsedMs).toBeLessThanOrEqual(report.durationMs);
      expect(event.cost.greaterThan(0)).toBe(true);
      expect(event.modeledImprovementPerSecond.greaterThanOrEqualTo(0)).toBe(
        true,
      );
    }

    expect(report.state.gold.greaterThanOrEqualTo(0)).toBe(true);
  });

  it('rejects invalid durations', () => {
    expect(() => simulateEconomyProgression(-1)).toThrow(
      /non-negative safe integer/,
    );
    expect(() => simulateEconomyProgression(1.5)).toThrow(
      /non-negative safe integer/,
    );
    expect(() => simulateEconomyProgression(Number.POSITIVE_INFINITY)).toThrow(
      /non-negative safe integer/,
    );
  });
});

function expectNonNegativeFiniteState(state: GameState): void {
  const quantities: readonly GameNumber[] = [
    state.gold,
    state.elevator.capacity,
    state.elevator.carriedMaterial,
    state.warehouse.capacity,
    state.warehouse.inputQueue,
    state.warehouse.totalGoldDelivered,
    ...state.floors.flatMap((floor) => [
      floor.materialQueue,
      floor.totalExtracted,
      floor.totalTransported,
    ]),
  ];

  for (const quantity of quantities) {
    expect(() => GameNumber.deserialize(quantity.serialize())).not.toThrow();
    expect(quantity.greaterThanOrEqualTo(0)).toBe(true);
  }

  expect(Number.isSafeInteger(state.simulationTick)).toBe(true);
  expect(Number.isSafeInteger(state.lastUpdateTimestampMs)).toBe(true);
  expect(Number.isFinite(state.simulationRemainderMs)).toBe(true);
  expect(state.simulationRemainderMs).toBeGreaterThanOrEqual(0);

  for (const floor of state.floors) {
    expect(Number.isSafeInteger(floor.mineShaftLevel)).toBe(true);
    expect(Number.isFinite(floor.extractionProgress)).toBe(true);
    expect(floor.extractionProgress).toBeGreaterThanOrEqual(0);
    expect(floor.extractionProgress).toBeLessThan(1);
  }

  expect(Number.isSafeInteger(state.elevator.level)).toBe(true);
  expect(Number.isFinite(state.elevator.transitProgress)).toBe(true);
  expect(state.elevator.transitProgress).toBeGreaterThanOrEqual(0);
  expect(state.elevator.transitProgress).toBeLessThan(1);
  expect(Number.isSafeInteger(state.warehouse.level)).toBe(true);
  expect(Number.isFinite(state.warehouse.conversionProgress)).toBe(true);
  expect(state.warehouse.conversionProgress).toBeGreaterThanOrEqual(0);
  expect(state.warehouse.conversionProgress).toBeLessThan(1);
}
