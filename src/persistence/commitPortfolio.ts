import type { CatRosterState, PortfolioState } from '../core';
import type { ActiveSaveRepository } from './ActiveSaveRepository';
import type { SavePersistenceCoordinator } from './SavePersistenceCoordinator';
import {
  createPortfolioSaveDocument,
  type PortfolioSaveDocumentV4,
} from './portfolioSaveSchema';

/** Local commit boundary for a purchase or mine entry: validate, then await one write. */
export async function commitPortfolio(
  repository: ActiveSaveRepository<PortfolioSaveDocumentV4>,
  portfolio: PortfolioState,
  catRoster: CatRosterState,
  savedAtTimestampMs: number,
): Promise<PortfolioSaveDocumentV4> {
  const document = createPortfolioSaveDocument(
    portfolio,
    savedAtTimestampMs,
    catRoster,
  );
  await repository.storeActiveSave(document);
  return document;
}

/** Serializes a command with queued heartbeat/lifecycle writes. */
export async function commitPortfolioWithCoordinator(
  coordinator: Pick<SavePersistenceCoordinator<PortfolioSaveDocumentV4>,
    'queueSave' | 'flush' | 'cancelScheduledSave'>,
  portfolio: PortfolioState,
  catRoster: CatRosterState,
  savedAtTimestampMs: number,
): Promise<PortfolioSaveDocumentV4> {
  const document = createPortfolioSaveDocument(
    portfolio,
    savedAtTimestampMs,
    catRoster,
  );
  coordinator.queueSave(document);
  if (!await coordinator.flush()) {
    coordinator.cancelScheduledSave();
    throw new Error('Could not commit the portfolio locally.');
  }
  return document;
}
