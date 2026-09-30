import {
  calculateCatRoleEffect,
  compareCatForSlot,
  getAssignableCats,
  getCatForSlot,
  getRoleForSlot,
  type CatInstance,
  type CatRole,
  type CatRosterState,
  type CatSlotKey,
} from '../core';
import { getMarketplaceAsset } from './marketplaceAssetRegistry';
import { getMarketplaceIcon } from './marketplaceIconRegistry';

export interface CatAssignmentCommand {
  readonly catInstanceId: string | null;
  readonly slotKey: CatSlotKey;
  readonly expectedAssignmentRevision: number;
}

export type CatAssignmentCommandResult =
  | { readonly kind: 'applied'; readonly roster: CatRosterState }
  | { readonly kind: 'rejected'; readonly code: string }
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface CatAssignmentModalOptions {
  readonly parent: HTMLElement;
  readonly getRoster: () => CatRosterState;
  readonly getHaulerCount?: () => number;
  readonly assign: (command: CatAssignmentCommand) => Promise<CatAssignmentCommandResult>;
  readonly onClose?: () => void;
}

type AssignmentView = 'current' | 'picker';

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

/**
 * Authoritative assigned-cat surface. The modal owns only transient selection
 * and pending UI state; the roster and assignment revision come from the
 * caller, and a successful command must return a new validated projection.
 */
export class CatAssignmentModal {
  readonly #dialog = document.createElement('dialog');
  readonly #getRoster: () => CatRosterState;
  readonly #getHaulerCount: () => number;
  readonly #assign: CatAssignmentModalOptions['assign'];
  readonly #onClose: (() => void) | null;
  #slotKey: CatSlotKey | null = null;
  #view: AssignmentView = 'current';
  #selectedCatId: string | null = null;
  #pending = false;
  #message = '';
  #messageKind: 'success' | 'error' | '' = '';
  #afterClose: (() => void) | null = null;
  #returnFocus: HTMLElement | null = null;
  #destroyed = false;

