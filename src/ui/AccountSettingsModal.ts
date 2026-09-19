export type AccountIdentityStatus = 'loading' | 'guest' | 'signed-in' | 'unconfigured';

export interface AccountIdentityView {
  readonly status: AccountIdentityStatus;
  readonly userId: string | null;
  readonly email: string | null;
  readonly googleLoginLabel?: string;
}

export interface AccountConflictCandidateView {
  readonly title: string;
  readonly lastPlayedLabel: string;
  readonly goldLabel: string;
  readonly floorsOpenLabel: string;
  readonly deepestShaftLabel: string;
  readonly deliveredLabel: string;
}

export interface AccountConflictView {
  readonly local: AccountConflictCandidateView;
  readonly remote: AccountConflictCandidateView;
}

export type AccountActionResult =
  | { readonly status: 'ok' | 'redirecting' }
  | { readonly status: 'error'; readonly reason: string };

export interface AccountSettingsModalOptions {
  readonly parent: HTMLElement;
  readonly appVersion: string;
  readonly getIdentity: () => AccountIdentityView;
  readonly onLogin: () => Promise<AccountActionResult>;
  readonly onLogout: () => Promise<AccountActionResult>;
  readonly onConflictChoice: (
    choice: 'local' | 'remote',
  ) => Promise<AccountActionResult>;
}

/** Player-facing account surface; auth and save effects stay injected in main.ts. */
export class AccountSettingsModal {
  readonly #backdrop: HTMLDivElement;
  readonly #dialog: HTMLElement;
  readonly #options: AccountSettingsModalOptions;
  #returnFocus: HTMLElement | null = null;
  #conflict: AccountConflictView | null = null;
  #releaseGameInput: (() => void) | null = null;
  #busy = false;
  #destroyed = false;

