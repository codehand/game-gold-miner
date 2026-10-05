import { describe, expect, it } from 'vitest';

import { createInitialPortfolio } from '../../src/core';
import { createPortfolioSaveDocument } from '../../src/persistence';
import { PortfolioCommandJournal } from '../../src/platform/web';

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';
const KEY = '00000000-0000-4000-8000-000000000003';
const DOCUMENT = createPortfolioSaveDocument(createInitialPortfolio(1_000), 1_000);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('portfolio command journal', () => {
  it('restores one exact command only for its account', async () => {
    const storage = memoryStorage();
    const journal = new PortfolioCommandJournal(storage, USER_A);
    const pending = {
      command: {
        type: 'enter' as const, mineId: 'ruby' as const,
        effectiveAtMs: 1_000, baseRevision: 6, idempotencyKey: KEY,
      },
      sourceDocument: DOCUMENT,
      uploadBaseRevision: 5,
      accepted: null,
    };
    await journal.write(pending);
    expect(new PortfolioCommandJournal(storage, USER_A).read()).toEqual(pending);
    expect(new PortfolioCommandJournal(storage, USER_B).read()).toBeNull();
    await journal.write(null);
    expect(journal.read()).toBeNull();
  });

  it('refuses an unknown site or malformed command from local storage', () => {
    const storage = memoryStorage();
    const journal = new PortfolioCommandJournal(storage, USER_A);
    storage.setItem(
      `cat-mine-idle:portfolio-command:${USER_A}`,
      JSON.stringify({
        type: 'purchase', mineId: 'unknown', baseRevision: 6, idempotencyKey: KEY,
      }),
    );
    expect(journal.read()).toBeNull();
  });
});
