import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { calculateExcavatorPose } from '../../src/game/view-model/excavatorAnimation';
import { BORU_ACTION_ASSETS, resolveMarketplaceRuntimeSlot } from '../../src/game/assets/marketplaceRuntimeAssets';

describe('Boru excavator', () => {
  it.each([
    [0, 'travel-empty', 0, 120, false],
    [0.16, 'travel-empty', 4, 155, false],
    [0.32, 'scoop', 0, 190, false],
    [0.57, 'scoop', 7, 190, false],
    [0.58, 'travel-loaded', 0, 190, true],
    [0.71, 'travel-loaded', 4, 155, true],
    [0.84, 'deposit', 0, 120, true],
    [0.999, 'deposit', 7, 120, true],
  ])('maps lap %s to a rooted, correctly facing action', (progress, action, frame, x, facesLeft) => {
    const pose = calculateExcavatorPose(Number(progress), 120, 190);
    expect(pose).toMatchObject({ action, frame, facesLeft });
    expect(pose.x).toBeCloseTo(Number(x));
  });

  it('keeps all five crew routes inside the endpoints and preserves the lap offset', () => {
    for (let tick = 0; tick < 1000; tick++) {
      for (let worker = 0; worker < 5; worker++) {
        const pose = calculateExcavatorPose((tick / 1000 + worker / 5) % 1, 120, 190);
        expect(pose.x).toBeGreaterThanOrEqual(120);
        expect(pose.x).toBeLessThanOrEqual(190);
        expect(pose.frame).toBeGreaterThanOrEqual(0);
        expect(pose.frame).toBeLessThan(8);
      }
    }
  });

  it('requires a purchased assignment; unassigned floors remain Mica', () => {
    expect(resolveMarketplaceRuntimeSlot('miner:floor-1', 'miner', null, () => true)
      .animation.assetId).toBe('miner:N:mica:idle');
    expect(resolveMarketplaceRuntimeSlot('miner:floor-1', 'miner', {
      catInstanceId: 'owned-boru', assetId: 'miner:SSR:boru:idle',
    }, () => true).animation.characterName).toBe('Boru');
  });

  it('ships four separate RGBA sheets with exactly eight 128px cells', () => {
    for (const asset of Object.values(BORU_ACTION_ASSETS)) {
      const path = `public${asset.publicPath}`;
      expect(existsSync(path)).toBe(true);
      const png = readFileSync(path);
      expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([512, 256, 6]);
      expect(asset.frameCount).toBe(8);
    }
  });

  it.each([-1, 1, NaN, Infinity])('rejects invalid progress %s', (progress) => {
    expect(() => calculateExcavatorPose(progress, 0, 100)).toThrow();
  });
});
