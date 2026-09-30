import { PLACEHOLDER_ANIMATION_TEXTURES, PLACEHOLDER_TEXTURES } from './placeholderAssets';
import { CAT_RUNTIME_DISPLAY_SIZE, SURFACE_HAULER_CART_SIZE } from '../layout/mineLayout';

export type MarketplaceRuntimeRole = 'elevator' | 'warehouse' | 'miner' | 'hauler';

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

export interface MarketplaceRuntimeSlotBinding {
  readonly slotKey: string;
  readonly roleId: MarketplaceRuntimeRole;
  readonly catInstanceId: string | null;
  readonly assignedAssetId: string | null;
  readonly animation: MarketplaceRuntimeAnimationAsset;
  readonly usesFallback: boolean;
  readonly fallbackReason: 'none' | 'unassigned' | 'missing-runtime-asset';
}

export const MARKETPLACE_RUNTIME_ROLE_ASSETS = {
  hauler: {
    assetId: null,
    roleId: 'hauler',
    characterName: 'Default Hauler',
    textureKey: PLACEHOLDER_ANIMATION_TEXTURES.surfaceHaulerCat,
    publicPath: '/assets/step-32a/surface-hauler-cat-sheet.png',
    sourceSheetPath: 'art-source/step-32a-asset-pack/surface-hauler-cat/processed/sheet-transparent.png',
    frameSizePx: 128,
    frameCount: 4,
    frameDurationMs: 160,
    displaySize: 52,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.surfaceHaulerCat,
    fallbackFrameCount: 4,
    fallbackFrameDurationMs: 160,
  },
  elevator: {
    assetId: 'elevator-cargo-cat:N:pip:idle',
    roleId: 'elevator',
    characterName: 'Pip',
    textureKey: 'default-elevator-pip',
    publicPath: '/assets/defaults/elevator/pip-4f-sheet.png',
    sourceSheetPath:
      'art-source/cat-role-catalog/elevator-cargo-cat/n/pip/idle/processed/sheet-transparent.png',
    frameSizePx: 128,
    frameCount: 4,
    frameDurationMs: 220,
    displaySize: CAT_RUNTIME_DISPLAY_SIZE,
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
    displaySize: CAT_RUNTIME_DISPLAY_SIZE,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.warehouseManager,
    fallbackFrameCount: 4,
    fallbackFrameDurationMs: 240,
  },
  miner: {
    assetId: 'miner:N:mica:idle',
    roleId: 'miner',
    characterName: 'Mica',
    textureKey: 'marketplace-runtime-miner-mica-walk-right',
    publicPath: '/assets/marketplace/runtime/miner/mica-walk-right-4f-sheet.png',
    sourceSheetPath:
      'art-source/cat-role-catalog/miner/n/mica/walk-right/sheet-feet-aligned.png',
    frameSizePx: 128,
    frameCount: 4,
    frameDurationMs: 220,
    displaySize: CAT_RUNTIME_DISPLAY_SIZE,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.minerWalk,
    fallbackFrameCount: 4,
    fallbackFrameDurationMs: 220,
  },
} as const satisfies Record<MarketplaceRuntimeRole, MarketplaceRuntimeAnimationAsset>;

/** Mofy stays a purchased Elevator identity, never the free slot default. */
export const MARKETPLACE_RUNTIME_ELEVATOR_VARIANTS = {
  mofy: {
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
    displaySize: CAT_RUNTIME_DISPLAY_SIZE,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.elevatorCargoCat,
    fallbackFrameCount: 4,
    fallbackFrameDurationMs: 220,
  },
} as const satisfies Record<string, MarketplaceRuntimeAnimationAsset>;

/** Purchased miner variants keep their own identity when assigned to a floor. */
export const MARKETPLACE_RUNTIME_MINER_VARIANTS = {
  forge: {
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
    displaySize: CAT_RUNTIME_DISPLAY_SIZE,
    fallbackTextureKey: PLACEHOLDER_ANIMATION_TEXTURES.minerWalk,
    fallbackFrameCount: 4,
    fallbackFrameDurationMs: 220,
  },
} as const satisfies Record<string, MarketplaceRuntimeAnimationAsset>;

export interface MinerMiningActionAsset {
  readonly textureKey: string;
  readonly publicPath: string;
  readonly frameSizePx: number;
  readonly frameCount: number;
}

/** The action sheet follows the selected miner; the ore impact is shared. */
export const MINER_MINING_ATTACK_ASSETS: Readonly<Record<string, MinerMiningActionAsset>> = {
  'miner:SSR:forge:idle': {
    textureKey: 'marketplace-runtime-miner-forge-attack',
    publicPath: '/assets/marketplace/runtime/miner/forge-attack-4f-sheet.png',
    frameSizePx: 128,
    frameCount: 4,
  },
  'miner:N:mica:idle': {
    textureKey: 'marketplace-runtime-miner-mica-attack',
    publicPath: '/assets/marketplace/runtime/miner/mica-attack-4f-sheet.png',
    frameSizePx: 128,
    frameCount: 4,
  },
};

export const MINER_MINING_IMPACT_ASSET: MinerMiningActionAsset = {
  textureKey: 'marketplace-runtime-mining-impact',
  publicPath: '/assets/marketplace/runtime/effects/forge-mining-impact-4f-sheet.png',
  frameSizePx: 128,
  frameCount: 4,
};

