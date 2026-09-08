import type { MineFloorConfig } from '../../config';
import {
  calculateLevelEffect,
  calculateMaxAffordableMineShaftUpgradeQuantity,
  calculateMineShaftUpgradeBatchCost,
  type GameNumber,
  type MineFloorState,
} from '../../core';
import { formatAmount } from './formatAmount';

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
  readonly floorId: string;
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
    floorId: floor.id,
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
