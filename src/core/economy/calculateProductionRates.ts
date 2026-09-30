import type {
  BaseGameBalanceConfig,
  MineFloorConfig,
  SharedStageConfig,
} from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import { calculateLevelEffect } from '../progression/calculateLevelEffect';
import type { GameState, MineFloorState } from '../state/GameState';
import {
  EMPTY_CAT_PRODUCTION_MODIFIERS,
  getMiningOutputMultiplier,
  getHaulingMultiplier,
  type CatProductionModifiers,
} from '../cats';
import { calculateSurfaceHaulerWorkforce } from '../simulation/surfaceHaulers';
import { calculateMineFloorWorkforce } from '../simulation/mineFloorWorkers';

const MILLISECONDS_PER_SECOND = 1_000;

export type ProductionBottleneck =
  | 'extraction'
  | 'elevator'
  | 'warehouse';

export interface FloorProductionRate {
  readonly floorId: string;
  readonly floorNumber: number;
  readonly isUnlocked: boolean;
  readonly theoreticalExtractionPerSecond: GameNumber;
}

export interface MineProductionRates {
  readonly floors: readonly FloorProductionRate[];
  readonly aggregateExtractionPerSecond: GameNumber;
  readonly elevatorCapacityPerSecond: GameNumber;
  readonly warehouseCapacityPerSecond: GameNumber;
  readonly surfaceHaulerProductivityMultiplier: number;
  readonly effectiveProductionPerSecond: GameNumber;
  readonly bottleneck: ProductionBottleneck;
}

export function calculateTheoreticalFloorExtractionRate(
  floor: MineFloorState,
  config: MineFloorConfig,
  miningOutputMultiplier = 1,
): GameNumber {
  if (floor.id !== config.id) {
    throw new Error(
      `Floor state ${floor.id} does not match balance configuration ${config.id}.`,
    );
  }

  const outputPerCycle = calculateLevelEffect(
    config.baseYield,
    floor.mineShaftLevel,
    config.upgrade,
  );

  return outputPerCycle.multiply(
    (MILLISECONDS_PER_SECOND / config.cycleDurationMs) * miningOutputMultiplier,
  );
}

export function calculateMineProductionRates(
  state: GameState,
  config: BaseGameBalanceConfig,
  modifiers: CatProductionModifiers = EMPTY_CAT_PRODUCTION_MODIFIERS,
): MineProductionRates {
  const floors = state.floors.map((floor) => {
    const floorConfig = findFloorConfig(config, floor.id);

    return {
      floorId: floor.id,
      floorNumber: floor.floorNumber,
      isUnlocked: floor.isUnlocked,
      theoreticalExtractionPerSecond:
        calculateTheoreticalFloorExtractionRate(
          floor,
          floorConfig,
          getMiningOutputMultiplier(modifiers, floor.id) *
            calculateMineFloorWorkforce(floor.mineShaftLevel)
              .productivityMultiplier,
        ),
    };
  });
  const aggregateExtractionPerSecond = floors.reduce(
    (total, floor) => {
      return floor.isUnlocked
        ? total.add(floor.theoreticalExtractionPerSecond)
        : total;
    },
    GameNumber.from(0),
  );
  const elevatorCapacityPerSecond = calculateStageCapacityPerSecond(
    state.elevator.capacity,
    config.elevator,
    modifiers.elevatorThroughputMultiplier,
  );
  const workforce = calculateSurfaceHaulerWorkforce(state.warehouse.level);
  const surfaceHaulerProductivityMultiplier = workforce.productivityMultiplier *
    getHaulingMultiplier(modifiers, workforce.visibleCount);
  const warehouseCapacityPerSecond = calculateStageCapacityPerSecond(
    state.warehouse.capacity,
    config.warehouse,
    modifiers.warehouseProcessingMultiplier *
      surfaceHaulerProductivityMultiplier,
  );
  const { bottleneck, rate: effectiveProductionPerSecond } = findBottleneck(
    aggregateExtractionPerSecond,
    elevatorCapacityPerSecond,
    warehouseCapacityPerSecond,
  );

  return {
    floors,
    aggregateExtractionPerSecond,
    elevatorCapacityPerSecond,
    warehouseCapacityPerSecond,
    surfaceHaulerProductivityMultiplier,
    effectiveProductionPerSecond,
    bottleneck,
  };
}

function calculateStageCapacityPerSecond(
  capacity: GameNumber,
  config: SharedStageConfig,
  throughputMultiplier = 1,
): GameNumber {
  return capacity.multiply(
    (MILLISECONDS_PER_SECOND / config.cycleDurationMs) * throughputMultiplier,
  );
}

function findBottleneck(
  extraction: GameNumber,
  elevator: GameNumber,
  warehouse: GameNumber,
): { readonly bottleneck: ProductionBottleneck; readonly rate: GameNumber } {
  if (
    extraction.lessThanOrEqualTo(elevator) &&
    extraction.lessThanOrEqualTo(warehouse)
  ) {
    return { bottleneck: 'extraction', rate: extraction };
  }

  if (elevator.lessThanOrEqualTo(warehouse)) {
    return { bottleneck: 'elevator', rate: elevator };
  }

  return { bottleneck: 'warehouse', rate: warehouse };
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
