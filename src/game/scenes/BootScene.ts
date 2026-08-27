import Phaser from 'phaser';

export const BOOT_SCENE_KEY = 'BootScene';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super({ key: BOOT_SCENE_KEY });
  }

  public create(): void {
    const canvas = this.game.canvas;
    const starts = Number(canvas.dataset.bootSceneStarts ?? '0') + 1;
    const renderer =
      this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas';

    canvas.dataset.bootScene = BOOT_SCENE_KEY;
    canvas.dataset.bootSceneStarts = String(starts);
    canvas.dataset.renderer = renderer;
    canvas.setAttribute('aria-label', 'Cat Mine Idle game canvas');
    canvas.setAttribute('role', 'img');

    this.add
      .text(GAME_CENTER_X, GAME_CENTER_Y, 'Cat Mine Idle\nBoot scene ready', {
        align: 'center',
        color: '#f9fafb',
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
      })
      .setOrigin(0.5);
  }
}

const GAME_CENTER_X = 180;
const GAME_CENTER_Y = 320;
