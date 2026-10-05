import './style.css';

import { BASE_GAME_BALANCE, validateBaseGameBalance, type MineSiteId } from './config';
import {
  activateBoost,
  calculateOfflineIncome,
  calculateSurfaceHaulerWorkforce,
  claimOfflineReward,
  createEmptyCatRoster,
  createInitialPortfolio,
  createPendingOfflineReward,
  EMPTY_BOOST_STATE,
  GameNumber,
  qualifyMineCatSlot,
  type BareCatSlotKey,
  type PendingOfflineReward,
  type BoostState,
} from './core';
import { createGame, formatAmount, MineSimulationDriver, PortfolioMineRuntime } from './game';
import { BOOT_SCENE_KEY, BootScene } from './game/scenes/BootScene';
import {
  commitPortfolioWithCoordinator,
  createPortfolioSaveDocument,
  deserializePortfolioSaveDocument,
  validatePortfolioSaveDocument,
  createSaveDocument,
  CloudSaveReplica,
  describeCloudSaveNotice,
  DexieActiveSaveRepository,
  LOAD_FAILURE_MESSAGE,
  loadActiveGame,
  ReplicatingActiveSaveRepository,
  SavePersistenceCoordinator,
  type CloudSaveReplicaEvent,
  type ActiveGameLoadResult,
  type SaveConflictCandidate,
  type SaveDocumentV2,
  type PortfolioSaveDocumentV4,
} from './persistence';
import {
  adoptExistingLocalSave,
  bootstrapPortfolioCloudSession,
  beginGoogleAccountSwitch,
  beginGoogleSignIn,
  bindSaveLifecycle,
  chooseOfflineReward,
  createSupabaseClient,
  detectGoogleIdentityCollision,
  downloadCloudSaveViaFetch,
  ensureGuestSession,
  generateRecoveryCode,
  getSupabaseApiUrl,
  LifecycleSafeActiveSaveRepository,
  LIFECYCLE_SAVE_JOURNAL_KEY,
  loadPortfolioSession,
  PortfolioCloudGateway,
  PortfolioCommandJournal,
  loadLeaderboardViaFetch,
  loadCatCollectionViaFetch,
  purchaseCatViaFetch,
  readGoogleIdentityReturnError,
  replaceCatAssignmentViaFetch,
  buyMarketplaceListingViaFetch,
  cancelMarketplaceListingViaFetch,
  createMarketplaceListingViaFetch,
  loadMarketplaceListingsViaFetch,
  rentMarketplaceListingViaFetch,
  markOfflineGrantApplied,
  readLocalBoostState,
  requestBoostViaFetch,
  writeLocalBoostState,
  MISSING_LOCAL_SAVE_CODE,
  MISSING_LOCAL_SAVE_MESSAGE,
  readAppliedOfflineGrantReceivedAtMs,
  reconcileCloudSaveAtBoot,
  redeemRecoveryCode,
  requestPersistentStorage,
  resumePortfolioSession,
  shouldExplainMissingLocalSave,
  signOutOfSession,
  uploadCloudSaveViaFetch,
  WebLifecycleSaveJournal,
  type CloudSaveOfflineGrant,
  type CloudSaveReconcileOutcome,
  type GenerateRecoveryCodeResult,
  type GoogleSignInResult,
  type GuestSessionResult,
  type LocalSaveState,
  type RedeemRecoveryCodeResult,
  type SignOutResult,
  type StorageManagerLike,
  type SupabaseClient,
  type MarketplaceCommandResult,
  type MarketplaceListingType,
  type MarketplaceListingsResult,
  type PortfolioCloudAccepted,
  type PortfolioCloudCommands,
} from './platform/web';
import { describeError } from './platform/describeError';
import { readTelegramInitData, signInWithTelegram, type TelegramSignInResult } from './platform/telegram';
import {
  AccountSettingsModal,
  BoostModal,
  CatAssignmentModal,
  CollectionModal,
  MineMapModal,
  LeaderboardModal,
  createSaveDiagnosticBanner,
  showOfflineRewardModal,
  type AccountActionResult,
  type AccountConflictCandidateView,
  type AccountConflictView,
  type AccountIdentityView,
  type CatAssignmentCommand,
  type CatAssignmentCommandResult,
  type MarketplacePurchaseResult,
  type OfflineRewardModal,
  type BoostCommandResult,
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

const supabaseApiUrl = getSupabaseApiUrl();
const supabaseFunctionUrl = (path: string): string => `${supabaseApiUrl ?? ''}${path}`;

/**
 * Server-milestone Step 21: ask the browser to make this origin's storage
 * persistent, once, as early as possible, and publish the real answer as a
 * DEV-only diagnostic. `persist()` is best-effort and never awaited before
 * boot — the game must not wait on it — and a grant is recorded as evidence,
 * never treated as a guarantee that iOS Safari's seven-day sweep is exempted.
 */
void requestPersistentStorage(getStorageManager()).then((state) => {
  if (import.meta.env.DEV) {
    app.dataset.persistentStorage = JSON.stringify(state);
  }
});

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
let initialAuthSettled: Promise<void> = Promise.resolve();

if (telegramInitData !== null) {
  initialAuthSettled = supabaseClientPromise
    .then((client) =>
      signInWithTelegram(
        telegramInitData,
        supabaseFunctionUrl('/functions/v1/telegram-sign-in'),
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
      // different" case the boot-order reconcile exists for. Step 21's
      // missing-local-save notice is deliberately guest-path-only: Telegram
      // mints a session from signed `initData` with no reused-session signal to
      // distinguish a returning player from a new one, so `sessionIsNew` stays
      // unset here and no notice can fire. A returning Telegram player is
      // restored from the cloud by the reconcile below.
      if (result.status === 'signed-in') {
        setAccountIdentity({
          status: 'signed-in',
          userId: null,
          email: null,
          googleLoginLabel: undefined,
        });
        void refreshAccountIdentity();
        triggerCloudSaveReconcile();
      } else {
        setAccountIdentity(
          result.status === 'unconfigured'
            ? { status: 'unconfigured', userId: null, email: null }
            : { status: 'error', userId: null, email: null, message: result.reason },
        );
        void refreshAccountIdentity();
        // Step 22: no session means no server grant; fall back to the local projection.
        finishOfflineRewardDecision(result.status === 'unconfigured');
      }
    });
} else {
  initialAuthSettled = supabaseClientPromise
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
      // reasoning as the Telegram branch above. Step 21 records whether this
      // boot reused an existing guest session or minted a new one, so a
      // reused session with no local save can be recognised as a returning
      // player whose device lost its copy.
      if (result.status === 'signed-in') {
        setAccountIdentity({
          status: result.user.isAnonymous ? 'guest' : 'signed-in',
          userId: result.user.id,
          email: null,
          googleLoginLabel: result.user.isAnonymous
            ? getGoogleLoginLabel()
            : undefined,
        });
        void refreshAccountIdentity();
        sessionIsNew = result.isNewSession;
        triggerCloudSaveReconcile();
      } else {
        setAccountIdentity(
          result.status === 'unconfigured'
            ? { status: 'unconfigured', userId: null, email: null }
            : { status: 'error', userId: null, email: null, message: result.reason },
        );
        void refreshAccountIdentity();
        // Step 22: no session means no server grant; fall back to the local
        // projection rather than showing no offline reward at all.
        finishOfflineRewardDecision(result.status === 'unconfigured');
      }
    });
}

/**
 * Server-milestone Step 10: DEV-only trigger for the Google sign-in flow.
 *
 * The player-facing entry point is now the settings control rendered by
 * `HudView`. This DEV-only hook remains useful for guided verification (and,
 * later, a real E2E suite once real Google test credentials exist), the same
 * way existing E2E specs already call test-injected `window.catMineIdle*`
 * hooks.
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
            supabaseFunctionUrl('/functions/v1/recovery-code/v1/generate'),
          ),
        redeemRecoveryCode: async (code: string) => {
          const result = await redeemRecoveryCode(
            code,
            supabaseFunctionUrl('/functions/v1/recovery-code/v1/redeem'),
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
      // attempt that collided with an existing account. The normal boot path
      // immediately hands this return to `signInWithOAuth`; the hook keeps the
      // collision observable for guided verification.
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
  return result.status === 'signed-in'
    ? { status: result.status, user: result.user, isNewSession: result.isNewSession }
    : result;
}

const indexedRepository = new DexieActiveSaveRepository();
const PREFER_GOOGLE_SIGN_IN_KEY = 'cat-mine-idle:prefer-google-sign-in';

/**
 * Server-milestone Step 18 §7.3: the genuine-fork saves a boot reconcile
 * deliberately did not write over. The local candidate is still in IndexedDB
 * and the remote candidate is carried here, so the save the player did not
 * choose is retained for the session and a future chooser can apply either one
 * verbatim. `null` whenever the last reconcile was not a fork.
 */
let pendingSaveConflict: CloudSaveReconcileOutcome | null = null;
let pendingPortfolioConflict: {
  readonly local: PortfolioSaveDocumentV4;
  readonly remote: PortfolioSaveDocumentV4;
  readonly remoteRevision: number;
} | null = null;
let accountIdentity: AccountIdentityView = {
  status: 'loading',
  userId: null,
  email: null,
};
let googleCollisionHandoffStarted = false;

function setAccountIdentity(next: AccountIdentityView): void {
  accountIdentity = next;
  accountSettingsModal?.refresh();
}

/**
 * Server-milestone Step 21: the facts `shouldExplainMissingLocalSave` needs,
 * joined from three independent sources. `sessionIsNew` comes from
 * `ensureGuestSession`; the local-save state comes from `loadActiveGame`, which
 * runs on its own boot path; the reconcile outcome comes from the network
 * round trip. Whichever finishes last calls `reportMissingLocalSaveIfNeeded`,
 * so nothing awaits anything else and a boot failure simply never reports.
 */
let sessionIsNew: boolean | null = null;
let localSaveState: LocalSaveState | null = null;
let reconcileOutcome: CloudSaveReconcileOutcome | null = null;
let missingLocalSaveNoticeReported = false;

/**
 * Server-milestone Step 22: whether a backend is configured, known
 * synchronously from Vite's injected env (the Supabase client itself is created
 * asynchronously). When true, the credited offline reward is the server's
 * `offlineGrant`; the local clock-derived calculation is only a projection and
 * is suppressed at load. When false, the client-only behaviour is unchanged.
 */
const backendConfigured = Boolean(
  supabaseApiUrl &&
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
);

