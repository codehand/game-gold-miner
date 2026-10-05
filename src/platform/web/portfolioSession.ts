import {
  createCatProductionModifiers,
  createEmptyCatRoster,
  createInitialPortfolio,
  EMPTY_BOOST_STATE,
  enterMine,
  previewMineOfflineGrant,
  suspendActiveMine,
  type CatRosterState,
  type BoostState,
  type MineEnterResult,
  type OfflineGrant,
  type PortfolioState,
} from '../../core';
import {
  commitPortfolio,
  deserializePortfolioSaveDocument,
  type ActiveSaveRepository,
  type PortfolioSaveDocumentV4,
} from '../../persistence';
import { LIFECYCLE_SAVE_JOURNAL_KEY, type KeyValueStorage } from './WebLifecycleSaveJournal';

export type PortfolioSessionLoadResult =
  | {
      readonly status: 'fresh';
      readonly portfolio: PortfolioState;
      readonly catRoster: CatRosterState;
      readonly pendingGrant: null;
    }
  | {
      readonly status: 'saved';
      readonly portfolio: PortfolioState;
      readonly catRoster: CatRosterState;
      readonly pendingGrant: OfflineGrant;
    }
  | {
      readonly status: 'corrupt';
      readonly candidates: readonly unknown[];
    };

export async function loadPortfolioSession(
  repository: Pick<ActiveSaveRepository<PortfolioSaveDocumentV4>, 'loadActiveSave'>,
  journalStorage: Pick<KeyValueStorage, 'getItem'> | null,
  timestampMs: number,
  boost: BoostState = EMPTY_BOOST_STATE,
): Promise<PortfolioSessionLoadResult> {
  const stored = await repository.loadActiveSave();
  const journal = readJournal(journalStorage);
  const candidates = [stored, journal].filter((candidate) => candidate !== null);
  if (candidates.length === 0) {
    return {
      status: 'fresh',
      portfolio: createInitialPortfolio(timestampMs),
      catRoster: createEmptyCatRoster(),
      pendingGrant: null,
    };
  }
  const valid = candidates.flatMap((candidate) => {
    try {
      const loaded = deserializePortfolioSaveDocument(candidate);
      const schemaVersion = (candidate as { schemaVersion?: unknown }).schemaVersion;
      return [{ loaded, schemaVersion: schemaVersion === 4 ? 4 : 3 }];
    } catch {
      return [];
    }
  });
  if (valid.length === 0) return { status: 'corrupt', candidates };
  valid.sort((a, b) =>
    b.loaded.savedAtTimestampMs - a.loaded.savedAtTimestampMs ||
    b.schemaVersion - a.schemaVersion);
  const selected = valid[0].loaded;
  let portfolio = selected.portfolio;
  const savedAtMs = selected.savedAtTimestampMs;
  if (portfolio.activeMineId !== null) {
    portfolio = suspendActiveMine(
      portfolio,
      savedAtMs,
      createCatProductionModifiers(selected.catRoster),
    );
  }
  return {
    status: 'saved',
    portfolio,
    catRoster: selected.catRoster,
    pendingGrant: previewMineOfflineGrant(
      portfolio,
      portfolio.selectedMineId,
      Math.max(timestampMs, savedAtMs),
      boost,
    ) ?? {
      elapsedDurationMs: 0,
      creditedDurationMs: 0,
      reward: portfolio.walletGold.multiply(0),
    },
  };
}

function readJournal(storage: Pick<KeyValueStorage, 'getItem'> | null): unknown | null {
  try {
    const value = storage?.getItem(LIFECYCLE_SAVE_JOURNAL_KEY);
    return value === null || value === undefined ? null : JSON.parse(value);
  } catch {
    return null;
  }
}

export async function resumePortfolioSession(
  repository: ActiveSaveRepository<PortfolioSaveDocumentV4>,
  portfolio: PortfolioState,
  catRoster: CatRosterState,
  timestampMs: number,
  boost: BoostState = EMPTY_BOOST_STATE,
): Promise<MineEnterResult | { readonly status: 'save-failed'; readonly portfolio: PortfolioState }> {
  const result = enterMine(
    portfolio,
    portfolio.selectedMineId,
    timestampMs,
    createCatProductionModifiers(catRoster),
    boost,
  );
  if (result.status !== 'entered') return result;
  try {
    await commitPortfolio(repository, result.portfolio, catRoster, timestampMs);
    return result;
  } catch {
    return { status: 'save-failed', portfolio };
  }
}
