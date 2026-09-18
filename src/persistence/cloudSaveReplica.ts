/**
 * Server-milestone Step 19: the cloud half of the save repository — §9's
 * upload cadence and §7's `409` conflict path, kept pure and free of any
 * network or browser API. The one real transport lives in
 * `src/platform/web/cloudSaveUpload.ts`; everything here is injected, tested
 * in Node, and never blocks a frame or a local save.
 *
 * The plan's own words: "IndexedDB stays the primary store and the cloud is a
 * replica. Network work belongs in `src/persistence` and `src/platform`;
 * `src/core` must not learn that a server exists." This module is the
 * `src/persistence` half — it decides *whether* and *when* to upload, and what
 * a refused upload means — while `uploadCloudSaveViaFetch` performs the one
 * HTTP call. `ReplicatingActiveSaveRepository` composes both with the existing
 * Dexie repository.
 *
 * Three rules from `memory-bank/server-save-sync-protocol.md` are load-bearing
 * here and are enforced by tests rather than prose:
 *
 * 1. **§9 cadence.** At most one upload per 60 seconds, with forced triggers
 *    (a lifecycle flush, a claimed offline reward, and once after boot
 *    reconcile) bypassing the interval. Coalescing keeps only the newest
 *    document — a queued upload is replaced, never queued behind.
 * 2. **Retry is silent and bounded.** A retryable failure (§4's `rate_limited`,
 *    `server_error`, `service_unavailable`, or a dropped connection) backs off
 *    1/2/4/8/16 s, capped, for at most five attempts, then stops cloud sync for
 *    the session. The player is shown nothing while a retry is pending, because
 *    the local save is always intact. Step 25 added one qualifier: §4 makes
 *    `rate_limited` retryable *after* `Retry-After`, so when the transport
 *    reports one the wait is the longer of it and the ladder step — the ladder
 *    is a floor, never a way to retry early into a window still closed.
 * 3. **§7 on `409`.** A refused upload carries the server's own document; the
 *    one `resolveSaveConflict` predicate the boot reconcile already uses
 *    decides. A dominating local re-uploads against the server's revision, a
 *    dominating remote is handed to the caller to adopt, an equal pair adopts
 *    the revision silently (the lost-response retry), and only a genuine fork
 *    is deferred with both candidates retained.
 */
import type { BaseGameBalanceConfig } from '../config';
import {
  resolveSaveConflict,
  type SaveConflictCandidate,
} from './saveConflictPolicy';
import {
  validateSaveDocument,
  type SaveDocumentV2,
} from './saveSchema';

/** §9: at most one cloud upload per 60 seconds, unless a named trigger forces one. */
export const CLOUD_UPLOAD_MIN_INTERVAL_MS = 60_000;
/**
 * §9: "1 s, 2 s, 4 s, 8 s, 16 s … at most five attempts per trigger." The five
 * listed delays are five *retries*, so a trigger sends at most six requests:
 * the first attempt plus `CLOUD_UPLOAD_MAX_RETRIES` retries. Reading "atomic
 * attempts" as five total sends would leave the 16 s step and the 60 s cap
 * unreachable, so the constant is named for the retries it actually bounds.
 */
export const CLOUD_UPLOAD_MAX_RETRIES = 5;
/** §9: "1 s, 2 s, 4 s, 8 s, 16 s". The sequence ends at 16 s, so the 60 s cap never binds today. */
export const CLOUD_UPLOAD_RETRY_DELAYS_MS: readonly number[] = [
  1_000, 2_000, 4_000, 8_000, 16_000,
];
/**
 * No §9 limit, but a bound is still required: two devices resolving the same
 * row back and forth could otherwise keep answering `409` forever. Five
 * resolutions is far past any real race and turns an adversarial loop into a
 * stopped session instead of a request flood.
 */
export const CLOUD_UPLOAD_MAX_CONFLICT_RESOLUTIONS = 5;

/** Every §4 code that can accompany a `PUT /v1/save` rejection. */
export type CloudSaveFailureCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'malformed_request'
  | 'payload_too_large'
  | 'save_invalid'
  | 'schema_unsupported'
  | 'save_rejected'
  | 'rate_limited'
  | 'server_error'
  | 'service_unavailable';

