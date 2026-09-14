import './style.css';

import { BASE_GAME_BALANCE, validateBaseGameBalance } from './config';
import { claimOfflineReward, createPendingOfflineReward } from './core';
import { createGame, MineSimulationDriver } from './game';
import {
  createSaveDocument,
  CloudSaveReplica,
  describeCloudSaveNotice,
  DexieActiveSaveRepository,
  loadActiveGame,
  ReplicatingActiveSaveRepository,
  SavePersistenceCoordinator,
  type CloudSaveReplicaEvent,
  type SaveConflictCandidate,
  type SaveDocumentV2,
} from './persistence';
import {
  adoptExistingLocalSave,
  beginGoogleAccountSwitch,
  beginGoogleSignIn,
  bindSaveLifecycle,
  createSupabaseClient,
  detectGoogleIdentityCollision,
  downloadCloudSaveViaFetch,
  ensureGuestSession,
  generateRecoveryCode,
  LifecycleSafeActiveSaveRepository,
  reconcileCloudSaveAtBoot,
  redeemRecoveryCode,
  signOutOfSession,
  uploadCloudSaveViaFetch,
  WebLifecycleSaveJournal,
  type CloudSaveReconcileOutcome,
  type GenerateRecoveryCodeResult,
  type GoogleSignInResult,
  type GuestSessionResult,
  type RedeemRecoveryCodeResult,
  type SignOutResult,
  type SupabaseClient,
} from './platform/web';
import { readTelegramInitData, signInWithTelegram, type TelegramSignInResult } from './platform/telegram';
import {
  createSaveDiagnosticBanner,
  showOfflineRewardModal,
  type OfflineRewardModal,
} from './ui';

declare global {
  interface Window {
    /** Server-milestone Step 10, DEV-only — see the block below that sets it. */
    catMineIdleAccount?: {
      beginGoogleSignIn: () => Promise<GoogleSignInResult>;
      /** Server-milestone Step 13: resolves an identity_already_exists collision by signing in as the account that owns it. */
      beginGoogleAccountSwitch: () => Promise<GoogleSignInResult>;
      signOut: () => Promise<SignOutResult>;
      /** Server-milestone Step 14: issues (or rotates) the current session's recovery code. */
      generateRecoveryCode: () => Promise<GenerateRecoveryCodeResult>;
      /** Server-milestone Step 14: redeems a recovery code, then reconciles the redeeming device's local save the same way any other sign-in does. */
      redeemRecoveryCode: (code: string) => Promise<RedeemRecoveryCodeResult>;
      /**
       * Server-milestone Step 18: the genuine-fork candidates a boot reconcile
       * found and deliberately did not write over, retained for the session
       * (§7.3) so a future chooser can apply either one verbatim.
       */
      pendingSaveConflict: () => CloudSaveReconcileOutcome | null;
    };
  }
}

const app = getRequiredElement('#app', 'Application root');
const gameViewport = getRequiredElement('#game-viewport', 'Game viewport');

validateBaseGameBalance(BASE_GAME_BALANCE);

// Server-milestone Step 8: a first-time player gets a real anonymous session
// from the first frame, with no prompt and no blocking network wait. `null`
// when no Supabase project is configured — the client-only build this
// milestone extends stays exactly as playable either way, so this is never
// awaited before boot; only its result is published, once resolved, as a
// DEV-only diagnostic the same way `BootScene` already publishes its own.
//
// The client promise is cached on `import.meta.hot.data` across a hot
// reload: without this, every HMR cycle would construct a second GoTrue
// client alongside the first one still holding its auto-refresh timer,
// which is what the SDK's own "Multiple GoTrueClient instances detected"
// console warning is reporting.
const supabaseClientPromise: Promise<SupabaseClient | null> =
  import.meta.hot?.data.supabaseClientPromise ?? createSupabaseClient();
if (import.meta.hot) {
  import.meta.hot.data.supabaseClientPromise = supabaseClientPromise;
}

