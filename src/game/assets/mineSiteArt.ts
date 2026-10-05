import type { MineSiteId } from '../../config';
import { PLACEHOLDER_ANIMATION_TEXTURES, PLACEHOLDER_TEXTURES } from './placeholderAssets';
import { HAULER_CART_ASSETS, MINER_MINING_IMPACT_ASSET } from './marketplaceRuntimeAssets';

export interface MineSiteArtAsset {
  readonly key: string;
  readonly path: string;
}

export interface MineSiteArt {
  readonly surface: MineSiteArtAsset;
  readonly towerLoaded: MineSiteArtAsset;
  readonly towerEmpty: MineSiteArtAsset;
  readonly warehouse: MineSiteArtAsset;
  readonly cartFilled: MineSiteArtAsset;
  readonly pour: MineSiteArtAsset;
  readonly impact: MineSiteArtAsset;
  readonly shaft: MineSiteArtAsset;
  readonly tobiCartFilled: MineSiteArtAsset;
  readonly rivetCartFilled: MineSiteArtAsset;
  readonly floors: readonly [MineSiteArtAsset, MineSiteArtAsset, MineSiteArtAsset];
  readonly orePile: MineSiteArtAsset;
}

function family(id: Exclude<MineSiteId, 'gold'>): MineSiteArt {
  return {
    surface: { key: `${id}-surface`, path: `/assets/sites/${id}/surface.webp` },
    towerLoaded: { key: `${id}-tower-loaded`, path: `/assets/sites/${id}/tower-loaded.png` },
    towerEmpty: { key: `${id}-tower-empty`, path: `/assets/sites/${id}/tower-empty.png` },
    warehouse: { key: `${id}-warehouse`, path: `/assets/sites/${id}/warehouse.png` },
    cartFilled: { key: `${id}-cart-filled`, path: `/assets/sites/${id}/cart-filled.png` },
    pour: { key: `${id}-pour`, path: `/assets/sites/${id}/pour-sheet.png` },
    impact: { key: `${id}-impact`, path: `/assets/sites/${id}/impact-sheet.png` },
    shaft: { key: `${id}-shaft`, path: `/assets/sites/${id}/shaft.png` },
    tobiCartFilled: { key: `${id}-tobi-cart-filled`, path: `/assets/sites/${id}/tobi-cart-filled.png` },
    rivetCartFilled: { key: `${id}-rivet-cart-filled`, path: `/assets/sites/${id}/rivet-cart-filled.png` },
    floors: [
      { key: `${id}-floor-upper`, path: `/assets/sites/${id}/floor-upper.png` },
      { key: `${id}-floor-middle`, path: `/assets/sites/${id}/floor-middle.png` },
      { key: `${id}-floor-deep`, path: `/assets/sites/${id}/floor-deep.png` },
    ],
    orePile: { key: `${id}-ore-pile`, path: `/assets/sites/${id}/ore-pile.png` },
  };
}

export const MINE_SITE_ART: Readonly<Record<MineSiteId, MineSiteArt>> = {
  gold: {
    surface: { key: PLACEHOLDER_TEXTURES.surfaceLandscape, path: '/assets/step-32a/surface-landscape-v1.png' },
    towerLoaded: { key: PLACEHOLDER_TEXTURES.elevatorTower, path: '/assets/step-32a/elevator-tower-v2.png' },
    towerEmpty: { key: PLACEHOLDER_TEXTURES.elevatorTowerEmpty, path: '/assets/step-32a/elevator-tower-empty-v1.png' },
    warehouse: { key: PLACEHOLDER_TEXTURES.warehouseBuilding, path: '/assets/step-32a/warehouse-building.png' },
    cartFilled: { key: PLACEHOLDER_TEXTURES.goldContainerFilled, path: '/assets/step-32a/gold-container-filled.png' },
    pour: { key: PLACEHOLDER_ANIMATION_TEXTURES.surfaceGoldPour, path: '/assets/step-32a/surface-gold-pour-sheet.png' },
    impact: { key: MINER_MINING_IMPACT_ASSET.textureKey, path: MINER_MINING_IMPACT_ASSET.publicPath },
    shaft: { key: PLACEHOLDER_TEXTURES.elevatorShaft, path: '/assets/step-32a/elevator-shaft.png' },
    tobiCartFilled: { key: HAULER_CART_ASSETS[0].filledTexture, path: HAULER_CART_ASSETS[0].filledPath },
    rivetCartFilled: { key: HAULER_CART_ASSETS[1].filledTexture, path: HAULER_CART_ASSETS[1].filledPath },
    floors: [
      { key: PLACEHOLDER_TEXTURES.floorBackground, path: '/assets/step-32a/mine-floor-background.png' },
      { key: PLACEHOLDER_TEXTURES.floorBackground, path: '/assets/step-32a/mine-floor-background.png' },
      { key: PLACEHOLDER_TEXTURES.floorBackground, path: '/assets/step-32a/mine-floor-background.png' },
    ],
    orePile: { key: PLACEHOLDER_TEXTURES.goldPile, path: '/assets/step-32a/gold-pile.png' },
  },
  amethyst: family('amethyst'),
  ruby: family('ruby'),
  sapphire: family('sapphire'),
  emerald: family('emerald'),
  diamond: family('diamond'),
};

export function floorDepthBand(floorNumber: number): 0 | 1 | 2 {
  if (!Number.isSafeInteger(floorNumber) || floorNumber < 1 || floorNumber > 15) {
    throw new Error('Floor number must be between 1 and 15.');
  }
  return floorNumber <= 5 ? 0 : floorNumber <= 10 ? 1 : 2;
}

export function mineFloorArt(id: MineSiteId, floorNumber: number): MineSiteArtAsset {
  return MINE_SITE_ART[id].floors[floorDepthBand(floorNumber)];
}
