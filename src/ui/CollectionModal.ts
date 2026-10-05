import { getMineSite } from '../config';
import {
  calculateCatRoleEffect,
  type CatInstance,
  type CatRole,
  type CatRosterState,
} from '../core';
import { parseMineCatSlot } from '../core/portfolio/portfolioCatRoster';
import { getMarketplaceAsset } from './marketplaceAssetRegistry';
import { getMarketplaceIcon } from './marketplaceIconRegistry';
import { getMarketplaceStatePresentation } from './marketplaceStatePresentation';

export interface CollectionModalOptions {
  readonly parent: HTMLElement;
  readonly getRoster: () => CatRosterState;
  readonly getStatus?: () => CollectionModalStatus;
  readonly onRetry?: () => void;
  readonly onClose?: () => void;
}

export type CollectionModalStatus = 'loading' | 'ready' | 'stale' | 'error';

type RoleFilter = 'All roles' | 'Elevator' | 'Warehouse' | 'Miner' | 'Hauler';
type RarityFilter = 'All rarities' | 'N' | 'R' | 'SR' | 'SSR' | 'UR';
type StateFilter = 'All states' | CatInstance['availabilityState'];
type SortOption = 'Updated' | 'Name' | 'Level';

const FALLBACK_PORTRAIT = '/assets/placeholder/miner-cat.png';
const ROLE_LABELS: Readonly<Record<CatRole, string>> = {
  elevator: 'Elevator',
  warehouse: 'Warehouse',
  miner: 'Miner',
  hauler: 'Hauler',
};
const ROLE_ICON_IDS: Readonly<Record<CatRole, string>> = {
  elevator: 'role-elevator',
  warehouse: 'role-warehouse',
  miner: 'role-miner',
  hauler: 'role-hauler',
};
const SKILL_ICON_IDS: Readonly<Record<CatRole, string>> = {
  elevator: 'skill-lift-mastery',
  warehouse: 'skill-storage-mastery',
  miner: 'skill-mining-mastery',
  hauler: 'skill-hauling-mastery',
};
const ATTRIBUTE_LABELS = {
  power: 'Power',
  speed: 'Speed',
  capacity: 'Capacity',
  efficiency: 'Efficiency',
} as const;
const ATTRIBUTE_ICON_IDS = {
  power: 'attribute-power',
  speed: 'attribute-speed',
  capacity: 'attribute-capacity',
  efficiency: 'attribute-efficiency',
} as const;

/** Owned-cat list/detail projection. It never writes ownership or assignment state. */
export class CollectionModal {
  readonly #dialog = document.createElement('dialog');
  readonly #getRoster: () => CatRosterState;
  readonly #getStatus: () => CollectionModalStatus;
  readonly #onRetry: (() => void) | null;
  readonly #onClose: (() => void) | null;
  #search = '';
  #role: RoleFilter = 'All roles';
  #rarity: RarityFilter = 'All rarities';
  #state: StateFilter = 'All states';
  #sort: SortOption = 'Updated';
  #selectedCatId: string | null = null;
  #afterClose: (() => void) | null = null;
  #returnFocus: HTMLElement | null = null;
  #destroyed = false;

