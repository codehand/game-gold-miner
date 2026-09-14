import type { BaseGameBalanceConfig, MineFloorConfig } from '../../config';
import { calculateMineProductionRates } from '../economy/calculateProductionRates';
import { GameNumber } from '../numbers/GameNumber';
import { calculateLevelEffect } from '../progression/calculateLevelEffect';
import {
  calculateElevatorUpgradeBatchCost,
  calculateMineShaftUpgradeBatchCost,
  calculateWarehouseUpgradeBatchCost,
} from '../progression/upgrades';
import type { GameState } from '../state/GameState';

/**
 * Server-milestone Step 23: the upper-bound check on an uploaded save.
 *
 * The server re-derives "the most the mine could have produced" from the last
 * accepted document across the server-measured elapsed time, and rejects a
 * document that claims more. It bounds the **monotonic cumulative counters**
 * (`totalExtracted`, `totalTransported`, `totalGoldDelivered`,
 * `totalOfflineGoldClaimed`) and the **upgrade spend** (levels and unlocks),
 * never current `gold`, which legitimately falls when the player spends.
 *
 * **The modelling rule, stated rather than implied (finding F3).** Between two
 * uploads the server does not know which upgrades the player bought or when, so
 * it cannot compute a tight bound. It uses the shared core's own rate and cost
 * functions on the *candidate's final configuration*:
 *
 * - a cumulative counter may not exceed its previous value plus the candidate's
 *   own production rate held for the whole interval (multiplied by the
 *   tolerance). Because levels only ever rise, the final rate is at least any
 *   earlier rate, so this is a genuine upper bound — and a loose one, since the
 *   player actually upgraded gradually.
 * - a counter additionally carries whatever material was already in the
 *   pipeline when the interval opened: a floor's in-flight extraction cycle,
 *   its queued material, the elevator's carried load, and the warehouse's
 *   input queue. A proportional rate term alone is near-zero on a short
 *   interval, while one completed cycle or one drained queue is a fixed
 *   amount, so without these terms an honest save that merely kept playing is
 *   rejected (review finding F1). The in-flight cycle is valued at the
 *   candidate's level, the largest it can complete at.
 * - the total gold spent on the upgrades and unlocks between the two documents
 *   may not exceed the previous balance plus that same maximum earning — one
 *   earning term, not the sum of the delivery and offline allowances, because
 *   the interval was either spent playing or spent away (review finding F5).
 *
 * No ticks are simulated: the interval can exceed `MAX_CATCH_UP_MS` (two hours),
 * so an `O(elapsed)` walk would blow the upload latency budget in §7.1, while
 * the shared rate model gives the same (looser) upper bound in `O(floors)`. It
 * is deliberately **loose and biased toward accepting a slightly generous save
 * over rejecting an honest one**, per the threat model's §1 ranking.
 *
 * The economy is *not* changed: this only decides whether to reject a document
 * the client already produced.
 */

/**
 * Headroom on the bound, as a fraction.
 *
 * The rate model already over-estimates by assuming the final configuration
 * was in place for the entire interval, and the carried terms above already
 * allow all in-flight material to be settled immediately. This 5% absorbs the
 * remaining differences between the client's fixed-step simulation and the
 * continuous rate — sub-tick remainders, fractional yields, and the rounding
 * in each `GameNumber` update — without letting a materially larger claim
 * through. `tests/unit/progress-bound.test.ts` pins it from both sides, so
 * widening it silently fails.
 */
export const PROGRESS_BOUND_TOLERANCE = 0.05;

export interface ProgressBoundViolation {
  /** The bounded field that was exceeded, named for the `save_rejected` detail. */
  readonly counter: string;
  readonly claimed: string;
  readonly maximum: string;
}

export interface ProgressBoundInput {
  readonly previous: GameState;
  readonly candidate: GameState;
  readonly elapsedMs: number;
  readonly config: BaseGameBalanceConfig;
  readonly tolerance?: number;
}

