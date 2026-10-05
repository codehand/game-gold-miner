import Phaser from 'phaser';
import { getMineSite, type MineSiteId } from '../../config';

import {
  calculateSurfaceHaulerWorkforce,
  getCatForSlot,
  type CatSlotKey,
} from '../../core';
import {
  MarketplaceModal,
  type MarketplacePurchaseResult,
} from '../../ui/MarketplaceModal';
import type { CatRosterState } from '../../core';
import type {
  MarketplaceCommandResult,
  MarketplaceListingType,
  MarketplaceListingsResult,
} from '../../platform/web/marketplace';
import { MineShaftUpgradeModal } from '../../ui/MineShaftUpgradeModal';

import { createBacklogTextures } from '../assets/backlogTextures';
import { MINE_SITE_ART, mineFloorArt } from '../assets/mineSiteArt';
import { HaulerThrusterView } from '../entities/HaulerThrusterView';
import { NAVIGATION_ICON_ASSETS } from '../assets/navigationAssets';
import {
  MINER_MINING_ATTACK_ASSETS,
  BORU_ACTION_ASSETS,
  MINER_MINING_IMPACT_ASSET,
  MARKETPLACE_RUNTIME_ANIMATION_ASSETS,
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
  HAULER_CART_ASSETS,
  resolveHaulerCartAsset,
  resolveMarketplaceRuntimeSlot,
  type MarketplaceRuntimeAnimationAsset,
  type MarketplaceRuntimeRole,
  type MarketplaceRuntimeSlotBinding,
} from '../assets/marketplaceRuntimeAssets';
import {
  ELEVATOR_SHAFT_TEXTURE_HEIGHT_PX,
  ELEVATOR_SHAFT_TEXTURE_WIDTH_PX,
  PLACEHOLDER_ANIMATION_ASSETS,
  PLACEHOLDER_ANIMATION_FRAME_SIZE,
  PLACEHOLDER_ANIMATION_TEXTURES,
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_TEXTURES,
} from '../assets/placeholderAssets';
import {
  BottomNavigationView,
  HudView,
  MineFloorView,
  PurchaseControlView,
  SharedStageView,
  type BottomNavigationItemKey,
  type RenderedPurchaseControlState,
} from '../entities';
import {
  calculateFloorSlotRegion,
  calculateMineFloorPanelLayout,
  calculateMineContentHeight,
  calculateMineLayout,
  calculateMineShaftRegion,
  regionContainsPoint,
  toFillColor,
  MINE_BACKGROUND,
  MINE_FLOOR_COUNT,
  MINE_SHAFT_CABIN_HEIGHT,
  MINE_SHAFT_CABIN_CAT_Y_OFFSET,
  MINE_SHAFT_CABIN_WIDTH,
  CAT_RUNTIME_DISPLAY_SIZE,
  serializeRegion,
  FONT_FAMILY,
  FONT_STYLE_BOLD,
  SURFACE_ELEVATOR_STOP_X,
  SURFACE_ELEVATOR_STOP_Y,
  SURFACE_ELEVATOR_LEVEL_CONTROL,
  SURFACE_ELEVATOR_TOWER_CENTER_X,
  SURFACE_ELEVATOR_TOWER_CENTER_Y,
  SURFACE_ELEVATOR_TOWER_HEIGHT,
  SURFACE_ELEVATOR_TOWER_WIDTH,
  SURFACE_GOLD_POUR_HEIGHT,
  SURFACE_GOLD_POUR_WIDTH,
  SURFACE_GOLD_POUR_X,
  SURFACE_GOLD_POUR_Y,
  SURFACE_HAULER_CART_SIZE,
  SURFACE_HAULER_CART_Y,
  SURFACE_HAULER_CAT_GAP,
  SURFACE_HAULER_CAT_SIZE,
  SURFACE_HAULER_END_X,
  SURFACE_HAULER_START_X,
  SURFACE_WAREHOUSE_CENTER_X,
  SURFACE_WAREHOUSE_CENTER_Y,
  SURFACE_WAREHOUSE_HEIGHT,
  SURFACE_WAREHOUSE_MANAGER_X,
  SURFACE_WAREHOUSE_MANAGER_Y,
  SURFACE_WAREHOUSE_WIDTH,
  SURFACE_WAREHOUSE_LEVEL_CONTROL,
  SURFACE_HEIGHT,
  SURFACE_BACKGROUND,
  SURFACE_GROUND,
  type LayoutRegion,
  type MineLayout,
} from '../layout';
import type { MineRuntimePort } from '../runtime';
import {
  advanceAnimationTimeMs,
  advanceSurfaceHaulerTrip,
  type SurfaceHaulerTrip,
  assertAnimationSpeedMultiplier,
  assertRenderableMineViewModel,
  beginMineScrollGesture,
  createMineScrollState,
  createPurchaseFeedback,
  calculateGeneratedAssetFrame,
  calculateSurfaceHaulerAssistantOffset,
  calculateSurfaceHaulerAssistantPose,
  calculateSurfaceHaulerCount,
  describeMineScroll,
  describePurchaseFeedback,
  dragMineScroll,
  endMineScrollGesture,
  easeElevatorTravelProgress,
  resizeMineScrollContent,
  scrollMineByWheel,
  DEFAULT_ANIMATION_SPEED_MULTIPLIER,
  SURFACE_HAULER_ASSISTANT_COUNT,
  type MineScrollPointer,
  type MineScrollState,
  type MineViewModel,
  type PurchaseControlViewModel,
  type PurchaseFeedback,
  type PurchaseFeedbackViewModel,
  type UpgradeTarget,
} from '../view-model';

export const BOOT_SCENE_KEY = 'BootScene';

/** Internal camera name; nothing outside this scene addresses the camera. */
const MINE_CAMERA_KEY = 'MineCamera';

/**
 * Rendered values are republished at most this often. Displayed progress
 * changes on every frame, so an unthrottled read-back would serialize the whole
 * screen 60 times a second purely for diagnostics.
 */
const VIEW_DIAGNOSTIC_INTERVAL_MS = 100;

/**
 * The rendered-state read-back exists for browser tests, which run against the
 * dev server, so a shipped build must not pay for it. Vite substitutes this
 * statically, letting the read-back and its serialization drop out of the
 * bundle entirely rather than merely going unread.
 */
const PUBLISHES_VIEW_DIAGNOSTICS = import.meta.env.DEV;

/**
 * Opt-in production profiling read-back. The ordinary production build leaves
 * this false, so benchmark-only attributes and input probes are tree-shaken.
 */
const PUBLISHES_PERFORMANCE_DIAGNOSTICS =
  import.meta.env.VITE_ENABLE_PERFORMANCE_DIAGNOSTICS === 'true';

/**
 * Scene-graph and unlock read-backs are resampled at most this often. Walking
 * every container each frame would make the profiler itself a measurable cost,
 * while a boot-only count could not show growth at all — which is the single
 * thing an object-count metric exists to detect.
 */
const PERFORMANCE_DIAGNOSTIC_INTERVAL_MS = 500;

const SURFACE_TITLE_HEIGHT = 28;
const SURFACE_PANEL_INSET = 12;
const SURFACE_PANEL_GAP = 10;
const SURFACE_PANEL_BOTTOM_INSET = 10;
const CABIN_MATERIAL_SIZE = 32;
const CABIN_MATERIAL_X_OFFSET = -7;
const CABIN_MATERIAL_Y_OFFSET = 19;

const COLOR_SURFACE_BACKGROUND = toFillColor(SURFACE_BACKGROUND);
const COLOR_MINE_BACKGROUND = toFillColor(MINE_BACKGROUND);
const COLOR_SURFACE_GROUND = toFillColor(SURFACE_GROUND);

/**
 * One priced control as a browser test sees it: what it shows, plus where it
 * is on screen so a press can be aimed at it. `worldBounds` from the view is
 * converted through the camera that renders it, because the mine scrolls
 * behind its own viewport while the surface does not.
 */
export interface PublishedPurchaseControl extends RenderedPurchaseControlState {
  readonly key: string;
  readonly screenBounds: LayoutRegion;
  /**
   * True when a press aimed at `screenBounds` would actually reach this
   * control. A scrolled floor control can sit outside the mine viewport, where
   * it is neither drawn nor hit-tested, and a rectangle alone cannot say so.
   */
  readonly isPressable: boolean;
}

