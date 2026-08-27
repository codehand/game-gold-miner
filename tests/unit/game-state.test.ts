import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  createInitialGameState,
  GameNumber,
  INITIAL_SAVE_VERSION,
} from '../../src/core';

const TIMESTAMP_MS = 1_788_000_000_000;

describe('initial authoritative game state', () => {
  it('creates the configured four-floor starting state', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);

    expect(state.saveVersion).toBe(INITIAL_SAVE_VERSION);
    expect(state.lastUpdateTimestampMs).toBe(TIMESTAMP_MS);
    expect(state.gold).toBeInstanceOf(GameNumber);
    expect(state.gold.equals(BASE_GAME_BALANCE.startingGold)).toBe(true);
    expect(state.floors).toHaveLength(4);
    expect(state.floors.map(({ isUnlocked }) => isUnlocked)).toEqual([
      true,
      false,
      false,
      false,
    ]);

    state.floors.forEach((floor, index) => {
      const config = BASE_GAME_BALANCE.floors[index];

      expect(floor.id).toBe(config.id);
      expect(floor.floorNumber).toBe(config.floorNumber);
      expect(floor.mineShaftLevel).toBe(config.startingLevel);
      expect(floor.materialQueue.equals(0)).toBe(true);
      expect(floor.totalExtracted.equals(0)).toBe(true);
      expect(floor.totalTransported.equals(0)).toBe(true);
    });

    expect(state.elevator.level).toBe(BASE_GAME_BALANCE.elevator.startingLevel);
    expect(
      state.elevator.capacity.equals(BASE_GAME_BALANCE.elevator.baseCapacity),
    ).toBe(true);
    expect(state.elevator.roundRobinCursor).toBe(0);
    expect(state.elevator.carriedMaterial.equals(0)).toBe(true);

    expect(state.warehouse.level).toBe(
      BASE_GAME_BALANCE.warehouse.startingLevel,
    );
    expect(
      state.warehouse.capacity.equals(BASE_GAME_BALANCE.warehouse.baseCapacity),
    ).toBe(true);
    expect(state.warehouse.inputQueue.equals(0)).toBe(true);
    expect(state.warehouse.totalGoldDelivered.equals(0)).toBe(true);
  });

  it('initializes every progress value within the normalized range', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const progressValues = [
      ...state.floors.map(({ extractionProgress }) => extractionProgress),
      state.elevator.transitProgress,
      state.warehouse.conversionProgress,
    ];

    expect(progressValues).toHaveLength(6);
    expect(progressValues.every((progress) => progress >= 0 && progress < 1)).toBe(
      true,
    );
  });

  it('serializes only authoritative plain data', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const serialized = JSON.stringify(state);
    const parsed: unknown = JSON.parse(serialized);

    expect(serialized).not.toMatch(
      /renderer|scene|canvas|sprite|texture|tween|animation/i,
    );
    expect(serialized).toContain('"gold":"100"');
    expect(serialized).toContain('"materialQueue":"0"');
    expectSerializableData(parsed);
  });

  it('rejects an invalid initial timestamp', () => {
    expect(() => createInitialGameState(BASE_GAME_BALANCE, -1)).toThrow(
      /timestamp/,
    );
    expect(() => createInitialGameState(BASE_GAME_BALANCE, 1.5)).toThrow(
      /timestamp/,
    );
  });
});

function expectSerializableData(value: unknown): void {
  if (value === null) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(expectSerializableData);
    return;
  }

  if (typeof value === 'object') {
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    Object.values(value).forEach(expectSerializableData);
    return;
  }

  expect(['boolean', 'number', 'string']).toContain(typeof value);
}
