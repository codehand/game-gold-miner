import Phaser from 'phaser';

import {
  toFillColor,
  CONTROL_BACKGROUND,
  CONTROL_DISABLED_BACKGROUND,
  CONTROL_REFUSED_BACKGROUND,
  CONTROL_SUCCESS_BACKGROUND,
  FONT_FAMILY,
  TEXT_ACCENT,
  TEXT_DISABLED,
  TEXT_PRIMARY,
  type LayoutRegion,
} from '../layout';
import type {
  UpgradeControlViewModel,
  UpgradeFeedbackViewModel,
} from '../view-model';

/** What the control actually put on screen, read back from its own objects. */
export interface RenderedUpgradeControlState {
  /** A locked floor's control is hidden, and a hidden control cannot be pressed. */
  readonly isVisible: boolean;
  readonly actionLabel: string;
  /** The next level's price, or `''` while a press result is showing. */
  readonly costLabel: string;
  /** True while the control is drawn in its affordable colours. */
  readonly isAffordableAppearance: boolean;
  /** The press result currently shown, or `null`. */
  readonly feedbackLabel: string | null;
  /**
   * The pressable rectangle in world coordinates. The scene converts this to
   * screen space, which is what a browser test needs to press it.
   */
  readonly worldBounds: LayoutRegion;
}

/**
 * `stacked` puts the price under the action for the roomier mine-floor button;
 * `inline` puts it at the opposite end of the short shared-stage bar.
 */
export type UpgradeControlLayout = 'stacked' | 'inline';

export interface UpgradeControlViewOptions {
  /** Where the control sits inside its parent view's container. */
  readonly region: LayoutRegion;
  readonly layout: UpgradeControlLayout;
  /** Called on release over the control, whether or not it is affordable. */
  readonly onPress: () => void;
}

const COLOR_ENABLED = toFillColor(CONTROL_BACKGROUND);
const COLOR_DISABLED = toFillColor(CONTROL_DISABLED_BACKGROUND);
const COLOR_SUCCESS = toFillColor(CONTROL_SUCCESS_BACKGROUND);
const COLOR_REFUSED = toFillColor(CONTROL_REFUSED_BACKGROUND);

const INLINE_INSET_X = 8;
const STACKED_ACTION_Y_RATIO = 0.32;
const STACKED_COST_Y_RATIO = 0.7;

/**
 * One upgrade button, shared by the mine floors and both shared stages.
 *
 * It shows the next level's price, is drawn enabled only when the player can
 * pay it, and reports a press to its owner. It never decides the purchase: the
 * press goes to a core command, and what comes back is a result this control
 * only displays. That is why a press is accepted even while the control is
 * drawn disabled — refusing in the view would replace the core's answer with
 * the renderer's guess, and would leave the player with no feedback at all.
 */
export class UpgradeControlView {
  readonly #background: Phaser.GameObjects.Rectangle;
  readonly #action: Phaser.GameObjects.Text;
  readonly #cost: Phaser.GameObjects.Text;
  readonly #feedback: Phaser.GameObjects.Text;
  readonly #objects: readonly Phaser.GameObjects.GameObject[];
  /** The last bound model, restored when a press result expires. */
  #control: UpgradeControlViewModel | null = null;
  #feedbackModel: UpgradeFeedbackViewModel | null = null;

  public constructor(scene: Phaser.Scene, options: UpgradeControlViewOptions) {
    const { region, layout } = options;

    this.#background = scene.add
      .rectangle(region.x, region.y, region.width, region.height, COLOR_ENABLED)
      .setOrigin(0, 0);
    // The rectangle carries the hit area, so the pressable region is exactly
    // the drawn one. Hiding it also removes it from input, because Phaser skips
    // invisible objects when hit-testing.
    this.#background
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, options.onPress);

    const centerX = region.x + region.width / 2;

