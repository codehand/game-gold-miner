import type { SaveDocumentV2 } from './saveSchema';

export interface ActiveSaveRepository {
  loadActiveSave(): Promise<unknown | null>;
  storeActiveSave(document: SaveDocumentV2): Promise<void>;
}
