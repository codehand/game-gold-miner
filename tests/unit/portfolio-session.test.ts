import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState, createInitialPortfolio } from '../../src/core';
import {
  createPortfolioSaveDocument,
  createSaveDocument,
  type ActiveSaveRepository,
  type PortfolioSaveDocumentV4,
} from '../../src/persistence';
import {
  loadPortfolioSession,
  resumePortfolioSession,
  LIFECYCLE_SAVE_JOURNAL_KEY,
} from '../../src/platform/web';

describe('local portfolio session recovery', () => {
  it('chooses a newer v4 IndexedDB save over an older v3 lifecycle journal', async () => {
    const stored = createPortfolioSaveDocument(createInitialPortfolio(2_000), 2_000);
    const old = createSaveDocument(createInitialGameState(BASE_GAME_BALANCE, 1_000),
      BASE_GAME_BALANCE, 1_500);
    const repository: Pick<ActiveSaveRepository<PortfolioSaveDocumentV4>, 'loadActiveSave'> = {
      loadActiveSave: async () => stored,
    };
    const journal = {
      getItem: (key: string) => key === LIFECYCLE_SAVE_JOURNAL_KEY ? JSON.stringify(old) : null,
    };

    const loaded = await loadPortfolioSession(repository, journal, 3_000);
    expect(loaded.status).toBe('saved');
    if (loaded.status === 'saved') {
      expect(loaded.portfolio.mines.gold?.purchasedAtMs).toBe(2_000);
      expect(loaded.portfolio.mines.gold?.offline?.startedAtMs).toBe(2_000);
    }
  });

  it('keeps a legacy interval unclaimed after write failure, then migrates once', async () => {
    const old = createSaveDocument(createInitialGameState(BASE_GAME_BALANCE, 1_000),
      BASE_GAME_BALANCE, 1_500);
    const save: { stored: PortfolioSaveDocumentV4 | null } = { stored: null };
    let fails = true;
    const repository: ActiveSaveRepository<PortfolioSaveDocumentV4> = {
      loadActiveSave: async () => null,
      storeActiveSave: async (document) => {
        if (fails) throw new Error('IndexedDB unavailable');
        save.stored = document;
      },
    };
    const loaded = await loadPortfolioSession(repository, {
      getItem: () => JSON.stringify(old),
    }, 3_000);
    expect(loaded.status).toBe('saved');
    if (loaded.status !== 'saved') return;
    expect(loaded.portfolio.activeMineId).toBeNull();

    const failed = await resumePortfolioSession(repository, loaded.portfolio,
      loaded.catRoster, 3_000);
    expect(failed.status).toBe('save-failed');
    expect(save.stored).toBeNull();
    expect(loaded.portfolio.mines.gold?.offline?.sequence).toBe(1);

    fails = false;
    const resumed = await resumePortfolioSession(repository, loaded.portfolio,
      loaded.catRoster, 3_000);
    expect(resumed.status).toBe('entered');
    if (resumed.status === 'entered') {
      expect(resumed.portfolio.mines.gold?.lastClaimedSequence).toBe(1);
      expect(resumed.grant.reward.equals(loaded.pendingGrant.reward)).toBe(true);
    }
    expect(save.stored?.schemaVersion).toBe(4);
  });
});
