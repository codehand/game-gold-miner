import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState, createInitialPortfolio } from '../../src/core';
import { createPortfolioSaveDocument, createSaveDocument } from '../../src/persistence';
import {
  reconcilePortfolioCloudAtBoot,
  type PortfolioCloudGateway,
} from '../../src/platform/web';

const LOCAL = createPortfolioSaveDocument(createInitialPortfolio(1_000), 1_000);
const RECEIVED_AT = '2026-10-02T00:00:00.000Z';
type Transport = Pick<PortfolioCloudGateway, 'download' | 'upload' | 'command'>;

function transport(overrides: Partial<Transport>): Transport {
  return {
    download: async () => ({ kind: 'missing' }),
    upload: async () => ({
      kind: 'ok',
      value: { revision: 1, receivedAt: RECEIVED_AT, document: LOCAL },
    }),
    command: async () => ({ kind: 'unavailable' }),
    ...overrides,
  };
}

describe('portfolio cloud boot reconciliation', () => {
  it('does not overwrite a returning account when both local and cloud saves are missing', async () => {
    let uploads = 0;
    const result = await reconcilePortfolioCloudAtBoot(transport({
      upload: async () => {
        uploads += 1;
        return { kind: 'unavailable' };
      },
    }), LOCAL, false, () => 'unused', false);
    expect(uploads).toBe(0);
    expect(result).toEqual({
      kind: 'deferred', local: LOCAL, reason: 'local-save-missing',
    });
  });

  it('uploads a first local portfolio and uses the canonical server receipt', async () => {
    const uploaded = { ...LOCAL, walletGold: '105' };
    const result = await reconcilePortfolioCloudAtBoot(transport({
      upload: async (revision, document) => {
        expect(revision).toBeNull();
        expect(document).toEqual(LOCAL);
        return {
          kind: 'ok',
          value: { revision: 1, receivedAt: RECEIVED_AT, document: uploaded },
        };
      },
    }), LOCAL, true, () => crypto.randomUUID());
    expect(result).toMatchObject({
      kind: 'ready', document: uploaded, revision: 1, source: 'uploaded',
    });
  });

  it.each([2, 3] as const)(
    'migrates a remote V%s save before adopting it on a fresh device',
    async (schemaVersion) => {
    const currentLegacy = createSaveDocument(
      createInitialGameState(BASE_GAME_BALANCE, 1_000),
      BASE_GAME_BALANCE,
      1_000,
    );
    const legacy = schemaVersion === 3
      ? currentLegacy
      : {
          schemaVersion,
          savedAtTimestampMs: currentLegacy.savedAtTimestampMs,
          effectiveProductionRatePerSecond: currentLegacy.effectiveProductionRatePerSecond,
          state: currentLegacy.state,
        };
    let migrated = false;
    let downloads = 0;
    const result = await reconcilePortfolioCloudAtBoot(transport({
      download: async () => {
        downloads += 1;
        return downloads === 1
          ? { kind: 'ok', value: { revision: 3, receivedAt: RECEIVED_AT, document: legacy } }
          : { kind: 'ok', value: {
              revision: 4, receivedAt: RECEIVED_AT, document: LOCAL,
              offlineGrants: { gold: {
                elapsedDurationMs: 60_000, creditedDurationMs: 60_000, reward: '5',
              } },
            } };
      },
      command: async (command) => {
        expect(command).toMatchObject({ type: 'migrate', baseRevision: 3 });
        migrated = true;
        return {
          kind: 'ok',
          value: { revision: 4, receivedAt: RECEIVED_AT, document: LOCAL },
        };
      },
    }), LOCAL, false, () => 'migration-id');
    expect(migrated).toBe(true);
    expect(downloads).toBe(2);
    expect(result).toMatchObject({
      kind: 'ready', revision: 4, source: 'cloud',
      offlineGrants: { gold: { reward: '5' } },
    });
  });

  it('preserves two diverged wallet candidates for an explicit choice', async () => {
    const remote = { ...LOCAL, walletGold: '101' };
    const result = await reconcilePortfolioCloudAtBoot(transport({
      download: async () => ({
        kind: 'ok',
        value: { revision: 7, receivedAt: RECEIVED_AT, document: remote },
      }),
    }), LOCAL, true, () => crypto.randomUUID());
    expect(result).toEqual({
      kind: 'conflict', local: LOCAL, remote, remoteRevision: 7,
    });
  });

  it('adopts a server suspension completed while the previous page reloads', async () => {
    const gold = LOCAL.mines.gold!;
    const remote = {
      ...LOCAL,
      activeMineId: null,
      mines: {
        ...LOCAL.mines,
        gold: {
          ...gold,
          offlineSequence: gold.offlineSequence + 1,
          offline: {
            sequence: gold.offlineSequence + 1,
            startedAtMs: LOCAL.savedAtTimestampMs,
            savedRatePerSecond: '1',
          },
        },
      },
    };
    let uploaded = false;
    const result = await reconcilePortfolioCloudAtBoot(transport({
      download: async () => ({
        kind: 'ok',
        value: {
          revision: 9,
          receivedAt: RECEIVED_AT,
          document: remote,
          offlineGrants: { gold: {
            elapsedDurationMs: 100, creditedDurationMs: 100, reward: '1',
          } },
        },
      }),
      upload: async () => {
        uploaded = true;
        return { kind: 'unavailable' };
      },
    }), LOCAL, true, () => crypto.randomUUID());

    expect(uploaded).toBe(false);
    expect(result).toMatchObject({
      kind: 'ready', source: 'cloud', revision: 9, document: remote,
      offlineGrants: { gold: { reward: '1' } },
    });
  });

  it('adopts a cloud-active receipt when IndexedDB retained a suspended snapshot', async () => {
    const gold = LOCAL.mines.gold!;
    const suspendedLocal = {
      ...LOCAL,
      activeMineId: null,
      mines: { ...LOCAL.mines, gold: {
        ...gold,
        offlineSequence: gold.offlineSequence + 1,
        offline: {
          sequence: gold.offlineSequence + 1,
          startedAtMs: LOCAL.savedAtTimestampMs,
          savedRatePerSecond: '1',
        },
      } },
    };
    let uploaded = false;
    const result = await reconcilePortfolioCloudAtBoot(transport({
      download: async () => ({
        kind: 'ok', value: { revision: 10, receivedAt: RECEIVED_AT, document: LOCAL },
      }),
      upload: async () => {
        uploaded = true;
        return { kind: 'unavailable' };
      },
    }), suspendedLocal, true, () => crypto.randomUUID());

    expect(uploaded).toBe(false);
    expect(result).toMatchObject({
      kind: 'ready', source: 'cloud', revision: 10, document: LOCAL,
    });
  });

  it('re-reads when suspend lands between boot download and dominant upload', async () => {
    const gold = LOCAL.mines.gold!;
    const localAhead = {
      ...LOCAL,
      mines: { ...LOCAL.mines, gold: {
        ...gold,
        state: {
          ...gold.state,
          floors: gold.state.floors.map((floor, index) => index === 0
            ? { ...floor, mineShaftLevel: floor.mineShaftLevel + 1 }
            : floor),
        },
      } },
    };
    const suspended = {
      ...localAhead,
      activeMineId: null,
      mines: { ...localAhead.mines, gold: {
        ...localAhead.mines.gold!,
        offlineSequence: gold.offlineSequence + 1,
        offline: {
          sequence: gold.offlineSequence + 1,
          startedAtMs: LOCAL.savedAtTimestampMs,
          savedRatePerSecond: '1',
        },
      } },
    };
    let downloads = 0;
    const result = await reconcilePortfolioCloudAtBoot(transport({
      download: async () => {
        downloads += 1;
        return downloads === 1
          ? { kind: 'ok', value: { revision: 8, receivedAt: RECEIVED_AT, document: LOCAL } }
          : { kind: 'ok', value: { revision: 9, receivedAt: RECEIVED_AT, document: suspended } };
      },
      upload: async () => ({ kind: 'rejected', code: 'save_rejected', reason: 'activeMineId' }),
    }), localAhead, true, () => crypto.randomUUID());

    expect(downloads).toBe(2);
    expect(result).toMatchObject({
      kind: 'ready', source: 'cloud', revision: 9, document: suspended,
    });
  });

  it('keeps local data pending when a dominant upload cannot reach the server', async () => {
    const localAhead = {
      ...LOCAL,
      mines: { ...LOCAL.mines, gold: {
        ...LOCAL.mines.gold!,
        state: {
          ...LOCAL.mines.gold!.state,
          floors: LOCAL.mines.gold!.state.floors.map((floor, index) =>
            index === 0 ? { ...floor, mineShaftLevel: floor.mineShaftLevel + 1 } : floor),
        },
      } },
    };
    const result = await reconcilePortfolioCloudAtBoot(transport({
      download: async () => ({
        kind: 'ok',
        value: { revision: 8, receivedAt: RECEIVED_AT, document: LOCAL },
      }),
      upload: async (revision, document) => {
        expect(revision).toBe(8);
        expect(document).toEqual(localAhead);
        return { kind: 'unavailable' };
      },
    }), localAhead, true, () => crypto.randomUUID());
    expect(result).toEqual({ kind: 'deferred', local: localAhead, reason: 'unavailable' });
  });
});