export interface BootSceneOptions {
  readonly source: MineRuntimePort;
  /** Scales cosmetic motion only; production is never derived from it. */
  readonly animationSpeedMultiplier?: number;
  readonly onSettings?: (onClosed: () => void) => void;
  readonly onLeaderboard?: (onClosed: () => void) => void;
  readonly onBoost?: (onClosed: () => void) => void;
  readonly onMap?: (onClosed: () => void) => void;
  readonly onCollection?: (onClosed: () => void) => void;
  readonly onCatSlot?: (slotKey: CatSlotKey, onClosed: () => void) => void;
  readonly onMarketplacePurchase?: (assetId: string) => Promise<MarketplacePurchaseResult>;
  readonly getWalletGold?: () => string | null;
  readonly getCollection?: () => CatRosterState;
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

/**
 * The single mine scene.
 *
 * Every frame it pulls the newest snapshot from its source and rebinds one
 * reusable view per mine floor plus the shared elevator and warehouse. The
 * scene never mutates authoritative state and never decides when a production
 * cycle completes: it renders whatever the core has already produced.
 *
 * The cosmetic animation clock is deliberately separate from that pull. It is
 * advanced from the rendered frame delta and scaled by
 * `animationSpeedMultiplier`, and it drives only decoration — the miners' picks
 * and the shared-stage conveyors. Progress bars and cycle markers stay tied to
 * authoritative progress, so changing the animation speed cannot change output.
 */
export class BootScene extends Phaser.Scene {
  readonly #source: MineRuntimePort;
  #siteId: MineSiteId;
  #siteNameBadge: Phaser.GameObjects.Text | null = null;
  readonly #onSettings: ((onClosed: () => void) => void) | null;
  readonly #onLeaderboard: ((onClosed: () => void) => void) | null;
  readonly #onBoost: ((onClosed: () => void) => void) | null;
  readonly #onMap: ((onClosed: () => void) => void) | null;
  readonly #onCollection: ((onClosed: () => void) => void) | null;
  readonly #onCatSlot: ((slotKey: CatSlotKey, onClosed: () => void) => void) | null;
  readonly #onMarketplacePurchase: ((assetId: string) => Promise<MarketplacePurchaseResult>) | null;
  readonly #getWalletGold: (() => string | null) | null;
  readonly #getCollection: (() => CatRosterState) | null;
  readonly #loadMarketplaceListings: BootSceneOptions['loadMarketplaceListings'] | null;
  readonly #onCreateMarketplaceListing: BootSceneOptions['onCreateMarketplaceListing'] | null;
  readonly #onCancelMarketplaceListing: BootSceneOptions['onCancelMarketplaceListing'] | null;
  readonly #onBuyMarketplaceListing: BootSceneOptions['onBuyMarketplaceListing'] | null;
  readonly #onRentMarketplaceListing: BootSceneOptions['onRentMarketplaceListing'] | null;
  /** Live press results, keyed by control, cleared as each one expires. */
  readonly #purchaseFeedback = new Map<string, PurchaseFeedback>();
  /** The snapshot currently bound to the views, compared by identity. */
  #viewModel: MineViewModel;
  #hudView: HudView | null = null;
  #bottomNavigationView: BottomNavigationView | null = null;
  #floorViews: readonly MineFloorView[] = [];
  #elevatorView: SharedStageView | null = null;
  #warehouseView: SharedStageView | null = null;
  #surfaceElevatorUpgradeControl: PurchaseControlView | null = null;
  #surfaceWarehouseUpgradeControl: PurchaseControlView | null = null;
  #animationSpeedMultiplier: number;
  #animationTimeMs = 0;
  /** Resolved once after preload; hot paths only read these stable objects. */
  #elevatorAnimation!: MarketplaceRuntimeAnimationAsset;
  #warehouseAnimation!: MarketplaceRuntimeAnimationAsset;
  #minerAnimation!: MarketplaceRuntimeAnimationAsset;
  #runtimeSlotBindings: readonly MarketplaceRuntimeSlotBinding[] = [];
  #boundAssignmentRevision = -1;
  #lastViewDiagnosticMs = Number.NEGATIVE_INFINITY;
  #lastPerformanceDiagnosticMs = Number.NEGATIVE_INFINITY;
  /** The camera the mine content is drawn through, needed to place presses. */
  #mineCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  #mineRegion: LayoutRegion | null = null;
  #shaftRegion: LayoutRegion | null = null;
  #shaftBackground: Phaser.GameObjects.TileSprite | null = null;
  #shaftElevator: Phaser.GameObjects.Image | null = null;
  #shaftCargoCat: Phaser.GameObjects.Sprite | null = null;
  #shaftCabinMaterial: Phaser.GameObjects.Image | null = null;
  #surfaceElevatorTower: Phaser.GameObjects.Image | null = null;
  #surfaceLandscape: Phaser.GameObjects.Image | null = null;
  #surfaceElevator: Phaser.GameObjects.Image | null = null;
  #surfaceCargoCat: Phaser.GameObjects.Sprite | null = null;
  #surfaceCabinMaterial: Phaser.GameObjects.Image | null = null;
  #surfaceWarehouse: Phaser.GameObjects.Image | null = null;
  #warehouseManager: Phaser.GameObjects.Sprite | null = null;
  #surfaceHaulerCart: Phaser.GameObjects.Image | null = null;
  #surfaceHaulerCat: Phaser.GameObjects.Sprite | null = null;
  #surfaceHaulerAssistantCarts: readonly Phaser.GameObjects.Image[] = [];
  #surfaceHaulerAssistants: readonly Phaser.GameObjects.Sprite[] = [];
  #haulerCartAssets = Array.from({ length: 5 }, () => resolveHaulerCartAsset(null));
  #haulerFrameDurations = Array.from({ length: 5 }, () => 160);
  #haulerThrusters: readonly HaulerThrusterView[] = [];
  #haulerTrips: Array<SurfaceHaulerTrip | null> = [];
  #surfaceGoldPours: readonly Phaser.GameObjects.Sprite[] = [];
  #marketplace: MarketplaceModal | null = null;
  #floorUpgradeModal: MineShaftUpgradeModal | null = null;
  #selectedUpgradeTarget: UpgradeTarget | null = null;
  /** Scroll offset and tap-versus-drag state for the mine; null before `create`. */
  #scroll: MineScrollState | null = null;
  /** Number of floor rows currently revealed to the player: 5, 10, or 15. */
  #visibleFloorCount: number;
  readonly #siteScrollY = new Map<MineSiteId, number>();
  #siteArtLoadPromise: Promise<void> | null = null;

  public constructor(options: BootSceneOptions) {
    super({ key: BOOT_SCENE_KEY });

    assertRenderableMineViewModel(options.source.snapshot, MINE_FLOOR_COUNT);
    assertAnimationSpeedMultiplier(
      options.animationSpeedMultiplier ?? DEFAULT_ANIMATION_SPEED_MULTIPLIER,
    );

    this.#source = options.source;
    this.#siteId = options.source.mineSiteId ?? 'gold';
    this.#onSettings = options.onSettings ?? null;
    this.#onLeaderboard = options.onLeaderboard ?? null;
    this.#onBoost = options.onBoost ?? null;
    this.#onMap = options.onMap ?? null;
    this.#onCollection = options.onCollection ?? null;
    this.#onCatSlot = options.onCatSlot ?? null;
    this.#onMarketplacePurchase = options.onMarketplacePurchase ?? null;
    this.#getWalletGold = options.getWalletGold ?? null;
    this.#getCollection = options.getCollection ?? null;
    this.#loadMarketplaceListings = options.loadMarketplaceListings ?? null;
    this.#onCreateMarketplaceListing = options.onCreateMarketplaceListing ?? null;
    this.#onCancelMarketplaceListing = options.onCancelMarketplaceListing ?? null;
    this.#onBuyMarketplaceListing = options.onBuyMarketplaceListing ?? null;
    this.#onRentMarketplaceListing = options.onRentMarketplaceListing ?? null;
    this.#viewModel = options.source.snapshot;
    this.#visibleFloorCount = countVisibleFloors(options.source.snapshot);
    this.#animationSpeedMultiplier =
      options.animationSpeedMultiplier ?? DEFAULT_ANIMATION_SPEED_MULTIPLIER;
  }

