import type {
  BaseGameBalanceConfig,
  MineFloorConfig,
  SharedStageConfig,
  UpgradeConfig,
} from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import type {
  ElevatorState,
  GameState,
  MineFloorState,
  WarehouseState,
} from '../state/GameState';
import { calculateLevelEffect } from './calculateLevelEffect';

export type UpgradePurchaseFailureReason =
  | 'insufficient-funds'
  | 'floor-not-found'
  | 'floor-locked';

export type UpgradePurchaseResult =
  | {
      readonly success: true;
      readonly state: GameState;
      readonly cost: GameNumber;
    }
  | {
      readonly success: false;
      readonly state: GameState;
      readonly cost: GameNumber | null;
      readonly reason: UpgradePurchaseFailureReason;
    };

export function calculateMineShaftUpgradeCost(
  floor: MineFloorState,
  config: MineFloorConfig,
): GameNumber {
  if (floor.id !== config.id) {
    throw new Error(
      `Floor state ${floor.id} does not match balance configuration ${config.id}.`,
    );
  }

  return calculateNextUpgradeCost(floor.mineShaftLevel, config.upgrade);
}

export function calculateMineShaftUpgradeBatchCost(
  floor: MineFloorState,
  config: MineFloorConfig,
  quantity: number,
): GameNumber {
  if (floor.id !== config.id) {
    throw new Error(
      `Floor state ${floor.id} does not match balance configuration ${config.id}.`,
    );
  }

  validateUpgradeQuantity(floor.mineShaftLevel, quantity);

  const firstCost = calculateNextUpgradeCost(
    floor.mineShaftLevel,
    config.upgrade,
  );

  if (quantity === 1) {
    return firstCost;
  }

  const growth = config.upgrade.costGrowthRate;

  if (growth === 1) {
    return firstCost.multiply(quantity);
  }

  return firstCost
    .multiply(integerPower(growth, quantity).subtract(1))
    .divide(growth - 1);
}

export function calculateMaxAffordableMineShaftUpgradeQuantity(
  floor: MineFloorState,
  config: MineFloorConfig,
  gold: GameNumber,
): number {
  const maximum = Number.MAX_SAFE_INTEGER - floor.mineShaftLevel;

  if (
    maximum < 1 ||
    gold.lessThan(calculateMineShaftUpgradeCost(floor, config))
  ) {
    return 0;
  }

  let affordable = 1;
  let unaffordable = Math.min(2, maximum);

  while (
    unaffordable < maximum &&
    gold.greaterThanOrEqualTo(
      calculateMineShaftUpgradeBatchCost(floor, config, unaffordable),
    )
  ) {
    affordable = unaffordable;
    unaffordable = Math.min(unaffordable * 2, maximum);
  }

  if (
    unaffordable === maximum &&
    gold.greaterThanOrEqualTo(
      calculateMineShaftUpgradeBatchCost(floor, config, maximum),
    )
  ) {
    return maximum;
  }

  while (unaffordable - affordable > 1) {
    const candidate = affordable + Math.floor((unaffordable - affordable) / 2);

    if (
      gold.greaterThanOrEqualTo(
        calculateMineShaftUpgradeBatchCost(floor, config, candidate),
      )
    ) {
      affordable = candidate;
    } else {
      unaffordable = candidate;
    }
  }

  return affordable;
}

export function calculateElevatorUpgradeCost(
  elevator: ElevatorState,
  config: SharedStageConfig,
): GameNumber {
  assertSharedStageConfig(config, 'elevator');

  return calculateNextUpgradeCost(elevator.level, config.upgrade);
}

export function calculateWarehouseUpgradeCost(
  warehouse: WarehouseState,
  config: SharedStageConfig,
): GameNumber {
  assertSharedStageConfig(config, 'warehouse');

  return calculateNextUpgradeCost(warehouse.level, config.upgrade);
}

export function purchaseMineShaftUpgrade(
  state: GameState,
  floorId: string,
  config: BaseGameBalanceConfig,
): UpgradePurchaseResult {
  return purchaseMineShaftUpgrades(state, floorId, 1, config);
}

