import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MARKETPLACE_ASSETS } from '../../src/ui/marketplaceAssetRegistry';
import {
  MARKETPLACE_RUNTIME_ANIMATION_ASSETS,
  MARKETPLACE_RUNTIME_ASSET_IDS,
  MARKETPLACE_RUNTIME_ELEVATOR_VARIANTS,
  MARKETPLACE_RUNTIME_MINER_VARIANTS,
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
  MINER_MINING_ATTACK_ASSETS,
  MINER_MINING_IMPACT_ASSET,
  resolveMinerMiningAttackAsset,
  resolveMarketplaceRuntimeAsset,
  resolveMarketplaceRuntimeSlot,
} from '../../src/game/assets/marketplaceRuntimeAssets';

describe('Marketplace runtime asset contract', () => {
  it('keeps one approved, role-matched runtime asset per v1 role', () => {
    expect(MARKETPLACE_RUNTIME_ASSET_IDS).toEqual([
      'elevator-cargo-cat:N:pip:idle',
      'elevator-cargo-cat:SSR:mofy:idle',
      'warehouse-manager:SR:baron:idle',
      'miner:N:mica:idle',
      'miner:SSR:forge:idle',
      'miner:SSR:boru:idle',
      'hauler:SR:tobi:walk',
      'hauler:SSR:rivet:walk',
    ]);
    expect(new Set(MARKETPLACE_RUNTIME_ASSET_IDS).size).toBe(
      MARKETPLACE_RUNTIME_ASSET_IDS.length,
    );

    for (const asset of MARKETPLACE_RUNTIME_ANIMATION_ASSETS) {
      const registryAsset = MARKETPLACE_ASSETS.find(
        ({ assetId }) => assetId === asset.assetId,
      );

      if (asset.assetId === 'elevator-cargo-cat:N:pip:idle') {
        expect(registryAsset).toBeUndefined();
      } else {
        expect(registryAsset, asset.assetId).toEqual(expect.objectContaining({
          roleId: asset.roleId,
          catalogStatus: 'runtime-integrated',
          runtimeIntegrated: true,
        }));
      }
      expect(existsSync(resolve('public', asset.publicPath.slice(1))), asset.assetId).toBe(true);
      expect(existsSync(resolve(asset.sourceSheetPath)), `${asset.assetId} source`).toBe(true);
      expect(asset.frameSizePx).toBe(128);
      const isDefault = asset.assetId === 'miner:N:mica:idle'
        || asset.assetId === 'elevator-cargo-cat:N:pip:idle';
      expect(asset.frameCount).toBe(isDefault || asset.roleId === 'hauler' ? 4 : 8);
      expect(asset.frameDurationMs).toBe(asset.roleId === 'hauler' ? 200 : isDefault ? 220 : 110);
      expect(asset.fallbackTextureKey).toBeTruthy();
      expect(asset.fallbackFrameCount).toBe(4);
    }
  });

  it('loads the same runtime contract exposed by the role map', () => {
    expect(MARKETPLACE_RUNTIME_ANIMATION_ASSETS.map(({ textureKey, publicPath }) => [
      textureKey,
      publicPath,
    ])).toEqual([
      [
        MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator.textureKey,
        MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator.publicPath,
      ],
      [
        MARKETPLACE_RUNTIME_ELEVATOR_VARIANTS.mofy.textureKey,
        MARKETPLACE_RUNTIME_ELEVATOR_VARIANTS.mofy.publicPath,
      ],
      [
        MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.textureKey,
        MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse.publicPath,
      ],
      [
        MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.textureKey,
        MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.publicPath,
      ],
      [
        MARKETPLACE_RUNTIME_MINER_VARIANTS.forge.textureKey,
        MARKETPLACE_RUNTIME_MINER_VARIANTS.forge.publicPath,
      ],
      [MARKETPLACE_RUNTIME_MINER_VARIANTS.boru.textureKey, MARKETPLACE_RUNTIME_MINER_VARIANTS.boru.publicPath],
      ['marketplace-runtime-hauler-tobi', '/assets/marketplace/runtime/hauler/tobi-walk-4f-sheet.png'],
      ['marketplace-runtime-hauler-rivet', '/assets/marketplace/runtime/hauler/rivet-walk-4f-sheet.png'],
    ]);
  });

  it('keeps separate mining attack sheets for both integrated miner identities', () => {
    expect(resolveMinerMiningAttackAsset('miner:SSR:forge:idle')).toBe(
      MINER_MINING_ATTACK_ASSETS['miner:SSR:forge:idle'],
    );
    expect(resolveMinerMiningAttackAsset('miner:N:mica:idle')).toBe(
      MINER_MINING_ATTACK_ASSETS['miner:N:mica:idle'],
    );
    expect(resolveMinerMiningAttackAsset('miner:unknown:idle')).toBeNull();
    expect(resolveMinerMiningAttackAsset(null)).toBeNull();
    for (const asset of [
      ...Object.values(MINER_MINING_ATTACK_ASSETS),
      MINER_MINING_IMPACT_ASSET,
    ]) {
      expect(existsSync(resolve('public', asset.publicPath.slice(1)))).toBe(true);
      expect(asset.frameSizePx).toBe(128);
      expect(asset.frameCount).toBe(4);
    }
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
    expect(fallback.fallbackFrameDurationMs).toBe(220);
  });

  it('preserves the warehouse fallback cadence from the placeholder presentation', () => {
    const runtimeAsset = MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse;

    expect(resolveMarketplaceRuntimeAsset(runtimeAsset, false)).toMatchObject({
      frameCount: 4,
      frameDurationMs: 240,
    });
  });

  it('resolves an assigned instance through the slot without changing its identity', () => {
    const binding = resolveMarketplaceRuntimeSlot(
      'miner:floor-1',
      'miner',
      { catInstanceId: 'cat-forge', assetId: 'miner:SSR:forge:idle' },
      () => true,
    );

    expect(binding).toMatchObject({
      slotKey: 'miner:floor-1',
      catInstanceId: 'cat-forge',
      assignedAssetId: 'miner:SSR:forge:idle',
      usesFallback: false,
      fallbackReason: 'none',
      animation: { assetId: 'miner:SSR:forge:idle' },
    });
  });

  it('uses Mica without granting an owned cat when no Miner is assigned', () => {
    for (const floor of ['floor-1', 'floor-15']) {
      const binding = resolveMarketplaceRuntimeSlot(`miner:${floor}`, 'miner', null, () => true);
      expect(binding).toMatchObject({
        catInstanceId: null,
        assignedAssetId: null,
        fallbackReason: 'unassigned',
        animation: {
          assetId: 'miner:N:mica:idle',
          textureKey: 'marketplace-runtime-miner-mica-walk-right',
        },
      });
    }
  });

  it('uses free Pip until an owned Mofy is assigned to the Elevator slot', () => {
    const idle = resolveMarketplaceRuntimeSlot('elevator:main', 'elevator', null, () => true);
    expect(idle).toMatchObject({
      catInstanceId: null,
      assignedAssetId: null,
      fallbackReason: 'unassigned',
      animation: { assetId: 'elevator-cargo-cat:N:pip:idle', textureKey: 'default-elevator-pip' },
    });

    const assigned = resolveMarketplaceRuntimeSlot(
      'elevator:main',
      'elevator',
      { catInstanceId: 'owned-mofy', assetId: 'elevator-cargo-cat:SSR:mofy:idle' },
      () => true,
    );
    expect(assigned).toMatchObject({
      catInstanceId: 'owned-mofy',
      assignedAssetId: 'elevator-cargo-cat:SSR:mofy:idle',
      animation: { assetId: 'elevator-cargo-cat:SSR:mofy:idle', textureKey: 'marketplace-runtime-elevator-mofy' },
      usesFallback: false,
    });
  });

  it('binds assigned Mica to his own runtime sheet instead of the generic miner', () => {
    const binding = resolveMarketplaceRuntimeSlot(
      'miner:floor-14',
      'miner',
      { catInstanceId: 'cat-mica', assetId: 'miner:N:mica:idle' },
      () => true,
    );

    expect(binding).toMatchObject({
      assignedAssetId: 'miner:N:mica:idle',
      usesFallback: false,
      animation: {
        assetId: 'miner:N:mica:idle',
        textureKey: 'marketplace-runtime-miner-mica-walk-right',
      },
    });
  });

  it('uses the role placeholder while diagnosing an assigned cat with no local sheet', () => {
    const binding = resolveMarketplaceRuntimeSlot(
      'miner:floor-1',
      'miner',
      { catInstanceId: 'cat-unknown', assetId: 'miner:N:unknown:idle' },
      () => false,
    );

    expect(binding).toMatchObject({
      catInstanceId: 'cat-unknown',
      assignedAssetId: 'miner:N:unknown:idle',
      usesFallback: true,
      fallbackReason: 'missing-runtime-asset',
      animation: {
        assetId: null,
        textureKey: MARKETPLACE_RUNTIME_ROLE_ASSETS.miner.fallbackTextureKey,
      },
    });
  });
});
