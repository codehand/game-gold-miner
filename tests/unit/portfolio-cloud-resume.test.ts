import { describe, expect, it } from 'vitest';

import { createInitialPortfolio } from '../../src/core';
import { createPortfolioSaveDocument } from '../../src/persistence';
import {
  resumePortfolioCloudMine,
  type PendingPortfolioCommand,
  type PortfolioCloudCommand,
  type PortfolioCloudGateway,
} from '../../src/platform/web';

const DOCUMENT = createPortfolioSaveDocument(createInitialPortfolio(1_000), 1_000);
const BOOT = {
  kind: 'ready' as const,
  document: DOCUMENT,
  revision: 4,
  receivedAtMs: 1_000,
  source: 'cloud' as const,
};
type Gateway = Pick<PortfolioCloudGateway, 'upload' | 'command'>;

describe('cloud portfolio return', () => {
  it('claims a stale foreground mine against its old server receipt', async () => {
    const calls: string[] = [];
    const gateway: Gateway = {
      upload: async () => {
        calls.push('upload');
        return { kind: 'unavailable' };
      },
      command: async (command) => {
        calls.push('enter');
        expect(command).toEqual({
          type: 'enter', mineId: 'gold', baseRevision: 4, idempotencyKey: 'return-1',
        });
        return {
          kind: 'ok',
          value: {
            revision: 5, document: DOCUMENT,
            receivedAt: new Date(61_000).toISOString(),
          },
        };
      },
    };
    const result = await resumePortfolioCloudMine(gateway, BOOT, 61_000, () => 'return-1');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.enteredMineId).toBe('gold');
      expect(result.commands.revision).toBe(5);
    }
    expect(calls).toEqual(['enter']);
  });

  it('keeps a fresh foreground receipt without an extra command', async () => {
    const gateway: Gateway = {
      upload: async () => { throw new Error('unexpected upload'); },
      command: async () => { throw new Error('unexpected command'); },
    };
    const result = await resumePortfolioCloudMine(
      gateway, { ...BOOT, source: 'uploaded' }, 2_000, () => 'unused',
    );
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expect(result.enteredMineId).toBeNull();
  });

  it('replays an interrupted command with its original key before entering', async () => {
    const command: PortfolioCloudCommand = {
      type: 'enter', mineId: 'gold', baseRevision: 4, idempotencyKey: 'earlier-1',
    };
    const pending: PendingPortfolioCommand = {
      command, sourceDocument: null, uploadBaseRevision: null, accepted: null,
    };
    const sent: PortfolioCloudCommand[] = [];
    const gateway: Gateway = {
      upload: async () => { throw new Error('unexpected upload'); },
      command: async (command) => {
        sent.push(command);
        return {
          kind: 'ok',
          value: {
            revision: 5, document: DOCUMENT,
            receivedAt: new Date(61_000).toISOString(),
          },
        };
      },
    };
    const result = await resumePortfolioCloudMine(
      gateway, BOOT, 61_000, () => 'unused', pending,
    );
    expect(result.kind).toBe('ready');
    expect(sent).toEqual([command]);
  });
});
