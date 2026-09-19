import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MARKETPLACE_ASSETS } from '../../src/ui/marketplaceAssetRegistry';
import {
  MARKETPLACE_RUNTIME_ANIMATION_ASSETS,
  MARKETPLACE_RUNTIME_ASSET_IDS,
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
  resolveMarketplaceRuntimeAsset,
} from '../../src/game/assets/marketplaceRuntimeAssets';

describe('Marketplace runtime asset contract', () => {
  it('keeps one approved, role-matched runtime asset per v1 role', () => {
    expect(MARKETPLACE_RUNTIME_ASSET_IDS).toEqual([
      'elevator-cargo-cat:SSR:mofy:idle',
      'warehouse-manager:SR:baron:idle',
      'miner:SSR:forge:idle',
    ]);
    expect(new Set(MARKETPLACE_RUNTIME_ASSET_IDS).size).toBe(
      MARKETPLACE_RUNTIME_ASSET_IDS.length,
    );

    for (const asset of Object.values(MARKETPLACE_RUNTIME_ROLE_ASSETS)) {
      const registryAsset = MARKETPLACE_ASSETS.find(
        ({ assetId }) => assetId === asset.assetId,
      );

      expect(registryAsset, asset.assetId).toEqual(expect.objectContaining({
        roleId: asset.roleId,
        catalogStatus: 'runtime-integrated',
        runtimeIntegrated: true,
      }));
      expect(existsSync(resolve('public', asset.publicPath.slice(1))), asset.assetId).toBe(true);
      expect(asset.frameCount).toBe(8);
      expect(asset.frameDurationMs).toBe(110);
      expect(asset.fallbackTextureKey).toBeTruthy();
    }
  });

  it('loads the same runtime contract exposed by the role map', () => {
    expect(MARKETPLACE_RUNTIME_ANIMATION_ASSETS).toEqual([
      [
        MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator.textureKey,
        MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator.publicPath,
      ],
      [
        MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.textureKey,
        MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.publicPath,
      ],
      [
        MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.textureKey,
        MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.publicPath,
      ],
    ]);
  });

  it('falls back to the bundled placeholder without a server dependency', () => {
    const runtimeAsset = MARKETPLACE_RUNTIME_ROLE_ASSETS.miner;
    const fallback = resolveMarketplaceRuntimeAsset(runtimeAsset, false);

    expect(fallback).toMatchObject({
      assetId: null,
      roleId: 'miner',
      textureKey: runtimeAsset.fallbackTextureKey,
      frameCount: 4,
      frameDurationMs: 220,
      displaySize: runtimeAsset.displaySize,
    });
  });
});
