import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, MINE_BACKGROUND } from './layout';
import { BootScene } from './scenes/BootScene';

export { GAME_HEIGHT, GAME_WIDTH };

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    // Only visible before the scene paints its regions, which then tile the
    // whole canvas. The letterbox around the fitted canvas is the `:root`
    // background in `src/style.css`, not this fill.
    backgroundColor: MINE_BACKGROUND,
    scene: [BootScene],
    scale: {
      // FIT never crops, so every control stays inside the host viewport.
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
  });
}
