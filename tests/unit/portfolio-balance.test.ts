import { describe, expect, it } from 'vitest';

import { getMineBalance, MINE_SITES } from '../../src/config';
import { createInitialGameState, GameNumber, simulateEconomyProgression } from '../../src/core';

describe('multi-mine progression budget', () => {
  it('places the first new mine within a reachable Gold Mine progression window', () => {
    const report = simulateEconomyProgression(60 * 60 * 1_000);
    const twoHours = simulateEconomyProgression(2 * 60 * 60 * 1_000);
    const fourHours = simulateEconomyProgression(4 * 60 * 60 * 1_000);
    const floorFive = report.events.find((event) =>
      event.type === 'floor-unlock' && event.targetId === 'floor-5');
    expect(floorFive).toBeDefined();
    expect(floorFive!.elapsedMs).toBeLessThan(60 * 60 * 1_000);
    const price = GameNumber.from(MINE_SITES[1].unlockPriceGold);
    expect(price.greaterThan(twoHours.state.gold)).toBe(true);
    expect(price.lessThanOrEqualTo(fourHours.state.gold)).toBe(true);
    for (let index = 2; index < MINE_SITES.length; index += 1) {
      expect(GameNumber.from(MINE_SITES[index].unlockPriceGold).greaterThan(
        MINE_SITES[index - 1].unlockPriceGold,
      )).toBe(true);
    }
  });

  it('checks the six-site purchase path with one wallet and site-specific costs', () => {
    let wallet = GameNumber.from(getMineBalance('gold').startingGold);
    let timestampMs = 0;
    for (const [index, site] of MINE_SITES.entries()) {
      if (site.id !== 'gold') {
        expect(site.upgradeCostMultiplier).not.toBe(site.resourceValueMultiplier);
      }
      const cost = GameNumber.from(site.unlockPriceGold);
      expect(wallet.greaterThanOrEqualTo(cost), `${site.id} purchase is reachable`).toBe(true);
      wallet = wallet.subtract(cost);
      const balance = getMineBalance(site.id);
      const initial = createInitialGameState(balance, timestampMs);
      const next = MINE_SITES[index + 1];
      const report = simulateEconomyProgression(
        next === undefined ? 60 * 60 * 1_000 : 5 * 60 * 60 * 1_000,
        timestampMs,
        balance,
        { ...initial, gold: wallet },
        next === undefined ? undefined : (state) =>
          state.floors[4].isUnlocked &&
          state.gold.greaterThanOrEqualTo(next.unlockPriceGold),
      );
      expect(report.unlockedFloorCount, `${site.id} reaches its floor gate`)
        .toBeGreaterThanOrEqual(5);
      wallet = report.state.gold;
      timestampMs += report.elapsedMs;
      if (next !== undefined) {
        expect(wallet.greaterThanOrEqualTo(next.unlockPriceGold),
          `${site.id} funds ${next.id} within five hours`)
          .toBe(true);
      }
    }
  }, 30_000);
});
