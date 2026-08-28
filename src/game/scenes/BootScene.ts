import Phaser from 'phaser';

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
  PANEL_BACKGROUND,
  serializeRegion,
  SURFACE_BACKGROUND,
  TEXT_ACCENT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  type LayoutRegion,
  type MineLayout,
} from '../layout';

export const BOOT_SCENE_KEY = 'BootScene';

/** Internal camera name; nothing outside this scene addresses the camera. */
const MINE_CAMERA_KEY = 'MineCamera';

const COLOR_HUD_BACKGROUND = toFillColor(HUD_BACKGROUND);
const COLOR_SURFACE_BACKGROUND = toFillColor(SURFACE_BACKGROUND);
const COLOR_MINE_BACKGROUND = toFillColor(MINE_BACKGROUND);
const COLOR_PANEL = toFillColor(PANEL_BACKGROUND);
const COLOR_DIVIDER = toFillColor(DIVIDER);

export class BootScene extends Phaser.Scene {
  public constructor() {
    super({ key: BOOT_SCENE_KEY });
  }

  public create(): void {
    const layout = calculateMineLayout(this.scale.width, this.scale.height);

    const fixedLayers = [
      this.#createHud(layout.hud),
      this.#createSurface(layout.surface),
    ];
    const mineContent = this.#createMineContent(layout.width);

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
    const titleHeight = 36;
    const panelGap = 12;
    const panelInset = 16;
    const panelWidth = (region.width - panelInset * 2 - panelGap) / 2;
    const panelHeight = region.height - titleHeight - panelInset;

    layer.add(
      this.add
        .rectangle(0, 0, region.width, region.height, COLOR_SURFACE_BACKGROUND)
        .setOrigin(0, 0),
    );
    layer.add(
      this.add
        .text(panelInset, 12, 'Surface', {
          color: TEXT_MUTED,
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
        })
        .setOrigin(0, 0),
    );
    layer.add(
      this.#createStagePanel(
        { x: panelInset, y: titleHeight, width: panelWidth, height: panelHeight },
        'Elevator',
      ),
    );
    layer.add(
      this.#createStagePanel(
        {
          x: panelInset + panelWidth + panelGap,
          y: titleHeight,
          width: panelWidth,
          height: panelHeight,
        },
        'Warehouse',
      ),
    );

    return layer;
  }

  /**
   * Placeholder mine content taller than its camera viewport. Step 26 replaces
   * these slots with floor views bound to core snapshots.
   */
  #createMineContent(width: number): Phaser.GameObjects.Container {
    const content = this.add.container(0, 0);

    for (let floorIndex = 0; floorIndex < MINE_FLOOR_COUNT; floorIndex += 1) {
      const slot = calculateFloorSlotRegion(floorIndex, width);

      content.add(
        this.add
          .rectangle(slot.x, slot.y, slot.width, slot.height, COLOR_PANEL)
          .setOrigin(0, 0),
      );
      content.add(
        this.add
          .text(slot.x + 12, slot.y + 12, `Floor ${floorIndex + 1}`, {
            color: TEXT_PRIMARY,
            fontFamily: FONT_FAMILY,
            fontSize: '16px',
            fontStyle: 'bold',
          })
          .setOrigin(0, 0),
      );
    }

    return content;
  }

  #createStagePanel(
    region: LayoutRegion,
    title: string,
  ): Phaser.GameObjects.Container {
    const panel = this.add.container(region.x, region.y);

    panel.add(
      this.add
        .rectangle(0, 0, region.width, region.height, COLOR_PANEL)
        .setOrigin(0, 0),
    );
    panel.add(
      this.add
        .text(10, 10, title, {
          color: TEXT_PRIMARY,
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0),
    );
    panel.add(
      this.add
        .text(10, 30, 'Level —', {
          color: TEXT_MUTED,
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
        })
        .setOrigin(0, 0),
    );

    return panel;
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
  }
}
