import {
  BASE_GAME_BALANCE,
  type BaseGameBalanceConfig,
  type MineFloorConfig,
} from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import type { GameState, MineFloorState } from '../state/GameState';
import { advanceElevator } from './advanceElevator';
import { advanceWarehouse } from './advanceWarehouse';

export const SIMULATION_STEP_MS = 100;
export const MAX_FOREGROUND_DELTA_MS = 1_000;
const PROGRESS_EPSILON = 1e-12;

export function advanceSimulation(
  state: GameState,
  elapsedMs: number,
): GameState {
  validateElapsedMs(elapsedMs);

  const creditedElapsedMs = Math.min(elapsedMs, MAX_FOREGROUND_DELTA_MS);
  const accumulatedMs = state.simulationRemainderMs + creditedElapsedMs;
  const completedTicks = Math.floor(accumulatedMs / SIMULATION_STEP_MS);
  const simulationRemainderMs =
    accumulatedMs - completedTicks * SIMULATION_STEP_MS;

  let nextState = state;

  for (let tick = 0; tick < completedTicks; tick += 1) {
    nextState = advanceFixedStep(nextState, BASE_GAME_BALANCE);
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
      );
    }),
  };
  const transportedState = advanceElevator(
    extractedState,
    config.elevator,
    SIMULATION_STEP_MS,
  );
  const convertedState = advanceWarehouse(
    transportedState,
    config.warehouse,
    SIMULATION_STEP_MS,
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
    completedCycles,
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
  const levelMultiplier = config.upgrade.outputGrowthRate **
    (floor.mineShaftLevel - 1);

  return GameNumber.from(config.baseYield).multiply(levelMultiplier);
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
