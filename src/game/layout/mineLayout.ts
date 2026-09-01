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
/** Left-side elevator shaft that visually connects the surface to every floor. */
export const MINE_SHAFT_INSET_X = 4;
export const MINE_SHAFT_WIDTH = 64;
export const MINE_SHAFT_FLOOR_GAP = 4;
export const MINE_SHAFT_RAIL_INSET = 11;
export const MINE_SHAFT_RAIL_WIDTH = 4;
/** Near-full-width cabin: the 128 px source remains sharp at this scale. */
export const MINE_SHAFT_CABIN_SIZE = 62;
export const MINE_SHAFT_CARGO_CAT_SIZE = 50;
/** Fixed surface headhouse aligned with the underground shaft. */
export const SURFACE_ELEVATOR_TOWER_WIDTH = 150;
export const SURFACE_ELEVATOR_TOWER_HEIGHT = SURFACE_HEIGHT;
export const SURFACE_ELEVATOR_TOWER_CENTER_X = 57;
export const SURFACE_ELEVATOR_TOWER_CENTER_Y = SURFACE_HEIGHT / 2;
/** One vertical rail axis from the underground shaft through the surface bay. */
export const SURFACE_ELEVATOR_STOP_X =
  MINE_SHAFT_INSET_X + MINE_SHAFT_WIDTH / 2;
export const SURFACE_ELEVATOR_STOP_Y = 118;
/** Generated warehouse building and its manager, relative to the surface strip. */
export const SURFACE_WAREHOUSE_CENTER_X = 290;
export const SURFACE_WAREHOUSE_CENTER_Y = 88;
export const SURFACE_WAREHOUSE_WIDTH = 140;
export const SURFACE_WAREHOUSE_HEIGHT = 140;
export const SURFACE_WAREHOUSE_MANAGER_X = 258;
export const SURFACE_WAREHOUSE_MANAGER_Y = 132;
export const SURFACE_WAREHOUSE_MANAGER_SIZE = 56;
/** Surface cart route: load beneath the chute, then stop at the warehouse bay. */
export const SURFACE_HAULER_START_X = 112;
export const SURFACE_HAULER_END_X = 220;
export const SURFACE_HAULER_CART_Y = 134;
export const SURFACE_HAULER_CART_SIZE = 46;
export const SURFACE_HAULER_CAT_SIZE = 52;
export const SURFACE_HAULER_CAT_GAP = 28;
export const SURFACE_GOLD_POUR_X = 105;
export const SURFACE_GOLD_POUR_Y = 111;
export const SURFACE_GOLD_POUR_WIDTH = 26;
export const SURFACE_GOLD_POUR_HEIGHT = 48;
/** Mine-floor panels begin to the right of the shared elevator shaft. */
export const MINE_CONTENT_INSET_X =
  MINE_SHAFT_INSET_X + MINE_SHAFT_WIDTH + MINE_SHAFT_FLOOR_GAP;
export const MINE_CONTENT_RIGHT_INSET = 0;
export const FLOOR_SLOT_HEIGHT = 132;
/** Floor art tiles edge-to-edge so the brown mine backdrop stays continuous. */
export const FLOOR_SLOT_GAP = 0;

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

/**
 * Thumb-safe regions for the compact code-rendered shared-stage level badges.
 * The elevator badge sits immediately right of the discharge tray and never
 * below it; the warehouse badge overlaps the roofline from above.
 */
export const SURFACE_ELEVATOR_LEVEL_CONTROL: LayoutRegion = {
  x: 106,
  y: 48,
  width: MIN_TOUCH_TARGET_PX,
  height: 50,
};
export const SURFACE_WAREHOUSE_LEVEL_CONTROL: LayoutRegion = {
  x: 263,
  y: 0,
  width: MIN_TOUCH_TARGET_PX,
  height: 50,
};

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
    width: width - MINE_CONTENT_INSET_X - MINE_CONTENT_RIGHT_INSET,
    height: FLOOR_SLOT_HEIGHT,
  };
}

/** Vertical elevator-shaft region, relative to the mine-content origin. */
export function calculateMineShaftRegion(
  width: number = GAME_WIDTH,
  floorCount: number = MINE_FLOOR_COUNT,
): LayoutRegion {
  assertPositiveDimension(width, 'width');
  assertFloorCount(floorCount);

  if (MINE_SHAFT_INSET_X + MINE_SHAFT_WIDTH > width) {
    throw new Error('Mine width is too narrow for the elevator shaft.');
  }

  if (MINE_SHAFT_CABIN_SIZE > MINE_SHAFT_WIDTH) {
    throw new Error('Elevator cabin must fit inside the elevator shaft.');
  }

  if (MINE_SHAFT_CARGO_CAT_SIZE > MINE_SHAFT_CABIN_SIZE) {
    throw new Error('Elevator cargo cat must fit inside the cabin.');
  }

  if (MINE_SHAFT_RAIL_INSET * 2 + MINE_SHAFT_RAIL_WIDTH > MINE_SHAFT_WIDTH) {
    throw new Error('Elevator rails must fit inside the elevator shaft.');
  }

  return {
    x: MINE_SHAFT_INSET_X,
    y: MINE_CONTENT_PADDING,
    width: MINE_SHAFT_WIDTH,
    height: calculateMineContentHeight(floorCount) - MINE_CONTENT_PADDING * 2,
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
