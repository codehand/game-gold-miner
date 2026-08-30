import Phaser from 'phaser';

import {
  assertTouchTargetRegion,
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
  PurchaseControlViewModel,
  PurchaseFeedbackViewModel,
} from '../view-model';
import { setTextColor } from './setTextColor';

/** What the control actually put on screen, read back from its own objects. */
export interface RenderedPurchaseControlState {
  /** A control with nothing left to buy is hidden, and cannot be pressed. */
  readonly isVisible: boolean;
  readonly actionLabel: string;
  /** The next level's price, or `''` while a press result is showing. */
  readonly costLabel: string;
  /** True while the control is drawn in its enabled colours. */
  readonly isEnabledAppearance: boolean;
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
export type PurchaseControlLayout = 'stacked' | 'inline';

export interface PurchaseControlViewOptions {
  /** Where the control sits inside its parent view's container. */
  readonly region: LayoutRegion;
  readonly layout: PurchaseControlLayout;
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
 * One priced button, shared by every purchase on the screen: each mine shaft's
 * upgrade, each locked floor's unlock, and both shared stages.
 *
 * It shows what the press costs, is drawn enabled only when the purchase can
 * actually be completed right now, and reports a press to its owner. It never decides the purchase: the
 * press goes to a core command, and what comes back is a result this control
 * only displays. That is why a press is accepted even while the control is
 * drawn disabled — refusing in the view would replace the core's answer with
 * the renderer's guess, and would leave the player with no feedback at all.
 */
export class PurchaseControlView {
  readonly #background: Phaser.GameObjects.Rectangle;
  readonly #action: Phaser.GameObjects.Text;
  readonly #cost: Phaser.GameObjects.Text;
  readonly #feedback: Phaser.GameObjects.Text;
  readonly #objects: readonly Phaser.GameObjects.GameObject[];
  /** The last bound model, restored when a press result expires. */
  #control: PurchaseControlViewModel | null = null;
  #feedbackModel: PurchaseFeedbackViewModel | null = null;

  public constructor(scene: Phaser.Scene, options: PurchaseControlViewOptions) {
    const { region, layout } = options;

    // The drawn rectangle is also the hit area, so the size that has to be
    // thumb-sized is this one. Checked here rather than in each owning view:
    // every button on the screen is one of these.
    assertTouchTargetRegion(region, 'A purchase control');

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
  public applySnapshot(control: PurchaseControlViewModel | null): void {
    this.#control = control;
    this.#render();
  }

  /** Shows a press result, or clears it once the scene says it has expired. */
  public applyFeedback(feedback: PurchaseFeedbackViewModel | null): void {
    this.#feedbackModel = feedback;
    this.#render();
  }

  public describeRenderedState(): RenderedPurchaseControlState {
    const bounds = this.#background.getBounds();

    return {
      isVisible: this.#background.visible,
      actionLabel: this.#action.visible ? this.#action.text : '',
      costLabel: this.#cost.visible ? this.#cost.text : '',
      isEnabledAppearance: this.#background.fillColor === COLOR_ENABLED,
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
      control.isEnabled ? TEXT_PRIMARY : TEXT_DISABLED,
    );
    setTextColor(
      this.#cost,
      control.isEnabled ? TEXT_ACCENT : TEXT_DISABLED,
    );
  }

  #backgroundColor(
    control: PurchaseControlViewModel,
    feedback: PurchaseFeedbackViewModel | null,
  ): number {
    if (feedback !== null) {
      return feedback.isPositive ? COLOR_SUCCESS : COLOR_REFUSED;
    }

    return control.isEnabled ? COLOR_ENABLED : COLOR_DISABLED;
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
