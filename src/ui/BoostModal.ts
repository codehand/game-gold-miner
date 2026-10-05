import {
  boostAvailableAtMs,
  boostEndsAtMs,
  BOOST_COOLDOWN_MS,
  BOOST_DURATION_MS,
  EMPTY_BOOST_STATE,
  isBoostActive,
  type BoostState,
} from '../core';

export type BoostCommandResult =
  | { readonly kind: 'activated'; readonly boost: BoostState }
  | { readonly kind: 'cooldown'; readonly boost: BoostState }
  | { readonly kind: 'unavailable'; readonly message: string };

export interface BoostModalOptions {
  readonly parent: HTMLElement;
  readonly getBoostState: () => BoostState;
  readonly activate: () => Promise<BoostCommandResult>;
  readonly now: () => number;
}

/** A short, accessible status/activation sheet; the command lives outside the UI. */
export class BoostModal {
  readonly #dialog = document.createElement('dialog');
  readonly #getBoostState: () => BoostState;
  readonly #activate: () => Promise<BoostCommandResult>;
  readonly #now: () => number;
  #onClosed: (() => void) | null = null;
  #returnFocus: HTMLElement | null = null;
  #interval: number | null = null;
  #pending = false;
  #error = '';

  public constructor(options: BoostModalOptions) {
    this.#getBoostState = options.getBoostState;
    this.#activate = options.activate;
    this.#now = options.now;
    this.#dialog.className = 'boost-dialog';
    this.#dialog.setAttribute('aria-label', 'Mine Boost');
    options.parent.append(this.#dialog);
    this.#dialog.addEventListener('close', () => {
      if (this.#interval !== null) window.clearInterval(this.#interval);
      this.#interval = null;
      this.#onClosed?.();
      this.#onClosed = null;
      this.#returnFocus?.focus();
      this.#returnFocus = null;
    });
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog && !this.#pending) this.#dialog.close();
    });
    this.#dialog.addEventListener('cancel', (event) => {
      if (this.#pending) event.preventDefault();
    });
  }

  public open(onClosed?: () => void): void {
    if (this.#dialog.open) return;
    this.#onClosed = onClosed ?? null;
    this.#returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    this.#error = '';
    this.#render();
    this.#dialog.showModal();
    this.#interval = window.setInterval(() => this.#render(), 1_000);
  }

  public destroy(): void {
    if (this.#dialog.open) this.#dialog.close();
    this.#dialog.remove();
  }

  #render(): void {
    if (this.#pending) return;
    const nowMs = this.#now();
    const boost = this.#getBoostState() ?? EMPTY_BOOST_STATE;
    const active = isBoostActive(boost, nowMs);
    const endsAtMs = boostEndsAtMs(boost);
    const availableAtMs = boostAvailableAtMs(boost);
    const ready = nowMs >= availableAtMs;

    const header = document.createElement('header');
    header.className = 'boost-dialog-header';
    const title = document.createElement('h1');
    title.textContent = 'Mine Overdrive';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'boost-dialog-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close Boost');
    close.addEventListener('click', () => {
      if (!this.#pending) this.#dialog.close();
    });
    header.append(title, close);

    const main = document.createElement('main');
    main.className = 'boost-dialog-content';
    const mark = document.createElement('div');
    mark.className = 'boost-dialog-mark';
    mark.textContent = '⚡ ×4';
    const description = document.createElement('p');
    description.textContent = 'Mining, Elevator and Warehouse run 4× faster for 5 minutes.';
    const note = document.createElement('p');
    note.className = 'boost-dialog-note';
    note.textContent = 'The timer keeps running while you are away. Boosts do not stack.';
    const status = document.createElement('p');
    status.className = 'boost-dialog-status';
    status.setAttribute('aria-live', 'polite');
    status.textContent = active && endsAtMs !== null
      ? `Active · ${formatDuration(endsAtMs - nowMs)} left`
      : ready
        ? `Free boost ready · ${formatDuration(BOOST_DURATION_MS)}`
        : `Next free boost in ${formatDuration(availableAtMs - nowMs)}`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'boost-dialog-action';
    action.textContent = active ? 'Boost active' : ready ? 'Activate free Boost' : 'On cooldown';
    action.disabled = !ready;
    action.addEventListener('click', () => { void this.#handleActivate(action); });
    main.append(mark, description, note, status, action);
    if (this.#error !== '') {
      const error = document.createElement('p');
      error.className = 'boost-dialog-error';
      error.setAttribute('role', 'alert');
      error.textContent = this.#error;
      main.append(error);
    }
    const cadence = document.createElement('small');
    cadence.textContent = `One free activation every ${BOOST_COOLDOWN_MS / 3_600_000} hours.`;
    main.append(cadence);
    this.#dialog.replaceChildren(header, main);
  }

  async #handleActivate(button: HTMLButtonElement): Promise<void> {
    this.#pending = true;
    button.disabled = true;
    button.textContent = 'Activating…';
    try {
      const result = await this.#activate();
      this.#error = result.kind === 'unavailable' ? result.message : '';
    } catch {
      this.#error = 'Boost is unavailable. Please reconnect and try again.';
    } finally {
      this.#pending = false;
      this.#render();
    }
  }
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, '0')}m`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
