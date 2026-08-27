import type { GameState } from '../state/GameState';

export const SIMULATION_STEP_MS = 100;
export const MAX_FOREGROUND_DELTA_MS = 1_000;

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
    nextState = advanceFixedStep(nextState);
  }

  return {
    ...nextState,
    lastUpdateTimestampMs: state.lastUpdateTimestampMs + elapsedMs,
    simulationRemainderMs,
  };
}

function advanceFixedStep(state: GameState): GameState {
  const simulationTick = state.simulationTick + 1;

  if (!Number.isSafeInteger(simulationTick)) {
    throw new Error('Simulation tick exceeds the safe integer range.');
  }

  return {
    ...state,
    simulationTick,
  };
}

function validateElapsedMs(elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('Elapsed time must be a finite, non-negative number.');
  }
}
