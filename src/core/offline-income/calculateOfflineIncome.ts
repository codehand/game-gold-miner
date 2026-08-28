import type { OfflineIncomeConfig } from '../../config';
import { GameNumber } from '../numbers/GameNumber';
import type { GameState } from '../state/GameState';

export interface OfflineIncomeCalculation {
  readonly state: GameState;
  readonly elapsedDurationMs: number;
  readonly creditedDurationMs: number;
  readonly reward: GameNumber;
}

export function calculateOfflineIncome(
  state: GameState,
  savedAtTimestampMs: number,
  currentTimestampMs: number,
  savedProductionRatePerSecond: GameNumber,
  config: OfflineIncomeConfig,
): OfflineIncomeCalculation {
  assertTimestamp(savedAtTimestampMs, 'Saved timestamp');
  assertTimestamp(currentTimestampMs, 'Current timestamp');
  assertConfig(config);

  if (savedProductionRatePerSecond.lessThan(0)) {
    throw new Error('Saved production rate must be non-negative.');
  }

  const elapsedDurationMs = Math.max(
    0,
    currentTimestampMs - savedAtTimestampMs,
  );
  const creditedDurationMs = Math.min(
    elapsedDurationMs,
    config.capDurationMs,
  );
  const creditedSeconds = creditedDurationMs / 1_000;
  const reward = savedProductionRatePerSecond
    .multiply(creditedSeconds)
    .multiply(config.efficiency);

  return {
    state: {
      ...state,
      lastUpdateTimestampMs: currentTimestampMs,
    },
    elapsedDurationMs,
    creditedDurationMs,
    reward,
  };
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