export function purchaseMineShaftUpgrades(
  state: GameState,
  floorId: string,
  quantity: number,
  config: BaseGameBalanceConfig,
): UpgradePurchaseResult {
  const floorIndex = state.floors.findIndex(({ id }) => id === floorId);

  if (floorIndex === -1) {
    return failure(state, null, 'floor-not-found');
  }

  const floor = state.floors[floorIndex];
  const floorConfig = findFloorConfig(config, floorId);
  const cost = calculateMineShaftUpgradeBatchCost(floor, floorConfig, quantity);

  if (!floor.isUnlocked) {
    return failure(state, cost, 'floor-locked');
  }

  if (state.gold.lessThan(cost)) {
    return failure(state, cost, 'insufficient-funds');
  }

  return success(
    {
      ...state,
      gold: state.gold.subtract(cost),
      floors: state.floors.map((currentFloor, index) => {
        return index === floorIndex
          ? {
              ...currentFloor,
              mineShaftLevel: currentFloor.mineShaftLevel + quantity,
            }
          : currentFloor;
      }),
    },
    cost,
  );
}

function validateUpgradeQuantity(currentLevel: number, quantity: number): void {
  validateUpgradeableLevel(currentLevel);

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > Number.MAX_SAFE_INTEGER - currentLevel
  ) {
    throw new Error(
      'Upgrade quantity must be a positive safe integer that leaves a safe level.',
    );
  }
}

export function purchaseElevatorUpgrade(
  state: GameState,
  config: BaseGameBalanceConfig,
): UpgradePurchaseResult {
  const cost = calculateElevatorUpgradeCost(
    state.elevator,
    config.elevator,
  );

  if (state.gold.lessThan(cost)) {
    return failure(state, cost, 'insufficient-funds');
  }

  const nextLevel = state.elevator.level + 1;

  return success(
    {
      ...state,
      gold: state.gold.subtract(cost),
      elevator: {
        ...state.elevator,
        level: nextLevel,
        capacity: calculateSharedStageCapacity(nextLevel, config.elevator),
      },
    },
    cost,
  );
}

export function purchaseWarehouseUpgrade(
  state: GameState,
  config: BaseGameBalanceConfig,
): UpgradePurchaseResult {
  const cost = calculateWarehouseUpgradeCost(
    state.warehouse,
    config.warehouse,
  );

  if (state.gold.lessThan(cost)) {
    return failure(state, cost, 'insufficient-funds');
  }

  const nextLevel = state.warehouse.level + 1;

  return success(
    {
      ...state,
      gold: state.gold.subtract(cost),
      warehouse: {
        ...state.warehouse,
        level: nextLevel,
        capacity: calculateSharedStageCapacity(nextLevel, config.warehouse),
      },
    },
    cost,
  );
}

function calculateNextUpgradeCost(
  currentLevel: number,
  config: UpgradeConfig,
): GameNumber {
  validateUpgradeableLevel(currentLevel);

  return GameNumber.from(config.baseCost).multiply(
    integerPower(config.costGrowthRate, currentLevel),
  );
}

function calculateSharedStageCapacity(
  level: number,
  config: SharedStageConfig,
): GameNumber {
  return calculateLevelEffect(config.baseCapacity, level, config.upgrade);
}

function integerPower(base: number, exponent: number): GameNumber {
  let result = GameNumber.from(1);
  let factor = GameNumber.from(base);
  let remainingExponent = exponent;

  while (remainingExponent > 0) {
    if (remainingExponent % 2 === 1) {
      result = result.multiply(factor);
    }

    remainingExponent = Math.floor(remainingExponent / 2);

    if (remainingExponent > 0) {
      factor = factor.multiply(factor);
    }
  }

  return result;
}

function validateUpgradeableLevel(level: number): void {
  if (
    !Number.isSafeInteger(level) ||
    level < 1 ||
    level >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      'Upgrade level must be a positive safe integer with room to increment.',
    );
  }
}

function assertSharedStageConfig(
  config: SharedStageConfig,
  expectedId: SharedStageConfig['id'],
): void {
  if (config.id !== expectedId) {
    throw new Error(
      `Expected ${expectedId} balance configuration, received ${config.id}.`,
    );
  }
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

function success(state: GameState, cost: GameNumber): UpgradePurchaseResult {
  return { success: true, state, cost };
}

function failure(
  state: GameState,
  cost: GameNumber | null,
  reason: UpgradePurchaseFailureReason,
): UpgradePurchaseResult {
  return { success: false, state, cost, reason };
}
