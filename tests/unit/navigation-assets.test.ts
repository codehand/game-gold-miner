import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BOTTOM_NAVIGATION_MENU_ASSET_PATH,
  BOTTOM_NAVIGATION_MENU_SOURCE_HEIGHT,
  BOTTOM_NAVIGATION_MENU_SOURCE_WIDTH,
  calculateNavigationArtworkDisplaySize,
} from '../../src/game/assets/navigationAssets';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('bottom navigation menu artwork', () => {
  it('ships the reference-shaped transparent runtime menu artwork', () => {
    const assetPath = resolve('public', BOTTOM_NAVIGATION_MENU_ASSET_PATH.slice(1));
    expect(existsSync(assetPath)).toBe(true);

    const png = readFileSync(assetPath);
    expect(png.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
    expect(png.readUInt32BE(16)).toBe(BOTTOM_NAVIGATION_MENU_SOURCE_WIDTH);
    expect(png.readUInt32BE(20)).toBe(BOTTOM_NAVIGATION_MENU_SOURCE_HEIGHT);
  });

  it('fits the menu uniformly instead of stretching its height', () => {
    const display = calculateNavigationArtworkDisplaySize(360, 80, 2);

    expect(display.width).toBeLessThanOrEqual(356);
    expect(display.height).toBeLessThanOrEqual(76);
    expect(display.scale).toBe(0.5);
    expect(display.width / display.height).toBeCloseTo(
      BOTTOM_NAVIGATION_MENU_SOURCE_WIDTH / BOTTOM_NAVIGATION_MENU_SOURCE_HEIGHT,
      8,
    );
    expect(display.height).toBeGreaterThan(74);
  });
});
