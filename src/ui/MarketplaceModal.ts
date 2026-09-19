import {
  getMarketplaceAsset,
  type MarketplaceAssetRecord,
} from './marketplaceAssetRegistry';
import { getMarketplaceIcon } from './marketplaceIconRegistry';

type RoleFilter = 'All roles' | 'Elevator' | 'Warehouse' | 'Miner';
type RarityFilter = 'All rarities' | 'N' | 'R' | 'SR' | 'SSR' | 'UR';
type AttributeKey = 'power' | 'speed' | 'capacity' | 'efficiency';
type AvailabilityState = 'Listed';

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
  readonly availability: AvailabilityState;
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

type MarketTab = 'Buy' | 'Rent' | 'My listings';
const MARKET_TABS: readonly MarketTab[] = ['Buy', 'Rent', 'My listings'];

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
 * UI preview only: listings and drafts never enter authoritative game state.
 *
 * Every listing rendered here — `cat.name`, `cat.role`, `cat.rarity` — comes
 * from the module-level `CATS` constant today, but this screen exists because
 * the server milestone eventually replaces that constant with other players'
 * data. Built with `createElement`/`textContent` throughout, the same
 * discipline `MineShaftUpgradeModal` already uses, so that day does not
 * require rewriting a screen full of `innerHTML` template strings into a
 * stored-XSS sink's fix.
 */
export class MarketplaceModal {
  readonly #dialog = document.createElement('dialog');
  #tab: MarketTab = 'Buy';
  #role: RoleFilter = 'All roles';
  #rarity: RarityFilter = 'All rarities';
  #search = '';
  #sort: SortOption = 'Featured';
  #drafts: string[] = [];
  #returnFocus: HTMLElement | null = null;
  #destroyed = false;
  readonly #onClose: () => void;

  public constructor(parent: HTMLElement, onClose: () => void) {
    this.#onClose = onClose;
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
    preview.textContent = 'Preview';
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
    note.textContent = 'Sample listings · Gold prices · No live trading yet';

    const tabs = document.createElement('nav');
    tabs.className = 'market-tabs';
    tabs.setAttribute('aria-label', 'Marketplace sections');
    let activeTabButton: HTMLButtonElement | null = null;
    for (const tab of MARKET_TABS) {
      const button = this.#button(tab, () => {
        this.#tab = tab;
        this.#render();
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
  }

  #renderListings(body: HTMLElement): void {
    const heading = document.createElement('h2');
    heading.textContent = 'Your trading corner';
    const note = document.createElement('p');
    note.className = 'market-note';
    note.textContent = 'Prepare a sale or hourly rental. Drafts last until this page reloads.';
    const create = this.#button('+ Create listing', () => this.#createListing(), 'market-primary');
    body.append(heading, note, create);

    if (!this.#drafts.length) {
      const empty = document.createElement('div');
      empty.className = 'market-empty';
      const hint = document.createElement('span');
      hint.textContent = 'Your saved drafts will appear here.';
      empty.append('No listings yet', hint);
      body.append(empty);
    }

    this.#drafts.forEach((draft, index) => {
      const row = document.createElement('article');
      row.className = 'market-draft';
      const text = document.createElement('p');
      text.textContent = draft;
      const remove = this.#button('Remove', () => {
        this.#drafts.splice(index, 1);
        this.#render();
      });
      row.append(text, remove);
      body.append(row);
    });
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

  #results(body: HTMLElement): void {
    const rental = this.#tab === 'Rent';
    const price = (cat: CatListing): number => (rental ? cat.hourly : cat.price);
    const cats = CATS.filter(
      (cat) =>
        (this.#role === 'All roles' || cat.role === this.#role) &&
        (this.#rarity === 'All rarities' || cat.rarity === this.#rarity) &&
        cat.name.toLowerCase().includes(this.#search.trim().toLowerCase()),
    );
    if (this.#sort !== 'Featured') {
      const direction = this.#sort === 'Price: low' ? 1 : -1;
      cats.sort((a, b) => (price(a) - price(b)) * direction);
    }

    const summary = rental ? ' · Rent for 1–24 hours' : ' · Find a keeper';
    body.querySelector('.market-results')!.textContent = `${cats.length} cats available${summary}`;

    const grid = body.querySelector<HTMLElement>('.market-grid')!;
    grid.replaceChildren();
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
    availability.append(
      this.#icon('state-listed', 'Listed'),
      document.createTextNode(cat.availability),
    );
    const priceLine = document.createElement('strong');
    priceLine.className = 'market-price';
    const priceUnit = document.createElement('small');
    priceUnit.textContent = rental ? '/ hr' : 'gold';
    priceLine.append(`● ${price.toLocaleString('en-US')} `, priceUnit);
    info.append(name, role, this.#statGrid(cat, true), priceLine, availability);

    card.append(portrait, info);
    card.append(this.#button(rental ? 'Rent cat' : 'View cat', () => this.#details(cat, rental)));
    return card;
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
      : 'A new face for your mining crew.';
    detail.append(this.#portraitImage(cat), eyebrow, name, description);
    main.append(detail);

    const availability = document.createElement('p');
    availability.className = 'market-detail-availability';
    availability.append(
      this.#icon('state-listed', 'Listed'),
      document.createTextNode(`Availability: ${cat.availability}`),
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
      const amount = (rental ? cat.hourly * hours : cat.price).toLocaleString('en-US');
      total.textContent = `Total: ${amount} gold${rental ? ` for ${hours} hr` : ''}`;
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
    note.textContent = 'Preview only. Ownership, role bonuses and live transactions are not available yet.';
    const disabled = document.createElement('button');
    disabled.type = 'button';
    disabled.className = 'market-primary';
    disabled.textContent = 'Trading coming soon';
    disabled.disabled = true;
    main.append(note, disabled);

    back.focus();
  }

  #createListing(): void {
    const main = this.#shell();
    const back = this.#button('← My listings', () => this.#render());
    main.append(back);

    const heading = document.createElement('h2');
    heading.textContent = 'Create a listing';
    const note = document.createElement('p');
    note.className = 'market-note';
    note.textContent = 'Try a draft with a sample cat. Publishing will require a cat you own.';

    const form = document.createElement('form');
    form.className = 'market-form';

    const catLabel = document.createElement('label');
    const catSelect = document.createElement('select');
    catSelect.name = 'cat';
    CATS.forEach((cat) => catSelect.add(new Option(`${cat.name} · ${cat.role} · ${cat.rarity}`, cat.name)));
    catLabel.append('Sample cat', catSelect);

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
    submit.textContent = 'Save draft';

    form.append(catLabel, typeLabel, priceLabel, submit);
    main.append(heading, note, form);

    form.onsubmit = (event) => {
      event.preventDefault();
      if (!form.reportValidity()) {
        return;
      }
      const data = new FormData(form);
      const type = data.get('type');
      const price = Number(data.get('price')).toLocaleString('en-US');
      const suffix = type === 'Hourly rental' ? '/hr' : '';
      this.#drafts.push(`${data.get('cat')} · ${type} · ${price} gold${suffix} · Draft`);
      this.#tab = 'My listings';
      this.#render();
    };

    back.focus();
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
