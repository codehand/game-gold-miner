import type { GameState } from '../state/GameState';
import { advanceSimulation, MAX_FOREGROUND_DELTA_MS } from './advanceSimulation';

/**
 * Longest gap that is simulated tick by tick.
 *
 * The bound exists because catch-up runs inside the frame that discovers the
 * gap, so an unbounded walk would freeze the tab for as long as the player was
 * away. Two hours matches the horizon `offlineIncome.capDurationMs` already
 * applies to away time, so leaving the tab open and closing it are capped
 * alike; time past the cap is consumed without being credited, exactly as a
 * long absence is.
 */
export const MAX_CATCH_UP_MS = 2 * 60 * 60 * 1_000;

/**
 * Advances across a gap in the render loop without discarding the time.
 *
 * `advanceSimulation` credits at most `MAX_FOREGROUND_DELTA_MS` per call while
 * still consuming the whole delta, so one slow frame cannot pay out a burst of
 * production. A hidden tab is not a slow frame: the browser stops the render
 * loop entirely, so the whole absence arrives as a single delta and everything
 * past that first second would be consumed having never been simulated. This
 * walks the gap in credited-size slices instead, so equal wall-clock time
 * produces equal state whether the loop ran throughout or resumed after a
 * pause.
 *
 * Slicing is exact rather than approximate: `advanceSimulation` carries its own
 * sub-tick remainder in authoritative state, so a run of slices is
 * indistinguishable from the same time arriving continuously.
 */
export function catchUpSimulation(
  state: GameState,
  elapsedMs: number,
): GameState {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('Elapsed time must be a finite, non-negative number.');
  }

  const creditedMs = Math.min(elapsedMs, MAX_CATCH_UP_MS);
  let nextState = state;

  for (
    let consumedMs = 0;
    consumedMs < creditedMs;
    consumedMs += MAX_FOREGROUND_DELTA_MS
  ) {
    nextState = advanceSimulation(
      nextState,
      Math.min(MAX_FOREGROUND_DELTA_MS, creditedMs - consumedMs),
    );
  }

  const uncreditedMs = elapsedMs - creditedMs;

  if (uncreditedMs === 0) {
    return nextState;
  }

  // The authoritative timestamp still absorbs the whole gap. Leaving it behind
  // real time would hand the same interval to offline income on the next load.
  return {
    ...nextState,
    lastUpdateTimestampMs: nextState.lastUpdateTimestampMs + uncreditedMs,
  };
}
