import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MINE_SITE_IDS } from '../../src/config';
import { floorDepthBand, mineFloorArt, MINE_SITE_ART } from '../../src/game/assets/mineSiteArt';

describe('resource-specific mine floor art', () => {
  it('selects the correct depth band at floors 5, 6, 10 and 11', () => {
    expect([5, 6, 10, 11, 15].map(floorDepthBand)).toEqual([0, 1, 1, 2, 2]);
    expect(() => floorDepthBand(16)).toThrow();
  });

  it('provides distinct, present floor and pile assets for every gem site', () => {
    const keys = new Set<string>();
    for (const siteId of MINE_SITE_IDS) {
      const family = MINE_SITE_ART[siteId];
      expect(existsSync(resolve('public', family.surface.path.slice(1)))).toBe(true);
      for (const structure of [family.towerLoaded, family.towerEmpty, family.warehouse,
        family.cartFilled, family.shaft, family.pour, family.impact, family.tobiCartFilled,
        family.rivetCartFilled]) {
        expect(existsSync(resolve('public', structure.path.slice(1)))).toBe(true);
      }
      for (const floorNumber of [1, 6, 11]) {
        const asset = mineFloorArt(siteId, floorNumber);
        expect(existsSync(resolve('public', asset.path.slice(1)))).toBe(true);
        if (siteId !== 'gold') {
          expect(keys.has(asset.key)).toBe(false);
          keys.add(asset.key);
        }
      }
      expect(existsSync(resolve('public', family.orePile.path.slice(1)))).toBe(true);
    }
    expect(keys.size).toBe(15);
  });
});