// Server-milestone Step 12: inside a Telegram Mini App, Telegram sign-in
// "replaces the guest path entirely" — the plan's own words — rather than
// linking to a guest session the way Google does. Computed once, synchronously,
// before either boot chain below decides which one to run: `readTelegramInitData`
// only ever reads `window.Telegram.WebApp.initData`, so this never blocks or
// makes a network call, and resolves `null` for every player today (no Mini
// App host exists yet — `memory-bank/server-threat-model.md` finding F1), so
// the guest chain below is the only one that ever runs in production right now.
const telegramInitData = readTelegramInitData();

if (telegramInitData !== null) {
  void supabaseClientPromise
    .then((client) =>
      signInWithTelegram(
        telegramInitData,
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-sign-in`,
        client?.auth ?? null,
      ),
    )
    // Same reasoning as the guest-session `.catch` below: a second,
    // independent consumer of `supabaseClientPromise` needs its own handler,
    // or a rejected client promise reaches an unhandled rejection here too.
    .catch(
      (error: unknown): TelegramSignInResult => ({
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
    .then((result) => {
      if (import.meta.env.DEV) {
        app.dataset.telegramSignIn = JSON.stringify(result);
      }
      // Server-milestone Step 17: Telegram sign-in never links — it always
      // replaces whatever guest session (and its local progress) preceded
      // it, so this is exactly the "does the cloud already hold something
      // different" case the boot-order reconcile exists for.
      if (result.status === 'signed-in') {
        triggerCloudSaveReconcile();
      }
    });
} else {
  void supabaseClientPromise
    .then((client) => ensureGuestSession(client?.auth ?? null))
    // `ensureGuestSession` itself never rejects — its own try/catch covers only
    // the collaborator calls made *inside* it — but `supabaseClientPromise` can:
    // `createSupabaseClient`'s dynamic `import()` can reject on a flaky network
    // or, in production, a stale chunk hash after a redeploy. Without this the
    // rejection skips straight past the `.then` above to an unhandled
    // rejection, breaking `guestSession.ts`'s own "never throws" contract from
    // one level up. Folded into `sign-in-failed` rather than `unconfigured`,
    // which is reserved for "no Supabase project configured at all."
    .catch(
      (error: unknown): GuestSessionResult => ({
        status: 'sign-in-failed',
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
    .then((result) => {
      if (import.meta.env.DEV) {
        app.dataset.guestSession = JSON.stringify(toPublicGuestSessionDiagnostic(result));
      }
      // Server-milestone Step 17: reconciles once a session exists, same
      // reasoning as the Telegram branch above.
      if (result.status === 'signed-in') {
        triggerCloudSaveReconcile();
      }
    });
}

/**
 * Server-milestone Step 10: DEV-only trigger for the Google sign-in flow.
 *
 * No production UI exists for this yet — deliberately: the fixed HUD
 * (`HudView.ts`) already draws gold, the warehouse queue, and income
 * edge-to-edge across the full 360×640 canvas, and the bottom navigation,
 * surface strip, and scrollable mine account for the rest, so there is no
 * free region to place a DOM overlay without either visually colliding with
 * existing HUD content or sitting on top of an existing canvas click target
 * (an upgrade control, a bottom-nav tile). A real player-facing entry point
 * is a Phaser-rendered control akin to the bottom-nav tiles, which is a
 * distinct scope of work belonging to a later polish step. Until then this
 * mirrors `app.dataset.guestSession` above: a DEV-only hook the guided
 * manual verification (and, later, a real E2E suite once real Google test
 * credentials exist) can call directly, the same way existing E2E specs
 * already call test-injected `window.catMineIdle*` hooks.
 */
if (import.meta.env.DEV) {
  void supabaseClientPromise
    .then(async (client) => {
      window.catMineIdleAccount = {
        beginGoogleSignIn: () =>
          beginGoogleSignIn(client?.auth ?? null, window.location.origin),
        beginGoogleAccountSwitch: () =>
          beginGoogleAccountSwitch(client?.auth ?? null, window.location.origin),
        signOut: () => signOutOfSession(client?.auth ?? null),
        generateRecoveryCode: () =>
          generateRecoveryCode(
            client?.auth ?? null,
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recovery-code/v1/generate`,
          ),
        redeemRecoveryCode: async (code: string) => {
          const result = await redeemRecoveryCode(
            code,
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recovery-code/v1/redeem`,
            client?.auth ?? null,
          );
          // Server-milestone Step 14: "redemption... must reuse the Step 13
          // collision flow when the redeeming device already holds
          // progress." The redeeming device's local IndexedDB save is
          // untouched by the session swap `verifyOtp` just completed, so
          // the same reconcile every other sign-in path already triggers is
          // exactly what compares it against the recovered account's cloud
          // save — no separate merge logic needed here.
          if (result.status === 'redeemed') {
            triggerCloudSaveReconcile();
          }
          return result;
        },
        pendingSaveConflict: () => pendingSaveConflict,
      };
      // Server-milestone Step 13: whether this page load's return URL
      // carried `error_code=identity_already_exists` — a `linkIdentity`
      // attempt that collided with an existing account. No production UI
      // reads this yet (same reason the hook above is DEV-only); it exists
      // so the guided manual verification (and, later, a real E2E suite) can
      // observe the collision and then call `beginGoogleAccountSwitch()` to
      // resolve it.
      app.dataset.googleIdentityCollision = String(
        await detectGoogleIdentityCollision(client?.auth ?? null),
      );
    })
    // A second, independent consumer of `supabaseClientPromise` needs its own
    // handler: the `.catch` on the guest-session chain above only settles
    // *that* chain's derived promise, and without this one a rejected client
    // promise (the same flaky-`import()` case documented above) would reach
    // an unhandled rejection a second time. DEV-only convenience hook, so
    // simply leaving `window.catMineIdleAccount` unset is the right outcome.
    .catch(() => {});
}

/**
 * Drops the live access token before this reaches the DOM. It is never
 * needed there: the dev-only server-e2e suite that once read it now reads
 * the same token directly from the Supabase client's own `localStorage`
 * entry, so publishing it a second place bought no test coverage, only a
 * second place a page script could read it from.
 */
function toPublicGuestSessionDiagnostic(result: GuestSessionResult): unknown {
  return result.status === 'signed-in' ? { status: result.status, user: result.user } : result;
}

const indexedRepository = new DexieActiveSaveRepository();

/**
 * Server-milestone Step 18 §7.3: the genuine-fork saves a boot reconcile
 * deliberately did not write over. The local candidate is still in IndexedDB
 * and the remote candidate is carried here, so the save the player did not
 * choose is retained for the session and a future chooser can apply either one
 * verbatim. `null` whenever the last reconcile was not a fork.
 */
let pendingSaveConflict: CloudSaveReconcileOutcome | null = null;

/**
 * Server-milestone Step 17/18: §11's boot-order reconcile — "In the background,
 * once a session exists, `GET /v1/save`. Reconcile through §7." Called from
 * the tail of whichever sign-in chain above actually ran, only once that
 * chain resolves `signed-in`, so `client.auth.getSession()` below reliably
 * reflects the new session rather than racing it. Re-reading the
 * already-resolved `supabaseClientPromise` costs nothing extra — a fourth
 * independent consumer, with its own `.catch` for the same reason the three
 * chains above each need one.
 *
 * Applies §7's full dominance rule (Step 18) and never touches either save on
 * a genuine fork. Never awaited before the first frame; `startApplication()`
 * below does not depend on it.
 */
function triggerCloudSaveReconcile(): void {
  void runCloudSaveReconcile()
    .catch(
      (error: unknown): CloudSaveReconcileOutcome => ({
        kind: 'error',
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
    .then((outcome) => {
      pendingSaveConflict = outcome.kind === 'deferred-conflict' ? outcome : null;

      // Step 19 §11: no upload runs before the reconcile settles. A download
      // that reported a revision armed the replica through
      // `onServerRevision`; every other outcome means the client still has no
      // revision to send, so arm with null — the protocol's "this client has
      // never synced." A fork stops sync outright: the replica has no way to
      // apply the player's unchosen save, and re-uploading the local candidate
      // would only earn the identical `409` again.
      if (outcome.kind === 'deferred-conflict') {
        cloudReplica.stop();
      } else {
        cloudReplica.arm(null);
      }

      // Server-milestone Step 19 §9: "once after boot reconcile if local is
      // ahead of cloud." `kept-local` is exactly that — local dominates the
      // cloud document — and `no-cloud-save` is the first-ever upload for this
      // account, which §11 step 3 calls "upload at the next trigger." Both are
      // forced, so the 60 s interval cannot delay the first real sync.
      if (outcome.kind === 'kept-local' || outcome.kind === 'no-cloud-save') {
        void forceCloudUploadLatestLocalDocument();
      }

      if (import.meta.env.DEV) {
        app.dataset.cloudSaveReconcile = JSON.stringify(
          toPublicReconcileDiagnostic(outcome),
        );
      }
    });
}

/**
 * Keeps the DEV diagnostic small: a fork's two candidates each carry a whole
 * save document, and the dataset is not the place for two multi-kilobyte JSON
 * blobs. The retained `pendingSaveConflict` above still holds the documents.
 */
function toPublicReconcileDiagnostic(outcome: CloudSaveReconcileOutcome): unknown {
  if (outcome.kind !== 'deferred-conflict') {
    return outcome;
  }

  return {
    kind: outcome.kind,
    local: toPublicConflictCandidate(outcome.local),
    remote: toPublicConflictCandidate(outcome.remote),
  };
}

function toPublicConflictCandidate(candidate: SaveConflictCandidate): unknown {
  return {
    lastPlayedMs: candidate.lastPlayedMs,
    gold: candidate.gold.serialize(),
    floorsOpen: candidate.floorsOpen,
    deepestShaftLevel: candidate.deepestShaftLevel,
    totalGoldDelivered: candidate.totalGoldDelivered.serialize(),
  };
}

async function runCloudSaveReconcile(): Promise<CloudSaveReconcileOutcome> {
  const client = await supabaseClientPromise;
  const accessToken = client === null ? null : (await client.auth.getSession()).data.session?.access_token ?? null;

  // `localRepository` (the `LifecycleSafeActiveSaveRepository` below), not the
  // raw `indexedRepository` it wraps and not the Step 19 `ReplicatingActiveSaveRepository`
  // above it: the running `SavePersistenceCoordinator` writes through the same
  // local wrapper, and a debounced flush landing between this reconcile's own
  // `storeActiveSave` and `reload()` would otherwise revert the adopt with no
  // signal — two writers racing one Dexie record. The composite is deliberately
  // *not* used here: storing an adopted remote document through it would
  // immediately offer that same document back to the replica as an upload,
  // which is at best a wasted round trip and at worst a `409` loop. The
  // reconcile's job is to settle local storage; Step 19's replica only ever
  // uploads games the local device produced.
  return reconcileCloudSaveAtBoot(accessToken, Date.now(), {
    repository: localRepository,
    download: (token) =>
      downloadCloudSaveViaFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-sync/v1/save`, token),
    config: BASE_GAME_BALANCE,
    // A 2026-09-13 review finding: `location.reload()` fires `pagehide`
    // synchronously on the page being torn down, and `bindSaveLifecycle`'s
    // `forceSave` would journal the *stale*, pre-adoption in-memory
    // document — never told about the remote document `storeActiveSave`
    // above just wrote — under a fresher `savedAtTimestampMs`.
    // `LifecycleSafeActiveSaveRepository.loadActiveSave` prefers whichever
    // of {IndexedDB, journal} is chronologically newer, so that stale
    // journal entry would win on the very next boot, silently reverting
    // the adopt and re-triggering it forever. Unbinding first removes the
    // listener entirely — verified live only by unregistering it, not by
    // racing a debounce window — so no `pagehide`/`visibilitychange`
    // handler runs at all during this reload; nothing else needs saving,
    // since the remote document this function just adopted is already the
    // newest authoritative state. `unbindSaveLifecycle` is declared further
    // down this file and optional-chained because a reconcile that
    // resolves before `startApplication()` reaches that assignment has
    // nothing bound yet to unbind. That ordering isn't risk-free, though:
    // `reload()` does not stop script execution, so `bindSaveLifecycle`
    // could in principle still run *after* this callback and register a
    // fresh listener before the document actually unloads. That needs the
    // network round trip this reconcile makes to resolve before
    // `startApplication()`'s own font loading and `loadActiveGame` do,
    // which is improbable, not impossible — this comment does not claim
    // otherwise.
    reload: () => {
      suspendLocalSavesForCloudAdopt();
      unbindSaveLifecycle?.();
      window.location.reload();
    },
    // A residual the same review found: `storeActiveSave`'s own
    // `clearThrough` only discards a journal entry at or before the
    // document it just wrote, which is the wrong comparison for an adopted
    // remote document — it carries another device's clock, so a journal
    // entry written earlier this session (backgrounding the tab during
    // boot, before this reconcile ran) can read as newer and survive,
    // then win on the next boot. `lifecycleJournal` is declared further
    // down this file, safe to reference here for the same reason
    // `repository` is.
    clearLifecycleJournal: () => lifecycleJournal.clear(),
    // Step 19: the download is the one place this session learns the server's
    // revision before its first upload. Arming here means a returning player's
    // first routine save updates revision N rather than false-conflicting
    // against it.
    onServerRevision: (revision) => cloudReplica.arm(revision),
  });
}