  public constructor(options: CatAssignmentModalOptions) {
    this.#getRoster = options.getRoster;
    this.#getHaulerCount = options.getHaulerCount ?? (() => 1);
    this.#assign = options.assign;
    this.#onClose = options.onClose ?? null;
    this.#dialog.className = 'cat-assignment-modal';
    this.#dialog.setAttribute('aria-label', 'Assigned cat');
    options.parent.append(this.#dialog);
    this.#dialog.addEventListener('close', () => {
      if (this.#destroyed) {
        return;
      }

      this.#pending = false;
      this.#slotKey = null;
      this.#onClose?.();
      this.#returnFocus?.focus();
      this.#returnFocus = null;
      this.#afterClose?.();
      this.#afterClose = null;
    });
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog && !this.#pending) {
        this.#dialog.close();
      }
    });
  }

  public open(slotKey: CatSlotKey, afterClose?: () => void): void {
    if (this.#destroyed || this.#dialog.open) {
      return;
    }

    this.#slotKey = slotKey;
    this.#view = 'current';
    this.#selectedCatId = null;
    this.#pending = false;
    this.#message = '';
    this.#messageKind = '';
    this.#afterClose = afterClose ?? null;
    this.#returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    this.#render();
    this.#dialog.showModal();
  }

  public refresh(): void {
    if (this.#dialog.open && !this.#pending) {
      this.#render();
    }
  }

  public destroy(): void {
    this.#destroyed = true;
    if (this.#dialog.open) {
      this.#dialog.close();
    }
    this.#dialog.remove();
  }

  #render(): void {
    const slotKey = this.#slotKey;
    if (slotKey === null) {
      return;
    }

    const roster = this.#getRoster();
    const current = getCatForSlot(roster, slotKey);
    const header = document.createElement('header');
    header.className = 'cat-assignment-header';
    const titleGroup = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'collection-eyebrow';
    eyebrow.textContent = 'MINE ROLE';
    const title = document.createElement('h1');
    title.textContent = current === null && slotKey.startsWith('warehouse:')
      ? 'Assign a cat'
      : 'Current cat';
    titleGroup.append(eyebrow, title);
    const close = this.#button('×', () => this.#dialog.close(), 'collection-close');
    close.setAttribute('aria-label', 'Close assigned cat');
    close.disabled = this.#pending;
    header.append(titleGroup, close);

    const main = document.createElement('main');
    main.className = 'cat-assignment-content';
    const location = document.createElement('p');
    location.className = 'cat-assignment-location';
    location.textContent = `Slot ${slotKey}`;
    main.append(location);
    if (slotKey.startsWith('hauler:')) {
      const slots = document.createElement('nav');
      slots.className = 'cat-assignment-hauler-slots';
      slots.setAttribute('aria-label', 'Hauler carts');
      for (let index = 1; index <= this.#getHaulerCount(); index++) {
        const key = `hauler:${index}` as CatSlotKey;
        const button = this.#button(`Cart ${index}`, () => {
          this.#slotKey = key;
          this.#view = 'current';
          this.#selectedCatId = null;
          this.#message = '';
          this.#messageKind = '';
          this.#render();
        }, 'cat-assignment-back');
        button.setAttribute('aria-pressed', String(slotKey === key));
        button.disabled = this.#pending;
        slots.append(button);
      }
      main.append(slots);
    }

    if (this.#message !== '') {
      const message = document.createElement('p');
      message.className = `cat-assignment-message ${this.#messageKind}`;
      message.setAttribute('aria-live', 'polite');
      message.textContent = this.#message;
      main.append(message);
    }

    if (this.#view === 'current') {
      if (current === null) {
        main.append(this.#emptyCurrent(roster, slotKey));
      } else {
        main.append(this.#catSummary(current, 'cat-assignment-current'));
        const change = this.#button('Change cat', () => {
          this.#view = 'picker';
          this.#selectedCatId = null;
          this.#message = '';
          this.#messageKind = '';
          this.#render();
        }, 'cat-assignment-primary');
        change.dataset.autofocus = 'true';
        change.disabled = this.#pending;
        main.append(change);
        if (slotKey.startsWith('hauler:')) {
          const reset = this.#button('Use default Hauler', () => {
            void this.#applyAssignment(slotKey, null);
          }, 'cat-assignment-back');
          reset.disabled = this.#pending;
          main.append(reset);
        }
      }
    } else {
      main.append(this.#picker(roster, slotKey, current));
    }

    this.#dialog.replaceChildren(header, main);
    (this.#dialog.querySelector('[data-autofocus]') as HTMLElement | null)?.focus();
  }

  #emptyCurrent(roster: CatRosterState, slotKey: CatSlotKey): HTMLElement {
    const section = document.createElement('section');
    const role = this.#roleForSlot(slotKey);
    if (role === 'miner' || role === 'elevator' || role === 'hauler') {
      section.className = 'cat-assignment-default';
      const summary = document.createElement('div');
      summary.className = 'cat-assignment-current';
      const portrait = document.createElement('img');
      portrait.className = 'cat-assignment-portrait';
      portrait.src = role === 'miner'
        ? getMarketplaceAsset('miner:N:mica:idle')?.portraitPath ?? FALLBACK_PORTRAIT
        : role === 'hauler' ? '/assets/defaults/hauler/portrait.png'
          : '/assets/defaults/elevator/pip-portrait.png';
      portrait.alt = role === 'miner' ? 'Mica, default Miner'
        : role === 'hauler' ? 'Default Hauler with handcart' : 'Pip, default Elevator';
      const details = document.createElement('div');
      details.className = 'cat-assignment-summary-copy';
      const name = document.createElement('h2');
      name.textContent = role === 'miner' ? 'Mica' : role === 'hauler' ? 'Default Hauler' : 'Pip';
      const copy = document.createElement('p');
      copy.textContent = role === 'miner'
        ? 'Default miner · base production'
        : role === 'hauler' ? 'Handcart · base hauling'
          : 'Default elevator operator · base transport';
      const note = document.createElement('p');
      note.textContent = role === 'miner'
        ? 'Buy a Miner cat in Marketplace to change this floor.'
        : role === 'hauler' ? 'Buy a Hauler in Marketplace to upgrade this cart. One cat works on one cart.'
          : 'Buy Mofy in Marketplace to change this elevator.';
      details.append(name, copy, note);
      summary.append(portrait, details);
      section.append(summary);
    } else {
      section.className = 'cat-assignment-empty';
      const copy = document.createElement('p');
      copy.textContent = `No ${ROLE_LABELS[role]} cat is assigned to this slot.`;
      section.append(copy);
    }
    const candidateCount = getAssignableCats(roster, slotKey).length;
    const button = this.#button(
      candidateCount === 0 ? 'No compatible cats' : role === 'warehouse' ? 'Choose a cat' : 'Change cat',
      () => {
        if (candidateCount === 0) return;
        this.#view = 'picker';
        this.#render();
      },
      'cat-assignment-primary',
    );
    button.disabled = candidateCount === 0;
    button.dataset.autofocus = 'true';
    section.append(button);
    return section;
  }

  #picker(
    roster: CatRosterState,
    slotKey: CatSlotKey,
    current: CatInstance | null,
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'cat-assignment-picker';
    const heading = document.createElement('h2');
    const role = this.#roleForSlot(slotKey);
    const article = role === 'elevator' ? 'an' : 'a';
    heading.textContent = `Choose ${article} ${ROLE_LABELS[role]} cat`;
    section.append(heading);
    const back = this.#button('← Current cat', () => {
      this.#view = 'current';
      this.#selectedCatId = null;
      this.#message = '';
      this.#messageKind = '';
      this.#render();
    }, 'cat-assignment-back');
    section.append(back);

    const candidates = [...getAssignableCats(roster, slotKey)].sort((left, right) => {
      return calculateCatRoleEffect(right).roleScore - calculateCatRoleEffect(left).roleScore
        || left.displayName.localeCompare(right.displayName);
    });
    if (candidates.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'cat-assignment-empty';
      empty.textContent = 'No compatible idle cats are available.';
      section.append(empty);
      return section;
    }

    const list = document.createElement('div');
    list.className = 'cat-assignment-candidates';
    candidates.forEach((candidate) => {
      const selected = candidate.catInstanceId === this.#selectedCatId;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cat-assignment-candidate${selected ? ' selected' : ''}`;
      button.dataset.catInstanceId = candidate.catInstanceId;
      button.setAttribute('aria-pressed', String(selected));
      button.append(this.#portrait(candidate), this.#candidateCopy(candidate));
      button.addEventListener('click', () => {
        if (this.#pending) return;
        this.#selectedCatId = candidate.catInstanceId;
        this.#message = '';
        this.#messageKind = '';
        this.#render();
      });
      if (selected) button.dataset.autofocus = 'true';
      list.append(button);
    });
    section.append(list);

    const comparison = this.#selectedCatId === null
      ? null
      : compareCatForSlot(roster, slotKey, this.#selectedCatId);
    if (comparison !== null && current !== null) {
      const compare = document.createElement('div');
      compare.className = 'cat-assignment-comparison';
      const candidate = roster.cats.find((cat) => cat.catInstanceId === this.#selectedCatId);
      const candidateName = candidate?.displayName ?? 'candidate';
      const delta = comparison.skillBonusDelta;
      const sign = delta >= 0 ? '+' : '';
      compare.innerHTML = '';
      const label = document.createElement('strong');
      label.textContent = `${current.displayName} → ${candidateName}`;
      const metric = document.createElement('span');
      metric.textContent = `Role score ${comparison.currentRoleScore} → ${comparison.candidateRoleScore}`;
      const effect = document.createElement('span');
      effect.textContent = `${sign}${(delta * 100).toFixed(1)}% ${this.#metricLabel(comparison.affectedMetric)}`;
      compare.append(label, metric, effect);
      section.append(compare);
    }

    const actions = document.createElement('div');
    actions.className = 'cat-assignment-actions';
    const confirm = this.#button(
      this.#pending ? 'Changing cat…' : 'Confirm change',
      () => void this.#confirm(slotKey),
      'cat-assignment-confirm',
    );
    confirm.disabled = this.#selectedCatId === null || this.#pending;
    confirm.dataset.autofocus = 'true';
    actions.append(confirm);
    section.append(actions);
    return section;
  }

  async #confirm(slotKey: CatSlotKey): Promise<void> {
    const catInstanceId = this.#selectedCatId;
    if (catInstanceId !== null) await this.#applyAssignment(slotKey, catInstanceId);
  }

  async #applyAssignment(slotKey: CatSlotKey, catInstanceId: string | null): Promise<void> {
    if (this.#pending) return;

    const roster = this.#getRoster();
    this.#pending = true;
    this.#message = 'Waiting for the server to confirm the change…';
    this.#messageKind = '';
    this.#render();

    const result = await this.#assign({
      catInstanceId,
      slotKey,
      expectedAssignmentRevision: roster.assignmentRevision,
    });
    if (this.#destroyed) {
      return;
    }

    this.#pending = false;
    if (result.kind === 'applied') {
      this.#view = 'current';
      this.#selectedCatId = null;
      this.#message = 'Cat changed. The new assignment is saved.';
      this.#messageKind = 'success';
    } else {
      this.#message = describeAssignmentFailure(result);
      this.#messageKind = 'error';
    }
    this.#render();
  }

  #catSummary(cat: CatInstance, className: string): HTMLElement {
    const section = document.createElement('section');
    section.className = className;
    section.append(this.#portrait(cat));
    const details = document.createElement('div');
    details.className = 'cat-assignment-summary-copy';
    const name = document.createElement('h2');
    name.textContent = cat.displayName;
    const role = document.createElement('p');
    role.className = 'cat-assignment-role';
    role.append(
      this.#icon(ROLE_ICON_IDS[cat.roleId], ROLE_LABELS[cat.roleId]),
      document.createTextNode(`${ROLE_LABELS[cat.roleId]} · ${cat.rarityTier} · Lv ${cat.level}`),
    );
    const effect = calculateCatRoleEffect(cat);
    const skill = document.createElement('p');
    skill.className = 'cat-assignment-skill';
    skill.append(
      this.#icon(SKILL_ICON_IDS[cat.roleId], effect.primarySkill),
      document.createTextNode(`${effect.primarySkill} · ${effect.benefitLabel}`),
    );
    const score = document.createElement('p');
    score.className = 'cat-assignment-score';
    score.textContent = `Role score ${effect.roleScore}/100`;
    details.append(name, role, skill, score);
    section.append(details);
    return section;
  }

  #candidateCopy(cat: CatInstance): HTMLElement {
    const copy = document.createElement('span');
    copy.className = 'cat-assignment-candidate-copy';
    const name = document.createElement('strong');
    name.textContent = cat.displayName;
    const effect = calculateCatRoleEffect(cat);
    const score = document.createElement('span');
    score.textContent = `${ROLE_LABELS[cat.roleId]} · ${effect.roleScore}/100 · ${effect.benefitLabel}`;
    copy.append(name, score);
    return copy;
  }

  #portrait(cat: CatInstance): HTMLImageElement {
    const image = document.createElement('img');
    image.className = 'cat-assignment-portrait';
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

  #roleForSlot(slotKey: CatSlotKey): CatRole {
    return getRoleForSlot(slotKey)!;
  }

  #metricLabel(metric: string): string {
    return {
      'mining-output': 'mining output',
      'elevator-throughput': 'elevator throughput',
      'warehouse-processing': 'warehouse processing',
      'surface-hauling': "this cart's hauling",
    }[metric] ?? metric;
  }
}

function describeAssignmentFailure(result: Exclude<CatAssignmentCommandResult, { kind: 'applied' }>): string {
  if (result.kind === 'unavailable') {
    return result.reason === 'unauthenticated'
      ? 'Sign in again before changing an active cat.'
      : 'The change could not be confirmed. Reconnect and retry.';
  }

  const messages: Record<string, string> = {
    'stale-revision': 'This slot changed elsewhere. Refresh the collection and retry.',
    'wrong-role': 'That cat cannot work in this role.',
    'cat-not-assignable': 'That cat is not available for assignment.',
    'cat-already-assigned': 'That cat is already working in another slot.',
    'no-op': 'Choose a different cat before confirming.',
  };
  return messages[result.code] ?? 'The change was rejected. Your current cat is unchanged.';
}
