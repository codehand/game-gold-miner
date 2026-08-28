/**
 * Pure portrait-screen palette.
 *
 * CSS hex strings are the single source of truth so browser pixel probes and
 * the Phaser scene cannot drift apart; `toFillColor` derives the numeric form
 * Phaser fills require. This module stays renderer-free and browser-free so
 * Node tests can import it without loading Phaser.
 */

export const HUD_BACKGROUND = '#0f172a';
export const SURFACE_BACKGROUND = '#1b2735';
export const MINE_BACKGROUND = '#111827';
export const PANEL_BACKGROUND = '#27364b';
/** Locked mine floors are drawn distinctly, not merely dimmed by alpha. */
export const LOCKED_PANEL_BACKGROUND = '#1a2333';
export const DIVIDER = '#fbbf24';

export const BADGE_BACKGROUND = '#0b1220';
export const CONTROL_BACKGROUND = '#3d5578';
export const PROGRESS_TRACK = '#131c2c';
export const PROGRESS_FILL = '#34d399';
export const MATERIAL_FILL = '#fbbf24';
export const MINER_FILL = '#e5e7eb';

export const TEXT_PRIMARY = '#f9fafb';
export const TEXT_MUTED = '#9ca3af';
export const TEXT_ACCENT = '#fbbf24';
export const TEXT_DISABLED = '#6b7280';

export const FONT_FAMILY = 'Arial, sans-serif';

/** Converts a `#rrggbb` string into the 24-bit integer Phaser fills take. */
export function toFillColor(hex: string): number {
  if (!/^#[0-9a-f]{6}$/.test(hex)) {
    throw new Error(`Palette color must be a lowercase #rrggbb string: ${hex}`);
  }

  return Number.parseInt(hex.slice(1), 16);
}
