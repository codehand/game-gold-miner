import { describe, expect, it } from 'vitest';

import { createInitialPortfolio } from '../../src/core';
import {
  comparePortfolioProgress,
  createPortfolioSaveDocument,
  type PortfolioSaveDocumentV4,
} from '../../src/persistence';

const BASE = createPortfolioSaveDocument(createInitialPortfolio(1_000), 1_000);

function withShaftLevel(
  document: PortfolioSaveDocumentV4,
  level: number,
): PortfolioSaveDocumentV4 {
  const gold = document.mines.gold!;
  return {
    ...document,
    mines: {
      ...document.mines,
      gold: {
        ...gold,
        state: {
          ...gold.state,
          floors: gold.state.floors.map((floor, index) =>
            index === 0 ? { ...floor, mineShaftLevel: level } : floor),
        },
      },
    },
  };
}

describe('portfolio save conflict policy', () => {
  it('compares monotonic progress across the account, including separate mines', () => {
    const deeperGold = withShaftLevel(BASE, BASE.mines.gold!.state.floors[0].mineShaftLevel + 1);
    expect(comparePortfolioProgress(deeperGold, BASE)).toBe('left-dominates');
    expect(comparePortfolioProgress(BASE, deeperGold)).toBe('right-dominates');
    const amethyst = {
      ...BASE,
      mines: {
        ...BASE.mines,
        amethyst: {
          ...BASE.mines.gold!,
          visitCount: 0,
          offlineSequence: 0,
          lastClaimedSequence: 0,
          offline: null,
        },
      },
    } satisfies PortfolioSaveDocumentV4;
    expect(comparePortfolioProgress(amethyst, BASE)).toBe('left-dominates');
    expect(comparePortfolioProgress(deeperGold, amethyst)).toBe('fork');
  });

  it('does not silently discard wallet or Collection changes with equal mine progress', () => {
    expect(comparePortfolioProgress(BASE, { ...BASE })).toBe('equal');
    expect(comparePortfolioProgress(BASE, { ...BASE, walletGold: '101' })).toBe('fork');
    expect(comparePortfolioProgress(BASE, {
      ...BASE,
      collectionRevision: BASE.collectionRevision + 1,
    })).toBe('fork');
  });

  it('treats the server suspension created during reload as forward progress', () => {
    const gold = BASE.mines.gold!;
    const suspended = {
      ...BASE,
      activeMineId: null,
      mines: {
        ...BASE.mines,
        gold: {
          ...gold,
          offlineSequence: gold.offlineSequence + 1,
          offline: {
            sequence: gold.offlineSequence + 1,
            startedAtMs: BASE.savedAtTimestampMs,
            savedRatePerSecond: '1',
          },
        },
      },
    } satisfies PortfolioSaveDocumentV4;

    expect(comparePortfolioProgress(BASE, suspended)).toBe('right-dominates');
    expect(comparePortfolioProgress(suspended, BASE)).toBe('left-dominates');
  });
});
