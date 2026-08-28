export {
  CURRENT_SAVE_SCHEMA_VERSION,
  SaveDocumentError,
  createSaveDocument,
  deserializeSaveDocument,
  migrateSaveDocument,
  validateSaveDocument,
  type LoadedSaveDocument,
  type SaveDocumentV1,
  type SerializedElevatorState,
  type SerializedGameState,
  type SerializedMineFloorState,
  type SerializedWarehouseState,
} from './saveSchema';
