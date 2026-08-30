/**
 * Pure portrait-layout geometry for the mine screen.
 *
 * The logical viewport is fixed at 360x640 and the Phaser scale manager fits
 * and centres it inside the host element, so nothing is ever cropped. Host
 * safe-area insets are removed from the available box in CSS before Phaser
 * measures its parent, which keeps this module free of browser APIs.
 */

export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;

/** Fixed top HUD that never scrolls with the mine. */
export const HUD_HEIGHT = 72;
/**
 * Surface strip holding the shared elevator and warehouse.
 *
 * Tall enough for each stage panel to end in a thumb-sized upgrade control:
 * the strip is `SURFACE_HEIGHT` minus its title row and bottom inset, and the
 * control is the last `MIN_TOUCH_TARGET_PX` of that panel.
 */
export const SURFACE_HEIGHT = 164;
/** Smallest usable scrollable mine viewport. */
export const MINE_MIN_HEIGHT = 200;

export const MINE_CONTENT_PADDING = 10;
export const MINE_CONTENT_INSET_X = 12;
export const FLOOR_SLOT_HEIGHT = 116;
export const FLOOR_SLOT_GAP = 10;

/** Base-game floor count; deeper mines are out of scope. */
export const MINE_FLOOR_COUNT = 4;

/**
 * Smallest side of anything the player presses, in logical pixels.
 *
 * The logical viewport is 360 wide and the scale manager fits it to the host,
 * so at the reference phone width one logical pixel is one CSS pixel and this
 * is the 44 px touch target the platform guidelines ask for. On a narrower
 * phone every target shrinks with the whole screen, which is a property of
 * fitting a fixed design rather than something a single control can fix.
 */
export const MIN_TOUCH_TARGET_PX = 44;

export interface LayoutRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MineLayout {
  readonly width: number;
  readonly height: number;
  /** Fixed top HUD region. */
  readonly hud: LayoutRegion;
  /** Shared elevator and warehouse region above the shafts. */
  readonly surface: LayoutRegion;
  /** Clipped viewport the mine content scrolls behind. */
  readonly mine: LayoutRegion;
}

export function calculateMineLayout(
  width: number = GAME_WIDTH,
  height: number = GAME_HEIGHT,
): MineLayout {
  assertPositiveDimension(width, 'width');
  assertPositiveDimension(height, 'height');

  const minimumHeight = HUD_HEIGHT + SURFACE_HEIGHT + MINE_MIN_HEIGHT;

  if (height < minimumHeight) {
    throw new Error(
      `Portrait layout requires at least ${minimumHeight} logical pixels of height.`,
    );
  }

  return {
    width,
    height,
    hud: { x: 0, y: 0, width, height: HUD_HEIGHT },
    surface: { x: 0, y: HUD_HEIGHT, width, height: SURFACE_HEIGHT },
    mine: {
      x: 0,
      y: HUD_HEIGHT + SURFACE_HEIGHT,
      width,
      // No bottom navigation is reserved: the mine runs to the bottom edge.
      height: height - HUD_HEIGHT - SURFACE_HEIGHT,
    },
  };
}

/** Total scrollable height of the mine content for the given floor count. */
export function calculateMineContentHeight(
  floorCount: number = MINE_FLOOR_COUNT,
): number {
  assertFloorCount(floorCount);

  return (
    MINE_CONTENT_PADDING * 2 +
    floorCount * FLOOR_SLOT_HEIGHT +
    (floorCount - 1) * FLOOR_SLOT_GAP
  );
}

/**
 * Region of one floor slot, relative to the top-left of the mine content.
 * Step 26 binds real floor views into these slots.
 */
export function calculateFloorSlotRegion(
  floorIndex: number,
  width: number = GAME_WIDTH,
): LayoutRegion {
  if (!Number.isInteger(floorIndex) || floorIndex < 0) {
    throw new Error('Floor index must be a non-negative integer.');
  }

  assertPositiveDimension(width, 'width');

  return {
    x: MINE_CONTENT_INSET_X,
    y: MINE_CONTENT_PADDING + floorIndex * (FLOOR_SLOT_HEIGHT + FLOOR_SLOT_GAP),
    width: width - MINE_CONTENT_INSET_X * 2,
    height: FLOOR_SLOT_HEIGHT,
  };
}

/** True when the point is inside the region, treating it as `[x, x + width)`. */
export function regionContainsPoint(
  region: LayoutRegion,
  x: number,
  y: number,
): boolean {
  return (
    x >= region.x &&
    x < region.x + region.width &&
    y >= region.y &&
    y < region.y + region.height
  );
}

/**
 * Rejects an interactive region too small for a thumb.
 *
 * Thrown rather than merely reported: a control the player cannot reliably hit
 * is a defect in the layout, and every browser test boots the scene, so a
 * shrunken control fails loudly on the frame it is built instead of surviving
 * as a slow, unattributable miss rate on a real phone.
 */
export function assertTouchTargetRegion(
  region: LayoutRegion,
  name: string,
): void {
  if (
    region.width < MIN_TOUCH_TARGET_PX ||
    region.height < MIN_TOUCH_TARGET_PX
  ) {
    throw new Error(
      `${name} must be at least ${MIN_TOUCH_TARGET_PX}x${MIN_TOUCH_TARGET_PX} logical pixels, ` +
        `but is ${region.width}x${region.height}.`,
    );
  }
}

export function serializeRegion(region: LayoutRegion): string {
  return `${region.x},${region.y},${region.width},${region.height}`;
}

function assertPositiveDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Layout ${name} must be a finite positive number.`);
  }
}

function assertFloorCount(floorCount: number): void {
  if (!Number.isInteger(floorCount) || floorCount < 1) {
    throw new Error('Floor count must be a positive integer.');
  }
}
