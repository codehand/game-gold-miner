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
import { bindSaveLifecycle } from './platform/web';
import { showOfflineRewardModal, type OfflineRewardModal } from './ui';

const app = getRequiredElement('#app', 'Application root');
const gameViewport = getRequiredElement('#game-viewport', 'Game viewport');

validateBaseGameBalance(BASE_GAME_BALANCE);

const repository = new DexieActiveSaveRepository();
const persistence = new SavePersistenceCoordinator(repository);
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
    () => createSaveDocument(driver.state, BASE_GAME_BALANCE, Date.now()),
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
    offlineRewardModal?.destroy();
    unbindSaveLifecycle?.();

    if (saveHeartbeatId !== null) {
      window.clearInterval(saveHeartbeatId);
      saveHeartbeatId = null;
    }

    persistence.cancelScheduledSave();
    repository.close();
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
