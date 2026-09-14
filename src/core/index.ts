export {
  calculateMineProductionRates,
  calculateTheoreticalFloorExtractionRate,
  type FloorProductionRate,
  type MineProductionRates,
  type ProductionBottleneck,
} from './economy/calculateProductionRates';
export {
  DEFAULT_ECONOMY_SIMULATION_DURATION_MS,
  ECONOMY_DECISION_INTERVAL_MS,
  chooseBestAffordableUpgrade,
  simulateEconomyProgression,
  type EconomyProgressionActionType,
  type EconomyProgressionEvent,
  type EconomyProgressionReport,
  type EconomyUpgradeChoice,
} from './economy/simulateEconomyProgression';
export {
  GameNumber,
  type GameNumberSource,
  type SerializedGameNumber,
} from './numbers/GameNumber';
export {
  calculateOfflineGrant,
  type OfflineGrant,
} from './offline-income/calculateOfflineGrant';
export {
  calculateOfflineIncome,
  type OfflineIncomeCalculation,
} from './offline-income/calculateOfflineIncome';
export {
  claimOfflineReward,
  createPendingOfflineReward,
  type OfflineRewardClaimResult,
  type PendingOfflineReward,
} from './offline-income/claimOfflineIncome';
export {
  calculateLevelEffect,
  calculateMilestoneMultiplier,
} from './progression/calculateLevelEffect';
export {
  calculateElevatorUpgradeCost,
  calculateElevatorUpgradeBatchCost,
  calculateMaxAffordableElevatorUpgradeQuantity,
  calculateMaxAffordableMineShaftUpgradeQuantity,
  calculateMaxAffordableWarehouseUpgradeQuantity,
  calculateMineShaftUpgradeBatchCost,
  calculateMineShaftUpgradeCost,
  calculateWarehouseUpgradeCost,
  calculateWarehouseUpgradeBatchCost,
  purchaseElevatorUpgrade,
  purchaseElevatorUpgrades,
  purchaseMineShaftUpgrade,
  purchaseMineShaftUpgrades,
  purchaseWarehouseUpgrade,
  purchaseWarehouseUpgrades,
  type UpgradePurchaseFailureReason,
  type UpgradePurchaseResult,
} from './progression/upgrades';
export {
  describeFloorUnlock,
  purchaseFloorUnlock,
  type FloorUnlockAvailability,
  type FloorUnlockFailureReason,
  type FloorUnlockRequirement,
  type FloorUnlockResult,
} from './progression/unlocks';
export {
  advanceSimulation,
  MAX_FOREGROUND_DELTA_MS,
  SIMULATION_STEP_MS,
} from './simulation/advanceSimulation';
export {
  advanceElevator,
  calculateElevatorLegDurationMs,
  describeElevatorRoute,
  FULL_ELEVATOR_LOAD_SLOWDOWN,
  type ElevatorRoute,
  type ElevatorRouteDirection,
} from './simulation/advanceElevator';
export {
  catchUpSimulation,
  MAX_CATCH_UP_MS,
} from './simulation/catchUpSimulation';
export {
  createMineFloorState,
  createInitialGameState,
  INITIAL_SAVE_VERSION,
} from './state/createInitialGameState';
export type {
  ElevatorState,
  GameState,
  MineFloorState,
  WarehouseState,
} from './state/GameState';
