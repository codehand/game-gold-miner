import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  advanceSimulation,
  calculateMineProductionRates,
  createInitialGameState,
  type GameState,
} from '../../src/core';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SaveDocumentError,
  createSaveDocument,
  deserializeSaveDocument,
  migrateSaveDocument,
  validateSaveDocument,
  type SaveDocumentV1,
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
    expect(document.state.floors).toHaveLength(4);
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

  it('routes the current version through the migration entry point unchanged', () => {
    const document = createValidDocument();

    expect(migrateSaveDocument(document)).toBe(document);
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
      schemaVersion: 2,
    })).toThrow(/Unsupported save schema version 2/);
  });

  it.each([
    ['rate snapshot', (document: SaveDocumentV1) => ({
      ...document,
      effectiveProductionRatePerSecond: 'not-a-number',
    })],
    ['gold', (document: SaveDocumentV1) => ({
      ...document,
      state: { ...document.state, gold: 'Infinity' },
    })],
    ['numeric gold instead of a string', (document: SaveDocumentV1) => ({
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
        floors: document.state.floors.slice(0, 3),
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
    )).toThrow(/exactly 4 floors/);
  });

  it.each([
    ['floor material', (document: SaveDocumentV1) => ({
      ...document,
      state: {
        ...document.state,
        floors: document.state.floors.map((floor, index) => {
          return index === 0 ? { ...floor, materialQueue: '-1' } : floor;
        }),
      },
    })],
    ['elevator carried material', (document: SaveDocumentV1) => ({
      ...document,
      state: {
        ...document.state,
        elevator: { ...document.state.elevator, carriedMaterial: '-1' },
      },
    })],
    ['warehouse input', (document: SaveDocumentV1) => ({
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

function createValidDocument(): SaveDocumentV1 {
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
