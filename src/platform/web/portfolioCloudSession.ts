import {
  deserializePortfolioSaveDocument,
  createPortfolioSaveDocument,
  type ActiveSaveRepository,
  type PortfolioSaveDocumentV4,
} from '../../persistence';
import {
  EMPTY_BOOST_STATE,
  GameNumber,
  settlePendingMineClaim,
  type BoostState,
  type PendingOfflineReward,
} from '../../core';
import { PortfolioCommandJournal } from './portfolioCommandJournal';
import { reconcilePortfolioCloudAtBoot, type PortfolioCloudBootOutcome } from './portfolioCloudReconcile';
import { resumePortfolioCloudMine, type PortfolioCloudResumeOutcome } from './portfolioCloudResume';
import type { PortfolioCloudGateway } from './portfolioCloudGateway';
import { loadPortfolioSession } from './portfolioSession';
import { PortfolioCloudCommands } from './portfolioCloudCommands';

type CloudGateway = Pick<PortfolioCloudGateway, 'download' | 'upload' | 'command'>;
type StoragePort = ConstructorParameters<typeof PortfolioCommandJournal>[0];

export type PortfolioCloudSessionOutcome =
  | {
      readonly kind: 'ready';
      readonly document: PortfolioSaveDocumentV4;
      readonly commands: PortfolioCloudCommands;
      readonly entryGrant: Record<string, unknown> | null;
    }
  | {
      readonly kind: 'conflict';
      readonly local: PortfolioSaveDocumentV4;
      readonly remote: PortfolioSaveDocumentV4;
      readonly remoteRevision: number;
    }
  | { readonly kind: 'deferred'; readonly reason: string };

/**
 * Boots one signed-in account from local recovery through cloud authority.
 * The accepted document is committed locally before foreground play starts.
 */
