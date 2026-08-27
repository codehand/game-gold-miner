import type { SharedStageConfig } from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import type {
  ElevatorState,
  GameState,
  MineFloorState,
} from '../state/GameState';

const PROGRESS_EPSILON = 1e-12;

export function advanceElevator(
  state: GameState,
  config: SharedStageConfig,
  elapsedMs: number,
): GameState {
  if (state.elevator.carriedMaterial.greaterThan(0)) {
    return advanceTransit(state, config, elapsedMs);
  }

  const pickupIndex = findPickupIndex(
    state.floors,
    state.elevator.roundRobinCursor,
  );

  if (pickupIndex === null) {
    return state;
  }

  const floor = state.floors[pickupIndex];
  const carriedMaterial = minimum(floor.materialQueue, state.elevator.capacity);
  const floors = state.floors.map((currentFloor, index) => {
    if (index !== pickupIndex) {
      return currentFloor;
    }

    return {
      ...currentFloor,
      materialQueue: currentFloor.materialQueue.subtract(carriedMaterial),
      totalTransported: currentFloor.totalTransported.add(carriedMaterial),
    };
  });
  const pickupState: GameState = {
    ...state,
    floors,
    elevator: {
      ...state.elevator,
      roundRobinCursor: (pickupIndex + 1) % state.floors.length,
      transitProgress: 0,
      carriedMaterial,
    },
  };

  return advanceTransit(pickupState, config, elapsedMs);
}

function advanceTransit(
  state: GameState,
  config: SharedStageConfig,
  elapsedMs: number,
): GameState {
  const transitProgress =
    state.elevator.transitProgress + elapsedMs / config.cycleDurationMs;

  if (transitProgress + PROGRESS_EPSILON < 1) {
    return {
      ...state,
      elevator: {
        ...state.elevator,
        transitProgress,
      },
    };
  }

  return {
    ...state,
    elevator: {
      ...state.elevator,
      transitProgress: 0,
      carriedMaterial: GameNumber.from(0),
    },
    warehouse: {
      ...state.warehouse,
      inputQueue: state.warehouse.inputQueue.add(
        state.elevator.carriedMaterial,
      ),
    },
  };
}

function findPickupIndex(
  floors: readonly MineFloorState[],
  roundRobinCursor: ElevatorState['roundRobinCursor'],
): number | null {
  for (let offset = 0; offset < floors.length; offset += 1) {
    const index = (roundRobinCursor + offset) % floors.length;
    const floor = floors[index];

    if (floor.isUnlocked && floor.materialQueue.greaterThan(0)) {
      return index;
    }
  }

  return null;
}

function minimum(left: GameNumber, right: GameNumber): GameNumber {
  return left.lessThanOrEqualTo(right) ? left : right;
}
