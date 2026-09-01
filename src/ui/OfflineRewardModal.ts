import type { GameNumber, PendingOfflineReward } from '../core';
import { describeAmountTier } from '../game/view-model';

export const OFFLINE_REWARD_SAVE_FAILURE_MESSAGE =
  'Your reward could not be saved. Please try again.';

export interface OfflineRewardModalOptions {
  readonly parent: HTMLElement;
  readonly pendingReward: PendingOfflineReward;
  readonly onClaim: () => Promise<boolean>;
}

export interface OfflineRewardModal {
  destroy(): void;
}

export function showOfflineRewardModal(
  options: OfflineRewardModalOptions,
): OfflineRewardModal {
  const backdrop = document.createElement('div');
  backdrop.className = 'offline-reward-backdrop';
  backdrop.dataset.testid = 'offline-reward-modal';

  const dialog = document.createElement('section');
  dialog.className = 'offline-reward-dialog';
  dialog.setAttribute('aria-labelledby', 'offline-reward-title');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('role', 'dialog');

  const eyebrow = document.createElement('p');
  eyebrow.className = 'offline-reward-eyebrow';
  eyebrow.textContent = 'Welcome back';

  const title = document.createElement('h1');
  title.id = 'offline-reward-title';
  title.textContent = 'Offline reward';

  const creditedTime = document.createElement('p');
  creditedTime.className = 'offline-reward-time';
  creditedTime.dataset.testid = 'offline-reward-time';
  creditedTime.textContent = `${formatCreditedDuration(
    options.pendingReward.creditedDurationMs,
  )} credited`;

  const reward = document.createElement('p');
  reward.className = 'offline-reward-amount';
  reward.dataset.testid = 'offline-reward-amount';
  reward.textContent = `${formatOfflineRewardAmount(options.pendingReward.reward)} gold`;

  const status = document.createElement('p');
  status.className = 'offline-reward-status';
  status.setAttribute('aria-live', 'polite');

  const claimButton = document.createElement('button');
  claimButton.className = 'offline-reward-claim';
  claimButton.dataset.testid = 'offline-reward-claim';
  claimButton.type = 'button';
  claimButton.textContent = 'Claim';

  let destroyed = false;
  let claimInProgress = false;

  const handleClaim = async (): Promise<void> => {
    if (destroyed || claimInProgress) {
      return;
    }

    claimInProgress = true;
    claimButton.disabled = true;
    claimButton.textContent = 'Saving…';
    status.textContent = '';

    const succeeded = await options.onClaim();

    if (destroyed) {
      return;
    }

    if (succeeded) {
      destroy();
      return;
    }

    claimInProgress = false;
    claimButton.disabled = false;
    claimButton.textContent = 'Try again';
    status.textContent = OFFLINE_REWARD_SAVE_FAILURE_MESSAGE;
    claimButton.focus();
  };
  const destroy = (): void => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    claimButton.removeEventListener('click', handleClaim);
    backdrop.remove();
  };

  claimButton.addEventListener('click', handleClaim);
  dialog.append(eyebrow, title, creditedTime, reward, status, claimButton);
  backdrop.append(dialog);
  options.parent.append(backdrop);
  claimButton.focus();

  return { destroy };
}

/**
 * Offline rewards keep two useful decimals while sharing the lowercase tier
 * sequence used everywhere else in the game.
 */
export function formatOfflineRewardAmount(value: GameNumber): string {
  const { mantissa, exponent } = value;

  if (mantissa === 0) {
    return '0';
  }

  const tier = Math.max(0, Math.floor(exponent / 3));
  const suffix = describeAmountTier(tier);

  if (suffix === null) {
    return value.serialize();
  }

  const displayExponent = exponent - tier * 3;

  // Reachable offline rewards stay far below this guard. For an extreme save,
  // scientific notation remains finite and preferable to Infinity.
  if (displayExponent > 300) {
    return value.serialize();
  }

  const displayed = mantissa * 10 ** displayExponent;
  const fixed = displayed.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');

  return `${fixed}${suffix}`;
}

export function formatCreditedDuration(durationMs: number): string {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    throw new Error('Credited duration must be a non-negative safe integer.');
  }

  const totalMinutes = Math.floor(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return '<1m';
}
