import { describe, expect, it } from 'vitest';

import { createEmptyCatRoster } from '../../src/core/cats';
import { evaluatePortfolioRoutineBound } from '../../src/core/anti-cheat/portfolioProgressBound';
import { calculatePortfolioLifetimeGoldEarned } from '../../src/core/leaderboard/leaderboardMetric';
import { GameNumber } from '../../src/core/numbers/GameNumber';
import {
  advanceActiveMine,
  createInitialPortfolio,
  purchaseMine,
  type PortfolioState,
} from '../../src/core/portfolio/portfolio';

const ROSTER = createEmptyCatRoster();

function bound(previous: PortfolioState, candidate: PortfolioState, serverNowMs = 60_000) {
  return evaluatePortfolioRoutineBound({
    previous,
    candidate,
    previousCatRoster: ROSTER,
    candidateCatRoster: ROSTER,
    previousReceivedAtMs: 0,
    serverNowMs,
  });
}

function ownedAmethyst(): PortfolioState {
  const original = createInitialPortfolio(0);
  const gold = original.mines.gold!;
  const eligible: PortfolioState = {
    ...original,
    walletGold: GameNumber.from('2e12'),
    mines: {
      gold: {
        ...gold,
        state: {
          ...gold.state,
          floors: gold.state.floors.map((floor) => floor.floorNumber <= 5
            ? {
                ...floor,
                isUnlocked: true,
                mineShaftLevel: floor.floorNumber <= 2 ? 5
                  : floor.floorNumber <= 4 ? 7 : 1,
              }
            : floor),
        },
      },
    },
  };
  const purchase = purchaseMine(eligible, 'amethyst', 0);
  if (purchase.status !== 'purchased') throw new Error('Fixture purchase failed.');
  return purchase.portfolio;
}

describe('server portfolio routine bound', () => {
  it('accepts foreground production within the server-measured interval', () => {
    const previous = createInitialPortfolio(0);
    const candidate = advanceActiveMine(previous, 60_000);
    expect(bound(previous, candidate)).toBeNull();
  });

  it('rejects wallet inflation even when all production counters are unchanged', () => {
    const previous = createInitialPortfolio(0);
    const candidate = { ...previous, walletGold: GameNumber.from('1e100') };
    expect(bound(previous, candidate)?.counter).toBe('walletGold');
  });

  it('accepts a wallet equal to the serialized delivery limit', () => {
    const previous = createInitialPortfolio(0);
    const priorGold = GameNumber.from('663932.2713306472');
    const delivered = GameNumber.from('1103.956619838653');
    const maximum = priorGold.add(delivered);
    const candidateGold = GameNumber.from(maximum.serialize());
    // Reproduces the production 422: internal floating bits compare greater
    // even though both values serialize to the exact same save value.
    expect(candidateGold.serialize()).toBe(maximum.serialize());
    expect(candidateGold.greaterThan(maximum)).toBe(true);
    const goldMine = previous.mines.gold!;
    const candidate: PortfolioState = {
      ...previous,
      walletGold: candidateGold,
      mines: {
        gold: {
          ...goldMine,
          state: {
            ...goldMine.state,
            warehouse: {
              ...goldMine.state.warehouse,
              totalGoldDelivered: delivered,
            },
          },
        },
      },
    };
    expect(bound({ ...previous, walletGold: priorGold }, candidate, 1_000_000_000)).toBeNull();
  });

  it('rejects direct claims, ownership changes, and inactive mine edits', () => {
    const original = createInitialPortfolio(0);
    const gold = original.mines.gold!;
    expect(bound(original, {
      ...original,
      mines: {
        gold: {
          ...gold,
          state: {
            ...gold.state,
            warehouse: {
              ...gold.state.warehouse,
              totalOfflineGoldClaimed: GameNumber.from(10),
            },
          },
        },
      },
    })?.counter).toBe('mines.gold.offlineClaim');

    const portfolio = ownedAmethyst();
    expect(bound(original, portfolio)?.counter).toBe('mines.amethyst.ownership');
    const amethyst = portfolio.mines.amethyst!;
    expect(bound(portfolio, {
      ...portfolio,
      mines: {
        ...portfolio.mines,
        amethyst: { ...amethyst, purchasedAtMs: 1 },
      },
    })?.counter).toBe('mines.amethyst.state');
  });

  it('rejects a changed roster or a decreasing lifetime counter', () => {
    const original = createInitialPortfolio(0);
    expect(evaluatePortfolioRoutineBound({
      previous: original,
      candidate: original,
      previousCatRoster: ROSTER,
      candidateCatRoster: { ...ROSTER, assignmentRevision: 1 },
      previousReceivedAtMs: 0,
      serverNowMs: 60_000,
    })?.counter).toBe('cats');

    const previous = advanceActiveMine(original, 60_000);
    const gold = previous.mines.gold!;
    expect(bound(previous, {
      ...previous,
      mines: {
        gold: {
          ...gold,
          state: {
            ...gold.state,
            floors: gold.state.floors.map((floor, index) => index === 0
              ? { ...floor, totalExtracted: GameNumber.from(0) }
              : floor),
          },
        },
      },
    }, 120_000)?.counter).toBe('mines.gold.lifetimeCounters');
  });

  it('sums every mine delivery and offline claim once for the leaderboard', () => {
    const portfolio = ownedAmethyst();
    const gold = portfolio.mines.gold!;
    const amethyst = portfolio.mines.amethyst!;
    const withProgress: PortfolioState = {
      ...portfolio,
      mines: {
        gold: {
          ...gold,
          state: { ...gold.state, warehouse: {
            ...gold.state.warehouse,
            totalGoldDelivered: GameNumber.from(10),
            totalOfflineGoldClaimed: GameNumber.from(3),
          } },
        },
        amethyst: {
          ...amethyst,
          state: { ...amethyst.state, warehouse: {
            ...amethyst.state.warehouse,
            totalGoldDelivered: GameNumber.from(20),
            totalOfflineGoldClaimed: GameNumber.from(5),
          } },
        },
      },
    };
    expect(calculatePortfolioLifetimeGoldEarned(withProgress).equals(38)).toBe(true);
  });
});
