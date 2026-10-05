export {
  activateBoost,
  boostAvailableAtMs,
  boostEndsAtMs,
  boostOverlapMs,
  EMPTY_BOOST_STATE,
  isBoostActive,
  validateBoostState,
  BOOST_COOLDOWN_MS,
  BOOST_DURATION_MS,
  BOOST_MULTIPLIER,
  type BoostActivationResult,
  type BoostState,
} from './boost/boost';
export {
  calculateMineProductionRates,
  calculateTheoreticalFloorExtractionRate,
  type FloorProductionRate,
  type MineProductionRates,
  type ProductionBottleneck,
} from './economy/calculateProductionRates';
export {
  activeGameState,
  advanceActiveMine,
  createInitialPortfolio,
  enterMine,
  enterMineWithPendingClaim,
  previewMineOfflineGrant,
  purchaseMine,
  replaceActiveGameState,
  settlePendingMineClaim,
  suspendActiveMine,
  type MineEnterResult,
  type MineOfflineInterval,
  type MinePendingClaim,
  type MineProgressState,
  type MinePurchaseResult,
  type OwnedMine,
  type PortfolioState,
} from './portfolio/portfolio';
export {
  migratePortfolioCatRoster,
  parseMineCatSlot,
  projectCatRosterToMine,
  qualifyMineCatSlot,
  type MineCatSlotKey,
} from './portfolio/portfolioCatRoster';
export {
  CAT_CALCULATION_VERSION,
  assignCatToSlot,
  calculateCatRoleEffect,
  calculateRoleScore,
  compareCatForSlot,
  createEmptyCatRoster,
  getAssignableCats,
  getCatForSlot,
  getRoleForSlot,
  isCatAssignable,
  validateCatRoster,
  type CatAssignment,
  type CatAssignmentFailureReason,
  type CatAssignmentResult,
  type CatAttributes,
  type CatAvailabilityState,
  type CatBenefitMetric,
  type CatComparison,
  type CatInstance,
  type CatRarityTier,
  type CatRole,
  type CatRoleEffect,
  type CatRosterState,
  type CatSlotKey,
  type BareCatSlotKey,
} from './cats';
export {
  createCatProductionModifiers,
  EMPTY_CAT_PRODUCTION_MODIFIERS,
  getMiningOutputMultiplier,
  type CatProductionModifiers,
} from './cats';
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
  LIFETIME_GOLD_BOARD_KEY,
  calculateLifetimeGoldEarned,
  calculatePortfolioLifetimeGoldEarned,
  toLeaderboardMagnitude,
  type LeaderboardMagnitude,
} from './leaderboard/leaderboardMetric';
export {
  PROGRESS_BOUND_TOLERANCE,
  evaluateProgressBound,
  type ProgressBoundInput,
  type ProgressBoundViolation,
} from './anti-cheat/progressBound';
export {
  evaluatePortfolioRoutineBound,
  type PortfolioRoutineBoundInput,
} from './anti-cheat/portfolioProgressBound';
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
  calculateMineFloorWorkforce,
  calculateMineFloorWorkerCount,
  MINE_FLOOR_WORKER_LEVEL_INTERVAL,
  MINE_FLOOR_WORKER_MAX_COUNT,
  MINE_FLOOR_WORKER_MAX_LEVEL,
  type MineFloorWorkforce,
} from './simulation/mineFloorWorkers';
export {
  calculateSurfaceHaulerWorkforce,
  SURFACE_HAULER_LEVEL_INTERVAL,
  SURFACE_HAULER_MAX_VISIBLE_COUNT,
  SURFACE_HAULER_MAX_WAREHOUSE_LEVEL,
  type SurfaceHaulerWorkforce,
} from './simulation/surfaceHaulers';
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
