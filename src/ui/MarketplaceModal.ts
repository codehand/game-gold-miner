import {
  getMarketplaceAsset,
  type MarketplaceAssetRecord,
} from './marketplaceAssetRegistry';
import { getMarketplaceIcon } from './marketplaceIconRegistry';
import {
  getMarketplaceStatePresentation,
  type MarketplaceAvailabilityState,
} from './marketplaceStatePresentation';
import type { CatRosterState } from '../core';
import type {
  MarketplaceCommandResult,
  MarketplaceListingRecord,
  MarketplaceListingType,
  MarketplaceListingsResult,
} from '../platform/web/marketplace';

type RoleFilter = 'All roles' | 'Elevator' | 'Warehouse' | 'Miner';
type RarityFilter = 'All rarities' | 'N' | 'R' | 'SR' | 'SSR' | 'UR';
type AttributeKey = 'power' | 'speed' | 'capacity' | 'efficiency';

interface CatListing {
  readonly assetId: MarketplaceAssetRecord['assetId'];
  readonly name: string;
  readonly role: Exclude<RoleFilter, 'All roles'>;
  readonly rarity: Exclude<RarityFilter, 'All rarities'>;
  readonly price: number;
  readonly hourly: number;
  readonly level: number;
  readonly attributes: Readonly<Record<AttributeKey, number>>;
  readonly roleScore: number;
  readonly primarySkill: string;
  readonly skillBonusPercent: number;
  readonly availability: MarketplaceAvailabilityState;
  readonly listingId?: string;
  readonly listingType?: MarketplaceListingType;
  readonly sellerDisplayName?: string | null;
  readonly status?: MarketplaceListingRecord['status'];
  readonly completedAt?: string | null;
}

export type MarketplacePurchaseResult =
  | { readonly kind: 'applied' }
  | { readonly kind: 'rejected'; readonly code: string }
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface MarketplaceModalOptions {
  readonly onPurchase?: (assetId: string) => Promise<MarketplacePurchaseResult>;
  readonly getWalletGold?: () => string | null;
  readonly onViewCollection?: () => void;
  readonly getCollection?: () => CatRosterState;
  readonly loadListings?: (
    listingType: MarketplaceListingType | null,
    mineOnly: boolean,
  ) => Promise<MarketplaceListingsResult>;
  readonly onCreateListing?: (command: {
    readonly catInstanceId: string;
    readonly listingType: MarketplaceListingType;
    readonly priceExact: string;
  }) => Promise<MarketplaceCommandResult>;
  readonly onCancelListing?: (listingId: string) => Promise<MarketplaceCommandResult>;
  readonly onBuyListing?: (listingId: string) => Promise<MarketplaceCommandResult>;
  readonly onRentListing?: (listingId: string, durationHours: number) => Promise<MarketplaceCommandResult>;
}

const ROLE_LABELS = {
  elevator: 'Elevator',
  warehouse: 'Warehouse',
  miner: 'Miner',
} as const satisfies Record<MarketplaceAssetRecord['roleId'], Exclude<RoleFilter, 'All roles'>>;

const ROLE_SKILLS = {
  elevator: 'Lift Mastery',
  warehouse: 'Storage Mastery',
  miner: 'Mining Mastery',
} as const;

const ROLE_ICON_IDS = {
  elevator: 'role-elevator',
  warehouse: 'role-warehouse',
  miner: 'role-miner',
} as const;

const SKILL_ICON_IDS = {
  elevator: 'skill-lift-mastery',
  warehouse: 'skill-storage-mastery',
  miner: 'skill-mining-mastery',
} as const;

const ATTRIBUTE_LABELS: Readonly<Record<AttributeKey, string>> = {
  power: 'Power',
  speed: 'Speed',
  capacity: 'Capacity',
  efficiency: 'Efficiency',
};

const ATTRIBUTE_ICON_IDS: Readonly<Record<AttributeKey, string>> = {
  power: 'attribute-power',
  speed: 'attribute-speed',
  capacity: 'attribute-capacity',
  efficiency: 'attribute-efficiency',
};

const MARKETPLACE_FALLBACK_PORTRAIT = '/assets/placeholder/miner-cat.png';

function formatPurchaseError(code: string): string {
  switch (code) {
    case 'insufficient_funds':
      return 'you do not have enough gold.';
    case 'wallet_unavailable':
      return 'your wallet is not ready.';
    case 'unknown_asset':
      return 'this cat is no longer listed.';
    case 'unauthenticated':
      return 'sign in again and retry.';
    default:
      return 'the server did not accept the request.';
  }
}

