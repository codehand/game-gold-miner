import { GameNumber } from '../numbers/GameNumber';
import type { GameState } from '../state/GameState';

/**
 * Server-milestone Step 27: leaderboard storage.
 *
 * Step 3 built `public.leaderboard_entries` metric-agnostic on purpose — see
 * `memory-bank/architecture.md`'s "What Step 3 does not design" — so Step 27's
 * job is a decision, not a schema change: which state produces the metric, and
 * how it becomes the magnitude-plus-exact pair `metric_exact`/`metric_log10`
 * that column pair requires (`architecture.md`'s "How a `GameNumber` is
 * stored").
 *
 * **The metric: lifetime gold earned.** `totalGoldDelivered` (every completed
 * warehouse conversion) plus `totalOfflineGoldClaimed` (every offline-income
 * claim) — both monotonic, so the sum can only rise across a save's lifetime.
 * Current `gold` is deliberately not the metric: it falls every time a player
 * spends on an upgrade, which would rank a patient spender below someone who
 * never invests.
 *
 * **The board: one, all-time.** {@link LIFETIME_GOLD_BOARD_KEY} is the only
 * `board_key` this milestone populates; there is no reset period. A season is
 * a future `board_key` value under `leaderboard_entries_board_key_format`,
 * never a schema change, exactly as Step 3 recorded.
 *
 * **The tie-break: earliest to reach the score.** Two equal scores rank by
 * ascending `updated_at` — the player who got there first outranks one who
 * only matched it later. `leaderboard_entries_rank_idx`'s trailing column
 * already encodes this; Step 27 confirms it rather than changing it.
 *
 * This module only *represents* the metric — nothing here writes a row.
 * Publishing an entry from a save that passed Step 23's bound is Step 28's
 * job; this step is storage and design only.
 */
export const LIFETIME_GOLD_BOARD_KEY = 'lifetime-gold';

/** The Step 27 metric: lifetime gold earned, never current spendable `gold`. */
export function calculateLifetimeGoldEarned(state: GameState): GameNumber {
  return state.warehouse.totalGoldDelivered.add(
    state.warehouse.totalOfflineGoldClaimed,
  );
}

/** The `leaderboard_entries.metric_exact` / `metric_log10` pair for one value. */
export interface LeaderboardMagnitude {
  /** Canonical `GameNumber.serialize()` — what the player is shown, unchanged. */
  readonly exact: string;
  /**
   * `log10` of the same value, derived from its mantissa and exponent rather
   * than from the value itself: a value past `1e308` cannot survive a round
   * trip through a plain `double`, but its mantissa (always in `[1, 10)`) and
   * exponent can, and `log10(mantissa) + exponent` is exact for any magnitude
   * `GameNumber` can hold.
   */
  readonly log10: number;
}

/**
 * Converts a `GameNumber` into the pair `leaderboard_entries.metric_exact` /
 * `metric_log10` stores. Throws on a non-positive value: a zero or negative
 * metric has no rank on a leaderboard, and `log10` of zero is not finite,
 * which the table's own `leaderboard_entries_metric_log10_finite` constraint
 * refuses.
 */
export function toLeaderboardMagnitude(value: GameNumber): LeaderboardMagnitude {
  if (!value.greaterThan(0)) {
    throw new Error(
      'toLeaderboardMagnitude requires a positive value — a zero or negative metric has no rank on a leaderboard.',
    );
  }

  return {
    exact: value.serialize(),
    log10: Math.log10(value.mantissa) + value.exponent,
  };
}
