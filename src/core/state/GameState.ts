import type { GameNumber } from '../numbers/GameNumber';

export interface MineFloorState {
  readonly id: string;
  readonly floorNumber: number;
  readonly isUnlocked: boolean;
  readonly mineShaftLevel: number;
  readonly extractionProgress: number;
  readonly materialQueue: GameNumber;
  readonly totalExtracted: GameNumber;
  readonly totalTransported: GameNumber;
}

export interface ElevatorState {
  readonly level: number;
  readonly capacity: GameNumber;
  readonly roundRobinCursor: number;
  readonly transitProgress: number;
  readonly carriedMaterial: GameNumber;
}

export interface WarehouseState {
  readonly level: number;
  readonly capacity: GameNumber;
  readonly inputQueue: GameNumber;
  readonly conversionProgress: number;
  readonly totalGoldDelivered: GameNumber;
  /**
   * Server-milestone Step 18: lifetime gold credited by `claimOfflineReward`.
   * Monotonic, and part of the save-conflict progress vector, because offline
   * rewards add `gold` without passing through `totalGoldDelivered` — without
   * this counter a save could be a strict subset of another on every vector
   * field while still holding offline gold the vector could not see.
   */
  readonly totalOfflineGoldClaimed: GameNumber;
}

export interface GameState {
  readonly saveVersion: number;
  readonly lastUpdateTimestampMs: number;
  readonly simulationTick: number;
  readonly simulationRemainderMs: number;
  readonly gold: GameNumber;
  readonly floors: readonly MineFloorState[];
  readonly elevator: ElevatorState;
  readonly warehouse: WarehouseState;
}
