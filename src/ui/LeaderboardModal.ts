import { GameNumber } from '../core';
import { formatAmount } from '../game/view-model/formatAmount';
import type {
  LeaderboardLoadResult,
  LeaderboardSnapshot,
} from '../platform/web/leaderboard';

export interface LeaderboardModalOptions {
  readonly parent: HTMLElement;
  readonly load: () => Promise<LeaderboardLoadResult>;
}

/** Formats the server's canonical metric through the game's shared amount UI. */
export function formatLeaderboardMetric(metricExact: string): string {
  return formatAmount(GameNumber.from(metricExact));
}

/** Accessible leaderboard surface. Loading/failure never blocks the mine itself. */
export class LeaderboardModal {
  readonly #dialog = document.createElement('dialog');
  readonly #options: LeaderboardModalOptions;
  #returnFocus: HTMLElement | null = null;
  #releaseGameInput: (() => void) | null = null;
  #loadGeneration = 0;
  #destroyed = false;

  public constructor(options: LeaderboardModalOptions) {
    this.#options = options;
    this.#dialog.className = 'leaderboard';
    this.#dialog.setAttribute('aria-label', 'Leaderboard');
    options.parent.append(this.#dialog);
    this.#dialog.addEventListener('close', () => {
      if (this.#destroyed) {
        return;
      }

      this.#loadGeneration += 1;
      const releaseGameInput = this.#releaseGameInput;
      this.#releaseGameInput = null;
      this.#returnFocus?.focus();
      this.#returnFocus = null;
      releaseGameInput?.();
    });
    this.#dialog.addEventListener('click', (event) => {
      if (event.target !== this.#dialog) {
        return;
      }

      const box = this.#dialog.getBoundingClientRect();
      const clickedOutside =
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom;
      if (clickedOutside) {
        this.#dialog.close();
      }
    });
  }

  public open(onClosed?: () => void): void {
    if (this.#destroyed || this.#dialog.open) {
      return;
    }

    this.#releaseGameInput = onClosed ?? null;
    this.#returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    this.#renderLoading();
    this.#dialog.showModal();
    void this.#load();
  }

  public destroy(): void {
    this.#destroyed = true;
    this.#loadGeneration += 1;
    if (this.#dialog.open) {
      this.#dialog.close();
    }
    this.#dialog.remove();
  }

  async #load(): Promise<void> {
    const generation = ++this.#loadGeneration;
    let result: LeaderboardLoadResult;
    try {
      result = await this.#options.load();
    } catch {
      result = {
        kind: 'offline',
        message: 'Leaderboard is unavailable offline. Your mine is still playable.',
      };
    }

    if (this.#destroyed || !this.#dialog.open || generation !== this.#loadGeneration) {
      return;
    }

    if (result.kind === 'ready') {
      this.#renderReady(result.snapshot);
    } else {
      this.#renderOffline(result.message);
    }
  }

  #renderShell(): HTMLElement {
    this.#dialog.replaceChildren();

    const header = document.createElement('header');
    header.className = 'leaderboard-heading';
    const titleGroup = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'leaderboard-eyebrow';
    eyebrow.textContent = 'LIFETIME GOLD · ALL TIME';
    const title = document.createElement('h1');
    title.id = 'leaderboard-title';
    title.textContent = 'Leaderboard';
    titleGroup.append(eyebrow, title);
    const close = this.#button('×', () => this.#dialog.close(), 'leaderboard-close');
    close.setAttribute('aria-label', 'Close leaderboard');
    header.append(titleGroup, close);

    const main = document.createElement('main');
    main.className = 'leaderboard-content';
    this.#dialog.setAttribute('aria-labelledby', 'leaderboard-title');
    this.#dialog.append(header, main);
    return main;
  }

  #renderLoading(): void {
    const main = this.#renderShell();
    const status = document.createElement('p');
    status.className = 'leaderboard-status';
    status.dataset.testid = 'leaderboard-status';
    status.textContent = 'Loading the verified board…';
    main.append(status);
  }

  #renderOffline(message: string): void {
    const main = this.#renderShell();
    const status = document.createElement('p');
    status.className = 'leaderboard-status leaderboard-offline';
    status.dataset.testid = 'leaderboard-offline';
    status.textContent = message;
    const retry = this.#button('Try again', () => {
      this.#renderLoading();
      void this.#load();
    }, 'leaderboard-retry');
    main.append(status, retry);
    retry.focus();
  }

  #renderReady(snapshot: LeaderboardSnapshot): void {
    const main = this.#renderShell();
    const intro = document.createElement('p');
    intro.className = 'leaderboard-intro';
    intro.textContent = 'Only progress accepted by the server appears here.';
    main.append(intro, this.#renderPlayer(snapshot), this.#renderTable(snapshot));
  }

  #renderPlayer(snapshot: LeaderboardSnapshot): HTMLElement {
    const card = document.createElement('section');
    card.className = 'leaderboard-player';
    card.dataset.testid = 'leaderboard-player-rank';
    const heading = document.createElement('h2');
    heading.textContent = 'Your rank';
    card.append(heading);

    if (snapshot.player === null) {
      const empty = document.createElement('p');
      empty.textContent = 'Not ranked yet — your next accepted cloud save will appear here.';
      card.append(empty);
      return card;
    }

    const rank = document.createElement('strong');
    rank.textContent = `#${snapshot.player.rank}`;
    const value = document.createElement('span');
    value.className = 'leaderboard-player-value';
    value.dataset.exactValue = snapshot.player.metricExact;
    value.textContent = formatLeaderboardMetric(snapshot.player.metricExact);
    const name = document.createElement('span');
    name.className = 'leaderboard-player-name';
    name.textContent = snapshot.player.displayName ?? 'Anonymous miner';
    card.append(rank, value, name);
    return card;
  }

  #renderTable(snapshot: LeaderboardSnapshot): HTMLElement {
    const section = document.createElement('section');
    section.className = 'leaderboard-board';
    const heading = document.createElement('h2');
    heading.textContent = 'Top miners';
    section.append(heading);

    if (snapshot.entries.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No verified scores yet.';
      section.append(empty);
      return section;
    }

    const table = document.createElement('table');
    table.setAttribute('aria-label', 'Lifetime gold leaderboard');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['Rank', 'Miner', 'Gold earned']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      headerRow.append(cell);
    }
    head.append(headerRow);

    const body = document.createElement('tbody');
    for (const entry of snapshot.entries) {
      const row = document.createElement('tr');
      const rank = document.createElement('th');
      rank.scope = 'row';
      rank.textContent = `#${entry.rank}`;
      const name = document.createElement('td');
      name.textContent = entry.displayName ?? 'Anonymous miner';
      const value = document.createElement('td');
      value.className = 'leaderboard-value';
      value.dataset.exactValue = entry.metricExact;
      value.textContent = formatLeaderboardMetric(entry.metricExact);
      row.append(rank, name, value);
      body.append(row);
    }

    table.append(head, body);
    section.append(table);
    return section;
  }

  #button(label: string, onClick: () => void, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}
