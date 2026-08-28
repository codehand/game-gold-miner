import {
  BASE_GAME_BALANCE,
  type BaseGameBalanceConfig,
  type MineFloorConfig,
} from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import { purchaseFloorUnlock } from '../progression/unlocks';
import {
  purchaseElevatorUpgrade,
  purchaseMineShaftUpgrade,
  purchaseWarehouseUpgrade,
} from '../progression/upgrades';
import { advanceSimulation, MAX_FOREGROUND_DELTA_MS } from '../simulation/advanceSimulation';
import type { GameState } from '../state/GameState';
import { createInitialGameState } from '../state/createInitialGameState';
import { calculateMineProductionRates } from './calculateProductionRates';

export const ECONOMY_DECISION_INTERVAL_MS = MAX_FOREGROUND_DELTA_MS;
export const DEFAULT_ECONOMY_SIMULATION_DURATION_MS = 10 * 60 * 1_000;

export type EconomyProgressionActionType =
  | 'mine-shaft-upgrade'
  | 'elevator-upgrade'
  | 'warehouse-upgrade'
  | 'floor-unlock';

export interface EconomyProgressionEvent {
  readonly elapsedMs: number;
  readonly type: EconomyProgressionActionType;
  readonly targetId: string;
  readonly cost: GameNumber;
  readonly modeledImprovementPerSecond: GameNumber;
}

export interface EconomyProgressionReport {
  readonly durationMs: number;
  readonly state: GameState;
  readonly events: readonly EconomyProgressionEvent[];
  readonly unlockedFloorCount: number;
  readonly highestStageLevel: number;
  readonly milestoneReached: boolean;
}

export interface EconomyUpgradeChoice {
  readonly type: Exclude<EconomyProgressionActionType, 'floor-unlock'>;
  readonly targetId: string;
  readonly cost: GameNumber;
  readonly state: GameState;
  readonly modeledImprovementPerSecond: GameNumber;
  readonly advancesNextUnlock: boolean;
  readonly order: number;
}

export function simulateEconomyProgression(
  durationMs = DEFAULT_ECONOMY_SIMULATION_DURATION_MS,
  initialTimestampMs = 0,
): EconomyProgressionReport {
  validateDuration(durationMs);

  let state = createInitialGameState(BASE_GAME_BALANCE, initialTimestampMs);
  const events: EconomyProgressionEvent[] = [];
  let elapsedMs = 0;

  while (elapsedMs < durationMs) {
    const elapsedStepMs = Math.min(
      ECONOMY_DECISION_INTERVAL_MS,
      durationMs - elapsedMs,
    );
    state = advanceSimulation(state, elapsedStepMs);
    elapsedMs += elapsedStepMs;

    const unlock = purchaseNextEligibleFloor(state, BASE_GAME_BALANCE);

    if (unlock !== null) {
      state = unlock.state;
      events.push({
        elapsedMs,
        type: 'floor-unlock',
        targetId: unlock.targetId,
        cost: unlock.cost,
        modeledImprovementPerSecond: unlock.modeledImprovementPerSecond,
      });
      continue;
    }

    if (isSavingForNextFloor(state, BASE_GAME_BALANCE)) {
      continue;
    }

    const upgrade = chooseBestAffordableUpgrade(state, BASE_GAME_BALANCE);

    if (upgrade !== null) {
      state = upgrade.state;
      events.push({
        elapsedMs,
        type: upgrade.type,
        targetId: upgrade.targetId,
        cost: upgrade.cost,
        modeledImprovementPerSecond: upgrade.modeledImprovementPerSecond,
      });
    }
  }

  const stageLevels = [
    ...state.floors
      .filter(({ isUnlocked }) => isUnlocked)
      .map(({ mineShaftLevel }) => mineShaftLevel),
    state.elevator.level,
    state.warehouse.level,
  ];
  const highestStageLevel = Math.max(...stageLevels);

  return {
    durationMs,
    state,
    events,
    unlockedFloorCount: state.floors.filter(({ isUnlocked }) => isUnlocked)
      .length,
    highestStageLevel,
    milestoneReached: BASE_GAME_BALANCE.elevator.upgrade.milestones.some(
      ({ level }) => highestStageLevel >= level,
    ),
  };
}

