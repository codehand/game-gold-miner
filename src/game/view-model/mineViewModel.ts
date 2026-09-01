/**
 * Pure presentation snapshot for the mine screen.
 *
 * The scene renders only what this module derives from a read-only
 * `GameState`, so every displayed floor number, level, lock state, progress
 * value, and queue amount is unit-testable in Node without Phaser or a DOM.
 * Nothing here may write to authoritative state.
 *
 * Every amount goes through the shared abbreviated formatter, so the mine and
 * the HUD read alike as magnitudes grow.
 */

import type {
  BaseGameBalanceConfig,
  MineFloorConfig,
  SharedStageConfig,
} from '../../config';
import {
  calculateElevatorUpgradeCost,
  calculateMineShaftUpgradeCost,
  calculateWarehouseUpgradeCost,
  describeElevatorRoute,
  describeFloorUnlock,
  type ElevatorState,
  type FloorUnlockAvailability,
  type GameNumber,
  type GameState,
  type MineFloorState,
  type WarehouseState,
} from '../../core';
import { formatAmount } from './formatAmount';
import { createHudViewModel, type HudViewModel } from './hudViewModel';
import {
  createFloorUnlockControlViewModel,
  createUpgradeControlViewModel,
  formatUnlockRequirement,
  type PurchaseControlViewModel,
} from './purchaseControl';

/** Discrete pile heights, so a growing bottleneck is visible at a glance. */
export const MAX_MATERIAL_PILE_STEPS = 4;

/** Fractions of the measuring capacity that add one more pile step. */
const MATERIAL_PILE_THRESHOLDS = [0.25, 0.5, 0.75] as const;

export type SharedStageId = 'elevator' | 'warehouse';

export interface MineFloorViewModel {
  readonly id: string;
  readonly floorNumber: number;
  /** English heading, e.g. `Floor 2`. */
  readonly floorLabel: string;
  readonly isUnlocked: boolean;
  readonly mineShaftLevel: number;
  /** Always shown, for locked floors too, e.g. `Lv 6`. */
  readonly levelLabel: string;
  /** `Locked` for locked floors, otherwise `null`. */
  readonly statusLabel: string | null;
  /** Normalized extraction progress in `[0, 1)`. */
  readonly extractionProgress: number;
  readonly extractionProgressLabel: string;
  readonly materialQueueLabel: string;
  /** Queue-fullness diagnostic in `[0, MAX_MATERIAL_PILE_STEPS]`. */
  readonly materialPileSteps: number;
  /**
   * A full queue means at least one elevator trip of material is waiting, so
   * this floor's output is held up by transport rather than by extraction.
   */
  readonly isMaterialBackedUp: boolean;
  /** `Backed up` while the pile is full, otherwise `null`. */
  readonly backlogLabel: string | null;
  /** The shaft-upgrade control, or `null` for a locked floor that has none. */
  readonly upgradeControl: PurchaseControlViewModel | null;
  /** The unlock control, or `null` once the floor is open. */
  readonly unlockControl: PurchaseControlViewModel | null;
  /** `Needs Floor 1 Lv 5` while locked, otherwise `null`. */
  readonly unlockRequirementLabel: string | null;
  /**
   * True once the prerequisite shaft has reached its required level, so the
   * requirement can be drawn as satisfied while the price is still out of
   * reach. A floor that is already open reports `true`.
   */
  readonly isUnlockRequirementMet: boolean;
}

export interface SharedStageViewModel {
  readonly id: SharedStageId;
  readonly title: string;
  readonly level: number;
  readonly levelLabel: string;
  readonly capacityLabel: string;
  /** English amount currently held by this stage, e.g. `Carrying 20`. */
  readonly queueLabel: string;
  /** Held amount as discrete blocks, measured against this stage's capacity. */
  readonly queueSteps: number;
  /** True while the stage holds material, which is what its motion signals. */
  readonly isRunning: boolean;
  /** True once a full cycle of input is waiting; the elevator never backs up. */
  readonly isBackedUp: boolean;
  /** `Idle`, `Collecting`, `Returning`, `Converting`, or `Backed up`. */
  readonly statusLabel: string;
  /** Normalized transit or conversion progress in `[0, 1)`. */
  readonly progress: number;
  readonly progressLabel: string;
  readonly elevatorDirection: 'idle' | 'descending' | 'ascending' | null;
  readonly elevatorFloorIndex: number | null;
  /** A shared stage is always upgradeable, so this is never `null`. */
  readonly upgradeControl: PurchaseControlViewModel;
}

export interface MineViewModel {
  readonly hud: HudViewModel;
  readonly floors: readonly MineFloorViewModel[];
  readonly elevator: SharedStageViewModel;
  readonly warehouse: SharedStageViewModel;
}

