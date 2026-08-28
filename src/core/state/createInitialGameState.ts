import {
  type BaseGameBalanceConfig,
  validateBaseGameBalance,
} from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import { calculateLevelEffect } from '../progression/calculateLevelEffect';
import type { GameState, MineFloorState } from './GameState';

export const INITIAL_SAVE_VERSION = 1;

export function createInitialGameState(
  config: BaseGameBalanceConfig,
  timestampMs: number,
): GameState {
  validateBaseGameBalance(config);
  validateTimestamp(timestampMs);

  return {
    saveVersion: INITIAL_SAVE_VERSION,
    lastUpdateTimestampMs: timestampMs,
    simulationTick: 0,
    simulationRemainderMs: 0,
    gold: GameNumber.from(config.startingGold),
    floors: config.floors.map((floor) => {
      return createMineFloorState(floor, floor.startingUnlocked);
    }),
    elevator: {
      level: config.elevator.startingLevel,
      capacity: calculateLevelEffect(
        config.elevator.baseCapacity,
        config.elevator.startingLevel,
        config.elevator.upgrade,
      ),
      roundRobinCursor: 0,
      transitProgress: 0,
      carriedMaterial: zero(),
    },
    warehouse: {
      level: config.warehouse.startingLevel,
      capacity: calculateLevelEffect(
        config.warehouse.baseCapacity,
        config.warehouse.startingLevel,
        config.warehouse.upgrade,
      ),
      inputQueue: zero(),
      conversionProgress: 0,
      totalGoldDelivered: zero(),
    },
  };
}

export function createMineFloorState(
  floor: BaseGameBalanceConfig['floors'][number],
  isUnlocked: boolean,
): MineFloorState {
  return {
    id: floor.id,
    floorNumber: floor.floorNumber,
    isUnlocked,
    mineShaftLevel: floor.startingLevel,
    extractionProgress: 0,
    materialQueue: zero(),
    totalExtracted: zero(),
    totalTransported: zero(),
  };
}

function zero(): GameNumber {
  return GameNumber.from(0);
}

function validateTimestamp(timestampMs: number): void {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new Error('Initial state timestamp must be a non-negative safe integer.');
  }
}