/** A terminal cloud-sync problem, in the shape `SaveDiagnosticBanner.report` accepts. */
export interface CloudSaveNotice {
  readonly code: string;
  readonly message: string;
}

/**
 * §4's "Player sees" column, as a pure lookup. Namespaced `cloud-sync-*` so
 * the banner's de-duplication and dismissal behave per-cause and cannot
 * collide with the local `load-failed`/`save-failed`/`corrupt-save`/
 * `incompatible-save` codes. Retryable codes only reach this once retries are
 * exhausted, so the same entry serves the mid-retry silence ("show nothing
 * while a retry is pending") and the exhausted notice.
 */
const CLOUD_SYNC_NOTICES: Readonly<Record<CloudSaveFailureCode, CloudSaveNotice>> = {
  unauthenticated: {
    code: 'cloud-sync-unauthenticated',
    message: 'Cloud sync is signed out. Your progress is saved on this device.',
  },
  forbidden: {
    code: 'cloud-sync-forbidden',
    message: 'Cloud sync is unavailable. Your progress is saved on this device.',
  },
  malformed_request: {
    code: 'cloud-sync-malformed-request',
    message: 'Cloud sync is unavailable. Your progress is saved on this device.',
  },
  payload_too_large: {
    code: 'cloud-sync-payload-too-large',
    message: 'Cloud sync is unavailable. Your progress is saved on this device.',
  },
  save_invalid: {
    code: 'cloud-sync-save-invalid',
    message: 'Your progress could not be uploaded. Your game on this device is unchanged.',
  },
  schema_unsupported: {
    code: 'cloud-sync-schema-unsupported',
    message: 'Cloud sync needs an app update. Your progress is saved on this device.',
  },
  save_rejected: {
    code: 'cloud-sync-save-rejected',
    message: 'Your progress could not be verified and was not uploaded. Your game on this device is unchanged.',
  },
  rate_limited: {
    code: 'cloud-sync-rate-limited',
    message: 'Cloud sync is unavailable. Your progress is saved on this device.',
  },
  server_error: {
    code: 'cloud-sync-server-error',
    message: 'Cloud sync is unavailable. Your progress is saved on this device.',
  },
  service_unavailable: {
    code: 'cloud-sync-service-unavailable',
    message: 'Cloud sync is unavailable. Your progress is saved on this device.',
  },
};

/** §4's player-facing copy for one terminal cloud-sync code. */
export function describeCloudSaveNotice(code: CloudSaveFailureCode): CloudSaveNotice {
  return CLOUD_SYNC_NOTICES[code];
}

/**
 * The typed result of one upload attempt. The transport never throws — a
 * rejected `fetch` is `retryable` — so the controller's own control flow is
 * the only thing deciding what happens next.
 *
 * `terminal.keepSyncing` distinguishes §4's "stop uploading this document"
 * (`save_invalid`, `save_rejected`) from "stop cloud sync for the session"
 * (`forbidden`, `malformed_request`, `payload_too_large`,
 * `schema_unsupported`, `unauthenticated`).
 */
export type CloudSaveUploadResult =
  | { readonly kind: 'accepted'; readonly revision: number }
  | {
      readonly kind: 'conflict';
      readonly serverRevision: number;
      readonly receivedAtMs: number;
      readonly document: unknown;
    }
  | {
      readonly kind: 'retryable';
      readonly code: CloudSaveFailureCode;
      readonly message: string;
      /**
       * Step 25: the server's own `Retry-After`, in milliseconds, when the
       * refusal carried one. §4 makes `rate_limited` "retryable after
       * `Retry-After`", so the client must not come back *before* the server
       * said it could — otherwise its retry ladder walks straight back into a
       * window that is still closed and burns the budget §9 grants it.
       *
       * It is a **floor**, not a replacement: the ladder still applies, and
       * `#scheduleRetry` waits the longer of the two. Absent when the
       * transport found no usable header (a `server_error`, or a malformed
       * value), in which case the ladder alone decides.
       */
      readonly retryAfterMs?: number;
    }
  | {
      readonly kind: 'terminal';
      readonly code: CloudSaveFailureCode;
      readonly message: string;
      readonly keepSyncing: boolean;
    }
  | { readonly kind: 'unconfigured' };

