import Phaser from 'phaser';

import {
  toFillColor,
  CONVEYOR_FILL,
  CYCLE_MARKER_FILL,
  FONT_FAMILY,
  MATERIAL_BACKLOG_FILL,
  MATERIAL_FILL,
  PANEL_BACKGROUND,
  PROGRESS_FILL,
  PROGRESS_TRACK,
  TEXT_ACCENT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_WARNING,
  type LayoutRegion,
} from '../layout';
import {
  calculateConveyorOffsetPx,
  calculateCycleMarkerOffsetPx,
  MAX_MATERIAL_PILE_STEPS,
  type PurchaseFeedbackViewModel,
  type SharedStageViewModel,
} from '../view-model';
import {
  PurchaseControlView,
  type RenderedPurchaseControlState,
} from './PurchaseControlView';

/** What the view actually put on screen, read back from its own objects. */
export interface RenderedSharedStageState {
  readonly title: string;
  readonly levelLabel: string;
  readonly capacityLabel: string;
  readonly queueLabel: string;
  /** Held material as visible blocks, so a backlog is countable from outside. */
  readonly queueSteps: number;
  readonly isQueueBackedUp: boolean;
  readonly statusLabel: string;
  readonly progressLabel: string;
  readonly progressFillWidth: number;
  readonly progressTrackWidth: number;
  /** Marker position along the track; a pure function of core progress. */
  readonly cycleMarkerOffsetPx: number;
  /** Conveyor position; a pure function of the cosmetic clock. */
  readonly conveyorOffsetPx: number;
  /** The conveyor runs only while the stage holds material. */
  readonly showsConveyor: boolean;
  /**
   * The control's own read-back: price, enabled state, and press feedback. A
   * shared stage never hides its upgrade control, so its visibility would be a
   * constant no assertion could fail; the bound price does catch a broken
   * binding.
   */
  readonly upgradeControl: RenderedPurchaseControlState;
}

const COLOR_PANEL = toFillColor(PANEL_BACKGROUND);
const COLOR_PROGRESS_TRACK = toFillColor(PROGRESS_TRACK);
const COLOR_PROGRESS_FILL = toFillColor(PROGRESS_FILL);
const COLOR_MATERIAL = toFillColor(MATERIAL_FILL);
const COLOR_MATERIAL_BACKLOG = toFillColor(MATERIAL_BACKLOG_FILL);
const COLOR_CYCLE_MARKER = toFillColor(CYCLE_MARKER_FILL);
const COLOR_CONVEYOR = toFillColor(CONVEYOR_FILL);

const PANEL_INSET_X = 10;
const PROGRESS_TRACK_HEIGHT = 8;
const PROGRESS_TRACK_Y = 61;
const PROGRESS_LABEL_WIDTH = 34;
const QUEUE_BLOCK_WIDTH = 14;
const QUEUE_BLOCK_HEIGHT = 7;
const QUEUE_BLOCK_GAP = 3;
const QUEUE_BLOCK_Y = 52;
const CYCLE_MARKER_WIDTH = 4;
const CYCLE_MARKER_HEIGHT = 12;
const CONVEYOR_Y = 74;
const CONVEYOR_DASH_COUNT = 3;
const CONVEYOR_DASH_WIDTH = 10;
const CONVEYOR_DASH_HEIGHT = 4;
const UPGRADE_Y = 82;
const UPGRADE_HEIGHT = 20;

export interface SharedStageViewOptions {
  /** Called when this stage's upgrade control is pressed. */
  readonly onUpgrade: () => void;
}

/**
 * The shared elevator or warehouse, rendered in the surface strip with its own
 * level, held material, cycle progress, status, and upgrade control. Like the
 * floor view it holds no authoritative state and is rebound through
 * `applySnapshot`.
 *
 * It carries the two remaining production stages. The progress bar and the
 * marker travelling its track come from authoritative progress; the conveyor
 * dashes come from the cosmetic clock and signal only that the stage is busy.
 */
export class SharedStageView {
  readonly #root: Phaser.GameObjects.Container;
  readonly #title: Phaser.GameObjects.Text;
  readonly #level: Phaser.GameObjects.Text;
  readonly #capacity: Phaser.GameObjects.Text;
  readonly #queue: Phaser.GameObjects.Text;
  readonly #status: Phaser.GameObjects.Text;
  readonly #queueBlocks: readonly Phaser.GameObjects.Rectangle[];
  readonly #progressTrack: Phaser.GameObjects.Rectangle;
  readonly #progressFill: Phaser.GameObjects.Rectangle;
  readonly #progressLabel: Phaser.GameObjects.Text;
  readonly #cycleMarker: Phaser.GameObjects.Rectangle;
  readonly #conveyorDashes: readonly Phaser.GameObjects.Rectangle[];
  readonly #upgradeControl: PurchaseControlView;
  readonly #trackWidth: number;