  public constructor(options: CollectionModalOptions) {
    this.#getRoster = options.getRoster;
    this.#getStatus = options.getStatus ?? (() => 'ready');
    this.#onRetry = options.onRetry ?? null;
    this.#onClose = options.onClose ?? null;
    this.#dialog.className = 'collection-modal';
    this.#dialog.setAttribute('aria-label', 'Cat Collection');
    options.parent.append(this.#dialog);
    this.#dialog.addEventListener('close', () => {
      if (this.#destroyed) return;
      this.#onClose?.();
      this.#returnFocus?.focus();
      this.#afterClose?.();
      this.#afterClose = null;
    });
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.#dialog.close();
    });
  }

  public open(afterClose?: () => void): void {
    if (this.#dialog.open) return;
    this.#afterClose = afterClose ?? null;
    this.#returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.#selectedCatId = null;
    this.#render();
    this.#dialog.showModal();
  }

  public refresh(): void {
    if (this.#dialog.open) this.#render();
  }

  public destroy(): void {
    this.#destroyed = true;
    if (this.#dialog.open) this.#dialog.close();
    this.#dialog.remove();
  }

  #render(): void {
    const roster = this.#getRoster();
    const header = document.createElement('header');
    header.className = 'collection-header';
    const titleGroup = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'collection-eyebrow';
    eyebrow.textContent = 'YOUR CATS';
    const title = document.createElement('h1');
    title.textContent = 'Collection';
    titleGroup.append(eyebrow, title);
    const close = this.#button('×', () => this.#dialog.close(), 'collection-close');
    close.setAttribute('aria-label', 'Close collection');
    header.append(titleGroup, close);

    const main = document.createElement('main');
    main.className = 'collection-content';
    const status = this.#getStatus();
    const summary = document.createElement('p');
    summary.className = 'collection-summary';
    summary.textContent = status === 'ready'
      ? `${roster.cats.length} owned ${roster.cats.length === 1 ? 'cat' : 'cats'} · Collection #${roster.collectionRevision}`
      : status === 'stale'
        ? `${roster.cats.length} saved ${roster.cats.length === 1 ? 'cat' : 'cats'} · Refresh pending`
        : status === 'loading'
          ? 'Loading your collection…'
          : 'Collection unavailable · Retry to reconnect';
    main.append(summary);

    if (status !== 'ready') {
      main.append(this.#status(status));
    }

    if (this.#selectedCatId !== null) {
      const selected = roster.cats.find((cat) => cat.catInstanceId === this.#selectedCatId);
      if (selected !== undefined) {
        main.append(this.#detail(selected));
      } else {
        this.#selectedCatId = null;
        main.append(this.#list(roster));
      }
    } else if (status === 'ready' || roster.cats.length > 0) {
      main.append(this.#list(roster));
    } else {
      const empty = document.createElement('div');
      empty.className = 'collection-empty collection-state-empty';
      empty.textContent = status === 'loading'
        ? 'Loading your collection…'
        : 'Your collection could not be loaded. Retry to check your saved cats.';
      main.append(empty);
    }

    this.#dialog.replaceChildren(header, main);
    (this.#dialog.querySelector('[data-autofocus]') as HTMLElement | null)?.focus();
  }

  #status(status: Exclude<CollectionModalStatus, 'ready'>): HTMLElement {
    const banner = document.createElement('div');
    banner.className = 'collection-state';
    banner.dataset.state = status;
    const copy = document.createElement('span');
    copy.textContent = status === 'loading'
      ? 'Refreshing your collection…'
      : status === 'stale'
        ? 'Showing the last saved collection. Reconnect to refresh.'
        : 'Collection could not be loaded. Try again.';
    banner.append(copy);
    if (status !== 'loading' && this.#onRetry !== null) {
      const retry = this.#button('Retry', () => this.#onRetry!(), 'collection-retry');
      banner.append(retry);
    }
    return banner;
  }

  #list(roster: CatRosterState): HTMLElement {
    const section = document.createElement('section');
    section.className = 'collection-list';
    const toolbar = document.createElement('div');
    toolbar.className = 'collection-toolbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search your cats…';
    search.setAttribute('aria-label', 'Search your cats');
    search.value = this.#search;
    search.dataset.autofocus = 'true';
    search.addEventListener('input', () => {
      this.#search = search.value;
      this.#render();
    });
    toolbar.append(search);
    const filters = document.createElement('div');
    filters.className = 'collection-filters';
    filters.append(
      this.#select('Role', ['All roles', 'Elevator', 'Warehouse', 'Miner', 'Hauler'], this.#role, (value) => {
        this.#role = value as RoleFilter;
        this.#render();
      }),
      this.#select('Rarity', ['All rarities', 'N', 'R', 'SR', 'SSR', 'UR'], this.#rarity, (value) => {
        this.#rarity = value as RarityFilter;
        this.#render();
      }),
      this.#select('State', ['All states', 'Idle', 'Assigned', 'Listed', 'Rented', 'Expired', 'Locked'], this.#state, (value) => {
        this.#state = value as StateFilter;
        this.#render();
      }),
      this.#select('Sort', ['Updated', 'Name', 'Level'], this.#sort, (value) => {
        this.#sort = value as SortOption;
        this.#render();
      }),
    );
    section.append(toolbar, filters);

    const filtered = roster.cats.filter((cat) => {
      const matchesSearch = `${cat.displayName} ${cat.assetId}`.toLowerCase().includes(this.#search.trim().toLowerCase());
      const matchesRole = this.#role === 'All roles' || ROLE_LABELS[cat.roleId] === this.#role;
      const matchesRarity = this.#rarity === 'All rarities' || cat.rarityTier === this.#rarity;
      const matchesState = this.#state === 'All states' || cat.availabilityState === this.#state;
      return matchesSearch && matchesRole && matchesRarity && matchesState;
    }).sort((left, right) => {
      if (this.#sort === 'Name') return left.displayName.localeCompare(right.displayName);
      if (this.#sort === 'Level') return right.level - left.level || left.displayName.localeCompare(right.displayName);
      return right.updatedAt - left.updatedAt || left.displayName.localeCompare(right.displayName);
    });

    const grid = document.createElement('div');
    grid.className = 'collection-grid';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'collection-empty';
      empty.textContent = roster.cats.length === 0
        ? 'Your collection is empty. Buy a cat in Marketplace to get started.'
        : 'No owned cats match these filters.';
      grid.append(empty);
    } else {
      filtered.forEach((cat) => grid.append(this.#card(cat)));
    }
    section.append(grid);
    return section;
  }

  #card(cat: CatInstance): HTMLElement {
    const article = document.createElement('article');
    article.className = `collection-card rarity-${cat.rarityTier.toLowerCase()}`;
    article.dataset.catInstanceId = cat.catInstanceId;
    const portrait = this.#portrait(cat);
    const body = document.createElement('div');
    body.className = 'collection-card-body';
    const name = document.createElement('h2');
    name.textContent = cat.displayName;
    const role = document.createElement('p');
    role.className = 'collection-role';
    role.append(this.#icon(ROLE_ICON_IDS[cat.roleId], ROLE_LABELS[cat.roleId]), document.createTextNode(ROLE_LABELS[cat.roleId]));
    const status = document.createElement('span');
    status.className = 'collection-status';
    status.dataset.state = cat.availabilityState;
    status.textContent = cat.assignedSlotKey === null
      ? cat.availabilityState : `Assigned · ${formatAssignedSlot(cat.assignedSlotKey)}`;
    const level = document.createElement('span');
    level.className = 'collection-level';
    level.textContent = `${cat.rarityTier} · Lv ${cat.level}`;
    body.append(name, role, level, status);
    const view = this.#button('View detail', () => {
      this.#selectedCatId = cat.catInstanceId;
      this.#render();
    }, 'collection-card-action');
    article.append(portrait, body, view);
    return article;
  }

  #detail(cat: CatInstance): HTMLElement {
    const section = document.createElement('section');
    section.className = 'collection-detail';
    const back = this.#button('← Back to collection', () => {
      this.#selectedCatId = null;
      this.#render();
    }, 'collection-back');
    back.dataset.autofocus = 'true';
    section.append(back, this.#portrait(cat));
    const heading = document.createElement('div');
    heading.className = 'collection-detail-heading';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'collection-eyebrow';
    eyebrow.textContent = `${cat.rarityTier} · ${ROLE_LABELS[cat.roleId]}`;
    const name = document.createElement('h2');
    name.textContent = cat.displayName;
    heading.append(eyebrow, name);
    section.append(heading);

    const status = document.createElement('p');
    status.className = 'collection-detail-status';
    const presentation = getMarketplaceStatePresentation(cat.availabilityState);
    status.append(this.#icon(presentation.iconId, presentation.label), document.createTextNode(`${presentation.label} · ${cat.assignedSlotKey === null ? 'Not assigned' : formatAssignedSlot(cat.assignedSlotKey)}`));
    status.title = presentation.description;
    section.append(status, this.#attributes(cat));

    const effect = calculateCatRoleEffect(cat);
    const skill = document.createElement('div');
    skill.className = 'collection-skill';
    const skillTitle = document.createElement('strong');
    skillTitle.append(this.#icon(SKILL_ICON_IDS[cat.roleId], effect.primarySkill), document.createTextNode(effect.primarySkill));
    const skillCopy = document.createElement('span');
    skillCopy.textContent = `Role score ${effect.roleScore}/100 · ${effect.benefitLabel}`;
    skill.append(skillTitle, skillCopy);
    section.append(skill);

    const note = document.createElement('p');
    note.className = 'collection-note';
    note.textContent = cat.availabilityState === 'Assigned'
      ? 'This cat is working in the mine. Open its mine slot to change the active cat.'
      : 'This cat is owned by you and ready to use in a compatible role.';
    section.append(note);
    return section;
  }

  #attributes(cat: CatInstance): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'collection-attributes';
    (Object.keys(ATTRIBUTE_LABELS) as Array<keyof typeof ATTRIBUTE_LABELS>).forEach((key) => {
      const item = document.createElement('div');
      item.className = 'collection-attribute';
      item.append(this.#icon(ATTRIBUTE_ICON_IDS[key], ATTRIBUTE_LABELS[key]));
      const label = document.createElement('span');
      label.textContent = ATTRIBUTE_LABELS[key];
      const value = document.createElement('strong');
      value.textContent = String(cat.attributes[key]);
      item.append(label, value);
      grid.append(item);
    });
    return grid;
  }

  #portrait(cat: CatInstance): HTMLImageElement {
    const image = document.createElement('img');
    image.className = 'collection-portrait';
    image.alt = `${cat.displayName}, ${cat.rarityTier} ${ROLE_LABELS[cat.roleId]}`;
    image.dataset.assetId = cat.assetId;
    image.src = getMarketplaceAsset(cat.assetId)?.portraitPath ?? FALLBACK_PORTRAIT;
    image.onerror = () => {
      if (!image.src.endsWith(FALLBACK_PORTRAIT)) {
        image.src = FALLBACK_PORTRAIT;
        image.dataset.fallback = 'true';
      }
    };
    return image;
  }

  #icon(iconId: string, label: string): SVGSVGElement {
    const icon = getMarketplaceIcon(iconId);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('collection-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.dataset.icon = iconId;
    svg.setAttribute('title', label);
    if (icon !== null) {
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', icon.symbolHref);
      svg.append(use);
    }
    return svg;
  }

  #button(label: string, handler: () => void, className = ''): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  #select(
    label: string,
    options: readonly string[],
    current: string,
    onChange: (value: string) => void,
  ): HTMLLabelElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'collection-filter';
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    options.forEach((option) => select.add(new Option(option, option)));
    select.value = current;
    select.addEventListener('change', () => onChange(select.value));
    wrapper.append(select);
    return wrapper;
  }
}

function formatAssignedSlot(slotKey: string): string {
  const qualified = parseMineCatSlot(slotKey);
  if (qualified === null) return slotKey;
  const local = qualified.localSlotKey;
  const roleLabel = local.startsWith('miner:')
    ? `Floor ${local.slice('miner:'.length).replace(/^floor-/, '')}`
    : local.startsWith('hauler:')
      ? `Cart ${local.slice('hauler:'.length)}`
      : local === 'elevator:main' ? 'Elevator' : 'Warehouse';
  return `${getMineSite(qualified.mineId).name} · ${roleLabel}`;
}
