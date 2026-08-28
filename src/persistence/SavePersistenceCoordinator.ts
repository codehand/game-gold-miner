import type { ActiveSaveRepository } from './ActiveSaveRepository';
import type { SaveDocumentV1 } from './saveSchema';

export const DEFAULT_SAVE_DEBOUNCE_MS = 500;
export const SAVE_FAILURE_MESSAGE =
  'Unable to save progress locally. Your current session will continue.';
export const LOAD_FAILURE_MESSAGE =
  'Unable to load local progress. Your current session will continue.';

export type PersistenceDiagnosticCode = 'load-failed' | 'save-failed';

export interface PersistenceDiagnostic {
  readonly code: PersistenceDiagnosticCode;
  readonly message: string;
  readonly cause: unknown;
}

export interface SavePersistenceCoordinatorOptions {
  readonly debounceMs?: number;
  readonly onDiagnostic?: (diagnostic: PersistenceDiagnostic) => void;
}

export class SavePersistenceCoordinator {
  readonly #repository: ActiveSaveRepository;
  readonly #debounceMs: number;
  readonly #onDiagnostic: ((diagnostic: PersistenceDiagnostic) => void) | null;
  #pendingDocument: SaveDocumentV1 | null = null;
  #scheduledSave: ReturnType<typeof setTimeout> | null = null;
  #flushPromise: Promise<boolean> | null = null;
  #lastDiagnostic: PersistenceDiagnostic | null = null;

  public constructor(
    repository: ActiveSaveRepository,
    options: SavePersistenceCoordinatorOptions = {},
  ) {
    this.#repository = repository;
    this.#debounceMs = options.debounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS;
    this.#onDiagnostic = options.onDiagnostic ?? null;

    if (!Number.isSafeInteger(this.#debounceMs) || this.#debounceMs < 0) {
      throw new Error('Save debounce must be a non-negative safe integer.');
    }
  }

  public get lastDiagnostic(): PersistenceDiagnostic | null {
    return this.#lastDiagnostic;
  }

  public queueSave(document: SaveDocumentV1): void {
    this.#pendingDocument = document;
    this.#clearScheduledSave();
    this.#scheduledSave = setTimeout(() => {
      this.#scheduledSave = null;
      void this.flush();
    }, this.#debounceMs);
  }

  public async flush(): Promise<boolean> {
    this.#clearScheduledSave();

    if (this.#flushPromise !== null) {
      const currentFlushSucceeded = await this.#flushPromise;

      if (!currentFlushSucceeded) {
        return false;
      }

      return this.flush();
    }

    const document = this.#pendingDocument;

    if (document === null) {
      return true;
    }

    this.#pendingDocument = null;
    this.#flushPromise = this.#store(document);
    const succeeded = await this.#flushPromise;
    this.#flushPromise = null;

    if (!succeeded) {
      if (this.#pendingDocument === null) {
        this.#pendingDocument = document;
      }

      return false;
    }

    return this.#pendingDocument === null ? true : this.flush();
  }

  public async loadActiveSave(): Promise<unknown | null> {
    try {
      return await this.#repository.loadActiveSave();
    } catch (cause) {
      this.#reportDiagnostic({
        code: 'load-failed',
        message: LOAD_FAILURE_MESSAGE,
        cause,
      });
      return null;
    }
  }

  public clearDiagnostic(): void {
    this.#lastDiagnostic = null;
  }

  public cancelScheduledSave(): void {
    this.#clearScheduledSave();
    this.#pendingDocument = null;
  }

  async #store(document: SaveDocumentV1): Promise<boolean> {
    try {
      await this.#repository.storeActiveSave(document);
      return true;
    } catch (cause) {
      this.#reportDiagnostic({
        code: 'save-failed',
        message: SAVE_FAILURE_MESSAGE,
        cause,
      });
      return false;
    }
  }

  #reportDiagnostic(diagnostic: PersistenceDiagnostic): void {
    this.#lastDiagnostic = diagnostic;

    try {
      this.#onDiagnostic?.(diagnostic);
    } catch {
      // Diagnostics are best-effort and must never interrupt persistence.
    }
  }

  #clearScheduledSave(): void {
    if (this.#scheduledSave !== null) {
      clearTimeout(this.#scheduledSave);
      this.#scheduledSave = null;
    }
  }
}