const PREVIEW_FIXTURES = [
  {
    assetId: 'elevator-cargo-cat:SSR:mofy:idle',
    price: 24000,
    hourly: 240,
    level: 8,
    attributes: { power: 74, speed: 91, capacity: 80, efficiency: 83 },
    roleScore: 81,
    skillBonusPercent: 25,
  },
  {
    assetId: 'warehouse-manager:SR:baron:idle',
    price: 12000,
    hourly: 120,
    level: 6,
    attributes: { power: 85, speed: 65, capacity: 90, efficiency: 78 },
    roleScore: 79,
    skillBonusPercent: 24,
  },
  {
    assetId: 'elevator-cargo-cat:SSR:elon:idle',
    price: 28000,
    hourly: 280,
    level: 9,
    attributes: { power: 68, speed: 87, capacity: 84, efficiency: 79 },
    roleScore: 78,
    skillBonusPercent: 24,
  },
  {
    assetId: 'warehouse-manager:SR:cipher:idle',
    price: 16000,
    hourly: 160,
    level: 7,
    attributes: { power: 62, speed: 84, capacity: 76, efficiency: 88 },
    roleScore: 78,
    skillBonusPercent: 24,
  },
  {
    assetId: 'elevator-cargo-cat:SSR:win:idle',
    price: 32000,
    hourly: 320,
    level: 10,
    attributes: { power: 78, speed: 92, capacity: 88, efficiency: 80 },
    roleScore: 83,
    skillBonusPercent: 25,
  },
  {
    assetId: 'warehouse-manager:SR:gauge:idle',
    price: 14500,
    hourly: 145,
    level: 7,
    attributes: { power: 72, speed: 70, capacity: 87, efficiency: 73 },
    roleScore: 77,
    skillBonusPercent: 24,
  },
  {
    assetId: 'warehouse-manager:SSR:nautilus:idle',
    price: 30000,
    hourly: 300,
    level: 11,
    attributes: { power: 80, speed: 78, capacity: 93, efficiency: 90 },
    roleScore: 84,
    skillBonusPercent: 25,
  },
  {
    assetId: 'miner:N:mica:idle',
    price: 8500,
    hourly: 85,
    level: 4,
    attributes: { power: 68, speed: 64, capacity: 58, efficiency: 70 },
    roleScore: 67,
    skillBonusPercent: 17,
  },
  {
    assetId: 'miner:SSR:forge:idle',
    price: 36000,
    hourly: 360,
    level: 12,
    attributes: { power: 92, speed: 79, capacity: 72, efficiency: 86 },
    roleScore: 85,
    skillBonusPercent: 21,
  },
] as const;

const CATS: readonly CatListing[] = PREVIEW_FIXTURES.map((fixture) => {
  const asset = getMarketplaceAsset(fixture.assetId);
  if (!asset) {
    throw new Error(`Missing Marketplace preview asset: ${fixture.assetId}`);
  }
  return {
    ...fixture,
    name: asset.characterName,
    role: ROLE_LABELS[asset.roleId],
    rarity: asset.rarityTier,
    primarySkill: ROLE_SKILLS[asset.roleId],
    availability: 'Listed',
  };
});

type MarketTab = 'Buy' | 'Rent' | 'Sell' | 'My listings';
const MARKET_TABS: readonly MarketTab[] = ['Buy', 'Rent', 'Sell', 'My listings'];

const ROLE_FILTERS: readonly RoleFilter[] = [
  'All roles',
  'Elevator',
  'Warehouse',
  'Miner',
];

const RARITY_FILTERS: readonly RarityFilter[] = ['All rarities', 'N', 'R', 'SR', 'SSR', 'UR'];

type SortOption = 'Featured' | 'Price: low' | 'Price: high';
const SORT_OPTIONS: readonly SortOption[] = ['Featured', 'Price: low', 'Price: high'];

/**
 * Buy keeps the nine deterministic catalog contracts. Rent, Sell, and My
 * listings are server projections, so transaction state and ownership never
 * come from a local draft or a client-only fixture.
 */
export class MarketplaceModal {
  readonly #dialog = document.createElement('dialog');
  #tab: MarketTab = 'Buy';
  #role: RoleFilter = 'All roles';
  #rarity: RarityFilter = 'All rarities';
  #search = '';
  #sort: SortOption = 'Featured';
  #listings: readonly MarketplaceListingRecord[] = [];
  #listingLoadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  #listingError = '';
  #listingLoadToken = 0;
  #listingActionId: string | null = null;
  #listingActionState: 'idle' | 'pending' | 'success' | 'error' = 'idle';
  #listingActionError = '';
  #rentalHours = 1;
  #rentalPriceButton: HTMLButtonElement | null = null;
  #returnFocus: HTMLElement | null = null;
  #destroyed = false;
  readonly #onClose: () => void;
  readonly #onPurchase: ((assetId: string) => Promise<MarketplacePurchaseResult>) | null;
  readonly #getWalletGold: (() => string | null) | null;
  readonly #onViewCollection: (() => void) | null;
  readonly #getCollection: (() => CatRosterState) | null;
  readonly #loadListings: MarketplaceModalOptions['loadListings'] | null;
  readonly #onCreateListing: MarketplaceModalOptions['onCreateListing'] | null;
  readonly #onCancelListing: MarketplaceModalOptions['onCancelListing'] | null;
  readonly #onBuyListing: MarketplaceModalOptions['onBuyListing'] | null;
  readonly #onRentListing: MarketplaceModalOptions['onRentListing'] | null;
  #purchaseState: 'idle' | 'confirming' | 'pending' | 'success' | 'error' = 'idle';
  #purchaseAssetId: string | null = null;
  #purchaseError = '';

