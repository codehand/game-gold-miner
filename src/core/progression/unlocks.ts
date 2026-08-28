import type { BaseGameBalanceConfig, MineFloorConfig } from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import type { GameState } from '../state/GameState';
import { createMineFloorState } from '../state/createInitialGameState';

export type FloorUnlockFailureReason =
  | 'floor-not-found'
  | 'already-unlocked'
  | 'prerequisite-not-met'
  | 'insufficient-funds';

export type FloorUnlockResult =
  | {
      readonly success: true;
      readonly state: GameState;
      readonly cost: GameNumber;
    }
  | {
      readonly success: false;
      readonly state: GameState;
      readonly cost: GameNumber | null;
      readonly reason: FloorUnlockFailureReason;
    };

export function purchaseFloorUnlock(
  state: GameState,
  floorId: string,
  config: BaseGameBalanceConfig,
): FloorUnlockResult {
  const floorIndex = state.floors.findIndex(({ id }) => id === floorId);

  if (floorIndex === -1) {
    return failure(state, null, 'floor-not-found');
  }

  const floor = state.floors[floorIndex];
  const floorConfig = findFloorConfig(config, floorId);
  const cost = GameNumber.from(floorConfig.unlockCost);

  if (floor.isUnlocked) {
    return failure(state, cost, 'already-unlocked');
  }

  const requirement = floorConfig.unlockRequirement;

  if (requirement === null) {
    throw new Error(`Floor ${floorId} has no unlock requirement.`);
  }

  const prerequisiteFloor = state.floors.find(
    ({ id }) => id === requirement.floorId,
  );

  if (
    prerequisiteFloor === undefined ||
    !prerequisiteFloor.isUnlocked ||
    prerequisiteFloor.mineShaftLevel < requirement.level
  ) {
    return failure(state, cost, 'prerequisite-not-met');
  }

  if (state.gold.lessThan(cost)) {
    return failure(state, cost, 'insufficient-funds');
  }

  return success(
    {
      ...state,
      gold: state.gold.subtract(cost),
      floors: state.floors.map((currentFloor, index) => {
        return index === floorIndex
          ? createMineFloorState(floorConfig, true)
          : currentFloor;
      }),
    },
    cost,
  );
}

function findFloorConfig(
  config: BaseGameBalanceConfig,
  floorId: string,
): MineFloorConfig {
  const floorConfig = config.floors.find(({ id }) => id === floorId);

  if (floorConfig === undefined) {
    throw new Error(`Missing balance configuration for floor ${floorId}.`);
  }

  return floorConfig;
}

function success(state: GameState, cost: GameNumber): FloorUnlockResult {
  return { success: true, state, cost };
}

function failure(
  state: GameState,
  cost: GameNumber | null,
  reason: FloorUnlockFailureReason,
): FloorUnlockResult {
  return { success: false, state, cost, reason };
}