export async function bootstrapPortfolioCloudSession(options: {
  readonly repository: ActiveSaveRepository<PortfolioSaveDocumentV4>;
  readonly storage: StoragePort;
  readonly gateway: CloudGateway;
  readonly userId: string;
  readonly nowMs: number;
  readonly boost?: BoostState;
  /** A reused identity with no local or cloud save must not be silently reset. */
  readonly returningAccount?: boolean;
  readonly newKey: () => string;
  readonly claimWithAction?: (
    reward: PendingOfflineReward,
    mineId: PortfolioSaveDocumentV4['selectedMineId'],
    claim: () => Promise<PortfolioCloudResumeOutcome>,
  ) => Promise<PortfolioCloudResumeOutcome>;
}): Promise<PortfolioCloudSessionOutcome> {
  const loaded = await loadPortfolioSession(
    options.repository, options.storage, options.nowMs,
    options.boost ?? EMPTY_BOOST_STATE,
  );
  if (loaded.status === 'corrupt') {
    return { kind: 'deferred', reason: 'corrupt-local-save' };
  }
  let local = createPortfolioSaveDocument(
    loaded.portfolio, options.nowMs, loaded.catRoster,
  );
  const journal = new PortfolioCommandJournal(options.storage, options.userId);
  const interrupted = journal.read();
  let reconciled: PortfolioCloudBootOutcome;
  if (interrupted !== null) {
    const commands = new PortfolioCloudCommands({
      gateway: options.gateway,
      revision: interrupted.accepted?.revision ??
        interrupted.uploadBaseRevision ?? interrupted.command.baseRevision,
      newKey: options.newKey,
      pending: interrupted,
      persistPending: (pending) => journal.write(pending),
    });
    const replayed = await commands.retryPending();
    if (replayed.kind !== 'ok') {
      return { kind: 'deferred', reason: replayed.kind };
    }
    const command = interrupted.command;
    const sourceSelectedMineId = interrupted.sourceDocument?.selectedMineId;
    const locallyEntered = command.type === 'enter' &&
      loaded.portfolio.selectedMineId === command.mineId &&
      sourceSelectedMineId !== command.mineId;
    if (locallyEntered) {
      let recovered = loaded.portfolio;
      const mine = recovered.mines[command.mineId];
      const result = replayed.value.result;
      const grant = result !== undefined && typeof result.grant === 'object' &&
          result.grant !== null && !Array.isArray(result.grant)
        ? result.grant as Record<string, unknown> : null;
      if (mine?.pendingClaim !== null && mine?.pendingClaim !== undefined) {
        if (!Number.isSafeInteger(result?.claimedSequence) ||
            result?.claimedSequence !== mine.pendingClaim.sequence ||
            typeof grant?.reward !== 'string') {
          return { kind: 'deferred', reason: 'invalid-entry-receipt' };
        }
        recovered = settlePendingMineClaim(
          recovered,
          command.mineId,
          result.claimedSequence as number,
          GameNumber.from(grant.reward),
        );
      }
      local = createPortfolioSaveDocument(recovered, options.nowMs, loaded.catRoster);
    } else {
      local = replayed.value.document;
    }
    try {
      await options.repository.storeActiveSave(local);
    } catch {
      return { kind: 'deferred', reason: 'local-save-failed' };
    }
    if (!await commands.completePending()) {
      return { kind: 'deferred', reason: 'command-journal-failed' };
    }
    const synced = locallyEntered
      ? await commands.syncRoutine(local)
      : { kind: 'ok' as const, value: replayed.value };
    if (synced.kind !== 'ok') {
      return { kind: 'deferred', reason: synced.kind };
    }
    reconciled = {
      kind: 'ready',
      document: synced.value.document,
      revision: synced.value.revision,
      receivedAtMs: Date.parse(synced.value.receivedAt),
      source: 'uploaded',
    };
  } else {
    reconciled = await reconcilePortfolioCloudAtBoot(
      options.gateway,
      local,
      loaded.status === 'saved',
      options.newKey,
      !(loaded.status === 'fresh' && options.returningAccount === true),
    );
  }
  if (reconciled.kind !== 'ready') return bootFailure(reconciled);

  const claim = () => resumePortfolioCloudMine(
    options.gateway, reconciled, options.nowMs, options.newKey,
    journal.read(), (command) => journal.write(command),
  );
  const serverGrant = reconciled.offlineGrants?.[reconciled.document.selectedMineId];
  const reward = serverGrant === undefined
    ? reconciled.source === 'uploaded' && loaded.status === 'saved'
      ? loaded.pendingGrant
      : null
    : {
        creditedDurationMs: serverGrant.creditedDurationMs,
        reward: GameNumber.from(serverGrant.reward),
      };
  const resumed = reward !== null && reward.reward.greaterThan(0) &&
      options.claimWithAction !== undefined
    ? await options.claimWithAction(reward, reconciled.document.selectedMineId, claim)
    : await claim();
  if (resumed.kind !== 'ready') {
    return { kind: 'deferred', reason: resumed.reason };
  }
  const document = resumed.accepted.document;
  try {
    // Keep the server's exact receipt payload in IndexedDB and lifecycle
    // journal. Re-serializing with the client clock could erase an interval.
    await options.repository.storeActiveSave(document);
    deserializePortfolioSaveDocument(document);
    if (!await resumed.commands.completePending()) {
      return { kind: 'deferred', reason: 'command-journal-failed' };
    }
  } catch {
    return { kind: 'deferred', reason: 'local-save-failed' };
  }
  return {
    kind: 'ready',
    document,
    commands: resumed.commands,
    entryGrant: resumed.accepted.result ?? null,
  };
}

function bootFailure(
  outcome: Exclude<PortfolioCloudBootOutcome, { kind: 'ready' }>,
): PortfolioCloudSessionOutcome {
  return outcome.kind === 'conflict'
    ? outcome
    : { kind: 'deferred', reason: outcome.reason };
}