/**
 * Server-milestone Step 19/20: the boot-reconcile forced trigger, and the
 * first-sign-in adoption it performs. `adoptExistingLocalSave` reads whichever
 * local document the lifecycle-safe repository would load (IndexedDB or a newer
 * journal entry), migrates/validates it — a pre-milestone version-1 save becomes
 * version 2 here — and hands it to the Step 19 replica as a forced upload. Run
 * on `no-cloud-save` (the account's first sign-in, so the local save becomes
 * the cloud save rather than being replaced by a fresh one) and on
 * `kept-local`. Never throws.
 */
async function forceCloudUploadLatestLocalDocument(): Promise<void> {
  const result = await adoptExistingLocalSave({
    repository: localRepository,
    config: BASE_GAME_BALANCE,
    forceUpload: (document) => repository.forceCloudUpload(document),
  });

  // The same DEV-only diagnostic convention every other identity/sync
  // operation follows, so the adoption is observable in the E2E suite and in a
  // guided manual pass: `uploaded` vs `no-local-save` vs `unreadable` vs
  // `upload-failed`.
  if (import.meta.env.DEV) {
    app.dataset.localSaveAdoption = JSON.stringify(result);
  }
}

/**
 * Server-milestone Step 19: an upload `409` whose server side dominates the
 * document this client tried to send. The cloud save is a strict superset, so
 * adopting it loses nothing — the identical rule and the identical reload
 * hardening the boot reconcile's own `remote-dominates` branch uses. The
 * lifecycle unbind and the unconditional journal clear exist for the reasons
 * documented on that branch: a `pagehide` during reload must not journal the
 * stale pre-adoption document over the one just stored.
 */
