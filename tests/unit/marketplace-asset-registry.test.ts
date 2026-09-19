import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getMarketplaceAsset,
  listMarketplaceAssets,
  MARKETPLACE_ASSETS,
  MARKETPLACE_ASSET_IDS,
} from '../../src/ui/marketplaceAssetRegistry';
import { MARKETPLACE_RUNTIME_ASSET_IDS } from '../../src/game/assets/marketplaceRuntimeAssets';

const PNG_SIGNATURE = '89504e470d0a1a0a';

describe('Marketplace asset registry', () => {
  it('exposes the expanded stable catalog without duplicate IDs or paths', () => {
    expect(MARKETPLACE_ASSETS).toHaveLength(9);
    expect(new Set(MARKETPLACE_ASSET_IDS).size).toBe(MARKETPLACE_ASSET_IDS.length);
    expect(new Set(MARKETPLACE_ASSETS.map((asset) => asset.portraitPath)).size).toBe(
      MARKETPLACE_ASSETS.length,
    );
    expect(
      MARKETPLACE_ASSETS
        .filter((asset) => asset.runtimeIntegrated)
        .map((asset) => asset.assetId),
    ).toEqual(MARKETPLACE_RUNTIME_ASSET_IDS);
    expect(
      MARKETPLACE_ASSETS
        .filter((asset) => !asset.runtimeIntegrated)
        .every((asset) => asset.catalogStatus === 'preview-canonical'),
    ).toBe(true);
    expect(
      MARKETPLACE_ASSETS.every(
        (asset) => asset.runtimeIntegrated === (asset.catalogStatus === 'runtime-integrated'),
      ),
    ).toBe(true);
  });

  it('resolves known IDs and fails closed for unknown listing data', () => {
    expect(getMarketplaceAsset('elevator-cargo-cat:SSR:mofy:idle')).toEqual(
      expect.objectContaining({
        characterName: 'Mofy',
        roleId: 'elevator',
      }),
    );
    expect(getMarketplaceAsset('warehouse-manager:SR:cipher:idle')).toEqual(
      expect.objectContaining({
        characterName: 'Cipher',
        roleId: 'warehouse',
      }),
    );
    expect(getMarketplaceAsset('miner:N:mica:idle')).toEqual(
      expect.objectContaining({
        characterName: 'Mica',
        roleId: 'miner',
        rarityTier: 'N',
      }),
    );
    expect(getMarketplaceAsset('miner:SSR:forge:idle')).toEqual(
      expect.objectContaining({
        characterName: 'Forge',
        roleId: 'miner',
        rarityTier: 'SSR',
      }),
    );
    expect(getMarketplaceAsset('unknown:SSR:attacker:idle')).toBeNull();
    expect(getMarketplaceAsset('')).toBeNull();
  });

  it('keeps every canonical portrait as an exact 128x128 RGBA PNG', () => {
    for (const asset of MARKETPLACE_ASSETS) {
      const publicPath = resolve('public', asset.portraitPath.slice(1));
      const sourcePath = resolve(asset.sourcePortraitPath);
      expect(existsSync(publicPath), asset.assetId).toBe(true);
      expect(existsSync(sourcePath), `${asset.assetId} source`).toBe(true);

      const bytes = readFileSync(publicPath);
      expect(bytes.subarray(0, 8).toString('hex'), asset.assetId).toBe(PNG_SIGNATURE);
      expect(bytes.readUInt32BE(16), `${asset.assetId} width`).toBe(128);
      expect(bytes.readUInt32BE(20), `${asset.assetId} height`).toBe(128);
      expect(bytes[25], `${asset.assetId} color type`).toBe(6);
    }
  });

  it('keeps registry paths independent of display names', () => {
    for (const asset of listMarketplaceAssets()) {
      expect(asset.portraitPath).toContain('/assets/marketplace/catalog/');
      expect(asset.portraitPath).not.toContain(asset.characterName);
      expect(asset.portraitPath).not.toContain('..');
      expect(asset.sourcePortraitPath).not.toContain('public/');
    }
  });
});
