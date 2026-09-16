import type { OfflineIncomeConfig } from '../../config';
import { GameNumber } from '../numbers/GameNumber';

/**
 * Server-milestone Step 22: the offline reward as a value, with no state and no
 * clock of its own. `calculateOfflineIncome` (the client's local projection)
 * and `save-sync`'s download handler (the server's authoritative grant) both
 * call this one function, so the formula, the cap, and the efficiency cannot
 * drift between them — finding F4's requirement that Step 22 change which clock
 * is authoritative and nothing else.
 *
 * The two timestamps are deliberately opaque to the formula: it only subtracts
 * them. The caller decides which clock they come from. The client's local
 * projection passes the document's own `savedAtTimestampMs` and `Date.now()`;
 * the server passes the stored `received_at` and its own `now()`, which is what
 * makes a manipulated device clock irrelevant to the credited amount.
 */
export interface OfflineGrant {
  readonly elapsedDurationMs: number;
  readonly creditedDurationMs: number;
  readonly reward: GameNumber;
}

export function calculateOfflineGrant(
  receivedAtTimestampMs: number,
  currentTimestampMs: number,
  savedProductionRatePerSecond: GameNumber,
  config: OfflineIncomeConfig,
): OfflineGrant {
  assertTimestamp(receivedAtTimestampMs, 'Saved timestamp');
  assertTimestamp(currentTimestampMs, 'Current timestamp');
  assertConfig(config);

  if (savedProductionRatePerSecond.lessThan(0)) {
    throw new Error('Saved production rate must be non-negative.');
  }

  const elapsedDurationMs = Math.max(
    0,
    currentTimestampMs - receivedAtTimestampMs,
  );
  const creditedDurationMs = Math.min(
    elapsedDurationMs,
    config.capDurationMs,
  );
  const creditedSeconds = creditedDurationMs / 1_000;
  const reward = savedProductionRatePerSecond
    .multiply(creditedSeconds)
    .multiply(config.efficiency);

  return { elapsedDurationMs, creditedDurationMs, reward };
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function assertConfig(config: OfflineIncomeConfig): void {
  if (!Number.isSafeInteger(config.capDurationMs) || config.capDurationMs <= 0) {
    throw new Error('Offline income cap must be a positive safe integer.');
  }

  if (
    !Number.isFinite(config.efficiency) ||
    config.efficiency < 0 ||
    config.efficiency > 1
  ) {
    throw new Error('Offline income efficiency must be from zero to one.');
  }
}