  public constructor(parent: HTMLElement, onClose: () => void, options: MarketplaceModalOptions = {}) {
    this.#onClose = onClose;
    this.#onPurchase = options.onPurchase ?? null;
    this.#getWalletGold = options.getWalletGold ?? null;
    this.#onViewCollection = options.onViewCollection ?? null;
    this.#getCollection = options.getCollection ?? null;
    this.#loadListings = options.loadListings ?? null;
    this.#onCreateListing = options.onCreateListing ?? null;
    this.#onCancelListing = options.onCancelListing ?? null;
    this.#onBuyListing = options.onBuyListing ?? null;
    this.#onRentListing = options.onRentListing ?? null;
    this.#dialog.className = 'marketplace';
    this.#dialog.setAttribute('aria-label', 'Marketplace');
    parent.append(this.#dialog);
    // The native `close` event is the only place `#onClose` is invoked: every
    // dismissal path — the header button, the backdrop, Escape, `destroy` —
    // ends in `dialog.close()`, so the callback fires exactly once per close
    // and never at all for a dialog that was never opened. `#destroyed`
    // guards the one path where that is not quite true: `close()` queues its
    // `close` event as a task, so `destroy()`'s synchronous
    // `this.#dialog.remove()` runs first, and the event still fires
    // afterward — re-enabling input and bumping the close count on a
    // shutting-down scene, and focusing a detached element — unless this
    // flag short-circuits it.
    this.#dialog.addEventListener('close', () => {
      if (this.#destroyed) {
        return;
      }
      this.#onClose();
      this.#returnFocus?.focus();
    });
    this.#dialog.addEventListener('click', (event) => {
      if (event.target !== this.#dialog) {
        return;
      }
      const box = this.#dialog.getBoundingClientRect();
      const isOutsideDialog =
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom;
      if (isOutsideDialog) {
        this.#close();
      }
    });
  }

  public open(): void {
    if (this.#dialog.open) {
      return;
    }
    this.#returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.#render();
    this.#dialog.showModal();
  }

  #close(): void {
    this.#dialog.close();
  }

  public destroy(): void {
    this.#destroyed = true;
    this.#close();
    this.#dialog.remove();
  }

  #shell(): HTMLElement {
    this.#dialog.replaceChildren();

    const header = document.createElement('header');
    header.className = 'market-header';

    const titleGroup = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'market-eyebrow';
    eyebrow.textContent = 'THE CAT EXCHANGE';
    const title = document.createElement('h1');
    title.append('Marketplace', this.#preview());
    titleGroup.append(eyebrow, title);

    const close = this.#button('×', () => this.#close());
    close.className = 'market-close';
    close.setAttribute('aria-label', 'Close marketplace');
    header.append(titleGroup, close);

    const main = document.createElement('main');
    main.className = 'market-content';
    this.#dialog.append(header, main);
    return main;
  }

  #preview(): HTMLSpanElement {
    const preview = document.createElement('span');
    preview.className = 'market-preview';
    preview.textContent = 'All trading live';
    return preview;
  }

  #icon(iconId: string, label: string): SVGSVGElement {
    const icon = getMarketplaceIcon(iconId);
    if (!icon) {
      throw new Error(`Missing Marketplace icon: ${iconId}`);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('market-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.dataset.icon = icon.id;
    svg.setAttribute('title', label);
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', icon.symbolHref);
    svg.append(use);
    return svg;
  }

  #statGrid(cat: CatListing, compact = false): HTMLElement {
    const grid = document.createElement('div');
    grid.className = compact ? 'market-stat-strip' : 'market-stat-grid';
    for (const key of Object.keys(ATTRIBUTE_LABELS) as AttributeKey[]) {
      const stat = document.createElement('span');
      stat.className = 'market-stat';
      stat.title = ATTRIBUTE_LABELS[key];
      stat.append(
        this.#icon(ATTRIBUTE_ICON_IDS[key], ATTRIBUTE_LABELS[key]),
        document.createTextNode(compact ? String(cat.attributes[key]) : `${ATTRIBUTE_LABELS[key]} ${cat.attributes[key]}`),
      );
      grid.append(stat);
    }
    return grid;
  }

  #render(): void {
    const main = this.#shell();

    const intro = document.createElement('div');
    intro.className = 'market-intro';
    const introText = document.createElement('span');
    const introHighlight = document.createElement('strong');
    introHighlight.textContent = 'purrfect teammate.';
    introText.append('Find your next', document.createElement('br'), introHighlight);
    const introImage = document.createElement('img');
    introImage.src = '/assets/marketplace/mofy.png';
    introImage.alt = '';
    intro.append(introText, introImage);

    const note = document.createElement('p');
    note.className = 'market-note';
    note.textContent = 'Seeded catalog · Rent and Sell use player listings · My listings is server-backed';

    const tabs = document.createElement('nav');
    tabs.className = 'market-tabs';
    tabs.setAttribute('aria-label', 'Marketplace sections');
    let activeTabButton: HTMLButtonElement | null = null;
    for (const tab of MARKET_TABS) {
      const button = this.#button(tab, () => {
        this.#selectTab(tab);
      });
      button.setAttribute('aria-pressed', String(this.#tab === tab));
      if (this.#tab === tab) {
        activeTabButton = button;
      }
      tabs.append(button);
    }

    const body = document.createElement('div');
    body.className = 'market-body';
    main.append(intro, note, tabs, body);

    if (this.#tab === 'My listings') {
      this.#renderListings(body);
    } else {
      this.#renderBrowse(body);
    }

    // Every path into `#render()` tears down and rebuilds the whole dialog
    // body, destroying whatever previously held keyboard focus — the tab
    // button just pressed, or the one that fired "Clear filters", "Back to
    // cats", "Save draft", or "Remove", each of which lands back here.
    // Refocusing the freshly rendered active tab keeps keyboard and
    // screen-reader users where they were, instead of the dialog falling
    // back to <body> and forcing them to tab back down from the header.
    activeTabButton?.focus();

    if (this.#tab !== 'Buy' && this.#listingLoadState === 'idle') {
      void this.#loadCurrentListings();
    }
  }

  #selectTab(tab: MarketTab): void {
    this.#tab = tab;
    this.#listingLoadToken += 1;
    this.#listingLoadState = tab === 'Buy' || tab === 'Sell' ? 'idle' : 'idle';
    this.#listingError = '';
    this.#render();
  }

  #renderListings(body: HTMLElement): void {
    const heading = document.createElement('h2');
    heading.textContent = 'Your trading corner';
    const note = document.createElement('p');
    note.className = 'market-note';
    note.textContent = 'Create a fixed-price sale or hourly rental from an idle cat you own.';
    const create = this.#button('+ Create listing', () => this.#createListing(), 'market-primary');
    body.append(heading, note, create);

    if (this.#listingLoadState === 'loading') {
      const loading = document.createElement('p');
      loading.className = 'market-note';
      loading.textContent = 'Loading your listings…';
      body.append(loading);
      return;
    }
    if (this.#listingLoadState === 'error') {
      const error = document.createElement('p');
      error.className = 'market-note';
      error.textContent = this.#listingError || 'Your listings are unavailable.';
      body.append(error, this.#button('Retry', () => {
        this.#listingLoadState = 'idle';
        this.#render();
      }, 'market-primary'));
      return;
    }

    if (!this.#listings.length) {
      const empty = document.createElement('div');
      empty.className = 'market-empty';
      const hint = document.createElement('span');
      hint.textContent = 'Published listings and completed trades will appear here.';
      empty.append('No listings yet', hint);
      body.append(empty);
    }

    for (const listing of this.#listings) {
      body.append(this.#listingRow(listing));
    }
  }

  #renderBrowse(body: HTMLElement): void {
    const searchLabel = document.createElement('label');
    searchLabel.className = 'market-search';
    const searchHint = document.createElement('span');
    searchHint.className = 'sr-only';
    searchHint.textContent = 'Search cats';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search for a cat…';
    search.setAttribute('aria-label', 'Search cats');
    search.value = this.#search;
    search.oninput = () => {
      this.#search = search.value;
      this.#results(body);
    };
    searchLabel.append(searchHint, search);

    const filters = document.createElement('div');
    filters.className = 'market-filters';
    filters.append(
      this.#select('Role', ROLE_FILTERS, this.#role, (value) => {
        this.#role = value;
        this.#results(body);
      }),
      this.#select('Rarity', RARITY_FILTERS, this.#rarity, (value) => {
        this.#rarity = value;
        this.#results(body);
      }),
      this.#select('Sort', SORT_OPTIONS, this.#sort, (value) => {
        this.#sort = value;
        this.#results(body);
      }),
    );

    const results = document.createElement('div');
    results.className = 'market-results';
    results.setAttribute('aria-live', 'polite');

    const grid = document.createElement('div');
    grid.className = 'market-grid';

    body.append(searchLabel, filters, results, grid);
    this.#results(body);
  }

  #listingRow(listing: MarketplaceListingRecord): HTMLElement {
    const row = document.createElement('article');
    row.className = 'market-draft market-listing-row';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${listing.cat.displayName} · ${listing.listingType === 'rent' ? 'Hourly rental' : 'For sale'}`;
    const meta = document.createElement('p');
    meta.textContent = `${formatGold(listing.priceExact)} gold${listing.listingType === 'rent' ? '/hr' : ''} · ${listing.status}`;
    text.append(title, meta);
    row.append(text);

    if (listing.status === 'Active' && this.#onCancelListing !== null) {
      const cancel = this.#button(
        this.#listingActionId === listing.listingId && this.#listingActionState === 'pending' ? 'Cancelling…' : 'Cancel',
        () => void this.#cancelListing(listing),
      );
      cancel.disabled = this.#listingActionId === listing.listingId && this.#listingActionState === 'pending';
      row.append(cancel);
    }
    if (this.#listingActionId === listing.listingId && this.#listingActionState === 'error') {
      const error = document.createElement('p');
      error.className = 'market-note';
      error.textContent = this.#listingActionError;
      row.append(error);
    }
    return row;
  }

  #results(body: HTMLElement): void {
    const rental = this.#tab === 'Rent';
    const serverBrowse = this.#tab === 'Rent' || this.#tab === 'Sell';
    const sourceCats = serverBrowse
      ? this.#listings.filter((listing) => listing.status === 'Active').map(toCatListing)
      : [...CATS];
    const price = (cat: CatListing): number => rental ? cat.hourly : cat.price;
    const cats = sourceCats.filter(
      (cat) =>
        (this.#role === 'All roles' || cat.role === this.#role) &&
        (this.#rarity === 'All rarities' || cat.rarity === this.#rarity) &&
        cat.name.toLowerCase().includes(this.#search.trim().toLowerCase()),
    );
    if (this.#sort !== 'Featured') {
      const direction = this.#sort === 'Price: low' ? 1 : -1;
      cats.sort((a, b) => (price(a) - price(b)) * direction);
    }

    const summary = rental ? ' · Rent for 1–24 hours' : this.#tab === 'Sell' ? ' · Buy from another player' : ' · Find a keeper';
    const resultLabel = this.#listingLoadState === 'loading'
      ? 'Loading live listings…'
      : this.#listingLoadState === 'error'
        ? this.#listingError || 'Live listings unavailable.'
        : `${cats.length} cats available${summary}`;
    body.querySelector('.market-results')!.textContent = resultLabel;

    const grid = body.querySelector<HTMLElement>('.market-grid')!;
    grid.replaceChildren();
    if (this.#listingLoadState === 'loading') {
      return;
    }
    if (this.#listingLoadState === 'error') {
      grid.append(this.#button('Retry', () => {
        this.#listingLoadState = 'idle';
        this.#render();
      }, 'market-primary'));
      return;
    }
    for (const cat of cats) {
      grid.append(this.#card(cat, rental, price(cat)));
    }

    if (!cats.length) {
      const empty = document.createElement('div');
      empty.className = 'market-empty';
      empty.textContent = 'No cats match these filters.';
      empty.append(
        this.#button('Clear filters', () => {
          this.#role = 'All roles';
          this.#rarity = 'All rarities';
          this.#search = '';
          this.#render();
        }),
      );
      grid.append(empty);
    }
  }

  #card(cat: CatListing, rental: boolean, price: number): HTMLElement {
    const card = document.createElement('article');
    card.className = `market-card ${cat.rarity.toLowerCase()}`;

    const portrait = document.createElement('div');
    portrait.className = 'market-portrait';
    const rarity = document.createElement('span');
    rarity.className = 'market-rarity';
    rarity.textContent = cat.rarity;
    portrait.append(rarity, this.#portraitImage(cat));

    const info = document.createElement('div');
    info.className = 'market-card-info';
    const name = document.createElement('h2');
    name.textContent = cat.name;
    const role = document.createElement('p');
    role.className = 'market-role-line';
    role.append(
      this.#icon(ROLE_ICON_IDS[cat.role.toLowerCase() as keyof typeof ROLE_ICON_IDS], cat.role),
      document.createTextNode(`${cat.role} · Role fit ${cat.roleScore}`),
    );
    const availability = document.createElement('span');
    availability.className = 'market-availability';
    const state = getMarketplaceStatePresentation(cat.availability);
    availability.dataset.state = state.state;
    availability.title = state.description;
    availability.append(
      this.#icon(state.iconId, state.label),
      document.createTextNode(state.label),
    );
    const priceLine = document.createElement('strong');
    priceLine.className = 'market-price';
    const priceUnit = document.createElement('small');
    priceUnit.textContent = rental ? '/ hr' : 'gold';
    priceLine.append(`● ${price.toLocaleString('en-US')} `, priceUnit);
    info.append(name, role, this.#statGrid(cat, true), priceLine, availability);

    card.append(portrait, info);
    card.append(this.#button(
      rental ? 'Rent cat' : cat.listingType === 'sale' ? 'Buy cat' : 'View cat',
      () => this.#details(cat, rental),
    ));
    return card;
  }

  async #loadCurrentListings(): Promise<void> {
    if (this.#loadListings === null || this.#tab === 'Buy') {
      return;
    }
    const listingType: MarketplaceListingType | null = this.#tab === 'Rent'
      ? 'rent'
      : this.#tab === 'Sell'
        ? 'sale'
        : null;
    const mineOnly = this.#tab === 'My listings';
    const token = ++this.#listingLoadToken;
    this.#listingLoadState = 'loading';
    this.#render();
    const loadListings = this.#loadListings;
    if (loadListings === null || loadListings === undefined) {
      return;
    }
    const result = await loadListings(listingType, mineOnly);
    if (token !== this.#listingLoadToken) {
      return;
    }
    if (result.kind === 'ready') {
      this.#listings = result.listings;
      this.#listingError = '';
      this.#listingLoadState = 'ready';
    } else {
      this.#listingError = formatMarketplaceUnavailable(result.reason);
      this.#listingLoadState = 'error';
    }
    this.#render();
  }

  #portraitImage(cat: CatListing): HTMLImageElement {
    const asset = getMarketplaceAsset(cat.assetId);
    const image = document.createElement('img');
    image.src = asset?.portraitPath ?? MARKETPLACE_FALLBACK_PORTRAIT;
    image.alt = `${cat.name}, ${cat.rarity} ${cat.role}`;
    image.dataset.assetId = cat.assetId;
    if (!asset) {
      image.dataset.fallback = 'true';
    }
    image.onerror = () => {
      if (image.src.endsWith(MARKETPLACE_FALLBACK_PORTRAIT)) {
        return;
      }
      image.src = MARKETPLACE_FALLBACK_PORTRAIT;
      image.dataset.fallback = 'true';
    };
    return image;
  }

  #details(cat: CatListing, rental: boolean): void {
    const asset = getMarketplaceAsset(cat.assetId);
    if (!asset) {
      throw new Error(`Missing Marketplace detail asset: ${cat.assetId}`);
    }
    const main = this.#shell();
    const back = this.#button('← Back to cats', () => this.#render());
    main.append(back);

    const detail = document.createElement('div');
    detail.className = 'market-detail';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'market-eyebrow';
    eyebrow.textContent = `${cat.rarity} · ${cat.role}`;
    const name = document.createElement('h2');
    name.textContent = cat.name;
    const description = document.createElement('p');
    description.textContent = rental
      ? 'A helping paw, by the hour.'
      : cat.listingType === 'sale'
        ? 'A permanent specialist contract from another mine.'
        : 'A new face for your mining crew.';
    detail.append(this.#portraitImage(cat), eyebrow, name, description);
    main.append(detail);

    if (cat.sellerDisplayName !== undefined) {
      const seller = document.createElement('p');
      seller.className = 'market-note';
      seller.textContent = `Listed by ${cat.sellerDisplayName ?? 'another mine operator'}`;
      main.append(seller);
    }

    const availability = document.createElement('p');
    availability.className = 'market-detail-availability';
    const state = getMarketplaceStatePresentation(cat.availability);
    availability.dataset.state = state.state;
    availability.title = state.description;
    availability.append(
      this.#icon(state.iconId, state.label),
      document.createTextNode(`Availability: ${state.label}`),
    );
    main.append(availability, this.#statGrid(cat));

    const skill = document.createElement('div');
    skill.className = 'market-skill';
    const skillTitle = document.createElement('strong');
    skillTitle.append(
      this.#icon(SKILL_ICON_IDS[asset.roleId], cat.primarySkill),
      document.createTextNode(cat.primarySkill),
    );
    const skillValue = document.createElement('span');
    skillValue.textContent = `${cat.skillBonusPercent}% current bonus · Role fit ${cat.roleScore}/100`;
    skill.append(skillTitle, skillValue);
    main.append(skill);

    const total = document.createElement('p');
    total.className = 'market-total';
    const update = (hours: number): void => {
      this.#rentalHours = hours;
      const amount = (rental ? cat.hourly * hours : cat.price).toLocaleString('en-US');
      total.textContent = `Total: ${amount} gold${rental ? ` for ${hours} hr` : ''}`;
      if (rental && this.#rentalPriceButton !== null) {
        this.#rentalPriceButton.textContent = `Rent for ${amount} gold`;
      }
    };

    if (rental) {
      const label = document.createElement('label');
      label.className = 'market-duration';
      label.append('Rental duration');
      const hours = Array.from({ length: 24 }, (_, index) => String(index + 1));
      label.append(this.#select('Rental duration', hours, '1', (value) => update(Number(value))));
      main.append(label);
    }

    update(1);
    main.append(total);

    const note = document.createElement('p');
    note.className = 'market-note';
    if (rental) {
      note.textContent = 'Rental is server-authoritative. The owner keeps the cat and usage rights expire automatically.';
      main.append(note, this.#rentalControls(cat));
    } else if (cat.listingType === 'sale') {
      note.textContent = 'Sale is server-authoritative: the seller receives gold and the cat enters your idle Collection.';
      main.append(note, this.#saleControls(cat));
    } else {
      note.textContent = 'Buy is server-authoritative: gold is deducted once and the owned cat is added to Collection.';
      main.append(note, this.#purchaseControls(cat));
    }

    back.focus();
  }

  #purchaseControls(cat: CatListing): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'market-purchase-controls';
    const wallet = this.#getWalletGold?.();
    const isListed = cat.availability === 'Listed';
    if (wallet !== null && wallet !== undefined) {
      const walletLabel = document.createElement('p');
      walletLabel.className = 'market-note';
      walletLabel.textContent = `Wallet: ${Number(wallet).toLocaleString('en-US')} gold`;
      controls.append(walletLabel);
    }

    const state = this.#purchaseAssetId === cat.assetId ? this.#purchaseState : 'idle';
    if (this.#onPurchase === null) {
      const unavailable = document.createElement('button');
      unavailable.type = 'button';
      unavailable.className = 'market-primary';
      unavailable.textContent = 'Purchase unavailable';
      unavailable.disabled = true;
      controls.append(unavailable);
      return controls;
    }

    if (state === 'pending') {
      const pending = document.createElement('button');
      pending.type = 'button';
      pending.className = 'market-primary';
      pending.textContent = 'Buying…';
      pending.disabled = true;
      pending.setAttribute('aria-busy', 'true');
      controls.append(pending);
      return controls;
    }

    if (state === 'success') {
      const success = document.createElement('p');
      success.className = 'market-note';
      success.textContent = `${cat.name} was added to your Collection.`;
      const collection = this.#button('View collection', () => {
        this.#close();
        window.setTimeout(() => this.#onViewCollection?.(), 0);
      }, 'market-primary');
      controls.append(success, collection);
      return controls;
    }

    if (state === 'confirming') {
      controls.classList.add('market-purchase-confirming');
      const confirmation = document.createElement('p');
      confirmation.className = 'market-note';
      confirmation.textContent = isListed
        ? `Buy listed ${cat.name} for ${cat.price.toLocaleString('en-US')} gold?`
        : `Confirm purchase of ${cat.name} for ${cat.price.toLocaleString('en-US')} gold?`;
      const confirm = this.#button(
        isListed ? 'Buy listed cat' : 'Confirm purchase',
        () => void this.#purchase(cat),
        'market-primary',
      );
      const cancel = this.#button(isListed ? 'Back to cats' : 'Cancel', () => {
        this.#purchaseState = 'idle';
        if (isListed) {
          this.#render();
        } else {
          this.#renderDetailsAgain(cat);
        }
      });
      controls.append(confirmation, confirm, cancel);
      return controls;
    }

    if (state === 'error') {
      const error = document.createElement('p');
      error.className = 'market-note';
      error.textContent = this.#purchaseError;
      const retry = this.#button('Try again', () => {
        this.#purchaseState = 'idle';
        this.#renderDetailsAgain(cat);
      }, 'market-primary');
      controls.append(error, retry);
      return controls;
    }

    controls.append(this.#button(
      `Buy for ${cat.price.toLocaleString('en-US')} gold`,
      () => {
        this.#purchaseAssetId = cat.assetId;
        this.#purchaseState = 'confirming';
        this.#renderDetailsAgain(cat);
      },
      'market-primary',
    ));
    return controls;
  }

  #saleControls(cat: CatListing): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'market-purchase-controls';
    const state = this.#listingActionId === cat.listingId ? this.#listingActionState : 'idle';
    if (cat.listingId === undefined || this.#onBuyListing === null) {
      const unavailable = this.#button('Purchase unavailable', () => undefined, 'market-primary');
      unavailable.disabled = true;
      controls.append(unavailable);
      return controls;
    }
    if (state === 'pending') {
      const pending = this.#button('Buying…', () => undefined, 'market-primary');
      pending.disabled = true;
      pending.setAttribute('aria-busy', 'true');
      controls.append(pending);
      return controls;
    }
    if (state === 'success') {
      const success = document.createElement('p');
      success.className = 'market-note';
      success.textContent = `${cat.name} was added to your Collection.`;
      controls.append(success, this.#button('View collection', () => {
        this.#close();
        window.setTimeout(() => this.#onViewCollection?.(), 0);
      }, 'market-primary'));
      return controls;
    }
    if (state === 'error') {
      const error = document.createElement('p');
      error.className = 'market-note';
      error.textContent = this.#listingActionError;
      controls.append(error, this.#button('Try again', () => {
        this.#listingActionState = 'idle';
        this.#renderDetailsAgain(cat);
      }, 'market-primary'));
      return controls;
    }
    controls.append(this.#button(
      `Buy for ${formatGold(cat.price)} gold`,
      () => void this.#buyListing(cat),
      'market-primary',
    ));
    return controls;
  }

  #rentalControls(cat: CatListing): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'market-purchase-controls';
    this.#rentalPriceButton = null;
    const state = this.#listingActionId === cat.listingId ? this.#listingActionState : 'idle';
    if (cat.listingId === undefined || this.#onRentListing === null) {
      const unavailable = this.#button('Rent unavailable', () => undefined, 'market-primary');
      unavailable.disabled = true;
      controls.append(unavailable);
      return controls;
    }
    if (state === 'pending') {
      const pending = this.#button('Renting…', () => undefined, 'market-primary');
      pending.disabled = true;
      pending.setAttribute('aria-busy', 'true');
      controls.append(pending);
      return controls;
    }
    if (state === 'success') {
      const success = document.createElement('p');
      success.className = 'market-note';
      success.textContent = `${cat.name} is now available in your Collection for ${this.#rentalHours} hours.`;
      controls.append(success, this.#button('View collection', () => {
        this.#close();
        window.setTimeout(() => this.#onViewCollection?.(), 0);
      }, 'market-primary'));
      return controls;
    }
    if (state === 'error') {
      const error = document.createElement('p');
      error.className = 'market-note';
      error.textContent = this.#listingActionError;
      controls.append(error, this.#button('Try again', () => {
        this.#listingActionState = 'idle';
        this.#renderDetailsAgain(cat);
      }, 'market-primary'));
      return controls;
    }
    const submit = this.#button(
      `Rent for ${formatGold(String(cat.hourly * this.#rentalHours))} gold`,
      () => void this.#rentListing(cat),
      'market-primary',
    );
    this.#rentalPriceButton = submit;
    controls.append(submit);
    return controls;
  }

  async #buyListing(cat: CatListing): Promise<void> {
    if (this.#onBuyListing === null || cat.listingId === undefined || this.#listingActionState === 'pending') {
      return;
    }
    this.#listingActionId = cat.listingId;
    this.#listingActionState = 'pending';
    this.#renderDetailsAgain(cat);
    const buyListing = this.#onBuyListing;
    if (buyListing === null || buyListing === undefined) {
      return;
    }
    const result = await buyListing(cat.listingId).catch(() => ({ kind: 'unavailable', reason: 'offline' } as const));
    this.#applyListingCommandResult(result);
    this.#renderDetailsAgain(cat);
  }

  async #rentListing(cat: CatListing): Promise<void> {
    if (this.#onRentListing === null || cat.listingId === undefined || this.#listingActionState === 'pending') {
      return;
    }
    this.#listingActionId = cat.listingId;
    this.#listingActionState = 'pending';
    this.#renderDetailsAgain(cat);
    const rentListing = this.#onRentListing;
    if (rentListing === null || rentListing === undefined) {
      return;
    }
    const result = await rentListing(cat.listingId, this.#rentalHours)
      .catch(() => ({ kind: 'unavailable', reason: 'offline' } as const));
    this.#applyListingCommandResult(result);
    this.#renderDetailsAgain(cat);
  }

  async #cancelListing(listing: MarketplaceListingRecord): Promise<void> {
    if (this.#onCancelListing === null || this.#listingActionState === 'pending') {
      return;
    }
    this.#listingActionId = listing.listingId;
    this.#listingActionState = 'pending';
    this.#listingActionError = '';
    const cancelListing = this.#onCancelListing;
    if (cancelListing === null || cancelListing === undefined) {
      return;
    }
    const result = await cancelListing(listing.listingId)
      .catch(() => ({ kind: 'unavailable', reason: 'offline' } as const));
    this.#applyListingCommandResult(result);
    this.#listingLoadState = 'idle';
    this.#render();
  }

  #applyListingCommandResult(result: MarketplaceCommandResult): void {
    if (result.kind === 'applied') {
      this.#listingActionState = 'success';
      this.#listingActionError = '';
      this.#listings = result.listings;
      return;
    }
    this.#listingActionState = 'error';
    this.#listingActionError = result.kind === 'rejected'
      ? `Marketplace rejected the request: ${formatMarketplaceError(result.code)}`
      : `Marketplace unavailable: ${formatMarketplaceUnavailable(result.reason)}`;
  }

  #renderDetailsAgain(cat: CatListing): void {
    this.#details(cat, this.#tab === 'Rent');
  }

  async #purchase(cat: CatListing): Promise<void> {
    if (this.#onPurchase === null || this.#purchaseState === 'pending') {
      return;
    }
    this.#purchaseAssetId = cat.assetId;
    this.#purchaseState = 'pending';
    this.#renderDetailsAgain(cat);
    try {
      const result = await this.#onPurchase(cat.assetId);
      if (result.kind === 'applied') {
        this.#purchaseState = 'success';
        this.#purchaseError = '';
      } else {
        this.#purchaseState = 'error';
        this.#purchaseError = result.kind === 'rejected'
          ? `Purchase rejected: ${formatPurchaseError(result.code)}`
          : `Purchase unavailable: ${formatPurchaseError(result.reason)}`;
      }
    } catch {
      this.#purchaseState = 'error';
      this.#purchaseError = 'Purchase unavailable. Check your connection and try again.';
    }
    this.#renderDetailsAgain(cat);
  }

  #createListing(): void {
    const main = this.#shell();
    const back = this.#button('← My listings', () => this.#render());
    main.append(back);

    const heading = document.createElement('h2');
    heading.textContent = 'Create a listing';
    const note = document.createElement('p');
    note.className = 'market-note';
    note.textContent = 'Only idle cats in your Collection can be listed. Assigned, rented, and already-listed cats are unavailable.';

    const form = document.createElement('form');
    form.className = 'market-form';

    const catLabel = document.createElement('label');
    const catSelect = document.createElement('select');
    catSelect.name = 'cat';
    const ownedCats = this.#getCollection?.().cats.filter((cat) => cat.availabilityState === 'Idle' && cat.assignedSlotKey === null) ?? [];
    for (const cat of ownedCats) {
      catSelect.add(new Option(`${cat.displayName} · ${ROLE_LABELS[cat.roleId]} · ${cat.rarityTier}`, cat.catInstanceId));
    }
    catSelect.required = ownedCats.length > 0;
    catLabel.append('Cat to list', catSelect);

    const typeLabel = document.createElement('label');
    const typeSelect = document.createElement('select');
    typeSelect.name = 'type';
    typeSelect.add(new Option('For sale'));
    typeSelect.add(new Option('Hourly rental'));
    typeLabel.append('Listing type', typeSelect);

    const priceLabel = document.createElement('label');
    const priceHint = document.createElement('span');
    priceHint.textContent = '(per hour for rentals)';
    const priceInput = document.createElement('input');
    priceInput.name = 'price';
    priceInput.type = 'number';
    priceInput.min = '1';
    priceInput.max = '1000000000';
    priceInput.step = '1';
    priceInput.required = true;
    priceInput.placeholder = 'Enter price';
    priceLabel.append('Price in gold ', priceHint, priceInput);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'market-primary';
    submit.textContent = this.#onCreateListing === null ? 'Publishing unavailable' : 'Publish listing';
    submit.disabled = this.#onCreateListing === null || ownedCats.length === 0;

    form.append(catLabel, typeLabel, priceLabel, submit);
    main.append(heading, note, form);

    if (ownedCats.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'market-note';
      empty.textContent = 'You do not have an idle cat available to list yet.';
      main.append(empty);
    }

    form.onsubmit = (event) => {
      event.preventDefault();
      if (!form.reportValidity() || this.#onCreateListing === null) {
        return;
      }
      const data = new FormData(form);
      const price = String(data.get('price'));
      const listingType: MarketplaceListingType = data.get('type') === 'Hourly rental' ? 'rent' : 'sale';
      void this.#publishListing({
        catInstanceId: String(data.get('cat')),
        listingType,
        priceExact: price,
      });
    };

    back.focus();
  }

  async #publishListing(command: {
    readonly catInstanceId: string;
    readonly listingType: MarketplaceListingType;
    readonly priceExact: string;
  }): Promise<void> {
    if (this.#onCreateListing === null) {
      return;
    }
    const createListing = this.#onCreateListing;
    if (createListing === null || createListing === undefined) {
      return;
    }
    const submit = createListing(command);
    const result = await submit.catch(() => ({ kind: 'unavailable', reason: 'offline' } as const));
    this.#applyListingCommandResult(result);
    if (result.kind === 'applied') {
      this.#tab = 'My listings';
      this.#listingLoadState = 'ready';
      this.#render();
      return;
    }
    const message = document.createElement('p');
    message.className = 'market-note';
    message.textContent = this.#listingActionError;
    this.#dialog.querySelector('.market-form')?.append(message);
  }

  #button(text: string, action: () => void, className = ''): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.className = className;
    button.onclick = action;
    return button;
  }

  #select<T extends string>(
    label: string,
    values: readonly T[],
    selected: T,
    change: (value: T) => void,
  ): HTMLSelectElement {
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    values.forEach((value) => select.add(new Option(value, value, false, value === selected)));
    select.onchange = () => change(select.value as T);
    return select;
  }
}

