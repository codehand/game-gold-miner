import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { simulateEconomyProgression } from '../../src/core';
import {
  ACTIVE_SAVE_DATABASE_VERSION,
  ACTIVE_SAVE_RECORD_ID,
  ACTIVE_SAVE_STORE_NAME,
  DexieActiveSaveRepository,
  LOAD_FAILURE_MESSAGE,
  SAVE_FAILURE_MESSAGE,
  SavePersistenceCoordinator,
  createSaveDocument,
  deserializeSaveDocument,
  type ActiveSaveRepository,
  type PersistenceDiagnostic,
  type SaveDocumentV1,
} from '../../src/persistence';
import { bindSaveLifecycle } from '../../src/platform/web';

const TIMESTAMP_MS = 1_788_000_000_000;
let databaseSequence = 0;
const repositoriesToDelete: DexieActiveSaveRepository[] = [];

afterEach(async () => {
  vi.useRealTimers();

  for (const repository of repositoriesToDelete.splice(0)) {
    await repository.deleteDatabase();
  }
});

describe('IndexedDB active-save persistence', () => {
  it('defines one versioned active-save store and record identifier', () => {
    expect(ACTIVE_SAVE_DATABASE_VERSION).toBe(1);
    expect(ACTIVE_SAVE_STORE_NAME).toBe('saves');
    expect(ACTIVE_SAVE_RECORD_ID).toBe('active');
  });

  it('restores the complete save exactly after a database reopen', async () => {
    const databaseName = nextDatabaseName();
    const document = createProgressedDocument();
    const expected = deserializeSaveDocument(document, BASE_GAME_BALANCE);
    const firstRepository = createRepository(databaseName);

    await firstRepository.storeActiveSave(document);
    firstRepository.close();

    const reloadedRepository = createRepository(databaseName);
    repositoriesToDelete.push(reloadedRepository);
    const stored = await reloadedRepository.loadActiveSave();
    const restored = deserializeSaveDocument(stored, BASE_GAME_BALANCE);

    expect(restored.savedAtTimestampMs).toBe(expected.savedAtTimestampMs);
    expect(restored.state.gold.equals(expected.state.gold)).toBe(true);
    expect(restored.state.lastUpdateTimestampMs).toBe(
      expected.state.lastUpdateTimestampMs,
    );
    expect(restored.state.floors.map(({ isUnlocked }) => isUnlocked)).toEqual(
      expected.state.floors.map(({ isUnlocked }) => isUnlocked),
    );
    expect(
      restored.state.floors.map(({ mineShaftLevel }) => mineShaftLevel),
    ).toEqual(
      expected.state.floors.map(({ mineShaftLevel }) => mineShaftLevel),
    );
    expect(
      restored.state.floors.map(({ materialQueue }) =>
        materialQueue.serialize()),
    ).toEqual(
      expected.state.floors.map(({ materialQueue }) =>
        materialQueue.serialize()),
    );
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(expected.state));
  });

  it('overwrites the single active record with the newest save', async () => {
    const repository = createRepository(nextDatabaseName());
    repositoriesToDelete.push(repository);
    const first = createProgressedDocument(60_000);
    const second = createProgressedDocument(120_000);

    await repository.storeActiveSave(first);
    await repository.storeActiveSave(second);

    expect(await repository.loadActiveSave()).toEqual(second);
  });

  it('returns null when no active save exists', async () => {
    const repository = createRepository(nextDatabaseName());
    repositoriesToDelete.push(repository);

    expect(await repository.loadActiveSave()).toBeNull();
  });
});

