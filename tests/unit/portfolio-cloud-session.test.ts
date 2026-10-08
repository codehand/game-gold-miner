import { describe, expect, it } from 'vitest';

import {
  createInitialPortfolio,
  enterMine,
  enterMineWithPendingClaim,
  GameNumber,
  purchaseMine,
  suspendActiveMine,
  type PortfolioState,
} from '../../src/core';
import {
  createPortfolioSaveDocument,
  deserializePortfolioSaveDocument,
  type ActiveSaveRepository,
  type PortfolioSaveDocumentV4,
} from '../../src/persistence';
import {
  bootstrapPortfolioCloudSession,
  PortfolioCommandJournal,
  type PortfolioCloudGateway,
} from '../../src/platform/web';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const NOW_MS = 61_000;
type Gateway = Pick<PortfolioCloudGateway, 'download' | 'upload' | 'command'>;

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function readyForAmethyst(timestampMs: number): PortfolioState {
  const initial = createInitialPortfolio(timestampMs);
  const gold = initial.mines.gold!;
  return {
    ...initial,
    walletGold: GameNumber.from('2e9'),
    mines: {
      gold: {
        ...gold,
        state: {
          ...gold.state,
          floors: gold.state.floors.map((floor) => floor.floorNumber <= 5
            ? { ...floor, isUnlocked: true, mineShaftLevel: 10 }
            : floor),
        },
      },
    },
  };
}

