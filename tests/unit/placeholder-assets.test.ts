import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_TEXTURES,
} from '../../src/game/assets/placeholderAssets';

interface PlaceholderAssetRecord {
  readonly id: string;
  readonly path: string;
  readonly size: string;
  readonly role: string;
  readonly status: string;
}

interface PlaceholderAssetManifest {
  readonly family: string;
  readonly rights: {
    readonly externalBranding: boolean;
    readonly thirdPartyAssets: boolean;
  };
  readonly assets: readonly PlaceholderAssetRecord[];
}

const PNG_SIGNATURE = '89504e470d0a1a0a';

describe('Step 32 original placeholder assets', () => {
  it('publishes one semantic runtime file for every generated texture key', () => {
    expect(PLACEHOLDER_ASSETS).toHaveLength(
      Object.keys(PLACEHOLDER_TEXTURES).length,
    );
    expect(new Set(PLACEHOLDER_ASSETS.map(([key]) => key)).size).toBe(
      PLACEHOLDER_ASSETS.length,
    );
  });

  it('keeps every runtime sprite as a 128x128 RGBA PNG', () => {
    for (const [, publicPath] of PLACEHOLDER_ASSETS) {
      const bytes = readFileSync(resolve('public', publicPath.slice(1)));

      expect(bytes.subarray(0, 8).toString('hex'), publicPath).toBe(
        PNG_SIGNATURE,
      );
      expect(bytes.readUInt32BE(16), `${publicPath} width`).toBe(128);
      expect(bytes.readUInt32BE(20), `${publicPath} height`).toBe(128);
      expect(bytes[25], `${publicPath} must use RGBA color type`).toBe(6);
    }
  });

  it('records generated provenance and excludes third-party branding', () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve('public/assets/placeholder/asset-manifest.json'),
        'utf8',
      ),
    ) as PlaceholderAssetManifest;

    expect(manifest.family).toBe('step-32-original-placeholder-presentation');
    expect(manifest.rights.thirdPartyAssets).toBe(false);
    expect(manifest.rights.externalBranding).toBe(false);
    expect(manifest.assets).toHaveLength(PLACEHOLDER_ASSETS.length);
    expect(manifest.assets.every((asset) => {
      return asset.status === 'step-32-placeholder' && asset.size === '128x128';
    })).toBe(true);
  });
});
