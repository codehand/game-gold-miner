import { describe, expect, it } from 'vitest';

import { GameNumber } from '../../src/core/numbers/GameNumber';
import type { CatRosterState } from '../../src/core/cats';
import { createCatProductionModifiers } from '../../src/core/cats';
import { createInitialPortfolio, purchaseMine } from '../../src/core/portfolio/portfolio';
import {
  migratePortfolioCatRoster,
  projectCatRosterToMine,
} from '../../src/core/portfolio/portfolioCatRoster';
import {
  createPortfolioSaveDocument,
  deserializePortfolioSaveDocument,
} from '../../src/persistence/portfolioSaveSchema';

const ROSTER: CatRosterState = {
  cats: [
    {
      catInstanceId: 'gold-forge',
      ownerUserId: 'player',
      assetId: 'miner:SSR:forge:idle',
      displayName: 'Gold Forge',
      roleId: 'miner',
      rarityTier: 'SSR',
      level: 1,
      attributes: { power: 90, speed: 90, capacity: 90, efficiency: 90 },
      calculationVersion: 1,
      availabilityState: 'Assigned',
      assignedSlotKey: 'mine:gold:miner:floor-1',
      updatedAt: 0,
    },
    {
      catInstanceId: 'amethyst-forge',
      ownerUserId: 'player',
      assetId: 'miner:SSR:forge:idle',
      displayName: 'Amethyst Forge',
      roleId: 'miner',
      rarityTier: 'SSR',
      level: 1,
      attributes: { power: 60, speed: 60, capacity: 60, efficiency: 60 },
      calculationVersion: 1,
      availabilityState: 'Assigned',
      assignedSlotKey: 'mine:amethyst:miner:floor-1',
      updatedAt: 0,
    },
  ],
  assignments: [
    { slotKey: 'mine:gold:miner:floor-1', catInstanceId: 'gold-forge' },
    { slotKey: 'mine:amethyst:miner:floor-1', catInstanceId: 'amethyst-forge' },
  ],
  assignmentRevision: 2,
  collectionRevision: 2,
};

describe('portfolio cat slots', () => {
  it('projects duplicate short floor slots to their own mines only', () => {
    const gold = projectCatRosterToMine(ROSTER, 'gold');
    const amethyst = projectCatRosterToMine(ROSTER, 'amethyst');

    expect(gold.assignments).toEqual([{ slotKey: 'miner:floor-1', catInstanceId: 'gold-forge' }]);
    expect(amethyst.assignments).toEqual([{ slotKey: 'miner:floor-1', catInstanceId: 'amethyst-forge' }]);
    expect(createCatProductionModifiers(gold).miningOutputMultiplierByFloor['floor-1'])
      .toBeGreaterThan(createCatProductionModifiers(amethyst).miningOutputMultiplierByFloor['floor-1']);
  });

  it('migrates old unqualified slots to Gold and rejects unknown mine namespaces', () => {
    const legacy = {
      ...ROSTER,
      cats: ROSTER.cats.slice(0, 1).map((cat) => ({ ...cat, assignedSlotKey: 'miner:floor-1' })),
      assignments: [{ slotKey: 'miner:floor-1' as const, catInstanceId: 'gold-forge' }],
    };
    expect(migratePortfolioCatRoster(legacy).assignments[0].slotKey)
      .toBe('mine:gold:miner:floor-1');
    expect(() => migratePortfolioCatRoster({
      ...ROSTER,
      cats: ROSTER.cats.map((cat, index) => index === 0
        ? { ...cat, assignedSlotKey: 'mine:moon:miner:floor-1' }
        : cat),
      assignments: ROSTER.assignments.map((assignment, index) => index === 0
        ? { ...assignment, slotKey: 'mine:moon:miner:floor-1' }
        : assignment),
    })).toThrow(/Unsupported portfolio role slot/);
  });

  it('round-trips independent assignments to the same floor across owned mines', () => {
    const initial = createInitialPortfolio(0);
    const gold = initial.mines.gold!;
    const eligible = {
      ...initial,
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

    const saved = createPortfolioSaveDocument(purchase.portfolio, 0, ROSTER);
    const loaded = deserializePortfolioSaveDocument(saved);
    expect(loaded.catRoster).toEqual(ROSTER);
    expect(saved.assignments).toEqual(ROSTER.assignments);
    expect(() => createPortfolioSaveDocument(initial, 0, ROSTER))
      .toThrow(/requires an owned mine/);
  });

  it('upgrades an early V4 save with bare Gold slots on load', () => {
    const goldRoster: CatRosterState = {
      ...ROSTER,
      cats: ROSTER.cats.slice(0, 1),
      assignments: ROSTER.assignments.slice(0, 1),
    };
    const canonical = createPortfolioSaveDocument(createInitialPortfolio(0), 0, goldRoster);
    const earlyV4 = {
      ...canonical,
      cats: canonical.cats.map((cat) => ({ ...cat, assignedSlotKey: 'miner:floor-1' })),
      assignments: [{ slotKey: 'miner:floor-1', catInstanceId: 'gold-forge' }],
    };

    const loaded = deserializePortfolioSaveDocument(earlyV4);
    expect(loaded.catRoster.assignments).toEqual(goldRoster.assignments);
    expect(loaded.catRoster.cats[0].assignedSlotKey).toBe('mine:gold:miner:floor-1');
  });
});
