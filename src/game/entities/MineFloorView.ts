import Phaser from 'phaser';

import {
  toFillColor,
  BADGE_BACKGROUND,
  CONTROL_BACKGROUND,
  FONT_FAMILY,
  LOCKED_PANEL_BACKGROUND,
  MATERIAL_FILL,
  MINER_FILL,
  PANEL_BACKGROUND,
  PROGRESS_FILL,
  PROGRESS_TRACK,
  TEXT_ACCENT,
  TEXT_DISABLED,
  TEXT_MUTED,
  TEXT_PRIMARY,
  type LayoutRegion,
} from '../layout';
import {
  MAX_MATERIAL_PILE_STEPS,
  type MineFloorViewModel,
} from '../view-model';

/** What the view actually put on screen, read back from its own objects. */
export interface RenderedFloorState {
  readonly floorLabel: string;
  readonly badgeLabel: string;
  readonly levelLabel: string;
  readonly statusLabel: string | null;
  readonly progressLabel: string;
  readonly progressFillWidth: number;
  readonly progressTrackWidth: number;
  readonly materialQueueLabel: string;
  readonly materialPileSteps: number;
  readonly showsUpgradeControl: boolean;
  readonly isLockedAppearance: boolean;
}

const COLOR_PANEL = toFillColor(PANEL_BACKGROUND);
const COLOR_LOCKED_PANEL = toFillColor(LOCKED_PANEL_BACKGROUND);
const COLOR_BADGE = toFillColor(BADGE_BACKGROUND);
const COLOR_CONTROL = toFillColor(CONTROL_BACKGROUND);
const COLOR_PROGRESS_TRACK = toFillColor(PROGRESS_TRACK);
const COLOR_PROGRESS_FILL = toFillColor(PROGRESS_FILL);
const COLOR_MATERIAL = toFillColor(MATERIAL_FILL);
const COLOR_MINER = toFillColor(MINER_FILL);

const BADGE_SIZE = 32;
const BADGE_INSET = 12;
const STATUS_BADGE_WIDTH = 66;
const STATUS_BADGE_HEIGHT = 20;
const STATUS_BADGE_INSET_X = 12;
const STATUS_BADGE_Y = 12;
const PROGRESS_TRACK_HEIGHT = 8;
const PROGRESS_INSET_X = 12;
const PROGRESS_LABEL_GAP = 8;
/** Room reserved to the right of the track for the percentage label. */
const PROGRESS_LABEL_WIDTH = 120;
const PILE_BLOCK_WIDTH = 26;
const PILE_BLOCK_HEIGHT = 7;
const PILE_BLOCK_GAP = 2;
const PILE_BASELINE_Y = 92;
const UPGRADE_WIDTH = 92;
const UPGRADE_HEIGHT = 32;
const UPGRADE_INSET_X = 12;
const UPGRADE_Y = 56;

/**
 * One reusable mine-floor view bound to a read-only snapshot.
 *
 * The view owns no authoritative state: `applySnapshot` is the only way its
 * displayed values change, and `describeRenderedState` reports what its own
 * game objects currently show so browser tests compare rendered output rather
 * than the scene's intentions.
 */
export class MineFloorView {
  readonly #root: Phaser.GameObjects.Container;
  readonly #background: Phaser.GameObjects.Rectangle;
  readonly #badgeLabel: Phaser.GameObjects.Text;
  readonly #title: Phaser.GameObjects.Text;
  readonly #level: Phaser.GameObjects.Text;
  readonly #status: Phaser.GameObjects.Text;
  readonly #statusBackground: Phaser.GameObjects.Rectangle;
  readonly #miner: readonly Phaser.GameObjects.Shape[];
  readonly #pileBlocks: readonly Phaser.GameObjects.Rectangle[];
  readonly #materialQueue: Phaser.GameObjects.Text;
  readonly #progressTrack: Phaser.GameObjects.Rectangle;
  readonly #progressFill: Phaser.GameObjects.Rectangle;
  readonly #progressLabel: Phaser.GameObjects.Text;
  readonly #upgradeBackground: Phaser.GameObjects.Rectangle;
  readonly #upgradeLabel: Phaser.GameObjects.Text;
  /** Derived from the slot, like `SharedStageView`, so the bar follows its panel. */
  readonly #trackWidth: number;

