import type { PendingOfflineReward } from '../core';

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
  reward.textContent = `${options.pendingReward.reward.serialize()} gold`;

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
