import { MIN_TOUCH_TARGET_PX, type LayoutRegion } from './mineLayout';

/** Approved 288x132 floor composition from layout1.png. */
export const MINE_FLOOR_PANEL_REFERENCE_WIDTH = 288;
export const MINE_FLOOR_PANEL_REFERENCE_HEIGHT = 132;

export interface MineFloorPanelLayout {
  readonly timer: LayoutRegion;
  readonly floorBadge: LayoutRegion;
  readonly title: LayoutRegion;
  readonly status: LayoutRegion;
  readonly goldContainer: LayoutRegion;
  readonly unloaderCat: LayoutRegion;
  readonly minerPatrol: LayoutRegion;
  readonly goldPile: LayoutRegion;
  readonly levelControl: LayoutRegion;
  readonly unlockControl: LayoutRegion;
  readonly progressTrack: LayoutRegion;
  readonly progressLabel: LayoutRegion;
}

/**
 * Semantic floor geometry. Values scale from the approved 288x132 frame so
 * rendering and pixel probes cannot independently drift away from the design.
 */
export function calculateMineFloorPanelLayout(
  width: number = MINE_FLOOR_PANEL_REFERENCE_WIDTH,
  height: number = MINE_FLOOR_PANEL_REFERENCE_HEIGHT,
): MineFloorPanelLayout {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('Mine-floor panel dimensions must be finite positive numbers.');
  }

  const sx = width / MINE_FLOOR_PANEL_REFERENCE_WIDTH;
  const sy = height / MINE_FLOOR_PANEL_REFERENCE_HEIGHT;
  const region = (x: number, y: number, regionWidth: number, regionHeight: number): LayoutRegion => ({
    x: x * sx,
    y: y * sy,
    width: regionWidth * sx,
    height: regionHeight * sy,
  });

  const layout = {
    timer: region(10, 7, 82, 22),
    floorBadge: region(10, 34, 26, 26),
    title: region(42, 34, 130, 28),
    status: region(224, 8, 54, 16),
    goldContainer: region(8, 78, 48, 42),
    unloaderCat: region(48, 59, 58, 62),
    // Travel spans from the unloading cat to the gold pile before turning.
    minerPatrol: region(100, 60, 112, 62),
    // Centred under the timber support, but clear of the floor seam.
    goldPile: region(208, 84, 48, 28),
    // Open floors use the compact vertical Level badge from layout1.png.
    levelControl: region(234, 42, MIN_TOUCH_TARGET_PX, 50),
    // Locked floors still need enough width for their Unlock price.
    unlockControl: region(186, 50, 92, MIN_TOUCH_TARGET_PX),
    progressTrack: region(10, 122, 230, 6),
    progressLabel: region(246, 116, 32, 14),
  } satisfies MineFloorPanelLayout;

  if (layout.levelControl.width < MIN_TOUCH_TARGET_PX || layout.levelControl.height < MIN_TOUCH_TARGET_PX) {
    throw new Error('Mine-floor level control is smaller than the minimum touch target.');
  }

  return layout;
}