async function adoptRemoteDocumentFromUpload(
  document: SaveDocumentV2,
  receivedAtMs: number,
): Promise<void> {
  try {
    // Order matters: stop the coordinator from queuing or flushing anything
    // before the local write, or a debounce landing during the `await` below
    // would overwrite the adopted document.
    suspendLocalSavesForCloudAdopt();
    unbindSaveLifecycle?.();
    await localRepository.storeActiveSave(document);
    lifecycleJournal.clear();

    if (import.meta.env.DEV) {
      app.dataset.cloudSaveAdoptedAt = String(receivedAtMs);
    }

    window.location.reload();
  } catch (error) {
    // The adopt failed before the reload, so the page will keep running:
    // resume local saving rather than leaving the session permanently frozen.
    localSavesSuspended = false;

    if (import.meta.env.DEV) {
      app.dataset.cloudSaveAdoptError =
        error instanceof Error ? error.message : String(error);
    }
  }
}

/**
 * Step 19: freezes local saving while a cloud document is adopted and the page
 * reloaded. `window.location.reload()` queues the navigation but keeps running
 * the current script, so the driver's purchase and heartbeat paths would still
 * be able to re-queue the stale in-memory document; `localSavesSuspended`
 * makes every one of them a no-op, and `cancelScheduledSave` discards a flush
 * already scheduled. The adopt's own write goes through `localRepository`
 * directly and is unaffected.
 */
