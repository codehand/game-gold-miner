import {
  BASE_GAME_BALANCE,
  type BaseGameBalanceConfig,
  type MineFloorConfig,
} from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import { calculateLevelEffect } from '../progression/calculateLevelEffect';
import type { GameState, MineFloorState } from '../state/GameState';
import { advanceElevator } from './advanceElevator';
import { advanceWarehouse } from './advanceWarehouse';
import {
  EMPTY_CAT_PRODUCTION_MODIFIERS,
  getMiningOutputMultiplier,
  type CatProductionModifiers,
} from '../cats';

export const SIMULATION_STEP_MS = 100;
export const MAX_FOREGROUND_DELTA_MS = 1_000;
const PROGRESS_EPSILON = 1e-12;

export function advanceSimulation(state: GameState, elapsedMs: number): GameState;
export function advanceSimulation(
  state: GameState,
  elapsedMs: number,
  config: BaseGameBalanceConfig,
  modifiers?: CatProductionModifiers,
): GameState;
export function advanceSimulation(
  state: GameState,
  elapsedMs: number,
  ...options: [config?: BaseGameBalanceConfig, modifiers?: CatProductionModifiers]
): GameState {
  // `advanceSimulation` is also passed directly to Array.reduce by the
  // existing deterministic tests; reduce supplies its numeric index as the
  // third argument. Ignore that callback metadata while still accepting the
  // explicit config/modifier overload used by the live driver.
  const config = typeof options[0] === 'object' && options[0] !== null
    ? options[0]
    : BASE_GAME_BALANCE;
  const modifiers = options[1] !== undefined &&
      typeof options[1] === 'object' &&
      'miningOutputMultiplierByFloor' in options[1]
    ? options[1]
    : EMPTY_CAT_PRODUCTION_MODIFIERS;
  validateElapsedMs(elapsedMs);

  const creditedElapsedMs = Math.min(elapsedMs, MAX_FOREGROUND_DELTA_MS);
  const accumulatedMs = state.simulationRemainderMs + creditedElapsedMs;
  const completedTicks = Math.floor(accumulatedMs / SIMULATION_STEP_MS);
  const simulationRemainderMs =
    accumulatedMs - completedTicks * SIMULATION_STEP_MS;

  let nextState = state;

  for (let tick = 0; tick < completedTicks; tick += 1) {
    nextState = advanceFixedStep(nextState, config, modifiers);
  }

  return {
    ...nextState,
    lastUpdateTimestampMs: state.lastUpdateTimestampMs + elapsedMs,
    simulationRemainderMs,
  };
}

function advanceFixedStep(
  state: GameState,
  config: BaseGameBalanceConfig,
  modifiers: CatProductionModifiers,
): GameState {
  const simulationTick = state.simulationTick + 1;

  if (!Number.isSafeInteger(simulationTick)) {
    throw new Error('Simulation tick exceeds the safe integer range.');
  }

  const extractedState: GameState = {
    ...state,
    floors: state.floors.map((floor) => {
      return advanceExtraction(
        floor,
        findFloorConfig(config, floor.id),
        SIMULATION_STEP_MS,
        getMiningOutputMultiplier(modifiers, floor.id),
      );
    }),
  };
  const transportedState = advanceElevator(
    extractedState,
    config.elevator,
    SIMULATION_STEP_MS,
    modifiers.elevatorThroughputMultiplier,
  );
  const convertedState = advanceWarehouse(
    transportedState,
    config.warehouse,
    SIMULATION_STEP_MS,
    modifiers.warehouseProcessingMultiplier,
  );

  return {
    ...convertedState,
    simulationTick,
  };
}

function advanceExtraction(
  floor: MineFloorState,
  config: MineFloorConfig,
  elapsedMs: number,
  miningOutputMultiplier: number,
): MineFloorState {
  if (!floor.isUnlocked) {
    return floor;
  }

  const accumulatedProgress =
    floor.extractionProgress + elapsedMs / config.cycleDurationMs;
  const completedCycles = Math.floor(accumulatedProgress + PROGRESS_EPSILON);
  const extractionProgress = normalizeProgress(
    accumulatedProgress - completedCycles,
  );

  if (completedCycles === 0) {
    return {
      ...floor,
      extractionProgress,
    };
  }

  const completedOutput = calculateExtractionYield(floor, config).multiply(
    completedCycles * miningOutputMultiplier,
  );

  return {
    ...floor,
    extractionProgress,
    materialQueue: floor.materialQueue.add(completedOutput),
    totalExtracted: floor.totalExtracted.add(completedOutput),
  };
}

function calculateExtractionYield(
  floor: MineFloorState,
  config: MineFloorConfig,
): GameNumber {
  return calculateLevelEffect(
    config.baseYield,
    floor.mineShaftLevel,
    config.upgrade,
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

function normalizeProgress(progress: number): number {
  return Math.abs(progress) < PROGRESS_EPSILON ? 0 : progress;
}

function validateElapsedMs(elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('Elapsed time must be a finite, non-negative number.');
  }
}
