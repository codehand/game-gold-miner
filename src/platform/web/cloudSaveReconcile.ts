/**
 * Server-milestone Step 17/18: §11's boot-order reconcile — "cloud latency must
 * never delay the first frame... In the background, once a session exists,
 * `GET /v1/save`. Reconcile through §7."
 *
 * Step 17 shipped this module deliberately narrower than §7: it only ever acted
 * silently when one side had *no* progress at all, and left a genuine fork
 * completely untouched. Step 18 completed §7's dominance rule — the "progress
 * vector" predicate now lives in `src/persistence/saveConflictPolicy.ts` — so
 * this module applies the full policy: a save that is a strict superset of the
 * other is adopted silently, an equal-progress pair keeps local (adopting the
 * server revision conceptually; Step 19 owns the actual revision), and only a
 * genuine fork is deferred to the player with both candidates retained.
 *
 * Called from `src/main.ts` after a session exists (guest or Telegram),
 * never awaited before the game's first frame. Never throws: every failure
 * resolves to a typed `CloudSaveReconcileOutcome`, the same contract every
 * other platform module in this milestone keeps.
 *
 * A device with no local record at all (a genuinely new device, or a fresh
 * player before their first debounced save has landed) is treated as a fresh
 * baseline — the same state `createInitialGameState` produces — rather than as
 * "nothing to compare," so a cloud save dominates it and the step's own test
 * ("a player with a cloud save on a new device restores it") is not an edge
 * case this module silently skips.
 */
import type { BaseGameBalanceConfig } from '../../config';
import { createInitialGameState } from '../../core';
import {
  createSaveDocument,
  resolveSaveConflict,
  validateSaveDocument,
  type ActiveSaveRepository,
  type SaveConflictCandidate,
  type SaveDocumentV2,
} from '../../persistence';
import { describeError } from '../describeError';

export interface CloudSaveDownload {
  readonly document: SaveDocumentV2;
  readonly receivedAtMs: number;
  /** §5's server-owned revision, carried so the Step 19 replica can upload against it rather than a null that would false-conflict. */
  readonly revision: number;
}

/** Injected so tests fake the network call instead of hitting a real one. */
export type DownloadCloudSave = (accessToken: string) => Promise<CloudSaveDownload | null>;

interface CloudSaveDownloadResponseBody {
  readonly revision?: unknown;
  readonly receivedAt?: unknown;
  readonly document?: unknown;
}

