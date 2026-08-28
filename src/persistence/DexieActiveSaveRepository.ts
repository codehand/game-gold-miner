import Dexie, {
  type DexieOptions,
  type EntityTable,
} from 'dexie';

import type { ActiveSaveRepository } from './ActiveSaveRepository';
import type { SaveDocumentV1 } from './saveSchema';

export const ACTIVE_SAVE_DATABASE_NAME = 'cat-mine-idle';
export const ACTIVE_SAVE_DATABASE_VERSION = 1;
export const ACTIVE_SAVE_STORE_NAME = 'saves';
export const ACTIVE_SAVE_RECORD_ID = 'active';

interface ActiveSaveRecord {
  readonly id: typeof ACTIVE_SAVE_RECORD_ID;
  readonly document: SaveDocumentV1;
}

class ActiveSaveDatabase extends Dexie {
  public readonly saves!: EntityTable<ActiveSaveRecord, 'id'>;

  public constructor(databaseName: string, options?: DexieOptions) {
    super(databaseName, options);
    this.version(ACTIVE_SAVE_DATABASE_VERSION).stores({
      [ACTIVE_SAVE_STORE_NAME]: 'id',
    });
  }
}

export interface DexieActiveSaveRepositoryOptions {
  readonly databaseName?: string;
  readonly dexieOptions?: DexieOptions;
}

export class DexieActiveSaveRepository implements ActiveSaveRepository {
  readonly #database: ActiveSaveDatabase;

  public constructor(options: DexieActiveSaveRepositoryOptions = {}) {
    this.#database = new ActiveSaveDatabase(
      options.databaseName ?? ACTIVE_SAVE_DATABASE_NAME,
      options.dexieOptions,
    );
  }

  public async loadActiveSave(): Promise<unknown | null> {
    const record = await this.#database.saves.get(ACTIVE_SAVE_RECORD_ID);

    return record?.document ?? null;
  }

  public async storeActiveSave(document: SaveDocumentV1): Promise<void> {
    await this.#database.saves.put({
      id: ACTIVE_SAVE_RECORD_ID,
      document,
    });
  }

  public close(): void {
    this.#database.close();
  }

  public async deleteDatabase(): Promise<void> {
    await this.#database.delete();
  }
}
