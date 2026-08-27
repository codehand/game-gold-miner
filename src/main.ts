import './style.css';

import { createGame } from './game';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Application root was not found.');
}

const game = createGame(app);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
