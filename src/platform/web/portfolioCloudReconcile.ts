import {
  comparePortfolioProgress,
  deserializePortfolioSaveDocument,
  validatePortfolioSaveDocument,
  type PortfolioSaveDocumentV4,
} from '../../persistence';
import {
  type PortfolioCloudAccepted,
  type PortfolioCloudGateway,
  type PortfolioCloudSnapshot,
} from './portfolioCloudGateway';

export type PortfolioCloudBootOutcome =
  | {
      readonly kind: 'ready';
      readonly document: PortfolioSaveDocumentV4;
      readonly revision: number;
      readonly receivedAtMs: number;
      readonly source: 'cloud' | 'uploaded';
      readonly offlineGrants?: PortfolioCloudSnapshot['offlineGrants'];
    }
  | {
      readonly kind: 'conflict';
      readonly local: PortfolioSaveDocumentV4;
      readonly remote: PortfolioSaveDocumentV4;
      readonly remoteRevision: number;
    }
  | { readonly kind: 'deferred'; readonly local: PortfolioSaveDocumentV4; readonly reason: string };

type CloudTransport = Pick<PortfolioCloudGateway, 'download' | 'upload' | 'command'>;

/**
 * Resolve a V4 boot before a configured account can issue mine commands.
 * Local progress is retained whenever the cloud cannot accept it safely.
 */
export async function reconcilePortfolioCloudAtBoot(
  gateway: CloudTransport,
  local: PortfolioSaveDocumentV4,
  hasLocalSave: boolean,
  idempotencyKey: () => string,
  allowFreshUpload = true,
): Promise<PortfolioCloudBootOutcome> {
  const downloaded = await gateway.download();
  if (downloaded.kind === 'missing') {
    if (!hasLocalSave && !allowFreshUpload) {
      return { kind: 'deferred', local, reason: 'local-save-missing' };
    }
    const uploaded = await gateway.upload(null, local);
    return uploaded.kind === 'ok'
      ? ready(uploaded.value, 'uploaded')
      : { kind: 'deferred', local, reason: resultReason(uploaded) };
  }
  if (downloaded.kind !== 'ok') {
    return { kind: 'deferred', local, reason: resultReason(downloaded) };
  }
  let snapshot: PortfolioCloudSnapshot | PortfolioCloudAccepted = downloaded.value;
  const version = (snapshot.document as { schemaVersion?: unknown }).schemaVersion;
  if (version !== 4) {
    // The portfolio deserializer is the one legacy-save authority: it accepts
    // every supported V1/V2/V3 document and projects it into a suspended Gold
    // Mine. Validate with that dispatcher before asking the server to persist
    // the canonical V4 form, rather than silently dropping pre-V3 accounts.
    try {
      deserializePortfolioSaveDocument(snapshot.document);
    } catch {
      return { kind: 'deferred', local, reason: 'unsupported-cloud-save' };
    }
    const migration = await gateway.command({
      type: 'migrate',
      baseRevision: snapshot.revision,
      idempotencyKey: idempotencyKey(),
    });
    if (migration.kind !== 'ok') {
      return { kind: 'deferred', local, reason: resultReason(migration) };
    }
    // Read once more so the player can see the server-clock offline preview
    // before the subsequent entry command claims the migrated Gold interval.
    const migrated = await gateway.download();
    if (migrated.kind !== 'ok') {
      return { kind: 'deferred', local, reason: resultReason(migrated) };
    }
    snapshot = migrated.value;
  }
  let remote: PortfolioSaveDocumentV4;
  try {
    remote = validatePortfolioSaveDocument(snapshot.document);
  } catch {
    return { kind: 'deferred', local, reason: 'invalid-cloud-save' };
  }
  if (!hasLocalSave) {
    return {
      kind: 'ready', document: remote, revision: snapshot.revision,
      receivedAtMs: Date.parse(snapshot.receivedAt), source: 'cloud',
      offlineGrants: 'offlineGrants' in snapshot ? snapshot.offlineGrants : undefined,
    };
  }
  // A previous page can finish its server-owned suspend while the replacement
  // page is already booting. IndexedDB can still contain the active snapshot,
  // but the cloud interval is the newer lifecycle fact and must be resumed by
  // the `enter` command. Routine upload cannot make a suspended mine active.
  if (local.activeMineId !== remote.activeMineId &&
      local.selectedMineId === remote.selectedMineId) {
    return {
      kind: 'ready', document: remote, revision: snapshot.revision,
      receivedAtMs: Date.parse(snapshot.receivedAt), source: 'cloud',
      offlineGrants: 'offlineGrants' in snapshot ? snapshot.offlineGrants : undefined,
    };
  }
  const comparison = comparePortfolioProgress(local, remote);
  if (comparison === 'fork') {
    return { kind: 'conflict', local, remote, remoteRevision: snapshot.revision };
  }
  if (comparison === 'left-dominates') {
    const uploaded = await gateway.upload(snapshot.revision, local);
    if (uploaded.kind === 'ok') return ready(uploaded.value, 'uploaded');
    // The old page's suspend may land between this boot's GET and PUT. Read
    // once more and adopt that interval instead of making the player reload a
    // second time for a normal lifecycle race.
    if (uploaded.kind === 'rejected' && uploaded.reason === 'activeMineId') {
      const refreshed = await gateway.download();
      if (refreshed.kind === 'ok') {
        try {
          const refreshedRemote = validatePortfolioSaveDocument(refreshed.value.document);
          if (local.activeMineId !== refreshedRemote.activeMineId &&
              local.selectedMineId === refreshedRemote.selectedMineId) {
            return {
              kind: 'ready', document: refreshedRemote, revision: refreshed.value.revision,
              receivedAtMs: Date.parse(refreshed.value.receivedAt), source: 'cloud',
              offlineGrants: refreshed.value.offlineGrants,
            };
          }
        } catch {
          // The ordinary deferred path below keeps the local candidate intact.
        }
      }
    }
    return { kind: 'deferred', local, reason: resultReason(uploaded) };
  }
  return {
    kind: 'ready', document: remote, revision: snapshot.revision,
    receivedAtMs: Date.parse(snapshot.receivedAt), source: 'cloud',
    offlineGrants: 'offlineGrants' in snapshot ? snapshot.offlineGrants : undefined,
  };
}

function ready(
  accepted: PortfolioCloudAccepted,
  source: 'uploaded',
): PortfolioCloudBootOutcome {
  return {
    kind: 'ready',
    document: accepted.document,
    revision: accepted.revision,
    receivedAtMs: Date.parse(accepted.receivedAt),
    source,
  };
}

function resultReason(result: { readonly kind: string; readonly reason?: string | null }): string {
  return result.reason ?? result.kind;
}
