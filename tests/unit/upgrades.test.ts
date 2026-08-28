import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateElevatorUpgradeCost,
  calculateMineShaftUpgradeCost,
  calculateWarehouseUpgradeCost,
  createInitialGameState,
  GameNumber,
  purchaseElevatorUpgrade,
  purchaseMineShaftUpgrade,
  purchaseWarehouseUpgrade,
  type GameState,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('stage upgrades', () => {
  it('calculates exact next costs from each current stage level', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );

    expect(
      calculateMineShaftUpgradeCost(
        initialState.floors[0],
        BASE_GAME_BALANCE.floors[0],
      ).toJSON(),
    ).toBe('28.75');
    expect(
      calculateElevatorUpgradeCost(
        initialState.elevator,
        BASE_GAME_BALANCE.elevator,
      ).toJSON(),
    ).toBe('115');
    expect(
      calculateWarehouseUpgradeCost(
        initialState.warehouse,
        BASE_GAME_BALANCE.warehouse,
      ).toJSON(),
    ).toBe('138');

    const leveledState: GameState = {
      ...initialState,
      floors: initialState.floors.map((floor, index) => ({
        ...floor,
        mineShaftLevel: index === 0 ? 3 : floor.mineShaftLevel,
      })),
      elevator: { ...initialState.elevator, level: 10 },
      warehouse: { ...initialState.warehouse, level: 25 },
    };

    expect(
      calculateMineShaftUpgradeCost(
        leveledState.floors[0],
        BASE_GAME_BALANCE.floors[0],
      ).toJSON(),
    ).toBe('38.02187499999999');
    expect(
      calculateElevatorUpgradeCost(
        leveledState.elevator,
        BASE_GAME_BALANCE.elevator,
      ).toJSON(),
    ).toBe('404.5557735707907');
    expect(
      calculateWarehouseUpgradeCost(
        leveledState.warehouse,
        BASE_GAME_BALANCE.warehouse,
      ).toJSON(),
    ).toBe('3950.274314374752');
  });

  it('purchases a mine-shaft upgrade with an exact balance', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const cost = calculateMineShaftUpgradeCost(
      initialState.floors[0],
      BASE_GAME_BALANCE.floors[0],
    );
    const state = { ...initialState, gold: cost };
    const result = purchaseMineShaftUpgrade(
      state,
      'floor-1',
      BASE_GAME_BALANCE,
    );

    expect(result.success).toBe(true);

    if (!result.success) {
      throw new Error('Expected mine-shaft purchase to succeed.');
    }

    expect(result.cost.equals(cost)).toBe(true);
    expect(result.state.gold.equals(0)).toBe(true);
    expect(result.state.floors[0].mineShaftLevel).toBe(2);
    expect(result.state.floors[0].extractionProgress).toBe(
      state.floors[0].extractionProgress,
    );
    expect(result.state.floors[0].materialQueue).toBe(
      state.floors[0].materialQueue,
    );
    expect(result.state.floors.slice(1)).toEqual(state.floors.slice(1));
    expect(result.state.elevator).toBe(state.elevator);
    expect(result.state.warehouse).toBe(state.warehouse);
  });

  it('purchases elevator and warehouse upgrades independently', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const elevatorCost = calculateElevatorUpgradeCost(
      initialState.elevator,
      BASE_GAME_BALANCE.elevator,
    );
    const elevatorState = {
      ...initialState,
      gold: elevatorCost,
    };
    const elevatorResult = purchaseElevatorUpgrade(
      elevatorState,
      BASE_GAME_BALANCE,
    );

    expect(elevatorResult.success).toBe(true);

    if (!elevatorResult.success) {
      throw new Error('Expected elevator purchase to succeed.');
    }

    expect(elevatorResult.state.gold.equals(0)).toBe(true);
    expect(elevatorResult.state.elevator.level).toBe(2);
    expect(elevatorResult.state.elevator.capacity).toBe(
      elevatorState.elevator.capacity,
    );
    expect(elevatorResult.state.elevator.transitProgress).toBe(
      elevatorState.elevator.transitProgress,
    );
    expect(elevatorResult.state.floors).toBe(elevatorState.floors);
    expect(elevatorResult.state.warehouse).toBe(elevatorState.warehouse);

    const warehouseCost = calculateWarehouseUpgradeCost(
      initialState.warehouse,
      BASE_GAME_BALANCE.warehouse,
    );
    const warehouseState = {
      ...initialState,
      gold: warehouseCost,
    };
    const warehouseResult = purchaseWarehouseUpgrade(
      warehouseState,
      BASE_GAME_BALANCE,
    );

    expect(warehouseResult.success).toBe(true);

    if (!warehouseResult.success) {
      throw new Error('Expected warehouse purchase to succeed.');
    }

    expect(warehouseResult.state.gold.equals(0)).toBe(true);
    expect(warehouseResult.state.warehouse.level).toBe(2);
    expect(warehouseResult.state.warehouse.capacity).toBe(
      warehouseState.warehouse.capacity,
    );
    expect(warehouseResult.state.warehouse.conversionProgress).toBe(
      warehouseState.warehouse.conversionProgress,
    );
    expect(warehouseResult.state.floors).toBe(warehouseState.floors);
    expect(warehouseResult.state.elevator).toBe(warehouseState.elevator);
  });

  it('returns insufficient funds without changing state', () => {
    const initialState = createInitialGameState(
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );
    const state = { ...initialState, gold: GameNumber.from(0) };
    const results = [
      purchaseMineShaftUpgrade(state, 'floor-1', BASE_GAME_BALANCE),
      purchaseElevatorUpgrade(state, BASE_GAME_BALANCE),
      purchaseWarehouseUpgrade(state, BASE_GAME_BALANCE),
    ];

    results.forEach((result) => {
      expect(result.success).toBe(false);

      if (result.success) {
        throw new Error('Expected purchase to fail.');
      }

      expect(result.reason).toBe('insufficient-funds');
      expect(result.cost).not.toBeNull();
      expect(result.state).toBe(state);
    });
  });

  it('rejects locked and unknown floors without changing state', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const lockedResult = purchaseMineShaftUpgrade(
      state,
      'floor-2',
      BASE_GAME_BALANCE,
    );
    const missingResult = purchaseMineShaftUpgrade(
      state,
      'floor-missing',
      BASE_GAME_BALANCE,
    );

    expect(lockedResult).toMatchObject({
      success: false,
      reason: 'floor-locked',
      state,
    });
    expect(lockedResult.cost).not.toBeNull();
    expect(missingResult).toEqual({
      success: false,
      reason: 'floor-not-found',
      state,
      cost: null,
    });
  });

  it('rejects invalid and non-incrementable levels', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);

    expect(() =>
      calculateMineShaftUpgradeCost(
        { ...state.floors[0], mineShaftLevel: 0 },
        BASE_GAME_BALANCE.floors[0],
      ),
    ).toThrow(/positive safe integer/);
    expect(() =>
      calculateElevatorUpgradeCost(
        { ...state.elevator, level: Number.MAX_SAFE_INTEGER },
        BASE_GAME_BALANCE.elevator,
      ),
    ).toThrow(/room to increment/);
  });
});
