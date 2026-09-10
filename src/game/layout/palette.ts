/**
 * Pure portrait-screen palette.
 *
 * CSS hex strings are the single source of truth so browser pixel probes and
 * the Phaser scene cannot drift apart; `toFillColor` derives the numeric form
 * Phaser fills require. This module stays renderer-free and browser-free so
 * Node tests can import it without loading Phaser.
 */

export const HUD_BACKGROUND = '#132238';
export const SURFACE_BACKGROUND = '#20334a';
export const MINE_BACKGROUND = '#101827';
/** Warm surface soil separating the above-ground yard from the mine. */
export const SURFACE_GROUND = '#8a5a32';
/** Structural steel around the shared underground elevator. */
export const SHAFT_BACKGROUND = '#172536';
export const SHAFT_RAIL = '#6688aa';
export const SHAFT_BEAM = '#304a66';
export const TUNNEL_ROCK = '#22344a';
export const TUNNEL_FLOOR = '#8a5a32';
export const PANEL_BACKGROUND = '#2c4260';
/** Locked mine floors are drawn distinctly, not merely dimmed by alpha. */
export const LOCKED_PANEL_BACKGROUND = '#182334';
export const DIVIDER = '#f4bd3e';

/** Bottom navigation chrome and icon palette. */
export const NAVIGATION_BACKGROUND = '#102b46';
export const NAVIGATION_BUTTON = '#2d6c97';
export const NAVIGATION_BUTTON_BORDER = '#74c3df';
export const NAVIGATION_BUTTON_PRESSED = '#168f8b';
export const NAVIGATION_BOOST = '#f4bd3e';
export const NAVIGATION_BOOST_BORDER = '#ffe39a';
export const NAVIGATION_ICON = '#f9fafb';
export const NAVIGATION_SHADOW = '#071521';

export const BADGE_BACKGROUND = '#17233a';
export const CONTROL_BACKGROUND = '#41658a';
/** An upgrade the player cannot yet pay for, drawn distinctly rather than dimmed. */
export const CONTROL_DISABLED_BACKGROUND = '#24344b';
/** Momentary press feedback: a completed purchase. */
export const CONTROL_SUCCESS_BACKGROUND = '#15803d';
/** Momentary press feedback: a refused purchase. */
export const CONTROL_REFUSED_BACKGROUND = '#991b1b';
export const PROGRESS_TRACK = '#131c2c';
export const PROGRESS_FILL = '#2ea9a1';
/** A full pile is recoloured to this, so a backlog reads at a glance. */
export const MATERIAL_BACKLOG_FILL = '#f87171';
/** Marker that travels a stage's track in step with authoritative progress. */
export const CYCLE_MARKER_FILL = '#f9fafb';
/** Cosmetic conveyor dashes; motion only, never a production signal. */
export const CONVEYOR_FILL = '#6688aa';

export const TEXT_PRIMARY = '#f9fafb';
export const TEXT_MUTED = '#9ca3af';
export const TEXT_ACCENT = '#f4bd3e';
export const TEXT_DISABLED = '#6b7280';
export const TEXT_WARNING = '#f87171';

export const FONT_FAMILY = 'Fredoka, sans-serif';
export const FONT_STYLE_SEMIBOLD = '600';
export const FONT_STYLE_BOLD = '700';

/** Converts a `#rrggbb` string into the 24-bit integer Phaser fills take. */
export function toFillColor(hex: string): number {
  if (!/^#[0-9a-f]{6}$/.test(hex)) {
    throw new Error(`Palette color must be a lowercase #rrggbb string: ${hex}`);
  }

  return Number.parseInt(hex.slice(1), 16);
}
