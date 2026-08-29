/**
 * Pure presentation snapshot for the mine screen.
 *
 * The scene renders only what this module derives from a read-only
 * `GameState`, so every displayed floor number, level, lock state, progress
 * value, and queue amount is unit-testable in Node without Phaser or a DOM.
 * Nothing here may write to authoritative state.
 *
 * Number presentation is deliberately minimal: Step 28 introduces the shared
 * abbreviated K/M/B/T formatter and this module then adopts it.
 */

import type {
  ElevatorState,
  GameNumber,
  GameState,
  MineFloorState,
  WarehouseState,
} from '../../core';

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
  /** Pile height in `[0, MAX_MATERIAL_PILE_STEPS]`. */
  readonly materialPileSteps: number;
  /**
   * A full pile means at least one elevator trip of material is waiting, so
   * this floor's output is held up by transport rather than by extraction.
   */
  readonly isMaterialBackedUp: boolean;
  /** `Backed up` while the pile is full, otherwise `null`. */
  readonly backlogLabel: string | null;
  /** Step 29 turns this into an affordable/unaffordable interactive control. */
  readonly showsUpgradeControl: boolean;
  readonly upgradeControlLabel: string;
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
  /** `Idle`, `In transit`, `Converting`, or `Backed up`. */
  readonly statusLabel: string;
  /** Normalized transit or conversion progress in `[0, 1)`. */
  readonly progress: number;
  readonly progressLabel: string;
  readonly upgradeControlLabel: string;
}

export interface MineViewModel {
  readonly floors: readonly MineFloorViewModel[];
  readonly elevator: SharedStageViewModel;
  readonly warehouse: SharedStageViewModel;
}

export function createMineViewModel(state: GameState): MineViewModel {
  return {
    floors: state.floors.map((floor) => {
      return createMineFloorViewModel(floor, state.elevator.capacity);
    }),
    elevator: createElevatorViewModel(state.elevator),
    warehouse: createWarehouseViewModel(state.warehouse),
  };
}

export function createMineFloorViewModel(
  floor: MineFloorState,
  elevatorCapacity: GameNumber,
): MineFloorViewModel {
  assertNormalizedProgress(floor.extractionProgress, `floor ${floor.id} extraction`);
  assertDisplayableLevel(floor.mineShaftLevel, `floor ${floor.id}`);

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
    showsUpgradeControl: floor.isUnlocked,
    upgradeControlLabel: 'Upgrade',
  };
}

export function createElevatorViewModel(
  elevator: ElevatorState,
): SharedStageViewModel {
  assertNormalizedProgress(elevator.transitProgress, 'elevator transit');
  assertDisplayableLevel(elevator.level, 'elevator');

  // A full car is a full trip, not a backlog: the elevator's own queue never
  // grows past one load. Transport pressure shows up as full floor piles.
  const isRunning = elevator.carriedMaterial.greaterThan(0);

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
    statusLabel: isRunning ? 'In transit' : 'Idle',
    progress: elevator.transitProgress,
    progressLabel: formatProgress(elevator.transitProgress),
    upgradeControlLabel: 'Upgrade',
  };
}

export function createWarehouseViewModel(
  warehouse: WarehouseState,
): SharedStageViewModel {
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
    upgradeControlLabel: 'Upgrade',
  };
}

/**
 * Discrete height of one waiting pile, measured against the capacity of the
 * stage that removes it in a single cycle. A full pile therefore means a whole
 * cycle of material is already waiting, which is the visible bottleneck signal:
 * floor piles measure against the shared elevator, and the warehouse input
 * queue measures against the warehouse.
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
 * Provisional amount display. Values beyond ordinary magnitudes keep their
 * serialized scientific form until Step 28 introduces abbreviated suffixes.
 */
export function formatAmount(value: GameNumber): string {
  const serialized = value.serialize();
  const numeric = Number(serialized);

  if (!Number.isFinite(numeric) || Math.abs(numeric) >= 1e6) {
    return serialized;
  }

  const rounded = Math.round(numeric * 10) / 10;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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
