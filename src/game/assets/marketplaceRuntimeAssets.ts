import { PLACEHOLDER_ANIMATION_TEXTURES } from './placeholderAssets';

export type MarketplaceRuntimeRole = 'elevator' | 'warehouse' | 'miner';

export interface MarketplaceRuntimeAnimationAsset {
  readonly assetId: string | null;
  readonly roleId: MarketplaceRuntimeRole;
  readonly characterName: string;
  readonly textureKey: string;
  readonly publicPath: string;
  /** The art-source sheet used to produce the public runtime copy. */
  readonly sourceSheetPath: string;
  /** Width and height of one Phaser spritesheet cell in source pixels. */
  readonly frameSizePx: number;
  readonly frameCount: number;
  readonly frameDurationMs: number;
  readonly displaySize: number;
  readonly fallbackTextureKey: string;
  readonly fallbackFrameCount: number;
  readonly fallbackFrameDurationMs: number;
}

export const MARKETPLACE_RUNTIME_ROLE_ASSETS = {
  elevator: {
    assetId: 'elevator-cargo-cat:SSR:mofy:idle',
    roleId: 'elevator',
    characterName: 'Mofy',
    textureKey: 'marketplace-runtime-elevator-mofy',
    publicPath: '/assets/marketplace/runtime/elevator/mofy-8f-sheet.png',
    sourceSheetPath:
      'art-source/cat-role-catalog/elevator-cargo-cat/ssr/mofy/elevator-cargo-cat-ssr-mofy-idle-8f-sheet.png',
    frameSizePx: 128,
    frameCount: 8,
    frameDurationMs: 110,
    displaySize: 50,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.elevatorCargoCat,
    fallbackFrameCount: 4,
    fallbackFrameDurationMs: 220,
  },
  warehouse: {
    assetId: 'warehouse-manager:SR:baron:idle',
    roleId: 'warehouse',
    characterName: 'Baron',
    textureKey: 'marketplace-runtime-warehouse-baron',
    publicPath: '/assets/marketplace/runtime/warehouse/baron-8f-sheet.png',
    sourceSheetPath:
      'art-source/cat-role-catalog/warehouse-manager/sr/baron/processed-8f/sheet-transparent.png',
    frameSizePx: 128,
    frameCount: 8,
    frameDurationMs: 110,
    displaySize: 56,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.warehouseManager,
    fallbackFrameCount: 4,
    fallbackFrameDurationMs: 240,
  },
  miner: {
    assetId: 'miner:SSR:forge:idle',
    roleId: 'miner',
    characterName: 'Forge',
    textureKey: 'marketplace-runtime-miner-forge',
    publicPath: '/assets/marketplace/runtime/miner/forge-8f-sheet.png',
    sourceSheetPath:
      'art-source/cat-role-catalog/miner/ssr/forge/processed-8f/sheet-transparent.png',
    frameSizePx: 128,
    frameCount: 8,
    frameDurationMs: 110,
    displaySize: 75,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.minerWalk,
    fallbackFrameCount: 4,
    fallbackFrameDurationMs: 220,
  },
} as const satisfies Record<MarketplaceRuntimeRole, MarketplaceRuntimeAnimationAsset>;

export const MARKETPLACE_RUNTIME_ANIMATION_ASSETS = Object.values(
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
);

export const MARKETPLACE_RUNTIME_ASSET_IDS = Object.values(
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
).map(({ assetId }) => assetId);

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
    frameCount: asset.fallbackFrameCount,
    frameDurationMs: asset.fallbackFrameDurationMs,
  };
}
