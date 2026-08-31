import Phaser from 'phaser';

import { createBacklogTextures } from '../assets/backlogTextures';
import {
  PLACEHOLDER_ANIMATION_ASSETS,
  PLACEHOLDER_ANIMATION_FRAME_SIZE,
  PLACEHOLDER_ANIMATION_TEXTURES,
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_TEXTURES,
} from '../assets/placeholderAssets';
import {
  HudView,
  MineFloorView,
  SharedStageView,
  type RenderedPurchaseControlState,
} from '../entities';
import {
  calculateFloorSlotRegion,
  calculateMineContentHeight,
  calculateMineLayout,
  calculateMineShaftRegion,
  regionContainsPoint,
  toFillColor,
  FONT_FAMILY,
  MINE_BACKGROUND,
  MINE_FLOOR_COUNT,
  MINE_SHAFT_CABIN_SIZE,
  MINE_SHAFT_PLAQUE_HEIGHT,
  MINE_SHAFT_PLAQUE_WIDTH,
  SHAFT_BEAM,
  serializeRegion,
  SURFACE_BACKGROUND,
  SURFACE_GROUND,
  TEXT_MUTED,
  type LayoutRegion,
  type MineLayout,
} from '../layout';
import type { MineRuntimePort } from '../runtime';
import {
  advanceAnimationTimeMs,
  assertAnimationSpeedMultiplier,
  assertRenderableMineViewModel,
  beginMineScrollGesture,
  createMineScrollState,
  createPurchaseFeedback,
  calculateGeneratedAssetFrame,
  describeMineScroll,
  describePurchaseFeedback,
  dragMineScroll,
  endMineScrollGesture,
  scrollMineByWheel,
  DEFAULT_ANIMATION_SPEED_MULTIPLIER,
  type MineScrollPointer,
  type MineScrollState,
  type MineViewModel,
  type PurchaseControlViewModel,
  type PurchaseFeedback,
  type PurchaseFeedbackViewModel,
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

const SURFACE_TITLE_HEIGHT = 28;
const SURFACE_PANEL_INSET = 12;
const SURFACE_PANEL_GAP = 10;
const SURFACE_PANEL_BOTTOM_INSET = 10;

const COLOR_SURFACE_BACKGROUND = toFillColor(SURFACE_BACKGROUND);
const COLOR_MINE_BACKGROUND = toFillColor(MINE_BACKGROUND);
const COLOR_SURFACE_GROUND = toFillColor(SURFACE_GROUND);
const COLOR_SHAFT_BEAM = toFillColor(SHAFT_BEAM);

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
  /** Live press results, keyed by control, cleared as each one expires. */
  readonly #purchaseFeedback = new Map<string, PurchaseFeedback>();
  /** The snapshot currently bound to the views, compared by identity. */
  #viewModel: MineViewModel;
  #hudView: HudView | null = null;
  #floorViews: readonly MineFloorView[] = [];
  #elevatorView: SharedStageView | null = null;
  #warehouseView: SharedStageView | null = null;
  #animationSpeedMultiplier: number;
  #animationTimeMs = 0;
  #lastViewDiagnosticMs = Number.NEGATIVE_INFINITY;
  /** The camera the mine content is drawn through, needed to place presses. */
  #mineCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  #mineRegion: LayoutRegion | null = null;
  #shaftRegion: LayoutRegion | null = null;
  #shaftElevator: Phaser.GameObjects.Image | null = null;
  #shaftCargoCat: Phaser.GameObjects.Sprite | null = null;
  /** Scroll offset and tap-versus-drag state for the mine; null before `create`. */
  #scroll: MineScrollState | null = null;

  public constructor(options: BootSceneOptions) {
    super({ key: BOOT_SCENE_KEY });

    assertRenderableMineViewModel(options.source.snapshot, MINE_FLOOR_COUNT);
    assertAnimationSpeedMultiplier(
      options.animationSpeedMultiplier ?? DEFAULT_ANIMATION_SPEED_MULTIPLIER,
    );

    this.#source = options.source;
    this.#viewModel = options.source.snapshot;
    this.#animationSpeedMultiplier =
      options.animationSpeedMultiplier ?? DEFAULT_ANIMATION_SPEED_MULTIPLIER;
  }

  /** Loads the original Step 32 placeholder family before any view is built. */
  public preload(): void {
    for (const [key, path] of PLACEHOLDER_ASSETS) {
      this.load.image(key, path);
    }

    for (const [key, path] of PLACEHOLDER_ANIMATION_ASSETS) {
      this.load.spritesheet(key, path, {
        frameWidth: PLACEHOLDER_ANIMATION_FRAME_SIZE,
        frameHeight: PLACEHOLDER_ANIMATION_FRAME_SIZE,
      });
    }
  }

  public create(): void {
    // Before any view, because the material sprites are built from the loaded
    // artwork and every floor and stage binds one on its first snapshot.
    createBacklogTextures(this);

    const layout = calculateMineLayout(this.scale.width, this.scale.height);

    const fixedLayers = [
      this.#createHud(layout.hud),
      this.#createSurface(layout.surface),
    ];
    const mineContent = this.#createMineContent(layout.width);

    this.#bindSnapshot(this.#source.snapshot, true);
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
      contentHeight: calculateMineContentHeight(MINE_FLOOR_COUNT),
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
  }

  /** Scales cosmetic motion. Rejects non-finite or negative multipliers. */
  public setAnimationSpeedMultiplier(multiplier: number): void {
    assertAnimationSpeedMultiplier(multiplier);
    this.#animationSpeedMultiplier = multiplier;
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

    if (
      this.#hudView === null ||
      this.#elevatorView === null ||
      this.#warehouseView === null
    ) {
      return;
    }

    this.#hudView.applySnapshot(viewModel.hud);
    this.#floorViews.forEach((view, index) => {
      view.applySnapshot(viewModel.floors[index]);
    });
    this.#elevatorView.applySnapshot(viewModel.elevator);
    this.#warehouseView.applySnapshot(viewModel.warehouse);
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

  #applyAnimation(): void {
    for (const view of this.#floorViews) {
      view.applyAnimation(this.#animationTimeMs);
    }

    this.#elevatorView?.applyAnimation(this.#animationTimeMs);
    this.#warehouseView?.applyAnimation(this.#animationTimeMs);

    const shaft = this.#shaftRegion;
    const elevator = this.#shaftElevator;
    const cargoCat = this.#shaftCargoCat;

    if (shaft !== null && elevator !== null && cargoCat !== null) {
      const topY = shaft.y + MINE_SHAFT_CABIN_SIZE / 2;
      const bottomY = shaft.y + shaft.height - MINE_SHAFT_CABIN_SIZE / 2;
      const stage = this.#viewModel.elevator;
      const elevatorY = stage.isRunning
        ? bottomY - (bottomY - topY) * stage.progress
        : topY;

      elevator
        .setY(elevatorY);
      cargoCat
        .setFrame(
          stage.isRunning ? calculateGeneratedAssetFrame(this.#animationTimeMs, 4, 220) : 0,
        )
        .setY(elevatorY + 3)
        .setVisible(stage.isRunning || stage.queueSteps > 0);
    }
  }

  #createHud(region: LayoutRegion): Phaser.GameObjects.Container {
    this.#hudView = new HudView(this, region);

    return this.#hudView.root;
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
    layer.add(
      this.add
        .text(SURFACE_PANEL_INSET, 8, 'Surface operations', {
          color: TEXT_MUTED,
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
        })
        .setOrigin(0, 0),
    );

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
        onUpgrade: () => {
          this.#requestPurchase(this.#viewModel.elevator.upgradeControl);
        },
      },
    );
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
          this.#requestPurchase(this.#viewModel.warehouse.upgradeControl);
        },
      },
    );

    layer.add([this.#elevatorView.root, this.#warehouseView.root]);

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
      .image(shaft.x, shaft.y, PLACEHOLDER_TEXTURES.elevatorShaft)
      .setOrigin(0, 0)
      .setDisplaySize(shaft.width, shaft.height);

    const shaftLabels = Array.from({ length: MINE_FLOOR_COUNT }, (_, index) => {
      const slot = calculateFloorSlotRegion(index, width);
      const plaque = this.add
        .rectangle(
          shaft.x + shaft.width / 2,
          slot.y + slot.height / 2,
          MINE_SHAFT_PLAQUE_WIDTH,
          MINE_SHAFT_PLAQUE_HEIGHT,
          COLOR_SHAFT_BEAM,
        )
        .setOrigin(0.5, 0.5);
      const label = this.add
        .text(
          shaft.x + shaft.width / 2,
          slot.y + slot.height / 2,
          String(index + 1),
          {
            color: TEXT_MUTED,
            fontFamily: FONT_FAMILY,
            fontSize: '13px',
            fontStyle: 'bold',
          },
        )
        .setOrigin(0.5, 0.5);

      return [plaque, label] as const;
    }).flat();

    this.#shaftRegion = shaft;
    this.#shaftElevator = this.add
      .image(
        shaft.x + shaft.width / 2,
        shaft.y + MINE_SHAFT_CABIN_SIZE / 2,
        PLACEHOLDER_TEXTURES.elevatorCabin,
      )
      .setDisplaySize(MINE_SHAFT_CABIN_SIZE, MINE_SHAFT_CABIN_SIZE);
    this.#shaftCargoCat = this.add
      .sprite(
        shaft.x + shaft.width / 2,
        shaft.y + MINE_SHAFT_CABIN_SIZE / 2 + 3,
        PLACEHOLDER_ANIMATION_TEXTURES.elevatorCargoCat,
        0,
      )
      .setDisplaySize(25, 25)
      .setVisible(false);

    content.add([
      background,
      shaftBackground,
      ...shaftLabels,
    ]);

    this.#floorViews = Array.from({ length: MINE_FLOOR_COUNT }, (_, index) => {
      return new MineFloorView(this, calculateFloorSlotRegion(index, width), {
        hasThinSoilLayer: index > 0,
        // Resolved from the current snapshot at press time, not captured here:
        // the control's price and target change as the mine does.
        onUpgrade: () => {
          this.#requestPurchase(this.#viewModel.floors[index].upgradeControl);
        },
        onUnlock: () => {
          this.#requestPurchase(this.#viewModel.floors[index].unlockControl);
        },
      });
    });
    content.add(this.#floorViews.map((view) => view.root));
    content.add(this.#shaftElevator);
    content.add(this.#shaftCargoCat);

    return content;
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

      if (camera === null || mine === null) {
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

    for (const [stage, view] of [
      [this.#viewModel.elevator, this.#elevatorView],
      [this.#viewModel.warehouse, this.#warehouseView],
    ] as const) {
      if (view === null) {
        continue;
      }

      const state = view.describeUpgradeControl();

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
    canvas.dataset.bootSceneStarts = String(starts);
    canvas.dataset.renderer = renderer;
    canvas.dataset.layoutViewport = `${layout.width},${layout.height}`;
    canvas.dataset.layoutHud = serializeRegion(layout.hud);
    canvas.dataset.layoutSurface = serializeRegion(layout.surface);
    canvas.dataset.layoutMine = serializeRegion(layout.mine);
    canvas.dataset.layoutMineContentHeight = String(
      calculateMineContentHeight(MINE_FLOOR_COUNT),
    );
    canvas.dataset.layoutBottomNavigation = 'none';
    canvas.setAttribute('aria-label', 'Cat Mine Idle game canvas');
    canvas.setAttribute('role', 'img');

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

    // Published only once the view exists, so a reader that finds the attribute
    // can trust its shape instead of parsing a `null` and failing later, on a
    // property access that says nothing about what actually went wrong.
    if (this.#hudView !== null) {
      canvas.dataset.hudView = JSON.stringify(
        this.#hudView.describeRenderedState(),
      );
    }

    canvas.dataset.floorViews = JSON.stringify(
      this.#floorViews.map((view) => view.describeRenderedState()),
    );
    canvas.dataset.surfaceViews = JSON.stringify([
      this.#elevatorView?.describeRenderedState() ?? null,
      this.#warehouseView?.describeRenderedState() ?? null,
    ]);
    canvas.dataset.purchaseControls = JSON.stringify(
      this.#describePurchaseControls(),
    );
    canvas.dataset.animation = JSON.stringify({
      speedMultiplier: this.#animationSpeedMultiplier,
      animationTimeMs: this.#animationTimeMs,
    });

    if (this.#scroll !== null) {
      canvas.dataset.mineScroll = JSON.stringify(describeMineScroll(this.#scroll));
    }
  }
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