function suspendLocalSavesForCloudAdopt(): void {
  localSavesSuspended = true;
  persistence.cancelScheduledSave();

  // Failsafe: if the browser refuses or delays the navigation, saving resumes
  // rather than staying frozen for the rest of the session. A real reload
  // discards this timer with the page.
  window.setTimeout(() => {
    localSavesSuspended = false;
  }, CLOUD_ADOPT_RELOAD_FALLBACK_MS);
}

/** Compact DEV-only view of an upload event; fork candidates carry whole documents, so they are reduced like the reconcile's. */
function toPublicCloudUploadEvent(event: CloudSaveReplicaEvent): unknown {
  if (event.kind !== 'fork') {
    return event;
  }

  return {
    kind: event.kind,
    local: toPublicConflictCandidate(event.local),
    remote: toPublicConflictCandidate(event.remote),
  };
}

const lifecycleJournal = new WebLifecycleSaveJournal(
  getAvailableLocalStorage(),
  BASE_GAME_BALANCE,
);
/**
 * Server-milestone Step 17/18's lifecycle-safe local repository. It stays the
 * primary store; the boot reconcile writes through *this* object (not the raw
 * Dexie repository), so its journal stays in sync with the coordinator.
 */
const localRepository = new LifecycleSafeActiveSaveRepository(
  indexedRepository,
  lifecycleJournal,
  BASE_GAME_BALANCE,
);
// Save recovery and storage failures are both recoverable and both invisible
// without this: the loader replaces an unreadable save with a fresh game and
// the coordinator absorbs a failed write into a diagnostic, so a player who
// lost local progress would otherwise simply find themselves back at the start.
// Server-milestone Step 19 reuses the same banner for terminal cloud failures,
// with the namespaced `cloud-sync-*` codes §4 fixes.
const saveDiagnostics = createSaveDiagnosticBanner(app);
/**
 * Server-milestone Step 19: the cloud replica. Every collaborator is injected —
 * the real `PUT /v1/save` call, the wall clock, the timers — so its cadence,
 * backoff, and `409` handling are all provable in Node without a stack. It is
 * constructed here, after `supabaseClientPromise`, but opens no connection
 * until the first `enqueue`, which never happens before a local save.
 */
