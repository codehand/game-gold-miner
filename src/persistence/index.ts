export type { ActiveSaveRepository } from './ActiveSaveRepository';
export {
  ACTIVE_SAVE_DATABASE_NAME,
  ACTIVE_SAVE_DATABASE_VERSION,
  ACTIVE_SAVE_RECORD_ID,
  ACTIVE_SAVE_STORE_NAME,
  DexieActiveSaveRepository,
  type DexieActiveSaveRepositoryOptions,
} from './DexieActiveSaveRepository';
export {
  DEFAULT_SAVE_DEBOUNCE_MS,
  LOAD_FAILURE_MESSAGE,
  SAVE_FAILURE_MESSAGE,
  SavePersistenceCoordinator,
  type PersistenceDiagnostic,
  type PersistenceDiagnosticCode,
  type SavePersistenceCoordinatorOptions,
} from './SavePersistenceCoordinator';
export {
  CORRUPT_SAVE_WARNING_MESSAGE,
  INCOMPATIBLE_SAVE_WARNING_MESSAGE,
  loadActiveGame,
  type ActiveGameLoadResult,
  type LoadActiveGameOptions,
  type SaveRecoveryWarning,
  type SaveRecoveryWarningCode,
} from './loadActiveGame';
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
export {
  hasAnyProgress,
  reconcileGuestUpgrade,
  type GuestUpgradeCandidate,
  type GuestUpgradeDecision,
} from './guestUpgradeReconciliation';
