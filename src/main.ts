import './style.css';

import { BASE_GAME_BALANCE, validateBaseGameBalance } from './config';
import { createGame } from './game';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Application root was not found.');
}

validateBaseGameBalance(BASE_GAME_BALANCE);

const game = createGame(app);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
