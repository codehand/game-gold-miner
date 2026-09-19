import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MINE_FLOOR_CHARACTER_DISPLAY_SIZE,
  MINE_SHAFT_CARGO_CAT_SIZE,
  SURFACE_WAREHOUSE_MANAGER_SIZE,
} from '../../src/game/layout';

interface RoleRecord {
  readonly roleId: string;
  readonly displayName: string;
  readonly assetFamilyId: string;
  readonly marketplaceV1: boolean;
  readonly runtimeDisplaySize: number;
  readonly storyRead: string;
  readonly primarySkill: string;
  readonly primaryBenefit: string;
  readonly weights: Readonly<Record<string, number>>;
}

interface RoleMatrix {
  readonly schemaVersion: number;
  readonly status: string;
  readonly rarityTiers: readonly string[];
  readonly attributeKeys: readonly string[];
  readonly roles: readonly RoleRecord[];
  readonly futureRoles: readonly RoleRecord[];
  readonly animationPolicy: {
    readonly baseTiers: {
      readonly rarityTiers: readonly string[];
      readonly grid: string;
      readonly frameCount: number;
      readonly frameSize: string;
    };
    readonly premiumTiers: {
      readonly rarityTiers: readonly string[];
      readonly grid: string;
      readonly frameCount: number;
      readonly frameSize: string;
    };
  };
}

const matrixPath = resolve('art-source/cat-role-catalog/marketplace-role-matrix.json');
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8')) as RoleMatrix;

describe('Marketplace Phase 0 role matrix', () => {
  it('records the approved v1 roles and keeps Unloader separate', () => {
    expect(matrix.schemaVersion).toBe(1);
    expect(matrix.status).toBe('approved-phase-0');
    expect(matrix.roles.map((role) => role.roleId)).toEqual([
      'elevator',
      'warehouse',
      'miner',
    ]);
    expect(matrix.futureRoles.map((role) => role.roleId)).toEqual(['unloader']);
    expect(matrix.roles.every((role) => role.marketplaceV1)).toBe(true);
    expect(matrix.futureRoles.every((role) => !role.marketplaceV1)).toBe(true);
  });

  it('keeps the four v1 attributes and one-point role weight budgets', () => {
    expect(matrix.attributeKeys).toEqual([
      'power',
      'speed',
      'capacity',
      'efficiency',
    ]);

    for (const role of matrix.roles) {
      expect(Object.keys(role.weights).sort()).toEqual(
        [...matrix.attributeKeys].sort(),
      );
      const total = Object.values(role.weights).reduce((sum, weight) => sum + weight, 0);
      expect(total, `${role.roleId} weights`).toBeCloseTo(1, 10);
      expect(Object.values(role.weights).every((weight) => weight >= 0 && weight <= 1)).toBe(true);
    }
  });

  it('matches the runtime display boxes that the role art must fit', () => {
    const displaySizes = new Map(matrix.roles.map((role) => [role.roleId, role.runtimeDisplaySize]));
    expect(displaySizes.get('elevator')).toBe(MINE_SHAFT_CARGO_CAT_SIZE);
    expect(displaySizes.get('warehouse')).toBe(SURFACE_WAREHOUSE_MANAGER_SIZE);
    expect(displaySizes.get('miner')).toBe(MINE_FLOOR_CHARACTER_DISPLAY_SIZE);
    expect(matrix.futureRoles[0]?.runtimeDisplaySize).toBe(MINE_FLOOR_CHARACTER_DISPLAY_SIZE);
  });

  it('defines the base and premium animation contracts without mixing them with gameplay stats', () => {
    expect(matrix.animationPolicy.baseTiers).toMatchObject({
      rarityTiers: ['N', 'R'],
      grid: '2x2',
      frameCount: 4,
      frameSize: '128x128',
    });
    expect(matrix.animationPolicy.premiumTiers).toMatchObject({
      rarityTiers: ['SR', 'SSR', 'UR'],
      grid: '4x2',
      frameCount: 8,
      frameSize: '128x128',
    });
  });

  it('keeps the existing catalog families mapped to their story roles', () => {
    const manifest = JSON.parse(
      readFileSync(resolve('art-source/cat-role-catalog/asset-manifest.json'), 'utf8'),
    ) as { readonly roles: readonly { readonly roleId: string }[] };
    const manifestRoleIds = new Set(manifest.roles.map((role) => role.roleId));

    expect(manifestRoleIds).toEqual(
      new Set(['unloader', 'warehouse-manager', 'elevator-cargo-cat', 'surface-elevator-tower']),
    );
    expect(matrix.roles.find((role) => role.roleId === 'elevator')?.assetFamilyId).toBe(
      'elevator-cargo-cat',
    );
    expect(matrix.roles.find((role) => role.roleId === 'warehouse')?.assetFamilyId).toBe(
      'warehouse-manager',
    );
    expect(matrix.futureRoles[0]?.assetFamilyId).toBe('unloader');
    expect(existsSync(resolve('art-source/cat-role-catalog'))).toBe(true);
  });

  it('keeps the Marketplace v1 filters aligned with the approved roles', () => {
    const source = readFileSync(resolve('src/ui/MarketplaceModal.ts'), 'utf8');
    expect(source).toContain("'Elevator'");
    expect(source).toContain("'Warehouse'");
    expect(source).toContain("'Miner'");
  });
});
