import type {
  MineShaftUpgradeModalViewModel,
  MineShaftUpgradeOptionViewModel,
  PurchaseOutcome,
  UpgradeTarget,
} from '../game/view-model';

export interface MineShaftUpgradeModalOptions {
  readonly parent: HTMLElement;
  readonly onUpgrade: (target: UpgradeTarget, quantity: number) => PurchaseOutcome;
  readonly onClose?: () => void;
}

export interface RenderedMineShaftUpgradeModalState {
  readonly isVisible: boolean;
  readonly target: UpgradeTarget | null;
  readonly title: string;
  readonly levelLabel: string;
  readonly attributes: readonly { readonly label: string; readonly value: string }[];
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly quantity: number;
    readonly costLabel: string;
    readonly isEnabled: boolean;
  }[];
  readonly feedbackLabel: string;
}

export class MineShaftUpgradeModal {
  readonly #backdrop: HTMLDivElement;
  readonly #dialog: HTMLElement;
  readonly #title: HTMLHeadingElement;
  readonly #level: HTMLParagraphElement;
  readonly #attributes: HTMLDListElement;
  readonly #feedback: HTMLParagraphElement;
  readonly #buttons: readonly HTMLButtonElement[];
  readonly #onUpgrade: MineShaftUpgradeModalOptions['onUpgrade'];
  readonly #onClose: () => void;
  #model: MineShaftUpgradeModalViewModel | null = null;

  public constructor(options: MineShaftUpgradeModalOptions) {
    this.#onUpgrade = options.onUpgrade;
    this.#onClose = options.onClose ?? (() => undefined);
    this.#backdrop = document.createElement('div');
    this.#backdrop.className = 'mine-upgrade-backdrop';
    this.#backdrop.dataset.testid = 'mine-upgrade-modal';
    this.#backdrop.hidden = true;
    this.#backdrop.addEventListener('click', this.#handleBackdropClick);

    this.#dialog = document.createElement('section');
    this.#dialog.className = 'mine-upgrade-dialog';
    this.#dialog.setAttribute('aria-labelledby', 'mine-upgrade-title');
    this.#dialog.setAttribute('aria-modal', 'true');
    this.#dialog.setAttribute('role', 'dialog');

    const heading = document.createElement('div');
    heading.className = 'mine-upgrade-heading';
    this.#title = document.createElement('h1');
    this.#title.id = 'mine-upgrade-title';
    this.#level = document.createElement('p');
    this.#level.className = 'mine-upgrade-level';
    const close = document.createElement('button');
    close.className = 'mine-upgrade-close';
    close.dataset.testid = 'mine-upgrade-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close upgrade details');
    close.textContent = '×';
    close.addEventListener('click', this.close);
    heading.append(this.#title, this.#level, close);

    this.#attributes = document.createElement('dl');
    this.#attributes.className = 'mine-upgrade-attributes';
    this.#feedback = document.createElement('p');
    this.#feedback.className = 'mine-upgrade-feedback';
    this.#feedback.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'mine-upgrade-actions';
    this.#buttons = ['x1', 'x5', 'max'].map((id) => {
      const button = document.createElement('button');
      button.className = 'mine-upgrade-action';
      button.dataset.testid = `mine-upgrade-${id}`;
      button.type = 'button';
      button.addEventListener('click', () => this.#handleUpgrade(id));
      actions.append(button);

      return button;
    });

    this.#dialog.append(heading, this.#attributes, this.#feedback, actions);
    this.#backdrop.append(this.#dialog);
    options.parent.append(this.#backdrop);
  }

  public get isVisible(): boolean {
    return !this.#backdrop.hidden;
  }

  public open(model: MineShaftUpgradeModalViewModel): void {
    this.#model = model;
    this.#feedback.textContent = '';
    this.#backdrop.hidden = false;
    this.#render();
    this.#buttons.find((button) => !button.disabled)?.focus();
  }

  public applySnapshot(model: MineShaftUpgradeModalViewModel): void {
    this.#model = model;
    this.#render();
  }

  public close = (): void => {
    if (this.#backdrop.hidden) {
      return;
    }

    this.#backdrop.hidden = true;
    this.#model = null;
    this.#feedback.textContent = '';
    this.#onClose();
  };

  public destroy(): void {
    this.#backdrop.removeEventListener('click', this.#handleBackdropClick);
    document.removeEventListener('keydown', this.#handleKeyDown);
    this.#backdrop.remove();
  }

  public describeRenderedState(): RenderedMineShaftUpgradeModalState {
    return {
      isVisible: this.isVisible,
      target: this.#model?.target ?? null,
      title: this.#model?.title ?? '',
      levelLabel: this.#model?.levelLabel ?? '',
      attributes: this.#model?.attributes ?? [],
      options: this.#model?.options ?? [],
      feedbackLabel: this.#feedback.textContent ?? '',
    };
  }

  readonly #handleBackdropClick = (event: MouseEvent): void => {
    if (event.target === this.#backdrop) {
      this.close();
    }
  };

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isVisible) {
      this.close();
    }
  };

  #handleUpgrade(id: string): void {
    const model = this.#model;
    const option = model?.options.find((candidate) => candidate.id === id);

    if (model === null || option === undefined || !option.isEnabled) {
      return;
    }

    const outcome = this.#onUpgrade(model.target, option.quantity);
    this.#feedback.textContent = describeOutcome(outcome, option);
  }

  #render(): void {
    const model = this.#model;

    if (model === null) {
      return;
    }

    this.#title.textContent = model.title;
    this.#level.textContent = model.levelLabel;
    this.#attributes.replaceChildren(...model.attributes.flatMap((attribute) => {
      const term = document.createElement('dt');
      term.textContent = attribute.label;
      const value = document.createElement('dd');
      value.textContent = attribute.value;

      return [term, value];
    }));
    this.#buttons.forEach((button, index) => {
      const option = model.options[index];
      button.disabled = !option.isEnabled;
      button.replaceChildren(
        createActionLine('mine-upgrade-action-label', option.label),
        createActionLine('mine-upgrade-action-cost', option.costLabel),
      );
    });
    document.addEventListener('keydown', this.#handleKeyDown);
  }
}

function createActionLine(className: string, text: string): HTMLSpanElement {
  const line = document.createElement('span');
  line.className = className;
  line.textContent = text;

  return line;
}

function describeOutcome(
  outcome: PurchaseOutcome,
  option: MineShaftUpgradeOptionViewModel,
): string {
  switch (outcome) {
    case 'purchased':
      return `Upgraded ${option.label}`;
    case 'insufficient-funds':
      return 'Need more gold';
    default:
      return 'Unavailable';
  }
}
