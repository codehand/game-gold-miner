import type { BaseGameBalanceConfig } from '../config';
import { calculateMineProductionRates } from '../core/economy/calculateProductionRates';
import { GameNumber, type SerializedGameNumber } from '../core/numbers/GameNumber';
import { calculateLevelEffect } from '../core/progression/calculateLevelEffect';
import {
  CAT_CALCULATION_VERSION,
  createCatProductionModifiers,
  createEmptyCatRoster,
  validateCatRoster,
  type CatAssignment,
  type CatAttributes,
  type CatAvailabilityState,
  type CatInstance,
  type CatRarityTier,
  type CatRole,
  type CatRosterState,
  type CatSlotKey,
} from '../core/cats';
import type {
  ElevatorState,
  GameState,
  MineFloorState,
  WarehouseState,
} from '../core/state/GameState';
import { INITIAL_SAVE_VERSION } from '../core/state/createInitialGameState';

export const CURRENT_SAVE_SCHEMA_VERSION = 3;

/**
 * The immediately preceding save schema. Version 1 has no
 * `warehouse.totalOfflineGoldClaimed`; `migrateSaveDocument` upgrades it by
 * defaulting that counter to zero. Version 2 predates the cat projection and
 * migrates to an empty collection with no assignments.
 */
const SAVE_SCHEMA_VERSION_1 = 1;
const SAVE_SCHEMA_VERSION_2 = 2;

/**
 * Whether a `schemaVersion` value is one this build can read — either the
 * current version or an older one a migration upgrades. Used by
 * `loadActiveGame` to tell an *unsupported* version apart from a merely
 * malformed document: both fail validation, but only the former should be
 * reported as an incompatible save rather than a corrupt one.
 */
export function isSupportedSaveSchemaVersion(value: unknown): boolean {
  return value === SAVE_SCHEMA_VERSION_1 ||
    value === SAVE_SCHEMA_VERSION_2 ||
    value === CURRENT_SAVE_SCHEMA_VERSION;
}
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
  readonly totalOfflineGoldClaimed: SerializedGameNumber;
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

export interface SerializedCatInstance {
  readonly catInstanceId: string;
  readonly ownerUserId: string;
  readonly assetId: string;
  readonly displayName: string;
  readonly roleId: CatRole;
  readonly rarityTier: CatRarityTier;
  readonly level: number;
  readonly attributes: CatAttributes;
  readonly calculationVersion: number;
  readonly availabilityState: CatAvailabilityState;
  readonly assignedSlotKey: string | null;
  readonly updatedAt: number;
}

export interface SerializedCatAssignment {
  readonly slotKey: string;
  readonly catInstanceId: string;
}

export interface SaveDocumentV3 {
  readonly schemaVersion: typeof CURRENT_SAVE_SCHEMA_VERSION;
  readonly savedAtTimestampMs: number;
  readonly effectiveProductionRatePerSecond: SerializedGameNumber;
  readonly state: SerializedGameState;
  readonly cats: readonly SerializedCatInstance[];
  readonly assignments: readonly SerializedCatAssignment[];
  readonly assignmentRevision: number;
  readonly collectionRevision: number;
}

/** Compatibility name retained while the existing repository adapters migrate. */
export type SaveDocumentV2 = SaveDocumentV3;

export interface LoadedSaveDocument {
  readonly schemaVersion: typeof CURRENT_SAVE_SCHEMA_VERSION;
  readonly savedAtTimestampMs: number;
  readonly effectiveProductionRatePerSecond: GameNumber;
  readonly state: GameState;
  readonly catRoster: CatRosterState;
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
  catRoster: CatRosterState = createEmptyCatRoster(),
): SaveDocumentV3 {
  const document: SaveDocumentV3 = {
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    savedAtTimestampMs,
    effectiveProductionRatePerSecond: calculateMineProductionRates(
      state,
      config,
      createCatProductionModifiers(catRoster),
    ).effectiveProductionPerSecond.serialize(),
    state: serializeGameState(state),
    ...serializeCatRoster(catRoster),
  };

  return validateSaveDocument(document, config);
}

