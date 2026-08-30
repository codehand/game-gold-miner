import { describe, expect, it } from 'vitest';

import {
  assertTouchTargetRegion,
  calculateFloorSlotRegion,
  calculateMineContentHeight,
  calculateMineLayout,
  regionContainsPoint,
  serializeRegion,
  toFillColor,
  FLOOR_SLOT_GAP,
  FLOOR_SLOT_HEIGHT,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_HEIGHT,
  HUD_BACKGROUND,
  MINE_CONTENT_INSET_X,
  MINE_CONTENT_PADDING,
  MINE_FLOOR_COUNT,
  MINE_MIN_HEIGHT,
  MIN_TOUCH_TARGET_PX,
  LOCKED_PANEL_BACKGROUND,
  MATERIAL_BACKLOG_FILL,
  PANEL_BACKGROUND,
  PROGRESS_FILL,
  PROGRESS_TRACK,
  SURFACE_BACKGROUND,
  SURFACE_HEIGHT,
} from '../../src/game/layout';

describe('portrait layout geometry', () => {
  it('uses the documented 360x640 logical viewport by default', () => {
    const layout = calculateMineLayout();

    expect(layout.width).toBe(360);
    expect(layout.height).toBe(640);
    expect(GAME_WIDTH).toBe(360);
    expect(GAME_HEIGHT).toBe(640);
  });

  it('places a fixed HUD, a surface strip, and the mine area in order', () => {
    const layout = calculateMineLayout();

    expect(layout.hud).toEqual({ x: 0, y: 0, width: 360, height: HUD_HEIGHT });
    expect(layout.surface).toEqual({
      x: 0,
      y: HUD_HEIGHT,
      width: 360,
      height: SURFACE_HEIGHT,
    });
    expect(layout.mine).toEqual({
      x: 0,
      y: HUD_HEIGHT + SURFACE_HEIGHT,
      width: 360,
      height: GAME_HEIGHT - HUD_HEIGHT - SURFACE_HEIGHT,
    });
  });

  it('tiles the regions without gaps or overlaps', () => {
    const layout = calculateMineLayout();
    const regions = [layout.hud, layout.surface, layout.mine];

    let expectedY = 0;

    for (const region of regions) {
      expect(region.x).toBe(0);
      expect(region.width).toBe(layout.width);
      expect(region.height).toBeGreaterThan(0);
      expect(region.y).toBe(expectedY);
      expectedY += region.height;
    }

    expect(expectedY).toBe(layout.height);
  });

  it('reserves no bottom navigation strip for deferred features', () => {
    const layout = calculateMineLayout();

    expect(layout.mine.y + layout.mine.height).toBe(layout.height);
  });

  it('keeps every region inside the viewport at larger logical sizes', () => {
    const layout = calculateMineLayout(GAME_WIDTH, 900);

    for (const region of [layout.hud, layout.surface, layout.mine]) {
      expect(region.x).toBeGreaterThanOrEqual(0);
      expect(region.y).toBeGreaterThanOrEqual(0);
      expect(region.x + region.width).toBeLessThanOrEqual(layout.width);
      expect(region.y + region.height).toBeLessThanOrEqual(layout.height);
    }

    expect(layout.mine.height).toBe(900 - HUD_HEIGHT - SURFACE_HEIGHT);
  });

  it('rejects non-positive or non-finite dimensions', () => {
    expect(() => calculateMineLayout(0, GAME_HEIGHT)).toThrow(
      /width must be a finite positive number/,
    );
    expect(() => calculateMineLayout(GAME_WIDTH, Number.NaN)).toThrow(
      /height must be a finite positive number/,
    );
  });

  it('rejects a viewport too short to hold the HUD, surface, and mine', () => {
    const minimumHeight = HUD_HEIGHT + SURFACE_HEIGHT + MINE_MIN_HEIGHT;

    expect(() => calculateMineLayout(GAME_WIDTH, minimumHeight - 1)).toThrow(
      /at least \d+ logical pixels of height/,
    );
    expect(() => calculateMineLayout(GAME_WIDTH, minimumHeight)).not.toThrow();
  });
});

