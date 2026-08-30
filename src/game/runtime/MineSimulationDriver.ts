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

import type { BaseGameBalanceConfig } from '../../config';
import {
  catchUpSimulation,
  purchaseElevatorUpgrade,
  purchaseFloorUnlock,
  purchaseMineShaftUpgrade,
  purchaseWarehouseUpgrade,
  type FloorUnlockFailureReason,
  type GameState,
  type UpgradePurchaseFailureReason,
  type UpgradePurchaseResult,
} from '../../core';
import {
  createMineViewModel,
  type MineViewModel,
  type PurchaseOutcome,
  type PurchaseTarget,
} from '../view-model';

/** What the scene needs from whatever is feeding it snapshots. */
export interface MineSnapshotSource {
  /** The newest snapshot already derived, without advancing anything. */
  readonly snapshot: MineViewModel;
  /** Advances to the current time and returns the resulting snapshot. */
  advance(): MineViewModel;
}

/** What the scene sends when a player presses a control. */
export interface MineCommandSink {
  /**
   * Routes a press to the matching core command and reports what happened, so
   * the scene can show the result without deciding it.
   */
  purchase(target: PurchaseTarget): PurchaseOutcome;
}

/** Everything the scene needs: snapshots to pull, commands to send. */
export interface MineRuntimePort extends MineSnapshotSource, MineCommandSink {}

export interface MineSimulationDriverOptions {
  readonly state: GameState;
  /** Balance data the HUD's income estimate is derived from. */
  readonly balance: BaseGameBalanceConfig;
  /** Injected wall clock in milliseconds, normally `Date.now`. */
  readonly now: () => number;
  /**
   * Called after a command has changed authoritative state, so the host can
   * persist a purchase that no simulation tick would otherwise record.
   */
  readonly onCommandApplied?: () => void;
}

export class MineSimulationDriver implements MineRuntimePort {
  readonly #now: () => number;
  readonly #balance: BaseGameBalanceConfig;
  readonly #onCommandApplied: (() => void) | null;
  #state: GameState;
  #snapshot: MineViewModel;

  public constructor(options: MineSimulationDriverOptions) {
    this.#now = options.now;
    this.#balance = options.balance;
    this.#onCommandApplied = options.onCommandApplied ?? null;
    this.#state = options.state;
    this.#snapshot = createMineViewModel(options.state, options.balance);
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
   * Buys the next level of one stage or opens one locked floor, and reports the
   * core's answer.
   *
   * The mine is advanced to the current time first, because the player is
   * spending the gold they have now rather than the gold the last rendered
   * frame happened to show. The core remains the only authority on whether the
   * purchase succeeds: a refusal leaves authoritative state and the memoized
   * snapshot exactly as they were.
   */
  public purchase(target: PurchaseTarget): PurchaseOutcome {
    this.advance();

    const result =
      target.type === 'floor-unlock'
        ? purchaseFloorUnlock(this.#state, target.floorId, this.#balance)
        : this.#purchaseUpgrade(target);

    if (!result.success) {
      return describeRefusal(result.reason);
    }

    this.#setState(result.state);
    this.#onCommandApplied?.();

    return target.type === 'floor-unlock' ? 'unlocked' : 'purchased';
  }

  /**
   * Replaces authoritative state from outside the simulation, for commands such
   * as claiming an offline reward. The next `advance` continues from it.
   */
  public replaceState(state: GameState): void {
    this.#setState(state);
  }

  #purchaseUpgrade(
    target: Exclude<PurchaseTarget, { type: 'floor-unlock' }>,
  ): UpgradePurchaseResult {
    switch (target.type) {
      case 'mine-shaft':
        return purchaseMineShaftUpgrade(
          this.#state,
          target.floorId,
          this.#balance,
        );
      case 'elevator':
        return purchaseElevatorUpgrade(this.#state, this.#balance);
      case 'warehouse':
        return purchaseWarehouseUpgrade(this.#state, this.#balance);
    }
  }

  #setState(state: GameState): void {
    this.#state = state;
    this.#snapshot = createMineViewModel(state, this.#balance);
  }
}

/**
 * Translates a core refusal into what the control will say.
 *
 * Only the two reasons a player can act on are named: earn more gold, or raise
 * the prerequisite shaft. Everything else — an unknown floor, a locked shaft, a
 * floor already open — is a press that should not have been reachable, and
 * reads as unavailable rather than as advice the player cannot use.
 */
function describeRefusal(
  reason: UpgradePurchaseFailureReason | FloorUnlockFailureReason,
): PurchaseOutcome {
  switch (reason) {
    case 'insufficient-funds':
      return 'insufficient-funds';
    case 'prerequisite-not-met':
      return 'requirement-not-met';
    default:
      return 'unavailable';
  }
}