function toCatListing(listing: MarketplaceListingRecord): CatListing {
  const role = ROLE_LABELS[listing.cat.roleId];
  const price = safeDisplayPrice(listing.priceExact);
  return {
    assetId: listing.cat.assetId as MarketplaceAssetRecord['assetId'],
    name: listing.cat.displayName,
    role,
    rarity: listing.cat.rarityTier,
    price: listing.listingType === 'sale' ? price : 0,
    hourly: listing.listingType === 'rent' ? price : 0,
    level: listing.cat.level,
    attributes: listing.cat.attributes,
    roleScore: calculateRoleScoreForDisplay(listing.cat),
    primarySkill: ROLE_SKILLS[listing.cat.roleId],
    skillBonusPercent: Math.round(calculateSkillBonusForDisplay(listing.cat) * 100),
    availability: listing.cat.availabilityState,
    listingId: listing.listingId,
    listingType: listing.listingType,
    sellerDisplayName: listing.sellerDisplayName,
    status: listing.status,
    completedAt: listing.completedAt,
  };
}

function safeDisplayPrice(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function formatGold(value: string | number): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US') : value.toString();
}

function calculateRoleScoreForDisplay(cat: MarketplaceListingRecord['cat']): number {
  const weights = cat.roleId === 'elevator'
    ? { power: 0.1, speed: 0.45, capacity: 0.3, efficiency: 0.15 }
    : cat.roleId === 'warehouse'
      ? { power: 0.1, speed: 0.25, capacity: 0.4, efficiency: 0.25 }
      : { power: 0.45, speed: 0.3, capacity: 0.05, efficiency: 0.2 };
  return Math.round(
    cat.attributes.power * weights.power +
    cat.attributes.speed * weights.speed +
    cat.attributes.capacity * weights.capacity +
    cat.attributes.efficiency * weights.efficiency,
  );
}

function calculateSkillBonusForDisplay(cat: MarketplaceListingRecord['cat']): number {
  const score = calculateRoleScoreForDisplay(cat);
  const base = cat.roleId === 'miner' ? 0 : 0.02;
  const max = cat.roleId === 'miner' ? 0.25 : 0.28;
  return base + max * score / 100;
}

function formatMarketplaceError(code: string): string {
  switch (code) {
    case 'insufficient_funds': return 'you do not have enough gold.';
    case 'listing_unavailable': return 'this listing is no longer available.';
    case 'cat_not_listable': return 'only an idle cat can be listed.';
    case 'listing_exists': return 'this cat already has an active listing.';
    case 'invalid_duration': return 'choose a rental duration from 1 to 24 hours.';
    case 'self_trade': return 'you cannot trade with your own listing.';
    case 'unknown_cat': return 'that cat is no longer in your Collection.';
    default: return 'the server did not accept the request.';
  }
}

function formatMarketplaceUnavailable(reason: string): string {
  switch (reason) {
    case 'unauthenticated': return 'sign in again and retry.';
    case 'unconfigured': return 'marketplace services are not configured.';
    case 'invalid-response': return 'the marketplace returned invalid data.';
    default: return 'check your connection and try again.';
  }
}
