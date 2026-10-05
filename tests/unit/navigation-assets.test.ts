import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  NAVIGATION_ICON_ASSETS,
  NAVIGATION_ICON_SOURCE_SIZE,
} from '../../src/game/assets/navigationAssets';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('bottom navigation icon artwork', () => {
  it('ships five separate transparent PNG textures', () => {
    expect(NAVIGATION_ICON_ASSETS).toHaveLength(5);
    expect(new Set(NAVIGATION_ICON_ASSETS.map(({ path }) => path)).size).toBe(5);
    expect(new Set(NAVIGATION_ICON_ASSETS.map(({ textureKey }) => textureKey)).size).toBe(5);

    for (const { path } of NAVIGATION_ICON_ASSETS) {
      const assetPath = resolve('public', path.slice(1));
      expect(existsSync(assetPath)).toBe(true);

      const png = readFileSync(assetPath);
      expect(png.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
      expect(png.readUInt32BE(16)).toBe(NAVIGATION_ICON_SOURCE_SIZE);
      expect(png.readUInt32BE(20)).toBe(NAVIGATION_ICON_SOURCE_SIZE);
      expect(png[25]).toBe(6); // PNG color type 6: RGBA, not a baked checkerboard.
    }
  });
});
