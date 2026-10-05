import type { MineSiteId } from '../../config/mineSites';
import {
  validatePortfolioSaveDocument,
  type PortfolioSaveDocumentV4,
} from '../../persistence';
import {
  type PortfolioCloudAccepted,
  type PortfolioCloudCommand,
  type PortfolioCloudGateway,
  type PortfolioCloudResult,
} from './portfolioCloudGateway';

export type PortfolioCommandAction =
  | { readonly type: 'suspend' }
  | { readonly type: 'purchase' | 'enter'; readonly mineId: MineSiteId };

export type PortfolioCommandOutcome =
  | PortfolioCloudResult<PortfolioCloudAccepted>
  | { readonly kind: 'busy' };

/** Durable upload + command transaction, including an accepted crash receipt. */
export interface PendingPortfolioCommand {
  readonly command: PortfolioCloudCommand;
  readonly sourceDocument: PortfolioSaveDocumentV4 | null;
  readonly uploadBaseRevision: number | null;
  readonly accepted: PortfolioCloudAccepted | null;
}

type CommandGateway = Pick<PortfolioCloudGateway, 'upload' | 'command'>;

/** Serializes routine progress and replayable server-owned mine commands. */
export class PortfolioCloudCommands {
  readonly #gateway: CommandGateway;
  readonly #newKey: () => string;
  readonly #persistPending: (pending: PendingPortfolioCommand | null) => Promise<void>;
  #revision: number;
  #pending: PendingPortfolioCommand | null;
  #busy = false;
  #idleWaiters: Array<() => void> = [];

  public constructor(options: {
    readonly gateway: CommandGateway;
    readonly revision: number;
    readonly newKey: () => string;
    readonly pending?: PendingPortfolioCommand | null;
    readonly persistPending?: (pending: PendingPortfolioCommand | null) => Promise<void>;
  }) {
    if (!Number.isSafeInteger(options.revision) || options.revision < 1) {
      throw new Error('A positive cloud save revision is required.');
    }
    this.#gateway = options.gateway;
    this.#revision = options.pending?.accepted?.revision ?? options.revision;
    this.#newKey = options.newKey;
    this.#pending = options.pending ?? null;
    this.#persistPending = options.persistPending ?? (async () => {});
  }

