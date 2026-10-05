/**
 * Shared mine-floor workforce rules used by simulation, rates, anti-cheat,
 * and rendering.
 *
 * The raw count is derived from the shaft level rather than persisted. The
 * renderer caps the visible crew at five cats; overflow cats become a
 * productivity multiplier for the visible crew, so higher shaft levels keep
 * improving extraction without adding more sprites.
 */
export const MINE_FLOOR_WORKER_LEVEL_INTERVAL = 50;
/** The first level at which the visible five-cat cap is reached. */
export const MINE_FLOOR_WORKER_MAX_LEVEL = 200;
export const MINE_FLOOR_WORKER_MAX_COUNT = 5;

export interface MineFloorWorkforce {
  readonly rawCount: number;
  readonly visibleCount: number;
  readonly productivityMultiplier: number;
}

export function calculateMineFloorWorkforce(
  mineShaftLevel: number,
): MineFloorWorkforce {
  if (!Number.isSafeInteger(mineShaftLevel) || mineShaftLevel < 1) {
    throw new Error('Mine-shaft level must be a positive safe integer.');
  }

  const rawCount = 1 + Math.floor(
    mineShaftLevel / MINE_FLOOR_WORKER_LEVEL_INTERVAL,
  );
  const visibleCount = Math.min(rawCount, MINE_FLOOR_WORKER_MAX_COUNT);

  return {
    rawCount,
    visibleCount,
    productivityMultiplier: rawCount / visibleCount,
  };
}

export function calculateMineFloorWorkerCount(mineShaftLevel: number): number {
  return calculateMineFloorWorkforce(mineShaftLevel).visibleCount;
}
