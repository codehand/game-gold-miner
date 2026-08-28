import type { BaseGameBalanceConfig } from '../config';
import { calculateMineProductionRates } from '../core/economy/calculateProductionRates';
import { GameNumber, type SerializedGameNumber } from '../core/numbers/GameNumber';
import { calculateLevelEffect } from '../core/progression/calculateLevelEffect';
import type {
  ElevatorState,
  GameState,
  MineFloorState,
  WarehouseState,
} from '../core/state/GameState';
import { INITIAL_SAVE_VERSION } from '../core/state/createInitialGameState';

export const CURRENT_SAVE_SCHEMA_VERSION = 1;
const SERIALIZED_GAME_NUMBER_PATTERN =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export interface SerializedMineFloorState {
  readonly id: string;
  readonly floorNumber: number;
  readonly isUnlocked: boolean;
  readonly mineShaftLevel: number;
  readonly extractionProgress: number;
  readonly materialQueue: SerializedGameNumber;
  readonly totalExtracted: SerializedGameNumber;
  readonly totalTransported: SerializedGameNumber;
}

export interface SerializedElevatorState {
  readonly level: number;
  readonly capacity: SerializedGameNumber;
  readonly roundRobinCursor: number;
  readonly transitProgress: number;
  readonly carriedMaterial: SerializedGameNumber;
}

export interface SerializedWarehouseState {
  readonly level: number;
  readonly capacity: SerializedGameNumber;
  readonly inputQueue: SerializedGameNumber;
  readonly conversionProgress: number;
  readonly totalGoldDelivered: SerializedGameNumber;
}

export interface SerializedGameState {
  readonly saveVersion: number;
  readonly lastUpdateTimestampMs: number;
  readonly simulationTick: number;
  readonly simulationRemainderMs: number;
  readonly gold: SerializedGameNumber;
  readonly floors: readonly SerializedMineFloorState[];
  readonly elevator: SerializedElevatorState;
  readonly warehouse: SerializedWarehouseState;
}

export interface SaveDocumentV1 {
  readonly schemaVersion: typeof CURRENT_SAVE_SCHEMA_VERSION;
  readonly savedAtTimestampMs: number;
  readonly effectiveProductionRatePerSecond: SerializedGameNumber;
  readonly state: SerializedGameState;
}

export interface LoadedSaveDocument {
  readonly schemaVersion: typeof CURRENT_SAVE_SCHEMA_VERSION;
  readonly savedAtTimestampMs: number;
  readonly effectiveProductionRatePerSecond: GameNumber;
  readonly state: GameState;
}

export class SaveDocumentError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SaveDocumentError';
  }
}

export function createSaveDocument(
  state: GameState,
  config: BaseGameBalanceConfig,
  savedAtTimestampMs: number,
): SaveDocumentV1 {
  const document: SaveDocumentV1 = {
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    savedAtTimestampMs,
    effectiveProductionRatePerSecond: calculateMineProductionRates(
      state,
      config,
    ).effectiveProductionPerSecond.serialize(),
    state: serializeGameState(state),
  };

  return validateSaveDocument(document, config);
}

export function migrateSaveDocument(candidate: unknown): unknown {
  const document = assertRecord(candidate, 'save');

  if (!Object.hasOwn(document, 'schemaVersion')) {
    throw new SaveDocumentError('save.schemaVersion is required.');
  }

  const schemaVersion = document.schemaVersion;

  if (schemaVersion !== CURRENT_SAVE_SCHEMA_VERSION) {
    throw new SaveDocumentError(
      `Unsupported save schema version ${String(schemaVersion)}.`,
    );
  }

  return candidate;
}

export function validateSaveDocument(
  candidate: unknown,
  config: BaseGameBalanceConfig,
): SaveDocumentV1 {
  const migrated = migrateSaveDocument(candidate);
  const document = assertRecord(migrated, 'save');
  assertExactKeys(
    document,
    [
      'schemaVersion',
      'savedAtTimestampMs',
      'effectiveProductionRatePerSecond',
      'state',
    ],
    'save',
  );
  assertTimestamp(document.savedAtTimestampMs, 'save.savedAtTimestampMs');
  parseGameNumber(
    document.effectiveProductionRatePerSecond,
    'save.effectiveProductionRatePerSecond',
  );

  const state = validateSerializedGameState(document.state, config);

  if (document.savedAtTimestampMs < state.lastUpdateTimestampMs) {
    throw new SaveDocumentError(
      'save.savedAtTimestampMs cannot precede state.lastUpdateTimestampMs.',
    );
  }

  return migrated as SaveDocumentV1;
}