  public constructor(scene: Phaser.Scene, region: LayoutRegion) {
    this.#trackWidth =
      region.width - PROGRESS_INSET_X - PROGRESS_LABEL_GAP - PROGRESS_LABEL_WIDTH;
    this.#root = scene.add.container(region.x, region.y);

    this.#background = scene.add
      .rectangle(0, 0, region.width, region.height, COLOR_PANEL)
      .setOrigin(0, 0);

    const badge = scene.add
      .rectangle(BADGE_INSET, BADGE_INSET, BADGE_SIZE, BADGE_SIZE, COLOR_BADGE)
      .setOrigin(0, 0);
    this.#badgeLabel = scene.add
      .text(BADGE_INSET + BADGE_SIZE / 2, BADGE_INSET + BADGE_SIZE / 2, '', {
        color: TEXT_ACCENT,
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);

    this.#title = scene.add
      .text(54, 12, '', {
        color: TEXT_PRIMARY,
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.#level = scene.add
      .text(54, 32, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
      })
      .setOrigin(0, 0);

    // Both objects derive from one anchor so the label cannot drift off-centre
    // when the badge is resized or the slot width changes.
    const statusBadgeX = region.width - STATUS_BADGE_INSET_X - STATUS_BADGE_WIDTH;

    this.#statusBackground = scene.add
      .rectangle(
        statusBadgeX,
        STATUS_BADGE_Y,
        STATUS_BADGE_WIDTH,
        STATUS_BADGE_HEIGHT,
        COLOR_BADGE,
      )
      .setOrigin(0, 0);
    this.#status = scene.add
      .text(
        statusBadgeX + STATUS_BADGE_WIDTH / 2,
        STATUS_BADGE_Y + STATUS_BADGE_HEIGHT / 2,
        'Locked',
        {
          color: TEXT_DISABLED,
          fontFamily: FONT_FAMILY,
          fontSize: '11px',
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5, 0.5);

    // Placeholder miner: an original two-shape silhouette, replaced by real
    // artwork in Step 32.
    this.#miner = [
      scene.add.rectangle(16, 66, 22, 26, COLOR_MINER).setOrigin(0, 0),
      scene.add.ellipse(27, 60, 20, 18, COLOR_MINER),
    ];

    this.#pileBlocks = Array.from({ length: MAX_MATERIAL_PILE_STEPS }, (_, step) => {
      return scene.add
        .rectangle(
          54,
          PILE_BASELINE_Y - (step + 1) * (PILE_BLOCK_HEIGHT + PILE_BLOCK_GAP),
          PILE_BLOCK_WIDTH,
          PILE_BLOCK_HEIGHT,
          COLOR_MATERIAL,
        )
        .setOrigin(0, 0);
    });
    this.#materialQueue = scene.add
      .text(88, PILE_BASELINE_Y - 14, '', {
        color: TEXT_ACCENT,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.#progressTrack = scene.add
      .rectangle(
        PROGRESS_INSET_X,
        region.height - 16,
        this.#trackWidth,
        PROGRESS_TRACK_HEIGHT,
        COLOR_PROGRESS_TRACK,
      )
      .setOrigin(0, 0);
    this.#progressFill = scene.add
      .rectangle(
        PROGRESS_INSET_X,
        region.height - 16,
        0,
        PROGRESS_TRACK_HEIGHT,
        COLOR_PROGRESS_FILL,
      )
      .setOrigin(0, 0);
    this.#progressLabel = scene.add
      .text(
        PROGRESS_INSET_X + this.#trackWidth + PROGRESS_LABEL_GAP,
        region.height - 20,
        '',
        {
          color: TEXT_MUTED,
          fontFamily: FONT_FAMILY,
          fontSize: '11px',
        },
      )
      .setOrigin(0, 0);

    const upgradeX = region.width - UPGRADE_INSET_X - UPGRADE_WIDTH;

    this.#upgradeBackground = scene.add
      .rectangle(
        upgradeX,
        UPGRADE_Y,
        UPGRADE_WIDTH,
        UPGRADE_HEIGHT,
        COLOR_CONTROL,
      )
      .setOrigin(0, 0);
    this.#upgradeLabel = scene.add
      .text(
        upgradeX + UPGRADE_WIDTH / 2,
        UPGRADE_Y + UPGRADE_HEIGHT / 2,
        '',
        {
          color: TEXT_PRIMARY,
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5, 0.5);

    this.#root.add([
      this.#background,
      badge,
      this.#badgeLabel,
      this.#title,
      this.#level,
      this.#statusBackground,
      this.#status,
      ...this.#miner,
      ...this.#pileBlocks,
      this.#materialQueue,
      this.#progressTrack,
      this.#progressFill,
      this.#progressLabel,
      this.#upgradeBackground,
      this.#upgradeLabel,
    ]);
  }

  public get root(): Phaser.GameObjects.Container {
    return this.#root;
  }

  /** Rebinds every displayed value to a newer read-only snapshot. */
  public applySnapshot(floor: MineFloorViewModel): void {
    this.#background.setFillStyle(
      floor.isUnlocked ? COLOR_PANEL : COLOR_LOCKED_PANEL,
    );
    this.#badgeLabel.setText(String(floor.floorNumber));
    this.#title.setText(floor.floorLabel);
    this.#title.setColor(floor.isUnlocked ? TEXT_PRIMARY : TEXT_DISABLED);
    this.#level.setText(floor.levelLabel);
    this.#level.setColor(floor.isUnlocked ? TEXT_MUTED : TEXT_DISABLED);

    const locked = floor.statusLabel !== null;
    this.#status.setText(floor.statusLabel ?? '').setVisible(locked);
    this.#statusBackground.setVisible(locked);

    for (const part of this.#miner) {
      part.setVisible(floor.isUnlocked);
    }

    this.#pileBlocks.forEach((block, index) => {
      block.setVisible(index < floor.materialPileSteps);
    });
    this.#materialQueue
      .setText(floor.materialQueueLabel)
      .setVisible(floor.isUnlocked);

    this.#progressFill.setSize(
      this.#trackWidth * floor.extractionProgress,
      PROGRESS_TRACK_HEIGHT,
    );
    this.#progressLabel.setText(floor.extractionProgressLabel);

    this.#upgradeBackground.setVisible(floor.showsUpgradeControl);
    this.#upgradeLabel
      .setText(floor.upgradeControlLabel)
      .setVisible(floor.showsUpgradeControl);
  }

  public describeRenderedState(): RenderedFloorState {
    return {
      floorLabel: this.#title.text,
      badgeLabel: this.#badgeLabel.text,
      levelLabel: this.#level.text,
      statusLabel: this.#status.visible ? this.#status.text : null,
      progressLabel: this.#progressLabel.text,
      progressFillWidth: this.#progressFill.width,
      progressTrackWidth: this.#progressTrack.width,
      materialQueueLabel: this.#materialQueue.text,
      materialPileSteps: this.#pileBlocks.filter((block) => block.visible).length,
      showsUpgradeControl: this.#upgradeBackground.visible,
      isLockedAppearance:
        this.#background.fillColor === COLOR_LOCKED_PANEL,
    };
  }
}
