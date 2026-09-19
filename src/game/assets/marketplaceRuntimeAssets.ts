import { PLACEHOLDER_ANIMATION_TEXTURES } from './placeholderAssets';

export type MarketplaceRuntimeRole = 'elevator' | 'warehouse' | 'miner';

export interface MarketplaceRuntimeAnimationAsset {
  readonly assetId: string | null;
  readonly roleId: MarketplaceRuntimeRole;
  readonly characterName: string;
  readonly textureKey: string;
  readonly publicPath: string;
  readonly frameCount: 4 | 8;
  readonly frameDurationMs: 110 | 220;
  readonly displaySize: number;
  readonly fallbackTextureKey: string;
}

export const MARKETPLACE_RUNTIME_ROLE_ASSETS = {
  elevator: {
    assetId: 'elevator-cargo-cat:SSR:mofy:idle',
    roleId: 'elevator',
    characterName: 'Mofy',
    textureKey: 'marketplace-runtime-elevator-mofy',
    publicPath: '/assets/marketplace/runtime/elevator/mofy-8f-sheet.png',
    frameCount: 8,
    frameDurationMs: 110,
    displaySize: 50,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.elevatorCargoCat,
  },
  warehouse: {
    assetId: 'warehouse-manager:SR:baron:idle',
    roleId: 'warehouse',
    characterName: 'Baron',
    textureKey: 'marketplace-runtime-warehouse-baron',
    publicPath: '/assets/marketplace/runtime/warehouse/baron-8f-sheet.png',
    frameCount: 8,
    frameDurationMs: 110,
    displaySize: 56,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.warehouseManager,
  },
  miner: {
    assetId: 'miner:SSR:forge:idle',
    roleId: 'miner',
    characterName: 'Forge',
    textureKey: 'marketplace-runtime-miner-forge',
    publicPath: '/assets/marketplace/runtime/miner/forge-8f-sheet.png',
    frameCount: 8,
    frameDurationMs: 110,
    displaySize: 75,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.minerWalk,
  },
} as const satisfies Record<MarketplaceRuntimeRole, MarketplaceRuntimeAnimationAsset>;

export const MARKETPLACE_RUNTIME_ANIMATION_ASSETS = Object.values(
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
).map(({ textureKey, publicPath }) => [textureKey, publicPath] as const);

export const MARKETPLACE_RUNTIME_ASSET_IDS = Object.values(
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
).map(({ assetId }) => assetId);

export function getMarketplaceRuntimeAsset(
  roleId: MarketplaceRuntimeRole,
): MarketplaceRuntimeAnimationAsset {
  return MARKETPLACE_RUNTIME_ROLE_ASSETS[roleId];
}

/** Keeps offline boot playable if a local runtime copy is unavailable. */
export function resolveMarketplaceRuntimeAsset(
  asset: MarketplaceRuntimeAnimationAsset,
  isAvailable: boolean,
): MarketplaceRuntimeAnimationAsset {
  if (isAvailable) {
    return asset;
  }

  return {
    ...asset,
    assetId: null,
    textureKey: asset.fallbackTextureKey,
    frameCount: 4,
    frameDurationMs: 220,
  };
}
