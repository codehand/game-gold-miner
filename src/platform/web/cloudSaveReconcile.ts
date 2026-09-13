/**
 * Server-milestone Step 17: §11's boot-order reconcile — "cloud latency must
 * never delay the first frame... In the background, once a session exists,
 * `GET /v1/save`. Reconcile through §7." This module is deliberately narrower
 * than §7's full dominance rule (Step 18's job): it only ever acts silently
 * when one side has no progress at all (`reconcileGuestUpgrade` from
 * `src/persistence`), and leaves local completely untouched — writing
 * nothing, showing nothing to the player — the moment both sides hold real
 * progress. That is a genuine fork, and Step 18 is what resolves it.
 *
 * Called from `src/main.ts` after a session exists (guest or Telegram),
 * never awaited before the game's first frame. Never throws: every failure
 * resolves to a typed `CloudSaveReconcileOutcome`, the same contract every
 * other platform module in this milestone keeps.
 *
 * A device with no local record at all (a genuinely new device, or a fresh
 * player before their first debounced save has landed) is treated as having
 * no progress — the same baseline `createInitialGameState` produces — rather
 * than as "nothing to compare," so the step's own test ("a player with a
 * cloud save on a new device restores it") is not an edge case this module
 * silently skips.
 */
import type { BaseGameBalanceConfig } from '../../config';
import { createInitialGameState } from '../../core';
import {
  createSaveDocument,
  reconcileGuestUpgrade,
  validateSaveDocument,
  type ActiveSaveRepository,
  type SaveDocumentV1,
} from '../../persistence';
import { describeError } from '../describeError';

export interface CloudSaveDownload {
  readonly document: SaveDocumentV1;
  readonly receivedAtMs: number;
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

  return { document: body.document as SaveDocumentV1, receivedAtMs: Date.parse(body.receivedAt) };
}

export type CloudSaveReconcileOutcome =
  | { readonly kind: 'no-session' }
  | { readonly kind: 'no-cloud-save' }
  | { readonly kind: 'kept-local' }
  | { readonly kind: 'adopted-remote' }
  | { readonly kind: 'deferred-conflict' }
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

    // The server already validates on upload, so this is defense-in-depth
    // today rather than a document that could otherwise be malformed — but
    // it also *migrates*: a schema-1 cloud document downloaded once a schema
    // 2 exists must not reach `storeActiveSave` unmigrated, which a bare
    // cast would do. A thrown `SaveDocumentError` here propagates to the
    // catch below rather than being written to IndexedDB half-trusted.
    const remoteDocument = validateSaveDocument(remote.document, deps.config);

    const decision = reconcileGuestUpgrade(
      localDocument,
      { document: remoteDocument, receivedAtMs: remote.receivedAtMs },
      deps.config,
    );

    if (decision.kind === 'adopt-local') {
      return { kind: 'kept-local' };
    }
    if (decision.kind === 'ask') {
      return { kind: 'deferred-conflict' };
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
): Promise<SaveDocumentV1> {
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
