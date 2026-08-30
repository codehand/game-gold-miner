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

/** The prior shaft a locked floor waits on, resolved for display. */
export interface FloorUnlockRequirement {
  readonly floorId: string;
  /** The prerequisite's player-facing number, for a readable requirement. */
  readonly floorNumber: number;
  /** Mine-shaft level that prerequisite must reach. */
  readonly level: number;
  /** Where that shaft stands now, so progress towards the gate is visible. */
  readonly currentLevel: number;
}

/**
 * Everything a locked floor's unlock control needs, derived from the same
 * checks `purchaseFloorUnlock` performs. The price shown and the price charged
 * therefore cannot drift, and neither can the reason a press is refused.
 */
export interface FloorUnlockAvailability {
  readonly floorId: string;
  readonly cost: GameNumber;
  readonly requirement: FloorUnlockRequirement;
  readonly isRequirementMet: boolean;
  /** True when the balance covers the price, whatever the requirement says. */
  readonly isAffordable: boolean;
  /** True only when a press would actually open the floor. */
  readonly canUnlock: boolean;
}

type FloorUnlockEvaluation =
  | { readonly status: 'floor-not-found' }
  | { readonly status: 'already-unlocked'; readonly cost: GameNumber }
  | {
      readonly status: 'locked';
      readonly floorIndex: number;
      readonly floorConfig: MineFloorConfig;
      readonly availability: FloorUnlockAvailability;
    };

/**
 * What the player would see and pay for one locked floor, or `null` once the
 * floor is open and there is nothing left to unlock.
 */
export function describeFloorUnlock(
  state: GameState,
  floorId: string,
  config: BaseGameBalanceConfig,
): FloorUnlockAvailability | null {
  const evaluation = evaluateFloorUnlock(state, floorId, config);

  return evaluation.status === 'locked' ? evaluation.availability : null;
}

export function purchaseFloorUnlock(
  state: GameState,
  floorId: string,
  config: BaseGameBalanceConfig,
): FloorUnlockResult {
  const evaluation = evaluateFloorUnlock(state, floorId, config);

  if (evaluation.status === 'floor-not-found') {
    return failure(state, null, 'floor-not-found');
  }

  if (evaluation.status === 'already-unlocked') {
    return failure(state, evaluation.cost, 'already-unlocked');
  }

  const { availability, floorConfig, floorIndex } = evaluation;

  if (!availability.isRequirementMet) {
    return failure(state, availability.cost, 'prerequisite-not-met');
  }

  if (!availability.isAffordable) {
    return failure(state, availability.cost, 'insufficient-funds');
  }

  return success(
    {
      ...state,
      gold: state.gold.subtract(availability.cost),
      floors: state.floors.map((currentFloor, index) => {
        return index === floorIndex
          ? createMineFloorState(floorConfig, true)
          : currentFloor;
      }),
    },
    availability.cost,
  );
}

/**
 * The single unlock predicate. Both the description a control renders and the
 * command that charges gold read it, so a floor can never look unlockable to
 * the player while the command refuses it, or the reverse.
 */
function evaluateFloorUnlock(
  state: GameState,
  floorId: string,
  config: BaseGameBalanceConfig,
): FloorUnlockEvaluation {
  const floorIndex = state.floors.findIndex(({ id }) => id === floorId);

  if (floorIndex === -1) {
    return { status: 'floor-not-found' };
  }

  const floor = state.floors[floorIndex];
  const floorConfig = findFloorConfig(config, floorId);
  const cost = GameNumber.from(floorConfig.unlockCost);

  if (floor.isUnlocked) {
    return { status: 'already-unlocked', cost };
  }

  const requirement = floorConfig.unlockRequirement;

  if (requirement === null) {
    throw new Error(`Floor ${floorId} has no unlock requirement.`);
  }

  const prerequisiteConfig = findFloorConfig(config, requirement.floorId);
  const prerequisiteFloor = state.floors.find(
    ({ id }) => id === requirement.floorId,
  );
  const isRequirementMet =
    prerequisiteFloor !== undefined &&
    prerequisiteFloor.isUnlocked &&
    prerequisiteFloor.mineShaftLevel >= requirement.level;
  const isAffordable = !state.gold.lessThan(cost);

  return {
    status: 'locked',
    floorIndex,
    floorConfig,
    availability: {
      floorId,
      cost,
      requirement: {
        floorId: requirement.floorId,
        floorNumber: prerequisiteConfig.floorNumber,
        level: requirement.level,
        // A missing or still-locked prerequisite reads as level zero rather
        // than as a level it has not reached: the gate is what matters here.
        currentLevel:
          prerequisiteFloor !== undefined && prerequisiteFloor.isUnlocked
            ? prerequisiteFloor.mineShaftLevel
            : 0,
      },
      isRequirementMet,
      isAffordable,
      canUnlock: isRequirementMet && isAffordable,
    },
  };
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
