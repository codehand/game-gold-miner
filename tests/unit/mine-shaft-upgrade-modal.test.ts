import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateMineShaftUpgradeBatchCost,
  createInitialGameState,
  GameNumber,
} from '../../src/core';
import {
  createElevatorUpgradeModalViewModel,
  createMineShaftUpgradeModalViewModel,
  createWarehouseUpgradeModalViewModel,
} from '../../src/game/view-model';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('mine-shaft upgrade modal view model', () => {
  it('describes mining attributes and affordable x1, x5, and MAX choices', () => {
    const initial = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const floor = initial.floors[0];
    const config = BASE_GAME_BALANCE.floors[0];
    const fiveCost = calculateMineShaftUpgradeBatchCost(floor, config, 5);
    const model = createMineShaftUpgradeModalViewModel({
      floor,
      config,
      gold: fiveCost,
    });

    expect(model.title).toBe('Floor 1');
    expect(model.levelLabel).toBe('Level 1');
    expect(model.attributes).toEqual([
      { label: 'Output / cycle', value: '10' },
      { label: 'Cycle time', value: '2.0s' },
      { label: 'Gold waiting', value: '0' },
      { label: 'Next output', value: '11' },
    ]);
    expect(model.options.map(({ id, quantity, isEnabled }) => ({
      id,
      quantity,
      isEnabled,
    }))).toEqual([
      { id: 'x1', quantity: 1, isEnabled: true },
      { id: 'x5', quantity: 5, isEnabled: true },
      { id: 'max', quantity: 5, isEnabled: true },
    ]);
  });

  it('disables MAX as x0 when no next level is affordable', () => {
    const initial = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const model = createMineShaftUpgradeModalViewModel({
      floor: initial.floors[0],
      config: BASE_GAME_BALANCE.floors[0],
      gold: GameNumber.from(0),
    });

    expect(model.options[0].isEnabled).toBe(false);
    expect(model.options[1].isEnabled).toBe(false);
    expect(model.options[2]).toMatchObject({
      label: 'MAX x0',
      quantity: 0,
      isEnabled: false,
    });
  });
});

describe('elevator upgrade modal view model', () => {
  it('shows live tower attributes and affordable x1, x5, and exact MAX choices', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const fundedState = {
      ...state,
      gold: GameNumber.from(1_000),
      elevator: {
        ...state.elevator,
        carriedMaterial: GameNumber.from(25),
      },
    };
    const model = createElevatorUpgradeModalViewModel({
      stage: fundedState.elevator,
      config: BASE_GAME_BALANCE.elevator,
      gold: fundedState.gold,
    });

    expect(model.target).toEqual({ type: 'elevator' });
    expect(model.title).toBe('Elevator Tower');
    expect(model.levelLabel).toBe('Level 1');
    expect(model.attributes).toEqual([
      { label: 'Capacity', value: '50' },
      { label: 'Cycle time', value: '1.5s' },
      { label: 'Carrying', value: '25' },
      { label: 'Next capacity', value: '56' },
    ]);
    expect(model.options[0]).toMatchObject({ id: 'x1', quantity: 1, isEnabled: true });
    expect(model.options[1]).toMatchObject({ id: 'x5', quantity: 5, isEnabled: true });
    expect(model.options[2].id).toBe('max');
    expect(model.options[2].quantity).toBeGreaterThanOrEqual(5);
  });
});

describe('warehouse upgrade modal view model', () => {
  it('shows live warehouse attributes and affordable x1, x5, and exact MAX choices', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const fundedState = {
      ...state,
      gold: GameNumber.from(1_000),
      warehouse: {
        ...state.warehouse,
        inputQueue: GameNumber.from(33.33),
      },
    };
    const model = createWarehouseUpgradeModalViewModel({
      stage: fundedState.warehouse,
      config: BASE_GAME_BALANCE.warehouse,
      gold: fundedState.gold,
    });

    expect(model.target).toEqual({ type: 'warehouse' });
    expect(model.title).toBe('Warehouse');
    expect(model.levelLabel).toBe('Level 1');
    expect(model.attributes).toEqual([
      { label: 'Capacity / cycle', value: '60' },
      { label: 'Cycle time', value: '1.2s' },
      { label: 'Gold queued', value: '33.33' },
      { label: 'Next capacity', value: '67.20' },
    ]);
    expect(model.options[0]).toMatchObject({ id: 'x1', quantity: 1, isEnabled: true });
    expect(model.options[1]).toMatchObject({ id: 'x5', quantity: 5, isEnabled: true });
    expect(model.options[2].id).toBe('max');
    expect(model.options[2].quantity).toBeGreaterThanOrEqual(5);
  });
});
