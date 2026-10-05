import Phaser from 'phaser';

import type { HaulerCartAsset } from '../assets/marketplaceRuntimeAssets';

/** Two quiet, continuously powered jets; cosmetic only, with no emitter/timers. */
export class HaulerThrusterView {
  public readonly root: Phaser.GameObjects.Graphics;
  #jets: Array<{ x: number; y: number; length: number }> = [];

  public constructor(scene: Phaser.Scene) {
    this.root = scene.add.graphics().setVisible(false);
  }

  public apply(
    cart: Phaser.GameObjects.Image,
    asset: HaulerCartAsset,
    animationTimeMs: number,
  ): void {
    this.root.clear();
    this.#jets = [];
    const enabled = cart.visible && asset.assetId === 'hauler:SSR:rivet:walk';
    this.root.setVisible(enabled);
    if (!enabled) return;

    // Local anchors are the two coil outlets in both 128px Rivet textures.
    // Mirroring the entire effect preserves their asymmetric source positions.
    const facing = cart.flipX ? -1 : 1;
    const scale = cart.displayWidth / 64;
    const y = (89 / 128 - cart.originY) * cart.displayHeight;
    this.root.setPosition(cart.x, cart.y).setScale(facing, 1);
    for (const [index, sourceX] of [48, 99].entries()) {
      const x = (sourceX / 128 - cart.originX) * cart.displayWidth;
      // Slow breathing, never an on/off strobe. Idle/loading/empty return all
      // need lift, so cargo state and route phase do not disable the jets.
      const pulse = (1 + Math.sin(animationTimeMs / 150 + index * 1.6)) / 2;
      const length = (5 + pulse * 2.5) * scale;
      this.root.fillStyle(0x28b8ff, 0.15 + pulse * 0.06);
      this.root.fillEllipse(x, y + 4 * scale, 13 * scale, 9 * scale);
      this.root.fillStyle(0x51e4ff, 0.22);
      this.root.fillEllipse(x, y + 7 * scale, 12 * scale, 2.5 * scale);
      this.root.fillStyle(0x159fe9, 0.8);
      this.root.fillTriangle(x - 3 * scale, y, x + 3 * scale, y, x, y + length);
      this.root.fillStyle(0x70efff, 0.95);
      this.root.fillTriangle(x - 1.8 * scale, y, x + 1.8 * scale, y, x, y + length * 0.78);
      this.root.fillStyle(0xe5ffff, 1);
      this.root.fillEllipse(x, y + scale, 2.5 * scale, 3 * scale);
      this.#jets.push({ x: cart.x + facing * x, y: cart.y + y, length });
    }
  }

  public get renderedState() {
    return { visible: this.root.visible, jets: this.#jets };
  }
}