/** The real `DownloadCloudSave`: §10.2 `GET /v1/save`. `204` (no cloud save yet) resolves `null`, never an error. */
export async function downloadCloudSaveViaFetch(
  edgeFunctionUrl: string,
  accessToken: string,
): Promise<CloudSaveDownload | null> {
  const response = await fetch(edgeFunctionUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 204) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`cloud save download failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as CloudSaveDownloadResponseBody;
  if (typeof body.receivedAt !== 'string' || typeof body.document !== 'object' || body.document === null) {
    throw new Error('cloud save download response carried no document/receivedAt');
  }
  if (typeof body.revision !== 'number') {
    throw new Error('cloud save download response carried no revision');
  }

  return {
    document: body.document as SaveDocumentV2,
    receivedAtMs: Date.parse(body.receivedAt),
    revision: body.revision,
  };
}

export type CloudSaveReconcileOutcome =
  | { readonly kind: 'no-session' }
  | { readonly kind: 'no-cloud-save' }
  | { readonly kind: 'kept-local' }
  | { readonly kind: 'same-progress' }
  | { readonly kind: 'adopted-remote' }
  | {
      readonly kind: 'deferred-conflict';
      readonly local: SaveConflictCandidate;
      readonly remote: SaveConflictCandidate;
    }
  | { readonly kind: 'error'; readonly reason: string };

export interface CloudSaveReconcileDeps {
  readonly repository: Pick<ActiveSaveRepository, 'loadActiveSave' | 'storeActiveSave'>;
  readonly download: DownloadCloudSave;
  readonly config: BaseGameBalanceConfig;
  /** `() => window.location.reload()` in production; injected so tests never actually reload. */
  readonly reload: () => void;
  /**
   * A 2026-09-13 review finding: `storeActiveSave`'s own journal handling
   * (`clearThrough`) only discards a journal entry at or *before* the
   * document it just wrote — correct for a routine flush, where an entry a
   * concurrent `pagehide` wrote more recently must survive an older
   * in-flight write finishing late, but wrong for this adopt: the remote
   * document carries *another device's* clock, so a journal entry written
   * earlier in this very session (a `visibilitychange`→hidden while the
   * player backgrounds the tab during boot, before this reconcile ever
   * ran) can read as chronologically newer and survive `clearThrough`,
   * then win on the very next boot and silently revert the adopt.
   * `WebLifecycleSaveJournal.clear()` discards it unconditionally, safe
   * here specifically because `reload`'s own unbind (see `main.ts`) means
   * no further local write can race it.
   */
  readonly clearLifecycleJournal: () => void;
  /**
   * Server-milestone Step 19: reports the downloaded revision as soon as the
   * cloud document is in hand, so the replica can arm itself with the
   * revision the server actually holds before its first upload. Without this,
   * a returning player's very first routine save would carry a null
   * `baseRevision` — "this client has never synced" — against an existing row
   * and earn a real, avoidable `409`.
   */
  readonly onServerRevision?: (revision: number) => void;
}

export async function reconcileCloudSaveAtBoot(
  accessToken: string | null,
  nowMs: number,
  deps: CloudSaveReconcileDeps,
): Promise<CloudSaveReconcileOutcome> {
  if (accessToken === null) {
    return { kind: 'no-session' };
  }

  try {
    const localDocument = await readLocalDocumentOrFresh(deps.repository, deps.config, nowMs);
    const remote = await deps.download(accessToken);

    if (remote === null) {
      return { kind: 'no-cloud-save' };
    }

    deps.onServerRevision?.(remote.revision);

    // The server already validates on upload, so this is defense-in-depth
    // today rather than a document that could otherwise be malformed — but
    // it also *migrates*: a schema-1 cloud document downloaded once a schema
    // 2 exists must not reach `storeActiveSave` unmigrated, which a bare
    // cast would do. A thrown `SaveDocumentError` here propagates to the
    // catch below rather than being written to IndexedDB half-trusted.
    const remoteDocument = validateSaveDocument(remote.document, deps.config);

    const resolution = resolveSaveConflict(localDocument, {
      document: remoteDocument,
      receivedAtMs: remote.receivedAtMs,
    });

    // §7.1: `M(A) == M(B)` is "same progress". This module keeps the local
    // document (and its transient, non-monotonic state) and writes nothing:
    // adopting the remote here would only discard local queues for no progress
    // gain, and the vector completes every gold source, so equal `M` also means
    // equal `gold`. Adopting the server *revision* is a separate concern the
    // policy cannot carry out from a pure predicate — Step 19's remote
    // repository owns it on the next upload — so `same-progress` names the
    // case, not an action this module performs.
    if (resolution.kind === 'same-progress') {
      return { kind: 'same-progress' };
    }
    if (resolution.kind === 'local-dominates') {
      return { kind: 'kept-local' };
    }
    if (resolution.kind === 'fork') {
      // Neither candidate is written anywhere: the local document stays in
      // IndexedDB, the remote document is carried back to the caller so the
      // player's eventual choice can apply it verbatim. §7.3: the save the
      // player did not choose is retained for the session.
      return { kind: 'deferred-conflict', local: resolution.local, remote: resolution.remote };
    }

    await deps.repository.storeActiveSave(remoteDocument);
    deps.clearLifecycleJournal();
    deps.reload();
    return { kind: 'adopted-remote' };
  } catch (error) {
    return { kind: 'error', reason: describeError(error) };
  }
}

async function readLocalDocumentOrFresh(
  repository: Pick<ActiveSaveRepository, 'loadActiveSave'>,
  config: BaseGameBalanceConfig,
  nowMs: number,
): Promise<SaveDocumentV2> {
  const raw = await repository.loadActiveSave();

  if (raw !== null) {
    try {
      return validateSaveDocument(raw, config);
    } catch {
      // An unreadable local document is `loadActiveGame`'s concern — it has
      // already recovered gameplay into a fresh state by the time this runs.
      // Falls through to the same fresh baseline below rather than treating
      // "cannot read it" as "nothing to compare."
    }
  }

  const fresh = createInitialGameState(config, nowMs);
  return createSaveDocument(fresh, config, nowMs);
}
