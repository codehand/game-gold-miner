import type { BaseGameBalanceConfig } from '../../config';
import {
  validateSaveDocument,
  type ActiveSaveRepository,
  type SaveDocumentV1,
} from '../../persistence';

export const LIFECYCLE_SAVE_JOURNAL_KEY =
  'cat-mine-idle:lifecycle-save-v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Synchronous emergency journal for lifecycle boundaries.
 *
 * IndexedDB remains the authoritative active-save store. Browsers are allowed
 * to tear a document down before an asynchronous pagehide transaction commits,
 * so the event also records the same versioned document synchronously. The
 * journal is validated before use and removed after IndexedDB has caught up.
 */
export class WebLifecycleSaveJournal {
  readonly #storage: KeyValueStorage | null;
  readonly #config: BaseGameBalanceConfig;

  public constructor(
    storage: KeyValueStorage | null,
    config: BaseGameBalanceConfig,
  ) {
    this.#storage = storage;
    this.#config = config;
  }

  public read(): SaveDocumentV1 | null {
    if (this.#storage === null) {
      return null;
    }

    try {
      const serialized = this.#storage.getItem(LIFECYCLE_SAVE_JOURNAL_KEY);

      if (serialized === null) {
        return null;
      }

      return validateSaveDocument(JSON.parse(serialized), this.#config);
    } catch {
      this.#discard();
      return null;
    }
  }

  public write(document: SaveDocumentV1): void {
    if (this.#storage === null) {
      return;
    }

    try {
      this.#storage.setItem(
        LIFECYCLE_SAVE_JOURNAL_KEY,
        JSON.stringify(document),
      );
    } catch {
      // Best effort only. The ordinary IndexedDB flush still runs.
    }
  }

  public clearThrough(savedAtTimestampMs: number): void {
    const journalDocument = this.read();

    if (
      journalDocument !== null &&
      journalDocument.savedAtTimestampMs <= savedAtTimestampMs
    ) {
      this.#discard();
    }
  }

  #discard(): void {
    if (this.#storage === null) {
      return;
    }

    try {
      this.#storage.removeItem(LIFECYCLE_SAVE_JOURNAL_KEY);
    } catch {
      // An unavailable storage surface must not block the game.
    }
  }
}

/**
 * Recovers a newer valid lifecycle journal before normal load validation and
 * clears it only after the same-or-newer document reaches IndexedDB.
 */
export class LifecycleSafeActiveSaveRepository
implements ActiveSaveRepository {
  readonly #repository: ActiveSaveRepository;
  readonly #journal: WebLifecycleSaveJournal;
  readonly #config: BaseGameBalanceConfig;

  public constructor(
    repository: ActiveSaveRepository,
    journal: WebLifecycleSaveJournal,
    config: BaseGameBalanceConfig,
  ) {
    this.#repository = repository;
    this.#journal = journal;
    this.#config = config;
  }

  public async loadActiveSave(): Promise<unknown | null> {
    const storedCandidate = await this.#repository.loadActiveSave();
    const journalDocument = this.#journal.read();

    if (journalDocument === null) {
      return storedCandidate;
    }

    if (storedCandidate === null) {
      return journalDocument;
    }

    try {
      const storedDocument = validateSaveDocument(
        storedCandidate,
        this.#config,
      );

      return storedDocument.savedAtTimestampMs >
        journalDocument.savedAtTimestampMs
        ? storedDocument
        : journalDocument;
    } catch {
      return journalDocument;
    }
  }

  public async storeActiveSave(document: SaveDocumentV1): Promise<void> {
    await this.#repository.storeActiveSave(document);
    this.#journal.clearThrough(document.savedAtTimestampMs);
  }
}
