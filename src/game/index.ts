import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, MINE_BACKGROUND } from './layout';
import type { MineRuntimePort } from './runtime';
import { BootScene } from './scenes/BootScene';

export { GAME_HEIGHT, GAME_WIDTH };
export {
  MineSimulationDriver,
  type MineCommandSink,
  type MineRuntimePort,
  type MineSimulationDriverOptions,
  type MineSnapshotSource,
} from './runtime';
export {
  createMineViewModel,
  formatAmount,
  DEFAULT_ANIMATION_SPEED_MULTIPLIER,
  PURCHASE_FEEDBACK_DURATION_MS,
  type HudViewModel,
  type MineFloorViewModel,
  type MineViewModel,
  type PurchaseControlViewModel,
  type PurchaseOutcome,
  type PurchaseTarget,
  type SharedStageViewModel,
} from './view-model';

export interface CreateGameOptions {
  /** Scales cosmetic motion only; production is never derived from it. */
  readonly animationSpeedMultiplier?: number;
}

export function createGame(
  parent: HTMLElement,
  source: MineRuntimePort,
  options: CreateGameOptions = {},
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    // Only visible before the scene paints its regions, which then tile the
    // whole canvas. The letterbox around the fitted canvas is the `:root`
    // background in `src/style.css`, not this fill.
    backgroundColor: MINE_BACKGROUND,
    // The scene is constructed here so it boots already bound to the loaded
    // core snapshot instead of rendering placeholder values first, and then
    // pulls every later snapshot from the same source.
    scene: [
      new BootScene({
        source,
        animationSpeedMultiplier: options.animationSpeedMultiplier,
      }),
    ],
    scale: {
      // FIT never crops, so every control stays inside the host viewport.
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
  });
}
