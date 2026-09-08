import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceElevator,
  advanceSimulation,
  calculateElevatorLegDurationMs,
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

  it('travels to a floor before loading and returns when capacity is full', () => {
    const initialState = withFloorQueues([80, 0, 0, 0]);
    const approaching = advanceElevatorFor(initialState, 700);

    expect(approaching.floors[0].materialQueue.equals(80)).toBe(true);
    expect(approaching.elevator.carriedMaterial.equals(0)).toBe(true);
    expect(approaching.elevator.roundRobinCursor).toBe(0);
    expect(approaching.elevator.transitProgress).toBeCloseTo(14 / 15);

    const loaded = advanceElevatorFor(approaching, 100);

    expect(loaded.floors[0].materialQueue.equals(30)).toBe(true);
    expect(loaded.floors[0].totalTransported.equals(50)).toBe(true);
    expect(loaded.elevator.carriedMaterial.equals(50)).toBe(true);
    expect(loaded.elevator.roundRobinCursor).toBe(-1);
    expect(loaded.elevator.transitProgress).toBe(0);
    expect(loaded.warehouse.inputQueue.equals(0)).toBe(true);
    expect(initialState.floors[0].materialQueue.equals(80)).toBe(true);
    expect(initialState.floors[0].totalTransported.equals(0)).toBe(true);
    expect(initialState.elevator.carriedMaterial.equals(0)).toBe(true);

    const beforeDelivery = advanceElevatorFor(loaded, 1_300);

    expect(beforeDelivery.elevator.carriedMaterial.equals(50)).toBe(true);
    expect(beforeDelivery.elevator.transitProgress).toBeCloseTo(104 / 105);
    expect(beforeDelivery.warehouse.inputQueue.equals(0)).toBe(true);

    const delivered = advanceElevatorFor(beforeDelivery, 100);

    expect(delivered.elevator.carriedMaterial.equals(0)).toBe(true);
    expect(delivered.elevator.transitProgress).toBe(0);
    expect(delivered.warehouse.inputQueue.equals(50)).toBe(true);
    expect(delivered.warehouse.conversionProgress).toBe(0);
    expect(delivered.gold.equals(initialState.gold)).toBe(true);
  });

  it('stops at every unlocked floor while capacity remains', () => {
    const initialState = withFloorQueues([10, 0, 20, 0], [0, 1, 2]);
    const firstFloor = advanceElevatorFor(initialState, 800);

    expect(firstFloor.floors[0].materialQueue.equals(0)).toBe(true);
    expect(firstFloor.elevator.carriedMaterial.equals(10)).toBe(true);
    expect(firstFloor.elevator.roundRobinCursor).toBe(1);

    const emptySecondFloor = advanceElevatorFor(firstFloor, 900);

    expect(emptySecondFloor.floors[1].totalTransported.equals(0)).toBe(true);
    expect(emptySecondFloor.elevator.carriedMaterial.equals(10)).toBe(true);
    expect(emptySecondFloor.elevator.roundRobinCursor).toBe(2);

    const thirdFloor = advanceElevatorFor(emptySecondFloor, 900);

    expect(thirdFloor.floors[2].materialQueue.equals(0)).toBe(true);
    expect(thirdFloor.floors[2].totalTransported.equals(20)).toBe(true);
    expect(thirdFloor.elevator.carriedMaterial.equals(30)).toBe(true);
    expect(thirdFloor.elevator.roundRobinCursor).toBe(-3);
  });

  it('fills across consecutive floors, then returns from the deepest stop', () => {
    const initialState = withFloorQueues([20, 40, 0, 0], [0, 1]);
    const firstFloor = advanceElevatorFor(initialState, 800);
    const fullAtSecondFloor = advanceElevatorFor(firstFloor, 1_000);

    expect(fullAtSecondFloor.floors[0].totalTransported.equals(20)).toBe(true);
    expect(fullAtSecondFloor.floors[1].materialQueue.equals(10)).toBe(true);
    expect(fullAtSecondFloor.floors[1].totalTransported.equals(30)).toBe(true);
    expect(fullAtSecondFloor.elevator.carriedMaterial.equals(50)).toBe(true);
    expect(fullAtSecondFloor.elevator.roundRobinCursor).toBe(-2);

    const nearlyHome = advanceElevatorFor(fullAtSecondFloor, 2_600);
    expect(nearlyHome.elevator.carriedMaterial.equals(50)).toBe(true);
    expect(nearlyHome.warehouse.inputQueue.equals(0)).toBe(true);

    const delivered = advanceElevatorFor(nearlyHome, 100);
    expect(delivered.elevator.carriedMaterial.equals(0)).toBe(true);
    expect(delivered.warehouse.inputQueue.equals(50)).toBe(true);
  });

  it('returns instead of passing a floor that still has material', () => {
    const base = withFloorQueues([10, 10, 0, 0], [0, 1]);
    const approachingWithNearFullCabin: GameState = {
      ...base,
      elevator: {
        ...base.elevator,
        capacity: GameNumber.from(50.005),
        carriedMaterial: GameNumber.from(46.505),
        roundRobinCursor: 0,
        transitProgress: 0.99,
      },
    };

    const loaded = advanceElevatorFor(approachingWithNearFullCabin, 100);

    expect(loaded.floors[0].materialQueue.equals(6.5)).toBe(true);
    expect(loaded.elevator.carriedMaterial.equals(50.005)).toBe(true);
    expect(loaded.elevator.roundRobinCursor).toBe(-1);
  });

  it('slows each leg as carried load gets heavier', () => {
    const emptyDuration = calculateElevatorLegDurationMs(
      BASE_GAME_BALANCE.elevator.cycleDurationMs,
      GameNumber.from(0),
      GameNumber.from(50),
    );
    const halfDuration = calculateElevatorLegDurationMs(
      BASE_GAME_BALANCE.elevator.cycleDurationMs,
      GameNumber.from(25),
      GameNumber.from(50),
    );
    const fullDuration = calculateElevatorLegDurationMs(
      BASE_GAME_BALANCE.elevator.cycleDurationMs,
      GameNumber.from(50),
      GameNumber.from(50),
    );

    expect(emptyDuration).toBe(750);
    expect(halfDuration).toBe(1_031.25);
    expect(fullDuration).toBe(1_312.5);
    expect(
      calculateElevatorLegDurationMs(
        BASE_GAME_BALANCE.elevator.cycleDurationMs,
        GameNumber.from(50),
        GameNumber.from(50),
        2,
      ),
    ).toBe(2_625);
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
      .add(state.warehouse.inputQueue)
      .add(state.warehouse.totalGoldDelivered);

    expect(accountedMaterial.equals(initialMaterial.add(newlyExtracted))).toBe(
      true,
    );
    expect(
      state.gold.equals(initialState.gold.add(state.warehouse.totalGoldDelivered)),
    ).toBe(true);
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
      // A seeded queue is previously extracted material; keeping the fixture
      // authoritative lets the runtime enforce transported <= extracted.
      totalExtracted: GameNumber.from(queues[index] ?? 0),
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

function advanceElevatorFor(
  initialState: GameState,
  elapsedMs: number,
): GameState {
  const steps = Math.floor(elapsedMs / 100);

  return Array.from({ length: steps }).reduce<GameState>(
    (state) => advanceElevator(state, BASE_GAME_BALANCE.elevator, 100),
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