/** The injected network call — `uploadCloudSaveViaFetch` in production, a fake in tests. */
export type UploadCloudSave = (
  baseRevision: number | null,
  document: SaveDocumentV2,
) => Promise<CloudSaveUploadResult>;

/**
 * What the controller reports. Split deliberately by outcome rather than a
 * single boolean so `src/main.ts` can retain a fork's two candidates, adopt a
 * dominating remote, and publish a small DEV diagnostic, each from the exact
 * event that names it.
 */
export type CloudSaveReplicaEvent =
  | { readonly kind: 'uploaded'; readonly revision: number }
  | { readonly kind: 'same-progress'; readonly revision: number }
  | { readonly kind: 'local-dominates'; readonly revision: number }
  | { readonly kind: 'remote-dominates' }
  | {
      readonly kind: 'fork';
      readonly local: SaveConflictCandidate;
      readonly remote: SaveConflictCandidate;
    }
  | {
      readonly kind: 'retry-scheduled';
      readonly attempt: number;
      readonly delayMs: number;
      readonly code: CloudSaveFailureCode;
      readonly message: string;
    }
  | {
      readonly kind: 'sync-stopped';
      readonly code: CloudSaveFailureCode;
      readonly message: string;
    }
  | {
      readonly kind: 'document-dropped';
      readonly code: CloudSaveFailureCode;
      readonly message: string;
    }
  | { readonly kind: 'unconfigured' };

export interface CloudSaveReplicaOptions {
  readonly upload: UploadCloudSave;
  /** Used only to validate a `409` body before the pure conflict predicate reads it. */
  readonly config: BaseGameBalanceConfig;
  readonly now: () => number;
  readonly onEvent?: (event: CloudSaveReplicaEvent) => void;
  /** A dominating remote must be adopted by the caller (store + reload) — the repository cannot reload itself. */
  readonly onRemoteDominates?: (
    document: SaveDocumentV2,
    receivedAtMs: number,
  ) => void;
  /** §7.3: the caller retains both candidates for the session; the controller writes neither. */
  readonly onFork?: (
    local: SaveConflictCandidate,
    remote: SaveConflictCandidate,
  ) => void;
  readonly minIntervalMs?: number;
  /** Injected so unit tests can drive the cadence and backoff with fake timers. */
  readonly setTimeoutFn?: typeof setTimeout;
  readonly clearTimeoutFn?: typeof clearTimeout;
}

/**
 * The upload state machine. It owns only scheduling and policy; it holds no
 * document beyond the newest one waiting to upload, opens no storage, and
 * touches no global. Every public method is synchronous and non-throwing.
 */
export class CloudSaveReplica {
  readonly #upload: UploadCloudSave;
  readonly #config: BaseGameBalanceConfig;
  readonly #now: () => number;
  readonly #onEvent: ((event: CloudSaveReplicaEvent) => void) | null;
  readonly #onRemoteDominates:
    | ((document: SaveDocumentV2, receivedAtMs: number) => void)
    | null;
  readonly #onFork:
    | ((local: SaveConflictCandidate, remote: SaveConflictCandidate) => void)
    | null;
  readonly #minIntervalMs: number;
  readonly #setTimeout: typeof setTimeout;
  readonly #clearTimeout: typeof clearTimeout;

  #pendingDocument: SaveDocumentV2 | null = null;
  #pendingForced = false;
  #inFlight: Promise<void> | null = null;
  #pumping = false;
  #stopped = false;
  #armed = false;
  #baseRevision: number | null = null;
  #attempt = 0;
  #conflictResolutions = 0;
  /**
   * §4's "stop uploading this document". A server-side `save_invalid` is a
   * structural property of the save, not of its timestamp, so the memory is
   * keyed on the *shape* of the authoritative `state` sub-object rather than
   * on the whole document: every routine save carries a fresh
   * `savedAtTimestampMs` (and moving values), which a whole-document key would
   * treat as a new document and re-upload once per cadence window forever. The
   * shape is stable across idle play, so a rejected save is not retried until
   * the state's structure actually changes.
   */
  #droppedStateSignature: string | null = null;
  #nextAllowedUploadAtMs = 0;
  #cadenceTimer: ReturnType<typeof setTimeout> | null = null;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(options: CloudSaveReplicaOptions) {
    this.#upload = options.upload;
    this.#config = options.config;
    this.#now = options.now;
    this.#onEvent = options.onEvent ?? null;
    this.#onRemoteDominates = options.onRemoteDominates ?? null;
    this.#onFork = options.onFork ?? null;
    this.#minIntervalMs = options.minIntervalMs ?? CLOUD_UPLOAD_MIN_INTERVAL_MS;
    // Bound to `globalThis`: calling the browser's `setTimeout` as a detached
    // function throws "Illegal invocation", and injection is how tests swap in
    // a fake timer, so the stored reference must stay callable either way.
    this.#setTimeout = (options.setTimeoutFn ?? setTimeout).bind(globalThis);
    this.#clearTimeout = (options.clearTimeoutFn ?? clearTimeout).bind(globalThis);

