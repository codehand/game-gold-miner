import Phaser from 'phaser';

import { MineFloorView, SharedStageView } from '../entities';
import {
  calculateFloorSlotRegion,
  calculateMineContentHeight,
  calculateMineLayout,
  toFillColor,
  DIVIDER,
  FONT_FAMILY,
  HUD_BACKGROUND,
  MINE_BACKGROUND,
  MINE_FLOOR_COUNT,
  serializeRegion,
  SURFACE_BACKGROUND,
  TEXT_ACCENT,
  TEXT_MUTED,
  type LayoutRegion,
  type MineLayout,
} from '../layout';
import type { MineSnapshotSource } from '../runtime';
import {
  advanceAnimationTimeMs,
  assertAnimationSpeedMultiplier,
  assertRenderableMineViewModel,
  DEFAULT_ANIMATION_SPEED_MULTIPLIER,
  type MineViewModel,
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

const COLOR_HUD_BACKGROUND = toFillColor(HUD_BACKGROUND);
const COLOR_SURFACE_BACKGROUND = toFillColor(SURFACE_BACKGROUND);
const COLOR_MINE_BACKGROUND = toFillColor(MINE_BACKGROUND);
const COLOR_DIVIDER = toFillColor(DIVIDER);

export interface BootSceneOptions {
  readonly source: MineSnapshotSource;
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
  readonly #source: MineSnapshotSource;
  /** The snapshot currently bound to the views, compared by identity. */
  #viewModel: MineViewModel;
  #floorViews: readonly MineFloorView[] = [];
  #elevatorView: SharedStageView | null = null;
  #warehouseView: SharedStageView | null = null;
  #animationSpeedMultiplier: number;
  #animationTimeMs = 0;
  #lastViewDiagnosticMs = Number.NEGATIVE_INFINITY;

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

    this.#publishDiagnostics(layout);
  }

  /**
   * Pulls the newest snapshot and advances the cosmetic clock.
   *
   * The two are independent on purpose: the snapshot comes from the core's own
   * wall-clock advance, while `delta` — how long this frame happened to take —
   * only ever reaches decoration.
   */
  public override update(_time: number, delta: number): void {
    this.#bindSnapshot(this.#source.advance(), false);
    this.#animationTimeMs = advanceAnimationTimeMs(
      this.#animationTimeMs,
      delta,
      this.#animationSpeedMultiplier,
    );
    this.#applyAnimation();
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

    if (this.#elevatorView === null || this.#warehouseView === null) {
      return;
    }

    this.#floorViews.forEach((view, index) => {
      view.applySnapshot(viewModel.floors[index]);
    });
    this.#elevatorView.applySnapshot(viewModel.elevator);
    this.#warehouseView.applySnapshot(viewModel.warehouse);
  }

  #applyAnimation(): void {
    for (const view of this.#floorViews) {
      view.applyAnimation(this.#animationTimeMs);
    }

    this.#elevatorView?.applyAnimation(this.#animationTimeMs);
    this.#warehouseView?.applyAnimation(this.#animationTimeMs);
  }

  #createHud(region: LayoutRegion): Phaser.GameObjects.Container {
    const layer = this.add.container(region.x, region.y);

    layer.add(
      this.add
        .rectangle(0, 0, region.width, region.height, COLOR_HUD_BACKGROUND)
        .setOrigin(0, 0),
    );
    layer.add(
      this.add
        .rectangle(0, region.height - 2, region.width, 2, COLOR_DIVIDER)
        .setOrigin(0, 0),
    );
    layer.add(this.#createLabelledValue(16, 16, 'Gold', 'left'));
    layer.add(
      this.#createLabelledValue(region.width - 16, 16, 'Income /s', 'right'),
    );

    return layer;
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

    this.#elevatorView = new SharedStageView(this, {
      x: SURFACE_PANEL_INSET,
      y: SURFACE_TITLE_HEIGHT,
      width: panelWidth,
      height: panelHeight,
    });
    this.#warehouseView = new SharedStageView(this, {
      x: SURFACE_PANEL_INSET + panelWidth + SURFACE_PANEL_GAP,
      y: SURFACE_TITLE_HEIGHT,
      width: panelWidth,
      height: panelHeight,
    });

    layer.add([this.#elevatorView.root, this.#warehouseView.root]);

    return layer;
  }

  /** Mine content taller than its camera viewport, so the area must scroll. */
  #createMineContent(width: number): Phaser.GameObjects.Container {
    const content = this.add.container(0, 0);

    this.#floorViews = Array.from({ length: MINE_FLOOR_COUNT }, (_, index) => {
      return new MineFloorView(this, calculateFloorSlotRegion(index, width));
    });
    content.add(this.#floorViews.map((view) => view.root));

    return content;
  }

  #createLabelledValue(
    x: number,
    y: number,
    label: string,
    align: 'left' | 'right',
  ): Phaser.GameObjects.Container {
    const originX = align === 'right' ? 1 : 0;
    const group = this.add.container(x, y);

    group.add(
      this.add
        .text(0, 0, label, {
          color: TEXT_MUTED,
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
        })
        .setOrigin(originX, 0),
    );
    group.add(
      this.add
        .text(0, 16, '—', {
          color: TEXT_ACCENT,
          fontFamily: FONT_FAMILY,
          fontSize: '20px',
          fontStyle: 'bold',
        })
        .setOrigin(originX, 0),
    );

    return group;
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

    canvas.dataset.floorViews = JSON.stringify(
      this.#floorViews.map((view) => view.describeRenderedState()),
    );
    canvas.dataset.surfaceViews = JSON.stringify([
      this.#elevatorView?.describeRenderedState() ?? null,
      this.#warehouseView?.describeRenderedState() ?? null,
    ]);
    canvas.dataset.animation = JSON.stringify({
      speedMultiplier: this.#animationSpeedMultiplier,
      animationTimeMs: this.#animationTimeMs,
    });
  }
}
