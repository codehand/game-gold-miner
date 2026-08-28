import './style.css';

import { BASE_GAME_BALANCE, validateBaseGameBalance } from './config';
import {
  claimOfflineReward,
  createPendingOfflineReward,
  type GameState,
} from './core';
import { createGame, createMineViewModel } from './game';
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
let disposed = false;

void startApplication();

async function startApplication(): Promise<void> {
  const loadResult = await loadActiveGame(
    persistence,
    BASE_GAME_BALANCE,
    Date.now(),
  );

  if (disposed) {
    return;
  }

  let currentState: GameState = loadResult.state;
  let pendingReward = createPendingOfflineReward(loadResult.offlineIncome);
  let claimCandidate: GameState | null = null;

  game = createGame(gameViewport, createMineViewModel(currentState));
  unbindSaveLifecycle = bindSaveLifecycle(
    persistence,
    () => createSaveDocument(currentState, BASE_GAME_BALANCE, Date.now()),
  );

  if (pendingReward !== null) {
    offlineRewardModal = showOfflineRewardModal({
      parent: app,
      pendingReward,
      onClaim: async () => {
        if (claimCandidate === null) {
          const claimResult = claimOfflineReward(currentState, pendingReward);

          if (claimResult.status !== 'claimed') {
            return false;
          }

          claimCandidate = claimResult.state;
          currentState = claimCandidate;
          pendingReward = claimResult.pendingReward;
        }

        persistence.queueSave(createSaveDocument(
          claimCandidate,
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
