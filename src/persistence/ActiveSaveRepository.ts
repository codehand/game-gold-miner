import type { SaveDocumentV2 } from './saveSchema';

export interface ActiveSaveRepository<TDocument = SaveDocumentV2> {
  loadActiveSave(): Promise<unknown | null>;
  storeActiveSave(document: TDocument): Promise<void>;
}
