import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  calculateMineProductionRates,
  createInitialGameState,
  simulateEconomyProgression,
  type GameState,
} from '../../src/core';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SaveDocumentError,
  createSaveDocument,
  deserializeSaveDocument,
  migrateSaveDocument,
  validateSaveDocument,
  type SaveDocumentV2,
} from '../../src/persistence';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('versioned save schema', () => {
  it('creates a valid plain-data save with a production-rate snapshot', () => {
    const state = createProducingState();
    const document = createSaveDocument(
      state,
      BASE_GAME_BALANCE,
      state.lastUpdateTimestampMs,
    );
    const expectedRate = calculateMineProductionRates(
      state,
      BASE_GAME_BALANCE,
    ).effectiveProductionPerSecond;

    expect(document.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(document.savedAtTimestampMs).toBe(state.lastUpdateTimestampMs);
    expect(document.effectiveProductionRatePerSecond).toBe(
      expectedRate.serialize(),
    );
    expect(document.state.gold).toBe(state.gold.serialize());
    expect(document.state.floors).toHaveLength(15);
    expect(document.state.elevator.capacity).toBe(
      state.elevator.capacity.serialize(),
    );
    expect(document.state.warehouse.capacity).toBe(
      state.warehouse.capacity.serialize(),
    );
    expect(() => JSON.parse(JSON.stringify(document))).not.toThrow();
  });

  it('validates and deserializes a JSON round trip exactly', () => {
    const state = createProducingState();
    const document = createSaveDocument(
      state,
      BASE_GAME_BALANCE,
      state.lastUpdateTimestampMs,
    );
    const parsed: unknown = JSON.parse(JSON.stringify(document));
    const loaded = deserializeSaveDocument(parsed, BASE_GAME_BALANCE);

    expect(validateSaveDocument(parsed, BASE_GAME_BALANCE)).toEqual(document);
    expect(loaded.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(loaded.savedAtTimestampMs).toBe(document.savedAtTimestampMs);
    expect(loaded.effectiveProductionRatePerSecond.equals(
      document.effectiveProductionRatePerSecond,
    )).toBe(true);
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(state));
  });

  it('round-trips upgraded capacities through their serialized boundary', () => {
    const state = simulateEconomyProgression(60_000, TIMESTAMP_MS).state;
    const document = createSaveDocument(
      state,
      BASE_GAME_BALANCE,
      state.lastUpdateTimestampMs,
    );
    const loaded = deserializeSaveDocument(
      JSON.parse(JSON.stringify(document)),
      BASE_GAME_BALANCE,
    );

    expect(loaded.state.elevator.level).toBe(state.elevator.level);
    expect(loaded.state.elevator.capacity.serialize()).toBe(
      state.elevator.capacity.serialize(),
    );
    expect(loaded.state.warehouse.level).toBe(state.warehouse.level);
    expect(loaded.state.warehouse.capacity.serialize()).toBe(
      state.warehouse.capacity.serialize(),
    );
  });

  it('keeps a long fractional transport journey inside save invariants', () => {
    const state = simulateEconomyProgression(10 * 60 * 1_000, TIMESTAMP_MS).state;

    for (const floor of state.floors) {
      expect(
        floor.totalTransported.lessThanOrEqualTo(floor.totalExtracted),
        `${floor.id} cannot transport more than it extracted`,
      ).toBe(true);
    }
    expect(() => createSaveDocument(
      state,
      BASE_GAME_BALANCE,
      state.lastUpdateTimestampMs,
    )).not.toThrow();
  });

  it('routes the current version through the migration entry point unchanged', () => {
    const document = createValidDocument();

    expect(migrateSaveDocument(document)).toBe(document);
  });

  it('expands a legacy four-floor save with locked defaults through floor 15', () => {
    const document = createValidDocument();
    const legacyDocument = {
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.slice(0, 4),
      },
    };
    const migrated = validateSaveDocument(legacyDocument, BASE_GAME_BALANCE);

    expect(migrated.state.floors).toHaveLength(15);
    expect(migrated.state.floors.slice(0, 4)).toEqual(
      legacyDocument.state.floors,
    );
    expect(
      migrated.state.floors.slice(4).every((floor) =>
        !floor.isUnlocked &&
        floor.mineShaftLevel === 1 &&
        floor.materialQueue === '0'
      ),
    ).toBe(true);
  });

  it('upgrades a version-1 document by defaulting the offline-claim counter to zero (Step 18)', () => {
    const current = createValidDocument();
    const warehouseWithoutCounter: Record<string, unknown> = {
      ...current.state.warehouse,
    };
    delete warehouseWithoutCounter.totalOfflineGoldClaimed;
    const versionOne = {
      ...current,
      schemaVersion: 1,
      state: {
        ...current.state,
        warehouse: warehouseWithoutCounter,
      },
    };

    const migrated = validateSaveDocument(versionOne, BASE_GAME_BALANCE);

    expect(migrated.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.state.warehouse.totalOfflineGoldClaimed).toBe('0');
    // Every other value survives the upgrade exactly.
    expect(migrated.state.gold).toBe(current.state.gold);
    expect(migrated.state.warehouse.totalGoldDelivered).toBe(
      current.state.warehouse.totalGoldDelivered,
    );
    expect(migrated.state.floors).toEqual(current.state.floors);
  });

  it('rejects missing and unsupported schema versions', () => {
    const document = createValidDocument();
    const missingVersion = {
      savedAtTimestampMs: document.savedAtTimestampMs,
      effectiveProductionRatePerSecond:
        document.effectiveProductionRatePerSecond,
      state: document.state,
    };

    expect(() => migrateSaveDocument(missingVersion)).toThrow(
      /schemaVersion is required/,
    );
    expect(() => migrateSaveDocument({
      ...document,
      schemaVersion: 3,
    })).toThrow(/Unsupported save schema version 3/);
  });

  it.each([
    ['rate snapshot', (document: SaveDocumentV2) => ({
      ...document,
      effectiveProductionRatePerSecond: 'not-a-number',
    })],
    ['gold', (document: SaveDocumentV2) => ({
      ...document,
      state: { ...document.state, gold: 'Infinity' },
    })],
    ['numeric gold instead of a string', (document: SaveDocumentV2) => ({
      ...document,
      state: { ...document.state, gold: 100 },
    })],
  ])('rejects an invalid %s numeric value', (_label, mutate) => {
    expect(() => validateSaveDocument(
      mutate(createValidDocument()),
      BASE_GAME_BALANCE,
    )).toThrow(SaveDocumentError);
  });

  it('rejects unknown, reordered, and missing required floor identifiers', () => {
    const document = createValidDocument();
    const unknownFloor = {
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.map((floor, index) => {
          return index === 0 ? { ...floor, id: 'unknown-floor' } : floor;
        }),
      },
    };
    const reorderedFloors = {
      ...document,
      state: {
        ...document.state,
        floors: [
          document.state.floors[1],
          document.state.floors[0],
          ...document.state.floors.slice(2),
        ],
      },
    };
    const missingFloor = {
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.slice(0, 14),
      },
    };

    expect(() => validateSaveDocument(
      unknownFloor,
      BASE_GAME_BALANCE,
    )).toThrow(/configured identifier/);
    expect(() => validateSaveDocument(
      reorderedFloors,
      BASE_GAME_BALANCE,
    )).toThrow(/configured identifier/);
    expect(() => validateSaveDocument(
      missingFloor,
      BASE_GAME_BALANCE,
    )).toThrow(/exactly 15 floors/);
  });

  it.each([
    ['floor material', (document: SaveDocumentV2) => ({
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.map((floor, index) => {
          return index === 0 ? { ...floor, materialQueue: '-1' } : floor;
        }),
      },
    })],
    ['elevator carried material', (document: SaveDocumentV2) => ({
      ...document,
      state: {
        ...document.state,
        elevator: { ...document.state.elevator, carriedMaterial: '-1' },
      },
    })],
    ['warehouse input', (document: SaveDocumentV2) => ({
      ...document,
      state: {
        ...document.state,
        warehouse: { ...document.state.warehouse, inputQueue: '-1' },
      },
    })],
  ])('rejects a negative %s queue', (_label, mutate) => {
    expect(() => validateSaveDocument(
      mutate(createValidDocument()),
      BASE_GAME_BALANCE,
    )).toThrow(/non-negative/);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unacceptable save timestamp %s',
    (savedAtTimestampMs) => {
      expect(() => validateSaveDocument(
        { ...createValidDocument(), savedAtTimestampMs },
        BASE_GAME_BALANCE,
      )).toThrow(/savedAtTimestampMs/);
    },
  );

  it('rejects a save timestamp that precedes its authoritative state', () => {
    const document = createValidDocument();

    expect(() => validateSaveDocument(
      { ...document, savedAtTimestampMs: document.savedAtTimestampMs - 1 },
      BASE_GAME_BALANCE,
    )).toThrow(/cannot precede/);
  });

  it('rejects invalid progress, counters, and level-derived capacity', () => {
    const document = createValidDocument();
    const invalidProgress = {
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.map((floor, index) => {
          return index === 0 ? { ...floor, extractionProgress: 1 } : floor;
        }),
      },
    };
    const invalidTick = {
      ...document,
      state: { ...document.state, simulationTick: -1 },
    };
    const invalidCapacity = {
      ...document,
      state: {
        ...document.state,
        elevator: { ...document.state.elevator, capacity: '999' },
      },
    };

    expect(() => validateSaveDocument(
      invalidProgress,
      BASE_GAME_BALANCE,
    )).toThrow(/extractionProgress/);
    expect(() => validateSaveDocument(
      invalidTick,
      BASE_GAME_BALANCE,
    )).toThrow(/simulationTick/);
    expect(() => validateSaveDocument(
      invalidCapacity,
      BASE_GAME_BALANCE,
    )).toThrow(/level effect/);
  });

  it('accepts signed elevator routes and rejects cursors outside the mine', () => {
    const document = createValidDocument();
    const returning = {
      ...document,
      state: {
        ...document.state,
        elevator: {
          ...document.state.elevator,
          roundRobinCursor: -1,
          transitProgress: 0.5,
          carriedMaterial: '0',
        },
      },
    };

    expect(() => validateSaveDocument(returning, BASE_GAME_BALANCE)).not.toThrow();

    for (const roundRobinCursor of [-16, 15]) {
      expect(() => validateSaveDocument({
        ...document,
        state: {
          ...document.state,
          elevator: { ...document.state.elevator, roundRobinCursor },
        },
      }, BASE_GAME_BALANCE)).toThrow(/roundRobinCursor/);
    }
  });

  it('rejects production on locked floors and non-sequential unlocks', () => {
    const document = createValidDocument();
    const lockedProduction = {
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.map((floor, index) => {
          return index === 1 ? { ...floor, materialQueue: '1' } : floor;
        }),
      },
    };
    const skippedUnlock = {
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.map((floor, index) => {
          return index === 2 ? { ...floor, isUnlocked: true } : floor;
        }),
      },
    };

    expect(() => validateSaveDocument(
      lockedProduction,
      BASE_GAME_BALANCE,
    )).toThrow(/production while locked/);
    expect(() => validateSaveDocument(
      skippedUnlock,
      BASE_GAME_BALANCE,
    )).toThrow(/unlocked after a locked/);
  });

  it('rejects a locked first floor and an unlock without its level gate', () => {
    const document = createValidDocument();
    const lockedFirstFloor = {
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.map((floor, index) => {
          return index === 0 ? { ...floor, isUnlocked: false } : floor;
        }),
      },
    };
    const unmetLevelGate = {
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.map((floor, index) => {
          return index === 1 ? { ...floor, isUnlocked: true } : floor;
        }),
      },
    };

    expect(() => validateSaveDocument(
      lockedFirstFloor,
      BASE_GAME_BALANCE,
    )).toThrow(/must remain unlocked/);
    expect(() => validateSaveDocument(
      unmetLevelGate,
      BASE_GAME_BALANCE,
    )).toThrow(/configured unlock level/);
  });

  it('rejects unknown properties instead of persisting transient state', () => {
    const document = createValidDocument();

    expect(() => validateSaveDocument(
      { ...document, renderer: { type: 'webgl' } },
      BASE_GAME_BALANCE,
    )).toThrow(/must contain exactly/);
  });
});

function createValidDocument(): SaveDocumentV2 {
  const state = createProducingState();

  return createSaveDocument(
    state,
    BASE_GAME_BALANCE,
    state.lastUpdateTimestampMs,
  );
}

function createProducingState(): GameState {
  let state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);

  for (let second = 0; second < 5; second += 1) {
    state = advanceSimulation(state, 1_000);
  }

  return state;
}