  public constructor(options: AccountSettingsModalOptions) {
    this.#options = options;
    this.#backdrop = document.createElement('div');
    this.#backdrop.className = 'account-settings-backdrop';
    this.#backdrop.hidden = true;
    this.#backdrop.dataset.testid = 'account-settings-modal';
    this.#backdrop.addEventListener('click', (event) => {
      if (event.target === this.#backdrop && !this.#busy) {
        this.close();
      }
    });
    this.#backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.#busy) {
        event.preventDefault();
        this.close();
      }
    });

    this.#dialog = document.createElement('section');
    this.#dialog.className = 'account-settings-dialog';
    this.#dialog.setAttribute('role', 'dialog');
    this.#dialog.setAttribute('aria-modal', 'true');
    this.#dialog.setAttribute('aria-labelledby', 'account-settings-title');
    this.#backdrop.append(this.#dialog);
    options.parent.append(this.#backdrop);
  }

  public open(onClosed?: () => void): void {
    if (this.#destroyed || !this.#backdrop.hidden) {
      return;
    }

    this.#releaseGameInput = onClosed ?? null;
    this.#returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    this.#render();
    this.#backdrop.hidden = false;
    this.#focusInitialControl();
  }

  public showConflict(conflict: AccountConflictView): void {
    if (this.#destroyed) {
      return;
    }

    this.#conflict = conflict;
    if (this.#backdrop.hidden) {
      this.open();
    } else {
      this.#render();
      this.#focusInitialControl();
    }
  }

  public close(): void {
    if (this.#busy) {
      return;
    }

    this.#backdrop.hidden = true;
    this.#conflict = null;
    const releaseGameInput = this.#releaseGameInput;
    this.#releaseGameInput = null;
    this.#returnFocus?.focus();
    this.#returnFocus = null;
    releaseGameInput?.();
  }

  public destroy(): void {
    this.#destroyed = true;
    this.#releaseGameInput?.();
    this.#releaseGameInput = null;
    this.#backdrop.remove();
  }

  #render(): void {
    this.#dialog.replaceChildren();

    const header = document.createElement('header');
    header.className = 'account-settings-heading';
    const title = document.createElement('h1');
    title.id = 'account-settings-title';
    title.textContent = this.#conflict === null ? 'Account & Settings' : 'Choose progress';
    const close = this.#button('×', () => this.close(), 'account-settings-close');
    close.setAttribute('aria-label', 'Close account settings');
    header.append(title, close);

    const body = document.createElement('main');
    body.className = 'account-settings-content';
    this.#dialog.append(header, body);

    if (this.#conflict !== null) {
      this.#renderConflict(body);
      return;
    }

    this.#renderAccount(body);
  }

  #renderAccount(body: HTMLElement): void {
    const identity = this.#options.getIdentity();
    const status = document.createElement('p');
    status.className = 'account-settings-status';
    status.dataset.testid = 'account-settings-status';

    const details = document.createElement('dl');
    details.className = 'account-settings-details';
    this.#detail(details, 'Status', this.#statusLabel(identity.status));
    if (identity.email !== null) {
      this.#detail(details, 'Email', identity.email);
    }
    if (identity.userId !== null) {
      this.#detail(details, 'User ID', identity.userId);
    }

    const actions = document.createElement('div');
    actions.className = 'account-settings-actions';
    if (identity.status === 'guest') {
      status.textContent = 'Playing as a guest. Sign in to sync this progress to Google.';
      actions.append(this.#button(identity.googleLoginLabel ?? 'Continue with Google', () => void this.#runAction('login'), 'account-settings-primary'));
    } else if (identity.status === 'signed-in') {
      status.textContent = 'Your progress is linked to this account.';
      actions.append(this.#button('Log out & start fresh', () => void this.#runAction('logout'), 'account-settings-danger'));
    } else if (identity.status === 'unconfigured') {
      status.textContent = 'Cloud account services are not configured in this build.';
    } else {
      status.textContent = 'Checking account…';
    }

    const version = document.createElement('p');
    version.className = 'account-settings-version';
    version.textContent = `App version ${this.#options.appVersion}`;
    body.append(status, details, actions, version);
  }

  #renderConflict(body: HTMLElement): void {
    const intro = document.createElement('p');
    intro.className = 'account-settings-status';
    intro.dataset.testid = 'account-settings-status';
    intro.textContent = 'This device and the online account have different progress. Choose which save to keep.';

    const choices = document.createElement('div');
    choices.className = 'account-settings-conflicts';
    choices.append(
      this.#conflictCard(this.#conflict?.local ?? null, 'local'),
      this.#conflictCard(this.#conflict?.remote ?? null, 'remote'),
    );

    const note = document.createElement('p');
    note.className = 'account-settings-note';
    note.textContent = 'The unselected save is not deleted until the selected save is confirmed.';
    body.append(intro, choices, note);
  }

  #conflictCard(
    candidate: AccountConflictCandidateView | null,
    choice: 'local' | 'remote',
  ): HTMLElement {
    const card = document.createElement('article');
    card.className = 'account-settings-conflict-card';
    if (candidate === null) {
      return card;
    }

    const title = document.createElement('h2');
    title.textContent = candidate.title;
    const list = document.createElement('ul');
    for (const label of [
      candidate.lastPlayedLabel,
      candidate.goldLabel,
      candidate.floorsOpenLabel,
      candidate.deepestShaftLabel,
      candidate.deliveredLabel,
    ]) {
      const item = document.createElement('li');
      item.textContent = label;
      list.append(item);
    }
    const button = this.#button(
      choice === 'local' ? 'Use this device' : 'Use cloud save',
      () => void this.#runAction(choice),
      choice === 'local' ? 'account-settings-primary' : 'account-settings-secondary',
    );
    card.append(title, list, button);
    return card;
  }

  #detail(details: HTMLDListElement, label: string, value: string): void {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    details.append(term, description);
  }

  #button(
    label: string,
    onClick: () => void,
    className = 'account-settings-secondary',
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  async #runAction(action: 'login' | 'logout' | 'local' | 'remote'): Promise<void> {
    if (this.#busy || this.#destroyed) {
      return;
    }

    this.#busy = true;
    this.#renderBusy(action);
    let result: AccountActionResult;
    try {
      result = action === 'login'
        ? await this.#options.onLogin()
        : action === 'logout'
          ? await this.#options.onLogout()
          : await this.#options.onConflictChoice(action);
    } catch (error) {
      result = {
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    if (this.#destroyed || result.status === 'redirecting') {
      return;
    }

    if (result.status === 'ok') {
      this.#busy = false;
      this.close();
      return;
    }

    this.#busy = false;
    this.#render();
    if (result.status === 'error') {
      this.#renderError(result.reason);
    }
  }

  #renderBusy(action: 'login' | 'logout' | 'local' | 'remote'): void {
    this.#dialog.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    const status = this.#dialog.querySelector<HTMLElement>('[data-testid="account-settings-status"]');
    if (status !== null) {
      status.textContent = action === 'login' ? 'Opening Google…' : 'Working…';
    }
  }

  #renderError(reason: string): void {
    const error = document.createElement('p');
    error.className = 'account-settings-error';
    error.setAttribute('role', 'alert');
    error.textContent = reason;
    this.#dialog.querySelector('.account-settings-content')?.prepend(error);
  }

  #focusInitialControl(): void {
    this.#dialog.querySelector<HTMLButtonElement>(
      '.account-settings-primary, .account-settings-secondary',
    )?.focus();
  }

  #statusLabel(status: AccountIdentityStatus): string {
    if (status === 'signed-in') {
      return 'Google account';
    }
    if (status === 'guest') {
      return 'Guest';
    }
    if (status === 'unconfigured') {
      return 'Offline / local only';
    }
    return 'Loading';
  }
}