  /** Loads the original Step 32 placeholder family before any view is built. */
  public preload(): void {
    if (this.#siteId !== 'gold') {
      for (const asset of [
        MINE_SITE_ART[this.#siteId].surface,
        MINE_SITE_ART[this.#siteId].towerLoaded,
        MINE_SITE_ART[this.#siteId].towerEmpty,
        MINE_SITE_ART[this.#siteId].warehouse,
        MINE_SITE_ART[this.#siteId].cartFilled,
        MINE_SITE_ART[this.#siteId].shaft,
        MINE_SITE_ART[this.#siteId].tobiCartFilled,
        MINE_SITE_ART[this.#siteId].rivetCartFilled,
        ...MINE_SITE_ART[this.#siteId].floors,
        MINE_SITE_ART[this.#siteId].orePile,
      ]) {
        if (!this.textures.exists(asset.key)) this.load.image(asset.key, asset.path);
      }
      for (const asset of [
        MINE_SITE_ART[this.#siteId].pour,
        MINE_SITE_ART[this.#siteId].impact,
      ]) {
        if (!this.textures.exists(asset.key)) {
          this.load.spritesheet(asset.key, asset.path, {
            frameWidth: PLACEHOLDER_ANIMATION_FRAME_SIZE,
            frameHeight: PLACEHOLDER_ANIMATION_FRAME_SIZE,
          });
        }
      }
    }
    for (const icon of NAVIGATION_ICON_ASSETS) {
      this.load.image(icon.textureKey, icon.path);
    }

    for (const [key, path] of PLACEHOLDER_ASSETS) {
      this.load.image(key, path);
    }

    for (const [key, path] of PLACEHOLDER_ANIMATION_ASSETS) {
      this.load.spritesheet(key, path, {
        frameWidth: PLACEHOLDER_ANIMATION_FRAME_SIZE,
        frameHeight: PLACEHOLDER_ANIMATION_FRAME_SIZE,
      });
    }

    for (const asset of MARKETPLACE_RUNTIME_ANIMATION_ASSETS) {
      this.load.spritesheet(asset.textureKey, asset.publicPath, {
        frameWidth: asset.frameSizePx,
        frameHeight: asset.frameSizePx,
      });
    }
    for (const asset of HAULER_CART_ASSETS) {
      this.load.image(asset.emptyTexture, asset.emptyPath);
      this.load.image(asset.filledTexture, asset.filledPath);
    }
    for (const asset of [
      ...Object.values(MINER_MINING_ATTACK_ASSETS),
      ...Object.entries(BORU_ACTION_ASSETS)
        .filter(([action]) => action !== 'travel-empty').map(([, asset]) => asset),
      MINER_MINING_IMPACT_ASSET,
    ]) {
      this.load.spritesheet(asset.textureKey, asset.publicPath, {
        frameWidth: asset.frameSizePx,
        frameHeight: asset.frameSizePx,
      });
    }
  }

  public create(): void {
    this.#haulerTrips = Array.from({ length: 5 }, () => null);
    // Before any view, because the material sprites are built from the loaded
    // artwork and every floor and stage binds one on its first snapshot.
    createBacklogTextures(this);
    this.#resolveRuntimeAnimations();

    const layout = calculateMineLayout(this.scale.width, this.scale.height);

    const fixedLayers = [
      this.#createHud(layout.hud),
      this.#createSurface(layout.surface),
      this.#createBottomNavigation(layout.bottomNavigation),
    ];
    const mineContent = this.#createMineContent(layout.width);

    this.#marketplace = new MarketplaceModal(
      this.game.canvas.parentElement ?? document.body,
      () => {
        this.input.enabled = true;
        this.#publishMarketplaceClose();
      },
      {
        onPurchase: this.#onMarketplacePurchase ?? undefined,
        getWalletGold: this.#getWalletGold ?? undefined,
        getCollection: this.#getCollection ?? undefined,
        loadListings: this.#loadMarketplaceListings ?? undefined,
        onCreateListing: this.#onCreateMarketplaceListing ?? undefined,
        onCancelListing: this.#onCancelMarketplaceListing ?? undefined,
        onBuyListing: this.#onBuyMarketplaceListing ?? undefined,
        onRentListing: this.#onRentMarketplaceListing ?? undefined,
        onViewCollection: () => {
          if (this.#onCollection === null) {
            return;
          }
          this.input.enabled = false;
          this.#onCollection(() => {
            this.input.enabled = true;
          });
        },
      },
    );
    this.#floorUpgradeModal = new MineShaftUpgradeModal({
      parent: this.game.canvas.parentElement ?? document.body,
      onUpgrade: (target, quantity) => {
        return this.#requestUpgradeBatch(target, quantity);
      },
      onClose: () => {
        this.#selectedUpgradeTarget = null;
        this.input.enabled = true;
        this.#publishViewDiagnostics(true);
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.#marketplace?.destroy();
      this.#marketplace = null;
      this.#floorUpgradeModal?.destroy();
      this.#floorUpgradeModal = null;
      // The owning surface container destroys the Graphics; discard references
      // so a scene restart creates exactly one fresh effect per cart.
      this.#haulerThrusters = [];
      this.#haulerTrips = [];
    });

    this.#bindSnapshot(this.#source.snapshot, true);
    this.#syncRuntimeCatAssignments(true);
    this.#applyAnimation();
    this.#applyPurchaseFeedback(this.time.now);

    // A dedicated camera viewport clips the mine area in both WebGL and Canvas,
    // and its `scrollY` is the one value the scroll gesture drives. Phaser
    // hit-tests through the same camera, so a control's pressable rectangle
    // follows the content it is drawn on without any further bookkeeping.
    const mineCamera = this.cameras.add(
      layout.mine.x,
      layout.mine.y,
      layout.mine.width,
      layout.mine.height,
      false,
      MINE_CAMERA_KEY,
    );
    mineCamera.setBackgroundColor(COLOR_MINE_BACKGROUND);
    mineCamera.setScroll(0, 0);
    mineCamera.ignore(fixedLayers);
    this.cameras.main.ignore(mineContent);
    this.#mineCamera = mineCamera;
    this.#mineRegion = layout.mine;
    this.#scroll = createMineScrollState({
      region: layout.mine,
      contentHeight: calculateMineContentHeight(this.#visibleFloorCount),
    });
    this.#bindScrollInput();

    this.#publishDiagnostics(layout);
  }

  /**
   * Pulls the newest snapshot and advances the cosmetic clock.
   *
   * The two are independent on purpose: the snapshot comes from the core's own
   * wall-clock advance, while `delta` — how long this frame happened to take —
   * only ever reaches decoration.
   */
  public override update(time: number, delta: number): void {
    this.#bindSnapshot(this.#source.advance(), false);
    this.#bottomNavigationView?.setBoostRemainingMs(this.#source.getBoostRemainingMs?.() ?? 0);
    this.#syncRuntimeCatAssignments(false);
    this.#animationTimeMs = advanceAnimationTimeMs(
      this.#animationTimeMs,
      delta,
      this.#animationSpeedMultiplier,
    );
    this.#applyAnimation();
    // Press results run on the scene clock rather than the cosmetic one: how
    // long a message stays readable must not change with animation speed.
    this.#applyPurchaseFeedback(time);
    this.#publishViewDiagnostics(false);
    this.#publishPerformanceDiagnostics(false);
  }

  /** Scales cosmetic motion. Rejects non-finite or negative multipliers. */
  public setAnimationSpeedMultiplier(multiplier: number): void {
    assertAnimationSpeedMultiplier(multiplier);
    this.#animationSpeedMultiplier = multiplier;
  }

  /** Loads one destination family while the Map still covers the mine scene. */
  public prepareSiteArt(siteId: MineSiteId): Promise<void> {
    const art = MINE_SITE_ART[siteId];
    const assets = [art.surface, art.towerLoaded, art.towerEmpty, art.warehouse,
      art.cartFilled, art.shaft, art.tobiCartFilled, art.rivetCartFilled,
      ...art.floors, art.orePile];
    if ([...assets, art.pour, art.impact].every((asset) => this.textures.exists(asset.key))) {
      return Promise.resolve();
    }
    if (this.#siteArtLoadPromise !== null) return this.#siteArtLoadPromise;
    this.#siteArtLoadPromise = new Promise<void>((resolve, reject) => {
      this.load.once('complete', () => {
        this.#siteArtLoadPromise = null;
        if ([...assets, art.pour, art.impact].every((asset) => this.textures.exists(asset.key))) resolve();
        else reject(new Error(`Could not load ${siteId} artwork.`));
      });
      for (const asset of assets) {
        if (!this.textures.exists(asset.key)) this.load.image(asset.key, asset.path);
      }
      if (!this.textures.exists(art.pour.key)) {
        this.load.spritesheet(art.pour.key, art.pour.path, {
          frameWidth: PLACEHOLDER_ANIMATION_FRAME_SIZE,
          frameHeight: PLACEHOLDER_ANIMATION_FRAME_SIZE,
        });
      }
      if (!this.textures.exists(art.impact.key)) {
        this.load.spritesheet(art.impact.key, art.impact.path, {
          frameWidth: MINER_MINING_IMPACT_ASSET.frameSizePx,
          frameHeight: MINER_MINING_IMPACT_ASSET.frameSizePx,
        });
      }
      this.load.start();
    });
    return this.#siteArtLoadPromise;
  }

  /** Binds the family after the runtime has committed its mine selection. */
  public activateSiteArt(siteId: MineSiteId): void {
    const art = MINE_SITE_ART[siteId];
    const assets = [art.surface, art.towerLoaded, art.towerEmpty, art.warehouse,
      art.cartFilled, art.shaft, art.tobiCartFilled, art.rivetCartFilled,
      ...art.floors, art.orePile];
    if (![...assets, art.pour, art.impact].every((asset) => this.textures.exists(asset.key))) {
      throw new Error(`Artwork for ${siteId} is not loaded.`);
    }
    if (this.#siteId === siteId) return;
    this.#siteScrollY.set(this.#siteId, this.#scroll?.scrollY ?? 0);
    const previousSiteId = this.#siteId;
    this.#siteId = siteId;
    // Site changes can change the active roster without changing the account's
    // assignment revision. Rebind the defaults or site cats on this boundary.
    this.#syncRuntimeCatAssignments(true);
    for (const pour of this.#surfaceGoldPours) {
      pour.setTexture(art.pour.key, 0)
        .setDisplaySize(SURFACE_GOLD_POUR_WIDTH, SURFACE_GOLD_POUR_HEIGHT);
    }
    for (const material of [this.#shaftCabinMaterial, this.#surfaceCabinMaterial]) {
      material?.setTexture(art.orePile.key)
        .setDisplaySize(CABIN_MATERIAL_SIZE, CABIN_MATERIAL_SIZE);
    }
    this.#siteNameBadge?.setText(getMineSite(siteId).name);
    this.#shaftBackground?.setTexture(art.shaft.key);
    if (this.#surfaceLandscape !== null) {
      const { displayWidth, displayHeight } = this.#surfaceLandscape;
      this.#surfaceLandscape
        .setTexture(MINE_SITE_ART[siteId].surface.key)
        .setDisplaySize(displayWidth, displayHeight);
    }
    if (this.#surfaceWarehouse !== null) {
      const { displayWidth, displayHeight } = this.#surfaceWarehouse;
      this.#surfaceWarehouse
        .setTexture(art.warehouse.key)
        .setDisplaySize(displayWidth, displayHeight);
    }
    if (PUBLISHES_VIEW_DIAGNOSTICS) this.game.canvas.dataset.mineSiteId = siteId;
    for (let index = 0; index < this.#floorViews.length; index += 1) {
      this.#floorViews[index].setSiteArt(
        mineFloorArt(siteId, index + 1).key,
        MINE_SITE_ART[siteId].orePile.key,
        MINE_SITE_ART[siteId].cartFilled.key,
        MINE_SITE_ART[siteId].impact.key,
        MINE_SITE_ART[siteId].pour.key,
      );
    }
    const snapshot = this.#source.snapshot;
    this.#visibleFloorCount = countVisibleFloors(snapshot);
    if (this.#mineRegion !== null) {
      const scroll = createMineScrollState({
        region: this.#mineRegion,
        contentHeight: calculateMineContentHeight(this.#visibleFloorCount),
      });
      this.#scroll = {
        ...scroll,
        scrollY: Math.min(this.#siteScrollY.get(siteId) ?? 0, scroll.maxScrollY),
      };
      this.#mineCamera?.setScroll(0, this.#scroll.scrollY);
    }
    this.#bindSnapshot(snapshot, true);
    if (previousSiteId !== 'gold') {
      const previousArt = MINE_SITE_ART[previousSiteId];
      for (const asset of [previousArt.surface, previousArt.towerLoaded,
        previousArt.towerEmpty, previousArt.warehouse, previousArt.cartFilled,
        previousArt.shaft,
        previousArt.tobiCartFilled, previousArt.rivetCartFilled,
        ...previousArt.floors,
        previousArt.orePile, previousArt.pour, previousArt.impact]) {
        if (this.textures.exists(asset.key)) this.textures.remove(asset.key);
      }
    }
  }

  /**
   * Rebinds every floor and shared-stage view to a newer core snapshot.
   *
   * A snapshot with the wrong number of floors is a caller bug and throws
   * instead of leaving views bound to nothing. An unchanged snapshot — no fixed
   * tick completed since the last frame, which at sixty frames a second is most
   * of them — is skipped by identity before the guard runs, so the frames that
   * change nothing cost nothing. Every distinct snapshot is still checked once,
   * on the frame it first arrives.
   */
  #bindSnapshot(viewModel: MineViewModel, force: boolean): void {
    if (!force && viewModel === this.#viewModel) {
      return;
    }

    assertRenderableMineViewModel(viewModel, MINE_FLOOR_COUNT);

    this.#viewModel = viewModel;
    const nextVisibleFloorCount = countVisibleFloors(viewModel);

    if (nextVisibleFloorCount !== this.#visibleFloorCount) {
      this.#visibleFloorCount = nextVisibleFloorCount;

      if (this.#scroll !== null) {
        this.#scroll = resizeMineScrollContent(
          this.#scroll,
          calculateMineContentHeight(nextVisibleFloorCount),
        );
        this.#mineCamera?.setScroll(0, this.#scroll.scrollY);
        this.game.canvas.dataset.layoutMineContentHeight = String(
          this.#scroll.contentHeight,
        );
      }
    }

    if (
      this.#hudView === null ||
      this.#elevatorView === null ||
      this.#warehouseView === null
    ) {
      return;
    }

    this.#hudView.applySnapshot(viewModel.hud);
    this.#floorViews.forEach((view, index) => {
      view.applySnapshot(viewModel.floors[index], this.time.now);
    });
    this.#elevatorView.applySnapshot(viewModel.elevator);
    this.#warehouseView.applySnapshot(viewModel.warehouse);
    this.#surfaceElevatorTower
      ?.setTexture(
        viewModel.warehouse.queueSteps > 0
          ? MINE_SITE_ART[this.#siteId].towerLoaded.key
          : MINE_SITE_ART[this.#siteId].towerEmpty.key,
      )
      .setDisplaySize(
        SURFACE_ELEVATOR_TOWER_WIDTH,
        SURFACE_ELEVATOR_TOWER_HEIGHT,
      );
    this.#surfaceElevatorUpgradeControl?.applySnapshot(
      viewModel.elevator.upgradeControl,
    );
    this.#surfaceElevatorUpgradeControl?.applyDisplayOverride(
      'Level',
      String(viewModel.elevator.level),
    );
    this.#surfaceWarehouseUpgradeControl?.applySnapshot(
      viewModel.warehouse.upgradeControl,
    );
    this.#surfaceWarehouseUpgradeControl?.applyDisplayOverride(
      'Level',
      String(viewModel.warehouse.level),
    );

    if (this.#selectedUpgradeTarget !== null) {
      const selected = this.#resolveUpgradeModal(
        viewModel,
        this.#selectedUpgradeTarget,
      );

      if (selected !== null) {
        this.#floorUpgradeModal?.applySnapshot(selected);
      } else {
        this.#floorUpgradeModal?.close();
      }
    }
  }

  /**
   * Sends one press to the core and shows what came back.
   *
   * The control is pressable even when it is drawn unaffordable, so the answer
   * always comes from the command rather than from the price the renderer
   * happened to be showing. The snapshot is rebound and the diagnostics are
   * republished immediately, because a purchase changes displayed values
   * without any fixed tick completing.
   */
  #requestPurchase(control: PurchaseControlViewModel | null): void {
    if (control === null) {
      return;
    }

    // The release that ends a scroll lands on whatever the finger dragged the
    // content under, which is routinely a button. That press is the tail of a
    // gesture the player already spent on scrolling, so it buys nothing.
    if (this.#scroll?.hasDragged === true) {
      return;
    }

    const outcome = this.#source.purchase(control.target);

