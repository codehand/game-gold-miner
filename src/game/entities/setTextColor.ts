import type Phaser from 'phaser';

/**
 * Writes a text colour only when it differs from the one already applied.
 *
 * `Text.setText` skips an unchanged value, but `Text.setColor` does not: it
 * re-rasterizes the text's own canvas and re-uploads its texture on every
 * call, whatever colour is already there. Every view rebinds its captions on
 * each new snapshot — ten times a second — and almost every one of those
 * rebinds asks for the colour already on screen, so the unguarded call is a
 * full repaint of each caption to produce identical pixels.
 *
 * Shared by every view that colours text from a snapshot, so the guard cannot
 * be applied in one of them and forgotten in the next.
 */
export function setTextColor(
  text: Phaser.GameObjects.Text,
  color: string,
): void {
  if (text.style.color !== color) {
    text.setColor(color);
  }
}
