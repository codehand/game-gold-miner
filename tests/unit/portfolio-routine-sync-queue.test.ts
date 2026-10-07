import { describe, expect, it, vi } from 'vitest';

import { createInitialPortfolio } from '../../src/core/portfolio/portfolio';
import { createPortfolioSaveDocument } from '../../src/persistence';
import type { PortfolioCommandOutcome } from '../../src/platform/web/portfolioCloudCommands';
import { PortfolioRoutineSyncQueue } from '../../src/platform/web/portfolioRoutineSyncQueue';

const FIRST = createPortfolioSaveDocument(createInitialPortfolio(0), 0);
const SECOND = { ...FIRST, savedAtTimestampMs: 1 };
const LATEST = { ...FIRST, savedAtTimestampMs: 2 };
const accepted = (document: typeof FIRST): PortfolioCommandOutcome => ({
  kind: 'ok',
  value: { revision: 2, receivedAt: new Date(0).toISOString(), document },
});

describe('portfolio routine sync queue', () => {
  it('uploads an edit immediately and coalesces edits made during that upload', async () => {
    let completeFirst!: () => void;
    const firstUpload = new Promise<PortfolioCommandOutcome>((resolve) => {
      completeFirst = () => resolve(accepted(FIRST));
    });
    const syncRoutine = vi.fn()
      .mockImplementationOnce(() => firstUpload)
      .mockResolvedValue(accepted(LATEST));
    const queue = new PortfolioRoutineSyncQueue({
      pending: null,
      waitUntilIdle: async () => {},
      syncRoutine,
    });

    queue.enqueue(FIRST);
    await vi.waitFor(() => expect(syncRoutine).toHaveBeenCalledTimes(1));
    queue.enqueue(SECOND);
    queue.enqueue(LATEST);
    completeFirst();
    await queue.waitForAttempt();

    expect(syncRoutine).toHaveBeenCalledTimes(2);
    expect(syncRoutine.mock.calls.map(([document]) => document)).toEqual([FIRST, LATEST]);
  });

  it('holds the newest edit while a server-owned command is pending', async () => {
    const commands = {
      pending: { type: 'enter' } as object | null,
      waitUntilIdle: async () => {},
      syncRoutine: vi.fn().mockResolvedValue(accepted(LATEST)),
    };
    const queue = new PortfolioRoutineSyncQueue(commands);
    queue.enqueue(FIRST);
    await queue.waitForAttempt();
    expect(commands.syncRoutine).not.toHaveBeenCalled();

    commands.pending = null;
    queue.enqueue(LATEST);
    await queue.waitForAttempt();
    expect(commands.syncRoutine).toHaveBeenCalledExactlyOnceWith(LATEST);
  });

  it('reports a rejected upload and retries the latest document on the next edit', async () => {
    const onOutcome = vi.fn();
    const syncRoutine = vi.fn()
      .mockResolvedValueOnce({ kind: 'rejected', code: 'save_rejected', reason: null })
      .mockResolvedValue(accepted(LATEST));
    const queue = new PortfolioRoutineSyncQueue({
      pending: null,
      waitUntilIdle: async () => {},
      syncRoutine,
    }, onOutcome);

    queue.enqueue(FIRST);
    await queue.waitForAttempt();
    expect(onOutcome).toHaveBeenCalledWith({
      kind: 'rejected', code: 'save_rejected', reason: null,
    });
    queue.enqueue(LATEST);
    await queue.waitForAttempt();
    expect(syncRoutine.mock.calls.map(([document]) => document)).toEqual([FIRST, LATEST]);
    expect(onOutcome).toHaveBeenLastCalledWith(accepted(LATEST));
  });
});
