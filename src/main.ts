import './style.css';

import { BASE_GAME_BALANCE, validateBaseGameBalance } from './config';
import { claimOfflineReward, createPendingOfflineReward } from './core';
import { createGame, MineSimulationDriver } from './game';
import {
  createSaveDocument,
  DexieActiveSaveRepository,
  loadActiveGame,
  SavePersistenceCoordinator,
} from './persistence';
import {
  beginGoogleSignIn,
  bindSaveLifecycle,
  createSupabaseClient,
  ensureGuestSession,
  LifecycleSafeActiveSaveRepository,
  signOutOfSession,
  WebLifecycleSaveJournal,
  type GoogleSignInResult,
  type GuestSessionResult,
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
      signOut: () => Promise<SignOutResult>;
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
    .then((client) => {
      window.catMineIdleAccount = {
        beginGoogleSignIn: () =>
          beginGoogleSignIn(client?.auth ?? null, window.location.origin),
        signOut: () => signOutOfSession(client?.auth ?? null),
      };
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
const lifecycleJournal = new WebLifecycleSaveJournal(
  getAvailableLocalStorage(),
  BASE_GAME_BALANCE,
);
const repository = new LifecycleSafeActiveSaveRepository(
  indexedRepository,
  lifecycleJournal,
  BASE_GAME_BALANCE,
);
// Save recovery and storage failures are both recoverable and both invisible
// without this: the loader replaces an unreadable save with a fresh game and
// the coordinator absorbs a failed write into a diagnostic, so a player who
// lost local progress would otherwise simply find themselves back at the start.
const saveDiagnostics = createSaveDiagnosticBanner(app);
const persistence = new SavePersistenceCoordinator(repository, {
  onDiagnostic: (diagnostic) => saveDiagnostics.report(diagnostic),
});
let game: ReturnType<typeof createGame> | null = null;
let offlineRewardModal: OfflineRewardModal | null = null;
let unbindSaveLifecycle: (() => void) | null = null;
let saveHeartbeatId: number | null = null;
let disposed = false;

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
    { journal: lifecycleJournal },
  );

  // Skips the write entirely while authoritative state has not moved — a
  // backgrounded tab stops advancing the driver, and rewriting an identical
  // document would be pure cost.
  let lastPersistedState = driver.state;

  saveHeartbeatId = window.setInterval(() => {
    if (driver.state === lastPersistedState) {
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

        persistence.queueSave(createSaveDocument(
          driver.state,
          BASE_GAME_BALANCE,
          Date.now(),
        ));
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
