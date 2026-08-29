import Phaser from 'phaser';

import {
  toFillColor,
  DIVIDER,
  FONT_FAMILY,
  HUD_BACKGROUND,
  TEXT_ACCENT,
  TEXT_MUTED,
  type LayoutRegion,
} from '../layout';
import type { HudViewModel } from '../view-model';

/** What the view actually put on screen, read back from its own objects. */
export interface RenderedHudState {
  readonly goldLabel: string;
  readonly goldValueLabel: string;
  readonly incomeLabel: string;
  readonly incomeValueLabel: string;
}

/** Which edge a text object is anchored by: `0` its left, `1` its right. */
type HorizontalOrigin = 0 | 1;

const ORIGIN_LEFT: HorizontalOrigin = 0;
const ORIGIN_RIGHT: HorizontalOrigin = 1;

const COLOR_HUD_BACKGROUND = toFillColor(HUD_BACKGROUND);
const COLOR_DIVIDER = toFillColor(DIVIDER);

const HUD_INSET_X = 16;
const LABEL_Y = 16;
const VALUE_Y = 32;
const DIVIDER_HEIGHT = 2;

/**
 * The fixed top HUD: spendable gold on the left, the mine's estimated income
 * per second on the right.
 *
 * Its four text objects are created once and only ever re-bound through
 * `applySnapshot`, so a value that changes ten times a second costs a string
 * assignment rather than a rebuilt display list. Like the other views it owns
 * no authoritative state and reports what it actually drew through
 * `describeRenderedState`.
 */
export class HudView {
  readonly #root: Phaser.GameObjects.Container;
  readonly #goldLabel: Phaser.GameObjects.Text;
  readonly #goldValue: Phaser.GameObjects.Text;
  readonly #incomeLabel: Phaser.GameObjects.Text;
  readonly #incomeValue: Phaser.GameObjects.Text;

  public constructor(scene: Phaser.Scene, region: LayoutRegion) {
    this.#root = scene.add.container(region.x, region.y);

    const background = scene.add
      .rectangle(0, 0, region.width, region.height, COLOR_HUD_BACKGROUND)
      .setOrigin(0, 0);
    const divider = scene.add
      .rectangle(
        0,
        region.height - DIVIDER_HEIGHT,
        region.width,
        DIVIDER_HEIGHT,
        COLOR_DIVIDER,
      )
      .setOrigin(0, 0);

    this.#goldLabel = this.#createLabel(scene, HUD_INSET_X, ORIGIN_LEFT);
    this.#goldValue = this.#createValue(scene, HUD_INSET_X, ORIGIN_LEFT);
    // Anchored to the right edge so a long value grows inwards rather than off
    // the screen.
    const incomeX = region.width - HUD_INSET_X;

    this.#incomeLabel = this.#createLabel(scene, incomeX, ORIGIN_RIGHT);
    this.#incomeValue = this.#createValue(scene, incomeX, ORIGIN_RIGHT);

    this.#root.add([
      background,
      divider,
      this.#goldLabel,
      this.#goldValue,
      this.#incomeLabel,
      this.#incomeValue,
    ]);
  }

  public get root(): Phaser.GameObjects.Container {
    return this.#root;
  }

  /** Rebinds both captions and both values to a newer read-only snapshot. */
  public applySnapshot(hud: HudViewModel): void {
    this.#goldLabel.setText(hud.goldLabel);
    this.#goldValue.setText(hud.goldValueLabel);
    this.#incomeLabel.setText(hud.incomeLabel);
    this.#incomeValue.setText(hud.incomeValueLabel);
  }

  public describeRenderedState(): RenderedHudState {
    return {
      goldLabel: this.#goldLabel.text,
      goldValueLabel: this.#goldValue.text,
      incomeLabel: this.#incomeLabel.text,
      incomeValueLabel: this.#incomeValue.text,
    };
  }

  #createLabel(
    scene: Phaser.Scene,
    x: number,
    originX: HorizontalOrigin,
  ): Phaser.GameObjects.Text {
    return scene.add
      .text(x, LABEL_Y, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
      })
      .setOrigin(originX, 0);
  }

  #createValue(
    scene: Phaser.Scene,
    x: number,
    originX: HorizontalOrigin,
  ): Phaser.GameObjects.Text {
    return scene.add
      .text(x, VALUE_Y, '', {
        color: TEXT_ACCENT,
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
      })
      .setOrigin(originX, 0);
  }
}