export function deserializeSaveDocument(
  candidate: unknown,
  config: BaseGameBalanceConfig,
): LoadedSaveDocument {
  const document = validateSaveDocument(candidate, config);

  return {
    schemaVersion: document.schemaVersion,
    savedAtTimestampMs: document.savedAtTimestampMs,
    effectiveProductionRatePerSecond: GameNumber.deserialize(
      document.effectiveProductionRatePerSecond,
    ),
    state: deserializeGameState(document.state),
  };
}

function serializeGameState(state: GameState): SerializedGameState {
  return {
    saveVersion: state.saveVersion,
    lastUpdateTimestampMs: state.lastUpdateTimestampMs,
    simulationTick: state.simulationTick,
    simulationRemainderMs: state.simulationRemainderMs,
    gold: state.gold.serialize(),
    floors: state.floors.map(serializeMineFloor),
    elevator: serializeElevator(state.elevator),
    warehouse: serializeWarehouse(state.warehouse),
  };
}

function serializeMineFloor(floor: MineFloorState): SerializedMineFloorState {
  return {
    id: floor.id,
    floorNumber: floor.floorNumber,
    isUnlocked: floor.isUnlocked,
    mineShaftLevel: floor.mineShaftLevel,
    extractionProgress: floor.extractionProgress,
    materialQueue: floor.materialQueue.serialize(),
    totalExtracted: floor.totalExtracted.serialize(),
    totalTransported: floor.totalTransported.serialize(),
  };
}

function serializeElevator(elevator: ElevatorState): SerializedElevatorState {
  return {
    level: elevator.level,
    capacity: elevator.capacity.serialize(),
    roundRobinCursor: elevator.roundRobinCursor,
    transitProgress: elevator.transitProgress,
    carriedMaterial: elevator.carriedMaterial.serialize(),
  };
}

function serializeWarehouse(
  warehouse: WarehouseState,
): SerializedWarehouseState {
  return {
    level: warehouse.level,
    capacity: warehouse.capacity.serialize(),
    inputQueue: warehouse.inputQueue.serialize(),
    conversionProgress: warehouse.conversionProgress,
    totalGoldDelivered: warehouse.totalGoldDelivered.serialize(),
  };
}

function validateSerializedGameState(
  candidate: unknown,
  config: BaseGameBalanceConfig,
): SerializedGameState {
  const state = assertRecord(candidate, 'save.state');
  assertExactKeys(
    state,
    [
      'saveVersion',
      'lastUpdateTimestampMs',
      'simulationTick',
      'simulationRemainderMs',
      'gold',
      'floors',
      'elevator',
      'warehouse',
    ],
    'save.state',
  );

  if (state.saveVersion !== INITIAL_SAVE_VERSION) {
    throw new SaveDocumentError(
      `save.state.saveVersion must equal ${INITIAL_SAVE_VERSION}.`,
    );
  }

  assertTimestamp(
    state.lastUpdateTimestampMs,
    'save.state.lastUpdateTimestampMs',
  );
  assertNonNegativeSafeInteger(
    state.simulationTick,
    'save.state.simulationTick',
  );
  assertRange(
    state.simulationRemainderMs,
    0,
    100,
    'save.state.simulationRemainderMs',
  );
  parseGameNumber(state.gold, 'save.state.gold');
  validateFloors(state.floors, config);
  validateElevator(state.elevator, config);
  validateWarehouse(state.warehouse, config);

  return state as unknown as SerializedGameState;
}

