import type { MineFloorConfig, SharedStageConfig } from '../../config';
import {
  calculateElevatorUpgradeBatchCost,
  calculateLevelEffect,
  calculateMaxAffordableElevatorUpgradeQuantity,
  calculateMaxAffordableMineShaftUpgradeQuantity,
  calculateMaxAffordableWarehouseUpgradeQuantity,
  calculateMineShaftUpgradeBatchCost,
  calculateWarehouseUpgradeBatchCost,
  type ElevatorState,
  type GameNumber,
  type MineFloorState,
  type WarehouseState,
} from '../../core';
import { formatAmount } from './formatAmount';
import type { PurchaseTarget } from './purchaseControl';

export type UpgradeTarget = Exclude<PurchaseTarget, { type: 'floor-unlock' }>;

export type MineShaftUpgradeOptionId = 'x1' | 'x5' | 'max';

export interface MineShaftUpgradeOptionViewModel {
  readonly id: MineShaftUpgradeOptionId;
  readonly label: string;
  readonly quantity: number;
  readonly costLabel: string;
  readonly isEnabled: boolean;
}

export interface MineShaftUpgradeAttributeViewModel {
  readonly label: string;
  readonly value: string;
}

export interface MineShaftUpgradeModalViewModel {
  readonly target: UpgradeTarget;
  readonly title: string;
  readonly levelLabel: string;
  readonly attributes: readonly MineShaftUpgradeAttributeViewModel[];
  readonly options: readonly MineShaftUpgradeOptionViewModel[];
}

export interface MineShaftUpgradeModalInput {
  readonly floor: MineFloorState;
  readonly config: MineFloorConfig;
  readonly gold: GameNumber;
}

export function createMineShaftUpgradeModalViewModel({
  floor,
  config,
  gold,
}: MineShaftUpgradeModalInput): MineShaftUpgradeModalViewModel {
  const currentOutput = calculateLevelEffect(
    config.baseYield,
    floor.mineShaftLevel,
    config.upgrade,
  );
  const nextOutput = calculateLevelEffect(
    config.baseYield,
    floor.mineShaftLevel + 1,
    config.upgrade,
  );
  const maxQuantity = calculateMaxAffordableMineShaftUpgradeQuantity(
    floor,
    config,
    gold,
  );

  return {
    target: { type: 'mine-shaft', floorId: floor.id },
    title: `Floor ${floor.floorNumber}`,
    levelLabel: `Level ${floor.mineShaftLevel}`,
    attributes: [
      { label: 'Output / cycle', value: formatAmount(currentOutput) },
      { label: 'Cycle time', value: formatDuration(config.cycleDurationMs) },
      { label: 'Gold waiting', value: formatAmount(floor.materialQueue) },
      { label: 'Next output', value: formatAmount(nextOutput) },
    ],
    options: [
      createOption('x1', 'x1', 1, floor, config, gold),
      createOption('x5', 'x5', 5, floor, config, gold),
      maxQuantity > 0
        ? createOption(
            'max',
            `MAX x${maxQuantity}`,
            maxQuantity,
            floor,
            config,
            gold,
          )
        : {
            id: 'max',
            label: 'MAX x0',
            quantity: 0,
            costLabel: '—',
            isEnabled: false,
          },
    ],
  };
}

export interface SharedStageUpgradeModalInput<TStage> {
  readonly stage: TStage;
  readonly config: SharedStageConfig;
  readonly gold: GameNumber;
}

export function createElevatorUpgradeModalViewModel({
  stage: elevator,
  config,
  gold,
}: SharedStageUpgradeModalInput<ElevatorState>): MineShaftUpgradeModalViewModel {
  const maxQuantity = calculateMaxAffordableElevatorUpgradeQuantity(
    elevator,
    config,
    gold,
  );

  return {
    target: { type: 'elevator' },
    title: 'Elevator Tower',
    levelLabel: `Level ${elevator.level}`,
    attributes: [
      { label: 'Capacity', value: formatAmount(elevator.capacity) },
      { label: 'Cycle time', value: formatDuration(config.cycleDurationMs) },
      { label: 'Carrying', value: formatAmount(elevator.carriedMaterial) },
      {
        label: 'Next capacity',
        value: formatAmount(
          calculateLevelEffect(
            config.baseCapacity,
            elevator.level + 1,
            config.upgrade,
          ),
        ),
      },
    ],
    options: createSharedStageOptions(
      maxQuantity,
      gold,
      (quantity) => calculateElevatorUpgradeBatchCost(elevator, config, quantity),
    ),
  };
}

export function createWarehouseUpgradeModalViewModel({
  stage: warehouse,
  config,
  gold,
}: SharedStageUpgradeModalInput<WarehouseState>): MineShaftUpgradeModalViewModel {
  const maxQuantity = calculateMaxAffordableWarehouseUpgradeQuantity(
    warehouse,
    config,
    gold,
  );

  return {
    target: { type: 'warehouse' },
    title: 'Warehouse',
    levelLabel: `Level ${warehouse.level}`,
    attributes: [
      { label: 'Capacity / cycle', value: formatAmount(warehouse.capacity) },
      { label: 'Cycle time', value: formatDuration(config.cycleDurationMs) },
      { label: 'Gold queued', value: formatAmount(warehouse.inputQueue) },
      {
        label: 'Next capacity',
        value: formatAmount(
          calculateLevelEffect(
            config.baseCapacity,
            warehouse.level + 1,
            config.upgrade,
          ),
        ),
      },
    ],
    options: createSharedStageOptions(
      maxQuantity,
      gold,
      (quantity) => calculateWarehouseUpgradeBatchCost(warehouse, config, quantity),
    ),
  };
}

function createSharedStageOptions(
  maxQuantity: number,
  gold: GameNumber,
  calculateCost: (quantity: number) => GameNumber,
): readonly MineShaftUpgradeOptionViewModel[] {
  return [
    createGenericOption('x1', 'x1', 1, gold, calculateCost),
    createGenericOption('x5', 'x5', 5, gold, calculateCost),
    maxQuantity > 0
      ? createGenericOption(
          'max',
          `MAX x${maxQuantity}`,
          maxQuantity,
          gold,
          calculateCost,
        )
      : {
          id: 'max',
          label: 'MAX x0',
          quantity: 0,
          costLabel: '—',
          isEnabled: false,
        },
  ];
}

function createGenericOption(
  id: MineShaftUpgradeOptionId,
  label: string,
  quantity: number,
  gold: GameNumber,
  calculateCost: (quantity: number) => GameNumber,
): MineShaftUpgradeOptionViewModel {
  const cost = calculateCost(quantity);

  return {
    id,
    label,
    quantity,
    costLabel: formatAmount(cost),
    isEnabled: gold.greaterThanOrEqualTo(cost),
  };
}

function createOption(
  id: MineShaftUpgradeOptionId,
  label: string,
  quantity: number,
  floor: MineFloorState,
  config: MineFloorConfig,
  gold: GameNumber,
): MineShaftUpgradeOptionViewModel {
  const cost = calculateMineShaftUpgradeBatchCost(floor, config, quantity);

  return {
    id,
    label,
    quantity,
    costLabel: formatAmount(cost),
    isEnabled: gold.greaterThanOrEqualTo(cost),
  };
}

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1_000;

  return `${Number.isInteger(seconds) ? seconds.toFixed(1) : seconds}s`;
}
