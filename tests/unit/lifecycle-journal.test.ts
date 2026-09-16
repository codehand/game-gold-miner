import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { catchUpSimulation, createInitialGameState } from '../../src/core';
import {
  createSaveDocument,
  type ActiveSaveRepository,
  type SaveDocumentV2,
} from '../../src/persistence';
import {
  LIFECYCLE_SAVE_JOURNAL_KEY,
  LifecycleSafeActiveSaveRepository,
  WebLifecycleSaveJournal,
  type KeyValueStorage,
} from '../../src/platform/web';

const START_TIMESTAMP_MS = 1_788_318_000_000;

describe('web lifecycle save journal', () => {
  it('round-trips a valid document and discards malformed payloads', () => {
    const storage = new MemoryKeyValueStorage();
    const journal = new WebLifecycleSaveJournal(
      storage,
      BASE_GAME_BALANCE,
    );
    const document = createDocument(10_000);

    journal.write(document);
    expect(journal.read()).toEqual(document);

    storage.setItem(LIFECYCLE_SAVE_JOURNAL_KEY, '{malformed');
    expect(journal.read()).toBeNull();
    expect(storage.getItem(LIFECYCLE_SAVE_JOURNAL_KEY)).toBeNull();
  });

  it('degrades to the ordinary IndexedDB path when storage is unavailable', () => {
    const journal = new WebLifecycleSaveJournal(null, BASE_GAME_BALANCE);

    expect(() => journal.write(createDocument(10_000))).not.toThrow();
    expect(journal.read()).toBeNull();
    expect(() => journal.clearThrough(START_TIMESTAMP_MS)).not.toThrow();
  });

  it('recovers the newer journal and clears it after IndexedDB catches up', async () => {
    const storage = new MemoryKeyValueStorage();
    const journal = new WebLifecycleSaveJournal(
      storage,
      BASE_GAME_BALANCE,
    );
    const indexedRepository = new MemoryActiveSaveRepository();
    const olderDocument = createDocument(10_000);
    const lifecycleDocument = createDocument(20_000);

    indexedRepository.document = olderDocument;
    journal.write(lifecycleDocument);

    const repository = new LifecycleSafeActiveSaveRepository(
      indexedRepository,
      journal,
      BASE_GAME_BALANCE,
    );

    await expect(repository.loadActiveSave()).resolves.toEqual(
      lifecycleDocument,
    );
    await repository.storeActiveSave(lifecycleDocument);

    expect(indexedRepository.document).toEqual(lifecycleDocument);
    expect(journal.read()).toBeNull();
  });

  it('clear() discards the journal unconditionally, unlike clearThrough against an older timestamp', () => {
    // A 2026-09-13 review finding: a cloud-save adopt cannot use
    // `clearThrough` safely, because the adopted document carries another
    // device's clock — a journal entry written earlier in this session
    // (e.g. a `visibilitychange`→hidden while the player backgrounds the
    // tab during boot) can read as chronologically newer than the adopted
    // document and survive `clearThrough`, then win on the next boot.
    const storage = new MemoryKeyValueStorage();
    const journal = new WebLifecycleSaveJournal(storage, BASE_GAME_BALANCE);
    const journalDocument = createDocument(20_000);
    journal.write(journalDocument);

    // Simulates a remote adopt: the remote document's own `savedAtTimestampMs`
    // (another device's clock, here the session's own start time) is older
    // than the local journal entry written moments ago in this session, so
    // `clearThrough` correctly — but unhelpfully, for this case — leaves it.
    journal.clearThrough(START_TIMESTAMP_MS);
    expect(journal.read()).toEqual(journalDocument);

    journal.clear();
    expect(journal.read()).toBeNull();
  });

  it('clear() is a no-op, not a throw, when storage is unavailable', () => {
    const journal = new WebLifecycleSaveJournal(null, BASE_GAME_BALANCE);
    expect(() => journal.clear()).not.toThrow();
  });

  it('keeps a newer valid IndexedDB document over a stale journal', async () => {
    const storage = new MemoryKeyValueStorage();
    const journal = new WebLifecycleSaveJournal(
      storage,
      BASE_GAME_BALANCE,
    );
    const indexedRepository = new MemoryActiveSaveRepository();
    const lifecycleDocument = createDocument(10_000);
    const newerDocument = createDocument(20_000);

    indexedRepository.document = newerDocument;
    journal.write(lifecycleDocument);

    const repository = new LifecycleSafeActiveSaveRepository(
      indexedRepository,
      journal,
      BASE_GAME_BALANCE,
    );

    await expect(repository.loadActiveSave()).resolves.toEqual(newerDocument);
  });
});

function createDocument(elapsedMs: number): SaveDocumentV2 {
  const initialState = createInitialGameState(
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS,
  );
  const state = catchUpSimulation(initialState, elapsedMs);

  return createSaveDocument(
    state,
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS + elapsedMs,
  );
}

class MemoryKeyValueStorage implements KeyValueStorage {
  readonly #values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  public removeItem(key: string): void {
    this.#values.delete(key);
  }
}

class MemoryActiveSaveRepository implements ActiveSaveRepository {
  public document: SaveDocumentV2 | null = null;

  public async loadActiveSave(): Promise<unknown | null> {
    return this.document;
  }

  public async storeActiveSave(document: SaveDocumentV2): Promise<void> {
    this.document = document;
  }
}