function validateFloors(
  candidate: unknown,
  config: BaseGameBalanceConfig,
): void {
  if (!Array.isArray(candidate) || candidate.length !== config.floors.length) {
    throw new SaveDocumentError(
      `save.state.floors must contain exactly ${config.floors.length} floors.`,
    );
  }

  let encounteredLockedFloor = false;
  let previousMineShaftLevel: number | null = null;

  candidate.forEach((value, index) => {
    const path = `save.state.floors[${index}]`;
    const floor = assertRecord(value, path);
    const floorConfig = config.floors[index];
    assertExactKeys(
      floor,
      [
        'id',
        'floorNumber',
        'isUnlocked',
        'mineShaftLevel',
        'extractionProgress',
        'materialQueue',
        'totalExtracted',
        'totalTransported',
      ],
      path,
    );

    if (floor.id !== floorConfig.id) {
      throw new SaveDocumentError(
        `${path}.id must equal configured identifier ${floorConfig.id}.`,
      );
    }
    if (floor.floorNumber !== floorConfig.floorNumber) {
      throw new SaveDocumentError(
        `${path}.floorNumber must equal ${floorConfig.floorNumber}.`,
      );
    }
    assertBoolean(floor.isUnlocked, `${path}.isUnlocked`);
    assertPositiveSafeInteger(floor.mineShaftLevel, `${path}.mineShaftLevel`);
    assertRange(floor.extractionProgress, 0, 1, `${path}.extractionProgress`);
    const materialQueue = parseGameNumber(
      floor.materialQueue,
      `${path}.materialQueue`,
    );
    const totalExtracted = parseGameNumber(
      floor.totalExtracted,
      `${path}.totalExtracted`,
    );
    const totalTransported = parseGameNumber(
      floor.totalTransported,
      `${path}.totalTransported`,
    );

    if (totalTransported.greaterThan(totalExtracted)) {
      throw new SaveDocumentError(
        `${path}.totalTransported cannot exceed totalExtracted.`,
      );
    }

    if (index === 0 && !floor.isUnlocked) {
      throw new SaveDocumentError(`${path} must remain unlocked.`);
    }

    if (floor.isUnlocked && encounteredLockedFloor) {
      throw new SaveDocumentError(
        `${path} cannot be unlocked after a locked preceding floor.`,
      );
    }

    if (floor.isUnlocked && index > 0) {
      const requirement = floorConfig.unlockRequirement;

      if (
        requirement === null ||
        previousMineShaftLevel === null ||
        previousMineShaftLevel < requirement.level
      ) {
        throw new SaveDocumentError(
          `${path} requires the preceding floor at its configured unlock level.`,
        );
      }
    }

    if (!floor.isUnlocked) {
      encounteredLockedFloor = true;

      if (
        floor.mineShaftLevel !== floorConfig.startingLevel ||
        floor.extractionProgress !== 0 ||
        materialQueue.greaterThan(0) ||
        totalExtracted.greaterThan(0) ||
        totalTransported.greaterThan(0)
      ) {
        throw new SaveDocumentError(
          `${path} must not contain production while locked.`,
        );
      }
    }

    previousMineShaftLevel = floor.mineShaftLevel as number;
  });
}

function validateElevator(
  candidate: unknown,
  config: BaseGameBalanceConfig,
): void {
  const path = 'save.state.elevator';
  const elevator = assertRecord(candidate, path);
  assertExactKeys(
    elevator,
    [
      'level',
      'capacity',
      'roundRobinCursor',
      'transitProgress',
      'carriedMaterial',
    ],
    path,
  );
  assertPositiveSafeInteger(elevator.level, `${path}.level`);
  const capacity = parseGameNumber(elevator.capacity, `${path}.capacity`, true);
  const expectedCapacity = calculateLevelEffect(
    config.elevator.baseCapacity,
    elevator.level as number,
    config.elevator.upgrade,
  );

  if (!capacity.equals(expectedCapacity)) {
    throw new SaveDocumentError(
      `${path}.capacity does not match its configured level effect.`,
    );
  }

  assertIntegerRange(
    elevator.roundRobinCursor,
    0,
    config.floors.length,
    `${path}.roundRobinCursor`,
  );
  assertRange(elevator.transitProgress, 0, 1, `${path}.transitProgress`);
  const carriedMaterial = parseGameNumber(
    elevator.carriedMaterial,
    `${path}.carriedMaterial`,
  );

  if (carriedMaterial.equals(0) && elevator.transitProgress !== 0) {
    throw new SaveDocumentError(
      `${path}.transitProgress must be zero without carried material.`,
    );
  }
}