/** The running driver, owned by `startApplication` and shared with the Step 22 grant application. */
let activeDriver: MineSimulationDriver | PortfolioMineRuntime | null = null;
let portfolioCloudCommands: PortfolioCloudCommands | null = null;
let portfolioCloudGateway: PortfolioCloudGateway | null = null;
let serverBoostState = EMPTY_BOOST_STATE;
let serverClockOffsetMs = 0;
let loadedForBoostProjection: Extract<ActiveGameLoadResult, { source: 'saved' }> | null = null;
let localProjectionEndMs = 0;
type CatCollectionUiStatus = 'loading' | 'ready' | 'stale' | 'error';
let catCollectionUiStatus: CatCollectionUiStatus = 'loading';
let pendingReward: PendingOfflineReward | null = null;
let rewardClaimed = false;

/**
 * Step 22 offline-reward state. The credited amount is chosen from the server's
 * grant and the client's projection by the pure `chooseOfflineReward` (see its
 * own module): the server figure is the ceiling, the local projection bounds it
 * to a closed interval, and the local projection is a fallback only where no
 * server figure can exist. Exactly one reward is presented, once the driver
 * exists — the download can finish before `startApplication`'s IndexedDB load,
 * or long after.
 */
let localProjectionReward: PendingOfflineReward | null = null;
let serverGrantReward: PendingOfflineReward | null = null;
/** The server receipt the pending grant was computed against; marked applied only once the reward is claimed and persisted. */
let offeredGrantReceivedAtMs: number | null = null;
/** Whether the reconcile has finished deciding, so an absent grant can fall back. */
let offlineDecisionMade = false;
/** Whether the local projection may be credited at all (unconfigured, no session, or `no-cloud-save`). */
let offlineFallbackAllowed = false;
let offlineRewardPresented = false;

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
 * a genuine fork. Local-only boot stays independent. Configured portfolio boot
 * waits for this chain because choosing a local or cloud source requires the
 * authenticated user id and server revision first.
 */
