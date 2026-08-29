import { describe, expect, it } from 'vitest';

import { GameNumber } from '../../src/core';
import {
  ABBREVIATION_TIER_SUFFIXES,
  formatAmount,
  SMALL_NEGATIVE_AMOUNT_LABEL,
  SMALL_POSITIVE_AMOUNT_LABEL,
} from '../../src/game/view-model';

/** Reads a value written the way the balance and save data write them. */
function format(source: string | number): string {
  return formatAmount(GameNumber.from(source));
}

describe('abbreviated amount formatting', () => {
  it('shows ordinary amounts without a suffix', () => {
    expect(format(0)).toBe('0');
    expect(format(1)).toBe('1');
    expect(format(40)).toBe('40');
    expect(format(12.5)).toBe('12.5');
    expect(format(100)).toBe('100');
    expect(format(999)).toBe('999');
  });

  it('abbreviates each magnitude tier as K, M, B, and T', () => {
    expect(format(1_000)).toBe('1K');
    expect(format(1_234)).toBe('1.2K');
    expect(format(12_345)).toBe('12.3K');
    expect(format(999_999)).toBe('999.9K');
    expect(format(1_000_000)).toBe('1M');
    expect(format(2_500_000_000)).toBe('2.5B');
    expect(format('3.75e12')).toBe('3.7T');
  });

  it('continues with alphabetic suffixes past the named tiers', () => {
    // The tier after `T` is the first alphabetic pair, and the game design
    // document's own examples are the reference for this run.
    expect(format('1e15')).toBe('1aa');
    expect(format('1.46e16')).toBe('14.6aa');
    expect(format('7.2e18')).toBe('7.2ab');
    expect(format('1e21')).toBe('1ac');
    expect(format('1e30')).toBe('1af');
  });

  it('walks the alphabet without repeating or skipping a suffix', () => {
    const suffixes = Array.from({ length: 40 }, (_, index) => {
      // One tier apart, so consecutive suffixes are produced in order.
      return format(`1e${15 + index * 3}`).slice(1);
    });

    expect(suffixes.slice(0, 4)).toEqual(['aa', 'ab', 'ac', 'ad']);
    expect(suffixes.slice(24, 28)).toEqual(['ay', 'az', 'ba', 'bb']);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });

  it('formats magnitudes far beyond the safe numeric range', () => {
    // `Number` collapses these to `Infinity`, so a formatter reading through
    // it would print the same thing for every one of them.
    expect(format('1e309')).toBe('1du');
    expect(format('5.5e400')).toBe('55ey');
    expect(format('1e1000')).toBe('10mq');
    // Past the alphabetic run the serialized scientific form is shown rather
    // than an unbounded run of letters.
    expect(format('1e60000')).toBe('1e+60000');
  });

  it('truncates rather than rounds, so a balance never reads high', () => {
    // Rounding here would show `250` for a balance that cannot buy a 250-gold
    // upgrade.
    expect(format(249.96)).toBe('249.9');
    expect(format(12.34)).toBe('12.3');
    expect(format(12.39)).toBe('12.3');
    expect(format(999.99)).toBe('999.9');
    expect(format(1_999.9)).toBe('1.9K');
  });

  it('overstates by no more than the truncation tolerance', () => {
    // The one direction truncation does not cover: a value within the
    // tolerance of the next displayed digit reads as that digit. Pinned here
    // so the bound the formatter documents stays a checked claim.
    expect(format(0.999_999_999_9)).toBe('1');
    expect(format(0.999_999_99)).toBe('0.9');
  });

  it('keeps one decimal place stable across representable values', () => {
    // Values whose scaled form lands just under an integer in floating point;
    // a plain truncation would drop the decimal digit entirely.
    expect(format(0.3)).toBe('0.3');
    expect(format(0.7)).toBe('0.7');
    expect(format(1.1)).toBe('1.1');
    expect(format(2.9)).toBe('2.9');
    expect(format(8.2)).toBe('8.2');
  });

  it('reports a present but tiny amount as more than nothing', () => {
    expect(format(0.05)).toBe(SMALL_POSITIVE_AMOUNT_LABEL);
    expect(format('1e-9')).toBe(SMALL_POSITIVE_AMOUNT_LABEL);
    // Underflows `Number` entirely, and is still not zero.
    expect(format('1e-400')).toBe(SMALL_POSITIVE_AMOUNT_LABEL);
    expect(format(0)).toBe('0');
  });

  it('stays total for values the game itself never produces', () => {
    expect(format(-5.5)).toBe('-5.5');
    expect(format(-1_500)).toBe('-1.5K');
    expect(format(-0.05)).toBe(SMALL_NEGATIVE_AMOUNT_LABEL);
  });

  it('never shrinks as the amount grows', () => {
    const magnitudes = [
      '0',
      '0.5',
      '9.9',
      '999',
      '1000',
      '999999',
      '1e6',
      '1e9',
      '1e12',
      '1e15',
      '1e18',
      '1e100',
      '1e308',
    ];

    for (let index = 1; index < magnitudes.length; index += 1) {
      const previous = GameNumber.from(magnitudes[index - 1]);
      const current = GameNumber.from(magnitudes[index]);

      expect(current.greaterThan(previous)).toBe(true);
      // A displayed value must never be longer-lived than its magnitude: each
      // step up must produce a different label.
      expect(formatAmount(current)).not.toBe(formatAmount(previous));
    }
  });

  it('exposes the named tiers it abbreviates with', () => {
    expect(ABBREVIATION_TIER_SUFFIXES).toEqual(['', 'K', 'M', 'B', 'T']);
  });
});
