/**
 * Pure model for the three upgrade controls and the feedback a press produces.
 *
 * A control knows what it costs, whether the player can pay for it right now,
 * and which core command it sends. All three are derived here so they are
 * unit-testable in Node: the Phaser entity only paints the strings and colours
 * this module decided on, and only the core actually charges gold.
 */

import type { GameNumber } from '../../core';
import { formatAmount } from './formatAmount';

/** Which stage a control upgrades, and therefore which command it sends. */
export type UpgradeTarget =
  | { readonly type: 'mine-shaft'; readonly floorId: string }
  | { readonly type: 'elevator' }
  | { readonly type: 'warehouse' };

/** How a press ended. The core decides this, never the control's own state. */
export type UpgradeOutcome =
  | 'purchased'
  | 'insufficient-funds'
  | 'unavailable';

/** How long a press result stays on the control before it clears itself. */
export const UPGRADE_FEEDBACK_DURATION_MS = 1_200;

const FEEDBACK_LABELS: Readonly<Record<UpgradeOutcome, string>> = {
  purchased: 'Upgraded!',
  'insufficient-funds': 'Need more gold',
  unavailable: 'Unavailable',
};

export interface UpgradeControlViewModel {
  readonly target: UpgradeTarget;
  /** Stable identity of this control, for feedback and diagnostics. */
  readonly key: string;
  /** English action caption, e.g. `Upgrade`. */
  readonly actionLabel: string;
  /** Abbreviated price of the next level, e.g. `28.7`. */
  readonly costLabel: string;
  /**
   * True when the current balance covers the next level. The control is drawn
   * enabled or disabled from this, but it is never the authority on the
   * purchase: the core re-checks funds and is what actually deducts them.
   */
  readonly isAffordable: boolean;
}

/** A press result held against one control until it expires. */
export interface UpgradeFeedback {
  readonly outcome: UpgradeOutcome;
  /** Presentation clock reading when the press happened. */
  readonly startedAtMs: number;
}

export interface UpgradeFeedbackViewModel {
  readonly label: string;
  /** True for a completed purchase, false for a refusal. */
  readonly isPositive: boolean;
}

export function upgradeTargetKey(target: UpgradeTarget): string {
  return target.type === 'mine-shaft'
    ? `mine-shaft:${target.floorId}`
    : target.type;
}

export function createUpgradeControlViewModel(
  target: UpgradeTarget,
  cost: GameNumber,
  gold: GameNumber,
): UpgradeControlViewModel {
  return {
    target,
    key: upgradeTargetKey(target),
    actionLabel: 'Upgrade',
    costLabel: formatAmount(cost),
    // Exactly enough gold buys the level, matching the core's own check.
    isAffordable: gold.greaterThanOrEqualTo(cost),
  };
}

export function createUpgradeFeedback(
  outcome: UpgradeOutcome,
  startedAtMs: number,
): UpgradeFeedback {
  if (!Number.isFinite(startedAtMs)) {
    throw new Error('Upgrade feedback needs a finite presentation timestamp.');
  }

  return { outcome, startedAtMs };
}

/**
 * What the control should currently show, or `null` once the result has been
 * on screen long enough. A reading before the press — a clock the host reset
 * behind the scene — expires it too, because the safe direction is to fall
 * back to the live price rather than to pin a stale result on screen.
 */
export function describeUpgradeFeedback(
  feedback: UpgradeFeedback | null,
  nowMs: number,
): UpgradeFeedbackViewModel | null {
  if (feedback === null) {
    return null;
  }

  const elapsedMs = nowMs - feedback.startedAtMs;

  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs >= UPGRADE_FEEDBACK_DURATION_MS
  ) {
    return null;
  }

  return {
    label: FEEDBACK_LABELS[feedback.outcome],
    isPositive: feedback.outcome === 'purchased',
  };
}