function validateWarehouse(
  candidate: unknown,
  config: BaseGameBalanceConfig,
): void {
  const path = 'save.state.warehouse';
  const warehouse = assertRecord(candidate, path);
  assertExactKeys(
    warehouse,
    [
      'level',
      'capacity',
      'inputQueue',
      'conversionProgress',
      'totalGoldDelivered',
    ],
    path,
  );
  assertPositiveSafeInteger(warehouse.level, `${path}.level`);
  const capacity = parseGameNumber(
    warehouse.capacity,
    `${path}.capacity`,
    true,
  );
  const expectedCapacity = calculateLevelEffect(
    config.warehouse.baseCapacity,
    warehouse.level as number,
    config.warehouse.upgrade,
  );

  if (!capacity.equals(expectedCapacity)) {
    throw new SaveDocumentError(
      `${path}.capacity does not match its configured level effect.`,
    );
  }

  const inputQueue = parseGameNumber(
    warehouse.inputQueue,
    `${path}.inputQueue`,
  );
  assertRange(
    warehouse.conversionProgress,
    0,
    1,
    `${path}.conversionProgress`,
  );
  parseGameNumber(
    warehouse.totalGoldDelivered,
    `${path}.totalGoldDelivered`,
  );

  if (inputQueue.equals(0) && warehouse.conversionProgress !== 0) {
    throw new SaveDocumentError(
      `${path}.conversionProgress must be zero without queued input.`,
    );
  }
}

function deserializeGameState(state: SerializedGameState): GameState {
  return {
    saveVersion: state.saveVersion,
    lastUpdateTimestampMs: state.lastUpdateTimestampMs,
    simulationTick: state.simulationTick,
    simulationRemainderMs: state.simulationRemainderMs,
    gold: GameNumber.deserialize(state.gold),
    floors: state.floors.map((floor) => ({
      id: floor.id,
      floorNumber: floor.floorNumber,
      isUnlocked: floor.isUnlocked,
      mineShaftLevel: floor.mineShaftLevel,
      extractionProgress: floor.extractionProgress,
      materialQueue: GameNumber.deserialize(floor.materialQueue),
      totalExtracted: GameNumber.deserialize(floor.totalExtracted),
      totalTransported: GameNumber.deserialize(floor.totalTransported),
    })),
    elevator: {
      level: state.elevator.level,
      capacity: GameNumber.deserialize(state.elevator.capacity),
      roundRobinCursor: state.elevator.roundRobinCursor,
      transitProgress: state.elevator.transitProgress,
      carriedMaterial: GameNumber.deserialize(state.elevator.carriedMaterial),
    },
    warehouse: {
      level: state.warehouse.level,
      capacity: GameNumber.deserialize(state.warehouse.capacity),
      inputQueue: GameNumber.deserialize(state.warehouse.inputQueue),
      conversionProgress: state.warehouse.conversionProgress,
      totalGoldDelivered: GameNumber.deserialize(
        state.warehouse.totalGoldDelivered,
      ),
    },
  };
}

function parseGameNumber(
  value: unknown,
  path: string,
  requirePositive = false,
): GameNumber {
  if (
    typeof value !== 'string' ||
    !SERIALIZED_GAME_NUMBER_PATTERN.test(value)
  ) {
    throw new SaveDocumentError(`${path} must be a serialized numeric string.`);
  }

  let parsed: GameNumber;

  try {
    parsed = GameNumber.deserialize(value);
  } catch {
    throw new SaveDocumentError(`${path} must contain a finite numeric value.`);
  }

  if (requirePositive ? !parsed.greaterThan(0) : parsed.lessThan(0)) {
    throw new SaveDocumentError(
      `${path} must be ${requirePositive ? 'positive' : 'non-negative'}.`,
    );
  }

  return parsed;
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new SaveDocumentError(`${path} must be a plain object.`);
  }

  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new SaveDocumentError(
      `${path} must contain exactly: ${expectedKeys.join(', ')}.`,
    );
  }
}

function assertTimestamp(value: unknown, path: string): asserts value is number {
  assertNonNegativeSafeInteger(value, path);
}

function assertPositiveSafeInteger(
  value: unknown,
  path: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new SaveDocumentError(`${path} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(
  value: unknown,
  path: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SaveDocumentError(
      `${path} must be a non-negative safe integer.`,
    );
  }
}

function assertBoolean(
  value: unknown,
  path: string,
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new SaveDocumentError(`${path} must be a boolean.`);
  }
}

function assertRange(
  value: unknown,
  minimumInclusive: number,
  maximumExclusive: number,
  path: string,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimumInclusive ||
    value >= maximumExclusive
  ) {
    throw new SaveDocumentError(
      `${path} must be in [${minimumInclusive}, ${maximumExclusive}).`,
    );
  }
}

function assertIntegerRange(
  value: unknown,
  minimumInclusive: number,
  maximumExclusive: number,
  path: string,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimumInclusive ||
    (value as number) >= maximumExclusive
  ) {
    throw new SaveDocumentError(
      `${path} must be an integer in [${minimumInclusive}, ${maximumExclusive}).`,
    );
  }
}
