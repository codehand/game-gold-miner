import { describe, expect, it } from 'vitest';

import { getMineBalance, getMineSite, MINE_SITE_IDS } from '../../src/config';
import { GameNumber } from '../../src/core/numbers/GameNumber';
import { EMPTY_BOOST_STATE } from '../../src/core/boost/boost';
import {
  activeGameState,
  advanceActiveMine,
  createInitialPortfolio,
  enterMine,
  enterMineWithPendingClaim,
  previewMineOfflineGrant,
  purchaseMine,
  settlePendingMineClaim,
  suspendActiveMine,
  type PortfolioState,
} from '../../src/core/portfolio/portfolio';

function readyForAmethyst(timestampMs = 0): PortfolioState {
  const initial = createInitialPortfolio(timestampMs);
  const gold = initial.mines.gold!;
  return {
    ...initial,
    walletGold: GameNumber.from('2e9'),
    mines: {
      ...initial.mines,
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

describe('multi-mine portfolio core', () => {
  it('starts with one Gold Mine and one wallet, not a wallet copied per mine', () => {
    const portfolio = createInitialPortfolio(1_000);

    expect(MINE_SITE_IDS).toHaveLength(6);
    expect(portfolio.activeMineId).toBe('gold');
    expect(portfolio.walletGold.serialize()).toBe('100');
    expect(Object.hasOwn(portfolio.mines.gold!.state, 'gold')).toBe(false);
    expect(activeGameState(portfolio)?.gold.serialize()).toBe('100');
    expect(portfolio.mines.amethyst).toBeUndefined();
  });

  it('requires the previous mine milestone and spends the shared wallet once', () => {
    const locked = purchaseMine(createInitialPortfolio(0), 'amethyst', 0);
    expect(locked.status).toBe('prerequisite-locked');

    const purchase = purchaseMine(readyForAmethyst(), 'amethyst', 0);
    expect(purchase.status).toBe('purchased');
    if (purchase.status !== 'purchased') return;

    expect(purchase.portfolio.walletGold.equals('1e9')).toBe(true);
    expect(purchase.portfolio.activeMineId).toBe('gold');
    expect(purchase.portfolio.mines.amethyst?.visitCount).toBe(0);
    expect(purchase.portfolio.mines.amethyst?.offline).toBeNull();
    expect(purchaseMine(purchase.portfolio, 'amethyst', 0).status).toBe('already-owned');
  });

  it('produces live gold only in the foreground mine and pays the departed mine once on return', () => {
    const purchase = purchaseMine(readyForAmethyst(), 'amethyst', 0);
    if (purchase.status !== 'purchased') throw new Error('Fixture purchase failed.');
    const firstEntry = enterMine(purchase.portfolio, 'amethyst', 1_000);
    if (firstEntry.status !== 'entered') throw new Error('First entry failed.');

    expect(firstEntry.grant.reward.serialize()).toBe('0');
    expect(firstEntry.portfolio.mines.gold?.offline?.sequence).toBe(1);
    const goldAtDeparture = firstEntry.portfolio.mines.gold?.state;
    const afterAmethyst = advanceActiveMine(firstEntry.portfolio, 60_000);
    expect(afterAmethyst.walletGold.greaterThan(firstEntry.portfolio.walletGold)).toBe(true);
    expect(afterAmethyst.mines.gold?.state).toBe(goldAtDeparture);

    const pendingGold = previewMineOfflineGrant(afterAmethyst, 'gold', 60_000);
    expect(pendingGold?.reward.greaterThan(0)).toBe(true);
    const returnToGold = enterMine(afterAmethyst, 'gold', 60_000);
    if (returnToGold.status !== 'entered') throw new Error('Return failed.');
    expect(returnToGold.grant.reward.equals(pendingGold!.reward)).toBe(true);
    expect(returnToGold.portfolio.walletGold.equals(
      afterAmethyst.walletGold.add(pendingGold!.reward),
    )).toBe(true);
    expect(returnToGold.portfolio.mines.gold?.lastClaimedSequence).toBe(1);
    expect(returnToGold.portfolio.mines.gold?.offline).toBeNull();
    expect(enterMine(returnToGold.portfolio, 'gold', 60_000).status).toBe('already-active');
    expect(previewMineOfflineGrant(returnToGold.portfolio, 'gold', 60_000)).toBeNull();
  });

  it('caps a suspended mine at two hours and never produces a first-visit windfall', () => {
    const suspended = suspendActiveMine(createInitialPortfolio(0), 1_000);
    const interval = suspended.mines.gold!.offline!;
    const preview = previewMineOfflineGrant(suspended, 'gold', 3 * 60 * 60 * 1_000);
    const expected = interval.savedRatePerSecond.multiply(7_200 * 0.5);

    expect(suspended.activeMineId).toBeNull();
    expect(preview?.creditedDurationMs).toBe(7_200_000);
    expect(preview?.reward.equals(expected)).toBe(true);
    expect(suspended.walletGold.equals(createInitialPortfolio(0).walletGold)).toBe(true);

    const purchase = purchaseMine(readyForAmethyst(), 'amethyst', 0);
    if (purchase.status !== 'purchased') throw new Error('Fixture purchase failed.');
    expect(previewMineOfflineGrant(purchase.portfolio, 'amethyst', 7_200_000)).toBeNull();
    const firstEntry = enterMine(purchase.portfolio, 'amethyst', 7_200_000);
    expect(firstEntry.status).toBe('entered');
    if (firstEntry.status === 'entered') {
      expect(firstEntry.grant.reward.serialize()).toBe('0');
    }
  });

  it('lets a cloud-pending entry run without crediting its frozen reward twice', () => {
    const purchase = purchaseMine(readyForAmethyst(), 'amethyst', 0);
    if (purchase.status !== 'purchased') throw new Error('Fixture purchase failed.');
    const visit = enterMine(purchase.portfolio, 'amethyst', 1_000);
    if (visit.status !== 'entered') throw new Error('First entry failed.');
    const whileAway = advanceActiveMine(visit.portfolio, 61_000);
    const expected = previewMineOfflineGrant(whileAway, 'gold', 61_000)!;
    const walletBefore = whileAway.walletGold;

    const provisional = enterMineWithPendingClaim(whileAway, 'gold', 61_000);
    if (provisional.status !== 'entered') throw new Error('Pending entry failed.');
    expect(provisional.portfolio.activeMineId).toBe('gold');
    expect(provisional.portfolio.walletGold.equals(walletBefore)).toBe(true);
    expect(provisional.portfolio.mines.gold?.pendingClaim?.sequence).toBe(1);
    expect(provisional.portfolio.mines.gold?.lastClaimedSequence).toBe(0);
    expect(enterMine(provisional.portfolio, 'amethyst', 62_000).status).toBe('claim-pending');

    const progressed = advanceActiveMine(provisional.portfolio, 62_000);
    const settled = settlePendingMineClaim(progressed, 'gold', 1, expected.reward);
    expect(settled.walletGold.equals(progressed.walletGold.add(expected.reward))).toBe(true);
    expect(settled.mines.gold?.pendingClaim).toBeNull();
    expect(settled.mines.gold?.lastClaimedSequence).toBe(1);
    expect(() => settlePendingMineClaim(settled, 'gold', 1, expected.reward)).toThrow();
  });

  it('uses distinct site balances while preserving gold-equivalent transport', () => {
    expect(getMineSite('diamond').resourceValueMultiplier).toBe(32);
    expect(getMineBalance('gold').floors[0]?.baseYield).toBe(10);
    expect(getMineBalance('diamond').floors[0]?.baseYield).toBe(320);
    expect(getMineBalance('diamond').warehouse.baseCapacity).toBe(1_920);
  });

  it('applies an account Boost only to the mine it was bound to', () => {
    const purchase = purchaseMine(readyForAmethyst(), 'amethyst', 0);
    if (purchase.status !== 'purchased') throw new Error('Fixture purchase failed.');
    const firstEntry = enterMine(purchase.portfolio, 'amethyst', 1_000);
    if (firstEntry.status !== 'entered') throw new Error('First entry failed.');
    const bound = { ...firstEntry.portfolio, boostMineId: 'amethyst' as const };
    const boost = { lastActivatedAtMs: 1_000 };

    const goldWithoutBoost = previewMineOfflineGrant(
      bound, 'gold', 60_000, EMPTY_BOOST_STATE,
    );
    const goldWithOtherMineBoost = previewMineOfflineGrant(bound, 'gold', 60_000, boost);
    expect(goldWithOtherMineBoost?.reward.equals(goldWithoutBoost!.reward)).toBe(true);

    const returned = enterMine(bound, 'gold', 60_000, undefined, boost);
    if (returned.status !== 'entered') throw new Error('Return failed.');
    const amethystWithoutBoost = previewMineOfflineGrant(
      returned.portfolio, 'amethyst', 120_000, EMPTY_BOOST_STATE,
    );
    const amethystWithBoundBoost = previewMineOfflineGrant(
      returned.portfolio, 'amethyst', 120_000, boost,
    );
    expect(amethystWithBoundBoost?.reward.greaterThan(amethystWithoutBoost!.reward)).toBe(true);
  });
});