export interface MineFloorViewModelInput {
  readonly floor: MineFloorState;
  /** This floor's balance data, which its upgrade price is derived from. */
  readonly config: MineFloorConfig;
  /** Measures the floor's pile: what one elevator trip removes. */
  readonly elevatorCapacity: GameNumber;
  /** The spendable balance, which decides whether the control is affordable. */
  readonly gold: GameNumber;
  /**
   * The core's own unlock description for a locked floor, or `null` for an open
   * one. Passed in rather than derived here because it is a fact about the
   * whole mine — it reads the prerequisite floor's level — while everything
   * else on this input is a fact about this floor alone.
   */
  readonly unlock: FloorUnlockAvailability | null;
}

export interface SharedStageViewModelInput<TStage> {
  readonly stage: TStage;
  readonly config: SharedStageConfig;
  readonly gold: GameNumber;
}

export interface ElevatorViewModelInput
  extends SharedStageViewModelInput<ElevatorState> {
  readonly floors: readonly MineFloorState[];
}

/**
 * Balance data is required because the HUD's income estimate is derived from
 * the same production rates the core calculates, never from observed frames,
 * and because every upgrade control prices itself through the same core
 * function the purchase command charges.
 */
export function createMineViewModel(
  state: GameState,
  balance: BaseGameBalanceConfig,
): MineViewModel {
  return {
    hud: createHudViewModel(state, balance),
    floors: state.floors.map((floor, index) => {
      return createMineFloorViewModel({
        floor,
        config: balance.floors[index],
        elevatorCapacity: state.elevator.capacity,
        gold: state.gold,
        unlock: describeFloorUnlock(state, floor.id, balance),
      });
    }),
    elevator: createElevatorViewModel({
      stage: state.elevator,
      floors: state.floors,
      config: balance.elevator,
      gold: state.gold,
    }),
    warehouse: createWarehouseViewModel({
      stage: state.warehouse,
      config: balance.warehouse,
      gold: state.gold,
    }),
  };
}

export function createMineFloorViewModel({
  floor,
  config,
  elevatorCapacity,
  gold,
  unlock,
}: MineFloorViewModelInput): MineFloorViewModel {
  assertNormalizedProgress(floor.extractionProgress, `floor ${floor.id} extraction`);
  assertDisplayableLevel(floor.mineShaftLevel, `floor ${floor.id}`);
  assertUnlockMatchesLockState(floor, unlock);

  const pileSteps = calculateMaterialPileSteps(
    floor.materialQueue,
    elevatorCapacity,
  );
  const backedUp = pileSteps >= MAX_MATERIAL_PILE_STEPS;

  return {
    id: floor.id,
    floorNumber: floor.floorNumber,
    floorLabel: `Floor ${floor.floorNumber}`,
    isUnlocked: floor.isUnlocked,
    mineShaftLevel: floor.mineShaftLevel,
    levelLabel: formatLevel(floor.mineShaftLevel),
    statusLabel: floor.isUnlocked ? null : 'Locked',
    extractionProgress: floor.extractionProgress,
    extractionProgressLabel: formatProgress(floor.extractionProgress),
    materialQueueLabel: formatAmount(floor.materialQueue),
    materialPileSteps: pileSteps,
    isMaterialBackedUp: backedUp,
    backlogLabel: backedUp ? 'Backed up' : null,
    // A locked floor has no shaft to upgrade, and an open one has nothing left
    // to unlock: a floor always offers exactly one of the two purchases.
    upgradeControl:
      unlock === null
        ? createUpgradeControlViewModel(
            { type: 'mine-shaft', floorId: floor.id },
            calculateMineShaftUpgradeCost(floor, config),
            gold,
          )
        : null,
    unlockControl:
      unlock === null ? null : createFloorUnlockControlViewModel(unlock),
    unlockRequirementLabel:
      unlock === null ? null : formatUnlockRequirement(unlock),
    isUnlockRequirementMet: unlock === null ? true : unlock.isRequirementMet,
  };
}

export function createElevatorViewModel({
  stage: elevator,
  floors,
  config,
  gold,
}: ElevatorViewModelInput): SharedStageViewModel {
  assertNormalizedProgress(elevator.transitProgress, 'elevator transit');
  assertDisplayableLevel(elevator.level, 'elevator');

  // A full car is a full trip, not a backlog: the elevator's own queue never
  // grows past one load. Transport pressure shows up as full floor piles.
  const route = describeElevatorRoute(elevator, floors);
  const isRunning = route.direction !== 'idle';

  return {
    id: 'elevator',
    title: 'Elevator',
    level: elevator.level,
    levelLabel: formatLevel(elevator.level),
    capacityLabel: `Cap ${formatAmount(elevator.capacity)}`,
    queueLabel: `Carrying ${formatAmount(elevator.carriedMaterial)}`,
    queueSteps: calculateMaterialPileSteps(
      elevator.carriedMaterial,
      elevator.capacity,
    ),
    isRunning,
    isBackedUp: false,
    statusLabel:
      route.direction === 'descending'
        ? 'Collecting'
        : route.direction === 'ascending'
          ? 'Returning'
          : 'Idle',
    progress: elevator.transitProgress,
    progressLabel: formatProgress(elevator.transitProgress),
    elevatorDirection: route.direction,
    elevatorFloorIndex: route.floorIndex,
    upgradeControl: createUpgradeControlViewModel(
      { type: 'elevator' },
      calculateElevatorUpgradeCost(elevator, config),
      gold,
    ),
  };
}

