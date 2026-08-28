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
import {
  assertRenderableMineViewModel,
  type MineViewModel,
} from '../view-model';

export const BOOT_SCENE_KEY = 'BootScene';

/** Internal camera name; nothing outside this scene addresses the camera. */
const MINE_CAMERA_KEY = 'MineCamera';

const SURFACE_TITLE_HEIGHT = 28;
const SURFACE_PANEL_INSET = 12;
const SURFACE_PANEL_GAP = 10;
const SURFACE_PANEL_BOTTOM_INSET = 10;

const COLOR_HUD_BACKGROUND = toFillColor(HUD_BACKGROUND);
const COLOR_SURFACE_BACKGROUND = toFillColor(SURFACE_BACKGROUND);
const COLOR_MINE_BACKGROUND = toFillColor(MINE_BACKGROUND);
const COLOR_DIVIDER = toFillColor(DIVIDER);

/**
 * The single mine scene.
 *
 * It renders one reusable view per mine floor plus the shared elevator and
 * warehouse, all bound to the latest read-only snapshot it has been given —
 * the one handed in at construction until `applySnapshot` supplies a newer one.
 * The scene never mutates authoritative state; Step 27 drives these same views
 * from live simulation snapshots through `applySnapshot`.
 */
export class BootScene extends Phaser.Scene {
  /** The latest snapshot, held so `create` binds current values, not boot ones. */
  #viewModel: MineViewModel;
  #floorViews: readonly MineFloorView[] = [];
  #elevatorView: SharedStageView | null = null;
  #warehouseView: SharedStageView | null = null;

  public constructor(viewModel: MineViewModel) {
    super({ key: BOOT_SCENE_KEY });

    assertRenderableMineViewModel(viewModel, MINE_FLOOR_COUNT);
    this.#viewModel = viewModel;
  }

  public create(): void {
    const layout = calculateMineLayout(this.scale.width, this.scale.height);

    const fixedLayers = [
      this.#createHud(layout.hud),
      this.#createSurface(layout.surface),
    ];
    const mineContent = this.#createMineContent(layout.width);

    this.applySnapshot(this.#viewModel);

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
   * Rebinds every floor and shared-stage view to a newer core snapshot.
   *
   * A snapshot arriving before `create` runs is kept rather than dropped, so a
   * caller that starts pushing snapshots early cannot leave the scene showing
   * boot values. A snapshot with the wrong number of floors is a caller bug and
   * throws instead of leaving views bound to nothing.
   */
  public applySnapshot(viewModel: MineViewModel): void {
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
    // Republished on every rebind: a diagnostic frozen at boot would report a
    // healthy first frame while live snapshots silently failed to reach the
    // views, which is exactly the failure this read-back exists to catch.
    this.#publishViewDiagnostics();
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

    this.#publishViewDiagnostics();
  }

  /**
   * Rendered values are read back from the view objects themselves, so a broken
   * binding cannot be hidden behind the scene's intentions.
   */
  #publishViewDiagnostics(): void {
    const canvas = this.game.canvas;

    canvas.dataset.floorViews = JSON.stringify(
      this.#floorViews.map((view) => view.describeRenderedState()),
    );
    canvas.dataset.surfaceViews = JSON.stringify([
      this.#elevatorView?.describeRenderedState() ?? null,
      this.#warehouseView?.describeRenderedState() ?? null,
    ]);
  }
}
