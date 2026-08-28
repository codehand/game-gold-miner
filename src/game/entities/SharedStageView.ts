import Phaser from 'phaser';

import {
  toFillColor,
  CONTROL_BACKGROUND,
  FONT_FAMILY,
  PANEL_BACKGROUND,
  PROGRESS_FILL,
  PROGRESS_TRACK,
  TEXT_ACCENT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  type LayoutRegion,
} from '../layout';
import type { SharedStageViewModel } from '../view-model';

/** What the view actually put on screen, read back from its own objects. */
export interface RenderedSharedStageState {
  readonly title: string;
  readonly levelLabel: string;
  readonly capacityLabel: string;
  readonly queueLabel: string;
  readonly progressLabel: string;
  readonly progressFillWidth: number;
  readonly progressTrackWidth: number;
  /**
   * The label actually bound onto the control. A shared stage never hides its
   * upgrade control, so reporting visibility here would be a constant that no
   * assertion could ever fail; the bound text does catch a broken binding.
   */
  readonly upgradeControlLabel: string;
}

const COLOR_PANEL = toFillColor(PANEL_BACKGROUND);
const COLOR_CONTROL = toFillColor(CONTROL_BACKGROUND);
const COLOR_PROGRESS_TRACK = toFillColor(PROGRESS_TRACK);
const COLOR_PROGRESS_FILL = toFillColor(PROGRESS_FILL);

const PROGRESS_TRACK_HEIGHT = 8;
const PROGRESS_LABEL_WIDTH = 34;
const UPGRADE_HEIGHT = 22;

/**
 * The shared elevator or warehouse, rendered in the surface strip with its own
 * level, held amount, cycle progress, and upgrade control. Like the floor view
 * it holds no authoritative state and is rebound through `applySnapshot`.
 */
export class SharedStageView {
  readonly #root: Phaser.GameObjects.Container;
  readonly #title: Phaser.GameObjects.Text;
  readonly #level: Phaser.GameObjects.Text;
  readonly #capacity: Phaser.GameObjects.Text;
  readonly #queue: Phaser.GameObjects.Text;
  readonly #progressTrack: Phaser.GameObjects.Rectangle;
  readonly #progressFill: Phaser.GameObjects.Rectangle;
  readonly #progressLabel: Phaser.GameObjects.Text;
  readonly #upgradeLabel: Phaser.GameObjects.Text;
  readonly #trackWidth: number;

  public constructor(scene: Phaser.Scene, region: LayoutRegion) {
    this.#trackWidth = region.width - 20 - PROGRESS_LABEL_WIDTH;
    this.#root = scene.add.container(region.x, region.y);

    const background = scene.add
      .rectangle(0, 0, region.width, region.height, COLOR_PANEL)
      .setOrigin(0, 0);

    this.#title = scene.add
      .text(10, 8, '', {
        color: TEXT_PRIMARY,
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.#level = scene.add
      .text(region.width - 10, 9, '', {
        color: TEXT_ACCENT,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    this.#capacity = scene.add
      .text(10, 28, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
      })
      .setOrigin(0, 0);
    this.#queue = scene.add
      .text(10, 43, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
      })
      .setOrigin(0, 0);

    this.#progressTrack = scene.add
      .rectangle(10, 61, this.#trackWidth, PROGRESS_TRACK_HEIGHT, COLOR_PROGRESS_TRACK)
      .setOrigin(0, 0);
    this.#progressFill = scene.add
      .rectangle(10, 61, 0, PROGRESS_TRACK_HEIGHT, COLOR_PROGRESS_FILL)
      .setOrigin(0, 0);
    this.#progressLabel = scene.add
      .text(region.width - 10, 58, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
      })
      .setOrigin(1, 0);

    const upgradeBackground = scene.add
      .rectangle(10, 76, region.width - 20, UPGRADE_HEIGHT, COLOR_CONTROL)
      .setOrigin(0, 0);
    this.#upgradeLabel = scene.add
      .text(region.width / 2, 76 + UPGRADE_HEIGHT / 2, '', {
        color: TEXT_PRIMARY,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);

    this.#root.add([
      background,
      this.#title,
      this.#level,
      this.#capacity,
      this.#queue,
      this.#progressTrack,
      this.#progressFill,
      this.#progressLabel,
      upgradeBackground,
      this.#upgradeLabel,
    ]);
  }

  public get root(): Phaser.GameObjects.Container {
    return this.#root;
  }

  /** Rebinds every displayed value to a newer read-only snapshot. */
  public applySnapshot(stage: SharedStageViewModel): void {
    this.#title.setText(stage.title);
    this.#level.setText(stage.levelLabel);
    this.#capacity.setText(stage.capacityLabel);
    this.#queue.setText(stage.queueLabel);
    this.#progressFill.setSize(
      this.#trackWidth * stage.progress,
      PROGRESS_TRACK_HEIGHT,
    );
    this.#progressLabel.setText(stage.progressLabel);
    this.#upgradeLabel.setText(stage.upgradeControlLabel);
  }

  public describeRenderedState(): RenderedSharedStageState {
    return {
      title: this.#title.text,
      levelLabel: this.#level.text,
      capacityLabel: this.#capacity.text,
      queueLabel: this.#queue.text,
      progressLabel: this.#progressLabel.text,
      progressFillWidth: this.#progressFill.width,
      progressTrackWidth: this.#progressTrack.width,
      upgradeControlLabel: this.#upgradeLabel.text,
    };
  }
}
