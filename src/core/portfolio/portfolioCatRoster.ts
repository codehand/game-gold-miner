import { MINE_SITE_IDS, type MineSiteId } from '../../config/mineSites';
import {
  getRoleForSlot,
  validateCatRoster,
  type BareCatSlotKey,
  type CatRosterState,
  type CatSlotKey,
} from '../cats/catDomain';

export type MineCatSlotKey = `mine:${MineSiteId}:${BareCatSlotKey}`;

export function qualifyMineCatSlot(mineId: MineSiteId, slotKey: BareCatSlotKey): MineCatSlotKey {
  if (getRoleForSlot(slotKey) === null || slotKey.startsWith('mine:')) {
    throw new Error(`Unsupported mine role slot ${slotKey}.`);
  }
  return `mine:${mineId}:${slotKey}`;
}

export function parseMineCatSlot(slotKey: string): {
  readonly mineId: MineSiteId;
  readonly localSlotKey: BareCatSlotKey;
} | null {
  const match = /^mine:([a-z][a-z0-9-]*):(.+)$/.exec(slotKey);
  if (match === null || !MINE_SITE_IDS.includes(match[1] as MineSiteId)) return null;
  const localSlotKey = match[2] as BareCatSlotKey;
  if (localSlotKey.startsWith('mine:') || getRoleForSlot(localSlotKey) === null) return null;
  return { mineId: match[1] as MineSiteId, localSlotKey };
}

/** V3 slot keys and early V4 local saves all belonged to Gold. */
export function migratePortfolioCatRoster(roster: CatRosterState): CatRosterState {
  validateCatRoster(roster);
  const migrateSlot = (slotKey: string): CatSlotKey => {
    const qualified = parseMineCatSlot(slotKey);
    if (qualified !== null) return slotKey as MineCatSlotKey;
    if (slotKey.startsWith('mine:') || getRoleForSlot(slotKey) === null) {
      throw new Error(`Unsupported portfolio role slot ${slotKey}.`);
    }
    return qualifyMineCatSlot('gold', slotKey as BareCatSlotKey);
  };
  const migrated: CatRosterState = {
    ...roster,
    cats: roster.cats.map((cat) => cat.assignedSlotKey === null
      ? cat
      : { ...cat, assignedSlotKey: migrateSlot(cat.assignedSlotKey) }),
    assignments: roster.assignments.map((assignment) => ({
      ...assignment,
      slotKey: migrateSlot(assignment.slotKey),
    })),
  };
  validateCatRoster(migrated);
  return migrated;
}

/** One mine's scene uses familiar short slots while the save keeps global keys. */
export function projectCatRosterToMine(
  roster: CatRosterState,
  mineId: MineSiteId,
): CatRosterState {
  const normalized = migratePortfolioCatRoster(roster);
  const cats = normalized.cats.flatMap((cat) => {
    if (cat.assignedSlotKey === null) return [cat];
    const slot = parseMineCatSlot(cat.assignedSlotKey);
    return slot?.mineId === mineId
      ? [{ ...cat, assignedSlotKey: slot.localSlotKey }]
      : [];
  });
  const assignments = normalized.assignments.flatMap((assignment) => {
    const slot = parseMineCatSlot(assignment.slotKey);
    return slot?.mineId === mineId
      ? [{ ...assignment, slotKey: slot.localSlotKey }]
      : [];
  });
  const projection = {
    ...normalized,
    cats,
    assignments,
  } satisfies CatRosterState;
  validateCatRoster(projection);
  return projection;
}