    if (!Number.isSafeInteger(this.#minIntervalMs) || this.#minIntervalMs < 0) {
      throw new Error('Cloud upload interval must be a non-negative safe integer.');
    }
  }

  /** The revision the server last confirmed, or `null` before the first accepted upload. */
  public get baseRevision(): number | null {
    return this.#baseRevision;
  }

  /** Cloud sync stops permanently for the session after a terminal failure or an exhausted retry budget. */
  public get isStopped(): boolean {
    return this.#stopped;
  }

  /**
   * Offers the newest document for upload. Coalescing matches the local
   * coordinator: only the most recent document is ever sent. `force: true`
   * (a lifecycle flush, a claimed reward, a post-reconcile upload) bypasses
   * the 60 s interval but not an upload already in flight.
   */
  public enqueue(document: SaveDocumentV2, options: { force?: boolean } = {}): void {
    if (this.#stopped) {
      return;
    }

    // §4: "stop uploading this document." A save whose authoritative state has
    // the same shape as the one the server already rejected once is not
    // retried by the routine cadence; only a structural change is. A *forced*
    // trigger (a lifecycle flush, a claimed reward, the post-reconcile upload)
    // deliberately bypasses this: it is the one path that can recover from a
    // transient server-side rejection — a mid-rollout deploy, a config
    // mismatch — without waiting for a reload, so "keep playing from local
    // state" stays true and `isStopped` keeps meaning what it says.
    if (
      options.force !== true &&
      this.#droppedStateSignature !== null &&
      stateSignature(document.state) === this.#droppedStateSignature
    ) {
      return;
    }

    this.#pendingDocument = document;

    if (options.force === true) {
      this.#pendingForced = true;
    }

    this.#pump();
  }

  /**
   * §11's boot order: "In the background, once a session exists, `GET
   * /v1/save`. Reconcile through §7. `204` means upload at the next trigger.
   * From then on, upload per §9." No upload may run before that download
   * settles, or the first routine save of a returning player carries a null
   * `baseRevision` against a row the server already holds and earns a needless
   * `409`. `revision` is the downloaded server revision, or `null` when the
   * account has no cloud save (the protocol's own "this client has never
   * synced"). Idempotent: the first arm wins, so the fallback `arm(null)` for
   * an unreadable download can never overwrite a revision the download did
   * report.
   */
  public arm(revision: number | null): void {
    if (this.#armed || this.#stopped) {
      return;
    }

    this.#armed = true;
    this.#baseRevision = revision;
    this.#pump();
  }

  /** Resolves once no upload attempt is in flight. Never waits out a scheduled cadence or backoff. */
  public async flush(): Promise<void> {
    while (this.#inFlight !== null) {
      await this.#inFlight;
    }
  }

  /** Stops cloud sync for the session and clears any scheduled work. */
  public stop(): void {
    this.#stopped = true;
    this.#pendingDocument = null;
    this.#pendingForced = false;
    this.#clearCadenceTimer();
    this.#clearRetryTimer();
  }

  #pump(): void {
    if (this.#stopped || this.#pumping || !this.#armed) {
      return;
    }
    if (this.#pendingDocument === null) {
      return;
    }
    if (this.#retryTimer !== null) {
      // A retry is already scheduled and will pump when it fires. Enqueuing a
      // newer document does not start a second, parallel timer; the retry
      // sends whichever document is pending then.
      return;
    }

    const now = this.#now();
    const forced = this.#pendingForced;

