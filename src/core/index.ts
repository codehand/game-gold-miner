export {
  calculateMineProductionRates,
  calculateTheoreticalFloorExtractionRate,
  type FloorProductionRate,
  type MineProductionRates,
  type ProductionBottleneck,
} from './economy/calculateProductionRates';
export {
  GameNumber,
  type GameNumberSource,
  type SerializedGameNumber,
} from './numbers/GameNumber';
export {
  calculateLevelEffect,
  calculateMilestoneMultiplier,
} from './progression/calculateLevelEffect';
export {
  calculateElevatorUpgradeCost,
  calculateMineShaftUpgradeCost,
  calculateWarehouseUpgradeCost,
  purchaseElevatorUpgrade,
  purchaseMineShaftUpgrade,
  purchaseWarehouseUpgrade,
  type UpgradePurchaseFailureReason,
  type UpgradePurchaseResult,
} from './progression/upgrades';
export {
  purchaseFloorUnlock,
  type FloorUnlockFailureReason,
  type FloorUnlockResult,
} from './progression/unlocks';
export {
  advanceSimulation,
  MAX_FOREGROUND_DELTA_MS,
  SIMULATION_STEP_MS,
} from './simulation/advanceSimulation';
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