  public constructor(
    scene: Phaser.Scene,
    region: LayoutRegion,
    options: SharedStageViewOptions,
  ) {
    this.#trackWidth = region.width - PANEL_INSET_X * 2 - PROGRESS_LABEL_WIDTH;
    this.#root = scene.add.container(region.x, region.y);

    const background = scene.add
      .rectangle(0, 0, region.width, region.height, COLOR_PANEL)
      .setOrigin(0, 0);

    this.#title = scene.add
      .text(PANEL_INSET_X, 6, '', {
        color: TEXT_PRIMARY,
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.#level = scene.add
      .text(region.width - PANEL_INSET_X, 7, '', {
        color: TEXT_ACCENT,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    this.#capacity = scene.add
      .text(PANEL_INSET_X, 24, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
      })
      .setOrigin(0, 0);
    this.#queue = scene.add
      .text(PANEL_INSET_X, 38, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
      })
      .setOrigin(0, 0);
    this.#status = scene.add
      .text(region.width - PANEL_INSET_X, 38, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);

    this.#queueBlocks = Array.from({ length: MAX_MATERIAL_PILE_STEPS }, (_, step) => {
      return scene.add
        .rectangle(
          PANEL_INSET_X + step * (QUEUE_BLOCK_WIDTH + QUEUE_BLOCK_GAP),
          QUEUE_BLOCK_Y,
          QUEUE_BLOCK_WIDTH,
          QUEUE_BLOCK_HEIGHT,
          COLOR_MATERIAL,
        )
        .setOrigin(0, 0);
    });

    this.#progressTrack = scene.add
      .rectangle(
        PANEL_INSET_X,
        PROGRESS_TRACK_Y,
        this.#trackWidth,
        PROGRESS_TRACK_HEIGHT,
        COLOR_PROGRESS_TRACK,
      )
      .setOrigin(0, 0);
    this.#progressFill = scene.add
      .rectangle(
        PANEL_INSET_X,
        PROGRESS_TRACK_Y,
        0,
        PROGRESS_TRACK_HEIGHT,
        COLOR_PROGRESS_FILL,
      )
      .setOrigin(0, 0);
    this.#cycleMarker = scene.add
      .rectangle(
        PANEL_INSET_X,
        PROGRESS_TRACK_Y + PROGRESS_TRACK_HEIGHT / 2,
        CYCLE_MARKER_WIDTH,
        CYCLE_MARKER_HEIGHT,
        COLOR_CYCLE_MARKER,
      )
      .setOrigin(0.5, 0.5);
    this.#progressLabel = scene.add
      .text(region.width - PANEL_INSET_X, 58, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
      })
      .setOrigin(1, 0);

    this.#conveyorDashes = Array.from({ length: CONVEYOR_DASH_COUNT }, () => {
      return scene.add
        .rectangle(
          PANEL_INSET_X,
          CONVEYOR_Y,
          CONVEYOR_DASH_WIDTH,
          CONVEYOR_DASH_HEIGHT,
          COLOR_CONVEYOR,
        )
        .setOrigin(0, 0);
    });

    this.#upgradeControl = new PurchaseControlView(scene, {
      region: {
        x: PANEL_INSET_X,
        y: UPGRADE_Y,
        width: region.width - PANEL_INSET_X * 2,
        height: UPGRADE_HEIGHT,
      },
      layout: 'inline',
      onPress: options.onUpgrade,
    });

    this.#root.add([
      background,
      this.#title,
      this.#level,
      this.#capacity,
      this.#queue,
      this.#status,
      ...this.#queueBlocks,
      this.#progressTrack,
      this.#progressFill,
      this.#cycleMarker,
      this.#progressLabel,
      ...this.#conveyorDashes,
      ...this.#upgradeControl.objects,
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
    this.#status.setText(stage.statusLabel);
    this.#status.setColor(stage.isBackedUp ? TEXT_WARNING : TEXT_MUTED);

    const queueColor = stage.isBackedUp ? COLOR_MATERIAL_BACKLOG : COLOR_MATERIAL;

    this.#queueBlocks.forEach((block, index) => {
      block.setVisible(index < stage.queueSteps);
      block.setFillStyle(queueColor);
    });

    this.#progressFill.setSize(
      this.#trackWidth * stage.progress,
      PROGRESS_TRACK_HEIGHT,
    );
    this.#progressLabel.setText(stage.progressLabel);
    this.#cycleMarker.setX(
      PANEL_INSET_X + calculateCycleMarkerOffsetPx(stage.progress, this.#trackWidth),
    );

    for (const dash of this.#conveyorDashes) {
      dash.setVisible(stage.isRunning);
    }

    this.#upgradeControl.applySnapshot(stage.upgradeControl);
  }

  /** Shows or clears the result of a press on this stage's upgrade control. */
  public applyUpgradeFeedback(feedback: PurchaseFeedbackViewModel | null): void {
    this.#upgradeControl.applyFeedback(feedback);
  }

  /**
   * Scrolls the cosmetic conveyor. Nothing here touches the progress bar or the
   * cycle marker, which stay tied to authoritative progress.
   */
  public applyAnimation(animationTimeMs: number): void {
    const spacing = this.#trackWidth / CONVEYOR_DASH_COUNT;
    const offset = calculateConveyorOffsetPx(animationTimeMs, spacing);

    this.#conveyorDashes.forEach((dash, index) => {
      dash.setX(PANEL_INSET_X + ((offset + index * spacing) % this.#trackWidth));
    });
  }

  /** The upgrade control's read-back alone, for the scene's control diagnostic. */
  public describeUpgradeControl(): RenderedPurchaseControlState {
    return this.#upgradeControl.describeRenderedState();
  }

  public describeRenderedState(): RenderedSharedStageState {
    const [firstDash] = this.#conveyorDashes;

    return {
      title: this.#title.text,
      levelLabel: this.#level.text,
      capacityLabel: this.#capacity.text,
      queueLabel: this.#queue.text,
      queueSteps: this.#queueBlocks.filter((block) => block.visible).length,
      isQueueBackedUp: this.#queueBlocks.every((block) => {
        return block.fillColor === COLOR_MATERIAL_BACKLOG;
      }),
      statusLabel: this.#status.text,
      progressLabel: this.#progressLabel.text,
      progressFillWidth: this.#progressFill.width,
      progressTrackWidth: this.#progressTrack.width,
      cycleMarkerOffsetPx: this.#cycleMarker.x - PANEL_INSET_X,
      conveyorOffsetPx: firstDash.x - PANEL_INSET_X,
      showsConveyor: firstDash.visible,
      upgradeControl: this.describeUpgradeControl(),
    };
  }
}
