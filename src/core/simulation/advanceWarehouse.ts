import type { SharedStageConfig } from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import type { GameState } from '../state/GameState';

const PROGRESS_EPSILON = 1e-12;

export function advanceWarehouse(
  state: GameState,
  config: SharedStageConfig,
  elapsedMs: number,
): GameState {
  if (!state.warehouse.inputQueue.greaterThan(0)) {
    return state;
  }

  const accumulatedProgress =
    state.warehouse.conversionProgress + elapsedMs / config.cycleDurationMs;
  const completedCycles = Math.floor(accumulatedProgress + PROGRESS_EPSILON);

  if (completedCycles === 0) {
    return {
      ...state,
      warehouse: {
        ...state.warehouse,
        conversionProgress: accumulatedProgress,
      },
    };
  }

  let inputQueue = state.warehouse.inputQueue;
  let deliveredGold = GameNumber.from(0);

  for (
    let cycle = 0;
    cycle < completedCycles && inputQueue.greaterThan(0);
    cycle += 1
  ) {
    const convertedMaterial = minimum(inputQueue, state.warehouse.capacity);

    inputQueue = inputQueue.subtract(convertedMaterial);
    deliveredGold = deliveredGold.add(convertedMaterial);
  }

  const conversionProgress = inputQueue.greaterThan(0)
    ? normalizeProgress(accumulatedProgress - completedCycles)
    : 0;

  return {
    ...state,
    gold: state.gold.add(deliveredGold),
    warehouse: {
      ...state.warehouse,
      inputQueue,
      conversionProgress,
      totalGoldDelivered:
        state.warehouse.totalGoldDelivered.add(deliveredGold),
    },
  };
}

function minimum(left: GameNumber, right: GameNumber): GameNumber {
  return left.lessThanOrEqualTo(right) ? left : right;
}

function normalizeProgress(progress: number): number {
  return Math.abs(progress) < PROGRESS_EPSILON ? 0 : progress;
}
