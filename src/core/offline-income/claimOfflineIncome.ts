import { GameNumber } from '../numbers/GameNumber';
import type { GameState } from '../state/GameState';
import type { OfflineIncomeCalculation } from './calculateOfflineIncome';

export interface PendingOfflineReward {
  readonly creditedDurationMs: number;
  readonly reward: GameNumber;
}

export type OfflineRewardClaimResult =
  | {
      readonly status: 'claimed';
      readonly state: GameState;
      readonly pendingReward: null;
      readonly claimedReward: GameNumber;
    }
  | {
      readonly status: 'no-pending-reward';
      readonly state: GameState;
      readonly pendingReward: null;
      readonly claimedReward: GameNumber;
    };

export function createPendingOfflineReward(
  calculation: OfflineIncomeCalculation | null,
): PendingOfflineReward | null {
  if (calculation === null || !calculation.reward.greaterThan(0)) {
    return null;
  }

  return {
    creditedDurationMs: calculation.creditedDurationMs,
    reward: calculation.reward,
  };
}

export function claimOfflineReward(
  state: GameState,
  pendingReward: PendingOfflineReward | null,
): OfflineRewardClaimResult {
  if (pendingReward === null) {
    return {
      status: 'no-pending-reward',
      state,
      pendingReward: null,
      claimedReward: GameNumber.from(0),
    };
  }

  assertPendingReward(pendingReward);

  return {
    status: 'claimed',
    state: {
      ...state,
      gold: state.gold.add(pendingReward.reward),
      // Server-milestone Step 18: the offline reward is the one gold source
      // that does not pass through `warehouse.totalGoldDelivered`, so it is
      // recorded in its own monotonic counter. That counter is part of the
      // save-conflict progress vector, which is what keeps a claimed reward
      // from being silently discarded by a dominating save.
      warehouse: {
        ...state.warehouse,
        totalOfflineGoldClaimed:
          state.warehouse.totalOfflineGoldClaimed.add(pendingReward.reward),
      },
    },
    pendingReward: null,
    claimedReward: pendingReward.reward,
  };
}

function assertPendingReward(pendingReward: PendingOfflineReward): void {
  if (
    !Number.isSafeInteger(pendingReward.creditedDurationMs) ||
    pendingReward.creditedDurationMs <= 0
  ) {
    throw new Error('Pending offline duration must be a positive safe integer.');
  }

  if (!pendingReward.reward.greaterThan(0)) {
    throw new Error('Pending offline reward must be positive.');
  }
}
