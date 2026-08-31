import Phaser from 'phaser';

import {
  PLACEHOLDER_ANIMATION_TEXTURES,
  PLACEHOLDER_TEXTURES,
} from '../assets/placeholderAssets';
import {
  toFillColor,
  calculateMineFloorPanelLayout,
  BADGE_BACKGROUND,
  FONT_FAMILY,
  LOCKED_PANEL_BACKGROUND,
  PANEL_BACKGROUND,
  PROGRESS_FILL,
  PROGRESS_TRACK,
  TEXT_ACCENT,
  TEXT_DISABLED,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_WARNING,
  type LayoutRegion,
} from '../layout';
import {
  calculateMinerPatrolPose,
  calculateGeneratedAssetFrame,
  MAX_MATERIAL_PILE_STEPS,
  MINER_PATROL_PERIOD_MS,
  type MineFloorViewModel,
  type PurchaseFeedbackViewModel,
} from '../view-model';
import {
  PurchaseControlView,
  type RenderedPurchaseControlState,
} from './PurchaseControlView';
import { setTextColor } from './setTextColor';

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
  /** `Backed up` while a whole elevator trip of material is waiting. */
  readonly backlogLabel: string | null;
  /** True when one elevator load is waiting; the approved pile stays gold. */
  readonly isPileBackedUp: boolean;
  readonly showsFloorTitle: boolean;
  readonly showsFloorNumber: boolean;
  readonly showsProgressBar: boolean;
  readonly showsGoldCoin: boolean;
  readonly hasThinSoilLayer: boolean;
  readonly showsMiner: boolean;
  /**
   * Signed offset of the placeholder pick from its rest position. Cosmetic
   * only: it is derived from the animation clock and never from production.
   */
  readonly minerSwingOffsetPx: number;
  /** Current frame from the generated Step 32A digging sheet. */
  readonly minerAssetFrame: number;
  readonly minerFacesLeft: boolean;
  readonly minerPatrolX: number;
  /** Locked floors have no shaft to upgrade, so they show no control. */
  readonly showsUpgradeControl: boolean;
  /** The control's own read-back: price, enabled state, and press feedback. */
  readonly upgradeControl: RenderedPurchaseControlState;
  /** Open floors have nothing left to unlock, so they show no control. */
  readonly showsUnlockControl: boolean;
  /** The unlock control's read-back, in the same slot as the upgrade one. */
  readonly unlockControl: RenderedPurchaseControlState;
  /** `Needs Floor 1 Lv 5` while locked, otherwise `null`. */
  readonly unlockRequirementLabel: string | null;
  /**
   * True while the requirement is drawn as satisfied — the same polarity as
   * the view model's own `isUnlockRequirementMet`, so a test reads one sense
   * of the flag across both layers. A floor with no requirement reports true.
   */
  readonly isUnlockRequirementMet: boolean;
  readonly isLockedAppearance: boolean;
}

const COLOR_PANEL = toFillColor(PANEL_BACKGROUND);
const COLOR_LOCKED_PANEL = toFillColor(LOCKED_PANEL_BACKGROUND);
const COLOR_BADGE = toFillColor(BADGE_BACKGROUND);
const COLOR_PROGRESS_TRACK = toFillColor(PROGRESS_TRACK);
const COLOR_PROGRESS_FILL = toFillColor(PROGRESS_FILL);
const PROGRESS_TRACK_HEIGHT = 6;
const MINER_SIZE = 54;
const LOCK_ICON_SIZE = 44;
const PILE_MAX_SIZE = 52;
/** A single queued step still has to read as a pile, not as a speck. */
const PILE_MIN_SCALE = 0.55;
const PILE_SCALE_RANGE = 1 - PILE_MIN_SCALE;
const UNLOADER_SIZE = 58;

export interface MineFloorViewOptions {
  /** Called when the shaft-upgrade control is pressed. */
  readonly onUpgrade: () => void;
  /** Called when the unlock control on a locked floor is pressed. */
  readonly onUnlock: () => void;
  /** Floors below floor one crop the ceiling seam to half its art thickness. */
  readonly hasThinSoilLayer?: boolean;
}