export function migrateSaveDocument(
  candidate: unknown,
  config?: BaseGameBalanceConfig,
): unknown {
  const document = assertRecord(candidate, 'save');

  if (!Object.hasOwn(document, 'schemaVersion')) {
    throw new SaveDocumentError('save.schemaVersion is required.');
  }

  const schemaVersion = document.schemaVersion;

  if (!isSupportedSaveSchemaVersion(schemaVersion)) {
    throw new SaveDocumentError(
      `Unsupported save schema version ${String(schemaVersion)}.`,
    );
  }

  // A version-1 document predates `warehouse.totalOfflineGoldClaimed`. That
  // field records a gold source the old shape could not distinguish, and a
  // version-1 save by definition never recorded an offline claim in it, so the
  // upgrade default is zero and every other value is carried across exactly.
  const upgradedToV2 =
    schemaVersion === SAVE_SCHEMA_VERSION_1
      ? upgradeVersionOneDocument(document)
      : document;
  const upgraded = schemaVersion === SAVE_SCHEMA_VERSION_1 || schemaVersion === SAVE_SCHEMA_VERSION_2
    ? upgradeVersionTwoDocument(upgradedToV2)
    : upgradedToV2;

  if (config === undefined) {
    return upgraded;
  }

  return migrateLegacyFourFloorDocument(upgraded, config) ?? upgraded;
}

/**
 * Adds `warehouse.totalOfflineGoldClaimed: '0'` to a version-1 document and
 * stamps it as `CURRENT_SAVE_SCHEMA_VERSION`. A malformed document is stamped
 * and returned unchanged rather than repaired here — `validateSerializedGameState`
 * is what reports the actual shape error, and inventing a `warehouse` object
 * would only move where the failure surfaces.
 */
function upgradeVersionOneDocument(
  document: Record<string, unknown>,
): Record<string, unknown> {
  const upgradedToCurrent = {
    ...document,
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
  };
  const state = document.state;

  if (!isPlainRecord(state)) {
    return upgradedToCurrent;
  }

  const warehouse = state.warehouse;

  if (
    !isPlainRecord(warehouse) ||
    Object.hasOwn(warehouse, 'totalOfflineGoldClaimed')
  ) {
    return upgradedToCurrent;
  }

  return {
    ...upgradedToCurrent,
    state: {
      ...state,
      warehouse: {
        ...warehouse,
        totalOfflineGoldClaimed: '0',
      },
    },
  };
}

function upgradeVersionTwoDocument(
  document: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...document,
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    cats: [],
    assignments: [],
    assignmentRevision: 0,
    collectionRevision: 0,
  };
}

export function validateSaveDocument(
  candidate: unknown,
  config: BaseGameBalanceConfig,
): SaveDocumentV3 {
  const migrated = migrateSaveDocument(candidate, config);
  const document = assertRecord(migrated, 'save');
  assertExactKeys(
    document,
    [
      'schemaVersion',
      'savedAtTimestampMs',
      'effectiveProductionRatePerSecond',
      'state',
      'cats',
      'assignments',
      'assignmentRevision',
      'collectionRevision',
    ],
    'save',
  );
  assertTimestamp(document.savedAtTimestampMs, 'save.savedAtTimestampMs');
  parseGameNumber(
    document.effectiveProductionRatePerSecond,
    'save.effectiveProductionRatePerSecond',
  );

  const state = validateSerializedGameState(document.state, config);
  validateSerializedCatRoster(document, 'save');

  if (document.savedAtTimestampMs < state.lastUpdateTimestampMs) {
    throw new SaveDocumentError(
      'save.savedAtTimestampMs cannot precede state.lastUpdateTimestampMs.',
    );
  }

  return migrated as SaveDocumentV3;
}

/**
 * Expands the former four-floor payload into the fifteen-floor shape. Existing
 * progress is preserved and the added floors use their configured locked
 * defaults. The shape is orthogonal to the schema version: a four-floor
 * document may arrive as version 1 or 2, and `migrateSaveDocument` has already
 * normalized the version (and added any missing fields) before this runs.
 */