  public get revision(): number { return this.#revision; }
  public get pending(): PortfolioCloudCommand | null { return this.#pending?.command ?? null; }
  public get pendingTransaction(): PendingPortfolioCommand | null { return this.#pending; }

  public waitUntilIdle(): Promise<void> {
    if (!this.#busy) return Promise.resolve();
    return new Promise((resolve) => { this.#idleWaiters.push(resolve); });
  }

  public async syncRoutine(
    localDocument: PortfolioSaveDocumentV4,
  ): Promise<PortfolioCommandOutcome> {
    if (this.#busy || this.#pending !== null) return { kind: 'busy' };
    this.#busy = true;
    try {
      return await this.#upload(localDocument);
    } finally {
      this.#setIdle();
    }
  }

  public acceptExternalRevision(revision: number): void {
    if (this.#busy || this.#pending !== null ||
        !Number.isSafeInteger(revision) || revision <= this.#revision) {
      throw new Error('Cannot adopt an external portfolio revision.');
    }
    this.#revision = revision;
  }

  public async execute(
    action: PortfolioCommandAction,
    localDocument: PortfolioSaveDocumentV4,
  ): Promise<PortfolioCommandOutcome> {
    if (this.#busy || this.#pending !== null) return { kind: 'busy' };
    this.#busy = true;
    try {
      const pending: PendingPortfolioCommand = {
        command: this.#command(
          action,
          action.type === 'enter' ? localDocument.savedAtTimestampMs : null,
        ),
        sourceDocument: localDocument,
        uploadBaseRevision: this.#revision,
        accepted: null,
      };
      if (!await this.#stage(pending)) return { kind: 'unavailable' };
      const uploaded = await this.#uploadPending();
      if (uploaded !== null) return uploaded;
      return await this.#sendPending();
    } finally {
      this.#setIdle();
    }
  }

  /** Executes against the current receipt without first moving its time anchor. */
  public async executeAtRevision(action: PortfolioCommandAction): Promise<PortfolioCommandOutcome> {
    if (this.#busy || this.#pending !== null) return { kind: 'busy' };
    this.#busy = true;
    try {
      const pending: PendingPortfolioCommand = {
        command: this.#command(action, null),
        sourceDocument: null,
        uploadBaseRevision: null,
        accepted: null,
      };
      if (!await this.#stage(pending)) return { kind: 'unavailable' };
      return await this.#sendPending();
    } finally {
      this.#setIdle();
    }
  }

  public async retryPending(): Promise<PortfolioCommandOutcome> {
    if (this.#busy) return { kind: 'busy' };
    if (this.#pending === null) {
      return { kind: 'rejected', code: 'no_pending_command', reason: null };
    }
    this.#busy = true;
    try {
      if (this.#pending.accepted !== null) {
        return { kind: 'ok', value: this.#pending.accepted };
      }
      const uploaded = await this.#uploadPending();
      if (uploaded !== null) return uploaded;
      return await this.#sendPending();
    } finally {
      this.#setIdle();
    }
  }

  /** Clears the transaction only after its result is safely represented locally. */
  public async completePending(): Promise<boolean> {
    if (this.#busy || this.#pending === null) return this.#pending === null;
    try {
      await this.#persistPending(null);
      this.#pending = null;
      return true;
    } catch {
      return false;
    }
  }

  #command(action: PortfolioCommandAction, effectiveAtMs: number | null): PortfolioCloudCommand {
    return {
      ...action,
      ...(action.type === 'enter' && effectiveAtMs !== null ? { effectiveAtMs } : {}),
      baseRevision: this.#revision,
      idempotencyKey: this.#newKey(),
    } as PortfolioCloudCommand;
  }

  async #stage(pending: PendingPortfolioCommand): Promise<boolean> {
    try {
      await this.#persistPending(pending);
      this.#pending = pending;
      return true;
    } catch {
      return false;
    }
  }

  /** Returns null only when the source snapshot is definitely on the server. */
  async #uploadPending(): Promise<PortfolioCommandOutcome | null> {
    const pending = this.#pending;
    if (pending === null) throw new Error('No command to upload.');
    if (pending.uploadBaseRevision === null) return null;
    if (pending.sourceDocument === null) throw new Error('A pending upload needs its source document.');
    const uploaded = await this.#gateway.upload(
      pending.uploadBaseRevision,
      pending.sourceDocument,
    );
    if (uploaded.kind === 'ok') {
      if (!await this.#markUploaded(uploaded.value.revision)) return { kind: 'unavailable' };
      return null;
    }
    if (uploaded.kind === 'conflict' && uploaded.revision !== null &&
        sameDocument(uploaded.document, pending.sourceDocument)) {
      if (!await this.#markUploaded(uploaded.revision)) return { kind: 'unavailable' };
      return null;
    }
    if (uploaded.kind !== 'unavailable') await this.#discardPending();
    return uploaded;
  }

  async #markUploaded(revision: number): Promise<boolean> {
    const pending = this.#pending;
    if (pending === null) throw new Error('No pending upload.');
    const next: PendingPortfolioCommand = {
      ...pending,
      command: { ...pending.command, baseRevision: revision },
      uploadBaseRevision: null,
    };
    try {
      await this.#persistPending(next);
      this.#revision = revision;
      this.#pending = next;
      return true;
    } catch {
      return false;
    }
  }

  async #upload(document: PortfolioSaveDocumentV4): Promise<PortfolioCloudResult<PortfolioCloudAccepted>> {
    const uploaded = await this.#gateway.upload(this.#revision, document);
    if (uploaded.kind === 'ok') this.#revision = uploaded.value.revision;
    return uploaded;
  }

  async #sendPending(): Promise<PortfolioCommandOutcome> {
    const pending = this.#pending;
    if (pending === null) throw new Error('No command to send.');
    const result = await this.#gateway.command(pending.command);
    if (result.kind === 'ok') {
      this.#revision = result.value.revision;
      const settled = { ...pending, accepted: result.value };
      try {
        await this.#persistPending(settled);
        this.#pending = settled;
      } catch {
        // The retained idempotency key can replay the same server receipt.
      }
    } else if (result.kind !== 'unavailable') {
      await this.#discardPending();
    }
    return result;
  }

  async #discardPending(): Promise<void> {
    try {
      await this.#persistPending(null);
    } finally {
      this.#pending = null;
    }
  }

  #setIdle(): void {
    this.#busy = false;
    const waiters = this.#idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }
}

function sameDocument(candidate: unknown, expected: PortfolioSaveDocumentV4): boolean {
  try {
    return JSON.stringify(validatePortfolioSaveDocument(candidate)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}
