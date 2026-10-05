import { getMineSite, MINE_SITES, type MineSiteId } from '../config';
import { GameNumber, type OfflineGrant, type PortfolioState } from '../core';
import { formatCreditedDuration, formatOfflineRewardAmount } from './OfflineRewardModal';

export interface MineMapActionResult {
  readonly ok: boolean;
  readonly message?: string;
}

export interface MineMapModalOptions {
  readonly parent: HTMLElement;
  readonly getPortfolio: () => PortfolioState;
  readonly getPendingMineId?: () => MineSiteId | null;
  readonly previewOfflineReward: (mineId: MineSiteId) => OfflineGrant | null;
  readonly buyMine: (mineId: MineSiteId) => Promise<MineMapActionResult>;
  readonly enterMine: (mineId: MineSiteId) => Promise<MineMapActionResult>;
}

/** Account map and claim surface; commands and persistence stay outside UI. */
export class MineMapModal {
  readonly #dialog = document.createElement('dialog');
  readonly #options: MineMapModalOptions;
  #selectedMineId: MineSiteId = 'gold';
  #onClosed: (() => void) | null = null;
  #returnFocus: HTMLElement | null = null;
  #pending = false;
  #message = '';

  public constructor(options: MineMapModalOptions) {
    this.#options = options;
    this.#dialog.className = 'mine-map-dialog';
    this.#dialog.setAttribute('aria-label', 'Mine Map');
    options.parent.append(this.#dialog);
    this.#dialog.addEventListener('close', () => {
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
      ? document.activeElement : null;
    this.#selectedMineId = this.#options.getPortfolio().selectedMineId;
    this.#message = '';
    this.#render();
    this.#dialog.showModal();
    this.#dialog.querySelector<HTMLButtonElement>('.mine-map-site-selected')?.focus();
  }

  public refresh(): void {
    if (this.#dialog.open && !this.#pending) this.#render();
  }

  public destroy(): void {
    if (this.#dialog.open) this.#dialog.close();
    this.#dialog.remove();
  }

  #render(): void {
    const portfolio = this.#options.getPortfolio();
    const pendingMineId = this.#options.getPendingMineId?.() ??
      MINE_SITES.find((site) => portfolio.mines[site.id]?.pendingClaim !== null &&
        portfolio.mines[site.id]?.pendingClaim !== undefined)?.id ?? null;
    const header = document.createElement('header');
    header.className = 'mine-map-header';
    const heading = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'EXPLORE';
    const title = document.createElement('h1');
    title.textContent = 'Mine Map';
    heading.append(eyebrow, title);
    const wallet = document.createElement('span');
    wallet.className = 'mine-map-wallet';
    wallet.textContent = `${formatOfflineRewardAmount(portfolio.walletGold)} gold`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mine-map-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close Map');
    close.disabled = this.#pending;
    close.addEventListener('click', () => this.#dialog.close());
    header.append(heading, wallet, close);

    const content = document.createElement('main');
    content.className = 'mine-map-content';
    const route = document.createElement('nav');
    route.className = 'mine-map-route';
    route.setAttribute('aria-label', 'Mine locations');
    const routeLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    routeLine.setAttribute('class', 'mine-map-route-line');
    routeLine.setAttribute('viewBox', '0 0 320 455');
    routeLine.setAttribute('aria-hidden', 'true');
    const routePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    routePath.setAttribute('d', 'M 70 48 C 72 82 248 82 248 118 S 72 160 72 195 S 248 236 248 272 S 72 312 72 348 S 248 390 248 422');
    routeLine.append(routePath);
    route.append(routeLine);
    for (const site of MINE_SITES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mine-map-site';
      if (site.id === this.#selectedMineId) {
        button.classList.add('mine-map-site-selected');
      }
      button.style.setProperty('--mine-accent', site.mapColor);
      button.dataset.mineId = site.id;
      button.disabled = this.#pending;
      const owned = portfolio.mines[site.id] !== undefined;
      const current = portfolio.activeMineId === site.id;
      const reward = owned && !current
        ? this.#options.previewOfflineReward(site.id)
        : null;
      const state = site.id === pendingMineId ? 'Claim pending'
        : current ? 'Current'
        : reward?.reward.greaterThan(0) ? 'Reward ready'
          : owned ? 'Owned'
            : canBuy(portfolio, site.id) ? 'Available' : 'Locked';
      const symbol = document.createElement('span');
      symbol.className = 'mine-map-site-symbol';
      const landmark = document.createElement('img');
      landmark.src = `/assets/sites/landmarks/${site.id}.svg`;
      landmark.alt = '';
      landmark.width = 36;
      landmark.height = 36;
      symbol.append(landmark);
      const name = document.createElement('strong');
      name.textContent = site.name;
      const status = document.createElement('span');
      status.className = 'mine-map-site-state';
      status.textContent = state;
      button.append(symbol, name, status);
      button.addEventListener('click', () => {
        this.#selectedMineId = site.id;
        this.#message = '';
        this.#render();
        this.#dialog.querySelector<HTMLButtonElement>('.mine-map-site-selected')?.focus();
      });
      route.append(button);
    }
    const detail = this.#detail(portfolio);
    content.append(route, detail);
    this.#dialog.replaceChildren(header, content);
  }

  #detail(portfolio: PortfolioState): HTMLElement {
    const site = getMineSite(this.#selectedMineId);
    const pendingMineId = this.#options.getPendingMineId?.() ??
      MINE_SITES.find((candidate) =>
        portfolio.mines[candidate.id]?.pendingClaim !== null &&
        portfolio.mines[candidate.id]?.pendingClaim !== undefined)?.id ?? null;
    const owned = portfolio.mines[site.id] !== undefined;
    const current = portfolio.activeMineId === site.id;
    const card = document.createElement('section');
    card.className = 'mine-map-detail';
    card.style.setProperty('--mine-accent', site.mapColor);
    const title = document.createElement('h2');
    title.textContent = site.name;
    const landmark = document.createElement('img');
    landmark.className = 'mine-map-detail-landmark';
    landmark.src = `/assets/sites/landmarks/${site.id}.svg`;
    landmark.alt = '';
    landmark.width = 56;
    landmark.height = 56;
    const description = document.createElement('p');
    description.textContent = `${site.resourceName} · ${site.resourceValueMultiplier}× resource value`;
    card.append(landmark, title, description);

    if (owned) {
      const floorCount = portfolio.mines[site.id]!.state.floors.filter(
        (floor) => floor.isUnlocked,
      ).length;
      const progress = document.createElement('p');
      progress.textContent = `${floorCount} of 15 floors open`;
      card.append(progress);
      if (!current) {
        const reward = this.#options.previewOfflineReward(site.id);
        if (reward !== null && reward.reward.greaterThan(0)) {
          const pending = document.createElement('p');
          pending.className = 'mine-map-reward';
          pending.textContent = `${formatOfflineRewardAmount(reward.reward)} gold · ${formatCreditedDuration(reward.creditedDurationMs)} offline`;
          card.append(pending);
          const afterClaim = document.createElement('p');
          afterClaim.textContent = `Shared wallet after claim: ${formatOfflineRewardAmount(portfolio.walletGold.add(reward.reward))} gold`;
          card.append(afterClaim);
          const cap = document.createElement('p');
          cap.textContent = 'Offline income is 50% of the saved rate, capped at 2 hours per visit.';
          card.append(cap);
        }
        card.append(this.#action(
          reward !== null && reward.reward.greaterThan(0) ? 'Claim & enter mine' : 'Enter mine',
          () => this.#enter(site.id),
        ));
      } else {
        const label = document.createElement('p');
        label.className = 'mine-map-current';
        label.textContent = site.id === pendingMineId
          ? 'You are playing this mine · offline reward pending cloud validation'
          : 'You are playing this mine';
        card.append(label);
      }
    } else {
      const price = GameNumber.from(site.unlockPriceGold);
      const cost = document.createElement('p');
      cost.textContent = `Price: ${formatOfflineRewardAmount(price)} gold`;
      card.append(cost);
      if (!canBuy(portfolio, site.id)) {
        const gate = document.createElement('p');
        gate.className = 'mine-map-gate';
        const previous = site.prerequisiteMineId === null
          ? null : getMineSite(site.prerequisiteMineId);
        gate.textContent = previous === null
          ? 'Starter mine'
          : `Unlock floor 5 in ${previous.name} first`;
        card.append(gate);
      } else if (portfolio.walletGold.lessThan(price)) {
        const shortfall = document.createElement('p');
        shortfall.className = 'mine-map-gate';
        shortfall.textContent = `Need ${formatOfflineRewardAmount(price.subtract(portfolio.walletGold))} more gold`;
        card.append(shortfall);
      }
      const action = this.#action('Buy mine', () => this.#buy(site.id));
      action.disabled = this.#pending || !canBuy(portfolio, site.id) ||
        portfolio.walletGold.lessThan(price);
      card.append(action);
    }
    if (this.#message !== '') {
      const message = document.createElement('p');
      message.className = 'mine-map-message';
      message.setAttribute('role', 'status');
      message.textContent = this.#message;
      card.append(message);
    }
    return card;
  }

  #action(label: string, perform: () => Promise<void>): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mine-map-action';
    button.textContent = label;
    button.disabled = this.#pending;
    button.addEventListener('click', () => { void perform(); });
    return button;
  }

  async #buy(id: MineSiteId): Promise<void> {
    this.#pending = true;
    this.#render();
    try {
      const result = await this.#options.buyMine(id);
      this.#message = result.ok ? 'Mine purchased' : result.message ?? 'Purchase unavailable';
    } catch {
      this.#message = 'Purchase unavailable. Please try again.';
    } finally {
      this.#pending = false;
      this.#render();
    }
  }

  async #enter(id: MineSiteId): Promise<void> {
    this.#pending = true;
    this.#render();
    try {
      const result = await this.#options.enterMine(id);
      if (result.ok) {
        this.#dialog.close();
        return;
      }
      this.#message = result.message ?? 'Unable to enter mine';
    } catch {
      this.#message = 'Unable to enter mine. Please try again.';
    } finally {
      this.#pending = false;
      if (this.#dialog.open) this.#render();
    }
  }
}

function canBuy(portfolio: PortfolioState, id: MineSiteId): boolean {
  const site = getMineSite(id);
  if (site.prerequisiteMineId === null) return true;
  const previous = portfolio.mines[site.prerequisiteMineId];
  return previous !== undefined && previous.state.floors.some(
    (floor) => floor.id === site.prerequisiteFloorId && floor.isUnlocked,
  );
}