/**
 * One reusable mine-floor view bound to a read-only snapshot.
 *
 * The view owns no authoritative state: `applySnapshot` is the only way its
 * displayed values change, and `describeRenderedState` reports what its own
 * game objects currently show so browser tests compare rendered output rather
 * than the scene's intentions.
 *
 * It renders the extraction stage of the production chain: the progress bar and
 * pile follow authoritative values, while `applyAnimation` moves the pick from
 * the cosmetic clock alone. Its one control slot holds two `PurchaseControlView`
 * buttons — the shaft upgrade and the floor unlock — of which exactly one is
 * ever visible, and both report presses back to the scene.
 */
export class MineFloorView {
  readonly #root: Phaser.GameObjects.Container;
  readonly #background: Phaser.GameObjects.Rectangle;
  readonly #backgroundArt: Phaser.GameObjects.Image;
  readonly #badgeLabel: Phaser.GameObjects.Text;
  readonly #title: Phaser.GameObjects.Text;
  readonly #level: Phaser.GameObjects.Text;
  readonly #status: Phaser.GameObjects.Text;
  readonly #statusBackground: Phaser.GameObjects.Rectangle;
  readonly #miner: Phaser.GameObjects.Sprite;
  readonly #unloader: Phaser.GameObjects.Sprite;
  readonly #goldContainer: Phaser.GameObjects.Image;
  readonly #goldCoin: Phaser.GameObjects.Image;
  readonly #lockIcon: Phaser.GameObjects.Image;
  readonly #goldPile: Phaser.GameObjects.Image;
  readonly #materialQueue: Phaser.GameObjects.Text;
  readonly #backlog: Phaser.GameObjects.Text;
  readonly #progressTrack: Phaser.GameObjects.Rectangle;
  readonly #progressFill: Phaser.GameObjects.Rectangle;
  readonly #progressLabel: Phaser.GameObjects.Text;
  readonly #upgradeControl: PurchaseControlView;
  readonly #unlockControl: PurchaseControlView;
  readonly #unlockRequirement: Phaser.GameObjects.Text;
  /** Derived from the slot, like `SharedStageView`, so the bar follows its panel. */
  readonly #trackWidth: number;
  readonly #minerStartX: number;
  readonly #minerEndX: number;
  readonly #minerRestY: number;
  #extractionProgress = 0;
  #isPileBackedUp = false;
  readonly #hasThinSoilLayer: boolean;