function triggerCloudSaveReconcile(): void {
  if (backendConfigured) return;
  void refreshServerBoostStatus()
    .then(() => runCloudSaveReconcile())
    .catch(
      (error: unknown): CloudSaveReconcileOutcome => ({
        kind: 'error',
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
    .then((outcome) => {
      pendingSaveConflict = outcome.kind === 'deferred-conflict' ? outcome : null;
      if (outcome.kind === 'deferred-conflict') {
        accountSettingsModal?.showConflict(toAccountConflictView(outcome));
      }

      // Step 19 §11: no upload runs before the reconcile settles. A download
      // that reported a revision armed the replica through
      // `onServerRevision` (only for `kept-local`/`same-progress`); every other
      // outcome means the client still has no revision to send, so arm with
      // null — the protocol's "this client has never synced." A fork stops
      // sync outright: the replica has no way to apply the player's unchosen
      // save, and re-uploading the local candidate would only earn the
      // identical `409` again. Step 21 adds `adopted-remote` to the stop set:
      // the page is reloading with the downloaded save, and a pending local
      // document must not be pumped against the server revision before the
      // reload lands.
      if (outcome.kind === 'deferred-conflict' || outcome.kind === 'adopted-remote') {
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

      // Server-milestone Step 21: tell a returning player the truth when there
      // is nothing to restore. The decision joins this outcome with
      // `loadActiveGame`'s local-save state, which may still be in flight.
      reconcileOutcome = outcome;
      reportMissingLocalSaveIfNeeded();

      // Server-milestone Step 22: the reconcile produced its grant (if any) via
      // `onOfflineGrant`; deciding now means a missing grant falls back to the
      // local projection instead of showing nothing.
      finishOfflineRewardDecision(outcome.kind === 'no-cloud-save');

      if (import.meta.env.DEV) {
        app.dataset.cloudSaveReconcile = JSON.stringify(
          toPublicReconcileDiagnostic(outcome),
        );
      }
    });
}

function localTimelineBoost(boost: BoostState): BoostState {
  return boost.lastActivatedAtMs === null
    ? EMPTY_BOOST_STATE
    : { lastActivatedAtMs: boost.lastActivatedAtMs - serverClockOffsetMs };
}

function adoptServerBoostState(
  boost: BoostState,
  serverNowMs?: number,
  boostMineId?: MineSiteId | null,
): void {
  // A status request started before activation must not replace a newer receipt.
  if ((boost.lastActivatedAtMs ?? 0) < (serverBoostState.lastActivatedAtMs ?? 0)) return;
  if (serverNowMs !== undefined) serverClockOffsetMs = serverNowMs - Date.now();
  serverBoostState = boost;
  if (boostMineId !== undefined && import.meta.env.DEV) {
    app.dataset.serverBoostMine = boostMineId ?? '';
  }
  const localBoost = localTimelineBoost(boost);
  const driver = activeDriver;
  if (driver !== null) {
    driver.advance();
    driver.replaceBoostState(localBoost);
  }
  if (loadedForBoostProjection !== null) {
    const loaded = loadedForBoostProjection;
    const recalculated = calculateOfflineIncome(
      loaded.loadedSave.state,
      loaded.loadedSave.savedAtTimestampMs,
      localProjectionEndMs,
      loaded.loadedSave.effectiveProductionRatePerSecond,
      BASE_GAME_BALANCE.offlineIncome,
      localBoost,
    );
    localProjectionReward = createPendingOfflineReward(
      loaded.offlineIncomeSettlementPersisted
        ? recalculated
        : { ...recalculated, reward: GameNumber.from(0) },
    );
  }
}

async function refreshServerBoostStatus(): Promise<void> {
  const client = await supabaseClientPromise;
  const accessToken = client === null
    ? null
    : (await client.auth.getSession()).data.session?.access_token ?? null;
  if (accessToken === null || !backendConfigured) return;
  try {
    const result = await requestBoostViaFetch(
      supabaseFunctionUrl('/functions/v1/boost'), accessToken, 'status',
    );
    adoptServerBoostState(result.boost, result.serverNowMs, result.boostMineId);
  } catch {
    // The save download still carries its own Boost state; activation retries on demand.
  }
}

/**
 * Server-milestone Step 21: a reused guest session with no local record at all
 * and no cloud save cannot be a new player, so the fresh mine they are about to
 * see is a reset — and they are told so instead of it happening silently. A
 * corrupt-but-present local save is *not* this case: it is reported by
 * `loadActiveGame`'s own warning, which this must never overwrite. Any other
 * outcome leaves the player restored or genuinely new, and reports nothing.
 *
 * Called from both sides of the join; whichever arrives last reports once.
 */
function reportMissingLocalSaveIfNeeded(): void {
  if (
    missingLocalSaveNoticeReported ||
    sessionIsNew === null ||
    localSaveState === null ||
    reconcileOutcome === null
  ) {
    return;
  }

  if (
    !shouldExplainMissingLocalSave({
      localSaveState,
      isNewSession: sessionIsNew,
      reconcileOutcome,
    })
  ) {
    return;
  }

  missingLocalSaveNoticeReported = true;
  saveDiagnostics.report({
    code: MISSING_LOCAL_SAVE_CODE,
    message: MISSING_LOCAL_SAVE_MESSAGE,
  });

  if (import.meta.env.DEV) {
    app.dataset.localSaveNotice = MISSING_LOCAL_SAVE_CODE;
  }
}

/** Turns `loadActiveGame`'s result into the three-way local-save state Step 21 needs. */
function localSaveStateFromLoadResult(loadResult: ActiveGameLoadResult): LocalSaveState {
  if (loadResult.source === 'saved') {
    return 'saved';
  }
  return loadResult.warning === null ? 'missing' : 'unreadable';
}

/**
 * Server-milestone Step 22: records the server's authoritative offline grant.
 * Called from the reconcile, which can finish before or after the driver load.
 * The grant is accepted once per stored receipt, and only when positive, but it
 * is **not** marked applied here — that happens only when the reward is claimed
 * and persisted (see the modal's claim handler), so a boot that ends before the
 * player claims does not burn an unclaimed reward.
 */
function applyServerOfflineGrant(
  grant: CloudSaveOfflineGrant,
  receivedAtMs: number,
): void {
  if (serverGrantReward !== null) {
    return;
  }

  const storage = getAvailableLocalStorage();

  // A reload between *claiming* this grant and its upload is already covered by
  // the on-claim mark; this guard catches a grant the guard has already paid.
  if (readAppliedOfflineGrantReceivedAtMs(storage) === receivedAtMs) {
    return;
  }

  let reward: GameNumber;
  try {
    reward = GameNumber.deserialize(grant.reward);
  } catch {
    return;
  }

  if (!reward.greaterThan(0)) {
    return;
  }

  serverGrantReward = { creditedDurationMs: grant.creditedDurationMs, reward };
  offeredGrantReceivedAtMs = receivedAtMs;
  maybePresentOfflineReward();

  if (import.meta.env.DEV) {
    app.dataset.offlineGrant = JSON.stringify({
      elapsedDurationMs: grant.elapsedDurationMs,
      creditedDurationMs: grant.creditedDurationMs,
      reward: grant.reward,
    });
  }
}

/**
 * Marks the offline-reward source decided. `allowsLocalFallback` is true only
 * when no server figure can exist for this boot: an unconfigured build or an
 * account with no cloud save (`204`). A **failed download** and a **failed
 * sign-in against a configured backend** are deliberately *not* fallbacks — the
 * server figure exists and was merely not reached, so nothing is credited and
 * the interval settles on the next boot that reaches the server. Otherwise
 * dropping one request, or clearing the auth entry, would hand the player the
 * device-clock cheat back.
 *
 * The recorded consequence: a configured build whose sign-in keeps failing (an
 * offline-only player with no session yet) gets no offline reward until a
 * sign-in lands. That is the safe direction, and a returning player with a
 * stored session reaches `signed-in` without the network and takes the strict
 * path anyway.
 */
function finishOfflineRewardDecision(allowsLocalFallback: boolean): void {
  offlineDecisionMade = true;
  offlineFallbackAllowed = !backendConfigured || allowsLocalFallback;
  maybePresentOfflineReward();
}

/**
 * Presents exactly one offline reward, once the driver exists and the decision
 * is possible. A positive server grant always decides it (bounded by the local
 * projection, so only a closed interval is credited); otherwise the decision
 * waits for the reconcile to declare that no server figure exists.
 */
function maybePresentOfflineReward(): void {
  if (offlineRewardPresented || activeDriver === null) {
    return;
  }

  if (serverGrantReward === null && !offlineDecisionMade) {
    return;
  }

  const choice = chooseOfflineReward({
    serverGrant: serverGrantReward,
    localProjection: localProjectionReward,
    fallbackAllowed: offlineFallbackAllowed,
  });

  offlineRewardPresented = true;

  if (choice === null) {
    return;
  }

  presentOfflineReward(choice);
}

/** Shows the offline-reward modal for a reward already decided to be authoritative. */
function presentOfflineReward(reward: PendingOfflineReward): void {
  pendingReward = reward;
  rewardClaimed = false;

  offlineRewardModal = showOfflineRewardModal({
    parent: app,
    pendingReward: reward,
    onClaim: async () => {
      const driver = activeDriver;

      if (driver === null) {
        return false;
      }

      // Guarded by `rewardClaimed`, not by a cached state candidate: the mine
      // keeps producing while the modal is open, so a retry after a failed write
      // must persist the state as it is now, having still added the reward
      // exactly once.
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
        driver.catRoster,
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
        // Step 22 review fix: burn the server receipt only now, once the
        // credited state is actually persisted. Marking it earlier (when the
        // grant arrived) could lose an unclaimed reward if the boot ended
        // before the player claimed.
        if (offeredGrantReceivedAtMs !== null) {
          markOfflineGrantApplied(getAvailableLocalStorage(), offeredGrantReceivedAtMs);
          offeredGrantReceivedAtMs = null;
        }

        offlineRewardModal = null;
      }

      return persisted;
    },
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
    serverRevision: candidate.serverRevision,
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
      downloadCloudSaveViaFetch(supabaseFunctionUrl('/functions/v1/save-sync/v1/save'), token),
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
    // Step 22: the credited offline reward is the server's grant, credited once
    // per stored `received_at`. It can arrive before `startApplication` has
    // built the driver; `applyServerOfflineGrant` holds it until then.
    onOfflineGrant: (grant, receivedAtMs) => applyServerOfflineGrant(grant, receivedAtMs),
    onBoostState: adoptServerBoostState,
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
      supabaseFunctionUrl('/functions/v1/save-sync/v1/save'),
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
    accountSettingsModal?.showConflict(
      toAccountConflictView({ kind: 'deferred-conflict', local, remote }),
    );
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
const portfolioIndexedRepository = new DexieActiveSaveRepository<PortfolioSaveDocumentV4>();
const portfolioJournal = new WebLifecycleSaveJournal<PortfolioSaveDocumentV4>(
  getAvailableLocalStorage(),
  BASE_GAME_BALANCE,
  validatePortfolioSaveDocument,
);
const portfolioLocalRepository = new LifecycleSafeActiveSaveRepository(
  portfolioIndexedRepository,
  portfolioJournal,
  BASE_GAME_BALANCE,
  validatePortfolioSaveDocument,
);
const portfolioPersistence = new SavePersistenceCoordinator(portfolioLocalRepository, {
  onDiagnostic: (diagnostic) => saveDiagnostics.report(diagnostic),
});
let game: ReturnType<typeof createGame> | null = null;
let offlineRewardModal: OfflineRewardModal | null = null;
let accountSettingsModal: AccountSettingsModal | null = null;
let leaderboardModal: LeaderboardModal | null = null;
let collectionModal: CollectionModal | null = null;
let catAssignmentModal: CatAssignmentModal | null = null;
let boostModal: BoostModal | null = null;
let mineMapModal: MineMapModal | null = null;
let unbindSaveLifecycle: (() => void) | null = null;
let unbindPortfolioResume: (() => void) | null = null;
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

accountSettingsModal = new AccountSettingsModal({
  parent: app,
  appVersion: import.meta.env.VITE_APP_VERSION?.trim() || 'dev',
  getIdentity: () => accountIdentity,
  onLogin: handleGoogleLogin,
  onLogout: handleLogout,
  onRetry: async () => {
    await refreshAccountIdentity();
    return { status: 'refreshed' };
  },
  onConflictChoice: handleConflictChoice,
});
leaderboardModal = new LeaderboardModal({
  parent: app,
  load: async () => {
    const client = await supabaseClientPromise;
    return loadLeaderboardViaFetch(
      supabaseFunctionUrl('/functions/v1/leaderboard-read'),
      client?.auth ?? null,
    );
  },
});
collectionModal = new CollectionModal({
  parent: app,
  getRoster: () => activeDriver instanceof PortfolioMineRuntime
    ? activeDriver.fullCatRoster
    : activeDriver?.catRoster ?? createEmptyCatRoster(),
  getStatus: () => catCollectionUiStatus,
  onRetry: () => {
    const driver = activeDriver;
    if (driver instanceof MineSimulationDriver) {
      void hydrateCatRoster(driver);
    }
  },
});
catAssignmentModal = new CatAssignmentModal({
  parent: app,
  getRoster: () => activeDriver?.catRoster ?? createEmptyCatRoster(),
  getHaulerCount: () => calculateSurfaceHaulerWorkforce(activeDriver?.state.warehouse.level ?? 1).visibleCount,
  assign: replaceAssignedCat,
});
boostModal = new BoostModal({
  parent: app,
  getBoostState: () => activeDriver?.boostState ?? EMPTY_BOOST_STATE,
  activate: activateMineBoost,
  now: () => Date.now(),
});

async function activateMineBoost(): Promise<BoostCommandResult> {
  const driver = activeDriver;
  if (driver === null) {
    return { kind: 'unavailable', message: 'The mine is still loading.' };
  }
  if (backendConfigured) {
    if (pendingReward !== null || pendingSaveConflict !== null) {
      return { kind: 'unavailable', message: 'Resolve the pending reward or save conflict first.' };
    }
    if (!(driver instanceof PortfolioMineRuntime)) {
      return { kind: 'unavailable', message: 'Portfolio progress is still loading.' };
    }
    try {
      if (!await flushPortfolioRoutine(driver)) {
        return { kind: 'unavailable', message: 'Save the active mine before activating Boost.' };
      }
      const client = await supabaseClientPromise;
      const accessToken = client === null
        ? null
        : (await client.auth.getSession()).data.session?.access_token ?? null;
      if (accessToken === null || portfolioCloudCommands === null) {
        return { kind: 'unavailable', message: 'Sign in to activate your free Boost.' };
      }
      const result = await requestBoostViaFetch(
        supabaseFunctionUrl('/functions/v1/boost'), accessToken, 'activate', {
          mineId: driver.activeMineId,
          baseRevision: portfolioCloudCommands.revision,
          idempotencyKey: globalThis.crypto.randomUUID(),
        },
      );
      if (result.kind === 'activated') {
        if (result.saveRevision === undefined ||
            !await adoptPortfolioExternalSave(driver, result.saveRevision)) {
          return { kind: 'unavailable', message: 'Boost activated in the cloud. Reload to continue.' };
        }
      }
      adoptServerBoostState(result.boost, result.serverNowMs, result.boostMineId);
      return result.kind === 'activated'
        ? { kind: 'activated', boost: result.boost }
        : { kind: 'cooldown', boost: result.boost };
    } catch {
      return { kind: 'unavailable', message: 'Boost service is unavailable. Try again.' };
    }
  }
  driver.advance();
  const result = activateBoost(driver.boostState, Date.now());
  if (result.kind === 'cooldown') {
    return { kind: 'cooldown', boost: driver.boostState };
  }
  if (driver instanceof PortfolioMineRuntime) {
    try {
      await commitPortfolioWithCoordinator(
        portfolioPersistence,
        { ...driver.portfolio, boostMineId: driver.activeMineId },
        driver.catRoster,
        Date.now(),
      );
    } catch {
      return { kind: 'unavailable', message: 'Local save is unavailable; Boost was not activated.' };
    }
    if (!writeLocalBoostState(getAvailableLocalStorage(), result.boost)) {
      return { kind: 'unavailable', message: 'Local storage is unavailable; Boost was not activated.' };
    }
    driver.bindBoostToActiveMine(result.boost);
    return result;
  }
  if (!writeLocalBoostState(getAvailableLocalStorage(), result.boost)) {
    return { kind: 'unavailable', message: 'Local storage is unavailable; Boost was not activated.' };
  }
  driver.replaceBoostState(result.boost);
  persistence.queueSave(createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now(), driver.catRoster));
  return result;
}

void startApplication();

function getPreferGoogleSignIn(): boolean {
  return getAvailableLocalStorage()?.getItem(PREFER_GOOGLE_SIGN_IN_KEY) === '1';
}

function setPreferGoogleSignIn(preferSignIn: boolean): void {
  const storage = getAvailableLocalStorage();
  if (storage === null) {
    return;
  }

  try {
    if (preferSignIn) {
      storage.setItem(PREFER_GOOGLE_SIGN_IN_KEY, '1');
    } else {
      storage.removeItem(PREFER_GOOGLE_SIGN_IN_KEY);
    }
  } catch {
    // Account routing is best effort; the normal guest-link path remains safe.
  }
}

function getGoogleLoginLabel(): string {
  return getPreferGoogleSignIn() ? 'Sign in with Google' : 'Continue with Google';
}

function clearGoogleIdentityErrorFromUrl(): void {
  const url = new URL(window.location.href);
  const errorKeys = ['error', 'error_code', 'error_description', 'error_uri'];
  let changed = false;

  for (const key of errorKeys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  for (const key of errorKeys) {
    if (hashParams.has(key)) {
      hashParams.delete(key);
      changed = true;
    }
  }
  const nextHash = hashParams.toString();
  if (url.hash !== (nextHash === '' ? '' : `#${nextHash}`)) {
    url.hash = nextHash;
    changed = true;
  }

  if (changed) {
    window.history.replaceState(null, document.title, url);
  }
}

async function refreshAccountIdentity(): Promise<void> {
  try {
    const client = await supabaseClientPromise;
    if (client === null) {
      setAccountIdentity({ status: 'unconfigured', userId: null, email: null });
      return;
    }

    const returnError = readGoogleIdentityReturnError(window.location.href);
    const collision = returnError?.code === 'identity_already_exists'
      || await detectGoogleIdentityCollision(client.auth);
    let handoffError: string | undefined;
    if (collision) {
      setPreferGoogleSignIn(true);
    }

    if (returnError?.code === 'identity_already_exists') {
      clearGoogleIdentityErrorFromUrl();
      if (!googleCollisionHandoffStarted) {
        googleCollisionHandoffStarted = true;
        const switchResult = await beginGoogleAccountSwitch(client.auth, window.location.origin);
        if (switchResult.status === 'redirecting') {
          return;
        }
        googleCollisionHandoffStarted = false;
        handoffError = switchResult.status === 'error'
          ? `Google sign-in could not continue: ${switchResult.reason}`
          : 'Google sign-in is not configured.';
      }
    } else if (returnError !== null) {
      clearGoogleIdentityErrorFromUrl();
    }

    const message = handoffError ?? (collision
      ? 'This Google account is already linked to another account. Select “Sign in with Google” to continue with that account.'
      : returnError?.description === null || returnError?.description === undefined
        ? undefined
        : `Google sign-in could not be completed: ${returnError.description}`);
    const messageTone = handoffError === undefined && collision ? 'info' : 'error';

    const { data, error } = await client.auth.getSession();
    const user = data.session?.user;
    if (error !== null) {
      setAccountIdentity({
        status: collision ? 'guest' : 'error',
        userId: null,
        email: null,
        googleLoginLabel: getGoogleLoginLabel(),
        message: message ?? describeError(error),
        messageTone,
      });
      return;
    }
    if (user === undefined) {
      setAccountIdentity({
        status: 'guest',
        userId: null,
        email: null,
        googleLoginLabel: getGoogleLoginLabel(),
        ...(message === undefined ? {} : {
          message,
          messageTone,
        }),
      });
      return;
    }

    const isGuest = user.is_anonymous === true;
    if (!isGuest) {
      setPreferGoogleSignIn(false);
    }
    setAccountIdentity({
      status: isGuest ? 'guest' : 'signed-in',
      userId: user.id,
      email: user.email ?? null,
      googleLoginLabel: isGuest ? getGoogleLoginLabel() : undefined,
      ...(message === undefined ? {} : {
        message,
        messageTone,
      }),
    });
  } catch (error) {
    setAccountIdentity({
      status: 'error',
      userId: null,
      email: null,
      message: describeError(error),
    });
  }
}

async function handleGoogleLogin(): Promise<AccountActionResult> {
  const client = await supabaseClientPromise;
  const result = getPreferGoogleSignIn()
    ? await beginGoogleAccountSwitch(client?.auth ?? null, window.location.origin)
    : await beginGoogleSignIn(client?.auth ?? null, window.location.origin);
  if (result.status === 'redirecting') {
    return result;
  }
  return result.status === 'error'
    ? result
    : { status: 'error', reason: 'Google sign-in is not configured.' };
}

async function handleLogout(): Promise<AccountActionResult> {
  const client = await supabaseClientPromise;
  const result = await signOutOfSession(client?.auth ?? null);
  if (result.status === 'error') {
    return result;
  }

  setPreferGoogleSignIn(true);
  disposed = true;
  localSavesSuspended = true;
  persistence.cancelScheduledSave();
  portfolioPersistence.cancelScheduledSave();
  cloudReplica.stop();
  unbindSaveLifecycle?.();
  unbindSaveLifecycle = null;
  if (saveHeartbeatId !== null) {
    window.clearInterval(saveHeartbeatId);
    saveHeartbeatId = null;
  }

  try {
    lifecycleJournal.clear();
    portfolioJournal.clear();
    portfolioIndexedRepository.close();
    await indexedRepository.deleteDatabase();
    indexedRepository.close();
    window.location.reload();
    return { status: 'ok' };
  } catch (error) {
    disposed = false;
    localSavesSuspended = false;
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function handleConflictChoice(
  choice: 'local' | 'remote',
): Promise<AccountActionResult> {
  const portfolioConflict = pendingPortfolioConflict;
  if (portfolioConflict !== null) {
    localSavesSuspended = true;
    try {
      let selected = portfolioConflict.remote;
      if (choice === 'local') {
        const gateway = portfolioCloudGateway;
        if (gateway === null) throw new Error('Cloud portfolio service is unavailable.');
        const uploaded = await gateway.upload(
          portfolioConflict.remoteRevision, portfolioConflict.local,
        );
        if (uploaded.kind !== 'ok') {
          throw new Error(uploaded.kind === 'rejected'
            ? `Cloud rejected this device save: ${uploaded.reason ?? uploaded.code}.`
            : 'Cloud progress changed again. Reload and review the latest saves.');
        }
        selected = uploaded.value.document;
      }
      await portfolioLocalRepository.storeActiveSave(selected);
      portfolioJournal.clear();
      pendingPortfolioConflict = null;
      window.location.reload();
      return { status: 'ok' };
    } catch (error) {
      localSavesSuspended = false;
      return {
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const conflict = pendingSaveConflict;
  if (conflict?.kind !== 'deferred-conflict') {
    return { status: 'error', reason: 'This save conflict is no longer available.' };
  }

  cloudReplica.stop();
  suspendLocalSavesForCloudAdopt();

  if (choice === 'remote') {
    try {
      unbindSaveLifecycle?.();
      unbindSaveLifecycle = null;
      await localRepository.storeActiveSave(conflict.remote.document);
      lifecycleJournal.clear();
      pendingSaveConflict = null;
      window.location.reload();
      return { status: 'ok' };
    } catch (error) {
      localSavesSuspended = false;
      return {
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const serverRevision = conflict.remote.serverRevision;
  if (serverRevision === undefined) {
    localSavesSuspended = false;
    return { status: 'error', reason: 'Cloud revision is unavailable; reload and try again.' };
  }

  const client = await supabaseClientPromise;
  const result = await uploadCloudSaveViaFetch(
    supabaseFunctionUrl('/functions/v1/save-sync/v1/save'),
    client?.auth ?? null,
    serverRevision,
    conflict.local.document,
  );
  if (result.kind !== 'accepted') {
    localSavesSuspended = false;
    return {
      status: 'error',
      reason: describeConflictChoiceUploadFailure(result),
    };
  }

  try {
    unbindSaveLifecycle?.();
    unbindSaveLifecycle = null;
    await localRepository.storeActiveSave(conflict.local.document);
    lifecycleJournal.clear();
    pendingSaveConflict = null;
    window.location.reload();
    return { status: 'ok' };
  } catch (error) {
    localSavesSuspended = false;
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function describeConflictChoiceUploadFailure(
  result: Exclude<Awaited<ReturnType<typeof uploadCloudSaveViaFetch>>, { kind: 'accepted' }>,
): string {
  if (result.kind === 'unconfigured') {
    return 'Cloud account services are not configured.';
  }
  if (result.kind === 'conflict') {
    return 'The cloud save changed again. Reload and choose a branch again.';
  }
  return result.message;
}

function toAccountConflictView(
  outcome: Extract<CloudSaveReconcileOutcome, { kind: 'deferred-conflict' }>,
): AccountConflictView {
  return {
    local: toAccountConflictCandidate(outcome.local, 'This device'),
    remote: toAccountConflictCandidate(outcome.remote, 'Cloud save'),
  };
}

function toAccountConflictCandidate(
  candidate: SaveConflictCandidate,
  title: string,
): AccountConflictCandidateView {
  return {
    title,
    lastPlayedLabel: `Last played: ${new Date(candidate.lastPlayedMs).toLocaleString()}`,
    goldLabel: `Gold: ${formatAmount(candidate.gold)}`,
    floorsOpenLabel: `Floors open: ${candidate.floorsOpen}`,
    deepestShaftLabel: `Deepest shaft: ${candidate.deepestShaftLevel}`,
    deliveredLabel: `Gold delivered: ${formatAmount(candidate.totalGoldDelivered)}`,
  };
}

function toPortfolioAccountConflictView(
  local: PortfolioSaveDocumentV4,
  remote: PortfolioSaveDocumentV4,
): AccountConflictView {
  const candidate = (
    document: PortfolioSaveDocumentV4,
    title: string,
  ): AccountConflictCandidateView => {
    const mines = Object.values(document.mines).filter((mine) => mine !== undefined);
    const floors = mines.flatMap((mine) => mine.state.floors);
    const delivered = mines.reduce(
      (sum, mine) => sum.add(GameNumber.from(mine.state.warehouse.totalGoldDelivered)),
      GameNumber.from(0),
    );
    return {
      title,
      lastPlayedLabel: `Last played: ${new Date(document.savedAtTimestampMs).toLocaleString()}`,
      goldLabel: `Gold: ${formatAmount(GameNumber.from(document.walletGold))}`,
      floorsOpenLabel: `Floors open: ${floors.filter((floor) => floor.isUnlocked).length}`,
      deepestShaftLabel: `Deepest shaft: ${Math.max(...floors.map((floor) => floor.mineShaftLevel))}`,
      deliveredLabel: `Gold delivered: ${formatAmount(delivered)}`,
    };
  };
  return {
    local: candidate(local, 'This device'),
    remote: candidate(remote, 'Cloud save'),
  };
}

/** Sends the minimum assignment command and applies only an authoritative projection. */
async function purchaseMarketplaceCat(assetId: string): Promise<MarketplacePurchaseResult> {
  const driver = activeDriver;
  if (driver === null || localSavesSuspended) {
    return { kind: 'unavailable', reason: 'offline' };
  }

  // Bring the local simulation to the purchase boundary. The server remains
  // authoritative for the wallet: it locks the save row, checks the exact
  // price, deducts once, and creates the owned instance in one transaction.
  driver.advance();
  if (driver instanceof PortfolioMineRuntime &&
      !await flushPortfolioRoutine(driver)) {
    return { kind: 'unavailable', reason: 'offline' };
  }
  let client: SupabaseClient | null;
  try {
    client = await supabaseClientPromise;
  } catch {
    return { kind: 'unavailable', reason: 'offline' };
  }

  const result = await purchaseCatViaFetch(
    supabaseFunctionUrl('/functions/v1/cat-collection'),
    client?.auth ?? null,
    assetId,
    createIdempotencyKey('cat-purchase'),
  );
  if (import.meta.env.DEV) app.dataset.portfolioCatPurchase = JSON.stringify(result);

  if (result.kind !== 'applied') {
    return result;
  }
  if (result.walletGold === undefined || result.saveRevision === undefined) {
    return { kind: 'unavailable', reason: 'invalid-response' };
  }

  if (driver instanceof PortfolioMineRuntime) {
    if (!await adoptPortfolioExternalSave(driver, result.saveRevision)) {
      return { kind: 'unavailable', reason: 'offline' };
    }
  } else {
    driver.replaceState({ ...driver.state, gold: GameNumber.from(result.walletGold) });
    driver.replaceCatRoster(result.roster);
    // The purchase RPC increments the save revision outside the normal local
    // repository path. Adopt that revision before the updated local document
    // is offered to the V3 cloud replica.
    cloudReplica.acceptExternalRevision(result.saveRevision);
  }
  catCollectionUiStatus = 'ready';
  collectionModal?.refresh();
  catAssignmentModal?.refresh();

  if (!(driver instanceof PortfolioMineRuntime)) {
    const purchasedDocument = createSaveDocument(
      driver.state, BASE_GAME_BALANCE, Date.now(), driver.catRoster,
    );
    persistence.queueSave(purchasedDocument);
    await persistence.flush();
    repository.forceCloudUpload(purchasedDocument);
  }
  return { kind: 'applied' };
}

const marketplaceEdgeFunctionUrl = () =>
  supabaseFunctionUrl('/functions/v1/cat-collection');

async function loadMarketplaceListings(
  listingType: MarketplaceListingType | null,
  mineOnly: boolean,
): Promise<MarketplaceListingsResult> {
  let client: SupabaseClient | null;
  try {
    client = await supabaseClientPromise;
  } catch {
    return { kind: 'unavailable', reason: 'offline' };
  }
  return loadMarketplaceListingsViaFetch(
    marketplaceEdgeFunctionUrl(),
    client?.auth ?? null,
    listingType,
    mineOnly,
  );
}

async function createMarketplaceListing(command: {
  readonly catInstanceId: string;
  readonly listingType: MarketplaceListingType;
  readonly priceExact: string;
}): Promise<MarketplaceCommandResult> {
  return sendMarketplaceCommand((client) => createMarketplaceListingViaFetch(
    marketplaceEdgeFunctionUrl(),
    client?.auth ?? null,
    { ...command, idempotencyKey: createIdempotencyKey('cat-listing') },
  ));
}

async function cancelMarketplaceListing(listingId: string): Promise<MarketplaceCommandResult> {
  return sendMarketplaceCommand((client) => cancelMarketplaceListingViaFetch(
    marketplaceEdgeFunctionUrl(),
    client?.auth ?? null,
    listingId,
    createIdempotencyKey('cat-listing-cancel'),
  ));
}

async function buyMarketplaceListing(listingId: string): Promise<MarketplaceCommandResult> {
  return sendMarketplaceCommand((client) => buyMarketplaceListingViaFetch(
    marketplaceEdgeFunctionUrl(),
    client?.auth ?? null,
    listingId,
    createIdempotencyKey('cat-listing-buy'),
  ), true);
}

async function rentMarketplaceListing(listingId: string, durationHours: number): Promise<MarketplaceCommandResult> {
  return sendMarketplaceCommand((client) => rentMarketplaceListingViaFetch(
    marketplaceEdgeFunctionUrl(),
    client?.auth ?? null,
    listingId,
    durationHours,
    createIdempotencyKey('cat-listing-rent'),
  ), true);
}

async function sendMarketplaceCommand(
  request: (client: SupabaseClient | null) => Promise<MarketplaceCommandResult>,
  _walletChanges = false,
): Promise<MarketplaceCommandResult> {
  const driver = activeDriver;
  if (driver === null || localSavesSuspended) {
    return { kind: 'unavailable', reason: 'offline' };
  }
  driver.advance();
  if (driver instanceof PortfolioMineRuntime &&
      !await flushPortfolioRoutine(driver)) {
    return { kind: 'unavailable', reason: 'offline' };
  }
  let client: SupabaseClient | null;
  try {
    client = await supabaseClientPromise;
  } catch {
    return { kind: 'unavailable', reason: 'offline' };
  }
  const result = await request(client);
  if (import.meta.env.DEV) app.dataset.portfolioMarketplaceCommand = JSON.stringify(result);
  if (result.kind !== 'applied' || disposed || activeDriver !== driver) {
    return result;
  }
  if (driver instanceof PortfolioMineRuntime &&
      (result.walletGold === undefined || result.saveRevision === undefined)) {
    return { kind: 'unavailable', reason: 'invalid-response' };
  }
  if (_walletChanges && (result.walletGold === undefined || result.saveRevision === undefined)) {
    return { kind: 'unavailable', reason: 'invalid-response' };
  }

  if (driver instanceof PortfolioMineRuntime) {
    if (!await adoptPortfolioExternalSave(driver, result.saveRevision!)) {
      return { kind: 'unavailable', reason: 'offline' };
    }
  } else {
    driver.replaceCatRoster(result.roster);
    if (result.walletGold !== undefined && result.saveRevision !== undefined) {
      driver.replaceState({ ...driver.state, gold: GameNumber.from(result.walletGold) });
      cloudReplica.acceptExternalRevision(result.saveRevision);
    }
  }
  catCollectionUiStatus = 'ready';
  collectionModal?.refresh();
  catAssignmentModal?.refresh();

  if (!(driver instanceof PortfolioMineRuntime)) {
    const document = createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now(), driver.catRoster);
    persistence.queueSave(document);
    await persistence.flush();
    if (result.walletGold !== undefined) repository.forceCloudUpload(document);
  }
  return result;
}

function createIdempotencyKey(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${randomUuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/** Sends the minimum assignment command and applies only an authoritative projection. */
async function replaceAssignedCat(
  command: CatAssignmentCommand,
): Promise<CatAssignmentCommandResult> {
  const driver = activeDriver;
  if (driver === null) {
    return { kind: 'unavailable', reason: 'offline' };
  }

  if (driver instanceof PortfolioMineRuntime) {
    if (backendConfigured) {
      if (!await flushPortfolioRoutine(driver)) {
        return { kind: 'unavailable', reason: 'offline' };
      }
      const client = await supabaseClientPromise;
      const qualifiedSlot = qualifyMineCatSlot(
        driver.activeMineId, command.slotKey as BareCatSlotKey,
      );
      const result = await replaceCatAssignmentViaFetch(
        supabaseFunctionUrl('/functions/v1/cat-collection'),
        client?.auth ?? null,
        { ...command, slotKey: qualifiedSlot },
      );
      if (import.meta.env.DEV) app.dataset.portfolioAssignment = JSON.stringify(result);
      if (result.kind !== 'applied' || result.walletGold === undefined ||
          result.saveRevision === undefined) return result;
      if (!await adoptPortfolioExternalSave(driver, result.saveRevision)) {
        return { kind: 'unavailable', reason: 'offline' };
      }
      collectionModal?.refresh();
      catAssignmentModal?.refresh();
      return { kind: 'applied', roster: driver.catRoster };
    }
    const result = await driver.assignCatDurably(
      command.slotKey,
      command.catInstanceId,
      command.expectedAssignmentRevision,
      async (portfolio, roster, savedAtMs) => {
        await commitPortfolioWithCoordinator(
          portfolioPersistence, portfolio, roster, savedAtMs,
        );
      },
    );
    if (!result.success) {
      return result.reason === 'save-failed' || result.reason === 'busy'
        ? { kind: 'unavailable', reason: result.reason }
        : { kind: 'rejected', code: result.reason };
    }
    collectionModal?.refresh();
    catAssignmentModal?.refresh();
    return { kind: 'applied', roster: driver.catRoster };
  }

  const client = await supabaseClientPromise;
  const result = await replaceCatAssignmentViaFetch(
    supabaseFunctionUrl('/functions/v1/cat-collection'),
    client?.auth ?? null,
    command,
  );

  if (result.kind !== 'applied' || disposed || activeDriver !== driver) {
    return result;
  }

  driver.replaceCatRoster(result.roster);
  catCollectionUiStatus = 'ready';
  collectionModal?.refresh();
  catAssignmentModal?.refresh();
  if (!localSavesSuspended) {
    persistence.queueSave(
      createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now(), driver.catRoster),
    );
    // Assignment is a player-visible identity change. Wait for the local
    // snapshot to commit before reporting success so a reload cannot race the
    // debounced writer and resurrect the previous assigned cat.
    await persistence.flush();
  }

  return result;
}

async function flushPortfolioRoutine(driver: PortfolioMineRuntime): Promise<boolean> {
  const commands = portfolioCloudCommands;
  if (commands === null) return false;
  driver.advance();
  const document = createPortfolioSaveDocument(
    driver.portfolio, Date.now(), driver.fullCatRoster,
  );
  const result = await commands.syncRoutine(document);
  if (import.meta.env.DEV) app.dataset.portfolioRoutineSync = JSON.stringify(result);
  if (result.kind !== 'ok') return false;
  try {
    await portfolioLocalRepository.storeActiveSave(result.value.document);
    return true;
  } catch {
    saveDiagnostics.report({
      code: 'portfolio-local-save-failed',
      message: 'The cloud saved your mine, but this device could not keep a local copy.',
    });
    return true;
  }
}

/**
 * Collection and Marketplace RPCs mutate the relational roster and the V4
 * save in one server transaction. Download that exact revision instead of
 * rebuilding a nearby document from the UI projection: the next routine save
 * must carry byte-equivalent roster semantics for the server's `cats` bound.
 */
async function adoptPortfolioExternalSave(
  driver: PortfolioMineRuntime,
  revision: number,
): Promise<boolean> {
  const commands = portfolioCloudCommands;
  const gateway = portfolioCloudGateway;
  if (commands === null || gateway === null || activeDriver !== driver) return false;

  const downloaded = await gateway.download();
  if (downloaded.kind !== 'ok' || downloaded.value.revision !== revision) {
    saveDiagnostics.report({
      code: 'portfolio-external-save-conflict',
      message: 'The account changed in the cloud. Reload before making another account change.',
    });
    return false;
  }

  try {
    const document = validatePortfolioSaveDocument(downloaded.value.document);
    const adopted = deserializePortfolioSaveDocument(document);
    commands.acceptExternalRevision(revision);
    driver.adoptPortfolio(adopted.portfolio, adopted.catRoster);
    await portfolioLocalRepository.storeActiveSave(document);
    return true;
  } catch {
    saveDiagnostics.report({
      code: 'portfolio-external-save-invalid',
      message: 'The cloud update could not be applied on this device. Reload to retry.',
    });
    return false;
  }
}

/** Hydrates the server-authoritative cat projection without delaying first paint. */
async function hydrateCatRoster(driver: MineSimulationDriver): Promise<void> {
  catCollectionUiStatus = 'loading';
  collectionModal?.refresh();
  let client: SupabaseClient | null;
  try {
    client = await supabaseClientPromise;
  } catch {
    // The SDK is lazy-loaded and a stale or unavailable chunk must not turn
    // the best-effort Collection hydration into an unhandled page error. The
    // local roster remains the safe projection for this session.
    if (disposed || activeDriver !== driver) {
      return;
    }
    catCollectionUiStatus = driver.catRoster.cats.length > 0 ? 'stale' : 'error';
    collectionModal?.refresh();
    return;
  }
  const result = await loadCatCollectionViaFetch(
    supabaseFunctionUrl('/functions/v1/cat-collection/v1/collection'),
    client?.auth ?? null,
  );

  if (disposed || activeDriver !== driver) {
    return;
  }

  if (result.kind !== 'ready') {
    catCollectionUiStatus = result.reason === 'unconfigured'
      ? 'ready'
      : driver.catRoster.cats.length > 0
        ? 'stale'
        : 'error';
    collectionModal?.refresh();
    return;
  }

  driver.replaceCatRoster(result.roster);
  catCollectionUiStatus = 'ready';
  collectionModal?.refresh();
  if (localSavesSuspended) {
    return;
  }

  const hydratedDocument = createSaveDocument(
    driver.state,
    BASE_GAME_BALANCE,
    Date.now(),
    driver.catRoster,
  );
  persistence.queueSave(hydratedDocument);
  void persistence.flush();
}

async function startApplication(): Promise<void> {
  await Promise.all([
    document.fonts.load('600 16px Fredoka'),
    document.fonts.load('700 16px Fredoka'),
  ]);

  if (disposed) {
    return;
  }

  if (backendConfigured) {
    await startConfiguredPortfolioApplication();
    return;
  }

  if (!backendConfigured) {
    await startLocalPortfolioApplication();
    return;
  }

  const localBoostState = backendConfigured
    ? localTimelineBoost(serverBoostState)
    : readLocalBoostState(getAvailableLocalStorage());
  const loadNowMs = Date.now();
  const loadResult = await loadActiveGame(
    persistence,
    BASE_GAME_BALANCE,
    loadNowMs,
    {
      onWarning: (warning) => saveDiagnostics.report(warning),
      boostState: localBoostState,
    },
  );

  // Step 21: record the local-save state (`saved` / `missing` / `unreadable`)
  // for the missing-local-save notice, then re-run the decision — the reconcile
  // may already have finished while this was loading.
  localSaveState = localSaveStateFromLoadResult(loadResult);
  if (loadResult.source === 'saved') {
    loadedForBoostProjection = loadResult;
    localProjectionEndMs = loadNowMs;
  }
  reportMissingLocalSaveIfNeeded();

  if (disposed) {
    return;
  }

  // The driver owns authoritative state from here on. `Date.now` is injected so
  // it stays the only wall clock in the application, and the renderer pulls
  // snapshots from the driver rather than pushing frames into the core.
  const driver = new MineSimulationDriver({
    state: loadResult.state,
    catRoster: loadResult.catRoster,
    boostState: backendConfigured ? localTimelineBoost(serverBoostState) : localBoostState,
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
        createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now(), driver.catRoster),
      );
    },
  });

  // Step 22: the driver now exists, so the offline reward can be presented —
  // the server grant if one arrived, the local projection otherwise, exactly
  // once, once the source is decided.
  activeDriver = driver;
  catCollectionUiStatus = 'ready';
  void hydrateCatRoster(driver);
  localProjectionReward = createPendingOfflineReward(loadResult.offlineIncome);
  if (backendConfigured && loadResult.source === 'saved' && serverBoostState !== EMPTY_BOOST_STATE) {
    adoptServerBoostState(serverBoostState);
  }
  maybePresentOfflineReward();

  game = createGame(gameViewport, driver, {
    onBoost: (onClosed) => {
      if (boostModal === null) {
        onClosed();
        return;
      }
      boostModal.open(onClosed);
    },
    onMarketplacePurchase: purchaseMarketplaceCat,
    getWalletGold: () => activeDriver?.state.gold.serialize() ?? null,
    getCollection: () => activeDriver?.catRoster ?? createEmptyCatRoster(),
    loadMarketplaceListings,
    onCreateMarketplaceListing: createMarketplaceListing,
    onCancelMarketplaceListing: cancelMarketplaceListing,
    onBuyMarketplaceListing: buyMarketplaceListing,
    onRentMarketplaceListing: rentMarketplaceListing,
    onSettings: (onClosed) => {
      if (accountSettingsModal === null) {
        onClosed();
        return;
      }

      accountSettingsModal.open(onClosed);
    },
    onLeaderboard: (onClosed) => {
      if (leaderboardModal === null) {
        onClosed();
        return;
      }

      leaderboardModal.open(onClosed);
    },
    onCollection: (onClosed) => {
      if (collectionModal === null) {
        onClosed();
        return;
      }

      collectionModal.open(onClosed);
    },
    onCatSlot: (slotKey, onClosed) => {
      if (catAssignmentModal === null) {
        onClosed();
        return;
      }

      catAssignmentModal.open(slotKey, onClosed);
    },
  });
  unbindSaveLifecycle = bindSaveLifecycle(
    persistence,
    () => {
      // A lifecycle event can land between rendered frames. Bring the
      // authoritative state exactly to the event's wall-clock boundary before
      // stamping the document; otherwise `savedAtTimestampMs` would consume
      // that final foreground interval without either simulating it now or
      // making it eligible for offline income after a reload.
      driver.advance();

      return createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now(), driver.catRoster);
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
      createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now(), driver.catRoster),
    );
  }, SAVE_HEARTBEAT_MS);
}

async function startConfiguredPortfolioApplication(): Promise<void> {
  await initialAuthSettled;
  const storage = getAvailableLocalStorage();
  let client: SupabaseClient | null;
  let session: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>['data']['session'];
  try {
    client = await supabaseClientPromise;
    session = client === null ? null : (await client.auth.getSession()).data.session;
  } catch {
    saveDiagnostics.report({
      code: 'portfolio-session-unavailable',
      message: 'Cloud account services are unavailable. Progress will stay on this device.',
    });
    if (storage !== null) await startLocalPortfolioApplication();
    return;
  }
  if (client === null || session === null || storage === null || supabaseApiUrl === null) {
    saveDiagnostics.report({
      code: 'portfolio-session-unavailable',
      message: 'Cloud account services are unavailable. Progress will stay on this device.',
    });
    if (storage !== null) await startLocalPortfolioApplication();
    return;
  }
  await refreshServerBoostStatus();
  const gateway = new PortfolioCloudGateway(
    supabaseFunctionUrl('/functions/v1/save-sync'), client.auth,
  );
  portfolioCloudGateway = gateway;
  let boot: Awaited<ReturnType<typeof bootstrapPortfolioCloudSession>>;
  try {
    boot = await bootstrapPortfolioCloudSession({
      repository: portfolioLocalRepository,
      storage,
      gateway,
      userId: session.user.id,
      nowMs: Date.now(),
      boost: localTimelineBoost(serverBoostState),
      returningAccount: sessionIsNew === false,
      newKey: () => globalThis.crypto.randomUUID(),
      claimWithAction: (reward, mineId, claim) => new Promise((resolve) => {
        offlineRewardModal = showOfflineRewardModal({
          parent: app,
          pendingReward: reward,
          mineId,
          onClaim: async () => {
            const result = await claim();
            if (result.kind !== 'ready') return false;
            resolve(result);
            return true;
          },
        });
      }),
    });
  } catch {
    saveDiagnostics.report({
      code: 'portfolio-deferred',
      message: 'Cloud progress could not be synchronized. You can keep playing on this device and retry after reloading.',
    });
    await startLocalPortfolioApplication({ cloudPendingUserId: session.user.id });
    return;
  }
  if (import.meta.env.DEV) {
    app.dataset.portfolioBoot = JSON.stringify(
      boot.kind === 'ready'
        ? { kind: boot.kind, revision: boot.commands.revision }
        : { kind: boot.kind, reason: boot.kind === 'deferred' ? boot.reason : 'fork' },
    );
    if (boot.kind === 'conflict') {
      app.dataset.portfolioConflict = JSON.stringify({
        local: {
          activeMineId: boot.local.activeMineId,
          walletGold: boot.local.walletGold,
          savedAtTimestampMs: boot.local.savedAtTimestampMs,
        },
        remote: {
          activeMineId: boot.remote.activeMineId,
          walletGold: boot.remote.walletGold,
          savedAtTimestampMs: boot.remote.savedAtTimestampMs,
        },
        remoteRevision: boot.remoteRevision,
      });
    }
  }
  if (boot.kind !== 'ready') {
    if (boot.kind === 'conflict') {
      pendingPortfolioConflict = {
        local: boot.local,
        remote: boot.remote,
        remoteRevision: boot.remoteRevision,
      };
      accountSettingsModal?.showConflict(
        toPortfolioAccountConflictView(boot.local, boot.remote),
      );
    }
    const deferredReason = boot.kind === 'deferred' ? boot.reason : null;
    saveDiagnostics.report(deferredReason === 'local-save-missing'
      ? {
          code: 'local-save-missing',
          message: 'This returning account has no local or cloud save. A new local game was opened without replacing cloud progress.',
        }
      : deferredReason === 'corrupt-local-save'
        ? {
            code: 'corrupt-save',
            message: 'Local progress could not be read. The saved data has been preserved.',
          }
        : {
            code: `portfolio-${boot.kind}`,
            message: boot.kind === 'conflict'
              ? 'Your device and cloud have different mine progress. Both copies are preserved.'
              : 'Cloud progress could not be synchronized. You can keep playing on this device and retry after reloading.',
          });
    if (boot.kind === 'deferred' && boot.reason !== 'corrupt-local-save') {
      // A network outage or a server refusal must not strand the player on an
      // empty shell. The local portfolio remains the only writable candidate;
      // cloud-only commands stay unavailable until a later clean boot.
      await startLocalPortfolioApplication({ cloudPendingUserId: session.user.id });
    }
    return;
  }
  if (disposed) return;
  if (import.meta.env.DEV) {
    app.dataset.cloudSaveReconcile = JSON.stringify({
      kind: 'same-progress', schemaVersion: 4,
    });
    app.dataset.cloudSaveUpload = JSON.stringify({
      kind: 'uploaded', schemaVersion: 4,
    });
  }
  portfolioCloudCommands = boot.commands;
  const loaded = deserializePortfolioSaveDocument(boot.document);
  const runtime = new PortfolioMineRuntime({
    portfolio: loaded.portfolio,
    catRoster: loaded.catRoster,
    boostState: localTimelineBoost(serverBoostState),
    now: () => Date.now(),
    onCommandApplied: (next) => {
      if (!localSavesSuspended) {
        portfolioPersistence.queueSave(createPortfolioSaveDocument(
          next, Date.now(), runtime.fullCatRoster,
        ));
      }
    },
  });
  activeDriver = runtime;
  catCollectionUiStatus = 'ready';
  const scene = (): BootScene => {
    if (game === null) throw new Error('The mine scene is still loading.');
    return game.scene.getScene(BOOT_SCENE_KEY) as BootScene;
  };
  const accept = async (accepted: PortfolioCloudAccepted): Promise<void> => {
    const adopted = deserializePortfolioSaveDocument(accepted.document);
    runtime.adoptPortfolio(adopted.portfolio, adopted.catRoster);
    try {
      await portfolioLocalRepository.storeActiveSave(accepted.document);
    } catch {
      saveDiagnostics.report({
        code: 'portfolio-local-save-failed',
        message: 'The cloud saved your mine, but this device could not keep a local copy.',
      });
    }
    collectionModal?.refresh();
    catAssignmentModal?.refresh();
  };
  const commandDocument = (): PortfolioSaveDocumentV4 => {
    runtime.advance();
    return createPortfolioSaveDocument(
      runtime.portfolio,
      runtime.state.lastUpdateTimestampMs,
      runtime.fullCatRoster,
    );
  };
  const acceptCommand = async (accepted: PortfolioCloudAccepted): Promise<boolean> => {
    await accept(accepted);
    const completed = await boot.commands.completePending();
    if (!completed) {
      saveDiagnostics.report({
        code: 'portfolio-command-journal-failed',
        message: 'The cloud saved this action, but its local receipt could not be closed.',
      });
    }
    return completed;
  };
  const pendingEntryMineId = (): MineSiteId | null => {
    const pending = boot.commands.pending;
    return pending?.type === 'enter' ? pending.mineId : null;
  };
  const settlePendingEntry = async (
    accepted: PortfolioCloudAccepted,
  ): Promise<boolean> => {
    const mineId = pendingEntryMineId();
    if (mineId === null || runtime.portfolio.activeMineId !== mineId) {
      return await acceptCommand(accepted);
    }
    const mine = runtime.portfolio.mines[mineId];
    const result = accepted.result;
    const grant = result !== undefined && typeof result.grant === 'object' &&
        result.grant !== null && !Array.isArray(result.grant)
      ? result.grant as Record<string, unknown> : null;
    const claimedSequence = result?.claimedSequence;
    if (mine?.pendingClaim !== null && mine?.pendingClaim !== undefined) {
      if (!Number.isSafeInteger(claimedSequence) ||
          claimedSequence !== mine.pendingClaim.sequence ||
          typeof grant?.reward !== 'string') {
        saveDiagnostics.report({
          code: 'portfolio-entry-receipt-invalid',
          message: 'The mine-entry receipt did not match the pending reward. Reload before claiming it.',
        });
        return false;
      }
      runtime.settlePendingClaim(
        mineId,
        claimedSequence as number,
        GameNumber.from(grant.reward),
      );
    }
    const merged = createPortfolioSaveDocument(
      runtime.portfolio,
      Date.now(),
      runtime.fullCatRoster,
    );
    try {
      await portfolioLocalRepository.storeActiveSave(merged);
    } catch {
      saveDiagnostics.report({
        code: 'portfolio-local-save-failed',
        message: 'The reward is validated, but this device could not save its settlement.',
      });
      return false;
    }
    if (!await boot.commands.completePending()) return false;
    const synced = await boot.commands.syncRoutine(merged);
    if (synced.kind === 'ok') {
      await accept(synced.value);
    }
    mineMapModal?.refresh();
    saveDiagnostics.dismiss('portfolio-entry-pending');
    return true;
  };
  let pendingEntryRetry: Promise<boolean> | null = null;
  const retryPendingEntry = (): Promise<boolean> => {
    if (pendingEntryRetry !== null) return pendingEntryRetry;
    pendingEntryRetry = (async () => {
      const command = boot.commands.pending;
      if (command?.type !== 'enter') return false;
      const replayed = await boot.commands.retryPending();
      return replayed.kind === 'ok'
        ? await settlePendingEntry(replayed.value)
        : false;
    })().finally(() => { pendingEntryRetry = null; });
    return pendingEntryRetry;
  };

  mineMapModal = new MineMapModal({
    parent: app,
    getPortfolio: () => runtime.portfolio,
    getPendingMineId: pendingEntryMineId,
    previewOfflineReward: (mineId) => runtime.previewOfflineReward(mineId),
    buyMine: async (mineId) => {
      const result = await boot.commands.execute(
        { type: 'purchase', mineId }, commandDocument(),
      );
      if (result.kind !== 'ok') {
        return { ok: false, message: 'Mine purchase is pending. Check your connection and try again.' };
      }
      await acceptCommand(result.value);
      return { ok: true };
    },
    enterMine: async (mineId) => {
      try {
        await scene().prepareSiteArt(mineId);
        const sourceDocument = commandDocument();
        const release = runtime.beginCloudCommand();
        let result: Awaited<ReturnType<typeof boot.commands.execute>>;
        try {
          result = await boot.commands.execute(
            { type: 'enter', mineId }, sourceDocument,
          );
        } finally {
          release();
        }
        if (result.kind !== 'ok') {
          if (result.kind === 'unavailable' && pendingEntryMineId() === mineId) {
            const provisional = runtime.enterMineWithPendingClaim(
              mineId,
              sourceDocument.savedAtTimestampMs,
            );
            if (provisional.status === 'entered') {
              await portfolioLocalRepository.storeActiveSave(
                createPortfolioSaveDocument(
                  runtime.portfolio,
                  sourceDocument.savedAtTimestampMs,
                  runtime.fullCatRoster,
                ),
              );
              scene().activateSiteArt(mineId);
              saveDiagnostics.report({
                code: 'portfolio-entry-pending',
                message: 'You can play this mine. Its offline reward will stay pending until the cloud validates it.',
              });
              return { ok: true };
            }
          }
          return { ok: false, message: 'Mine entry is pending. Check your connection and try again.' };
        }
        await acceptCommand(result.value);
        scene().activateSiteArt(mineId);
        return { ok: true };
      } catch {
        return { ok: false, message: 'Could not load this mine. Please try again.' };
      }
    },
  });
  game = createGame(gameViewport, runtime, {
    onMap: (onClosed) => mineMapModal?.open(onClosed),
    onBoost: (onClosed) => boostModal?.open(onClosed),
    onSettings: (onClosed) => accountSettingsModal?.open(onClosed),
    onLeaderboard: (onClosed) => leaderboardModal?.open(onClosed),
    onCollection: (onClosed) => collectionModal?.open(onClosed),
    onCatSlot: (slotKey, onClosed) => catAssignmentModal?.open(slotKey, onClosed),
    onMarketplacePurchase: purchaseMarketplaceCat,
    getWalletGold: () => runtime.state.gold.serialize(),
    getCollection: () => runtime.fullCatRoster,
    loadMarketplaceListings,
    onCreateMarketplaceListing: createMarketplaceListing,
    onCancelMarketplaceListing: cancelMarketplaceListing,
    onBuyMarketplaceListing: buyMarketplaceListing,
    onRentMarketplaceListing: rentMarketplaceListing,
  });

  let resumePending = false;
  let lifecycleSuspendPromise: Promise<void> | null = null;
  const resumeConfiguredMine = async (): Promise<void> => {
    if (resumePending) return;
    resumePending = true;
    const mineScene = scene();
    mineScene.input.enabled = false;
    const finish = (succeeded: boolean): boolean => {
      if (succeeded) {
        mineScene.input.enabled = true;
        resumePending = false;
      }
      return succeeded;
    };
    const claim = async (): Promise<boolean> => {
      await boot.commands.waitUntilIdle();
      if (boot.commands.pending !== null) {
        const pendingType = boot.commands.pending.type;
        const replayed = await boot.commands.retryPending();
        if (replayed.kind !== 'ok') return finish(false);
        if (pendingType === 'enter') {
          if (!await settlePendingEntry(replayed.value)) return finish(false);
        } else {
          await acceptCommand(replayed.value);
        }
        if (pendingType !== 'suspend') return finish(true);
      }
      if (runtime.portfolio.activeMineId !== null) return finish(true);
      const entered = await boot.commands.executeAtRevision({
        type: 'enter', mineId: runtime.mineSiteId,
      });
      if (entered.kind !== 'ok') return finish(false);
      await acceptCommand(entered.value);
      return finish(true);
    };

    await boot.commands.waitUntilIdle();
    const snapshot = await gateway.download();
    if (snapshot.kind !== 'ok' || snapshot.value.revision !== boot.commands.revision) {
      saveDiagnostics.report({
        code: 'portfolio-resume-conflict',
        message: 'Cloud mine progress changed. Reload before continuing this mine.',
      });
      resumePending = false;
      return;
    }
    const grant = snapshot.value.offlineGrants?.[runtime.mineSiteId];
    if (grant !== undefined && GameNumber.from(grant.reward).greaterThan(0)) {
      offlineRewardModal = showOfflineRewardModal({
        parent: app,
        pendingReward: {
          creditedDurationMs: grant.creditedDurationMs,
          reward: GameNumber.from(grant.reward),
        },
        mineId: runtime.mineSiteId,
        onClaim: claim,
      });
      return;
    }
    if (!await claim()) {
      offlineRewardModal = showOfflineRewardModal({
        parent: app,
        pendingReward: { creditedDurationMs: 0, reward: GameNumber.from(0) },
        mineId: runtime.mineSiteId,
        onClaim: claim,
      });
    }
  };

  unbindSaveLifecycle = bindSaveLifecycle(
    portfolioPersistence,
    () => {
      runtime.advance();
      return createPortfolioSaveDocument(runtime.portfolio, Date.now(), runtime.fullCatRoster);
    },
    {
      journal: portfolioJournal,
      onForceSave: (snapshotDocument) => {
        if (lifecycleSuspendPromise !== null) return;
        lifecycleSuspendPromise = (async () => {
          await boot.commands.waitUntilIdle();
          const result = await boot.commands.execute({ type: 'suspend' }, snapshotDocument);
          if (result.kind === 'ok') {
            await acceptCommand(result.value);
            if (document.visibilityState === 'visible') {
              await resumeConfiguredMine();
            }
          }
        })().finally(() => { lifecycleSuspendPromise = null; });
      },
    },
  );
  const handleConfiguredVisible = (): void => {
    if (document.visibilityState !== 'visible') return;
    void (async () => {
      await lifecycleSuspendPromise;
      if (runtime.portfolio.activeMineId === null || boot.commands.pending !== null) {
        await resumeConfiguredMine();
      }
    })();
  };
  document.addEventListener('visibilitychange', handleConfiguredVisible);
  unbindPortfolioResume = () =>
    document.removeEventListener('visibilitychange', handleConfiguredVisible);
  let lastPersistedState = runtime.state;
  saveHeartbeatId = window.setInterval(() => {
    if (boot.commands.pending?.type === 'enter') {
      void retryPendingEntry();
      return;
    }
    if (localSavesSuspended || runtime.portfolio.activeMineId === null ||
        runtime.state === lastPersistedState) return;
    lastPersistedState = runtime.state;
    const document = createPortfolioSaveDocument(
      runtime.portfolio, Date.now(), runtime.fullCatRoster,
    );
    portfolioPersistence.queueSave(document);
    void boot.commands.syncRoutine(document);
  }, SAVE_HEARTBEAT_MS);
}

async function startLocalPortfolioApplication(options: {
  readonly cloudPendingUserId?: string;
} = {}): Promise<void> {
  const localStorage = getAvailableLocalStorage();
  const localBoost = readLocalBoostState(localStorage);
  const loadNowMs = Date.now();
  let preservedCloudEntry = false;
  let loaded;
  try {
    const pending = options.cloudPendingUserId !== undefined && localStorage !== null
      ? new PortfolioCommandJournal(localStorage, options.cloudPendingUserId).read()
      : null;
    const candidates: unknown[] = [];
    if (pending?.command.type === 'enter') {
      const pendingMineId = pending.command.mineId;
      candidates.push(await portfolioIndexedRepository.loadActiveSave());
      try {
        const journalValue = localStorage?.getItem(LIFECYCLE_SAVE_JOURNAL_KEY);
        if (journalValue !== null && journalValue !== undefined) {
          candidates.push(JSON.parse(journalValue));
        }
      } catch {
        // IndexedDB remains a valid recovery candidate.
      }
      const valid = candidates.flatMap((candidate) => {
        if (candidate === null) return [];
        try {
          const value = deserializePortfolioSaveDocument(candidate);
          return value.portfolio.activeMineId === pendingMineId
            ? [value] : [];
        } catch {
          return [];
        }
      }).sort((a, b) => b.savedAtTimestampMs - a.savedAtTimestampMs);
      const selected = valid[0];
      if (selected !== undefined) {
        preservedCloudEntry = true;
        loaded = {
          status: 'fresh' as const,
          portfolio: selected.portfolio,
          catRoster: selected.catRoster,
          pendingGrant: null,
        };
      }
    }
    loaded ??= await loadPortfolioSession(
      portfolioIndexedRepository,
      localStorage,
      loadNowMs,
      localBoost,
    );
  } catch {
    saveDiagnostics.report({
      code: 'load-failed',
      message: LOAD_FAILURE_MESSAGE,
    });
    // A storage backend that cannot even be opened must not leave the app on
    // an empty shell. Run a fresh in-memory portfolio for this session; every
    // attempted durable write still flows through the coordinator and reports
    // `save-failed`, so the player is never told that volatile progress is safe.
    loaded = {
      status: 'fresh',
      portfolio: createInitialPortfolio(loadNowMs),
      catRoster: createEmptyCatRoster(),
      pendingGrant: null,
    } as const;
  }
  if (loaded.status === 'corrupt') {
    saveDiagnostics.report({
      code: 'corrupt-save',
      message: 'Local progress could not be read. The saved data has been preserved.',
    });
    return;
  }
  let portfolio = loaded.portfolio;
  const catRoster = loaded.catRoster;
  if (preservedCloudEntry) {
    saveDiagnostics.report({
      code: 'portfolio-entry-pending',
      message: 'You can keep playing this mine. Its offline reward is still pending cloud validation.',
    });
  }
  catCollectionUiStatus = 'ready';
  if (loaded.status === 'saved') {
    const resume = async (): Promise<boolean> => {
      const result = await resumePortfolioSession(
        portfolioLocalRepository, portfolio, catRoster, loadNowMs, localBoost,
      );
      if (result.status !== 'entered') return false;
      portfolio = result.portfolio;
      return true;
    };
    if (loaded.pendingGrant.reward.greaterThan(0)) {
      await new Promise<void>((resolve) => {
        offlineRewardModal = showOfflineRewardModal({
          parent: app,
          pendingReward: loaded.pendingGrant,
          mineId: portfolio.selectedMineId,
          onClaim: async () => {
            const succeeded = await resume();
            if (succeeded) resolve();
            return succeeded;
          },
        });
      });
    } else if (!await resume()) {
      await new Promise<void>((resolve) => {
        offlineRewardModal = showOfflineRewardModal({
          parent: app,
          pendingReward: loaded.pendingGrant,
          mineId: portfolio.selectedMineId,
          onClaim: async () => {
            const succeeded = await resume();
            if (succeeded) resolve();
            return succeeded;
          },
        });
      });
    }
  }
  if (disposed) return;

  const runtime = new PortfolioMineRuntime({
    portfolio,
    catRoster,
    boostState: localBoost,
    now: () => Date.now(),
    onCommandApplied: (next) => {
      if (!localSavesSuspended) {
        portfolioPersistence.queueSave(
          createPortfolioSaveDocument(next, Date.now(), runtime.fullCatRoster),
        );
      }
    },
  });
  activeDriver = runtime;
  const commitLocal = async (
    next: typeof portfolio,
    roster: typeof catRoster,
    savedAtMs: number,
  ): Promise<void> => {
    await commitPortfolioWithCoordinator(portfolioPersistence, next, roster, savedAtMs);
  };
  const scene = (): BootScene => {
    if (game === null) throw new Error('The mine scene is still loading.');
    return game.scene.getScene(BOOT_SCENE_KEY) as BootScene;
  };

  mineMapModal = new MineMapModal({
    parent: app,
    getPortfolio: () => runtime.portfolio,
    previewOfflineReward: (mineId) => runtime.previewOfflineReward(mineId),
    buyMine: async (mineId) => {
      if (preservedCloudEntry) {
        return { ok: false, message: 'Finish the pending cloud entry before buying another mine.' };
      }
      const result = await runtime.buyMineDurably(mineId, commitLocal);
      return {
        ok: result.status === 'purchased',
        message: result.status === 'save-failed'
          ? 'Could not save the purchase. Please try again.'
          : result.status === 'insufficient-gold'
            ? 'You need more gold in the shared wallet.'
            : result.status === 'prerequisite-locked'
              ? 'Unlock floor 5 in the previous mine first.'
              : undefined,
      };
    },
    enterMine: async (mineId: MineSiteId) => {
      try {
        if (preservedCloudEntry) {
          return { ok: false, message: 'Finish the pending cloud entry before switching again.' };
        }
        await scene().prepareSiteArt(mineId);
        const result = await runtime.enterMineDurably(mineId, commitLocal);
        if (result.status !== 'entered') {
          return { ok: false, message: result.status === 'save-failed'
            ? 'Could not save the mine switch. Please try again.'
            : 'This mine is not ready to enter.' };
        }
        scene().activateSiteArt(mineId);
        return { ok: true };
      } catch {
        return { ok: false, message: 'Could not load this mine. Please try again.' };
      }
    },
  });
  game = createGame(gameViewport, runtime, {
    onMap: (onClosed) => mineMapModal?.open(onClosed),
    onBoost: (onClosed) => boostModal?.open(onClosed),
    onSettings: (onClosed) => accountSettingsModal?.open(onClosed),
    onLeaderboard: (onClosed) => leaderboardModal?.open(onClosed),
    onCollection: (onClosed) => collectionModal?.open(onClosed),
    onCatSlot: (slotKey, onClosed) => catAssignmentModal?.open(slotKey, onClosed),
    getWalletGold: () => runtime.state.gold.serialize(),
    getCollection: () => runtime.fullCatRoster,
  });

  unbindSaveLifecycle = bindSaveLifecycle(
    portfolioPersistence,
    () => {
      try {
        runtime.suspend(Date.now());
      } catch {
        // An in-flight durable command already has a write in progress.
      }
      return createPortfolioSaveDocument(runtime.portfolio, Date.now(), runtime.fullCatRoster);
    },
    { journal: portfolioJournal },
  );
  let resumePending = false;
  const handleVisible = (): void => {
    if (document.visibilityState !== 'visible' ||
      runtime.portfolio.activeMineId !== null || resumePending) return;
    resumePending = true;
    const mineScene = scene();
    mineScene.input.enabled = false;
    const claim = async (): Promise<boolean> => {
      const result = await runtime.enterMineDurably(runtime.mineSiteId, commitLocal);
      if (result.status !== 'entered') return false;
      mineScene.input.enabled = true;
      resumePending = false;
      return true;
    };
    const reward = runtime.previewOfflineReward(runtime.mineSiteId);
    const pending = reward ?? { creditedDurationMs: 0, reward: GameNumber.from(0) };
    if (reward?.reward.greaterThan(0)) {
      offlineRewardModal = showOfflineRewardModal({
        parent: app, pendingReward: pending, mineId: runtime.mineSiteId, onClaim: claim,
      });
    } else {
      void claim().then((succeeded) => {
        if (!succeeded) {
          offlineRewardModal = showOfflineRewardModal({
            parent: app, pendingReward: pending, mineId: runtime.mineSiteId, onClaim: claim,
          });
        }
      });
    }
  };
  document.addEventListener('visibilitychange', handleVisible);
  unbindPortfolioResume = () => document.removeEventListener('visibilitychange', handleVisible);

  let lastPersistedState = runtime.state;
  saveHeartbeatId = window.setInterval(() => {
    if (localSavesSuspended || runtime.portfolio.activeMineId === null ||
      runtime.state === lastPersistedState) return;
    lastPersistedState = runtime.state;
    portfolioPersistence.queueSave(
      createPortfolioSaveDocument(runtime.portfolio, Date.now(), runtime.fullCatRoster),
    );
  }, SAVE_HEARTBEAT_MS);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposed = true;
    saveDiagnostics.destroy();
    offlineRewardModal?.destroy();
    accountSettingsModal?.destroy();
    collectionModal?.destroy();
    catAssignmentModal?.destroy();
    boostModal?.destroy();
    mineMapModal?.destroy();
    unbindSaveLifecycle?.();
    unbindPortfolioResume?.();

    if (saveHeartbeatId !== null) {
      window.clearInterval(saveHeartbeatId);
      saveHeartbeatId = null;
    }

    persistence.cancelScheduledSave();
    portfolioPersistence.cancelScheduledSave();
    // Step 19: clears any pending cadence/backoff timer so an HMR cycle does
    // not leave a replica uploading into a page that no longer exists.
    cloudReplica.stop();
    indexedRepository.close();
    portfolioIndexedRepository.close();
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

/**
 * Step 21: the browser's storage manager, or `null` where the API is absent.
 * Feature-detected rather than assumed, because `navigator.storage` is not
 * universal and its absence must leave the game untouched.
 */
function getStorageManager(): StorageManagerLike | null {
  return typeof navigator === 'undefined' ? null : navigator.storage ?? null;
}
