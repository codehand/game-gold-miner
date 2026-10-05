/**
 * Authoritative surface-delivery workforce derived from warehouse progression.
 *
 * The renderer shows at most five cats. Once the old count would exceed that
 * cap, the overflow becomes productivity shared by the visible crew so the
 * aggregate surface-delivery capacity does not drop. The existing warehouse
 * input queue is the surface handoff boundary, so no extra save-state queue is
 * needed for this stage.
 */

export const SURFACE_HAULER_LEVEL_INTERVAL = 10;
export const SURFACE_HAULER_MAX_WAREHOUSE_LEVEL = 100;
export const SURFACE_HAULER_MAX_VISIBLE_COUNT = 5;

export interface SurfaceHaulerWorkforce {
  readonly rawCount: number;
  readonly visibleCount: number;
  readonly productivityMultiplier: number;
}

export function calculateSurfaceHaulerWorkforce(
  warehouseLevel: number,
): SurfaceHaulerWorkforce {
  if (!Number.isSafeInteger(warehouseLevel) || warehouseLevel < 1) {
    throw new Error('Warehouse level must be a positive safe integer.');
  }

  const cappedLevel = Math.min(
    warehouseLevel,
    SURFACE_HAULER_MAX_WAREHOUSE_LEVEL,
  );
  const rawCount = 1 + Math.floor(
    cappedLevel / SURFACE_HAULER_LEVEL_INTERVAL,
  );
  const visibleCount = Math.min(rawCount, SURFACE_HAULER_MAX_VISIBLE_COUNT);

  return {
    rawCount,
    visibleCount,
    productivityMultiplier: rawCount / visibleCount,
  };
}
