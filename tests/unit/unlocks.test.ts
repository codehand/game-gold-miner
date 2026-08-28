import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  createInitialGameState,
  GameNumber,
  purchaseFloorUnlock,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('sequential floor unlocks', () => {
  it('rejects an unlock when the previous shaft is below its requirement', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state = { ...initialState, gold: GameNumber.from(10_000) };
    const result = purchaseFloorUnlock(
      state,
      'floor-2',
      BASE_GAME_BALANCE,
    );

    expect(result).toMatchObject({
      success: false,
      reason: 'prerequisite-not-met',
      state,
    });
    expect(result.cost?.equals(250)).toBe(true);
  });

  it('requires the previous floor to be unlocked even at the required level', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state: GameState = {
      ...initialState,
      gold: GameNumber.from(10_000),
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        mineShaftLevel: index === 1 ? 5 : floor.mineShaftLevel,
      })),
    };
    const result = purchaseFloorUnlock(
      state,
      'floor-3',
      BASE_GAME_BALANCE,
    );

    expect(result).toMatchObject({
      success: false,
      reason: 'prerequisite-not-met',
      state,
    });
  });

  it('rejects an unlock when gold is insufficient', () => {
    const initialState = withFloorLevel(
      createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS),
      0,
      5,
    );
    const state = { ...initialState, gold: GameNumber.from(249) };
    const result = purchaseFloorUnlock(
      state,
      'floor-2',
      BASE_GAME_BALANCE,
    );

    expect(result).toMatchObject({
      success: false,
      reason: 'insufficient-funds',
      state,
    });
    expect(result.cost?.equals(250)).toBe(true);
  });

  it('deducts once and initializes a successfully unlocked floor', () => {
    const initialState = withFloorLevel(
      createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS),
      0,
      5,
    );
    const dirtyLockedState: GameState = {
      ...initialState,
      gold: GameNumber.from(250),
      floors: initialState.floors.map((floor, index) => {
        return index === 1
          ? {
              ...floor,
              mineShaftLevel: 8,
              extractionProgress: 0.75,
              materialQueue: GameNumber.from(90),
              totalExtracted: GameNumber.from(120),
              totalTransported: GameNumber.from(30),
            }
          : floor;
      }),
    };
    const result = purchaseFloorUnlock(
      dirtyLockedState,
      'floor-2',
      BASE_GAME_BALANCE,
    );

    if (!result.success) {
      throw new Error('Expected floor unlock to succeed.');
    }

    const floor = result.state.floors[1];

    expect(result.cost.equals(250)).toBe(true);
    expect(result.state.gold.equals(0)).toBe(true);
    expect(floor).toMatchObject({
      id: 'floor-2',
      floorNumber: 2,
      isUnlocked: true,
      mineShaftLevel: 1,
      extractionProgress: 0,
    });
    expect(floor.materialQueue.equals(0)).toBe(true);
    expect(floor.totalExtracted.equals(0)).toBe(true);
    expect(floor.totalTransported.equals(0)).toBe(true);
    expect(result.state.floors[0]).toBe(dirtyLockedState.floors[0]);
    expect(result.state.floors[2]).toBe(dirtyLockedState.floors[2]);
    expect(result.state.floors[3]).toBe(dirtyLockedState.floors[3]);
    expect(result.state.elevator).toBe(dirtyLockedState.elevator);
    expect(result.state.warehouse).toBe(dirtyLockedState.warehouse);
    expectSimulationMetadataPreserved(result.state, dirtyLockedState);

    const producingState = advanceFor(result.state, 2_500);

    expect(producingState.floors[1].totalExtracted.equals(30)).toBe(true);
  });

  it('rejects a repeated unlock without another deduction', () => {
    const initialState = withFloorLevel(
      createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS),
      0,
      5,
    );
    const fundedState = { ...initialState, gold: GameNumber.from(1_000) };
    const firstResult = purchaseFloorUnlock(
      fundedState,
      'floor-2',
      BASE_GAME_BALANCE,
    );

    if (!firstResult.success) {
      throw new Error('Expected first floor unlock to succeed.');
    }

    const repeatedResult = purchaseFloorUnlock(
      firstResult.state,
      'floor-2',
      BASE_GAME_BALANCE,
    );

    expect(firstResult.state.gold.equals(750)).toBe(true);
    expect(repeatedResult).toMatchObject({
      success: false,
      reason: 'already-unlocked',
      state: firstResult.state,
    });
    expect(repeatedResult.cost?.equals(250)).toBe(true);
  });

  it('unlocks every deeper floor only in configured sequence', () => {
    let state = withFloorLevel(
      createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS),
      0,
      5,
    );
    state = { ...state, gold: GameNumber.from(10_000) };
    state = expectSuccessfulUnlock(state, 'floor-2', 250);
    state = withFloorLevel(state, 1, 5);
    state = expectSuccessfulUnlock(state, 'floor-3', 1_500);
    state = withFloorLevel(state, 2, 7);
    state = expectSuccessfulUnlock(state, 'floor-4', 7_500);

    expect(state.floors.map(({ isUnlocked }) => isUnlocked)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(state.gold.equals(750)).toBe(true);
  });

  it('returns floor-not-found for an unknown floor without mutation', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const result = purchaseFloorUnlock(
      state,
      'floor-missing',
      BASE_GAME_BALANCE,
    );

    expect(result).toEqual({
      success: false,
      reason: 'floor-not-found',
      state,
      cost: null,
    });
  });
});

function expectSuccessfulUnlock(
  state: GameState,
  floorId: string,
  expectedCost: number,
): GameState {
  const result = purchaseFloorUnlock(state, floorId, BASE_GAME_BALANCE);

  if (!result.success) {
    throw new Error(`Expected ${floorId} unlock to succeed.`);
  }

  expect(result.cost.equals(expectedCost)).toBe(true);

  return result.state;
}

function withFloorLevel(
  state: GameState,
  floorIndex: number,
  mineShaftLevel: number,
): GameState {
  return {
    ...state,
    floors: state.floors.map((floor, index) => {
      return index === floorIndex ? { ...floor, mineShaftLevel } : floor;
    }),
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

function expectSimulationMetadataPreserved(
  actual: GameState,
  expected: GameState,
): void {
  expect(actual.saveVersion).toBe(expected.saveVersion);
  expect(actual.lastUpdateTimestampMs).toBe(expected.lastUpdateTimestampMs);
  expect(actual.simulationTick).toBe(expected.simulationTick);
  expect(actual.simulationRemainderMs).toBe(expected.simulationRemainderMs);
}
