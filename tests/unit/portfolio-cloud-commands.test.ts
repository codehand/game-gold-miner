import { describe, expect, it } from 'vitest';

import { createInitialPortfolio } from '../../src/core';
import { createPortfolioSaveDocument } from '../../src/persistence';
import {
  PortfolioCloudCommands,
  type PendingPortfolioCommand,
  type PortfolioCloudCommand,
  type PortfolioCloudGateway,
} from '../../src/platform/web';

const DOCUMENT = createPortfolioSaveDocument(createInitialPortfolio(1_000), 1_000);
const OTHER_DOCUMENT = createPortfolioSaveDocument(createInitialPortfolio(2_000), 2_000);
const RECEIVED_AT = '2026-10-02T00:00:00.000Z';
type Gateway = Pick<PortfolioCloudGateway, 'upload' | 'command'>;

describe('portfolio cloud command queue', () => {
  it('uploads current mine progress before one revisioned command', async () => {
    const calls: string[] = [];
    const pending: (PendingPortfolioCommand | null)[] = [];
    const gateway: Gateway = {
      upload: async (revision, document) => {
        calls.push('upload');
        expect(revision).toBe(1);
        expect(document).toBe(DOCUMENT);
        return {
          kind: 'ok',
          value: { revision: 2, receivedAt: RECEIVED_AT, document: DOCUMENT },
        };
      },
      command: async (command) => {
        calls.push('command');
        expect(command).toEqual({
          type: 'purchase', mineId: 'amethyst',
          baseRevision: 2, idempotencyKey: 'purchase-1',
        });
        return {
          kind: 'ok',
          value: { revision: 3, receivedAt: RECEIVED_AT, document: DOCUMENT },
        };
      },
    };
    const queue = new PortfolioCloudCommands({
      gateway, revision: 1, newKey: () => 'purchase-1',
      persistPending: async (command) => { pending.push(command); },
    });
    const result = await queue.execute({ type: 'purchase', mineId: 'amethyst' }, DOCUMENT);
    expect(result.kind).toBe('ok');
    expect(queue.revision).toBe(3);
    expect(queue.pending?.idempotencyKey).toBe('purchase-1');
    expect(calls).toEqual(['upload', 'command']);
    expect(pending).toHaveLength(3);
    expect(pending[0]?.uploadBaseRevision).toBe(1);
    expect(pending[1]?.command.baseRevision).toBe(2);
    expect(pending[2]?.accepted?.revision).toBe(3);
    expect(await queue.completePending()).toBe(true);
    expect(queue.pending).toBeNull();
  });

  it('replays the exact pending key after a timeout without uploading twice', async () => {
    const commands: PortfolioCloudCommand[] = [];
    const gateway: Gateway = {
      upload: async () => ({
        kind: 'ok',
        value: { revision: 5, receivedAt: RECEIVED_AT, document: DOCUMENT },
      }),
      command: async (command) => {
        commands.push(command);
        return commands.length === 1
          ? { kind: 'unavailable' }
          : {
            kind: 'ok',
            value: { revision: 6, receivedAt: RECEIVED_AT, document: DOCUMENT },
          };
      },
    };
    const queue = new PortfolioCloudCommands({
      gateway, revision: 4, newKey: () => 'switch-1',
    });
    expect((await queue.execute({ type: 'enter', mineId: 'gold' }, DOCUMENT)).kind)
      .toBe('unavailable');
    expect(queue.pending?.idempotencyKey).toBe('switch-1');
    expect((await queue.execute({ type: 'suspend' }, DOCUMENT)).kind).toBe('busy');
    expect((await queue.retryPending()).kind).toBe('ok');
    expect(commands).toEqual([
      { type: 'enter', mineId: 'gold', effectiveAtMs: 1_000, baseRevision: 5, idempotencyKey: 'switch-1' },
      { type: 'enter', mineId: 'gold', effectiveAtMs: 1_000, baseRevision: 5, idempotencyKey: 'switch-1' },
    ]);
    expect(queue.revision).toBe(6);
    expect(queue.pending?.idempotencyKey).toBe('switch-1');
    await queue.completePending();
  });

  it('does not send a mine command when routine progress cannot be saved', async () => {
    let sent = false;
    const queue = new PortfolioCloudCommands({
      revision: 2, newKey: () => 'key',
      gateway: {
        upload: async () => ({ kind: 'conflict', revision: 3, document: OTHER_DOCUMENT }),
        command: async () => {
          sent = true;
          return { kind: 'unavailable' };
        },
      },
    });
    expect((await queue.execute({ type: 'suspend' }, DOCUMENT)).kind).toBe('conflict');
    expect(sent).toBe(false);
    expect(queue.pending).toBeNull();
  });

  it('enters at the old receipt on return so the server can credit offline time', async () => {
    const calls: string[] = [];
    const queue = new PortfolioCloudCommands({
      revision: 7,
      newKey: () => 'return-1',
      gateway: {
        upload: async () => {
          calls.push('upload');
          return { kind: 'unavailable' };
        },
        command: async (command) => {
          calls.push('enter');
          expect(command).toEqual({
            type: 'enter', mineId: 'gold',
            baseRevision: 7, idempotencyKey: 'return-1',
          });
          return {
            kind: 'ok',
            value: { revision: 8, receivedAt: RECEIVED_AT, document: DOCUMENT },
          };
        },
      },
    });
    expect((await queue.executeAtRevision({ type: 'enter', mineId: 'gold' })).kind)
      .toBe('ok');
    expect(calls).toEqual(['enter']);
    expect(queue.revision).toBe(8);
  });

  it('flushes production before an external wallet RPC and adopts its revision', async () => {
    let commandsSent = 0;
    const queue = new PortfolioCloudCommands({
      revision: 3,
      newKey: () => 'unused',
      gateway: {
        upload: async (revision) => {
          expect(revision).toBe(3);
          return {
            kind: 'ok',
            value: { revision: 4, receivedAt: RECEIVED_AT, document: DOCUMENT },
          };
        },
        command: async () => {
          commandsSent += 1;
          return { kind: 'unavailable' };
        },
      },
    });
    expect((await queue.syncRoutine(DOCUMENT)).kind).toBe('ok');
    expect(queue.revision).toBe(4);
    queue.acceptExternalRevision(5);
    expect(queue.revision).toBe(5);
    expect(() => queue.acceptExternalRevision(5)).toThrow();
    expect(commandsSent).toBe(0);
  });
});