export function createWarehouseViewModel({
  stage: warehouse,
  config,
  gold,
}: SharedStageViewModelInput<WarehouseState>): SharedStageViewModel {
  assertNormalizedProgress(warehouse.conversionProgress, 'warehouse conversion');
  assertDisplayableLevel(warehouse.level, 'warehouse');

  const queueSteps = calculateMaterialPileSteps(
    warehouse.inputQueue,
    warehouse.capacity,
  );
  const isRunning = warehouse.inputQueue.greaterThan(0);
  const isBackedUp = queueSteps >= MAX_MATERIAL_PILE_STEPS;

  return {
    id: 'warehouse',
    title: 'Warehouse',
    level: warehouse.level,
    levelLabel: formatLevel(warehouse.level),
    capacityLabel: `Cap ${formatAmount(warehouse.capacity)}`,
    queueLabel: `Queued ${formatAmount(warehouse.inputQueue)}`,
    queueSteps,
    isRunning,
    isBackedUp,
    statusLabel: describeWarehouseStatus(isRunning, isBackedUp),
    progress: warehouse.conversionProgress,
    progressLabel: formatProgress(warehouse.conversionProgress),
    elevatorDirection: null,
    elevatorFloorIndex: null,
    upgradeControl: createUpgradeControlViewModel(
      { type: 'warehouse' },
      calculateWarehouseUpgradeCost(warehouse, config),
      gold,
    ),
  };
}

/**
 * Discrete queue-fullness steps measured against the capacity of the stage
 * that removes material in one cycle. A full value means a whole cycle is
 * already waiting: floor queues measure against the shared elevator and the
 * warehouse input queue measures against the warehouse. Views may expose this
 * through cart/queue state without resizing fixed environmental decoration.
 */
export function calculateMaterialPileSteps(
  materialQueue: GameNumber,
  removalCapacity: GameNumber,
): number {
  if (!materialQueue.greaterThan(0)) {
    return 0;
  }

  if (!removalCapacity.greaterThan(0)) {
    return MAX_MATERIAL_PILE_STEPS;
  }

  const passed = MATERIAL_PILE_THRESHOLDS.filter((threshold) => {
    return materialQueue.greaterThanOrEqualTo(removalCapacity.multiply(threshold));
  }).length;

  return Math.min(1 + passed, MAX_MATERIAL_PILE_STEPS);
}

function describeWarehouseStatus(isRunning: boolean, isBackedUp: boolean): string {
  if (!isRunning) {
    return 'Idle';
  }

  return isBackedUp ? 'Backed up' : 'Converting';
}

export function formatLevel(level: number): string {
  return `Lv ${level}`;
}

export function formatProgress(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}

/**
 * Guards the one structural assumption the scene cannot recover from: it builds
 * a fixed number of floor views up front, so a snapshot describing a different
 * number of floors would leave views bound to nothing. Silently skipping them
 * would render stale or blank floors that look like real ones.
 */
export function assertRenderableMineViewModel(
  viewModel: MineViewModel,
  expectedFloorCount: number,
): void {
  if (viewModel.floors.length !== expectedFloorCount) {
    throw new Error(
      `The mine screen renders exactly ${expectedFloorCount} floors, but the snapshot describes ${viewModel.floors.length}.`,
    );
  }

  for (const floor of viewModel.floors) {
    // The two controls share one slot on the panel, so a floor offering both
    // would stack a live unlock button on a live upgrade button, and a floor
    // offering neither would leave a purchasable stage with no way to buy it.
    if ((floor.upgradeControl === null) === (floor.unlockControl === null)) {
      throw new Error(
        `Floor ${floor.id} must offer exactly one of an upgrade control and an unlock control.`,
      );
    }
  }
}

/**
 * A locked floor without an unlock description, or an open one carrying a
 * stale description, would render a button that buys the wrong thing. Both are
 * caller bugs rather than states the mine can reach.
 */
function assertUnlockMatchesLockState(
  floor: MineFloorState,
  unlock: FloorUnlockAvailability | null,
): void {
  if (floor.isUnlocked === (unlock === null)) {
    return;
  }

  throw new Error(
    floor.isUnlocked
      ? `Open floor ${floor.id} was given an unlock description.`
      : `Locked floor ${floor.id} was given no unlock description.`,
  );
}

function assertNormalizedProgress(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`Displayed ${name} progress must be in [0, 1).`);
  }
}

function assertDisplayableLevel(level: number, name: string): void {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new Error(`Displayed ${name} level must be a positive safe integer.`);
  }
}