export function chooseBestAffordableUpgrade(
  state: GameState,
  config: BaseGameBalanceConfig,
): EconomyUpgradeChoice | null {
  const currentRate = calculateMineProductionRates(
    state,
    config,
  ).effectiveProductionPerSecond;
  const nextUnlockRequirement = findNextLockedFloorConfig(state, config)
    ?.unlockRequirement;
  const choices: EconomyUpgradeChoice[] = [];

  for (const [index, floor] of state.floors.entries()) {
    if (!floor.isUnlocked) {
      continue;
    }

    const result = purchaseMineShaftUpgrade(state, floor.id, config);

    if (result.success) {
      choices.push({
        type: 'mine-shaft-upgrade',
        targetId: floor.id,
        cost: result.cost,
        state: result.state,
        modeledImprovementPerSecond: calculateRateImprovement(
          currentRate,
          result.state,
          config,
        ),
        advancesNextUnlock:
          nextUnlockRequirement?.floorId === floor.id &&
          floor.mineShaftLevel < nextUnlockRequirement.level,
        order: index,
      });
    }
  }

  const elevatorResult = purchaseElevatorUpgrade(state, config);

  if (elevatorResult.success) {
    choices.push({
      type: 'elevator-upgrade',
      targetId: config.elevator.id,
      cost: elevatorResult.cost,
      state: elevatorResult.state,
      modeledImprovementPerSecond: calculateRateImprovement(
        currentRate,
        elevatorResult.state,
        config,
      ),
      advancesNextUnlock: false,
      order: state.floors.length,
    });
  }

  const warehouseResult = purchaseWarehouseUpgrade(state, config);

  if (warehouseResult.success) {
    choices.push({
      type: 'warehouse-upgrade',
      targetId: config.warehouse.id,
      cost: warehouseResult.cost,
      state: warehouseResult.state,
      modeledImprovementPerSecond: calculateRateImprovement(
        currentRate,
        warehouseResult.state,
        config,
      ),
      advancesNextUnlock: false,
      order: state.floors.length + 1,
    });
  }

  return choices.reduce<EconomyUpgradeChoice | null>((best, choice) => {
    if (best === null) {
      return choice;
    }

    const improvementComparison = choice.modeledImprovementPerSecond.compare(
      best.modeledImprovementPerSecond,
    );

    if (improvementComparison > 0) {
      return choice;
    }

    if (improvementComparison < 0) {
      return best;
    }

    if (choice.advancesNextUnlock !== best.advancesNextUnlock) {
      return choice.advancesNextUnlock ? choice : best;
    }

    return choice.order < best.order ? choice : best;
  }, null);
}

function purchaseNextEligibleFloor(
  state: GameState,
  config: BaseGameBalanceConfig,
): {
  readonly state: GameState;
  readonly targetId: string;
  readonly cost: GameNumber;
  readonly modeledImprovementPerSecond: GameNumber;
} | null {
  const floorConfig = findNextLockedFloorConfig(state, config);

  if (floorConfig === undefined) {
    return null;
  }

  const result = purchaseFloorUnlock(state, floorConfig.id, config);

  if (!result.success) {
    return null;
  }

  return {
    state: result.state,
    targetId: floorConfig.id,
    cost: result.cost,
    modeledImprovementPerSecond: calculateRateImprovement(
      calculateMineProductionRates(state, config).effectiveProductionPerSecond,
      result.state,
      config,
    ),
  };
}

function isSavingForNextFloor(
  state: GameState,
  config: BaseGameBalanceConfig,
): boolean {
  const floorConfig = findNextLockedFloorConfig(state, config);
  const requirement = floorConfig?.unlockRequirement;

  if (requirement === undefined || requirement === null) {
    return false;
  }

  const prerequisiteFloor = state.floors.find(
    ({ id }) => id === requirement.floorId,
  );

  return prerequisiteFloor !== undefined &&
    prerequisiteFloor.isUnlocked &&
    prerequisiteFloor.mineShaftLevel >= requirement.level;
}

function findNextLockedFloorConfig(
  state: GameState,
  config: BaseGameBalanceConfig,
): MineFloorConfig | undefined {
  const lockedFloor = state.floors.find(({ isUnlocked }) => !isUnlocked);

  return lockedFloor === undefined
    ? undefined
    : config.floors.find(({ id }) => id === lockedFloor.id);
}

function calculateRateImprovement(
  currentRate: GameNumber,
  upgradedState: GameState,
  config: BaseGameBalanceConfig,
): GameNumber {
  return calculateMineProductionRates(
    upgradedState,
    config,
  ).effectiveProductionPerSecond.subtract(currentRate);
}

function validateDuration(durationMs: number): void {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    throw new Error(
      'Economy simulation duration must be a non-negative safe integer.',
    );
  }
}
