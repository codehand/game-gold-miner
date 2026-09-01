import { describe, expect, it } from 'vitest';

import {
  calculateMineFloorPanelLayout,
  MINE_FLOOR_PANEL_REFERENCE_HEIGHT,
  MINE_FLOOR_PANEL_REFERENCE_WIDTH,
  MIN_TOUCH_TARGET_PX,
} from '../../src/game/layout';

describe('approved mine-floor panel layout', () => {
  it('locks the layout1 composition into the 288x132 floor slot', () => {
    const layout = calculateMineFloorPanelLayout();

    expect(MINE_FLOOR_PANEL_REFERENCE_WIDTH).toBe(288);
    expect(MINE_FLOOR_PANEL_REFERENCE_HEIGHT).toBe(132);
    expect(layout.goldContainer.x).toBeLessThan(layout.unloaderCat.x);
    expect(layout.unloaderCat.x).toBeLessThan(layout.minerPatrol.x);
    expect(layout.minerPatrol.x).toBeLessThan(layout.goldPile.x);
    expect(layout.levelControl.x + layout.levelControl.width).toBe(278);
    expect(layout.goldPile.x + layout.goldPile.width / 2).toBe(232);
    expect(layout.floorBadge).toEqual({
      x: 14.5,
      y: 38.5,
      width: 17,
      height: 17,
    });
    expect(layout.elevatorStopY).toBe(
      layout.goldContainer.y + layout.goldContainer.height / 2,
    );
  });

  it('keeps the miner inside the centre corridor and props below the level control', () => {
    const layout = calculateMineFloorPanelLayout();

    expect(layout.minerPatrol.x + layout.minerPatrol.width - 8).toBeLessThanOrEqual(layout.goldPile.x);
    expect(layout.goldPile.x).toBeLessThan(layout.levelControl.x + layout.levelControl.width);
    expect(layout.progressTrack.y + layout.progressTrack.height).toBeLessThanOrEqual(
      MINE_FLOOR_PANEL_REFERENCE_HEIGHT,
    );
  });

  it('preserves the minimum touch target and scales all semantic regions', () => {
    const layout = calculateMineFloorPanelLayout(576, 264);

    expect(layout.levelControl).toEqual({ x: 468, y: 84, width: 88, height: 100 });
    expect(layout.levelControl.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(layout.unlockControl).toEqual({ x: 372, y: 100, width: 184, height: 88 });
    expect(layout.goldContainer).toEqual({ x: 16, y: 156, width: 96, height: 84 });
    expect(layout.floorBadge).toEqual({
      x: 29,
      y: 77,
      width: 34,
      height: 34,
    });
    expect(layout.elevatorStopY).toBe(198);
  });

  it('rejects invalid panel dimensions', () => {
    expect(() => calculateMineFloorPanelLayout(0, 132)).toThrow(/finite positive/);
    expect(() => calculateMineFloorPanelLayout(288, Number.NaN)).toThrow(/finite positive/);
  });
});