describe('configured portfolio bootstrap', () => {
  it('uploads a new shared-wallet mine once and stores the accepted document', async () => {
    let stored: PortfolioSaveDocumentV4 | null = null;
    const repository: ActiveSaveRepository<PortfolioSaveDocumentV4> = {
      loadActiveSave: async () => null,
      storeActiveSave: async (document) => { stored = document; },
    };
    const gateway: Gateway = {
      download: async () => ({ kind: 'missing' }),
      upload: async (revision, document) => {
        expect(revision).toBeNull();
        expect(document.walletGold).toBe('100');
        return {
          kind: 'ok',
          value: {
            revision: 1, document,
            receivedAt: new Date(NOW_MS).toISOString(),
          },
        };
      },
      command: async () => { throw new Error('A fresh active mine needs no entry.'); },
    };
    const result = await bootstrapPortfolioCloudSession({
      repository, storage: storage(), gateway, userId: USER_ID,
      nowMs: NOW_MS, newKey: () => 'unused',
    });
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.document.activeMineId).toBe('gold');
      expect(result.commands.revision).toBe(1);
      expect(stored).toEqual(result.document);
    }
  });

  it('preserves a corrupt local candidate and defers cloud writes', async () => {
    let writes = 0;
    const result = await bootstrapPortfolioCloudSession({
      repository: {
        loadActiveSave: async () => ({ schemaVersion: 999 }),
        storeActiveSave: async () => { writes += 1; },
      },
      storage: storage(),
      gateway: {
        download: async () => { throw new Error('unexpected download'); },
        upload: async () => { throw new Error('unexpected upload'); },
        command: async () => { throw new Error('unexpected command'); },
      },
      userId: USER_ID, nowMs: NOW_MS, newKey: () => 'unused',
    });
    expect(result).toEqual({ kind: 'deferred', reason: 'corrupt-local-save' });
    expect(writes).toBe(0);
  });

  it('offers the server preview before it sends the once-only entry claim', async () => {
    const suspended = createPortfolioSaveDocument(
      suspendActiveMine(createInitialPortfolio(1_000), 1_000), 1_000,
    );
    const active = createPortfolioSaveDocument(createInitialPortfolio(NOW_MS), NOW_MS);
    const events: string[] = [];
    const result = await bootstrapPortfolioCloudSession({
      repository: {
        loadActiveSave: async () => null,
        storeActiveSave: async () => { events.push('store'); },
      },
      storage: storage(), userId: USER_ID, nowMs: NOW_MS,
      newKey: () => 'claim-1',
      gateway: {
        download: async () => ({
          kind: 'ok',
          value: {
            revision: 2, document: suspended,
            receivedAt: new Date(1_000).toISOString(),
            offlineGrants: { gold: {
              elapsedDurationMs: 60_000,
              creditedDurationMs: 60_000,
              reward: '25',
            } },
          },
        }),
        upload: async () => { throw new Error('unexpected upload'); },
        command: async () => {
          events.push('claim');
          return {
            kind: 'ok',
            value: {
              revision: 3, document: active,
              receivedAt: new Date(NOW_MS).toISOString(),
            },
          };
        },
      },
      claimWithAction: async (reward, mineId, claim, previewDocument) => {
        expect(previewDocument).toEqual(suspended);
        events.push(`preview:${mineId}:${reward.reward.serialize()}`);
        return await claim();
      },
    });
    expect(result.kind).toBe('ready');
    expect(events).toEqual(['preview:gold:25', 'claim', 'store']);
  });

  it('recovers a validated provisional entry and credits its frozen reward once', async () => {
    const startedAtMs = 1_000;
    const purchase = purchaseMine(readyForAmethyst(startedAtMs), 'amethyst', startedAtMs);
    if (purchase.status !== 'purchased') throw new Error('Fixture purchase failed.');
    const visit = enterMine(purchase.portfolio, 'amethyst', 2_000);
    if (visit.status !== 'entered') throw new Error('Fixture entry failed.');
    const source = createPortfolioSaveDocument(visit.portfolio, NOW_MS);
    const serverEntry = enterMine(visit.portfolio, 'gold', NOW_MS);
    const provisional = enterMineWithPendingClaim(visit.portfolio, 'gold', NOW_MS);
    if (serverEntry.status !== 'entered' || provisional.status !== 'entered') {
      throw new Error('Fixture return failed.');
    }
    let local = createPortfolioSaveDocument(provisional.portfolio, NOW_MS);
    const memory = storage();
    const commandKey = '00000000-0000-4000-8000-000000000003';
    await new PortfolioCommandJournal(memory, USER_ID).write({
      command: {
        type: 'enter', mineId: 'gold', effectiveAtMs: NOW_MS,
        baseRevision: 6, idempotencyKey: commandKey,
      },
      sourceDocument: source,
      uploadBaseRevision: null,
      accepted: {
        revision: 6,
        receivedAt: new Date(NOW_MS).toISOString(),
        document: createPortfolioSaveDocument(serverEntry.portfolio, NOW_MS),
        result: {
          type: 'enter', mineId: 'gold',
          claimedSequence: serverEntry.claimedSequence,
          grant: {
            elapsedDurationMs: serverEntry.grant.elapsedDurationMs,
            creditedDurationMs: serverEntry.grant.creditedDurationMs,
            reward: serverEntry.grant.reward.serialize(),
          },
        },
      },
    });
    let cloud = createPortfolioSaveDocument(serverEntry.portfolio, NOW_MS);
    let revision = 6;
    const gateway: Gateway = {
      download: async () => ({
        kind: 'ok',
        value: {
          revision, document: cloud,
          receivedAt: new Date(NOW_MS).toISOString(),
        },
      }),
      upload: async (baseRevision, document) => {
        expect(baseRevision).toBe(revision);
        revision += 1;
        cloud = document;
        return {
          kind: 'ok',
          value: { revision, document, receivedAt: new Date(NOW_MS).toISOString() },
        };
      },
      command: async (command) => {
        expect(command.type).toBe('enter');
        const loaded = deserializePortfolioSaveDocument(cloud);
        const entered = enterMine(loaded.portfolio, 'gold', NOW_MS);
        if (entered.status !== 'entered') throw new Error('Resume entry failed.');
        revision += 1;
        cloud = createPortfolioSaveDocument(entered.portfolio, NOW_MS, loaded.catRoster);
        return {
          kind: 'ok',
          value: { revision, document: cloud, receivedAt: new Date(NOW_MS).toISOString() },
        };
      },
    };
    const result = await bootstrapPortfolioCloudSession({
      repository: {
        loadActiveSave: async () => local,
        storeActiveSave: async (document) => { local = document; },
      },
      storage: memory,
      gateway,
      userId: USER_ID,
      nowMs: NOW_MS,
      newKey: () => '00000000-0000-4000-8000-000000000004',
    });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    const recovered = deserializePortfolioSaveDocument(result.document).portfolio;
    expect(recovered.activeMineId).toBe('gold');
    expect(recovered.mines.gold?.pendingClaim).toBeNull();
    expect(recovered.walletGold.equals(serverEntry.portfolio.walletGold)).toBe(true);
    expect(new PortfolioCommandJournal(memory, USER_ID).read()).toBeNull();
  });
});
