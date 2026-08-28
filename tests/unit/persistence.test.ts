import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  claimOfflineReward,
  createPendingOfflineReward,
  simulateEconomyProgression,
} from '../../src/core';
import {
  ACTIVE_SAVE_DATABASE_VERSION,
  ACTIVE_SAVE_RECORD_ID,
  ACTIVE_SAVE_STORE_NAME,
  CORRUPT_SAVE_WARNING_MESSAGE,
  DexieActiveSaveRepository,
  INCOMPATIBLE_SAVE_WARNING_MESSAGE,
  LOAD_FAILURE_MESSAGE,
  SAVE_FAILURE_MESSAGE,
  SavePersistenceCoordinator,
  createSaveDocument,
  deserializeSaveDocument,
  loadActiveGame,
  type ActiveSaveRepository,
  type ActiveGameLoadResult,
  type PersistenceDiagnostic,
  type SaveDocumentV1,
  type SaveRecoveryWarning,
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

  it('keeps persistence failures recoverable when a diagnostic callback throws', async () => {
    const repository = new MemoryActiveSaveRepository();
    repository.failLoads = true;
    repository.failWrites = true;
    const coordinator = new SavePersistenceCoordinator(repository, {
      onDiagnostic: () => {
        throw new Error('Simulated presentation failure.');
      },
    });

    await expect(coordinator.loadActiveSave()).resolves.toBeNull();
    coordinator.queueSave(createProgressedDocument());
    await expect(coordinator.flush()).resolves.toBe(false);

    repository.failWrites = false;
    await expect(coordinator.flush()).resolves.toBe(true);
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

describe('corrupt and incompatible save recovery', () => {
  it('restores a valid save without a recovery warning', async () => {
    const document = createProgressedDocument();
    const repository = new MemoryActiveSaveRepository();
    repository.storedDocuments.push(document);
    const coordinator = new SavePersistenceCoordinator(repository);
    const result = await loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      document.savedAtTimestampMs,
    );

    expectSavedLoad(result);
    expect(result.warning).toBeNull();
    expect(result.offlineIncome.reward.equals(0)).toBe(true);
    expect(result.offlineIncomeSettlementPersisted).toBe(true);
    expect(result.loadedSave?.savedAtTimestampMs).toBe(
      document.savedAtTimestampMs,
    );
    expect(JSON.stringify(result.state)).toBe(
      JSON.stringify(result.loadedSave?.state),
    );
  });

  it('starts a playable fresh game and preserves malformed data for diagnostics', async () => {
    const malformedPayload = {
      schemaVersion: 1,
      state: { gold: 'not-a-number' },
    };
    const repository = new MemoryActiveSaveRepository();
    repository.loadedValue = malformedPayload;
    const coordinator = new SavePersistenceCoordinator(repository);
    const warnings: SaveRecoveryWarning[] = [];
    const result = await loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
      { onWarning: (warning) => warnings.push(warning) },
    );

    expect(result.source).toBe('fresh');
    expect(result.loadedSave).toBeNull();
    expect(result.warning).toMatchObject({
      code: 'corrupt-save',
      message: CORRUPT_SAVE_WARNING_MESSAGE,
      preservedPayload: malformedPayload,
    });
    expect(warnings).toEqual([result.warning]);
    expect(result.state.lastUpdateTimestampMs).toBe(TIMESTAMP_MS);
    expect(result.state.gold.serialize()).toBe(
      String(BASE_GAME_BALANCE.startingGold),
    );
    expect(result.state.floors[0].isUnlocked).toBe(true);
    expect(result.state.floors.slice(1).every((floor) => !floor.isUnlocked))
      .toBe(true);
    expect(result.warning?.preservedPayload).not.toBe(malformedPayload);
  });

  it('starts fresh and records an incompatible-version warning', async () => {
    const unsupportedPayload = {
      ...createProgressedDocument(),
      schemaVersion: 2,
    };
    const repository = new MemoryActiveSaveRepository();
    repository.loadedValue = unsupportedPayload;
    const coordinator = new SavePersistenceCoordinator(repository);
    const result = await loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );

    expect(result.source).toBe('fresh');
    expect(result.warning).toMatchObject({
      code: 'incompatible-save',
      message: INCOMPATIBLE_SAVE_WARNING_MESSAGE,
      preservedPayload: unsupportedPayload,
    });
    expect(result.state.lastUpdateTimestampMs).toBe(TIMESTAMP_MS);
  });

  it('returns fresh state without warning when no active save exists', async () => {
    const repository = new MemoryActiveSaveRepository();
    const coordinator = new SavePersistenceCoordinator(repository);
    const result = await loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );

    expect(result.source).toBe('fresh');
    expect(result.warning).toBeNull();
    expect(result.offlineIncome).toBeNull();
    expect(result.offlineIncomeSettlementPersisted).toBeNull();
    expect(result.state.lastUpdateTimestampMs).toBe(TIMESTAMP_MS);
  });

  it('settles offline time before returning and cannot reward it twice', async () => {
    const document = createProgressedDocument();
    const repository = new MemoryActiveSaveRepository();
    repository.storedDocuments.push(document);
    const currentTimestampMs = document.savedAtTimestampMs + 60 * 60 * 1_000;
    const firstCoordinator = new SavePersistenceCoordinator(repository);
    const firstLoad = await loadActiveGame(
      firstCoordinator,
      BASE_GAME_BALANCE,
      currentTimestampMs,
    );

    expectSavedLoad(firstLoad);
    expect(firstLoad.offlineIncome.reward.equals(
      firstLoad.loadedSave.effectiveProductionRatePerSecond
        .multiply(60 * 60)
        .multiply(0.5),
    )).toBe(true);
    expect(firstLoad.state.gold.equals(firstLoad.loadedSave.state.gold)).toBe(
      true,
    );
    expect(firstLoad.state.lastUpdateTimestampMs).toBe(currentTimestampMs);
    expect(repository.storedDocuments.at(-1)?.savedAtTimestampMs).toBe(
      currentTimestampMs,
    );

    const secondCoordinator = new SavePersistenceCoordinator(repository);
    const secondLoad = await loadActiveGame(
      secondCoordinator,
      BASE_GAME_BALANCE,
      currentTimestampMs,
    );

    expectSavedLoad(secondLoad);
    expect(secondLoad.offlineIncome.elapsedDurationMs).toBe(0);
    expect(secondLoad.offlineIncome.reward.equals(0)).toBe(true);
  });

  it('persists one exact claim and reloads without recreating the reward', async () => {
    const document = createProgressedDocument();
    const repository = new MemoryActiveSaveRepository();
    repository.storedDocuments.push(document);
    const currentTimestampMs = document.savedAtTimestampMs + 60 * 60 * 1_000;
    const coordinator = new SavePersistenceCoordinator(repository);
    const loaded = await loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      currentTimestampMs,
    );

    expectSavedLoad(loaded);
    const pendingReward = createPendingOfflineReward(loaded.offlineIncome);
    const claim = claimOfflineReward(loaded.state, pendingReward);

    expect(claim.status).toBe('claimed');
    coordinator.queueSave(createSaveDocument(
      claim.state,
      BASE_GAME_BALANCE,
      currentTimestampMs,
    ));
    await expect(coordinator.flush()).resolves.toBe(true);

    const repeatedClaim = claimOfflineReward(
      claim.state,
      claim.pendingReward,
    );
    expect(repeatedClaim.status).toBe('no-pending-reward');
    expect(repeatedClaim.state.gold.equals(claim.state.gold)).toBe(true);

    const reloaded = await loadActiveGame(
      new SavePersistenceCoordinator(repository),
      BASE_GAME_BALANCE,
      currentTimestampMs,
    );
    expectSavedLoad(reloaded);
    expect(reloaded.state.gold.equals(claim.state.gold)).toBe(true);
    expect(reloaded.offlineIncome.reward.equals(0)).toBe(true);
    expect(createPendingOfflineReward(reloaded.offlineIncome)).toBeNull();
  });

  it('withholds offline income when its timestamp settlement cannot persist', async () => {
    const document = createProgressedDocument();
    const repository = new MemoryActiveSaveRepository();
    repository.storedDocuments.push(document);
    repository.failWrites = true;
    const coordinator = new SavePersistenceCoordinator(repository);
    const result = await loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      document.savedAtTimestampMs + 60 * 60 * 1_000,
    );

    expectSavedLoad(result);
    expect(result.offlineIncome.elapsedDurationMs).toBe(3_600_000);
    expect(result.offlineIncome.reward.equals(0)).toBe(true);
    expect(result.offlineIncomeSettlementPersisted).toBe(false);
    expect(coordinator.lastDiagnostic?.code).toBe('save-failed');
    expect(repository.storedDocuments).toEqual([document]);
  });

  it('replaces a future save timestamp with now without awarding income', async () => {
    const document = createProgressedDocument();
    const repository = new MemoryActiveSaveRepository();
    repository.storedDocuments.push(document);
    const currentTimestampMs = document.savedAtTimestampMs - 1_000;
    const coordinator = new SavePersistenceCoordinator(repository);
    const result = await loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      currentTimestampMs,
    );

    expectSavedLoad(result);
    expect(result.offlineIncome.elapsedDurationMs).toBe(0);
    expect(result.offlineIncome.reward.equals(0)).toBe(true);
    expect(result.state.lastUpdateTimestampMs).toBe(currentTimestampMs);
    expect(repository.storedDocuments.at(-1)?.savedAtTimestampMs).toBe(
      currentTimestampMs,
    );
    expect(
      repository.storedDocuments.at(-1)?.state.lastUpdateTimestampMs,
    ).toBe(currentTimestampMs);
  });

  it('does not let a warning callback block corrupt-save recovery', async () => {
    const repository = new MemoryActiveSaveRepository();
    repository.loadedValue = { schemaVersion: 1 };
    const coordinator = new SavePersistenceCoordinator(repository);

    await expect(loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
      {
        onWarning: () => {
          throw new Error('Simulated warning presentation failure.');
        },
      },
    )).resolves.toMatchObject({
      source: 'fresh',
      warning: { code: 'corrupt-save' },
    });
  });

  it('omits an unsafe payload from diagnostics while still starting fresh', async () => {
    const repository = new MemoryActiveSaveRepository();
    repository.loadedValue = {
      schemaVersion: 1,
      unsafeValue: () => undefined,
    };
    const coordinator = new SavePersistenceCoordinator(repository);
    const result = await loadActiveGame(
      coordinator,
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );

    expect(result.source).toBe('fresh');
    expect(result.warning?.code).toBe('corrupt-save');
    expect(result.warning?.preservedPayload).toBeNull();
    expect(result.state.floors[0].isUnlocked).toBe(true);
  });
});

class MemoryActiveSaveRepository implements ActiveSaveRepository {
  public readonly storedDocuments: SaveDocumentV1[] = [];
  public failLoads = false;
  public failWrites = false;
  public loadedValue: unknown | null | undefined;

  public async loadActiveSave(): Promise<unknown | null> {
    if (this.failLoads) {
      throw new Error('Simulated read failure.');
    }

    return this.loadedValue === undefined
      ? this.storedDocuments.at(-1) ?? null
      : this.loadedValue;
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

function expectSavedLoad(
  result: ActiveGameLoadResult,
): asserts result is Extract<ActiveGameLoadResult, { source: 'saved' }> {
  expect(result.source).toBe('saved');

  if (result.source !== 'saved') {
    throw new Error('Expected a restored save.');
  }
}
