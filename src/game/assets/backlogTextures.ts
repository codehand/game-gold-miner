import Phaser from 'phaser';

import { MATERIAL_BACKLOG_FILL } from '../layout';
import { PLACEHOLDER_TEXTURES } from './placeholderAssets';

/**
 * Backlog-coloured variants of the two material sprites, generated at boot.
 *
 * The cue cannot be a tint. Phaser implements `setTint` in the WebGL renderer
 * only — `ImageCanvasRenderer` batches the sprite with no tint path at all —
 * while the game boots with `Phaser.AUTO` and `BootScene` publishes whichever
 * of `webgl` or `canvas` it ended up on. Recolouring the source pixels once,
 * into a real texture, draws identically under both.
 *
 * Swapping a texture key is also something a view can read back off its own
 * sprite, which a tint written into a private field is not: a floor that never
 * bound its snapshot reports the plain key, and one whose artwork failed to
 * load reports Phaser's `__MISSING` placeholder. Both are visible to a test.
 */
export const PLACEHOLDER_BACKLOG_TEXTURES = {
  goldPile: `${PLACEHOLDER_TEXTURES.goldPile}-backlog`,
  oreCrate: `${PLACEHOLDER_TEXTURES.oreCrate}-backlog`,
} as const;

const BACKLOG_SOURCES = [
  [PLACEHOLDER_TEXTURES.goldPile, PLACEHOLDER_BACKLOG_TEXTURES.goldPile],
  [PLACEHOLDER_TEXTURES.oreCrate, PLACEHOLDER_BACKLOG_TEXTURES.oreCrate],
] as const;

/**
 * Generates every backlog variant.
 *
 * Runs after `preload` and before the first view is built. Idempotent, so a
 * restarted scene reuses the textures it already generated rather than paying
 * for them again.
 */
export function createBacklogTextures(scene: Phaser.Scene): void {
  for (const [sourceKey, backlogKey] of BACKLOG_SOURCES) {
    createBacklogTexture(scene, sourceKey, backlogKey);
  }
}

function createBacklogTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  backlogKey: string,
): void {
  if (scene.textures.exists(backlogKey)) {
    return;
  }

  const source = scene.textures.get(sourceKey).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement;
  const texture = scene.textures.createCanvas(
    backlogKey,
    source.width,
    source.height,
  );

  if (texture === null) {
    // Losing the variant silently would leave a backed-up stage looking
    // exactly like a clear one, which is the one thing it exists to say.
    throw new Error(`Could not generate the backlog texture "${backlogKey}".`);
  }

  const context = texture.getContext();

  context.drawImage(source, 0, 0);
  // `source-in` keeps the fill only where the sprite already has pixels, so
  // the recolour follows the artwork's silhouette exactly as a fill-mode tint
  // would, rather than stamping a solid square over it.
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = MATERIAL_BACKLOG_FILL;
  context.fillRect(0, 0, source.width, source.height);
  texture.refresh();
}