export function evaluateProgressBound(
  input: ProgressBoundInput,
): ProgressBoundViolation | null {
  const tolerance = input.tolerance ?? PROGRESS_BOUND_TOLERANCE;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error('Progress bound tolerance must be a finite, non-negative number.');
  }

  const seconds = Math.max(0, input.elapsedMs) / 1_000;
  const headroom = 1 + tolerance;
  const rates = calculateMineProductionRates(input.candidate, input.config);
  const earnedGold = rates.effectiveProductionPerSecond
    .multiply(seconds)
    .multiply(headroom);
  const inFlightYield = sumInFlightCycleYield(input.candidate, input.config);

  const maxDelivered = input.previous.warehouse.totalGoldDelivered
    .add(undeliveredMaterial(input.previous))
    .add(inFlightYield)
    .add(earnedGold);
  if (input.candidate.warehouse.totalGoldDelivered.greaterThan(maxDelivered)) {
    return violation(
      'state.warehouse.totalGoldDelivered',
      input.candidate.warehouse.totalGoldDelivered,
      maxDelivered,
    );
  }

  // An offline claim is produced by an absence; it carries no in-flight
  // material, only the interval's own earning at the effective rate.
  const maxOfflineClaimed =
    input.previous.warehouse.totalOfflineGoldClaimed.add(earnedGold);
  if (
    input.candidate.warehouse.totalOfflineGoldClaimed.greaterThan(
      maxOfflineClaimed,
    )
  ) {
    return violation(
      'state.warehouse.totalOfflineGoldClaimed',
      input.candidate.warehouse.totalOfflineGoldClaimed,
      maxOfflineClaimed,
    );
  }

  for (const [index, floor] of input.candidate.floors.entries()) {
    if (!floor.isUnlocked) {
      continue;
    }

    const previousFloor = input.previous.floors[index];
    const floorRate = rates.floors[index].theoreticalExtractionPerSecond;
    const floorYield = inFlightCycleYieldForFloor(
      floor,
      findFloorConfig(input.config, floor.id),
    );

    const maxExtracted = previousFloor.totalExtracted
      .add(floorYield)
      .add(floorRate.multiply(seconds).multiply(headroom));
    if (floor.totalExtracted.greaterThan(maxExtracted)) {
      return violation(
        `state.floors[${floor.id}].totalExtracted`,
        floor.totalExtracted,
        maxExtracted,
      );
    }

    // Transport can never exceed the shared elevator's throughput, and it can
    // also settle any material the floor had already queued.
    const transportRate = floorRate.lessThanOrEqualTo(rates.elevatorCapacityPerSecond)
      ? floorRate
      : rates.elevatorCapacityPerSecond;
    const maxTransported = previousFloor.totalTransported
      .add(previousFloor.materialQueue)
      .add(floorYield)
      .add(transportRate.multiply(seconds).multiply(headroom));
    if (floor.totalTransported.greaterThan(maxTransported)) {
      return violation(
        `state.floors[${floor.id}].totalTransported`,
        floor.totalTransported,
        maxTransported,
      );
    }
  }

  // Levels and unlocks are bought with gold, so their total cost is bounded by
  // the previous balance plus the maximum the mine could have earned. One
  // earning term: the interval was either played (deliveries) or spent away (a
  // capped offline claim), never both at full rate (review finding F5).
  const spendNeeded = totalUpgradeSpend(
    input.previous,
    input.candidate,
    input.config,
  );
  const maxSpendable = input.previous.gold.add(earnedGold);
  if (spendNeeded.greaterThan(maxSpendable)) {
    return violation('state.upgradeSpend', spendNeeded, maxSpendable);
  }

  return null;
}

/**
 * Material that had already been extracted at the interval's open but not yet
 * delivered: each floor's queue, the elevator's load, and the warehouse's input
 * queue. All of it may reach `totalGoldDelivered` with no further production.
 */
function undeliveredMaterial(state: GameState): GameNumber {
  return state.floors
    .reduce(
      (total, floor) => total.add(floor.materialQueue),
      GameNumber.from(0),
    )
    .add(state.elevator.carriedMaterial)
    .add(state.warehouse.inputQueue);
}

/** One completed extraction cycle's yield for every unlocked floor. */
function sumInFlightCycleYield(
  state: GameState,
  config: BaseGameBalanceConfig,
): GameNumber {
  return state.floors.reduce((total, floor) => {
    if (!floor.isUnlocked) {
      return total;
    }

    return total.add(
      inFlightCycleYieldForFloor(floor, findFloorConfig(config, floor.id)),
    );
  }, GameNumber.from(0));
}

function inFlightCycleYieldForFloor(
  floor: GameState['floors'][number],
  config: MineFloorConfig,
): GameNumber {
  return calculateLevelEffect(config.baseYield, floor.mineShaftLevel, config.upgrade);
}

/** Total gold required to move `previous` to `candidate`: upgrades plus floor unlocks. */
function totalUpgradeSpend(
  previous: GameState,
  candidate: GameState,
  config: BaseGameBalanceConfig,
): GameNumber {
  let total = GameNumber.from(0);

  for (const floorConfig of config.floors) {
    const previousFloor = findFloor(previous, floorConfig.id);
    const candidateFloor = findFloor(candidate, floorConfig.id);

    if (!previousFloor.isUnlocked && candidateFloor.isUnlocked) {
      total = total.add(GameNumber.from(floorConfig.unlockCost));
    }

    if (
      candidateFloor.isUnlocked &&
      candidateFloor.mineShaftLevel > previousFloor.mineShaftLevel
    ) {
      total = total.add(
        calculateMineShaftUpgradeBatchCost(
          previousFloor,
          floorConfig,
          candidateFloor.mineShaftLevel - previousFloor.mineShaftLevel,
        ),
      );
    }
  }

  if (candidate.elevator.level > previous.elevator.level) {
    total = total.add(
      calculateElevatorUpgradeBatchCost(
        previous.elevator,
        config.elevator,
        candidate.elevator.level - previous.elevator.level,
      ),
    );
  }

  if (candidate.warehouse.level > previous.warehouse.level) {
    total = total.add(
      calculateWarehouseUpgradeBatchCost(
        previous.warehouse,
        config.warehouse,
        candidate.warehouse.level - previous.warehouse.level,
      ),
    );
  }

  return total;
}

function findFloor(state: GameState, floorId: string): GameState['floors'][number] {
  const floor = state.floors.find((candidate) => candidate.id === floorId);

  if (floor === undefined) {
    throw new Error(`Missing floor ${floorId} in the state being bounded.`);
  }

  return floor;
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

function violation(
  counter: string,
  claimed: GameNumber,
  maximum: GameNumber,
): ProgressBoundViolation {
  return { counter, claimed: claimed.serialize(), maximum: maximum.serialize() };
}
