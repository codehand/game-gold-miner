import { MINE_SITE_IDS, type MineSiteId } from '../../config/mineSites';
import {
  validatePortfolioSaveDocument,
} from '../../persistence';
import type { PendingPortfolioCommand } from './portfolioCloudCommands';
import type {
  PortfolioCloudAccepted,
  PortfolioCloudCommand,
} from './portfolioCloudGateway';

interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PORTFOLIO_COMMAND_JOURNAL_PREFIX = 'cat-mine-idle:portfolio-command:';

/** A complete upload + command transaction scoped to one authenticated user. */
export class PortfolioCommandJournal {
  readonly #storage: StoragePort;
  readonly #key: string;

  public constructor(storage: StoragePort, userId: string) {
    if (!UUID.test(userId)) throw new Error('A valid account ID is required.');
    this.#storage = storage;
    this.#key = `${PORTFOLIO_COMMAND_JOURNAL_PREFIX}${userId}`;
  }

  public read(): PendingPortfolioCommand | null {
    try {
      const raw = this.#storage.getItem(this.#key);
      if (raw === null) return null;
      const value = JSON.parse(raw) as unknown;
      const legacy = parseCommand(value);
      if (legacy !== null) {
        return {
          command: legacy,
          sourceDocument: null,
          uploadBaseRevision: null,
          accepted: null,
        };
      }
      if (!isRecord(value) || value.version !== 2 || !isRecord(value.command)) return null;
      if (Object.keys(value).length !== 6 ||
          !Object.hasOwn(value, 'sourceDocument') ||
          !Object.hasOwn(value, 'uploadBaseRevision') ||
          !Object.hasOwn(value, 'accepted')) return null;
      const command = parseCommand(value.command);
      if (command === null) return null;
      const sourceDocument = value.sourceDocument === null
        ? null : validatePortfolioSaveDocument(value.sourceDocument);
      const uploadBaseRevision = value.uploadBaseRevision === null
        ? null : positiveRevision(value.uploadBaseRevision);
      const accepted = value.accepted === null ? null : parseAccepted(value.accepted);
      if ((uploadBaseRevision !== null && sourceDocument === null) ||
          (accepted !== null && uploadBaseRevision !== null)) return null;
      return { command, sourceDocument, uploadBaseRevision, accepted };
    } catch {
      return null;
    }
  }

  public async write(pending: PendingPortfolioCommand | null): Promise<void> {
    if (pending === null) {
      this.#storage.removeItem(this.#key);
      return;
    }
    this.#storage.setItem(this.#key, JSON.stringify({
      version: 2,
      command: pending.command,
      sourceDocument: pending.sourceDocument,
      uploadBaseRevision: pending.uploadBaseRevision,
      accepted: pending.accepted,
      writtenAtMs: Date.now(),
    }));
  }
}

function parseCommand(value: unknown): PortfolioCloudCommand | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.baseRevision) ||
      Number(value.baseRevision) < 1 || typeof value.idempotencyKey !== 'string' ||
      !UUID.test(value.idempotencyKey)) return null;
  const common = {
    baseRevision: Number(value.baseRevision),
    idempotencyKey: value.idempotencyKey,
  };
  if (value.type === 'suspend' || value.type === 'migrate') {
    return Object.keys(value).length === 3 ? { ...common, type: value.type } : null;
  }
  if ((value.type !== 'purchase' && value.type !== 'enter') ||
      typeof value.mineId !== 'string' ||
      !MINE_SITE_IDS.includes(value.mineId as MineSiteId)) return null;
  if (value.type === 'purchase') {
    return Object.keys(value).length === 4
      ? { ...common, type: 'purchase', mineId: value.mineId as MineSiteId } : null;
  }
  const hasEffectiveAt = Object.hasOwn(value, 'effectiveAtMs');
  if (hasEffectiveAt && (!Number.isSafeInteger(value.effectiveAtMs) ||
      Number(value.effectiveAtMs) < 0)) return null;
  if (Object.keys(value).length !== (hasEffectiveAt ? 5 : 4)) return null;
  return {
    ...common,
    type: 'enter',
    mineId: value.mineId as MineSiteId,
    ...(hasEffectiveAt ? { effectiveAtMs: Number(value.effectiveAtMs) } : {}),
  };
}

function parseAccepted(value: unknown): PortfolioCloudAccepted {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 1 || typeof value.receivedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.receivedAt))) {
    throw new Error('Invalid accepted portfolio receipt.');
  }
  return {
    revision: Number(value.revision),
    receivedAt: value.receivedAt,
    document: validatePortfolioSaveDocument(value.document),
    ...(isRecord(value.result) ? { result: value.result } : {}),
  };
}

function positiveRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error('Invalid pending upload revision.');
  }
  return Number(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
