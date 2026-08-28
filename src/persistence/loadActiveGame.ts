import type { BaseGameBalanceConfig } from '../config';
import {
  calculateOfflineIncome,
  createInitialGameState,
  type GameState,
  type OfflineIncomeCalculation,
} from '../core';
import type { SavePersistenceCoordinator } from './SavePersistenceCoordinator';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  createSaveDocument,
  deserializeSaveDocument,
  type LoadedSaveDocument,
} from './saveSchema';

export const CORRUPT_SAVE_WARNING_MESSAGE =
  'Local progress could not be read and a fresh game was started.';
export const INCOMPATIBLE_SAVE_WARNING_MESSAGE =
  'Local progress uses an unsupported version and a fresh game was started.';

export type SaveRecoveryWarningCode =
  | 'corrupt-save'
  | 'incompatible-save';

export interface SaveRecoveryWarning {
  readonly code: SaveRecoveryWarningCode;
  readonly message: string;
  readonly cause: unknown;
  readonly preservedPayload: unknown | null;
}

export type ActiveGameLoadResult =
  | {
      readonly source: 'saved';
      readonly state: GameState;
      readonly loadedSave: LoadedSaveDocument;
      readonly offlineIncome: OfflineIncomeCalculation;
      readonly offlineIncomeSettlementPersisted: boolean;
      readonly warning: null;
    }
  | {
      readonly source: 'fresh';
      readonly state: GameState;
      readonly loadedSave: null;
      readonly offlineIncome: null;
      readonly offlineIncomeSettlementPersisted: null;
      readonly warning: SaveRecoveryWarning | null;
    };

export interface LoadActiveGameOptions {
  readonly onWarning?: (warning: SaveRecoveryWarning) => void;
}

export async function loadActiveGame(
  persistence: Pick<
    SavePersistenceCoordinator,
    'flush' | 'loadActiveSave' | 'queueSave'
  >,
  config: BaseGameBalanceConfig,
  currentTimestampMs: number,
  options: LoadActiveGameOptions = {},
): Promise<ActiveGameLoadResult> {
  const candidate = await persistence.loadActiveSave();

  if (candidate === null) {
    return createFreshResult(config, currentTimestampMs, null);
  }

  let loadedSave: LoadedSaveDocument;

  try {
    loadedSave = deserializeSaveDocument(candidate, config);
  } catch (cause) {
    const incompatible = hasUnsupportedSchemaVersion(candidate);
    const warning: SaveRecoveryWarning = {
      code: incompatible ? 'incompatible-save' : 'corrupt-save',
      message: incompatible
        ? INCOMPATIBLE_SAVE_WARNING_MESSAGE
        : CORRUPT_SAVE_WARNING_MESSAGE,
      cause,
      preservedPayload: preservePayload(candidate),
    };

    reportWarning(options.onWarning, warning);

    return createFreshResult(config, currentTimestampMs, warning);
  }

  const offlineIncome = calculateOfflineIncome(
    loadedSave.state,
    loadedSave.savedAtTimestampMs,
    currentTimestampMs,
    loadedSave.effectiveProductionRatePerSecond,
    config.offlineIncome,
  );
  const settledDocument = createSaveDocument(
    offlineIncome.state,
    config,
    currentTimestampMs,
  );

  persistence.queueSave(settledDocument);
  const offlineIncomeSettlementPersisted = await persistence.flush();
  const availableOfflineIncome = offlineIncomeSettlementPersisted
    ? offlineIncome
    : {
        ...offlineIncome,
        reward: offlineIncome.reward.multiply(0),
      };

  return {
    source: 'saved',
    state: offlineIncome.state,
    loadedSave,
    offlineIncome: availableOfflineIncome,
    offlineIncomeSettlementPersisted,
    warning: null,
  };
}

function createFreshResult(
  config: BaseGameBalanceConfig,
  currentTimestampMs: number,
  warning: SaveRecoveryWarning | null,
): Extract<ActiveGameLoadResult, { source: 'fresh' }> {
  return {
    source: 'fresh',
    state: createInitialGameState(config, currentTimestampMs),
    loadedSave: null,
    offlineIncome: null,
    offlineIncomeSettlementPersisted: null,
    warning,
  };
}

function hasUnsupportedSchemaVersion(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }

  if (!Object.hasOwn(candidate, 'schemaVersion')) {
    return false;
  }

  return Reflect.get(candidate, 'schemaVersion') !== CURRENT_SAVE_SCHEMA_VERSION;
}

function preservePayload(candidate: unknown): unknown | null {
  try {
    return structuredClone(candidate);
  } catch {
    return null;
  }
}

function reportWarning(
  listener: LoadActiveGameOptions['onWarning'],
  warning: SaveRecoveryWarning,
): void {
  try {
    listener?.(warning);
  } catch {
    // A presentation callback must not prevent automatic save recovery.
  }
}