export const MARKETPLACE_RUNTIME_ANIMATION_ASSETS = [
  MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator,
  MARKETPLACE_RUNTIME_ELEVATOR_VARIANTS.mofy,
  MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse,
  MARKETPLACE_RUNTIME_ROLE_ASSETS.miner,
  MARKETPLACE_RUNTIME_MINER_VARIANTS.forge,
  ...(['tobi', 'rivet'] as const).map((name): MarketplaceRuntimeAnimationAsset & { assetId: string } => ({
    ...MARKETPLACE_RUNTIME_ROLE_ASSETS.hauler,
    assetId: name === 'tobi' ? 'hauler:SR:tobi:walk' : 'hauler:SSR:rivet:walk',
    characterName: name === 'tobi' ? 'Tobi' : 'Rivet',
    frameDurationMs: 200,
    textureKey: `marketplace-runtime-hauler-${name}`,
    publicPath: `/assets/marketplace/runtime/hauler/${name}-walk-4f-sheet.png`,
    sourceSheetPath: `art-source/cat-role-catalog/hauler/${name === 'tobi' ? 'sr' : 'ssr'}/${name}/walk/sheet-transparent.png`,
  })),
];

export interface HaulerCartAsset {
  readonly assetId: string | null;
  readonly emptyTexture: string;
  readonly filledTexture: string;
  readonly emptyPath: string;
  readonly filledPath: string;
  /** Vehicle-only size; never reuse this for its operator sprite. */
  readonly displaySize: number;
  readonly originY: number;
  readonly baselineOffsetY: number;
  readonly hoverOffsetY: number;
}

export const HAULER_CART_ASSETS: readonly HaulerCartAsset[] = ['tobi', 'rivet'].map((name) => ({
  assetId: name === 'tobi' ? 'hauler:SR:tobi:walk' : 'hauler:SSR:rivet:walk',
  emptyTexture: `hauler-${name}-cart-empty`,
  filledTexture: `hauler-${name}-cart-filled`,
  emptyPath: `/assets/marketplace/runtime/hauler/${name}-cart-empty.png`,
  filledPath: `/assets/marketplace/runtime/hauler/${name}-cart-filled.png`,
  displaySize: 64,
  // Both cargo states have identical alpha bounds. Anchor their visible
  // wheels/coils to the default cart's ground line, not transparent padding.
  originY: (name === 'tobi' ? 95 : 89) / 128,
  baselineOffsetY: SURFACE_HAULER_CART_SIZE * (121 / 128 - 0.5),
  hoverOffsetY: name === 'rivet' ? -4 : 0,
}));

const DEFAULT_HAULER_CART: HaulerCartAsset = {
  assetId: null,
  emptyTexture: PLACEHOLDER_TEXTURES.goldContainer,
  filledTexture: PLACEHOLDER_TEXTURES.goldContainerFilled,
  emptyPath: '',
  filledPath: '',
  displaySize: SURFACE_HAULER_CART_SIZE,
  originY: 0.5,
  baselineOffsetY: 0,
  hoverOffsetY: 0,
};

export function resolveHaulerCartAsset(assetId: string | null): HaulerCartAsset {
  return HAULER_CART_ASSETS.find((asset) => asset.assetId === assetId) ?? DEFAULT_HAULER_CART;
}

export const MARKETPLACE_RUNTIME_ASSET_IDS = MARKETPLACE_RUNTIME_ANIMATION_ASSETS
  .map(({ assetId }) => assetId);

export function resolveMinerMiningAttackAsset(
  assetId: string | null,
): MinerMiningActionAsset | null {
  return assetId === null ? null : MINER_MINING_ATTACK_ASSETS[assetId] ?? null;
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
    frameCount: asset.fallbackFrameCount,
    frameDurationMs: asset.fallbackFrameDurationMs,
  };
}

/**
 * Resolves the presentation for one authoritative role slot. The role's
 * configured asset remains the free visual default when a slot has
 * no owned assignment; an assigned cat with no local runtime sheet gets that
 * role's safe placeholder while its owned asset identity stays in the binding.
 */
export function resolveMarketplaceRuntimeSlot(
  slotKey: string,
  roleId: MarketplaceRuntimeRole,
  cat: { readonly catInstanceId: string; readonly assetId: string } | null,
  isAvailable: (asset: MarketplaceRuntimeAnimationAsset) => boolean,
): MarketplaceRuntimeSlotBinding {
  const defaultAsset = MARKETPLACE_RUNTIME_ROLE_ASSETS[roleId];
  const requestedAsset = cat === null
    ? defaultAsset
    : MARKETPLACE_RUNTIME_ANIMATION_ASSETS.find((asset) => {
        return asset.roleId === roleId && asset.assetId === cat.assetId;
      }) ?? null;
  const usesFallback = requestedAsset === null || !isAvailable(requestedAsset);
  const animation = resolveMarketplaceRuntimeAsset(
    requestedAsset ?? defaultAsset,
    !usesFallback,
  );

  return {
    slotKey,
    roleId,
    catInstanceId: cat?.catInstanceId ?? null,
    assignedAssetId: cat?.assetId ?? null,
    animation,
    usesFallback,
    fallbackReason: requestedAsset === null
      ? 'missing-runtime-asset'
      : usesFallback
        ? 'missing-runtime-asset'
        : cat === null
          ? 'unassigned'
          : 'none',
  };
}
