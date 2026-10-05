import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_GAME_BALANCE } from '../../src/config';
import {
  assignCatToSlot, calculateCatRoleEffect, calculateMineProductionRates,
  catchUpSimulation, createCatProductionModifiers, createEmptyCatRoster,
  createInitialGameState, GameNumber, getAssignableCats, getRoleForSlot,
  validateCatRoster, type CatInstance, type CatSlotKey,
} from '../../src/core';
import { getHaulingMultiplier } from '../../src/core/cats';
import { createSaveDocument, deserializeSaveDocument } from '../../src/persistence';
import { parseCatRosterResponse } from '../../src/platform/web/catCollection';
import {
  HAULER_CART_ASSETS, resolveHaulerCartAsset, resolveMarketplaceRuntimeSlot,
} from '../../src/game/assets/marketplaceRuntimeAssets';

const NOW = 1_788_000_000_000;
const tobi: CatInstance = {
  catInstanceId: 'tobi-1', ownerUserId: 'user-1', assetId: 'hauler:SR:tobi:walk',
  displayName: 'Tobi', roleId: 'hauler', rarityTier: 'SR', level: 1,
  attributes: { power: 60, speed: 75, capacity: 70, efficiency: 70 },
  calculationVersion: 1, availabilityState: 'Idle', assignedSlotKey: null, updatedAt: NOW,
};
const roster = { ...createEmptyCatRoster(), cats: [tobi, { ...tobi, catInstanceId: 'tobi-2' }] };

