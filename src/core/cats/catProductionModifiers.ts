import { calculateCatRoleEffect } from './catDomain';
import type { CatRosterState } from './catDomain';

const MINIMUM_STAGE_MULTIPLIER = 0.01;

/** Derived, renderer-free gameplay effects of the currently assigned cats. */
export interface CatProductionModifiers {
  readonly miningOutputMultiplierByFloor: Readonly<Record<string, number>>;
  readonly elevatorThroughputMultiplier: number;
  readonly warehouseProcessingMultiplier: number;
  readonly haulingMultiplierBySlot?: Readonly<Record<string, number>>;
}

export const EMPTY_CAT_PRODUCTION_MODIFIERS: CatProductionModifiers = {
  miningOutputMultiplierByFloor: {},
  elevatorThroughputMultiplier: 1,
  warehouseProcessingMultiplier: 1,
  haulingMultiplierBySlot: {},
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
  const haulingMultiplierBySlot: Record<string, number> = {};
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
    } else if (assignment.slotKey.startsWith('hauler:')) {
      haulingMultiplierBySlot[assignment.slotKey] = multiplier;
    }
  }

  return {
    miningOutputMultiplierByFloor,
    elevatorThroughputMultiplier,
    warehouseProcessingMultiplier,
    haulingMultiplierBySlot,
  };
}

/** Each active cart owns one equal share; inactive slots never add a bonus. */
export function getHaulingMultiplier(
  modifiers: CatProductionModifiers,
  activeCartCount: number,
): number {
  if (!Number.isInteger(activeCartCount) || activeCartCount < 1 || activeCartCount > 5) {
    throw new Error('Active hauler count must be between one and five.');
  }
  let total = 0;
  for (let index = 1; index <= activeCartCount; index += 1) {
    total += modifiers.haulingMultiplierBySlot?.[`hauler:${index}`] ?? 1;
  }
  return total / activeCartCount;
}

export function getMiningOutputMultiplier(
  modifiers: CatProductionModifiers,
  floorId: string,
): number {
  return modifiers.miningOutputMultiplierByFloor[floorId] ?? 1;
}
