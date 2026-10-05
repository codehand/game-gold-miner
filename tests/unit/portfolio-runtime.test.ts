import { describe, expect, it } from 'vitest';

import { GameNumber } from '../../src/core/numbers/GameNumber';
import { createCatProductionModifiers, type CatRosterState } from '../../src/core/cats';
import { createInitialPortfolio, enterMine, suspendActiveMine } from '../../src/core/portfolio/portfolio';
import { PortfolioMineRuntime } from '../../src/game/runtime/PortfolioMineRuntime';

describe('PortfolioMineRuntime', () => {
  it('adopts the exact accepted wallet and resumes a server-suspended mine', () => {
    const initial = createInitialPortfolio(0);
    const runtime = new PortfolioMineRuntime({ portfolio: initial, now: () => 0 });
    const accepted = { ...initial, walletGold: GameNumber.from(500) };
    runtime.adoptPortfolio(accepted);
    expect(runtime.state.gold.equals(500)).toBe(true);

    const suspended = suspendActiveMine(accepted, 1_000);
    runtime.adoptPortfolio(suspended);
    expect(runtime.portfolio.activeMineId).toBeNull();
    const resumed = enterMine(suspended, 'gold', 2_000);
    expect(resumed.status).toBe('entered');
    if (resumed.status !== 'entered') return;
    runtime.adoptPortfolio(resumed.portfolio);
    expect(runtime.activeMineId).toBe('gold');
    expect(runtime.state.gold.equals(resumed.portfolio.walletGold)).toBe(true);
  });

  it('keeps migrated Gold cat assignments in the save without applying them to a new mine', async () => {
    let now = 0;
    const initial = createInitialPortfolio(now);
    const gold = initial.mines.gold!;
    const roster: CatRosterState = {
      cats: [{
        catInstanceId: 'forge-1',
        ownerUserId: 'player-1',
        assetId: 'miner:SSR:forge:idle',
        displayName: 'Forge',
        roleId: 'miner',
        rarityTier: 'SSR',
        level: 1,
        attributes: { power: 100, speed: 100, capacity: 100, efficiency: 100 },
        calculationVersion: 1,
        availabilityState: 'Assigned',
        assignedSlotKey: 'miner:floor-1',
        updatedAt: now,
      }, {
        catInstanceId: 'forge-2',
        ownerUserId: 'player-1',
        assetId: 'miner:SSR:forge:idle',
        displayName: 'Forge',
        roleId: 'miner',
        rarityTier: 'SSR',
        level: 1,
        attributes: { power: 80, speed: 80, capacity: 80, efficiency: 80 },
        calculationVersion: 1,
        availabilityState: 'Idle',
        assignedSlotKey: null,
        updatedAt: now,
      }],
      assignments: [{ slotKey: 'miner:floor-1', catInstanceId: 'forge-1' }],
      assignmentRevision: 1,
      collectionRevision: 1,
    };
    const committedRosters: CatRosterState[] = [];
    const runtime = new PortfolioMineRuntime({
      portfolio: {
        ...initial,
        walletGold: GameNumber.from('2e12'),
        mines: {
          gold: {
            ...gold,
            state: {
              ...gold.state,
              floors: gold.state.floors.map((floor) => floor.floorNumber <= 5
                ? { ...floor, isUnlocked: true, mineShaftLevel: 5 }
                : floor),
            },
          },
        },
      },
      catRoster: roster,
      now: () => now,
    });
    const commit = async (_portfolio: unknown, savedRoster: CatRosterState): Promise<void> => {
      committedRosters.push(savedRoster);
    };

    expect(createCatProductionModifiers(runtime.catRoster)
      .miningOutputMultiplierByFloor['floor-1']).toBeGreaterThan(1);
    expect((await runtime.buyMineDurably('amethyst', commit)).status).toBe('purchased');
    now = 1_000;
    expect((await runtime.enterMineDurably('amethyst', commit)).status).toBe('entered');
    expect(runtime.catRoster.assignments).toEqual([]);
    expect(runtime.fullCatRoster.assignments).toEqual([
      { slotKey: 'mine:gold:miner:floor-1', catInstanceId: 'forge-1' },
    ]);
    expect(createCatProductionModifiers(runtime.catRoster)
      .miningOutputMultiplierByFloor['floor-1']).toBeUndefined();
    expect(committedRosters).toEqual([runtime.fullCatRoster, runtime.fullCatRoster]);

    const failWrite = async (): Promise<void> => { throw new Error('IndexedDB unavailable'); };
    expect(await runtime.assignCatDurably('miner:floor-1', 'forge-2', 1, failWrite))
      .toEqual({ success: false, reason: 'save-failed' });
    expect(runtime.fullCatRoster.assignments).toHaveLength(1);
    expect((await runtime.assignCatDurably('miner:floor-1', 'forge-2', 1, commit)).success)
      .toBe(true);
    expect(runtime.fullCatRoster.assignments).toEqual([
      { slotKey: 'mine:amethyst:miner:floor-1', catInstanceId: 'forge-2' },
      { slotKey: 'mine:gold:miner:floor-1', catInstanceId: 'forge-1' },
    ]);
    expect(runtime.catRoster.assignments).toEqual([
      { slotKey: 'miner:floor-1', catInstanceId: 'forge-2' },
    ]);

    now = 2_000;
    expect((await runtime.enterMineDurably('gold', commit)).status).toBe('entered');
    expect(runtime.catRoster.assignments).toEqual(roster.assignments);
    expect(runtime.fullCatRoster.assignments).toHaveLength(2);
  });

  it('changes the scene source to the entered mine while keeping one wallet', () => {
    let now = 0;
    const initial = createInitialPortfolio(now);
    const gold = initial.mines.gold!;
    const applied: string[] = [];
    const runtime = new PortfolioMineRuntime({
      portfolio: {
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
      },
      now: () => now,
      onCommandApplied: (portfolio) => applied.push(portfolio.activeMineId ?? 'none'),
    });

    expect(runtime.buyMine('amethyst').status).toBe('purchased');
    const walletAfterPurchase = runtime.portfolio.walletGold;
    now = 1_000;
    expect(runtime.enterMine('amethyst').status).toBe('entered');
    expect(runtime.activeMineId).toBe('amethyst');
    expect(runtime.state.gold.equals(walletAfterPurchase)).toBe(true);
    expect(runtime.portfolio.mines.gold?.offline?.sequence).toBe(1);

    now = 60_000;
    runtime.advance();
    const amethystStateAtDeparture = runtime.portfolio.mines.amethyst?.state;
    const preview = runtime.previewOfflineReward('gold');
    expect(preview?.reward.greaterThan(0)).toBe(true);
    expect(runtime.enterMine('gold').status).toBe('entered');
    expect(runtime.activeMineId).toBe('gold');
    expect(runtime.portfolio.mines.amethyst?.state).toEqual(amethystStateAtDeparture);
    expect(runtime.portfolio.mines.amethyst?.offline?.sequence).toBe(1);
    expect(applied).toEqual(['gold', 'amethyst', 'gold']);
  });

  it('does not spend or settle a mine interval when a durable write fails', async () => {
    let now = 0;
    const initial = createInitialPortfolio(now);
    const gold = initial.mines.gold!;
    const runtime = new PortfolioMineRuntime({
      portfolio: {
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
      },
      now: () => now,
    });
    const failWrite = async (): Promise<void> => { throw new Error('IndexedDB unavailable'); };
    const saved: string[] = [];
    const commit = async (portfolio: { walletGold: GameNumber }): Promise<void> => {
      saved.push(portfolio.walletGold.serialize());
    };

    const originalWallet = runtime.portfolio.walletGold;
    expect((await runtime.buyMineDurably('amethyst', failWrite)).status).toBe('save-failed');
    expect(runtime.portfolio.walletGold.equals(originalWallet)).toBe(true);
    expect(runtime.portfolio.mines.amethyst).toBeUndefined();
    expect((await runtime.buyMineDurably('amethyst', commit)).status).toBe('purchased');
    expect(saved).toHaveLength(1);

    now = 1_000;
    expect((await runtime.enterMineDurably('amethyst', failWrite)).status).toBe('save-failed');
    expect(runtime.activeMineId).toBe('gold');
    expect(runtime.portfolio.mines.gold?.offline).toBeNull();
    expect((await runtime.enterMineDurably('amethyst', commit)).status).toBe('entered');
    now = 60_000;
    const expectedReward = runtime.previewOfflineReward('gold')!.reward;
    const walletBeforeClaim = runtime.portfolio.walletGold;
    expect((await runtime.enterMineDurably('gold', failWrite)).status).toBe('save-failed');
    expect(runtime.activeMineId).toBe('amethyst');
    expect(runtime.portfolio.mines.gold?.offline?.sequence).toBe(1);
    expect(runtime.portfolio.walletGold.equals(walletBeforeClaim)).toBe(true);
    const claimed = await runtime.enterMineDurably('gold', commit);
    expect(claimed.status).toBe('entered');
    if (claimed.status === 'entered') {
      expect(claimed.grant.reward.equals(expectedReward)).toBe(true);
    }
    expect(runtime.portfolio.mines.gold?.lastClaimedSequence).toBe(1);
    expect((await runtime.enterMineDurably('gold', commit)).status).toBe('already-active');
    expect(saved).toHaveLength(3);
  });

  it('suspends foreground ticks until its capped offline interval is claimed', async () => {
    let now = 0;
    const runtime = new PortfolioMineRuntime({
      portfolio: createInitialPortfolio(now),
      now: () => now,
    });
    now = 1_000;
    runtime.suspend(now);
    const suspendedWallet = runtime.portfolio.walletGold;
    const suspendedTick = runtime.portfolio.mines.gold!.state.simulationTick;
    now = 3 * 60 * 60 * 1_000;

    runtime.advance();
    expect(runtime.portfolio.walletGold.equals(suspendedWallet)).toBe(true);
    expect(runtime.portfolio.mines.gold!.state.simulationTick).toBe(suspendedTick);
    expect(runtime.previewOfflineReward('gold')?.creditedDurationMs).toBe(7_200_000);

    const resumed = await runtime.enterMineDurably('gold', async () => {});
    expect(resumed.status).toBe('entered');
    if (resumed.status === 'entered') {
      expect(runtime.portfolio.walletGold.equals(suspendedWallet.add(resumed.grant.reward))).toBe(true);
    }
    expect(runtime.portfolio.mines.gold?.offline).toBeNull();
    expect((await runtime.enterMineDurably('gold', async () => {})).status).toBe('already-active');
  });
});