    if (!forced && now < this.#nextAllowedUploadAtMs) {
      this.#scheduleCadence(this.#nextAllowedUploadAtMs - now);
      return;
    }

    const document = this.#pendingDocument;
    this.#pendingDocument = null;
    this.#pendingForced = false;
    this.#clearCadenceTimer();
    this.#nextAllowedUploadAtMs = now + this.#minIntervalMs;
    this.#pumping = true;

    this.#inFlight = this.#runUpload(document).finally(() => {
      this.#pumping = false;
      this.#inFlight = null;
      this.#pump();
    });
  }

  async #runUpload(document: SaveDocumentV2): Promise<void> {
    let result: CloudSaveUploadResult;

    try {
      result = await this.#upload(this.#baseRevision, document);
    } catch (error) {
      // The transport's own contract is never to throw, but a collaborator
      // that breaks it must not crash the frame that enqueued this.
      result = {
        kind: 'retryable',
        code: 'server_error',
        message: error instanceof Error ? error.message : String(error),
      };
    }

    switch (result.kind) {
      case 'accepted':
        this.#baseRevision = result.revision;
        this.#attempt = 0;
        this.#conflictResolutions = 0;
        // Recovery: the forced retry of a previously rejected shape succeeded,
        // so routine saves are no longer suppressed.
        this.#droppedStateSignature = null;
        this.#emit({ kind: 'uploaded', revision: result.revision });
        return;
      case 'unconfigured':
        this.#pendingDocument = null;
        this.#emit({ kind: 'unconfigured' });
        return;
      case 'retryable':
        this.#scheduleRetry(document, result.code, result.message, result.retryAfterMs);
        return;
      case 'terminal':
        if (result.keepSyncing) {
          this.#droppedStateSignature = stateSignature(document.state);
          this.#emit({
            kind: 'document-dropped',
            code: result.code,
            message: result.message,
          });
          return;
        }
        this.#stopped = true;
        this.#pendingDocument = null;
        this.#emit({
          kind: 'sync-stopped',
          code: result.code,
          message: result.message,
        });
        return;
      case 'conflict':
        this.#handleConflict(document, result);
        return;
    }
  }

  #handleConflict(
    document: SaveDocumentV2,
    conflict: Extract<CloudSaveUploadResult, { kind: 'conflict' }>,
  ): void {
    let remoteDocument: SaveDocumentV2;
    try {
      remoteDocument = validateSaveDocument(conflict.document, this.#config);
    } catch {
      // §7's predicate must never index into an unvalidated `409` body. A
      // body this malformed is a server bug, not a conflict to adjudicate.
      this.#stopped = true;
      this.#pendingDocument = null;
      this.#emit({
        kind: 'sync-stopped',
        code: 'malformed_request',
        message: 'Conflict response carried no valid save document.',
      });
      return;
    }

    const resolution = resolveSaveConflict(document, {
      document: remoteDocument,
      receivedAtMs: conflict.receivedAtMs,
    });

    this.#baseRevision = conflict.serverRevision;

    switch (resolution.kind) {
      case 'same-progress':
        // The retried-upload edge case (§5): the server already holds exactly
        // what this client is sending, so adopting its revision and showing
        // nothing is the documented resolution.
        this.#attempt = 0;
        this.#conflictResolutions = 0;
        this.#emit({ kind: 'same-progress', revision: conflict.serverRevision });
        return;
      case 'local-dominates': {
        this.#conflictResolutions += 1;

        if (this.#conflictResolutions > CLOUD_UPLOAD_MAX_CONFLICT_RESOLUTIONS) {
          this.#stopped = true;
          this.#pendingDocument = null;
          this.#emit({
            kind: 'sync-stopped',
            code: 'server_error',
            message: 'Too many unresolved conflicts with the cloud save.',
          });
          return;
        }

        // Local is a strict superset, so re-uploading against the server's
        // revision loses nothing. §9 coalescing still wins: a newer document
        // enqueued while this upload was in flight is kept, not replaced by
        // the older one that just conflicted. A fresh trigger resets the
        // retry budget (§9 scopes attempts "per trigger").
        this.#attempt = 0;
        if (this.#pendingDocument === null) {
          this.#pendingDocument = document;
        }
        this.#pendingForced = true;
        this.#emit({ kind: 'local-dominates', revision: conflict.serverRevision });
        return;
      }
      case 'remote-dominates':
        this.#attempt = 0;
        this.#conflictResolutions = 0;
        this.#pendingDocument = null;
        this.#emit({ kind: 'remote-dominates' });
        this.#onRemoteDominates?.(remoteDocument, conflict.receivedAtMs);
        return;
      case 'fork': {
        // §7.3: neither candidate is destroyed until the player chooses, and
        // there is no chooser yet. Sync must stop here, exactly as the boot
        // reconcile's fork does: the client now holds the server's revision
        // (`#baseRevision` was set above), so a single later routine save
        // would be accepted and silently replace the remote branch the player
        // was never shown. `stop()` clears any queued document and makes every
        // future `enqueue` a no-op; both candidates still travel to the caller.
        const remoteCandidate = {
          ...resolution.remote,
          serverRevision: conflict.serverRevision,
        };
        this.stop();
        this.#emit({
          kind: 'fork',
          local: resolution.local,
          remote: remoteCandidate,
        });
        this.#onFork?.(resolution.local, remoteCandidate);
        return;
      }
    }
  }

  #scheduleRetry(
    document: SaveDocumentV2,
    code: CloudSaveFailureCode,
    message: string,
    retryAfterMs?: number,
  ): void {
    this.#attempt += 1;

    // §9: the first attempt plus `CLOUD_UPLOAD_MAX_RETRIES` retries. The five
    // delays below are exactly those five retries, so the 16 s step is reached.
    if (this.#attempt > CLOUD_UPLOAD_MAX_RETRIES) {
      this.#stopped = true;
      this.#pendingDocument = null;
      this.#emit({ kind: 'sync-stopped', code, message });
      return;
    }

    if (this.#pendingDocument === null) {
      this.#pendingDocument = document;
    }

    const ladderDelayMs =
      CLOUD_UPLOAD_RETRY_DELAYS_MS[
        Math.min(this.#attempt - 1, CLOUD_UPLOAD_RETRY_DELAYS_MS.length - 1)
      ];

    // Step 25 / §4: `rate_limited` is "retryable after `Retry-After`". The
    // header is a *floor* on the ladder, never a shortening of it — the client
    // waits the longer of the two, so it can neither walk back into a window
    // the server just refused (the ladder alone would, from attempt 1) nor
    // wait less than §9 prescribes on a server that answers a shorter header.
    const delayMs = Math.max(ladderDelayMs, retryAfterMs ?? 0);

    this.#emit({
      kind: 'retry-scheduled',
      attempt: this.#attempt,
      delayMs,
      code,
      message,
    });
    this.#clearRetryTimer();
    this.#retryTimer = this.#setTimeout(() => {
      this.#retryTimer = null;
      this.#pendingForced = true;
      this.#pump();
    }, delayMs);
  }

  #scheduleCadence(delayMs: number): void {
    if (this.#cadenceTimer !== null) {
      return;
    }

    this.#cadenceTimer = this.#setTimeout(() => {
      this.#cadenceTimer = null;
      this.#pump();
    }, delayMs);
  }

  #clearCadenceTimer(): void {
    if (this.#cadenceTimer !== null) {
      this.#clearTimeout(this.#cadenceTimer);
      this.#cadenceTimer = null;
    }
  }

  #clearRetryTimer(): void {
    if (this.#retryTimer !== null) {
      this.#clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
  }

  #emit(event: CloudSaveReplicaEvent): void {
    try {
      this.#onEvent?.(event);
    } catch {
      // Diagnostics are best-effort and must never interrupt cloud sync.
    }
  }
}

/**
 * A stable value signature of an authoritative game state. Gameplay values are
 * preserved, while the outer document timestamp is not. Routine saves of the
 * exact same rejected state share it, while gameplay changes can retry cloud
 * sync.
 */
export function stateSignature(value: unknown): string {
  return JSON.stringify(value, (_key, nestedValue: unknown) => {
    if (nestedValue === null || typeof nestedValue !== 'object' || Array.isArray(nestedValue)) {
      return nestedValue;
    }

    return Object.fromEntries(
      Object.entries(nestedValue as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  });
}
