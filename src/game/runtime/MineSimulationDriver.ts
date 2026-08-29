/**
 * The live bridge between the deterministic core and the rendered mine.
 *
 * The renderer pulls: every frame the scene asks for the newest snapshot, and
 * this driver advances the core to the injected wall clock before deriving one.
 * Nothing about the rendered frame — its rate, its delta, its animation speed —
 * enters that calculation, so presentation can never decide when a production
 * cycle completes. Equal wall-clock time produces equal state whatever the
 * frame rate, and whatever gaps the render loop had, because `catchUpSimulation`
 * walks a gap in credited-size slices and carries its own sub-tick remainder.
 *
 * The driver holds no clock of its own. `now` is injected so `Date.now()` stays
 * in `src/main.ts` and Node tests can advance time exactly.
 */

import { catchUpSimulation, type GameState } from '../../core';
import { createMineViewModel, type MineViewModel } from '../view-model';

/** What the scene needs from whatever is feeding it snapshots. */
export interface MineSnapshotSource {
  /** The newest snapshot already derived, without advancing anything. */
  readonly snapshot: MineViewModel;
  /** Advances to the current time and returns the resulting snapshot. */
  advance(): MineViewModel;
}

export interface MineSimulationDriverOptions {
  readonly state: GameState;
  /** Injected wall clock in milliseconds, normally `Date.now`. */
  readonly now: () => number;
}

export class MineSimulationDriver implements MineSnapshotSource {
  readonly #now: () => number;
  #state: GameState;
  #snapshot: MineViewModel;

  public constructor(options: MineSimulationDriverOptions) {
    this.#now = options.now;
    this.#state = options.state;
    this.#snapshot = createMineViewModel(options.state);
  }

  public get state(): GameState {
    return this.#state;
  }

  /**
   * Memoized: while no fixed tick completes, every frame receives the same
   * object, so the scene can skip rebinding work by identity alone.
   */
  public get snapshot(): MineViewModel {
    return this.#snapshot;
  }

  public advance(): MineViewModel {
    const elapsedMs = this.#now() - this.#state.lastUpdateTimestampMs;

    // A clock that has not moved, or has moved backwards (host correction,
    // suspended tab restored with a rewound clock), credits nothing. The
    // authoritative timestamp stays ahead until real time catches up, which is
    // the safe direction: it can never pay out time that did not pass.
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return this.#snapshot;
    }

    // Caught up rather than advanced once: the browser stops the render loop
    // for a hidden tab, so this delta is routinely a whole absence rather than
    // a frame, and a single bounded advance would consume it uncredited.
    const nextState = catchUpSimulation(this.#state, elapsedMs);

    // Only a completed fixed tick can change a displayed value. A frame shorter
    // than `SIMULATION_STEP_MS` — which at sixty frames a second is most of
    // them — leaves a state differing solely in its timestamp and sub-tick
    // remainder, so re-deriving would rebuild an identical snapshot and hand
    // the scene a new object to rebind. Advancing the tick counter is exactly
    // the condition, because `advanceSimulation` increments it once per tick
    // and nothing else in the pipeline touches production state.
    if (nextState.simulationTick === this.#state.simulationTick) {
      this.#state = nextState;

      return this.#snapshot;
    }

    this.#setState(nextState);

    return this.#snapshot;
  }

  /**
   * Replaces authoritative state from outside the simulation, for commands such
   * as claiming an offline reward. The next `advance` continues from it.
   */
  public replaceState(state: GameState): void {
    this.#setState(state);
  }

  #setState(state: GameState): void {
    this.#state = state;
    this.#snapshot = createMineViewModel(state);
  }
}
