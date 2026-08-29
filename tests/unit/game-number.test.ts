import { describe, expect, it } from 'vitest';

import { GameNumber } from '../../src/core';

describe('GameNumber', () => {
  it('performs ordinary arithmetic without mutating its operands', () => {
    const original = GameNumber.from(125);
    const added = original.add(25);
    const subtracted = added.subtract(50);
    const multiplied = subtracted.multiply(3);

    expect(original.equals(125)).toBe(true);
    expect(added.equals(150)).toBe(true);
    expect(subtracted.equals(100)).toBe(true);
    expect(multiplied.equals(300)).toBe(true);
  });

  it('performs arithmetic beyond the JavaScript safe-integer range', () => {
    const huge = GameNumber.from('1e100');

    expect(huge.add('1e100').equals('2e100')).toBe(true);
    expect(GameNumber.from('2e100').subtract(huge).equals('1e100')).toBe(true);
    expect(huge.multiply('1e25').equals('1e125')).toBe(true);
  });

  it('compares ordinary and very large values', () => {
    const value = GameNumber.from('9e120');

    expect(value.compare('9e120')).toBe(0);
    expect(value.lessThan('1e121')).toBe(true);
    expect(value.lessThanOrEqualTo('9e120')).toBe(true);
    expect(value.greaterThan('8e120')).toBe(true);
    expect(value.greaterThanOrEqualTo('9e120')).toBe(true);
  });

  it('round-trips a serialized very large value', () => {
    const original = GameNumber.from('1.2345e250');
    const serialized = original.serialize();
    const restored = GameNumber.deserialize(serialized);

    expect(typeof serialized).toBe('string');
    expect(restored.equals(original)).toBe(true);
    expect(JSON.stringify({ value: original })).toBe(
      JSON.stringify({ value: serialized }),
    );
  });

  it('rejects invalid sources', () => {
    expect(() => GameNumber.from(Number.NaN)).toThrow(/finite/);
    expect(() => GameNumber.from(Number.POSITIVE_INFINITY)).toThrow(/finite/);
    expect(() => GameNumber.deserialize('')).toThrow(/non-empty/);
    expect(() => GameNumber.deserialize('not-a-number')).toThrow(/finite/);
  });

  it('exposes normalized decimal parts for display code', () => {
    const parts = (source: string | number) => {
      const value = GameNumber.from(source);

      return { mantissa: value.mantissa, exponent: value.exponent };
    };

    expect(parts(0)).toEqual({ mantissa: 0, exponent: 0 });
    expect(parts(100)).toEqual({ mantissa: 1, exponent: 2 });
    expect(parts(0.5)).toEqual({ mantissa: 5, exponent: -1 });
    expect(parts(-1_234)).toEqual({ mantissa: -1.234, exponent: 3 });
    // The reason these exist: `Number` cannot carry this magnitude, so a
    // formatter reading through it would lose the value entirely.
    expect(Number(GameNumber.from('7.2e400').serialize())).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(parts('7.2e400')).toEqual({ mantissa: 7.2, exponent: 400 });
  });
});
