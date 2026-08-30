import Phaser from 'phaser';

import {
  HudView,
  MineFloorView,
  SharedStageView,
  type RenderedUpgradeControlState,
} from '../entities';
import {
  calculateFloorSlotRegion,
  calculateMineContentHeight,
  calculateMineLayout,
  toFillColor,
  FONT_FAMILY,
  MINE_BACKGROUND,
  MINE_FLOOR_COUNT,
  serializeRegion,
  SURFACE_BACKGROUND,
  TEXT_MUTED,
  type LayoutRegion,
  type MineLayout,
} from '../layout';
import type { MineRuntimePort } from '../runtime';
import {
  advanceAnimationTimeMs,
  assertAnimationSpeedMultiplier,
  assertRenderableMineViewModel,
  createUpgradeFeedback,
  describeUpgradeFeedback,
  DEFAULT_ANIMATION_SPEED_MULTIPLIER,
  type MineViewModel,
  type UpgradeControlViewModel,
  type UpgradeFeedback,
  type UpgradeFeedbackViewModel,
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

/**
 * One upgrade control as a browser test sees it: what it shows, plus where it
 * is on screen so a press can be aimed at it. `worldBounds` from the view is
 * converted through the camera that renders it, because the mine scrolls
 * behind its own viewport while the surface does not.
 */
export interface PublishedUpgradeControl extends RenderedUpgradeControlState {
  readonly key: string;
  readonly screenBounds: LayoutRegion;
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
  readonly #upgradeFeedback = new Map<string, UpgradeFeedback>();
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

  public create(): void {
    const layout = calculateMineLayout(this.scale.width, this.scale.height);

    const fixedLayers = [
      this.#createHud(layout.hud),
      this.#createSurface(layout.surface),
    ];
    const mineContent = this.#createMineContent(layout.width);

    this.#bindSnapshot(this.#source.snapshot, true);
    this.#applyAnimation();
    this.#applyUpgradeFeedback(this.time.now);

    // A dedicated camera viewport clips the mine area in both WebGL and Canvas
    // and gives Step 31 a single `scrollY` value to drive.
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
    this.#applyUpgradeFeedback(time);
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
  #requestUpgrade(control: UpgradeControlViewModel | null): void {
    if (control === null) {
      return;
    }

    const outcome = this.#source.purchaseUpgrade(control.target);

    this.#upgradeFeedback.set(
      control.key,
      createUpgradeFeedback(outcome, this.time.now),
    );
    this.#bindSnapshot(this.#source.snapshot, false);
    this.#applyUpgradeFeedback(this.time.now);
    this.#publishViewDiagnostics(true);
  }

  #applyUpgradeFeedback(nowMs: number): void {
    this.#floorViews.forEach((view, index) => {
      view.applyUpgradeFeedback(
        this.#describeFeedback(this.#viewModel.floors[index].upgradeControl, nowMs),
      );
    });
    this.#elevatorView?.applyUpgradeFeedback(
      this.#describeFeedback(this.#viewModel.elevator.upgradeControl, nowMs),
    );
    this.#warehouseView?.applyUpgradeFeedback(
      this.#describeFeedback(this.#viewModel.warehouse.upgradeControl, nowMs),
    );
  }

  /** Reads one control's live result, dropping it once it has expired. */
  #describeFeedback(
    control: UpgradeControlViewModel | null,
    nowMs: number,
  ): UpgradeFeedbackViewModel | null {
    if (control === null) {
      return null;
    }

    const feedback = this.#upgradeFeedback.get(control.key) ?? null;
    const described = describeUpgradeFeedback(feedback, nowMs);

    if (described === null && feedback !== null) {
      this.#upgradeFeedback.delete(control.key);
    }

    return described;
  }

  #applyAnimation(): void {
    for (const view of this.#floorViews) {
      view.applyAnimation(this.#animationTimeMs);
    }

    this.#elevatorView?.applyAnimation(this.#animationTimeMs);
    this.#warehouseView?.applyAnimation(this.#animationTimeMs);
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
        .text(SURFACE_PANEL_INSET, 8, 'Surface', {
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
        onUpgrade: () => {
          this.#requestUpgrade(this.#viewModel.elevator.upgradeControl);
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
        onUpgrade: () => {
          this.#requestUpgrade(this.#viewModel.warehouse.upgradeControl);
        },
      },
    );

    layer.add([this.#elevatorView.root, this.#warehouseView.root]);

    return layer;
  }

  /** Mine content taller than its camera viewport, so the area must scroll. */
  #createMineContent(width: number): Phaser.GameObjects.Container {
    const content = this.add.container(0, 0);

    this.#floorViews = Array.from({ length: MINE_FLOOR_COUNT }, (_, index) => {
      return new MineFloorView(this, calculateFloorSlotRegion(index, width), {
        // Resolved from the current snapshot at press time, not captured here:
        // the control's price and target change as the mine does.
        onUpgrade: () => {
          this.#requestUpgrade(this.#viewModel.floors[index].upgradeControl);
        },
      });
    });
    content.add(this.#floorViews.map((view) => view.root));

    return content;
  }

  /**
   * Every visible upgrade control, with its pressable rectangle in screen
   * coordinates. Floor controls are drawn through the mine camera, so their
   * world rectangle is offset by that camera's viewport and scroll; the shared
   * stages are drawn by the main camera, where world and screen coincide.
   */
  #describeUpgradeControls(): readonly PublishedUpgradeControl[] {
    const published: PublishedUpgradeControl[] = [];
    const camera = this.#mineCamera;
    const mine = this.#mineRegion;

    this.#floorViews.forEach((view, index) => {
      const control = this.#viewModel.floors[index].upgradeControl;

      if (control === null || camera === null || mine === null) {
        return;
      }

      const state = view.describeUpgradeControl();

      published.push({
        ...state,
        key: control.key,
        screenBounds: {
          x: state.worldBounds.x + mine.x - camera.scrollX,
          y: state.worldBounds.y + mine.y - camera.scrollY,
          width: state.worldBounds.width,
          height: state.worldBounds.height,
        },
      });
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
    canvas.dataset.upgradeControls = JSON.stringify(
      this.#describeUpgradeControls(),
    );
    canvas.dataset.animation = JSON.stringify({
      speedMultiplier: this.#animationSpeedMultiplier,
      animationTimeMs: this.#animationTimeMs,
    });
  }
}
