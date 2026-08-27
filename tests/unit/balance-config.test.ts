import { describe, expect, it } from 'vitest';

import {
  BASE_GAME_BALANCE,
  type BaseGameBalanceConfig,
  validateBaseGameBalance,
} from '../../src/config';

describe('base-game balance configuration', () => {
  it('accepts the provisional base-game values', () => {
    expect(() => validateBaseGameBalance(BASE_GAME_BALANCE)).not.toThrow();
    expect(BASE_GAME_BALANCE.floors).toHaveLength(4);
    expect(BASE_GAME_BALANCE.floors[0].startingUnlocked).toBe(true);
    expect(
      BASE_GAME_BALANCE.floors.slice(1).every(({ startingUnlocked }) => {
        return !startingUnlocked;
      }),
    ).toBe(true);
  });

  it('rejects missing floors', () => {
    const config = withFloors(BASE_GAME_BALANCE.floors.slice(0, 3));

    expect(() => validateBaseGameBalance(config)).toThrow(/exactly four/);
  });

  it('rejects duplicate floor identifiers', () => {
    const duplicate = {
      ...BASE_GAME_BALANCE.floors[1],
      id: BASE_GAME_BALANCE.floors[0].id,
    };
    const config = withFloors([
      BASE_GAME_BALANCE.floors[0],
      duplicate,
      ...BASE_GAME_BALANCE.floors.slice(2),
    ]);

    expect(() => validateBaseGameBalance(config)).toThrow(/duplicate floor id/);
  });

  it('rejects negative durations', () => {
    const invalidFloor = {
      ...BASE_GAME_BALANCE.floors[0],
      cycleDurationMs: -1,
    };
    const config = withFloors([
      invalidFloor,
      ...BASE_GAME_BALANCE.floors.slice(1),
    ]);

    expect(() => validateBaseGameBalance(config)).toThrow(
      /cycleDurationMs must be a positive finite number/,
    );
  });

  it('rejects non-positive yields', () => {
    const invalidFloor = {
      ...BASE_GAME_BALANCE.floors[0],
      baseYield: 0,
    };
    const config = withFloors([
      invalidFloor,
      ...BASE_GAME_BALANCE.floors.slice(1),
    ]);

    expect(() => validateBaseGameBalance(config)).toThrow(
      /baseYield must be a positive finite number/,
    );
  });

  it('rejects an invalid milestone order', () => {
    const config: BaseGameBalanceConfig = {
      ...BASE_GAME_BALANCE,
      elevator: {
        ...BASE_GAME_BALANCE.elevator,
        upgrade: {
          ...BASE_GAME_BALANCE.elevator.upgrade,
          milestones: [
            { level: 25, multiplier: 2 },
            { level: 10, multiplier: 2 },
            { level: 50, multiplier: 3 },
            { level: 100, multiplier: 4 },
          ],
        },
      },
    };

    expect(() => validateBaseGameBalance(config)).toThrow(
      /ordered 10\/25\/50\/100/,
    );
  });
});

function withFloors(
  floors: BaseGameBalanceConfig['floors'],
): BaseGameBalanceConfig {
  return {
    ...BASE_GAME_BALANCE,
    floors,
  };
}
