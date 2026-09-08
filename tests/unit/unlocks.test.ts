import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  createInitialGameState,
  describeFloorUnlock,
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

    expect(state.floors.slice(0, 4).every(({ isUnlocked }) => isUnlocked)).toBe(
      true,
    );
    expect(state.floors.slice(4).every(({ isUnlocked }) => !isUnlocked)).toBe(
      true,
    );
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

describe('floor unlock description', () => {
  /** A mine whose floor-1 shaft and balance can be set independently. */
  function createState(mineShaftLevel: number, gold: number): GameState {
    const base = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);

    return {
      ...base,
      gold: GameNumber.from(gold),
      floors: base.floors.map((floor, index) => {
        return index === 0 ? { ...floor, mineShaftLevel } : floor;
      }),
    };
  }

  it('describes a locked floor from its balance data and the mine it waits on', () => {
    const availability = describeFloorUnlock(
      createState(3, 100),
      'floor-2',
      BASE_GAME_BALANCE,
    );

    expect(availability).toMatchObject({
      floorId: 'floor-2',
      requirement: {
        floorId: 'floor-1',
        floorNumber: 1,
        level: 5,
        currentLevel: 3,
      },
      isRequirementMet: false,
      isAffordable: false,
      canUnlock: false,
    });
    expect(availability?.cost.equals(250)).toBe(true);
  });

  it('reports a still-locked prerequisite as level zero rather than as its level', () => {
    const base = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const state: GameState = {
      ...base,
      gold: GameNumber.from(10_000),
      // Floor 2 sits above the gate but has never been opened, so floor 3 is
      // still waiting on nothing it can count.
      floors: base.floors.map((floor, index) => {
        return index === 1 ? { ...floor, mineShaftLevel: 9 } : floor;
      }),
    };

    expect(
      describeFloorUnlock(state, 'floor-3', BASE_GAME_BALANCE),
    ).toMatchObject({
      requirement: { floorNumber: 2, level: 5, currentLevel: 0 },
      isRequirementMet: false,
      isAffordable: true,
      canUnlock: false,
    });
  });

  it('separates a met requirement from an affordable price', () => {
    expect(
      describeFloorUnlock(createState(5, 100), 'floor-2', BASE_GAME_BALANCE),
    ).toMatchObject({
      isRequirementMet: true,
      isAffordable: false,
      canUnlock: false,
    });
    expect(
      describeFloorUnlock(createState(5, 250), 'floor-2', BASE_GAME_BALANCE),
    ).toMatchObject({
      isRequirementMet: true,
      isAffordable: true,
      canUnlock: true,
    });
  });

  it('describes nothing for a floor that is already open', () => {
    expect(
      describeFloorUnlock(createState(1, 0), 'floor-1', BASE_GAME_BALANCE),
    ).toBeNull();
  });

  it('describes nothing for an unknown floor', () => {
    expect(
      describeFloorUnlock(createState(1, 0), 'floor-16', BASE_GAME_BALANCE),
    ).toBeNull();
  });

  /**
   * The description is what a control renders and the command is what charges
   * gold. If they disagreed, a floor could look unlockable and refuse the
   * press, or look gated and open anyway.
   */
  it('agrees with the command it is describing at every gate', () => {
    for (const mineShaftLevel of [1, 4, 5, 6]) {
      for (const gold of [0, 249, 250, 5_000]) {
        const state = createState(mineShaftLevel, gold);
        const availability = describeFloorUnlock(
          state,
          'floor-2',
          BASE_GAME_BALANCE,
        );
        const result = purchaseFloorUnlock(state, 'floor-2', BASE_GAME_BALANCE);
        const label = `level ${mineShaftLevel} with ${gold} gold`;

        expect(availability?.canUnlock, label).toBe(result.success);
        expect(availability?.cost.equals(result.cost ?? 0), label).toBe(true);

        if (!result.success) {
          expect(
            result.reason === 'prerequisite-not-met',
            `${label} names the gate the description reports`,
          ).toBe(!availability?.isRequirementMet);
        }
      }
    }
  });
});
