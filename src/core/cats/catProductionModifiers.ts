import { calculateCatRoleEffect } from './catDomain';
import type { CatRosterState } from './catDomain';

const MINIMUM_STAGE_MULTIPLIER = 0.01;

/** Derived, renderer-free gameplay effects of the currently assigned cats. */
export interface CatProductionModifiers {
  readonly miningOutputMultiplierByFloor: Readonly<Record<string, number>>;
  readonly elevatorThroughputMultiplier: number;
  readonly warehouseProcessingMultiplier: number;
}

export const EMPTY_CAT_PRODUCTION_MODIFIERS: CatProductionModifiers = {
  miningOutputMultiplierByFloor: {},
  elevatorThroughputMultiplier: 1,
  warehouseProcessingMultiplier: 1,
};

/**
 * Converts the authoritative assignment projection into simulation inputs.
 * Asset IDs, portraits, and Phaser state are intentionally not consulted.
 */
export function createCatProductionModifiers(
  roster: CatRosterState,
): CatProductionModifiers {
  const cats = new Map(roster.cats.map((cat) => [cat.catInstanceId, cat]));
  const miningOutputMultiplierByFloor: Record<string, number> = {};
  let elevatorThroughputMultiplier = 1;
  let warehouseProcessingMultiplier = 1;

  for (const assignment of roster.assignments) {
    const cat = cats.get(assignment.catInstanceId);
    if (cat === undefined) {
      continue;
    }

    const effect = calculateCatRoleEffect(cat);
    const multiplier = Math.max(MINIMUM_STAGE_MULTIPLIER, 1 + effect.skillBonus);
    if (assignment.slotKey.startsWith('miner:')) {
      miningOutputMultiplierByFloor[assignment.slotKey.slice('miner:'.length)] = multiplier;
    } else if (assignment.slotKey === 'elevator:main') {
      elevatorThroughputMultiplier = multiplier;
    } else if (assignment.slotKey === 'warehouse:main') {
      warehouseProcessingMultiplier = multiplier;
    }
  }

  return {
    miningOutputMultiplierByFloor,
    elevatorThroughputMultiplier,
    warehouseProcessingMultiplier,
  };
}

export function getMiningOutputMultiplier(
  modifiers: CatProductionModifiers,
  floorId: string,
): number {
  return modifiers.miningOutputMultiplierByFloor[floorId] ?? 1;
}