  public constructor(
    scene: Phaser.Scene,
    region: LayoutRegion,
    options: MineFloorViewOptions,
  ) {
    const panel = calculateMineFloorPanelLayout(region.width, region.height);
    this.#hasThinSoilLayer = options.hasThinSoilLayer === true;
    this.#trackWidth = panel.progressTrack.width;
    this.#minerStartX = panel.minerPatrol.x + 8;
    this.#minerEndX = panel.minerPatrol.x + panel.minerPatrol.width - 8;
    this.#minerRestY = panel.minerPatrol.y + panel.minerPatrol.height / 2;
    this.#root = scene.add.container(region.x, region.y);

    this.#background = scene.add
      .rectangle(0, 0, region.width, region.height, COLOR_PANEL)
      .setOrigin(0, 0);
    const backgroundTexture = scene.textures.get(PLACEHOLDER_TEXTURES.floorBackground);
    const thinSoilFrame = 'thin-soil';

    if (options.hasThinSoilLayer && !backgroundTexture.has(thinSoilFrame)) {
      backgroundTexture.add(thinSoilFrame, 0, 0, 30, 576, 234);
    }

    this.#backgroundArt = scene.add
      .image(
        0,
        0,
        PLACEHOLDER_TEXTURES.floorBackground,
        options.hasThinSoilLayer ? thinSoilFrame : undefined,
      )
      .setOrigin(0, 0)
      .setDisplaySize(region.width, region.height);

    const badge = scene.add
      .rectangle(panel.floorBadge.x, panel.floorBadge.y, panel.floorBadge.width, panel.floorBadge.height, COLOR_BADGE)
      .setOrigin(0, 0);
    this.#badgeLabel = scene.add
      .text(panel.floorBadge.x + panel.floorBadge.width / 2, panel.floorBadge.y + panel.floorBadge.height / 2, '', {
        color: TEXT_ACCENT,
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);

    this.#title = scene.add
      .text(panel.title.x, panel.title.y, '', {
        color: TEXT_PRIMARY,
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.#level = scene.add
      .text(panel.title.x, panel.title.y + 17, '', {
        color: TEXT_MUTED,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
      })
      .setOrigin(0, 0);

    // Both objects derive from one anchor so the label cannot drift off-centre
    // when the badge is resized or the slot width changes.
    this.#statusBackground = scene.add
      .rectangle(
        panel.status.x,
        panel.status.y,
        panel.status.width,
        panel.status.height,
        COLOR_BADGE,
      )
      .setOrigin(0, 0);
    this.#status = scene.add
      .text(
        panel.status.x + panel.status.width / 2,
        panel.status.y + panel.status.height / 2,
        'Locked',
        {
          color: TEXT_DISABLED,
          fontFamily: FONT_FAMILY,
          fontSize: '11px',
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5, 0.5);

    this.#miner = scene.add
      .sprite(
        this.#minerStartX,
        this.#minerRestY,
        PLACEHOLDER_ANIMATION_TEXTURES.minerWalk,
        0,
      )
      .setDisplaySize(MINER_SIZE, MINER_SIZE);
    this.#unloader = scene.add
      .sprite(
        panel.unloaderCat.x + panel.unloaderCat.width / 2,
        panel.unloaderCat.y + panel.unloaderCat.height / 2,
        PLACEHOLDER_ANIMATION_TEXTURES.unloaderIdle,
        0,
      )
      .setDisplaySize(UNLOADER_SIZE, UNLOADER_SIZE);
    this.#goldContainer = scene.add
      .image(
        panel.goldContainer.x + panel.goldContainer.width / 2,
        panel.goldContainer.y + panel.goldContainer.height / 2,
        PLACEHOLDER_TEXTURES.goldContainer,
      )
      .setDisplaySize(panel.goldContainer.width, panel.goldContainer.height);
    this.#lockIcon = scene.add
      .image(panel.unloaderCat.x + panel.unloaderCat.width / 2, this.#minerRestY, PLACEHOLDER_TEXTURES.locked)
      .setDisplaySize(LOCK_ICON_SIZE, LOCK_ICON_SIZE);
    this.#goldPile = scene.add
      .image(panel.goldPile.x + panel.goldPile.width / 2, panel.goldPile.y + panel.goldPile.height / 2, PLACEHOLDER_TEXTURES.goldPile)
      .setDisplaySize(pileDisplaySize(0), pileDisplaySize(0));
    const queueLineY = panel.goldContainer.y - 8;
    this.#materialQueue = scene.add
      .text(panel.goldContainer.x + 18, queueLineY, '', {
        color: TEXT_ACCENT,
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    this.#goldCoin = scene.add
      .image(
        panel.goldContainer.x + 7,
        queueLineY,
        PLACEHOLDER_TEXTURES.goldCoin,
      )
      .setDisplaySize(17, 17);
    this.#backlog = scene.add
      .text(panel.goldPile.x, panel.goldPile.y - 14, '', {
        color: TEXT_WARNING,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.#progressTrack = scene.add
      .rectangle(
        panel.progressTrack.x,
        panel.progressTrack.y,
        this.#trackWidth,
        PROGRESS_TRACK_HEIGHT,
        COLOR_PROGRESS_TRACK,
      )
      .setOrigin(0, 0);
    this.#progressFill = scene.add
      .rectangle(
        panel.progressTrack.x,
        panel.progressTrack.y,
        0,
        PROGRESS_TRACK_HEIGHT,
        COLOR_PROGRESS_FILL,
      )
      .setOrigin(0, 0);
    this.#progressLabel = scene.add
      .text(
        panel.progressLabel.x,
        panel.progressLabel.y,
        '',
        {
          color: TEXT_MUTED,
          fontFamily: FONT_FAMILY,
          fontSize: '11px',
        },
      )
      .setOrigin(0, 0);

    this.#unlockRequirement = scene.add
      .text(panel.title.x, 66, '', {
        color: TEXT_WARNING,
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    // Both controls occupy the same slot, because a floor is either open or
    // locked and so offers exactly one of them. The hidden one is not drawn and
    // Phaser skips invisible objects when hit-testing, so the two can never
    // both take a press.
    this.#upgradeControl = new PurchaseControlView(scene, {
      region: panel.levelControl,
      layout: 'floor-level',
      onPress: options.onUpgrade,
    });
    this.#unlockControl = new PurchaseControlView(scene, {
      region: panel.unlockControl,
      layout: 'stacked',
      onPress: options.onUnlock,
    });

    this.#root.add([
      this.#background,
      this.#backgroundArt,
      badge,
      this.#badgeLabel,
      this.#title,
      this.#level,
      this.#statusBackground,
      this.#status,
      this.#goldContainer,
      this.#unloader,
      this.#miner,
      this.#lockIcon,
      this.#goldPile,
      this.#goldCoin,
      this.#materialQueue,
      this.#backlog,
      this.#progressTrack,
      this.#progressFill,
      this.#progressLabel,
      this.#unlockRequirement,
      ...this.#upgradeControl.objects,
      ...this.#unlockControl.objects,
    ]);

    // The miner's authoritative travel replaces the old extraction bar, and
    // the shaft plaques plus Level badge replace the duplicated Floor heading.
    this.#title.setVisible(false);
    this.#level.setVisible(false);
    this.#progressTrack.setVisible(false);
    this.#progressFill.setVisible(false);
    this.#progressLabel.setVisible(false);
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
    setTextColor(this.#title, floor.isUnlocked ? TEXT_PRIMARY : TEXT_DISABLED);
    this.#level.setText(floor.levelLabel);
    setTextColor(this.#level, floor.isUnlocked ? TEXT_MUTED : TEXT_DISABLED);

    const locked = floor.statusLabel !== null;
    this.#status.setText(floor.statusLabel ?? '').setVisible(locked);
    this.#statusBackground.setVisible(locked);

    this.#miner.setVisible(floor.isUnlocked);
    this.#unloader.setVisible(floor.isUnlocked);
    this.#goldContainer.setVisible(floor.isUnlocked);
    this.#goldCoin.setVisible(floor.isUnlocked);
    this.#backgroundArt.setAlpha(floor.isUnlocked ? 1 : 0.25);
    this.#lockIcon.setVisible(locked);

    // The approved asset stays gold even when transport is backed up; the
    // nearby status label communicates the bottleneck without recolouring art.
    this.#isPileBackedUp = floor.isMaterialBackedUp;

    const pileSize = pileDisplaySize(floor.materialPileSteps);

    this.#goldPile
      .setVisible(floor.isUnlocked && floor.materialPileSteps > 0)
      .setDisplaySize(pileSize, pileSize);
    this.#materialQueue
      .setText(floor.materialQueueLabel)
      .setVisible(floor.isUnlocked);
    this.#backlog
      .setText(floor.backlogLabel ?? '')
      .setVisible(false);

    this.#progressFill.setSize(
      this.#trackWidth * floor.extractionProgress,
      PROGRESS_TRACK_HEIGHT,
    );
    this.#progressLabel.setText(floor.extractionProgressLabel);
    this.#extractionProgress = floor.extractionProgress;

    // Met but unaffordable reads differently from still-gated, so the player
    // knows whether to keep upgrading or keep earning.
    this.#unlockRequirement
      .setText(floor.unlockRequirementLabel ?? '')
      .setVisible(floor.unlockRequirementLabel !== null);
    setTextColor(
      this.#unlockRequirement,
      floor.isUnlockRequirementMet ? TEXT_MUTED : TEXT_WARNING,
    );

    this.#upgradeControl.applySnapshot(floor.upgradeControl);
    this.#upgradeControl.applyDisplayOverride(
      'Level',
      String(floor.mineShaftLevel),
    );
    this.#unlockControl.applySnapshot(floor.unlockControl);
  }

  /** Shows or clears the result of a press on this floor's upgrade control. */
  public applyUpgradeFeedback(feedback: PurchaseFeedbackViewModel | null): void {
    this.#upgradeControl.applyFeedback(feedback);
  }

  /**
   * Shows or clears the result of a press on this floor's unlock control.
   *
   * A successful unlock hides this control on the same frame, so what confirms
   * it is the floor's own change of appearance rather than a message; the
   * feedback that matters here is a refusal, which stays on the still-visible
   * button.
   */
  public applyUnlockFeedback(feedback: PurchaseFeedbackViewModel | null): void {
    this.#unlockControl.applyFeedback(feedback);
  }

  /**
   * Gives the generated miner a restrained cosmetic bob. Extraction still
   * completes exactly when the core says so.
   */
  public applyAnimation(animationTimeMs: number): void {
    const pose = calculateMinerPatrolPose(
      this.#extractionProgress * MINER_PATROL_PERIOD_MS,
      this.#minerStartX,
      this.#minerEndX,
    );

    this.#miner
      .setFrame(calculateGeneratedAssetFrame(animationTimeMs))
      .setX(pose.x)
      .setFlipX(pose.facesLeft);
    this.#unloader.setFrame(calculateGeneratedAssetFrame(animationTimeMs, 4, 220));
  }

  /** The upgrade control's read-back alone, for the scene's control diagnostic. */
  public describeUpgradeControl(): RenderedPurchaseControlState {
    return this.#upgradeControl.describeRenderedState();
  }

  /** The unlock control's read-back alone, for the scene's control diagnostic. */
  public describeUnlockControl(): RenderedPurchaseControlState {
    return this.#unlockControl.describeRenderedState();
  }

  public describeRenderedState(): RenderedFloorState {
    const upgradeControl = this.describeUpgradeControl();
    const unlockControl = this.describeUnlockControl();

    return {
      floorLabel: this.#title.text,
      badgeLabel: this.#badgeLabel.text,
      levelLabel: this.#level.text,
      statusLabel: this.#status.visible ? this.#status.text : null,
      progressLabel: this.#progressLabel.text,
      progressFillWidth: this.#progressFill.width,
      progressTrackWidth: this.#progressTrack.width,
      materialQueueLabel: this.#materialQueue.text,
      materialPileSteps: this.#goldPile.visible
        ? pileStepsFromDisplaySize(this.#goldPile.displayWidth)
        : 0,
      backlogLabel: this.#backlog.visible ? this.#backlog.text : null,
      isPileBackedUp:
        this.#isPileBackedUp,
      showsFloorTitle: this.#title.visible,
      showsFloorNumber: this.#badgeLabel.visible,
      showsProgressBar: this.#progressTrack.visible,
      showsGoldCoin: this.#goldCoin.visible,
      hasThinSoilLayer: this.#hasThinSoilLayer,
      showsMiner: this.#miner.visible,
      minerSwingOffsetPx: this.#miner.y - this.#minerRestY,
      minerAssetFrame: Number(this.#miner.frame.name),
      minerFacesLeft: this.#miner.flipX,
      minerPatrolX: this.#miner.x,
      showsUpgradeControl: upgradeControl.isVisible,
      upgradeControl,
      showsUnlockControl: unlockControl.isVisible,
      unlockControl,
      unlockRequirementLabel: this.#unlockRequirement.visible
        ? this.#unlockRequirement.text
        : null,
      isUnlockRequirementMet: this.#unlockRequirement.style.color === TEXT_MUTED,
      isLockedAppearance:
        this.#background.fillColor === COLOR_LOCKED_PANEL,
    };
  }
}

/** How wide the pile sprite is drawn for a queue of `steps` steps. */
function pileDisplaySize(steps: number): number {
  return (
    PILE_MAX_SIZE *
    (PILE_MIN_SCALE + (steps / MAX_MATERIAL_PILE_STEPS) * PILE_SCALE_RANGE)
  );
}

/**
 * Inverse of `pileDisplaySize`, so the read-back measures the sprite that was
 * actually drawn rather than echoing the snapshot back at the test.
 */
function pileStepsFromDisplaySize(displayWidth: number): number {
  return Math.round(
    ((displayWidth / PILE_MAX_SIZE - PILE_MIN_SCALE) / PILE_SCALE_RANGE) *
      MAX_MATERIAL_PILE_STEPS,
  );
}
