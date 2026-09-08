import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateMineShaftUpgradeBatchCost,
  createInitialGameState,
  GameNumber,
} from '../../src/core';
import { createMineShaftUpgradeModalViewModel } from '../../src/game/view-model';

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