    this.#purchaseFeedback.set(
      control.key,
      createPurchaseFeedback(outcome, this.time.now),
    );
    this.#bindSnapshot(this.#source.snapshot, false);
    this.#applyPurchaseFeedback(this.time.now);
    this.#publishViewDiagnostics(true);
  }

  #openFloorUpgrade(index: number): void {
    if (this.#scroll?.hasDragged === true) {
      return;
    }

    const floor = this.#viewModel.floors[index];

    if (floor?.upgradeModal === null || floor === undefined) {
      return;
    }

    this.#openUpgradeModal(floor.upgradeModal.target);
  }

  #openSharedStageUpgrade(target: Extract<UpgradeTarget, { type: 'elevator' | 'warehouse' }>): void {
    this.#openUpgradeModal(target);
  }

  #openCatSlot(slotKey: CatSlotKey): void {
    if (this.#onCatSlot === null) {
      return;
    }

    this.#floorUpgradeModal?.close();
    this.input.enabled = false;
    this.#onCatSlot(slotKey, () => {
      this.input.enabled = true;
    });
  }

  #openUpgradeModal(target: UpgradeTarget): void {
    if (this.#scroll?.hasDragged === true) {
      return;
    }

    const model = this.#resolveUpgradeModal(this.#viewModel, target);

    if (model === null) {
      return;
    }

    this.#selectedUpgradeTarget = target;
    // Phaser listens above the canvas as well as on it. A DOM overlay therefore
    // owns input explicitly while open, so its CTA/close pointer cannot also
    // activate a surface or mine object underneath.
    this.input.enabled = false;
    this.#floorUpgradeModal?.open(model);
    this.#publishViewDiagnostics(true);
  }

  #requestUpgradeBatch(target: UpgradeTarget, quantity: number) {
    const outcome = this.#source.purchaseUpgradeBatch(target, quantity);

    this.#bindSnapshot(this.#source.snapshot, false);
    this.#publishViewDiagnostics(true);

    return outcome;
  }

  #resolveUpgradeModal(viewModel: MineViewModel, target: UpgradeTarget) {
    switch (target.type) {
      case 'mine-shaft':
        return viewModel.floors.find(({ id }) => id === target.floorId)
          ?.upgradeModal ?? null;
      case 'elevator':
        return viewModel.elevator.upgradeModal;
      case 'warehouse':
        return viewModel.warehouse.upgradeModal;
    }
  }

  /**
   * Drives the mine camera from pointer and wheel input.
   *
   * These are scene-wide input events rather than a draggable object, because
   * the mine is scrolled by dragging anywhere over it — including across the
   * floor panels and their buttons. The gesture model decides which of those
   * presses was a tap; the handlers here only translate Phaser's pointers into
   * it.
   */
  #bindScrollInput(): void {
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer) => {
        this.#updateScroll((scroll) => {
          return beginMineScrollGesture(scroll, toScrollPointer(pointer));
        });
      },
    );
    this.input.on(
      Phaser.Input.Events.POINTER_MOVE,
      (pointer: Phaser.Input.Pointer) => {
        this.#updateScroll((scroll) => {
          return dragMineScroll(scroll, toScrollPointer(pointer));
        });
      },
    );

    // A pointer released off the canvas still ends its gesture, or the mine
    // would keep following a finger that has already left.
    for (const event of [
      Phaser.Input.Events.POINTER_UP,
      Phaser.Input.Events.POINTER_UP_OUTSIDE,
    ]) {
      this.input.on(event, (pointer: Phaser.Input.Pointer) => {
        this.#updateScroll((scroll) => endMineScrollGesture(scroll, pointer.id));
      });
    }

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer) => {
        this.#updateScroll((scroll) => {
          return scrollMineByWheel(scroll, toScrollPointer(pointer), pointer.deltaY);
        });
      },
    );
  }

  /**
   * Applies one pure scroll transition and moves the camera if it changed.
   *
   * The transitions return their input unchanged by identity when nothing
   * moved, which is most pointer moves, so this is the cheap path on a frame
   * where the finger only wobbled. The rendered-state diagnostic is left to its
   * own cadence: republishing it on every pointer move would serialize the
   * whole screen at the pointer's rate rather than ten times a second.
   */
  #updateScroll(
    transition: (scroll: MineScrollState) => MineScrollState,
  ): void {
    const scroll = this.#scroll;

    if (scroll === null) {
      return;
    }

    const next = transition(scroll);

    if (next === scroll) {
      return;
    }

    this.#scroll = next;

    if (next.scrollY !== scroll.scrollY) {
      this.#mineCamera?.setScroll(0, next.scrollY);

      if (PUBLISHES_PERFORMANCE_DIAGNOSTICS) {
        this.game.canvas.dataset.performanceMineScrollY = String(next.scrollY);
      }
    }
  }

  #applyPurchaseFeedback(nowMs: number): void {
    this.#expirePurchaseFeedback(nowMs);

    this.#floorViews.forEach((view, index) => {
      const floor = this.#viewModel.floors[index];

      view.applyUpgradeFeedback(this.#describeFeedback(floor.upgradeControl, nowMs));
      view.applyUnlockFeedback(this.#describeFeedback(floor.unlockControl, nowMs));
    });
    this.#elevatorView?.applyUpgradeFeedback(
      this.#describeFeedback(this.#viewModel.elevator.upgradeControl, nowMs),
    );
    this.#warehouseView?.applyUpgradeFeedback(
      this.#describeFeedback(this.#viewModel.warehouse.upgradeControl, nowMs),
    );
    this.#surfaceElevatorUpgradeControl?.applyFeedback(
      this.#describeFeedback(this.#viewModel.elevator.upgradeControl, nowMs),
    );
    this.#surfaceWarehouseUpgradeControl?.applyFeedback(
      this.#describeFeedback(this.#viewModel.warehouse.upgradeControl, nowMs),
    );
  }

  /**
   * Drops every expired result, including those whose control has since gone.
   *
   * A successful unlock hides the control that was pressed, so a result
   * collected only through live controls would sit in the map until that
   * control came back. The map is keyed by control and so was never going to
   * grow without bound; expiring it directly is simply the honest place to do
   * it, and keeps collection independent of what is currently on screen.
   */
  #expirePurchaseFeedback(nowMs: number): void {
    for (const [key, feedback] of this.#purchaseFeedback) {
      if (describePurchaseFeedback(feedback, nowMs) === null) {
        this.#purchaseFeedback.delete(key);
      }
    }
  }

  /** Reads one control's live result, or `null` when it has none. */
  #describeFeedback(
    control: PurchaseControlViewModel | null,
    nowMs: number,
  ): PurchaseFeedbackViewModel | null {
    if (control === null) {
      return null;
    }

    return describePurchaseFeedback(
      this.#purchaseFeedback.get(control.key) ?? null,
      nowMs,
    );
  }

  #siteFilledCartTexture(index: number): string {
    const texture = this.#haulerCartAssets[index].filledTexture;
    const art = MINE_SITE_ART[this.#siteId];
    if (texture === PLACEHOLDER_TEXTURES.goldContainerFilled) return art.cartFilled.key;
    if (texture === HAULER_CART_ASSETS[0].filledTexture) return art.tobiCartFilled.key;
    if (texture === HAULER_CART_ASSETS[1].filledTexture) return art.rivetCartFilled.key;
    return texture;
  }

  #applyAnimation(): void {
    for (const view of this.#floorViews) {
      if (!view.root.visible) {
        continue;
      }

      view.applyAnimation(this.#animationTimeMs, this.time.now);
    }

    this.#elevatorView?.applyAnimation(this.#animationTimeMs);
    this.#warehouseView?.applyAnimation(this.#animationTimeMs);
    this.#warehouseManager?.setFrame(
      calculateGeneratedAssetFrame(
        this.#animationTimeMs,
        this.#warehouseAnimation.frameCount,
        this.#warehouseAnimation.frameDurationMs,
      ),
    );

    const haulerCart = this.#surfaceHaulerCart;
    const haulerCat = this.#surfaceHaulerCat;
    const haulerAssistantCarts = this.#surfaceHaulerAssistantCarts;
    const haulerAssistants = this.#surfaceHaulerAssistants;
    const goldPours = this.#surfaceGoldPours;

    if (haulerCart !== null && haulerCat !== null && goldPours.length > 0) {
      // Surface delivery represents material already present in the tower's
      // warehouse input queue. Elevator cargo still underground or returning
      // cannot fill a cart or create a pour before it reaches that queue.
      const towerHasGold = this.#viewModel.warehouse.queueSteps > 0;
      const trip = advanceSurfaceHaulerTrip(
        this.#haulerTrips[0],
        this.#animationTimeMs,
        towerHasGold,
      );
      this.#haulerTrips[0] = trip;
      const pose = trip.pose;
      const cartX = Phaser.Math.Linear(
        SURFACE_HAULER_START_X,
        SURFACE_HAULER_END_X,
        pose.routeProgress,
      );
      const catX = cartX + (pose.facesLeft
        ? SURFACE_HAULER_CAT_GAP
        : -SURFACE_HAULER_CAT_GAP);

      haulerCart
        .setTexture(
          pose.cartIsFilled
            ? this.#siteFilledCartTexture(0)
            : this.#haulerCartAssets[0].emptyTexture,
        )
        .setFlipX(pose.facesLeft)
        .setOrigin(0.5, this.#haulerCartAssets[0].originY)
        .setPosition(cartX, SURFACE_HAULER_CART_Y + this.#haulerCartAssets[0].baselineOffsetY + this.#haulerCartAssets[0].hoverOffsetY)
        // `setTexture` restores the source's native dimensions. The empty cart
        // is 128 px and the filled variant is 256 px, so reapply one semantic
        // per-vehicle display box after every swap to prevent visible pulsing.
        .setDisplaySize(this.#haulerCartAssets[0].displaySize, this.#haulerCartAssets[0].displaySize);
      haulerCat
        .setFrame(Math.floor(this.#animationTimeMs / this.#haulerFrameDurations[0]) % 4)
        .setFlipX(pose.facesLeft)
        .setPosition(catX, SURFACE_HAULER_CART_Y - 1);
      goldPours[0]
        .setFrame(pose.frame)
        // The chute has one physical mouth; only the loading event/frame is
        // per-cart, never the origin of the falling gold.
        .setPosition(SURFACE_GOLD_POUR_X, SURFACE_GOLD_POUR_Y)
        .setVisible(pose.goldPourVisible);
      const activeHaulerCount = calculateSurfaceHaulerCount(
        this.#viewModel.warehouse.level,
      );

      for (const [index, assistant] of haulerAssistants.entries()) {
        const assistantCart = haulerAssistantCarts[index];
        const isActive = index < activeHaulerCount - 1;

        if (!isActive) {
          assistant.setVisible(false);
          assistantCart?.setVisible(false);
          goldPours[index + 1]?.setVisible(false);
          this.#haulerTrips[index + 1] = null;
          continue;
        }

        const route = calculateSurfaceHaulerAssistantPose(
          this.#animationTimeMs,
          false,
          index,
          activeHaulerCount,
        );
        const assistantTrip = advanceSurfaceHaulerTrip(
          this.#haulerTrips[index + 1],
          this.#animationTimeMs,
          towerHasGold,
          route.animationTimeOffsetMs,
        );
        this.#haulerTrips[index + 1] = assistantTrip;
        const assistantPose = { ...route, ...assistantTrip.pose };
        const assistantRouteX = Phaser.Math.Linear(
          SURFACE_HAULER_START_X,
          SURFACE_HAULER_END_X,
          assistantPose.routeProgress,
        );
        const offset = calculateSurfaceHaulerAssistantOffset(
          index,
          assistantPose.facesLeft,
        );
        // Formation spread is only for travel. Every cart must actually stop
        // at the same chute and warehouse, not unload short of the receiver.
        const travelSpread = Math.sin(Math.PI * assistantPose.routeProgress);
        const assistantCartX = assistantRouteX + offset.x * travelSpread;
        const assistantCartY = SURFACE_HAULER_CART_Y + offset.y;
        const assistantX = assistantCartX + (assistantPose.facesLeft
          ? SURFACE_HAULER_CAT_GAP
          : -SURFACE_HAULER_CAT_GAP);

        assistantCart
          ?.setVisible(true)
          .setTexture(
            assistantPose.cartIsFilled
              ? this.#siteFilledCartTexture(index + 1)
              : this.#haulerCartAssets[index + 1].emptyTexture,
          )
          .setFlipX(assistantPose.facesLeft)
          .setOrigin(0.5, this.#haulerCartAssets[index + 1].originY)
          .setPosition(assistantCartX, assistantCartY + this.#haulerCartAssets[index + 1].baselineOffsetY + this.#haulerCartAssets[index + 1].hoverOffsetY)
          .setDisplaySize(this.#haulerCartAssets[index + 1].displaySize, this.#haulerCartAssets[index + 1].displaySize);

        assistant
          .setVisible(true)
          .setFrame(Math.floor((this.#animationTimeMs + assistantPose.animationTimeOffsetMs) /
            this.#haulerFrameDurations[index + 1]) % 4)
          .setFlipX(assistantPose.facesLeft)
          .setPosition(
            assistantX,
            assistantCartY - 1,
          );
        goldPours[index + 1]
          ?.setFrame(assistantPose.frame)
          .setPosition(SURFACE_GOLD_POUR_X, SURFACE_GOLD_POUR_Y)
          .setVisible(assistantPose.goldPourVisible);
      }
      [haulerCart, ...haulerAssistantCarts].forEach((cart, index) => {
        this.#haulerThrusters[index]?.apply(
          cart,
          this.#haulerCartAssets[index],
          this.#animationTimeMs + index * 190,
        );
      });
    }

    const shaft = this.#shaftRegion;
    const elevator = this.#shaftElevator;
    const cargoCat = this.#shaftCargoCat;
    const cabinMaterial = this.#shaftCabinMaterial;
    const surfaceElevator = this.#surfaceElevator;
    const surfaceCargoCat = this.#surfaceCargoCat;
    const surfaceCabinMaterial = this.#surfaceCabinMaterial;

    if (
      shaft !== null &&
      elevator !== null &&
      cargoCat !== null &&
      cabinMaterial !== null &&
      surfaceElevator !== null &&
      surfaceCargoCat !== null &&
      surfaceCabinMaterial !== null
    ) {
      const shaftCenterX = shaft.x + shaft.width / 2;
      // The route terminates at one physical world point above floor one.
      // Camera scrolling must never move this endpoint: doing so shortens a
      // deep return leg and makes the cabin skip unseen floors into the tower.
      const surfaceStopWorldY =
        SURFACE_ELEVATOR_STOP_Y - SURFACE_HEIGHT;
      const stage = this.#viewModel.elevator;
      const floorIndex = stage.elevatorFloorIndex;
      let elevatorY = surfaceStopWorldY;

      if (floorIndex !== null && stage.elevatorDirection !== 'idle') {
        const visualProgress = easeElevatorTravelProgress(stage.progress);
        const floorCenterY = (() => {
          const slot = calculateFloorSlotRegion(floorIndex, this.scale.width);
          const panel = calculateMineFloorPanelLayout(slot.width, slot.height);
          return slot.y + panel.elevatorStopY;
        })();

        if (stage.elevatorDirection === 'descending') {
          const previousY = floorIndex === 0
            ? surfaceStopWorldY
            : (() => {
                const slot = calculateFloorSlotRegion(
                  floorIndex - 1,
                  this.scale.width,
                );
                const panel = calculateMineFloorPanelLayout(
                  slot.width,
                  slot.height,
                );
                return slot.y + panel.elevatorStopY;
              })();
          elevatorY = previousY + (floorCenterY - previousY) * visualProgress;
        } else {
          elevatorY =
            floorCenterY + (surfaceStopWorldY - floorCenterY) * visualProgress;
        }
      }

      // The surface twin maps the fixed world route into the fixed surface
      // layer. It therefore also remains independent of the mine camera.
      const surfaceLocalY = SURFACE_HEIGHT + elevatorY;
      const towerEntryProgress = Phaser.Math.Clamp(
        (SURFACE_HEIGHT - surfaceLocalY) /
          (SURFACE_HEIGHT - SURFACE_ELEVATOR_STOP_Y),
        0,
        1,
      );
      // The cabin shares one X coordinate with the underground shaft and the
      // surface bay. Only Y changes, so entering the tower can never drift
      // diagonally even though the tower artwork has an asymmetric chute.
      const elevatorX = shaftCenterX;
      const cargoVisible = stage.isRunning || stage.queueSteps > 0;
      const cargoFrame = stage.isRunning
        ? calculateGeneratedAssetFrame(
            this.#animationTimeMs,
            this.#elevatorAnimation.frameCount,
            this.#elevatorAnimation.frameDurationMs,
          )
        : 0;
      const surfaceAlpha = easeElevatorTravelProgress(
        Phaser.Math.Clamp(towerEntryProgress * 3, 0, 1),
      );

      elevator
        .setPosition(elevatorX, elevatorY);
      cargoCat
        .setFrame(cargoFrame)
        .setPosition(elevatorX, elevatorY + MINE_SHAFT_CABIN_CAT_Y_OFFSET)
        .setVisible(cargoVisible);
      cabinMaterial
        .setPosition(elevatorX + CABIN_MATERIAL_X_OFFSET, elevatorY + CABIN_MATERIAL_Y_OFFSET)
        .setVisible(stage.queueSteps > 0);
      // These twins are clipped to the surface strip. Together with the mine
      // camera's clip they form one continuous cabin across the boundary.
      surfaceElevator
        .setPosition(elevatorX, surfaceLocalY)
        .setAlpha(surfaceAlpha)
        .setVisible(towerEntryProgress > 0);
      surfaceCargoCat
        .setFrame(cargoFrame)
        .setPosition(elevatorX, surfaceLocalY + MINE_SHAFT_CABIN_CAT_Y_OFFSET)
        .setAlpha(surfaceAlpha)
        .setVisible(cargoVisible && towerEntryProgress > 0);
      surfaceCabinMaterial
        .setPosition(elevatorX + CABIN_MATERIAL_X_OFFSET, surfaceLocalY + CABIN_MATERIAL_Y_OFFSET)
        .setAlpha(surfaceAlpha)
        .setVisible(stage.queueSteps > 0 && towerEntryProgress > 0);
    }
  }

  #createHud(region: LayoutRegion): Phaser.GameObjects.Container {
    this.#hudView = new HudView(this, region, {
      onSettings: () => {
        if (this.#onSettings === null) {
          return;
        }

        // Settings is a top-level modal. Close any upgrade surface first so
        // dismissing it cannot reveal a stale warehouse/elevator popup below.
        this.#floorUpgradeModal?.close();
        this.input.enabled = false;
        this.#onSettings(() => {
          this.input.enabled = true;
        });
      },
    });

    return this.#hudView.root;
  }

  #createBottomNavigation(region: LayoutRegion): Phaser.GameObjects.Container {
    this.#bottomNavigationView = new BottomNavigationView(this, region, {
      onActivate: (key) => {
        this.#publishBottomNavigationActivation(key);
        if (key === 'rewards' && this.#onLeaderboard !== null) {
          this.input.enabled = false;
          this.#onLeaderboard(() => {
            this.input.enabled = true;
            this.#publishLeaderboardClose();
          });
          return;
        }

        if (key === 'boost' && this.#onBoost !== null) {
          this.input.enabled = false;
          this.#onBoost(() => {
            this.input.enabled = true;
            if (PUBLISHES_VIEW_DIAGNOSTICS) {
              const canvas = this.game.canvas;
              const closeCount = Number(canvas.dataset.boostCloseCount ?? '0');
              canvas.dataset.boostCloseCount = String(closeCount + 1);
            }
          });
          return;
        }

        if (key === 'map' && this.#onMap !== null) {
          this.input.enabled = false;
          this.#onMap(() => {
            this.input.enabled = true;
            if (PUBLISHES_VIEW_DIAGNOSTICS) {
              const canvas = this.game.canvas;
              const closeCount = Number(canvas.dataset.mapCloseCount ?? '0');
              canvas.dataset.mapCloseCount = String(closeCount + 1);
            }
          });
          return;
        }

        // Scene input is only surrendered once the modal that restores it is
        // known to exist: disabling it for a marketplace that never opens
        // would leave the mine unreachable with nothing left to re-enable it.
        if (key === 'shop' && this.#marketplace !== null) {
          this.input.enabled = false;
          this.#marketplace.open();
          return;
        }

        if (key === 'managers' && this.#onCollection !== null) {
          this.input.enabled = false;
          this.#onCollection(() => {
            this.input.enabled = true;
            if (PUBLISHES_VIEW_DIAGNOSTICS) {
              const canvas = this.game.canvas;
              const closeCount = Number(canvas.dataset.collectionCloseCount ?? '0');
              canvas.dataset.collectionCloseCount = String(closeCount + 1);
            }
          });
        }
      },
    });

    return this.#bottomNavigationView.root;
  }

  #publishLeaderboardClose(): void {
    if (!PUBLISHES_VIEW_DIAGNOSTICS) {
      return;
    }

    const canvas = this.game.canvas;
    const closeCount = Number(canvas.dataset.leaderboardCloseCount ?? '0');
    canvas.dataset.leaderboardCloseCount = String(closeCount + 1);
  }

  /**
   * Re-enabling input is idempotent, so a close callback that fired twice
   * would be invisible from the browser. Counting it is what lets a test hold
   * the modal to exactly one callback per dismissal.
   */
  #publishMarketplaceClose(): void {
    if (!PUBLISHES_VIEW_DIAGNOSTICS) {
      return;
    }

    const canvas = this.game.canvas;
    const closeCount = Number(canvas.dataset.marketplaceCloseCount ?? '0');

    canvas.dataset.marketplaceCloseCount = String(closeCount + 1);
  }

  #publishBottomNavigationActivation(key: BottomNavigationItemKey): void {
    if (!PUBLISHES_VIEW_DIAGNOSTICS) {
      return;
    }

    const canvas = this.game.canvas;
    const pressCount = Number(
      canvas.dataset.bottomNavigationPressCount ?? '0',
    );

    canvas.dataset.bottomNavigationLastPressed = key;
    canvas.dataset.bottomNavigationPressCount = String(pressCount + 1);
  }

  #createSurface(region: LayoutRegion): Phaser.GameObjects.Container {
    const layer = this.add.container(region.x, region.y);
    const panelWidth =
      (region.width - SURFACE_PANEL_INSET * 2 - SURFACE_PANEL_GAP) / 2;
    const panelHeight =
      region.height - SURFACE_TITLE_HEIGHT - SURFACE_PANEL_BOTTOM_INSET;

    layer.add(
      this.add
        .rectangle(0, 0, region.width, region.height, COLOR_SURFACE_BACKGROUND)
        .setOrigin(0, 0),
    );
    this.#surfaceLandscape = this.add
      .image(
        region.width / 2,
        region.height / 2,
        MINE_SITE_ART[this.#siteId].surface.key,
      )
      .setDisplaySize(region.width, region.height);
    layer.add(this.#surfaceLandscape);

    this.#surfaceElevator = this.add
      .image(
        SURFACE_ELEVATOR_STOP_X,
        SURFACE_ELEVATOR_STOP_Y,
        PLACEHOLDER_TEXTURES.elevatorCabin,
      )
      .setDisplaySize(MINE_SHAFT_CABIN_WIDTH, MINE_SHAFT_CABIN_HEIGHT);
    this.#surfaceCargoCat = this.add
      .sprite(
        SURFACE_ELEVATOR_STOP_X,
        SURFACE_ELEVATOR_STOP_Y + MINE_SHAFT_CABIN_CAT_Y_OFFSET,
        this.#elevatorAnimation.textureKey,
        0,
      )
      .setDisplaySize(
        CAT_RUNTIME_DISPLAY_SIZE,
        CAT_RUNTIME_DISPLAY_SIZE,
      )
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.#openCatSlot('elevator:main'));
    this.#surfaceCabinMaterial = this.add
      .image(
        SURFACE_ELEVATOR_STOP_X + CABIN_MATERIAL_X_OFFSET,
        SURFACE_ELEVATOR_STOP_Y + CABIN_MATERIAL_Y_OFFSET,
        MINE_SITE_ART[this.#siteId].orePile.key,
      )
      .setDisplaySize(CABIN_MATERIAL_SIZE, CABIN_MATERIAL_SIZE)
      .setVisible(false);
    this.#surfaceElevatorTower = this.add
      .image(
        SURFACE_ELEVATOR_TOWER_CENTER_X,
        SURFACE_ELEVATOR_TOWER_CENTER_Y,
        MINE_SITE_ART[this.#siteId].towerLoaded.key,
      )
      .setDisplaySize(
        SURFACE_ELEVATOR_TOWER_WIDTH,
        SURFACE_ELEVATOR_TOWER_HEIGHT,
      )
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.#openSharedStageUpgrade({ type: 'elevator' });
      });
    this.#surfaceWarehouse = this.add
      .image(
        SURFACE_WAREHOUSE_CENTER_X,
        SURFACE_WAREHOUSE_CENTER_Y,
        MINE_SITE_ART[this.#siteId].warehouse.key,
      )
      .setDisplaySize(SURFACE_WAREHOUSE_WIDTH, SURFACE_WAREHOUSE_HEIGHT)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.#openSharedStageUpgrade({ type: 'warehouse' });
      });

    layer.add([
      this.#surfaceElevator,
      this.#surfaceCargoCat,
      this.#surfaceCabinMaterial,
      this.#surfaceElevatorTower,
      this.#surfaceWarehouse,
    ]);
    layer.add(
      this.add
        .rectangle(
          0,
          region.height - 18,
          region.width,
          18,
          COLOR_SURFACE_GROUND,
        )
        .setOrigin(0, 0),
    );
    this.#surfaceHaulerCart = this.add
      .image(
        SURFACE_HAULER_START_X,
        SURFACE_HAULER_CART_Y,
        PLACEHOLDER_TEXTURES.goldContainer,
      )
      .setDisplaySize(SURFACE_HAULER_CART_SIZE, SURFACE_HAULER_CART_SIZE);
    this.#surfaceHaulerCat = this.add
      .sprite(
        SURFACE_HAULER_START_X - SURFACE_HAULER_CAT_GAP,
        SURFACE_HAULER_CART_Y - 1,
        PLACEHOLDER_ANIMATION_TEXTURES.surfaceHaulerCat,
        0,
      )
      .setDisplaySize(SURFACE_HAULER_CAT_SIZE, SURFACE_HAULER_CAT_SIZE)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.#openCatSlot('hauler:1'));
    this.#surfaceHaulerAssistantCarts = Array.from(
      { length: SURFACE_HAULER_ASSISTANT_COUNT },
      () => this.add
        .image(
          SURFACE_HAULER_START_X,
          SURFACE_HAULER_CART_Y,
          PLACEHOLDER_TEXTURES.goldContainer,
        )
        .setDisplaySize(SURFACE_HAULER_CART_SIZE, SURFACE_HAULER_CART_SIZE)
        .setVisible(false),
    );
    this.#surfaceHaulerAssistants = Array.from(
      { length: SURFACE_HAULER_ASSISTANT_COUNT },
      (_, index) => this.add
        .sprite(
          SURFACE_HAULER_START_X - SURFACE_HAULER_CAT_GAP,
          SURFACE_HAULER_CART_Y - 1,
          PLACEHOLDER_ANIMATION_TEXTURES.surfaceHaulerCat,
          0,
        )
        .setDisplaySize(SURFACE_HAULER_CAT_SIZE, SURFACE_HAULER_CAT_SIZE)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.#openCatSlot(`hauler:${index + 2}` as CatSlotKey))
        .setVisible(false),
    );
    this.#surfaceGoldPours = Array.from(
      { length: SURFACE_HAULER_ASSISTANT_COUNT + 1 },
      () => this.add
        .sprite(
          SURFACE_GOLD_POUR_X,
          SURFACE_GOLD_POUR_Y,
          MINE_SITE_ART[this.#siteId].pour.key,
          0,
        )
        .setDisplaySize(SURFACE_GOLD_POUR_WIDTH, SURFACE_GOLD_POUR_HEIGHT)
        .setVisible(false),
    );
    this.#haulerThrusters = Array.from(
      { length: SURFACE_HAULER_ASSISTANT_COUNT + 1 },
      () => new HaulerThrusterView(this),
    );
    layer.add([
      ...this.#haulerThrusters.map((view) => view.root),
      this.#surfaceHaulerCart,
      ...this.#surfaceHaulerAssistantCarts,
      ...this.#surfaceHaulerAssistants,
      this.#surfaceHaulerCat,
      ...this.#surfaceGoldPours,
    ]);
    this.#warehouseManager = this.add
      .sprite(
        SURFACE_WAREHOUSE_MANAGER_X,
        SURFACE_WAREHOUSE_MANAGER_Y,
        this.#warehouseAnimation.textureKey,
        0,
      )
      .setDisplaySize(
        this.#warehouseAnimation.displaySize,
        this.#warehouseAnimation.displaySize,
      )
      .setFlipX(true)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.#openCatSlot('warehouse:main'));
    layer.add(this.#warehouseManager);
    this.#surfaceElevatorUpgradeControl = new PurchaseControlView(this, {
      region: SURFACE_ELEVATOR_LEVEL_CONTROL,
      layout: 'floor-level',
      onPress: () => {
        this.#openSharedStageUpgrade({ type: 'elevator' });
      },
    });
    this.#surfaceWarehouseUpgradeControl = new PurchaseControlView(this, {
      region: SURFACE_WAREHOUSE_LEVEL_CONTROL,
      layout: 'floor-level',
      onPress: () => {
        this.#openSharedStageUpgrade({ type: 'warehouse' });
      },
    });
    layer.add([
      ...this.#surfaceElevatorUpgradeControl.objects,
      ...this.#surfaceWarehouseUpgradeControl.objects,
    ]);
    this.#elevatorView = new SharedStageView(
      this,
      {
        x: SURFACE_PANEL_INSET,
        y: SURFACE_TITLE_HEIGHT,
        width: panelWidth,
        height: panelHeight,
      },
      {
        textureKey: PLACEHOLDER_ANIMATION_TEXTURES.elevatorPulley,
        backgroundAlpha: 0.55,
        showStageSprite: false,
        onUpgrade: () => {
          this.#openSharedStageUpgrade({ type: 'elevator' });
        },
      },
    );
    // The generated headhouse is now the elevator's surface representation.
    // Keep the bound view as a read-back/purchase model, but never draw the
    // legacy stage card over the tower. Tapping the tower requests its upgrade.
    this.#elevatorView.root.setVisible(false);
    this.#warehouseView = new SharedStageView(
      this,
      {
        x: SURFACE_PANEL_INSET + panelWidth + SURFACE_PANEL_GAP,
        y: SURFACE_TITLE_HEIGHT,
        width: panelWidth,
        height: panelHeight,
      },
      {
        textureKey: PLACEHOLDER_ANIMATION_TEXTURES.warehouseReceive,
        onUpgrade: () => {
          this.#openSharedStageUpgrade({ type: 'warehouse' });
        },
      },
    );
    // The generated building and manager replace the legacy warehouse card.
    // The bound view remains the data/read-back model, while tapping the
    // building invokes the same upgrade command.
    this.#warehouseView.root.setVisible(false);

    layer.add([this.#elevatorView.root, this.#warehouseView.root]);
    this.#siteNameBadge = this.add.text(region.width / 2, 5,
      getMineSite(this.#siteId).name, {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: FONT_STYLE_BOLD,
        color: '#fff7df',
        backgroundColor: '#152942',
        padding: { x: 7, y: 3 },
      }).setOrigin(0.5, 0);
    layer.add(this.#siteNameBadge);

    return layer;
  }

  /** Mine content taller than its camera viewport, so the area must scroll. */
  #createMineContent(width: number): Phaser.GameObjects.Container {
    const content = this.add.container(0, 0);
    const contentHeight = calculateMineContentHeight(MINE_FLOOR_COUNT);
    const shaft = calculateMineShaftRegion(width, MINE_FLOOR_COUNT);

    const background = this.add
      .rectangle(0, 0, width, contentHeight, COLOR_MINE_BACKGROUND)
      .setOrigin(0, 0);
    const shaftBackground = this.add
      .tileSprite(
        shaft.x,
        shaft.y,
        shaft.width,
        shaft.height,
        MINE_SITE_ART[this.#siteId].shaft.key,
      )
      .setOrigin(0, 0)
      // The original four-floor art is 192x528. The fifteen-floor shaft must
      // repeat that artwork at native vertical scale; stretching one image to
      // the full depth smears every brace and rail as the mine scrolls.
      .setTileScale(
        shaft.width / ELEVATOR_SHAFT_TEXTURE_WIDTH_PX,
        1,
      );

    this.#shaftRegion = shaft;
    this.#shaftBackground = shaftBackground;
    this.#shaftElevator = this.add
      .image(
        shaft.x + shaft.width / 2,
        shaft.y + MINE_SHAFT_CABIN_HEIGHT / 2,
        PLACEHOLDER_TEXTURES.elevatorCabin,
      )
      .setDisplaySize(MINE_SHAFT_CABIN_WIDTH, MINE_SHAFT_CABIN_HEIGHT);
    this.#shaftCargoCat = this.add
      .sprite(
        shaft.x + shaft.width / 2,
        shaft.y + MINE_SHAFT_CABIN_HEIGHT / 2 + MINE_SHAFT_CABIN_CAT_Y_OFFSET,
        this.#elevatorAnimation.textureKey,
        0,
      )
      .setDisplaySize(
        this.#elevatorAnimation.displaySize,
        this.#elevatorAnimation.displaySize,
      )
      .setVisible(false);
    this.#shaftCabinMaterial = this.add
      .image(
        shaft.x + shaft.width / 2 + CABIN_MATERIAL_X_OFFSET,
        shaft.y + MINE_SHAFT_CABIN_HEIGHT / 2 + CABIN_MATERIAL_Y_OFFSET,
        MINE_SITE_ART[this.#siteId].orePile.key,
      )
      .setDisplaySize(CABIN_MATERIAL_SIZE, CABIN_MATERIAL_SIZE)
      .setVisible(false);

    content.add([
      background,
      shaftBackground,
    ]);

    this.#floorViews = Array.from({ length: MINE_FLOOR_COUNT }, (_, index) => {
      return new MineFloorView(this, calculateFloorSlotRegion(index, width), {
        hasThinSoilLayer: index > 0,
        floorBackgroundTextureKey: mineFloorArt(this.#siteId, index + 1).key,
        orePileTextureKey: MINE_SITE_ART[this.#siteId].orePile.key,
        cartFilledTextureKey: MINE_SITE_ART[this.#siteId].cartFilled.key,
        impactTextureKey: MINE_SITE_ART[this.#siteId].impact.key,
        pourTextureKey: MINE_SITE_ART[this.#siteId].pour.key,
        // Resolved from the current snapshot at press time, not captured here:
        // the control's price and target change as the mine does.
        onUpgrade: () => {
          this.#openFloorUpgrade(index);
        },
        onUnlock: () => {
          this.#requestPurchase(this.#viewModel.floors[index].unlockControl);
        },
        onCatClick: () => {
          this.#openCatSlot(`miner:${this.#viewModel.floors[index].id}`);
        },
        minerAnimation: this.#runtimeSlotBindings.find((binding) => {
          return binding.slotKey === `miner:${this.#viewModel.floors[index].id}`;
        })?.animation ?? this.#minerAnimation,
      });
    });
    content.add(this.#floorViews.map((view) => view.root));
    content.add(this.#shaftElevator);
    content.add(this.#shaftCargoCat);
    content.add(this.#shaftCabinMaterial);

    return content;
  }

  #resolveRuntimeAnimations(): void {
    this.#runtimeSlotBindings = this.#resolveRuntimeSlotBindings();
    this.#elevatorAnimation = this.#runtimeSlotBindings.find((binding) => {
      return binding.slotKey === 'elevator:main';
    })?.animation ?? MARKETPLACE_RUNTIME_ROLE_ASSETS.elevator;
    this.#warehouseAnimation = this.#runtimeSlotBindings.find((binding) => {
      return binding.slotKey === 'warehouse:main';
    })?.animation ?? MARKETPLACE_RUNTIME_ROLE_ASSETS.warehouse;
    this.#minerAnimation = this.#runtimeSlotBindings.find((binding) => {
      return binding.slotKey === 'miner:floor-1';
    })?.animation ?? MARKETPLACE_RUNTIME_ROLE_ASSETS.miner;
    this.#boundAssignmentRevision = this.#source.catRoster?.assignmentRevision ?? 0;
  }

  /** Rebinds runtime identity only after the source exposes a new projection. */
  #syncRuntimeCatAssignments(force: boolean): void {
    const assignmentRevision = this.#source.catRoster?.assignmentRevision ?? 0;
    if (!force && assignmentRevision === this.#boundAssignmentRevision) {
      return;
    }

    const bindings = this.#resolveRuntimeSlotBindings();
    this.#runtimeSlotBindings = bindings;
    this.#boundAssignmentRevision = assignmentRevision;

    const elevator = bindings.find((binding) => binding.slotKey === 'elevator:main');
    const warehouse = bindings.find((binding) => binding.slotKey === 'warehouse:main');
    if (elevator !== undefined) {
      this.#elevatorAnimation = elevator.animation;
      this.#applyRuntimeSprite(
        this.#shaftCargoCat,
        elevator.animation,
        CAT_RUNTIME_DISPLAY_SIZE,
      );
      this.#applyRuntimeSprite(
        this.#surfaceCargoCat,
        elevator.animation,
        CAT_RUNTIME_DISPLAY_SIZE,
      );
    }
    if (warehouse !== undefined) {
      this.#warehouseAnimation = warehouse.animation;
      this.#applyRuntimeSprite(this.#warehouseManager, warehouse.animation);
    }

    [this.#surfaceHaulerCat, ...this.#surfaceHaulerAssistants].forEach((sprite, index) => {
      const binding = bindings.find((candidate) => candidate.slotKey === `hauler:${index + 1}`);
      if (binding === undefined) return;
      this.#applyRuntimeSprite(sprite, binding.animation, SURFACE_HAULER_CAT_SIZE);
      this.#haulerFrameDurations[index] = binding.animation.frameDurationMs;
      const cart = resolveHaulerCartAsset(binding.animation.assetId);
      this.#haulerCartAssets[index] = this.textures.exists(cart.emptyTexture) &&
        this.textures.exists(cart.filledTexture) ? cart : resolveHaulerCartAsset(null);
    });

    this.#floorViews.forEach((view, index) => {
      const slotKey = `miner:${this.#viewModel.floors[index].id}`;
      const binding = bindings.find((candidate) => candidate.slotKey === slotKey);
      if (binding !== undefined) {
        view.applyMinerAnimation(binding.animation);
      }
    });

    this.#minerAnimation = bindings.find((binding) => {
      return binding.slotKey === 'miner:floor-1';
    })?.animation ?? this.#minerAnimation;
  }

  #resolveRuntimeSlotBindings(): readonly MarketplaceRuntimeSlotBinding[] {
    const roster = this.#source.catRoster;
    const resolve = (
      slotKey: string,
      roleId: MarketplaceRuntimeRole,
    ): MarketplaceRuntimeSlotBinding => {
      const cat = roster === undefined
        ? null
        : getCatForSlot(roster, slotKey as CatSlotKey);
      return resolveMarketplaceRuntimeSlot(
        slotKey,
        roleId,
        cat === null ? null : {
          catInstanceId: cat.catInstanceId,
          assetId: cat.assetId,
        },
        (asset) => this.textures.exists(asset.textureKey),
      );
    };

    return [
      resolve('elevator:main', 'elevator'),
      resolve('warehouse:main', 'warehouse'),
      ...Array.from({ length: 5 }, (_, index) => resolve(`hauler:${index + 1}`, 'hauler')),
      ...this.#viewModel.floors.map(({ id }) => resolve(`miner:${id}`, 'miner')),
    ];
  }

  #applyRuntimeSprite(
    sprite: Phaser.GameObjects.Sprite | null,
    animation: MarketplaceRuntimeAnimationAsset,
    displaySize: number = animation.displaySize,
  ): void {
    sprite
      ?.setTexture(animation.textureKey, 0)
      .setDisplaySize(displaySize, displaySize);
  }

  /**
   * Every visible priced control, with its pressable rectangle in screen
   * coordinates. Floor controls are drawn through the mine camera, so their
   * world rectangle is offset by that camera's viewport and scroll; the shared
   * stages are drawn by the main camera, where world and screen coincide.
   */
  #describePurchaseControls(): readonly PublishedPurchaseControl[] {
    const published: PublishedPurchaseControl[] = [];
    const camera = this.#mineCamera;
    const mine = this.#mineRegion;

    this.#floorViews.forEach((view, index) => {
      const floor = this.#viewModel.floors[index];

      if (camera === null || mine === null || !floor.isVisible) {
        return;
      }

      // Exactly one of the two is live on any floor, and only the live one is
      // pressable, so publishing both would offer a test coordinates for a
      // control that is not there.
      for (const [control, state] of [
        [floor.upgradeControl, view.describeUpgradeControl()],
        [floor.unlockControl, view.describeUnlockControl()],
      ] as const) {
        if (control === null) {
          continue;
        }

        const screenBounds = {
          x: state.worldBounds.x + mine.x - camera.scrollX,
          y: state.worldBounds.y + mine.y - camera.scrollY,
          width: state.worldBounds.width,
          height: state.worldBounds.height,
        };

        published.push({
          ...state,
          key: control.key,
          screenBounds,
          // Scrolled far enough, a floor control leaves the mine viewport
          // entirely. It is then clipped away and Phaser hit-tests the mine
          // camera only under its own viewport, so the rectangle still exists
          // while the control behind it does not.
          isPressable:
            state.isVisible &&
            regionContainsPoint(
              mine,
              screenBounds.x + screenBounds.width / 2,
              screenBounds.y + screenBounds.height / 2,
            ),
        });
      }
    });

    for (const [stage, control] of [
      [this.#viewModel.elevator, this.#surfaceElevatorUpgradeControl],
      [this.#viewModel.warehouse, this.#surfaceWarehouseUpgradeControl],
    ] as const) {
      if (control === null) {
        continue;
      }

      const state = control.describeRenderedState();

      published.push({
        ...state,
        key: stage.upgradeControl.key,
        screenBounds: state.worldBounds,
        // The surface is drawn by the main camera, which neither scrolls nor
        // clips, so a visible shared-stage control is always reachable.
        isPressable: state.isVisible,
      });
    }

    return published;
  }

  #publishDiagnostics(layout: MineLayout): void {
    const canvas = this.game.canvas;
    const starts = Number(canvas.dataset.bootSceneStarts ?? '0') + 1;
    const renderer =
      this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas';

    canvas.dataset.bootScene = BOOT_SCENE_KEY;
    canvas.dataset.mineSiteId = this.#siteId;
    canvas.dataset.bootSceneStarts = String(starts);
    canvas.dataset.renderer = renderer;
    canvas.dataset.layoutViewport = `${layout.width},${layout.height}`;
    canvas.dataset.layoutHud = serializeRegion(layout.hud);
    canvas.dataset.layoutSurface = serializeRegion(layout.surface);
    canvas.dataset.layoutMine = serializeRegion(layout.mine);
    canvas.dataset.layoutBottomNavigation = serializeRegion(
      layout.bottomNavigation,
    );
    canvas.dataset.layoutMineContentHeight = String(
      calculateMineContentHeight(this.#visibleFloorCount),
    );
    if (PUBLISHES_VIEW_DIAGNOSTICS) {
      canvas.dataset.bottomNavigationItems = JSON.stringify(
        this.#bottomNavigationView?.describeRenderedItems() ?? [],
      );
      canvas.dataset.bottomNavigationPressCount = '0';
      canvas.dataset.marketplaceCloseCount = '0';
    }
    canvas.setAttribute('aria-label', 'Cat Mine Idle game canvas');
    canvas.setAttribute('role', 'img');

    this.#publishPerformanceDiagnostics(true);
    this.#publishViewDiagnostics(true);
  }

  /**
   * Rendered values are read back from the view objects themselves, so a broken
   * binding cannot be hidden behind the scene's intentions. Published on a
   * cadence rather than once at boot: a diagnostic frozen at the first frame
   * would report a healthy screen while live snapshots silently failed to reach
   * the views, which is exactly the failure this read-back exists to catch.
   *
   * Development and test builds only. Nothing in the game reads these
   * attributes, so a shipped build would be serializing the whole screen ten
   * times a second for an audience that does not exist.
   */
  /**
   * Republishes the benchmark's live scene-graph size and unlocked-floor count.
   *
   * Both are sampled rather than published once at boot: a constant read at the
   * end of a long run cannot distinguish a pooled scene from a leaking one, and
   * a benchmark that silently fell back to a fresh single-floor save would
   * otherwise meet every budget while measuring the wrong mine.
   */
  #publishPerformanceDiagnostics(force: boolean): void {
    if (!PUBLISHES_PERFORMANCE_DIAGNOSTICS) {
      return;
    }

    if (
      !force &&
      this.time.now - this.#lastPerformanceDiagnosticMs <
        PERFORMANCE_DIAGNOSTIC_INTERVAL_MS
    ) {
      return;
    }

    this.#lastPerformanceDiagnosticMs = this.time.now;

    const canvas = this.game.canvas;

    canvas.dataset.performanceObjectCount = String(
      countGameObjects(this.children.getChildren()),
    );
    canvas.dataset.performanceUnlockedFloors = String(
      this.#viewModel.floors.filter((floor) => floor.isUnlocked).length,
    );
    canvas.dataset.performanceMineScrollY = String(this.#scroll?.scrollY ?? 0);
  }

  #publishViewDiagnostics(force: boolean): void {
    if (!PUBLISHES_VIEW_DIAGNOSTICS) {
      return;
    }

    if (
      !force &&
      this.time.now - this.#lastViewDiagnosticMs < VIEW_DIAGNOSTIC_INTERVAL_MS
    ) {
      return;
    }

    this.#lastViewDiagnosticMs = this.time.now;

    const canvas = this.game.canvas;
    const surfaceHaulerWorkforce = calculateSurfaceHaulerWorkforce(
      this.#viewModel.warehouse.level,
    );

    // Published only once the view exists, so a reader that finds the attribute
    // can trust its shape instead of parsing a `null` and failing later, on a
    // property access that says nothing about what actually went wrong.
    if (this.#hudView !== null) {
      canvas.dataset.hudView = JSON.stringify(
        this.#hudView.describeRenderedState(),
      );
    }

    canvas.dataset.floorViews = JSON.stringify(
      this.#floorViews
        .filter((_, index) => this.#viewModel.floors[index].isVisible)
        .map((view) => view.describeRenderedState()),
    );
    canvas.dataset.marketplaceRuntimeAssets = JSON.stringify({
      elevator: this.#elevatorAnimation.assetId,
      warehouse: this.#warehouseAnimation.assetId,
      miner: this.#minerAnimation.assetId,
    });
    canvas.dataset.catRuntimeBindings = JSON.stringify(
      this.#runtimeSlotBindings.map((binding) => ({
        slotKey: binding.slotKey,
        roleId: binding.roleId,
        catInstanceId: binding.catInstanceId,
        assignedAssetId: binding.assignedAssetId,
        runtimeAssetId: binding.animation.assetId,
        textureKey: binding.animation.textureKey,
        usesFallback: binding.usesFallback,
        fallbackReason: binding.fallbackReason,
        displaySize: binding.animation.displaySize,
        frameCount: binding.animation.frameCount,
        frameDurationMs: binding.animation.frameDurationMs,
      })),
    );
    canvas.dataset.surfaceViews = JSON.stringify([
      this.#elevatorView?.describeRenderedState() ?? null,
      this.#warehouseView?.describeRenderedState() ?? null,
    ]);
    canvas.dataset.purchaseControls = JSON.stringify(
      this.#describePurchaseControls(),
    );
    canvas.dataset.floorUpgradeModal = JSON.stringify(
      this.#floorUpgradeModal?.describeRenderedState() ?? null,
    );
    canvas.dataset.animation = JSON.stringify({
      speedMultiplier: this.#animationSpeedMultiplier,
      animationTimeMs: this.#animationTimeMs,
      elevatorCabin: this.#shaftElevator === null
        ? null
        : {
            centerY: this.#shaftElevator.y,
            width: this.#shaftElevator.displayWidth,
            height: this.#shaftElevator.displayHeight,
          },
      elevatorShaft: this.#shaftBackground === null
        ? null
        : {
            texture: this.#shaftBackground.texture.key,
            width: this.#shaftBackground.width,
            height: this.#shaftBackground.height,
            tileScaleX: this.#shaftBackground.tileScaleX,
            tileScaleY: this.#shaftBackground.tileScaleY,
            tileHeight: ELEVATOR_SHAFT_TEXTURE_HEIGHT_PX,
          },
      elevatorCargoCat: this.#shaftCargoCat === null
        ? null
        : {
            centerY: this.#shaftCargoCat.y,
            width: this.#shaftCargoCat.displayWidth,
            height: this.#shaftCargoCat.displayHeight,
            assetId: this.#elevatorAnimation.assetId,
            texture: this.#shaftCargoCat.texture.key,
          },
      elevatorCargoMaterial: this.#shaftCabinMaterial === null
        ? null
        : {
            texture: this.#shaftCabinMaterial.texture.key,
            visible: this.#shaftCabinMaterial.visible,
            x: this.#shaftCabinMaterial.x,
            y: this.#shaftCabinMaterial.y,
          },
      surfaceElevatorCat: this.#surfaceCargoCat === null
        ? null
        : {
            centerY: this.#surfaceCargoCat.y,
            width: this.#surfaceCargoCat.displayWidth,
            height: this.#surfaceCargoCat.displayHeight,
            assetId: this.#elevatorAnimation.assetId,
            texture: this.#surfaceCargoCat.texture.key,
          },
      surfaceElevatorCargoMaterial: this.#surfaceCabinMaterial === null
        ? null
        : {
            texture: this.#surfaceCabinMaterial.texture.key,
            visible: this.#surfaceCabinMaterial.visible,
          },
      elevatorTower: this.#surfaceElevatorTower === null
        ? null
        : {
            texture: this.#surfaceElevatorTower.texture.key,
            centerX: this.#surfaceElevatorTower.x,
            centerY: this.#surfaceElevatorTower.y,
            width: this.#surfaceElevatorTower.displayWidth,
            height: this.#surfaceElevatorTower.displayHeight,
          },
      surfaceElevatorCabin: this.#surfaceElevator === null
        ? null
        : {
            centerX: this.#surfaceElevator.x,
            centerY: this.#surfaceElevator.y,
            width: this.#surfaceElevator.displayWidth,
            height: this.#surfaceElevator.displayHeight,
          },
      warehouseBuilding: this.#surfaceWarehouse === null
        ? null
        : {
            texture: this.#surfaceWarehouse.texture.key,
            centerX: this.#surfaceWarehouse.x,
            centerY: this.#surfaceWarehouse.y,
            width: this.#surfaceWarehouse.displayWidth,
            height: this.#surfaceWarehouse.displayHeight,
          },
      warehouseManager: this.#warehouseManager === null
        ? null
        : {
            centerX: this.#warehouseManager.x,
            centerY: this.#warehouseManager.y,
            width: this.#warehouseManager.displayWidth,
            height: this.#warehouseManager.displayHeight,
            frame: Number(this.#warehouseManager.frame.name),
            flipX: this.#warehouseManager.flipX,
            assetId: this.#warehouseAnimation.assetId,
            texture: this.#warehouseManager.texture.key,
          },
      surfaceHauler: this.#surfaceHaulerCart === null ||
          this.#surfaceHaulerCat === null ||
          this.#surfaceGoldPours.length === 0
        ? null
        : {
            cartX: this.#surfaceHaulerCart.x,
            cartY: this.#surfaceHaulerCart.y,
            cartWidth: this.#surfaceHaulerCart.displayWidth,
            cartHeight: this.#surfaceHaulerCart.displayHeight,
            cartTexture: this.#surfaceHaulerCart.texture.key,
            phase: this.#haulerTrips[0]?.pose.phase,
            hasCargo: this.#haulerTrips[0]?.hasCargo ?? false,
            thrusters: this.#haulerThrusters[0]?.renderedState,
            catX: this.#surfaceHaulerCat.x,
            catY: this.#surfaceHaulerCat.y,
            catFrame: Number(this.#surfaceHaulerCat.frame.name),
            catTexture: this.#surfaceHaulerCat.texture.key,
            catWidth: this.#surfaceHaulerCat.displayWidth,
            catHeight: this.#surfaceHaulerCat.displayHeight,
            slotKey: 'hauler:1',
            catFlipX: this.#surfaceHaulerCat.flipX,
            rawCatCount: surfaceHaulerWorkforce.rawCount,
            productivityMultiplier: surfaceHaulerWorkforce.productivityMultiplier,
            activeCatCount: 1 + this.#surfaceHaulerAssistants.filter(
              (assistant) => assistant.visible,
            ).length,
            activeCartCount: 1 + this.#surfaceHaulerAssistantCarts.filter(
              (cart) => cart.visible,
            ).length,
            assistants: this.#surfaceHaulerAssistants.map((assistant, index) => ({
              slotKey: `hauler:${index + 2}`,
              catTexture: assistant.texture.key,
              catWidth: assistant.displayWidth,
              catHeight: assistant.displayHeight,
              visible: assistant.visible,
              x: assistant.x,
              y: assistant.y,
              frame: Number(assistant.frame.name),
              flipX: assistant.flipX,
              cartVisible: this.#surfaceHaulerAssistantCarts[index]?.visible ?? false,
              cartX: this.#surfaceHaulerAssistantCarts[index]?.x ?? 0,
              cartY: this.#surfaceHaulerAssistantCarts[index]?.y ?? 0,
              cartWidth: this.#surfaceHaulerAssistantCarts[index]?.displayWidth ?? 0,
              cartHeight: this.#surfaceHaulerAssistantCarts[index]?.displayHeight ?? 0,
              cartTexture: this.#surfaceHaulerAssistantCarts[index]?.texture.key ?? '',
              phase: this.#haulerTrips[index + 1]?.pose.phase,
              hasCargo: this.#haulerTrips[index + 1]?.hasCargo ?? false,
              thrusters: this.#haulerThrusters[index + 1]?.renderedState,
            })),
            goldPourVisible: this.#surfaceGoldPours[0].visible,
            goldPourFrame: Number(this.#surfaceGoldPours[0].frame.name),
            goldPourTexture: this.#surfaceGoldPours[0].texture.key,
            goldPours: this.#surfaceGoldPours.map((goldPour) => ({
              visible: goldPour.visible,
              x: goldPour.x,
              y: goldPour.y,
              frame: Number(goldPour.frame.name),
            })),
          },
      surfaceLandscape: this.#surfaceLandscape === null
        ? null
        : {
            texture: this.#surfaceLandscape.texture.key,
            centerX: this.#surfaceLandscape.x,
            centerY: this.#surfaceLandscape.y,
            width: this.#surfaceLandscape.displayWidth,
            height: this.#surfaceLandscape.displayHeight,
          },
    });

    if (this.#scroll !== null) {
      canvas.dataset.mineScroll = JSON.stringify(describeMineScroll(this.#scroll));
    }
  }
}

function countVisibleFloors(viewModel: MineViewModel): number {
  return viewModel.floors.filter((floor) => floor.isVisible).length;
}

/** Counts the full scene graph, including objects nested inside containers. */
function countGameObjects(
  objects: readonly Phaser.GameObjects.GameObject[],
): number {
  let count = 0;

  for (const object of objects) {
    count += 1;

    if (object instanceof Phaser.GameObjects.Container) {
      count += countGameObjects(object.list);
    }
  }

  return count;
}

/**
 * Phaser's pointer in the same logical coordinates the layout regions use.
 *
 * `pointer.x` and `pointer.y` are already scaled back through the fitted
 * canvas, so they can be compared with layout regions directly; `id` is the
 * slot Phaser keeps that pointer in, which is what distinguishes a second
 * finger from the one that started the gesture.
 */
function toScrollPointer(pointer: Phaser.Input.Pointer): MineScrollPointer {
  return { id: pointer.id, x: pointer.x, y: pointer.y };
}