describe('scrollable mine content', () => {
  it('is taller than the mine viewport so the area must scroll', () => {
    const layout = calculateMineLayout();

    expect(calculateMineContentHeight()).toBeGreaterThan(layout.mine.height);
  });

  it('derives its height from padding, slots, and gaps', () => {
    expect(calculateMineContentHeight(MINE_FLOOR_COUNT)).toBe(
      MINE_CONTENT_PADDING * 2 +
        MINE_FLOOR_COUNT * FLOOR_SLOT_HEIGHT +
        (MINE_FLOOR_COUNT - 1) * FLOOR_SLOT_GAP,
    );
    expect(calculateMineContentHeight(1)).toBe(
      MINE_CONTENT_PADDING * 2 + FLOOR_SLOT_HEIGHT,
    );
  });

  it('rejects invalid floor counts', () => {
    expect(() => calculateMineContentHeight(0)).toThrow(
      /Floor count must be a positive integer/,
    );
    expect(() => calculateMineContentHeight(2.5)).toThrow(
      /Floor count must be a positive integer/,
    );
  });

  it('stacks four floor slots sequentially inside the content box', () => {
    const contentHeight = calculateMineContentHeight();
    let previousBottom = 0;

    for (let index = 0; index < MINE_FLOOR_COUNT; index += 1) {
      const slot = calculateFloorSlotRegion(index);

      expect(slot.x).toBe(MINE_CONTENT_INSET_X);
      expect(slot.width).toBe(GAME_WIDTH - MINE_CONTENT_INSET_X * 2);
      expect(slot.height).toBe(FLOOR_SLOT_HEIGHT);
      expect(slot.y).toBeGreaterThanOrEqual(previousBottom);
      expect(slot.y + slot.height).toBeLessThanOrEqual(contentHeight);

      previousBottom = slot.y + slot.height;
    }

    expect(calculateFloorSlotRegion(1).y - calculateFloorSlotRegion(0).y).toBe(
      FLOOR_SLOT_HEIGHT + FLOOR_SLOT_GAP,
    );
  });

  it('rejects invalid floor indexes', () => {
    expect(() => calculateFloorSlotRegion(-1)).toThrow(
      /Floor index must be a non-negative integer/,
    );
    expect(() => calculateFloorSlotRegion(0, 0)).toThrow(
      /width must be a finite positive number/,
    );
  });
});

describe('region containment', () => {
  it('includes the top-left corner and excludes the far edges', () => {
    const region = { x: 10, y: 20, width: 30, height: 40 };

    expect(regionContainsPoint(region, 10, 20)).toBe(true);
    expect(regionContainsPoint(region, 39, 59)).toBe(true);
    expect(regionContainsPoint(region, 40, 40)).toBe(false);
    expect(regionContainsPoint(region, 20, 60)).toBe(false);
    expect(regionContainsPoint(region, 9, 40)).toBe(false);
    expect(regionContainsPoint(region, 20, 19)).toBe(false);
  });

  it('separates the mine from the fixed layers above it', () => {
    const layout = calculateMineLayout();

    expect(regionContainsPoint(layout.mine, 180, layout.mine.y)).toBe(true);
    expect(regionContainsPoint(layout.mine, 180, layout.mine.y - 1)).toBe(false);
    expect(regionContainsPoint(layout.hud, 180, layout.mine.y)).toBe(false);
  });
});

describe('touch targets', () => {
  it('holds the platform guideline at the reference phone width', () => {
    expect(MIN_TOUCH_TARGET_PX).toBe(44);
  });

  it('accepts a region at or above the minimum on both sides', () => {
    expect(() =>
      assertTouchTargetRegion(
        { x: 0, y: 0, width: MIN_TOUCH_TARGET_PX, height: MIN_TOUCH_TARGET_PX },
        'A control',
      ),
    ).not.toThrow();
  });

  it('rejects a region too small on either side', () => {
    expect(() =>
      assertTouchTargetRegion(
        {
          x: 0,
          y: 0,
          width: MIN_TOUCH_TARGET_PX,
          height: MIN_TOUCH_TARGET_PX - 1,
        },
        'A purchase control',
      ),
    ).toThrow(/A purchase control must be at least 44x44 logical pixels/);
    expect(() =>
      assertTouchTargetRegion(
        {
          x: 0,
          y: 0,
          width: MIN_TOUCH_TARGET_PX - 1,
          height: MIN_TOUCH_TARGET_PX,
        },
        'A purchase control',
      ),
    ).toThrow(/but is 43x44/);
  });

  it('leaves room in a floor slot for a thumb-sized control', () => {
    expect(FLOOR_SLOT_HEIGHT).toBeGreaterThan(MIN_TOUCH_TARGET_PX);
  });
});

describe('region serialization', () => {
  it('emits the diagnostic form the browser layout test reads', () => {
    expect(serializeRegion(calculateMineLayout().mine)).toBe('0,236,360,404');
  });
});

describe('palette', () => {
  it('keeps region colors distinguishable so pixel probes are meaningful', () => {
    const colors = [
      HUD_BACKGROUND,
      SURFACE_BACKGROUND,
      PANEL_BACKGROUND,
      LOCKED_PANEL_BACKGROUND,
      PROGRESS_TRACK,
      PROGRESS_FILL,
      MATERIAL_BACKLOG_FILL,
    ];

    expect(new Set(colors).size).toBe(colors.length);
  });

  it('draws locked floors in their own colour, not a dimmed panel', () => {
    expect(LOCKED_PANEL_BACKGROUND).not.toBe(PANEL_BACKGROUND);
    expect(toFillColor(LOCKED_PANEL_BACKGROUND)).toBeLessThan(
      toFillColor(PANEL_BACKGROUND),
    );
  });

  it('derives the numeric fill Phaser needs from the hex source of truth', () => {
    expect(toFillColor(HUD_BACKGROUND)).toBe(0x132238);
    expect(toFillColor('#000000')).toBe(0x000000);
    expect(toFillColor('#ffffff')).toBe(0xffffff);
  });

  it('rejects colors the browser pixel probe could not match', () => {
    expect(() => toFillColor('#FFFFFF')).toThrow(/lowercase #rrggbb/);
    expect(() => toFillColor('#fff')).toThrow(/lowercase #rrggbb/);
    expect(() => toFillColor('fbbf24')).toThrow(/lowercase #rrggbb/);
  });
});