function migrateLegacyFourFloorDocument(
  document: Record<string, unknown>,
  config: BaseGameBalanceConfig,
): unknown | null {
  const state = document.state;

  if (
    !isPlainRecord(state) ||
    !Array.isArray(state.floors) ||
    state.floors.length !== 4 ||
    config.floors.length <= state.floors.length
  ) {
    return null;
  }

  const hasLegacyConfiguredPrefix = state.floors.every((candidate, index) => {
    return isPlainRecord(candidate) &&
      candidate.id === config.floors[index]?.id &&
      candidate.floorNumber === config.floors[index]?.floorNumber;
  });

  if (!hasLegacyConfiguredPrefix) {
    return null;
  }

  const addedFloors = config.floors.slice(4).map((floor) => ({
    id: floor.id,
    floorNumber: floor.floorNumber,
    isUnlocked: false,
    mineShaftLevel: floor.startingLevel,
    extractionProgress: 0,
    materialQueue: '0',
    totalExtracted: '0',
    totalTransported: '0',
  }));

  return {
    ...document,
    state: {
      ...state,
      floors: [...state.floors, ...addedFloors],
    },
  };
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
    catRoster: deserializeCatRoster(document),
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
    totalOfflineGoldClaimed: warehouse.totalOfflineGoldClaimed.serialize(),
  };
}

function serializeCatRoster(
  roster: CatRosterState,
): Pick<SaveDocumentV3, 'cats' | 'assignments' | 'assignmentRevision' | 'collectionRevision'> {
  validateCatRoster(roster);

  return {
    cats: roster.cats.map((cat) => ({
      ...cat,
      attributes: { ...cat.attributes },
    })),
    assignments: roster.assignments.map((assignment) => ({ ...assignment })),
    assignmentRevision: roster.assignmentRevision,
    collectionRevision: roster.collectionRevision,
  };
}

