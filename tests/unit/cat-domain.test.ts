import { describe, expect, it } from 'vitest';

import {
  assignCatToSlot,
  calculateCatRoleEffect,
  calculateRoleScore,
  compareCatForSlot,
  createCatProductionModifiers,
  createEmptyCatRoster,
  getAssignableCats,
  validateCatRoster,
  type CatInstance,
  type CatRosterState,
} from '../../src/core';

const elevatorA = cat('elevator-a', 'elevator', {
  power: 62,
  speed: 90,
  capacity: 72,
  efficiency: 80,
});
const elevatorB = cat('elevator-b', 'elevator', {
  power: 90,
  speed: 72,
  capacity: 92,
  efficiency: 88,
});
const miner = cat('miner-a', 'miner', {
  power: 90,
  speed: 70,
  capacity: 40,
  efficiency: 80,
});

function cat(
  id: string,
  roleId: CatInstance['roleId'],
  attributes: CatInstance['attributes'],
): CatInstance {
  return {
    catInstanceId: id,
    ownerUserId: 'user-1',
    assetId: `${roleId}:asset:${id}`,
    displayName: id,
    roleId,
    rarityTier: 'SR',
    level: 1,
    attributes,
    calculationVersion: 1,
    availabilityState: 'Idle',
    assignedSlotKey: null,
    updatedAt: 1,
  };
}

function rosterWith(...cats: readonly CatInstance[]): CatRosterState {
  return { ...createEmptyCatRoster(), cats };
}

describe('cat domain', () => {
  it('keeps instance identity separate from a reusable asset identity', () => {
    const first = { ...elevatorA, assetId: 'shared-asset' };
    const second = { ...elevatorB, assetId: 'shared-asset' };
    const roster = rosterWith(first, second);

    expect(roster.cats.map((candidate) => candidate.catInstanceId)).toEqual([
      'elevator-a',
      'elevator-b',
    ]);
    expect(roster.cats[0]?.assetId).toBe(roster.cats[1]?.assetId);
    validateCatRoster(roster);
  });

  it('reproduces the approved role score and bonus formula', () => {
    expect(calculateRoleScore(elevatorA)).toBe(80.3);
    expect(calculateCatRoleEffect(elevatorA)).toMatchObject({
      primarySkill: 'Lift Mastery',
      affectedMetric: 'elevator-throughput',
      skillBonus: 0.24484,
    });
  });

  it('replaces a slot atomically and returns the old cat to Idle', () => {
    const initial = rosterWith(elevatorA, elevatorB);
    const assigned = assignCatToSlot(
      initial,
      'elevator:main',
      elevatorA.catInstanceId,
      0,
      2,
    );
    expect(assigned.success).toBe(true);
    if (!assigned.success) return;

    const replaced = assignCatToSlot(
      assigned.state,
      'elevator:main',
      elevatorB.catInstanceId,
      1,
      3,
    );
    expect(replaced.success).toBe(true);
    if (!replaced.success) return;

    expect(replaced.state.assignments).toEqual([
      { slotKey: 'elevator:main', catInstanceId: 'elevator-b' },
    ]);
    expect(replaced.state.cats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          catInstanceId: 'elevator-a',
          availabilityState: 'Idle',
          assignedSlotKey: null,
        }),
        expect.objectContaining({
          catInstanceId: 'elevator-b',
          availabilityState: 'Assigned',
          assignedSlotKey: 'elevator:main',
        }),
      ]),
    );
    validateCatRoster(replaced.state);
  });

  it('rejects wrong role, stale revision, duplicate assignment, and no-op replacement', () => {
    const initial = rosterWith(elevatorA, miner);
    const wrongRole = assignCatToSlot(initial, 'elevator:main', miner.catInstanceId, 0, 2);
    expect(wrongRole).toEqual({ success: false, reason: 'wrong-role' });

    const assigned = assignCatToSlot(initial, 'elevator:main', elevatorA.catInstanceId, 0, 2);
    expect(assigned.success).toBe(true);
    if (!assigned.success) return;

    expect(assignCatToSlot(assigned.state, 'elevator:main', elevatorA.catInstanceId, 1, 3)).toEqual({
      success: false,
      reason: 'no-op',
    });
    expect(assignCatToSlot(assigned.state, 'elevator:main', miner.catInstanceId, 0, 3)).toEqual({
      success: false,
      reason: 'stale-revision',
    });
  });

  it('filters candidates by exact role and assignable state', () => {
    const assigned = { ...elevatorA, availabilityState: 'Assigned' as const, assignedSlotKey: 'elevator:main' as const };
    const candidates = getAssignableCats(rosterWith(assigned, elevatorB, miner), 'elevator:main');

    expect(candidates.map((candidate) => candidate.catInstanceId)).toEqual(['elevator-b']);
  });

  it('returns a before/after comparison without mutating roster state', () => {
    const roster = rosterWith(elevatorA, elevatorB);
    const comparison = compareCatForSlot(roster, 'elevator:main', elevatorB.catInstanceId);

    expect(comparison?.affectedMetric).toBe('elevator-throughput');
    expect(comparison?.skillBonusDelta).toBeGreaterThan(0);
    expect(roster.assignments).toHaveLength(0);
  });

  it('derives role-specific production multipliers from assignments only', () => {
    const roster = {
      ...rosterWith(elevatorA, miner),
      cats: [
        { ...elevatorA, availabilityState: 'Assigned' as const, assignedSlotKey: 'elevator:main' as const },
        { ...miner, availabilityState: 'Assigned' as const, assignedSlotKey: 'miner:floor-1' as const },
      ],
      assignments: [
        { slotKey: 'elevator:main' as const, catInstanceId: elevatorA.catInstanceId },
        { slotKey: 'miner:floor-1' as const, catInstanceId: miner.catInstanceId },
      ],
    };

    const modifiers = createCatProductionModifiers(roster);

    expect(modifiers.elevatorThroughputMultiplier).toBeGreaterThan(1);
    expect(modifiers.miningOutputMultiplierByFloor['floor-1']).toBeGreaterThan(1);
    expect(modifiers.warehouseProcessingMultiplier).toBe(1);
  });
});
