import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateLevelEffect,
  calculateMineProductionRates,
  calculateSurfaceHaulerWorkforce,
  catchUpSimulation,
  createInitialGameState,
  GameNumber,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('surface hauler workforce', () => {
  it('caps visible cats and converts overflow into shared productivity', () => {
    expect(calculateSurfaceHaulerWorkforce(1)).toEqual({
      rawCount: 1,
      visibleCount: 1,
      productivityMultiplier: 1,
    });
    expect(calculateSurfaceHaulerWorkforce(40)).toEqual({
      rawCount: 5,
      visibleCount: 5,
      productivityMultiplier: 1,
    });
    expect(calculateSurfaceHaulerWorkforce(50)).toEqual({
      rawCount: 6,
      visibleCount: 5,
      productivityMultiplier: 1.2,
    });
    expect(calculateSurfaceHaulerWorkforce(99)).toEqual({
      rawCount: 10,
      visibleCount: 5,
      productivityMultiplier: 2,
    });
    expect(calculateSurfaceHaulerWorkforce(180)).toEqual({
      rawCount: 11,
      visibleCount: 5,
      productivityMultiplier: 2.2,
    });
  });

  it('applies overflow productivity to derived warehouse throughput', () => {
    const initialState = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const warehouseLevel = 100;
    const warehouseCapacity = calculateLevelEffect(
      BASE_GAME_BALANCE.warehouse.baseCapacity,
      warehouseLevel,
      BASE_GAME_BALANCE.warehouse.upgrade,
    );
    const state = {
      ...initialState,
      floors: initialState.floors.map((floor) => ({
        ...floor,
        isUnlocked: false,
      })),
      elevator: {
        ...initialState.elevator,
        capacity: GameNumber.from(1_000_000),
      },
      warehouse: {
        ...initialState.warehouse,
        level: warehouseLevel,
        capacity: warehouseCapacity,
        inputQueue: GameNumber.from('1e100'),
      },
    };
    const rates = calculateMineProductionRates(state, BASE_GAME_BALANCE);
    const expectedRate = warehouseCapacity.multiply(
      (1_000 / BASE_GAME_BALANCE.warehouse.cycleDurationMs) * 2.2,
    );

    expect(rates.surfaceHaulerProductivityMultiplier).toBe(2.2);
    expect(rates.warehouseCapacityPerSecond.equals(expectedRate)).toBe(true);
  });

  it('uses the same productivity in authoritative conversion', () => {
    const initialState = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const warehouseLevel = 100;
    const warehouseCapacity = calculateLevelEffect(
      BASE_GAME_BALANCE.warehouse.baseCapacity,
      warehouseLevel,
      BASE_GAME_BALANCE.warehouse.upgrade,
    );
    const state = {
      ...initialState,
      floors: initialState.floors.map((floor) => ({
        ...floor,
        isUnlocked: false,
      })),
      warehouse: {
        ...initialState.warehouse,
        level: warehouseLevel,
        capacity: warehouseCapacity,
        inputQueue: GameNumber.from('1e100'),
      },
    };
    const nextState = catchUpSimulation(state, 1_200);
    const expectedDelivered = warehouseCapacity.multiply(2);

    expect(Number(nextState.warehouse.totalGoldDelivered.toJSON())).toBeCloseTo(
      Number(expectedDelivered.toJSON()),
      6,
    );
  });

  it('rejects invalid warehouse levels', () => {
    expect(() => calculateSurfaceHaulerWorkforce(0)).toThrow(
      /positive safe integer/,
    );
    expect(() => calculateSurfaceHaulerWorkforce(1.5)).toThrow(
      /positive safe integer/,
    );
  });
});
