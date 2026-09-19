/**
 * Allowlisted Marketplace portrait assets.
 *
 * Listing names and other server-provided text are data only. They must never
 * be interpolated into an asset path. The stable asset ID is the only lookup
 * key exposed to future Marketplace data sources.
 */

export type MarketplaceAssetRole = 'elevator' | 'warehouse' | 'miner';
export type MarketplaceAssetRarity = 'N' | 'SR' | 'SSR';

export interface MarketplaceAssetRecord {
  readonly assetId: string;
  readonly roleId: MarketplaceAssetRole;
  readonly assetFamilyId: string;
  readonly rarityTier: MarketplaceAssetRarity;
  readonly characterSlug: string;
  readonly characterName: string;
  readonly portraitPath: string;
  readonly sourcePortraitPath: string;
  readonly catalogStatus: 'preview-canonical';
  readonly runtimeIntegrated: false;
}

const MARKETPLACE_ASSET_ENTRIES = [
  {
    assetId: 'elevator-cargo-cat:SSR:mofy:idle',
    roleId: 'elevator',
    assetFamilyId: 'elevator-cargo-cat',
    rarityTier: 'SSR',
    characterSlug: 'mofy',
    characterName: 'Mofy',
    portraitPath: '/assets/marketplace/catalog/elevator-cargo-cat/ssr/mofy/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/elevator-cargo-cat/ssr/mofy/processed-8f-v2/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
  {
    assetId: 'elevator-cargo-cat:SSR:elon:idle',
    roleId: 'elevator',
    assetFamilyId: 'elevator-cargo-cat',
    rarityTier: 'SSR',
    characterSlug: 'elon',
    characterName: 'Elon',
    portraitPath: '/assets/marketplace/catalog/elevator-cargo-cat/ssr/elon/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/elevator-cargo-cat/ssr/elon/processed/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
  {
    assetId: 'elevator-cargo-cat:SSR:win:idle',
    roleId: 'elevator',
    assetFamilyId: 'elevator-cargo-cat',
    rarityTier: 'SSR',
    characterSlug: 'win',
    characterName: 'Win',
    portraitPath: '/assets/marketplace/catalog/elevator-cargo-cat/ssr/win/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/elevator-cargo-cat/ssr/win/processed/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
  {
    assetId: 'warehouse-manager:SR:baron:idle',
    roleId: 'warehouse',
    assetFamilyId: 'warehouse-manager',
    rarityTier: 'SR',
    characterSlug: 'baron',
    characterName: 'Baron',
    portraitPath: '/assets/marketplace/catalog/warehouse-manager/sr/baron/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/warehouse-manager/sr/baron/processed/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
  {
    assetId: 'warehouse-manager:SR:cipher:idle',
    roleId: 'warehouse',
    assetFamilyId: 'warehouse-manager',
    rarityTier: 'SR',
    characterSlug: 'cipher',
    characterName: 'Cipher',
    portraitPath: '/assets/marketplace/catalog/warehouse-manager/sr/cipher/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/warehouse-manager/sr/cipher/processed/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
  {
    assetId: 'warehouse-manager:SR:gauge:idle',
    roleId: 'warehouse',
    assetFamilyId: 'warehouse-manager',
    rarityTier: 'SR',
    characterSlug: 'gauge',
    characterName: 'Gauge',
    portraitPath: '/assets/marketplace/catalog/warehouse-manager/sr/gauge/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/warehouse-manager/sr/gauge/processed/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
  {
    assetId: 'warehouse-manager:SSR:nautilus:idle',
    roleId: 'warehouse',
    assetFamilyId: 'warehouse-manager',
    rarityTier: 'SSR',
    characterSlug: 'nautilus',
    characterName: 'Nautilus',
    portraitPath: '/assets/marketplace/catalog/warehouse-manager/ssr/nautilus/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/warehouse-manager/ssr/nautilus/processed/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
  {
    assetId: 'miner:N:mica:idle',
    roleId: 'miner',
    assetFamilyId: 'miner',
    rarityTier: 'N',
    characterSlug: 'mica',
    characterName: 'Mica',
    portraitPath: '/assets/marketplace/catalog/miner/n/mica/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/miner/n/mica/processed/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
  {
    assetId: 'miner:SSR:forge:idle',
    roleId: 'miner',
    assetFamilyId: 'miner',
    rarityTier: 'SSR',
    characterSlug: 'forge',
    characterName: 'Forge',
    portraitPath: '/assets/marketplace/catalog/miner/ssr/forge/idle-1.png',
    sourcePortraitPath: 'art-source/cat-role-catalog/miner/ssr/forge/processed/idle-1.png',
    catalogStatus: 'preview-canonical',
    runtimeIntegrated: false,
  },
] as const satisfies readonly MarketplaceAssetRecord[];

export const MARKETPLACE_ASSET_IDS = MARKETPLACE_ASSET_ENTRIES.map(
  (asset) => asset.assetId,
) as readonly MarketplaceAssetRecord['assetId'][];

export const MARKETPLACE_ASSETS: readonly MarketplaceAssetRecord[] =
  MARKETPLACE_ASSET_ENTRIES;

const MARKETPLACE_ASSET_BY_ID = new Map<string, MarketplaceAssetRecord>(
  MARKETPLACE_ASSET_ENTRIES.map((asset) => [asset.assetId, asset]),
);

/** Returns only a locally allowlisted asset; unknown IDs fail closed. */
export function getMarketplaceAsset(assetId: string): MarketplaceAssetRecord | null {
  return MARKETPLACE_ASSET_BY_ID.get(assetId) ?? null;
}

/** Returns a stable snapshot for cards, details, and future roster views. */
export function listMarketplaceAssets(): readonly MarketplaceAssetRecord[] {
  return MARKETPLACE_ASSETS;
}
