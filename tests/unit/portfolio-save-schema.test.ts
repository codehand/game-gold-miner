import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { GameNumber } from '../../src/core/numbers/GameNumber';
import {
  createInitialPortfolio,
  enterMine,
  purchaseMine,
  type PortfolioState,
} from '../../src/core/portfolio/portfolio';
import { createInitialGameState } from '../../src/core/state/createInitialGameState';
import {
  createPortfolioSaveDocument,
  deserializePortfolioSaveDocument,
  PORTFOLIO_SAVE_SCHEMA_VERSION,
} from '../../src/persistence/portfolioSaveSchema';
import { createSaveDocument } from '../../src/persistence/saveSchema';

function readyToBuy(): PortfolioState {
  const base = createInitialPortfolio(0);
  const gold = base.mines.gold!;
  return {
    ...base,
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
}

describe('portfolio save schema v4', () => {
  it('round-trips one shared wallet and independent mine progress', () => {
    const purchase = purchaseMine(readyToBuy(), 'amethyst', 0);
    if (purchase.status !== 'purchased') throw new Error('Fixture purchase failed.');
    const entered = enterMine(purchase.portfolio, 'amethyst', 1_000);
    if (entered.status !== 'entered') throw new Error('Fixture entry failed.');
    const document = createPortfolioSaveDocument(entered.portfolio, 1_000);
    const loaded = deserializePortfolioSaveDocument(document);

    expect(document.schemaVersion).toBe(PORTFOLIO_SAVE_SCHEMA_VERSION);
    expect(document.walletGold).toBe(entered.portfolio.walletGold.serialize());
    expect(Object.hasOwn(document.mines.gold!.state, 'gold')).toBe(false);
    expect(Object.hasOwn(document.mines.amethyst!.state, 'gold')).toBe(false);
    expect(loaded.portfolio.activeMineId).toBe('amethyst');
    expect(loaded.portfolio.mines.gold?.offline?.sequence).toBe(1);
    expect(loaded.portfolio.mines.amethyst?.visitCount).toBe(1);
    expect(loaded.portfolio.walletGold.equals(entered.portfolio.walletGold)).toBe(true);
  });

  it('migrates a v3 save into Gold Mine without losing progress or wallet', () => {
    const oldState = createInitialGameState(BASE_GAME_BALANCE, 1_000);
    const oldSave = createSaveDocument(
      { ...oldState, gold: GameNumber.from('123456789') },
      BASE_GAME_BALANCE,
      1_500,
    );
    const loaded = deserializePortfolioSaveDocument(oldSave);
    const migrated = createPortfolioSaveDocument(loaded.portfolio, 1_500, loaded.catRoster);

    expect(loaded.portfolio.activeMineId).toBeNull();
    expect(loaded.portfolio.selectedMineId).toBe('gold');
    expect(loaded.portfolio.walletGold.equals('123456789')).toBe(true);
    expect(loaded.portfolio.mines.gold?.state.floors).toEqual(oldState.floors);
    expect(loaded.portfolio.mines.gold?.offline?.startedAtMs).toBe(1_500);
    expect(migrated.schemaVersion).toBe(4);
    expect(deserializePortfolioSaveDocument(migrated).portfolio.walletGold.equals('123456789')).toBe(true);
  });

  it('rejects nested wallets, unknown sites and inconsistent offline intervals', () => {
    const valid = createPortfolioSaveDocument(createInitialPortfolio(0), 0);
    expect(() => deserializePortfolioSaveDocument({
      ...valid,
      mines: { gold: { ...valid.mines.gold, state: { ...valid.mines.gold!.state, gold: '100' } } },
    })).toThrow();
    expect(() => deserializePortfolioSaveDocument({
      ...valid,
      mines: { ...valid.mines, moon: valid.mines.gold },
    })).toThrow();
    expect(() => deserializePortfolioSaveDocument({
      ...valid,
      activeMineId: null,
    })).toThrow();
  });

  it('rejects an already-claimed interval and a forged visit sequence', () => {
    const purchase = purchaseMine(readyToBuy(), 'amethyst', 0);
    if (purchase.status !== 'purchased') throw new Error('Fixture purchase failed.');
    const entered = enterMine(purchase.portfolio, 'amethyst', 1_000);
    if (entered.status !== 'entered') throw new Error('Fixture entry failed.');
    const valid = createPortfolioSaveDocument(entered.portfolio, 1_000);
    const gold = valid.mines.gold!;

    expect(() => deserializePortfolioSaveDocument({
      ...valid,
      mines: {
        ...valid.mines,
        gold: { ...gold, lastClaimedSequence: gold.offlineSequence },
      },
    })).toThrow(/inconsistent visit or offline interval/);
    expect(() => deserializePortfolioSaveDocument({
      ...valid,
      mines: {
        ...valid.mines,
        gold: { ...gold, visitCount: gold.visitCount + 1 },
      },
    })).toThrow(/inconsistent visit or offline interval/);
    expect(() => deserializePortfolioSaveDocument({
      ...valid,
      selectedMineId: 'gold',
    })).toThrow(/selected mine/);
  });
});
