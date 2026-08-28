import type { SaveDocumentV1 } from './saveSchema';

export interface ActiveSaveRepository {
  loadActiveSave(): Promise<unknown | null>;
  storeActiveSave(document: SaveDocumentV1): Promise<void>;
}