describe('individual surface Haulers', () => {
  it('has exactly five role-matched slots and requires separate owned instances', () => {
    for (let index = 1; index <= 5; index++) expect(getRoleForSlot(`hauler:${index}`)).toBe('hauler');
    for (const key of ['hauler:0', 'hauler:6', 'hauler:01', 'hauler:main']) expect(getRoleForSlot(key)).toBeNull();
    expect(getAssignableCats(roster, 'hauler:1')).toHaveLength(2);
    expect(getAssignableCats(roster, 'warehouse:main')).toHaveLength(0);
    expect(assignCatToSlot(roster, 'hauler:6' as CatSlotKey, 'tobi-1', 0, NOW).success).toBe(false);
    expect(assignCatToSlot(roster, 'miner:floor-1', 'tobi-1', 0, NOW)).toMatchObject({ reason: 'wrong-role' });
    const first = assignCatToSlot(roster, 'hauler:1', 'tobi-1', 0, NOW);
    if (!first.success) throw new Error('assignment failed');
    expect(assignCatToSlot(first.state, 'hauler:2', 'tobi-1', 1, NOW)).toMatchObject({ reason: 'cat-already-assigned' });
    const second = assignCatToSlot(first.state, 'hauler:2', 'tobi-2', 1, NOW);
    if (!second.success) throw new Error('second assignment failed');
    validateCatRoster(second.state);
    expect(second.state.assignments).toHaveLength(2);
  });

  it('restores default without losing the owned cat and survives persistence', () => {
    const assigned = assignCatToSlot(roster, 'hauler:1', 'tobi-1', 0, NOW);
    if (!assigned.success) throw new Error('assignment failed');
    expect(parseCatRosterResponse({
      ...assigned.state,
      cats: assigned.state.cats.map((cat) => ({ ...cat, updatedAt: new Date(cat.updatedAt).toISOString() })),
    })).toEqual(assigned.state);
    const state = createInitialGameState(BASE_GAME_BALANCE, NOW);
    const doc = createSaveDocument(state, BASE_GAME_BALANCE, NOW, assigned.state);
    expect(deserializeSaveDocument(JSON.parse(JSON.stringify(doc)), BASE_GAME_BALANCE).catRoster).toEqual(assigned.state);
    expect(assignCatToSlot(assigned.state, 'hauler:1', null, 0, NOW)).toMatchObject({ reason: 'stale-revision' });
    const reset = assignCatToSlot(assigned.state, 'hauler:1', null, 1, NOW);
    if (!reset.success) throw new Error('reset failed');
    validateCatRoster(reset.state);
    expect(reset.state.cats).toHaveLength(2);
    expect(reset.state.cats[0]).toMatchObject({ availabilityState: 'Idle', assignedSlotKey: null });
    expect(reset.state.assignments).toHaveLength(0);
    expect(assignCatToSlot(reset.state, 'hauler:1', null, 2, NOW)).toMatchObject({ reason: 'no-op' });
    expect(assignCatToSlot(reset.state, 'warehouse:main', null, 2, NOW)).toMatchObject({ reason: 'wrong-role' });
  });

  it('averages bonuses only over active carts and composes with manager and overflow once', () => {
    const assigned = assignCatToSlot(roster, 'hauler:1', 'tobi-1', 0, NOW);
    if (!assigned.success) throw new Error('assignment failed');
    const mods = createCatProductionModifiers(assigned.state);
    const bonus = calculateCatRoleEffect(tobi).skillBonus;
    expect(bonus).toBeCloseTo(0.2188);
    expect(getHaulingMultiplier(mods, 1)).toBeCloseTo(1 + bonus);
    expect(getHaulingMultiplier(mods, 5)).toBeCloseTo(1 + bonus / 5);
    expect(getHaulingMultiplier({ ...mods, haulingMultiplierBySlot: { 'hauler:5': 1.3 } }, 1)).toBe(1);
    const initial = createInitialGameState(BASE_GAME_BALANCE, NOW);
    const state = { ...initial, warehouse: { ...initial.warehouse, level: 100, inputQueue: GameNumber.from('1e40') } };
    const combined = { ...mods, warehouseProcessingMultiplier: 1.2 };
    const baseline = calculateMineProductionRates(state, BASE_GAME_BALANCE);
    const rates = calculateMineProductionRates(state, BASE_GAME_BALANCE, combined);
    expect(Number(rates.warehouseCapacityPerSecond.divide(baseline.warehouseCapacityPerSecond).toJSON())).toBeCloseTo(1.2 * (1 + bonus / 5));
    const simulated = catchUpSimulation(state, 60_000, BASE_GAME_BALANCE, combined);
    const unmodified = catchUpSimulation(state, 60_000, BASE_GAME_BALANCE);
    expect(simulated.warehouse.totalGoldDelivered.greaterThan(unmodified.warehouse.totalGoldDelivered)).toBe(true);
  });

  it('pairs each identity with its own cart and keeps a safe free fallback', () => {
    const defaultSlot = resolveMarketplaceRuntimeSlot('hauler:1', 'hauler', null, () => true);
    expect(defaultSlot.catInstanceId).toBeNull();
    expect(defaultSlot.animation.characterName).toBe('Default Hauler');
    for (const asset of HAULER_CART_ASSETS) {
      const binding = resolveMarketplaceRuntimeSlot('hauler:1', 'hauler', { catInstanceId: 'owned', assetId: asset.assetId! }, () => true);
      expect(binding.animation.assetId).toBe(asset.assetId);
      expect(binding.animation.frameCount).toBe(4);
      expect(resolveHaulerCartAsset(binding.animation.assetId)).toBe(asset);
      for (const path of [asset.emptyPath, asset.filledPath]) {
        expect(existsSync(`public${path}`)).toBe(true);
        const bytes = readFileSync(`public${path}`);
        expect(bytes.readUInt32BE(16)).toBe(128);
        expect(bytes.readUInt32BE(20)).toBe(128);
        expect(bytes[25]).toBe(6);
      }
    }
    expect(resolveHaulerCartAsset('hauler:SSR:rivet:walk').hoverOffsetY).toBeLessThan(0);
    expect(resolveHaulerCartAsset('unknown').assetId).toBeNull();
    const missing = resolveMarketplaceRuntimeSlot('hauler:2', 'hauler', { catInstanceId: 'owned', assetId: tobi.assetId }, () => false);
    expect(missing.usesFallback).toBe(true);
    expect(resolveHaulerCartAsset(missing.animation.assetId).assetId).toBeNull();
  });

  it('enlarges only purchased carts and anchors both cargo states at the ground line', () => {
    const fallback = resolveHaulerCartAsset(null);
    expect(fallback.displaySize).toBe(46);
    expect(fallback.originY).toBe(0.5);
    expect(fallback.baselineOffsetY).toBe(0);
    for (const cart of HAULER_CART_ASSETS) {
      expect(cart.displaySize).toBe(64);
      expect(cart.baselineOffsetY).toBeCloseTo(46 * (121 / 128 - 0.5));
      const cat = resolveMarketplaceRuntimeSlot('hauler:1', 'hauler', {
        catInstanceId: 'owned', assetId: cart.assetId!,
      }, () => true);
      expect(cat.animation.displaySize).toBe(52);
      expect(cart.originY).toBe(cart.assetId === 'hauler:SR:tobi:walk' ? 95 / 128 : 89 / 128);
    }
  });
});
