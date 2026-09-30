import Phaser from 'phaser';

import type { CatSlotKey } from '../core';
import { GAME_HEIGHT, GAME_WIDTH, MINE_BACKGROUND } from './layout';
import type { MineRuntimePort } from './runtime';
import { BootScene } from './scenes/BootScene';
import type { MarketplacePurchaseResult } from '../ui/MarketplaceModal';
import type {
  MarketplaceCommandResult,
  MarketplaceListingType,
  MarketplaceListingsResult,
} from '../platform/web/marketplace';

export { GAME_HEIGHT, GAME_WIDTH };
export {
  resolveMarketplaceRuntimeAsset,
  MARKETPLACE_RUNTIME_ANIMATION_ASSETS,
  MARKETPLACE_RUNTIME_ASSET_IDS,
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
  resolveMarketplaceRuntimeSlot,
  type MarketplaceRuntimeAnimationAsset,
  type MarketplaceRuntimeRole,
  type MarketplaceRuntimeSlotBinding,
} from './assets/marketplaceRuntimeAssets';
export {
  MineSimulationDriver,
  type MineCommandSink,
  type MineRuntimePort,
  type MineSimulationDriverOptions,
  type MineSnapshotSource,
} from './runtime';
export {
  createMineViewModel,
  formatAmount,
  DEFAULT_ANIMATION_SPEED_MULTIPLIER,
  PURCHASE_FEEDBACK_DURATION_MS,
  type HudViewModel,
  type MineFloorViewModel,
  type MineViewModel,
  type PurchaseControlViewModel,
  type PurchaseOutcome,
  type PurchaseTarget,
  type SharedStageViewModel,
} from './view-model';

export interface CreateGameOptions {
  /** Scales cosmetic motion only; production is never derived from it. */
  readonly animationSpeedMultiplier?: number;
  readonly onSettings?: (onClosed: () => void) => void;
  readonly onLeaderboard?: (onClosed: () => void) => void;
  readonly onBoost?: (onClosed: () => void) => void;
  readonly onCollection?: (onClosed: () => void) => void;
  readonly onCatSlot?: (slotKey: CatSlotKey, onClosed: () => void) => void;
  readonly onMarketplacePurchase?: (assetId: string) => Promise<MarketplacePurchaseResult>;
  readonly getWalletGold?: () => string | null;
  readonly getCollection?: () => import('../core').CatRosterState;
  readonly loadMarketplaceListings?: (
    listingType: MarketplaceListingType | null,
    mineOnly: boolean,
  ) => Promise<MarketplaceListingsResult>;
  readonly onCreateMarketplaceListing?: (command: {
    readonly catInstanceId: string;
    readonly listingType: MarketplaceListingType;
    readonly priceExact: string;
  }) => Promise<MarketplaceCommandResult>;
  readonly onCancelMarketplaceListing?: (listingId: string) => Promise<MarketplaceCommandResult>;
  readonly onBuyMarketplaceListing?: (listingId: string) => Promise<MarketplaceCommandResult>;
  readonly onRentMarketplaceListing?: (listingId: string, durationHours: number) => Promise<MarketplaceCommandResult>;
}

export function createGame(
  parent: HTMLElement,
  source: MineRuntimePort,
  options: CreateGameOptions = {},
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    // Only visible before the scene paints its regions, which then tile the
    // whole canvas. The letterbox around the fitted canvas is the `:root`
    // background in `src/style.css`, not this fill.
    backgroundColor: MINE_BACKGROUND,
    // The scene is constructed here so it boots already bound to the loaded
    // core snapshot instead of rendering placeholder values first, and then
    // pulls every later snapshot from the same source.
    scene: [
      new BootScene({
        source,
        animationSpeedMultiplier: options.animationSpeedMultiplier,
        onSettings: options.onSettings,
        onLeaderboard: options.onLeaderboard,
        onBoost: options.onBoost,
        onCollection: options.onCollection,
        onCatSlot: options.onCatSlot,
        onMarketplacePurchase: options.onMarketplacePurchase,
        getWalletGold: options.getWalletGold,
        getCollection: options.getCollection,
        loadMarketplaceListings: options.loadMarketplaceListings,
        onCreateMarketplaceListing: options.onCreateMarketplaceListing,
        onCancelMarketplaceListing: options.onCancelMarketplaceListing,
        onBuyMarketplaceListing: options.onBuyMarketplaceListing,
        onRentMarketplaceListing: options.onRentMarketplaceListing,
      }),
    ],
    scale: {
      // FIT never crops, so every control stays inside the host viewport.
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
  });
}