describe('save persistence coordination', () => {
  it('debounces routine writes and stores only the newest queued document', async () => {
    vi.useFakeTimers();
    const repository = new MemoryActiveSaveRepository();
    const coordinator = new SavePersistenceCoordinator(repository, {
      debounceMs: 500,
    });
    const first = createProgressedDocument(60_000);
    const second = createProgressedDocument(120_000);

    coordinator.queueSave(first);
    coordinator.queueSave(second);
    await vi.advanceTimersByTimeAsync(499);
    expect(repository.storedDocuments).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(repository.storedDocuments).toEqual([second]);
  });

  it('forces the current document on hidden and page-hide lifecycle events', async () => {
    const repository = new MemoryActiveSaveRepository();
    const coordinator = new SavePersistenceCoordinator(repository, {
      debounceMs: 60_000,
    });
    const page = new FakeLifecycleTarget();
    const visibility = new FakeVisibilityTarget();
    const document = createProgressedDocument();
    const unbind = bindSaveLifecycle(
      coordinator,
      () => document,
      { page, visibility },
    );

    visibility.visibilityState = 'visible';
    visibility.dispatch('visibilitychange');
    await coordinator.flush();
    expect(repository.storedDocuments).toEqual([]);

    visibility.visibilityState = 'hidden';
    visibility.dispatch('visibilitychange');
    await coordinator.flush();
    expect(repository.storedDocuments).toEqual([document]);

    page.dispatch('pagehide');
    await coordinator.flush();
    expect(repository.storedDocuments).toEqual([document, document]);

    unbind();
    page.dispatch('pagehide');
    await coordinator.flush();
    expect(repository.storedDocuments).toHaveLength(2);
  });

  it('keeps the session running, reports save failure, and permits retry', async () => {
    const repository = new MemoryActiveSaveRepository();
    repository.failWrites = true;
    const diagnostics: PersistenceDiagnostic[] = [];
    const coordinator = new SavePersistenceCoordinator(repository, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const document = createProgressedDocument();
    const serializedBefore = JSON.stringify(document);

    coordinator.queueSave(document);
    await expect(coordinator.flush()).resolves.toBe(false);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'save-failed',
      message: SAVE_FAILURE_MESSAGE,
    });
    expect(coordinator.lastDiagnostic).toBe(diagnostics[0]);
    expect(JSON.stringify(document)).toBe(serializedBefore);

    repository.failWrites = false;
    await expect(coordinator.flush()).resolves.toBe(true);
    expect(repository.storedDocuments).toEqual([document]);
  });

  it('returns no save and emits a visible diagnostic when loading fails', async () => {
    const repository = new MemoryActiveSaveRepository();
    repository.failLoads = true;
    const diagnostics: PersistenceDiagnostic[] = [];
    const coordinator = new SavePersistenceCoordinator(repository, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    await expect(coordinator.loadActiveSave()).resolves.toBeNull();
    expect(diagnostics[0]).toMatchObject({
      code: 'load-failed',
      message: LOAD_FAILURE_MESSAGE,
    });

    coordinator.clearDiagnostic();
    expect(coordinator.lastDiagnostic).toBeNull();
  });

  it('rejects invalid debounce durations', () => {
    const repository = new MemoryActiveSaveRepository();

    expect(() => new SavePersistenceCoordinator(repository, {
      debounceMs: -1,
    })).toThrow(/debounce/);
    expect(() => new SavePersistenceCoordinator(repository, {
      debounceMs: 1.5,
    })).toThrow(/debounce/);
  });
});

class MemoryActiveSaveRepository implements ActiveSaveRepository {
  public readonly storedDocuments: SaveDocumentV1[] = [];
  public failLoads = false;
  public failWrites = false;

  public async loadActiveSave(): Promise<unknown | null> {
    if (this.failLoads) {
      throw new Error('Simulated read failure.');
    }

    return this.storedDocuments.at(-1) ?? null;
  }

  public async storeActiveSave(document: SaveDocumentV1): Promise<void> {
    if (this.failWrites) {
      throw new Error('Simulated write failure.');
    }

    this.storedDocuments.push(document);
  }
}

class FakeLifecycleTarget {
  readonly #listeners = new Map<string, Set<() => void>>();

  public addEventListener(type: string, listener: () => void): void {
    const listeners = this.#listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: () => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  public dispatch(type: string): void {
    this.#listeners.get(type)?.forEach((listener) => listener());
  }
}

class FakeVisibilityTarget extends FakeLifecycleTarget {
  public visibilityState = 'visible';
}

function createRepository(databaseName: string): DexieActiveSaveRepository {
  return new DexieActiveSaveRepository({
    databaseName,
    dexieOptions: { indexedDB, IDBKeyRange },
  });
}

function nextDatabaseName(): string {
  databaseSequence += 1;
  return `cat-mine-idle-test-${databaseSequence}`;
}

function createProgressedDocument(durationMs = 350_000): SaveDocumentV1 {
  const state = simulateEconomyProgression(durationMs, TIMESTAMP_MS).state;

  return createSaveDocument(
    state,
    BASE_GAME_BALANCE,
    state.lastUpdateTimestampMs,
  );
}
