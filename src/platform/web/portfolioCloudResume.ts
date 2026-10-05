import type { MineSiteId } from '../../config/mineSites';
import {
  PortfolioCloudCommands,
  type PendingPortfolioCommand,
} from './portfolioCloudCommands';
import type {
  PortfolioCloudAccepted,
  PortfolioCloudGateway,
  PortfolioCloudResult,
} from './portfolioCloudGateway';
import type { PortfolioCloudBootOutcome } from './portfolioCloudReconcile';

export type PortfolioCloudResumeOutcome =
  | {
      readonly kind: 'ready';
      readonly accepted: PortfolioCloudAccepted;
      readonly commands: PortfolioCloudCommands;
      readonly enteredMineId: MineSiteId | null;
    }
  | { readonly kind: 'deferred'; readonly reason: string };

/**
 * Finish an interrupted command, then enter the selected mine when a saved
 * foreground session has gone stale. Both calls preserve the old server
 * receipt so its offline interval can be claimed exactly once.
 */
export async function resumePortfolioCloudMine(
  gateway: Pick<PortfolioCloudGateway, 'upload' | 'command'>,
  boot: Extract<PortfolioCloudBootOutcome, { kind: 'ready' }>,
  _nowMs: number,
  newKey: () => string,
  pending: PendingPortfolioCommand | null = null,
  persistPending: (command: PendingPortfolioCommand | null) => Promise<void> = async () => {},
): Promise<PortfolioCloudResumeOutcome> {
  const commands = new PortfolioCloudCommands({
    gateway, revision: boot.revision, newKey, pending, persistPending,
  });
  let accepted: PortfolioCloudAccepted = {
    revision: boot.revision,
    document: boot.document,
    receivedAt: new Date(boot.receivedAtMs).toISOString(),
  };
  if (pending !== null) {
    const replayed = await commands.retryPending();
    if (replayed.kind !== 'ok') return deferred(replayed);
    accepted = replayed.value;
    return { kind: 'ready', accepted, commands, enteredMineId: null };
  }
  const receiptMs = Date.parse(accepted.receivedAt);
  if (!Number.isFinite(receiptMs)) return { kind: 'deferred', reason: 'invalid-receipt' };
  if (boot.source === 'uploaded' && accepted.document.activeMineId !== null) {
    return { kind: 'ready', accepted, commands, enteredMineId: null };
  }

  const mineId = accepted.document.selectedMineId;
  const entered = await commands.executeAtRevision({ type: 'enter', mineId });
  if (entered.kind !== 'ok') return deferred(entered);
  return {
    kind: 'ready', accepted: entered.value, commands, enteredMineId: mineId,
  };
}

function deferred(result: Exclude<PortfolioCloudResult<PortfolioCloudAccepted>, { kind: 'ok' }> |
  { readonly kind: 'busy' }): PortfolioCloudResumeOutcome {
  return { kind: 'deferred', reason: result.kind };
}
