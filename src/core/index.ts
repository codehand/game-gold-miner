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
  advanceSimulation,
  MAX_FOREGROUND_DELTA_MS,
  SIMULATION_STEP_MS,
} from './simulation/advanceSimulation';
export {
  createInitialGameState,
  INITIAL_SAVE_VERSION,
} from './state/createInitialGameState';
export type {
  ElevatorState,
  GameState,
  MineFloorState,
  WarehouseState,
} from './state/GameState';
