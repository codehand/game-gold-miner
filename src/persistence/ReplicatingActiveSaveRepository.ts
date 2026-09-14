import type { ActiveSaveRepository } from './ActiveSaveRepository';
import type { CloudSaveReplica } from './cloudSaveReplica';
import type { SaveDocumentV2 } from './saveSchema';

/**
 * Server-milestone Step 19's composition: the local repository stays primary
 * and the cloud is a replica. This implements the plan's "IndexedDB stays the
 * primary store and the cloud is a replica" literally —
 *
 * - `loadActiveSave` reads the local store only. Cloud latency must never
 *   delay the first frame (§11), so the download half is the separate boot
 *   reconcile, not this method.
 * - `storeActiveSave` writes local first and *awaits* it; only then does it
 *   hand the same document to the replica. A failed local write rejects, so
 *   `SavePersistenceCoordinator` still reports its `save-failed` diagnostic;
 *   the replica is best-effort and can never turn a successful local save
 *   into a rejection.
 *
 * `forceCloudUpload` is the §9 forced-trigger entry point: a lifecycle flush,
 * a claimed offline reward, and the boot reconcile each call it to bypass the
 * 60 s interval. The replica coalesces, so a forced call during an in-flight
 * upload cannot open a second request.
 *
 * This class deliberately holds no clock, no `fetch`, and no DOM type: the
 * network adapter lives in `src/platform/web/cloudSaveUpload.ts` and is
 * injected into `CloudSaveReplica`.
 */
export class ReplicatingActiveSaveRepository implements ActiveSaveRepository {
  readonly #primary: ActiveSaveRepository;
  readonly #replica: CloudSaveReplica;
  #lastDocument: SaveDocumentV2 | null = null;

  public constructor(primary: ActiveSaveRepository, replica: CloudSaveReplica) {
    this.#primary = primary;
    this.#replica = replica;
  }

  public async loadActiveSave(): Promise<unknown | null> {
    return this.#primary.loadActiveSave();
  }

  public async storeActiveSave(document: SaveDocumentV2): Promise<void> {
    await this.#primary.storeActiveSave(document);
    this.#lastDocument = document;
    // Never awaited and never able to throw into the coordinator: cloud sync
    // is a replica, and the local write above is what a save means.
    this.#replica.enqueue(document);
  }

  /**
   * §9 forced triggers. Uses the most recently stored document when none is
   * given, so a caller that only knows "something changed" can ask without
   * reconstructing the document itself.
   */
  public forceCloudUpload(document?: SaveDocumentV2): void {
    const candidate = document ?? this.#lastDocument;

    if (candidate === null || candidate === undefined) {
      return;
    }

    this.#replica.enqueue(candidate, { force: true });
  }
}
