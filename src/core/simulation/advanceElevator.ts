import type { SharedStageConfig } from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import type {
  ElevatorState,
  GameState,
  MineFloorState,
} from '../state/GameState';

const PROGRESS_EPSILON = 1e-12;
/** A full car takes 75% longer than an empty car over the same distance. */
export const FULL_ELEVATOR_LOAD_SLOWDOWN = 0.75;

export type ElevatorRouteDirection = 'idle' | 'descending' | 'ascending';

export interface ElevatorRoute {
  readonly direction: ElevatorRouteDirection;
  readonly floorIndex: number | null;
  readonly progress: number;
}

/**
 * One signed cursor keeps the route save-compatible:
 * non-negative is the floor being approached downward; `-(index + 1)` is the
 * floor the cabin is returning from. Zero with no work is the surface idle.
 */
export function describeElevatorRoute(
  elevator: ElevatorState,
  floors: readonly MineFloorState[],
): ElevatorRoute {
  if (
    elevator.carriedMaterial.equals(0) &&
    elevator.transitProgress === 0 &&
    elevator.roundRobinCursor === 0 &&
    !hasWaitingMaterial(floors)
  ) {
    return { direction: 'idle', floorIndex: null, progress: 0 };
  }

  if (elevator.roundRobinCursor < 0) {
    return {
      direction: 'ascending',
      floorIndex: -elevator.roundRobinCursor - 1,
      progress: elevator.transitProgress,
    };
  }

  return {
    direction: 'descending',
    floorIndex: elevator.roundRobinCursor,
    progress: elevator.transitProgress,
  };
}

export function advanceElevator(
  state: GameState,
  config: SharedStageConfig,
  elapsedMs: number,
): GameState {
  const route = describeElevatorRoute(state.elevator, state.floors);

  if (route.direction === 'idle') {
    if (!hasWaitingMaterial(state.floors)) {
      return state;
    }

    return advanceRouteLeg(state, config, elapsedMs, {
      direction: 'descending',
      floorIndex: 0,
      progress: 0,
    });
  }

  return advanceRouteLeg(state, config, elapsedMs, route);
}

function advanceRouteLeg(
  state: GameState,
  config: SharedStageConfig,
  elapsedMs: number,
  route: ElevatorRoute,
): GameState {
  if (route.floorIndex === null || route.direction === 'idle') {
    return state;
  }

  const distanceInFloors =
    route.direction === 'ascending' ? route.floorIndex + 1 : 1;
  const legDurationMs = calculateElevatorLegDurationMs(
    config.cycleDurationMs,
    state.elevator.carriedMaterial,
    state.elevator.capacity,
    distanceInFloors,
  );
  const transitProgress = route.progress + elapsedMs / legDurationMs;

  if (transitProgress + PROGRESS_EPSILON < 1) {
    return {
      ...state,
      elevator: {
        ...state.elevator,
        roundRobinCursor:
          route.direction === 'ascending'
            ? -(route.floorIndex + 1)
            : route.floorIndex,
        transitProgress,
      },
    };
  }

  return route.direction === 'ascending'
    ? deliverAtSurface(state)
    : loadAtFloor(state, route.floorIndex);
}

function loadAtFloor(state: GameState, floorIndex: number): GameState {
  const floor = state.floors[floorIndex];
  const remainingCapacity = state.elevator.capacity.subtract(
    state.elevator.carriedMaterial,
  );
  const pickedUp = minimum(floor.materialQueue, remainingCapacity);
  const carriedMaterial = state.elevator.carriedMaterial.add(pickedUp);
  const floors = state.floors.map((currentFloor, index) => {
    if (index !== floorIndex || pickedUp.equals(0)) {
      return currentFloor;
    }

    return {
      ...currentFloor,
      materialQueue: currentFloor.materialQueue.subtract(pickedUp),
      totalTransported: currentFloor.totalTransported.add(pickedUp),
    };
  });
  const nextFloorIndex = findNextUnlockedFloorIndex(floors, floorIndex + 1);
  const continuesDown =
    carriedMaterial.lessThan(state.elevator.capacity) &&
    nextFloorIndex !== null;

  return {
    ...state,
    floors,
    elevator: {
      ...state.elevator,
      roundRobinCursor: continuesDown
        ? nextFloorIndex
        : -(floorIndex + 1),
      transitProgress: 0,
      carriedMaterial,
    },
  };
}

function deliverAtSurface(state: GameState): GameState {
  return {
    ...state,
    elevator: {
      ...state.elevator,
      roundRobinCursor: 0,
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

/** Duration of one route leg after distance and load weight are applied. */
export function calculateElevatorLegDurationMs(
  cycleDurationMs: number,
  carriedMaterial: GameNumber,
  capacity: GameNumber,
  distanceInFloors: number = 1,
): number {
  if (!Number.isFinite(cycleDurationMs) || cycleDurationMs <= 0) {
    throw new Error('Elevator cycle duration must be finite and positive.');
  }

  if (!Number.isInteger(distanceInFloors) || distanceInFloors < 1) {
    throw new Error('Elevator distance must be a positive floor count.');
  }

  const loadRatio = calculateLoadRatio(carriedMaterial, capacity);
  const emptyFloorLegMs = cycleDurationMs / 2;

  return (
    emptyFloorLegMs *
    distanceInFloors *
    (1 + loadRatio * FULL_ELEVATOR_LOAD_SLOWDOWN)
  );
}

function calculateLoadRatio(
  carriedMaterial: GameNumber,
  capacity: GameNumber,
): number {
  if (!capacity.greaterThan(0) || !carriedMaterial.greaterThan(0)) {
    return 0;
  }

  const exponentDifference = carriedMaterial.exponent - capacity.exponent;
  const ratio =
    (carriedMaterial.mantissa / capacity.mantissa) *
    10 ** exponentDifference;

  return Math.min(1, Math.max(0, ratio));
}

function findNextUnlockedFloorIndex(
  floors: readonly MineFloorState[],
  startIndex: number,
): number | null {
  for (let index = startIndex; index < floors.length; index += 1) {
    if (floors[index].isUnlocked) {
      return index;
    }
  }

  return null;
}

function hasWaitingMaterial(floors: readonly MineFloorState[]): boolean {
  return floors.some(
    (floor) => floor.isUnlocked && floor.materialQueue.greaterThan(0),
  );
}

function minimum(left: GameNumber, right: GameNumber): GameNumber {
  return left.lessThanOrEqualTo(right) ? left : right;
}