function validateSerializedCatRoster(
  document: Record<string, unknown>,
  path: string,
): void {
  const catsValue = document.cats;
  const assignmentsValue = document.assignments;
  if (!Array.isArray(catsValue)) {
    throw new SaveDocumentError(`${path}.cats must be an array.`);
  }
  if (!Array.isArray(assignmentsValue)) {
    throw new SaveDocumentError(`${path}.assignments must be an array.`);
  }

  assertNonNegativeSafeInteger(document.assignmentRevision, `${path}.assignmentRevision`);
  assertNonNegativeSafeInteger(document.collectionRevision, `${path}.collectionRevision`);

  const cats = catsValue.map((value, index) => validateSerializedCat(value, `${path}.cats[${index}]`));
  const assignments = assignmentsValue.map((value, index) => {
    const assignment = assertRecord(value, `${path}.assignments[${index}]`);
    assertExactKeys(assignment, ['slotKey', 'catInstanceId'], `${path}.assignments[${index}]`);
    const slotKey = parseSlotKey(assignment.slotKey, `${path}.assignments[${index}].slotKey`);
    const catInstanceId = assertNonEmptyString(
      assignment.catInstanceId,
      `${path}.assignments[${index}].catInstanceId`,
    );
    return { slotKey, catInstanceId } satisfies CatAssignment;
  });

  try {
    validateCatRoster({
      cats,
      assignments,
      assignmentRevision: document.assignmentRevision as number,
      collectionRevision: document.collectionRevision as number,
    });
  } catch (error) {
    throw new SaveDocumentError(
      `${path} is inconsistent: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function validateSerializedCat(value: unknown, path: string): CatInstance {
  const cat = assertRecord(value, path);
  assertExactKeys(
    cat,
    [
      'catInstanceId',
      'ownerUserId',
      'assetId',
      'displayName',
      'roleId',
      'rarityTier',
      'level',
      'attributes',
      'calculationVersion',
      'availabilityState',
      'assignedSlotKey',
      'updatedAt',
    ],
    path,
  );

  const roleId = assertEnum(cat.roleId, ['elevator', 'warehouse', 'miner', 'hauler'], `${path}.roleId`) as CatRole;
  const rarityTier = assertEnum(cat.rarityTier, ['N', 'R', 'SR', 'SSR', 'UR'], `${path}.rarityTier`) as CatRarityTier;
  const availabilityState = assertEnum(
    cat.availabilityState,
    ['Idle', 'Assigned', 'Listed', 'Rented', 'Expired', 'Locked'],
    `${path}.availabilityState`,
  ) as CatAvailabilityState;
  const attributesRecord = assertRecord(cat.attributes, `${path}.attributes`);
  assertExactKeys(attributesRecord, ['power', 'speed', 'capacity', 'efficiency'], `${path}.attributes`);

  const attributes = {
    power: assertAttribute(attributesRecord.power, `${path}.attributes.power`),
    speed: assertAttribute(attributesRecord.speed, `${path}.attributes.speed`),
    capacity: assertAttribute(attributesRecord.capacity, `${path}.attributes.capacity`),
    efficiency: assertAttribute(attributesRecord.efficiency, `${path}.attributes.efficiency`),
  };
  const assignedSlotKey = cat.assignedSlotKey === null
    ? null
    : parseSlotKey(cat.assignedSlotKey, `${path}.assignedSlotKey`);

  if (cat.calculationVersion !== CAT_CALCULATION_VERSION) {
    throw new SaveDocumentError(`${path}.calculationVersion is unsupported.`);
  }

  return {
    catInstanceId: assertNonEmptyString(cat.catInstanceId, `${path}.catInstanceId`),
    ownerUserId: assertNonEmptyString(cat.ownerUserId, `${path}.ownerUserId`),
    assetId: assertNonEmptyString(cat.assetId, `${path}.assetId`),
    displayName: assertNonEmptyString(cat.displayName, `${path}.displayName`),
    roleId,
    rarityTier,
    level: assertPositiveSafeIntegerValue(cat.level, `${path}.level`),
    attributes,
    calculationVersion: cat.calculationVersion,
    availabilityState,
    assignedSlotKey,
    updatedAt: assertTimestampValue(cat.updatedAt, `${path}.updatedAt`),
  };
}

function deserializeCatRoster(document: SaveDocumentV3): CatRosterState {
  return {
    cats: document.cats.map((cat) => ({
      ...cat,
      assignedSlotKey: cat.assignedSlotKey === null
        ? null
        : parseSlotKey(cat.assignedSlotKey, 'save.cats.assignedSlotKey'),
      attributes: { ...cat.attributes },
    })),
    assignments: document.assignments.map((assignment) => ({
      slotKey: parseSlotKey(assignment.slotKey, 'save.assignments.slotKey'),
      catInstanceId: assignment.catInstanceId,
    })),
    assignmentRevision: document.assignmentRevision,
    collectionRevision: document.collectionRevision,
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

  if (capacity.serialize() !== expectedCapacity.serialize()) {
    throw new SaveDocumentError(
      `${path}.capacity does not match its configured level effect.`,
    );
  }

  assertIntegerRange(
    elevator.roundRobinCursor,
    -config.floors.length,
    config.floors.length,
    `${path}.roundRobinCursor`,
  );
  assertRange(elevator.transitProgress, 0, 1, `${path}.transitProgress`);
  parseGameNumber(
    elevator.carriedMaterial,
    `${path}.carriedMaterial`,
  );
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
      'totalOfflineGoldClaimed',
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

  if (capacity.serialize() !== expectedCapacity.serialize()) {
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
  parseGameNumber(
    warehouse.totalOfflineGoldClaimed,
    `${path}.totalOfflineGoldClaimed`,
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
      totalOfflineGoldClaimed: GameNumber.deserialize(
        state.warehouse.totalOfflineGoldClaimed,
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

function assertNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SaveDocumentError(`${path} must be a non-empty string.`);
  }
  return value;
}

function assertEnum(
  value: unknown,
  choices: readonly string[],
  path: string,
): string {
  if (typeof value !== 'string' || !choices.includes(value)) {
    throw new SaveDocumentError(`${path} must be one of ${choices.join(', ')}.`);
  }
  return value;
}

function assertAttribute(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new SaveDocumentError(`${path} must be in [0, 100].`);
  }
  return value;
}

function assertPositiveSafeIntegerValue(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new SaveDocumentError(`${path} must be a positive safe integer.`);
  }
  return value as number;
}

function assertTimestampValue(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SaveDocumentError(`${path} must be a non-negative safe integer.`);
  }
  return value as number;
}

function parseSlotKey(value: unknown, path: string): CatSlotKey {
  if (typeof value !== 'string') {
    throw new SaveDocumentError(`${path} must be a supported role slot key.`);
  }
  if (value === 'elevator:main' || value === 'warehouse:main') {
    return value;
  }
  if ((value.startsWith('miner:') && value.length > 'miner:'.length) || /^hauler:[1-5]$/.test(value)) {
    return value as CatSlotKey;
  }
  throw new SaveDocumentError(`${path} must be a supported role slot key.`);
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new SaveDocumentError(`${path} must be a plain object.`);
  }

  return value as Record<string, unknown>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
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