    this.#action =
      layout === 'stacked'
        ? this.#createText(
            scene,
            centerX,
            region.y + region.height * STACKED_ACTION_Y_RATIO,
            12,
            0.5,
          )
        : this.#createText(
            scene,
            region.x + INLINE_INSET_X,
            region.y + region.height / 2,
            12,
            0,
          );
    this.#cost =
      layout === 'stacked'
        ? this.#createText(
            scene,
            centerX,
            region.y + region.height * STACKED_COST_Y_RATIO,
            11,
            0.5,
          )
        : this.#createText(
            scene,
            region.x + region.width - INLINE_INSET_X,
            region.y + region.height / 2,
            12,
            1,
          );
    this.#feedback = this.#createText(
      scene,
      centerX,
      region.y + region.height / 2,
      11,
      0.5,
    );

    this.#objects = [this.#background, this.#action, this.#cost, this.#feedback];
    this.#render();
  }

  /** The control's game objects, for the owning view to add to its container. */
  public get objects(): readonly Phaser.GameObjects.GameObject[] {
    return this.#objects;
  }

  /** Rebinds the price and affordability, or hides the control entirely. */
  public applySnapshot(control: UpgradeControlViewModel | null): void {
    this.#control = control;
    this.#render();
  }

  /** Shows a press result, or clears it once the scene says it has expired. */
  public applyFeedback(feedback: UpgradeFeedbackViewModel | null): void {
    this.#feedbackModel = feedback;
    this.#render();
  }

  public describeRenderedState(): RenderedUpgradeControlState {
    const bounds = this.#background.getBounds();

    return {
      isVisible: this.#background.visible,
      actionLabel: this.#action.visible ? this.#action.text : '',
      costLabel: this.#cost.visible ? this.#cost.text : '',
      isAffordableAppearance: this.#background.fillColor === COLOR_ENABLED,
      feedbackLabel: this.#feedback.visible ? this.#feedback.text : null,
      worldBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
    };
  }

  /**
   * Both inputs land here, so the control looks the same whichever arrived
   * last: a snapshot rebound under a live press result must not wipe it, and a
   * result that expires must fall back to the current price rather than to the
   * price that was showing when the press happened.
   *
   * The scene expires press results on the frame clock, so this runs on every
   * frame and must cost nothing when nothing changed. Every write below is
   * therefore one Phaser already skips when the value is unchanged, or one
   * `setTextColor` guards.
   */
  #render(): void {
    const control = this.#control;
    const feedback = this.#feedbackModel;
    const visible = control !== null;

    this.#background.setVisible(visible);
    this.#feedback.setVisible(visible && feedback !== null);
    this.#action.setVisible(visible && feedback === null);
    this.#cost.setVisible(visible && feedback === null);

    if (control === null) {
      return;
    }

    this.#background.setFillStyle(this.#backgroundColor(control, feedback));
    this.#action.setText(control.actionLabel);
    this.#cost.setText(control.costLabel);
    this.#feedback.setText(feedback?.label ?? '');
    setTextColor(
      this.#action,
      control.isAffordable ? TEXT_PRIMARY : TEXT_DISABLED,
    );
    setTextColor(
      this.#cost,
      control.isAffordable ? TEXT_ACCENT : TEXT_DISABLED,
    );
  }

  #backgroundColor(
    control: UpgradeControlViewModel,
    feedback: UpgradeFeedbackViewModel | null,
  ): number {
    if (feedback !== null) {
      return feedback.isPositive ? COLOR_SUCCESS : COLOR_REFUSED;
    }

    return control.isAffordable ? COLOR_ENABLED : COLOR_DISABLED;
  }

  #createText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    fontSize: number,
    originX: number,
  ): Phaser.GameObjects.Text {
    return scene.add
      .text(x, y, '', {
        color: TEXT_PRIMARY,
        fontFamily: FONT_FAMILY,
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
      })
      .setOrigin(originX, 0.5);
  }
}

/**
 * Writes a text colour only when it differs from the one already applied.
 *
 * `Text.setText` skips an unchanged value, but `Text.setColor` does not: it
 * re-rasterizes the text's own canvas and re-uploads its texture on every
 * call. On the every-frame render path that is a full repaint of each caption
 * sixty times a second to produce the pixels already on screen.
 */
function setTextColor(text: Phaser.GameObjects.Text, color: string): void {
  if (text.style.color !== color) {
    text.setColor(color);
  }
}
