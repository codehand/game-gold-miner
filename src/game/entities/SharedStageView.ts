import Phaser from 'phaser';

import { PLACEHOLDER_BACKLOG_TEXTURES } from '../assets/backlogTextures';
import {
  PLACEHOLDER_ANIMATION_TEXTURES,
  PLACEHOLDER_TEXTURES,
} from '../assets/placeholderAssets';
import {
  toFillColor,
  CONVEYOR_FILL,
  CYCLE_MARKER_FILL,
  FONT_FAMILY,
  MIN_TOUCH_TARGET_PX,
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
  calculateGeneratedAssetFrame,
  MAX_MATERIAL_PILE_STEPS,
  type PurchaseFeedbackViewModel,
  type SharedStageViewModel,
} from '../view-model';
import {
  PurchaseControlView,
  type RenderedPurchaseControlState,
} from './PurchaseControlView';
import { setTextColor } from './setTextColor';

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
  /** Current generated-art frame; zero while the stage is idle. */
  readonly assetFrame: number;
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
const COLOR_CYCLE_MARKER = toFillColor(CYCLE_MARKER_FILL);
const COLOR_CONVEYOR = toFillColor(CONVEYOR_FILL);

const PANEL_INSET_X = 10;
const PROGRESS_TRACK_HEIGHT = 8;
const PROGRESS_TRACK_Y = 61;
const PROGRESS_LABEL_WIDTH = 34;
const QUEUE_BLOCK_SIZE = 14;
const QUEUE_BLOCK_GAP = 3;
const QUEUE_BLOCK_Y = 54;
const STAGE_SPRITE_X = 26;
const STAGE_SPRITE_Y = 24;
const STAGE_SPRITE_SIZE = 38;
const CYCLE_MARKER_WIDTH = 4;
const CYCLE_MARKER_HEIGHT = 12;
const CONVEYOR_Y = 74;
const CONVEYOR_DASH_COUNT = 3;
const CONVEYOR_DASH_WIDTH = 10;
const CONVEYOR_DASH_HEIGHT = 4;
const UPGRADE_Y = 82;
/**
 * A thumb-sized target. The surface strip is sized to end each stage panel with
 * exactly this control, so the panel bottom and the control bottom coincide.
 */
const UPGRADE_HEIGHT = MIN_TOUCH_TARGET_PX;

export interface SharedStageViewOptions {
  /** Called when this stage's upgrade control is pressed. */
  readonly onUpgrade: () => void;
  /** Original placeholder artwork distinguishing the two shared stages. */
  readonly textureKey:
    | typeof PLACEHOLDER_ANIMATION_TEXTURES.elevatorPulley
    | typeof PLACEHOLDER_ANIMATION_TEXTURES.warehouseReceive;
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
  readonly #stageSprite: Phaser.GameObjects.Sprite;
  readonly #title: Phaser.GameObjects.Text;
  readonly #level: Phaser.GameObjects.Text;
  readonly #capacity: Phaser.GameObjects.Text;
  readonly #queue: Phaser.GameObjects.Text;
  readonly #status: Phaser.GameObjects.Text;
  readonly #queueBlocks: readonly Phaser.GameObjects.Image[];
  readonly #progressTrack: Phaser.GameObjects.Rectangle;
  readonly #progressFill: Phaser.GameObjects.Rectangle;
  readonly #progressLabel: Phaser.GameObjects.Text;
  readonly #cycleMarker: Phaser.GameObjects.Rectangle;
  readonly #conveyorDashes: readonly Phaser.GameObjects.Rectangle[];
  readonly #upgradeControl: PurchaseControlView;
  readonly #trackWidth: number;
  #isRunning = false;

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

    this.#stageSprite = scene.add
      .sprite(STAGE_SPRITE_X, STAGE_SPRITE_Y, options.textureKey, 0)
      .setDisplaySize(STAGE_SPRITE_SIZE, STAGE_SPRITE_SIZE);

    this.#title = scene.add
      .text(50, 6, '', {
        color: TEXT_PRIMARY,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
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
      .text(50, 24, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
      })
      .setOrigin(0, 0);
    this.#queue = scene.add
      .text(50, 38, '', {
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
        .image(
          PANEL_INSET_X +
            QUEUE_BLOCK_SIZE / 2 +
            step * (QUEUE_BLOCK_SIZE + QUEUE_BLOCK_GAP),
          QUEUE_BLOCK_Y,
          PLACEHOLDER_TEXTURES.oreCrate,
        )
        .setDisplaySize(QUEUE_BLOCK_SIZE, QUEUE_BLOCK_SIZE);
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
      this.#stageSprite,
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
    this.#isRunning = stage.isRunning;
    this.#title.setText(stage.title);
    this.#level.setText(stage.levelLabel);
    this.#capacity.setText(stage.capacityLabel);
    this.#queue.setText(stage.queueLabel);
    this.#status.setText(stage.statusLabel);
    setTextColor(this.#status, stage.isBackedUp ? TEXT_WARNING : TEXT_MUTED);

    // The backlog colour is a second texture rather than a tint: Phaser tints
    // under WebGL only, and the cue has to survive a Canvas fallback. It is
    // also what `describeRenderedState` reads the backlog back from.
    const blockTexture = stage.isBackedUp
      ? PLACEHOLDER_BACKLOG_TEXTURES.oreCrate
      : PLACEHOLDER_TEXTURES.oreCrate;

    this.#queueBlocks.forEach((block, index) => {
      block.setVisible(index < stage.queueSteps);

      // `setTexture` re-frames the sprite, so the size is restored with it.
      if (block.texture.key !== blockTexture) {
        block
          .setTexture(blockTexture)
          .setDisplaySize(QUEUE_BLOCK_SIZE, QUEUE_BLOCK_SIZE);
      }
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
    this.#stageSprite.setFrame(
      this.#isRunning ? calculateGeneratedAssetFrame(animationTimeMs) : 0,
    );
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
        return block.texture.key === PLACEHOLDER_BACKLOG_TEXTURES.oreCrate;
      }),
      statusLabel: this.#status.text,
      progressLabel: this.#progressLabel.text,
      progressFillWidth: this.#progressFill.width,
      progressTrackWidth: this.#progressTrack.width,
      cycleMarkerOffsetPx: this.#cycleMarker.x - PANEL_INSET_X,
      conveyorOffsetPx: firstDash.x - PANEL_INSET_X,
      showsConveyor: firstDash.visible,
      assetFrame: Number(this.#stageSprite.frame.name),
      upgradeControl: this.describeUpgradeControl(),
    };
  }
}