const cloudReplica = new CloudSaveReplica({
  upload: async (baseRevision, document) => {
    const client = await supabaseClientPromise;

    return uploadCloudSaveViaFetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-sync/v1/save`,
      client?.auth ?? null,
      baseRevision,
      document,
    );
  },
  config: BASE_GAME_BALANCE,
  now: () => Date.now(),
  onEvent: (event) => {
    // §4: only a terminal problem is shown. A retryable failure surfaces
    // nothing while a retry is still pending; once retries are exhausted it
    // reaches the banner through `sync-stopped` with the same copy.
    if (event.kind === 'sync-stopped' || event.kind === 'document-dropped') {
      saveDiagnostics.report(describeCloudSaveNotice(event.code));
    }

    if (import.meta.env.DEV) {
      app.dataset.cloudSaveUpload = JSON.stringify(toPublicCloudUploadEvent(event));
    }
  },
  onRemoteDominates: (document, receivedAtMs) => {
    void adoptRemoteDocumentFromUpload(document, receivedAtMs);
  },
  onFork: (local, remote) => {
    // §7.3: both candidates are retained for the session through the same
    // `pendingSaveConflict` the boot reconcile already populates, so the DEV
    // account hook exposes an upload fork exactly as it exposes a boot fork.
    pendingSaveConflict = { kind: 'deferred-conflict', local, remote };
  },
});
/**
 * The composition Step 19's instructions name: local primary, cloud replica.
 * The coordinator and the boot reconcile keep writing through their own
 * wrappers; everything that saves through the coordinator now also offers the
 * document to the replica, at the replica's own §9 cadence.
 */
const repository = new ReplicatingActiveSaveRepository(localRepository, cloudReplica);
const persistence = new SavePersistenceCoordinator(repository, {
  onDiagnostic: (diagnostic) => saveDiagnostics.report(diagnostic),
});
let game: ReturnType<typeof createGame> | null = null;
let offlineRewardModal: OfflineRewardModal | null = null;
let unbindSaveLifecycle: (() => void) | null = null;
let saveHeartbeatId: number | null = null;
let disposed = false;
/**
 * Server-milestone Step 19: set while a dominating remote save is being adopted
 * and the page reloaded. `window.location.reload()` does not stop script
 * execution, so without this the running driver's purchase/heartbeat paths
 * could `queueSave` the stale in-memory document, and a debounced flush landing
 * mid-adopt would write it — stamped with a fresher client clock — over the
 * just-adopted remote. Clearing the scheduled save and suppressing every later
 * `queueSave` closes that window; the local write the adopt itself makes goes
 * through `localRepository` directly, so it is unaffected.
 */
let localSavesSuspended = false;
/** How long local saving stays suspended before a reload that never happened is assumed failed. */
const CLOUD_ADOPT_RELOAD_FALLBACK_MS = 2_000;

/**
 * How often a session that is only producing — not buying — is written out.
 *
 * Foreground progress is otherwise persisted by a purchase or by the lifecycle
 * flush alone, and a mobile webview killed by the OS routinely skips
 * `pagehide`. Whatever the last write missed is re-credited on the next load as
 * offline income, which is deliberately paid at a reduced rate and capped, so
 * an unwritten session is a session partly given back. Long enough that the
 * writes stay rare next to the coordinator's own debounce.
 */
const SAVE_HEARTBEAT_MS = 30_000;

void startApplication();

async function startApplication(): Promise<void> {
  await Promise.all([
    document.fonts.load('600 16px Fredoka'),
    document.fonts.load('700 16px Fredoka'),
  ]);

  if (disposed) {
    return;
  }

  const loadResult = await loadActiveGame(
    persistence,
    BASE_GAME_BALANCE,
    Date.now(),
    { onWarning: (warning) => saveDiagnostics.report(warning) },
  );

  if (disposed) {
    return;
  }

  // The driver owns authoritative state from here on. `Date.now` is injected so
  // it stays the only wall clock in the application, and the renderer pulls
  // snapshots from the driver rather than pushing frames into the core.
  const driver = new MineSimulationDriver({
    state: loadResult.state,
    balance: BASE_GAME_BALANCE,
    now: () => Date.now(),
    // A purchase changes authoritative state without any tick completing, and
    // routine saves are debounced rather than continuous, so the coordinator is
    // told about it explicitly. Without this an upgrade the player just paid
    // for could be lost on the next reload.
    onCommandApplied: () => {
      if (localSavesSuspended) {
        return;
      }

      persistence.queueSave(
        createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now()),
      );
    },
  });
  let pendingReward = createPendingOfflineReward(loadResult.offlineIncome);
  let rewardClaimed = false;

  game = createGame(gameViewport, driver);
  unbindSaveLifecycle = bindSaveLifecycle(
    persistence,
    () => {
      // A lifecycle event can land between rendered frames. Bring the
      // authoritative state exactly to the event's wall-clock boundary before
      // stamping the document; otherwise `savedAtTimestampMs` would consume
      // that final foreground interval without either simulating it now or
      // making it eligible for offline income after a reload.
      driver.advance();

      return createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now());
    },
    {
      journal: lifecycleJournal,
      // Server-milestone Step 19 §9: "A lifecycle-flush upload is best-effort:
      // the local write is what must survive teardown." `forceCloudUpload`
      // coalesces and returns immediately; the coordinator's own local flush
      // above is what the teardown guarantees.
      onForceSave: (document) => repository.forceCloudUpload(document),
    },
  );

  // Skips the write entirely while authoritative state has not moved — a
  // backgrounded tab stops advancing the driver, and rewriting an identical
  // document would be pure cost.
  let lastPersistedState = driver.state;

  saveHeartbeatId = window.setInterval(() => {
    if (localSavesSuspended || driver.state === lastPersistedState) {
      return;
    }

    lastPersistedState = driver.state;
    persistence.queueSave(
      createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now()),
    );
  }, SAVE_HEARTBEAT_MS);

  if (pendingReward !== null) {
    offlineRewardModal = showOfflineRewardModal({
      parent: app,
      pendingReward,
      onClaim: async () => {
        // Guarded by `rewardClaimed`, not by a cached state candidate: the mine
        // keeps producing while the modal is open, so a retry after a failed
        // write must persist the state as it is now, having still added the
        // reward exactly once.
        if (!rewardClaimed) {
          const claimResult = claimOfflineReward(driver.state, pendingReward);

          if (claimResult.status !== 'claimed') {
            return false;
          }

          driver.replaceState(claimResult.state);
          pendingReward = claimResult.pendingReward;
          rewardClaimed = true;
        }

        const claimedDocument = createSaveDocument(
          driver.state,
          BASE_GAME_BALANCE,
          Date.now(),
        );

        if (localSavesSuspended) {
          return false;
        }

        persistence.queueSave(claimedDocument);
        // Server-milestone Step 19 §9: a claimed offline reward is one of the
        // three named forced triggers. Forced so the freshly credited gold
        // reaches the cloud promptly rather than waiting out the 60 s cadence.
        repository.forceCloudUpload(claimedDocument);
        const persisted = await persistence.flush();

        if (persisted) {
          offlineRewardModal = null;
        }

        return persisted;
      },
    });
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposed = true;
    saveDiagnostics.destroy();
    offlineRewardModal?.destroy();
    unbindSaveLifecycle?.();

    if (saveHeartbeatId !== null) {
      window.clearInterval(saveHeartbeatId);
      saveHeartbeatId = null;
    }

    persistence.cancelScheduledSave();
    // Step 19: clears any pending cadence/backoff timer so an HMR cycle does
    // not leave a replica uploading into a page that no longer exists.
    cloudReplica.stop();
    indexedRepository.close();
    // Deliberately does not stop the Supabase client's auto-refresh here: the
    // client (and its promise) is cached on `import.meta.hot.data` precisely
    // so the *same* instance survives this reload, and stopping its refresh
    // timer now would leave the reused instance unable to refresh afterward.
    game?.destroy(true);
  });
}

function getRequiredElement(selector: string, name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);

  if (element === null) {
    throw new Error(`${name} was not found.`);
  }

  return element;
}

function getAvailableLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
