import type { OfflineIncomeConfig } from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import type { GameState } from '../state/GameState';
import { calculateOfflineGrant } from './calculateOfflineGrant';

export interface OfflineIncomeCalculation {
  readonly state: GameState;
  readonly elapsedDurationMs: number;
  readonly creditedDurationMs: number;
  readonly reward: GameNumber;
}

/**
 * The **client's local projection**. Its two timestamps are both the player's
 * device clock — the document's `savedAtTimestampMs` and `Date.now()` — which
 * is exactly why a manipulated clock can move it. Server-milestone Step 22 makes
 * the credited amount the server's `offlineGrant` (from `received_at` to the
 * server's now); this calculation survives as the projection and as the
 * offline/unconfigured fallback, sharing one formula with the server through
 * `calculateOfflineGrant`.
 */
export function calculateOfflineIncome(
  state: GameState,
  savedAtTimestampMs: number,
  currentTimestampMs: number,
  savedProductionRatePerSecond: GameNumber,
  config: OfflineIncomeConfig,
): OfflineIncomeCalculation {
  const grant = calculateOfflineGrant(
    savedAtTimestampMs,
    currentTimestampMs,
    savedProductionRatePerSecond,
    config,
  );

  return {
    state: {
      ...state,
      lastUpdateTimestampMs: currentTimestampMs,
    },
    elapsedDurationMs: grant.elapsedDurationMs,
    creditedDurationMs: grant.creditedDurationMs,
    reward: grant.reward,
  };
}
