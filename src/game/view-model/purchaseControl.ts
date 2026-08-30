/**
 * Pure model for every priced control and the feedback a press produces.
 *
 * A control knows what it costs, whether pressing it right now is expected to
 * succeed, and which core command it sends. All three are derived here so they
 * are unit-testable in Node: the Phaser entity only paints the strings and
 * colours this module decided on, and only the core actually charges gold.
 *
 * Two kinds of purchase share this model — upgrading a stage and unlocking a
 * floor — because they are the same control to the player: a labelled button
 * with a price that either can or cannot be pressed to effect right now.
 */

import type { FloorUnlockAvailability, GameNumber } from '../../core';
import { formatAmount } from './formatAmount';

/** What a control buys, and therefore which command it sends. */
export type PurchaseTarget =
  | { readonly type: 'mine-shaft'; readonly floorId: string }
  | { readonly type: 'elevator' }
  | { readonly type: 'warehouse' }
  | { readonly type: 'floor-unlock'; readonly floorId: string };

/** How a press ended. The core decides this, never the control's own state. */
export type PurchaseOutcome =
  | 'purchased'
  | 'unlocked'
  | 'insufficient-funds'
  | 'requirement-not-met'
  | 'unavailable';

/** How long a press result stays on the control before it clears itself. */
export const PURCHASE_FEEDBACK_DURATION_MS = 1_200;

const FEEDBACK_LABELS: Readonly<Record<PurchaseOutcome, string>> = {
  purchased: 'Upgraded!',
  unlocked: 'Unlocked!',
  'insufficient-funds': 'Need more gold',
  'requirement-not-met': 'Level too low',
  unavailable: 'Unavailable',
};

const POSITIVE_OUTCOMES: readonly PurchaseOutcome[] = ['purchased', 'unlocked'];

export interface PurchaseControlViewModel {
  readonly target: PurchaseTarget;
  /** Stable identity of this control, for feedback and diagnostics. */
  readonly key: string;
  /** English action caption, e.g. `Upgrade` or `Unlock`. */
  readonly actionLabel: string;
  /** Abbreviated price of what the press buys, e.g. `28.7`. */
  readonly costLabel: string;
  /**
   * True when everything this purchase needs is satisfied right now: the
   * balance covers the price, and for a floor unlock its prerequisite shaft is
   * high enough. The control is drawn enabled or disabled from this, but it is
   * never the authority on the purchase: the core re-checks and is what
   * actually deducts gold.
   */
  readonly isEnabled: boolean;
}

/** A press result held against one control until it expires. */
export interface PurchaseFeedback {
  readonly outcome: PurchaseOutcome;
  /** Presentation clock reading when the press happened. */
  readonly startedAtMs: number;
}

export interface PurchaseFeedbackViewModel {
  readonly label: string;
  /** True for a completed purchase, false for a refusal. */
  readonly isPositive: boolean;
}

export function purchaseTargetKey(target: PurchaseTarget): string {
  switch (target.type) {
    case 'mine-shaft':
      return `mine-shaft:${target.floorId}`;
    case 'floor-unlock':
      return `floor-unlock:${target.floorId}`;
    default:
      return target.type;
  }
}

/**
 * The upgrade control for one mine shaft or shared stage, whose only gate is
 * the price. A floor unlock has a second gate and is built by
 * `createFloorUnlockControlViewModel` instead.
 */
export function createUpgradeControlViewModel(
  target: PurchaseTarget,
  cost: GameNumber,
  gold: GameNumber,
): PurchaseControlViewModel {
  return {
    target,
    key: purchaseTargetKey(target),
    actionLabel: 'Upgrade',
    costLabel: formatAmount(cost),
    // Exactly enough gold buys the level, matching the core's own check.
    isEnabled: gold.greaterThanOrEqualTo(cost),
  };
}

/**
 * The unlock control for one locked floor.
 *
 * Its price and its enabled state both come from the core's own unlock
 * description, so the button cannot invite a press the command would refuse —
 * and a floor whose gold is there but whose prerequisite is not stays disabled
 * rather than looking ready.
 */
export function createFloorUnlockControlViewModel(
  availability: FloorUnlockAvailability,
): PurchaseControlViewModel {
  const target: PurchaseTarget = {
    type: 'floor-unlock',
    floorId: availability.floorId,
  };

  return {
    target,
    key: purchaseTargetKey(target),
    actionLabel: 'Unlock',
    costLabel: formatAmount(availability.cost),
    isEnabled: availability.canUnlock,
  };
}

/** `Needs Floor 1 Lv 5`: the gate a locked floor is waiting on. */
export function formatUnlockRequirement(
  availability: FloorUnlockAvailability,
): string {
  const { requirement } = availability;

  return `Needs Floor ${requirement.floorNumber} Lv ${requirement.level}`;
}

export function createPurchaseFeedback(
  outcome: PurchaseOutcome,
  startedAtMs: number,
): PurchaseFeedback {
  if (!Number.isFinite(startedAtMs)) {
    throw new Error('Purchase feedback needs a finite presentation timestamp.');
  }

  return { outcome, startedAtMs };
}

/**
 * What the control should currently show, or `null` once the result has been
 * on screen long enough. A reading before the press — a clock the host reset
 * behind the scene — expires it too, because the safe direction is to fall
 * back to the live price rather than to pin a stale result on screen.
 */
export function describePurchaseFeedback(
  feedback: PurchaseFeedback | null,
  nowMs: number,
): PurchaseFeedbackViewModel | null {
  if (feedback === null) {
    return null;
  }

  const elapsedMs = nowMs - feedback.startedAtMs;

  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs >= PURCHASE_FEEDBACK_DURATION_MS
  ) {
    return null;
  }

  return {
    label: FEEDBACK_LABELS[feedback.outcome],
    isPositive: POSITIVE_OUTCOMES.includes(feedback.outcome),
  };
}
