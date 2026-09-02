/**
 * Abbreviated display formatting for every amount the screen shows.
 *
 * An idle-game balance outgrows ordinary numerals within minutes, so amounts
 * are shown against lowercase magnitude suffixes: `k`, `m`, `b`, `t`, the
 * named large tiers through `dc`, and then alphabetic pairs (`aa`, `ab`, ...).
 * Formatting lives here rather than on `GameNumber` so arithmetic and
 * presentation stay separable, and here rather than in the scene so it is
 * unit-testable in Node.
 *
 * Values are read through their normalized mantissa and exponent instead of
 * being converted to a `number`, so a magnitude past `Number.MAX_VALUE`
 * formats like any other rather than collapsing to `Infinity`.
 */

import type { GameNumber } from '../../core';

/** Magnitude suffixes below the alphabetic run; each spans a factor of 1,000. */
export const ABBREVIATION_TIER_SUFFIXES = [
  '',
  'k',
  'm',
  'b',
  't',
  'qa',
  'qi',
  'sx',
  'sp',
  'oc',
  'no',
  'dc',
] as const;

/** Shown instead of `0` for an amount that is small but genuinely present. */
export const SMALL_POSITIVE_AMOUNT_LABEL = '<0.01';
/** Its mirror. No game amount is negative; the formatter stays total anyway. */
export const SMALL_NEGATIVE_AMOUNT_LABEL = '>-0.01';

const ALPHABETIC_TIER_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
/** Alphabetic suffixes start at two letters after the named `dc` tier. */
const MIN_ALPHABETIC_TIER_LENGTH = 2;
/**
 * Bound on suffix growth. Three letters carry 18,252 tiers — beyond 1e54000,
 * which no reachable balance approaches — and past that the serialized
 * scientific form is shown rather than an unbounded run of letters.
 */
const MAX_ALPHABETIC_TIER_LENGTH = 3;

const TIER_EXPONENT_SPAN = 3;
const DISPLAY_DECIMALS = 2;
const DISPLAY_SCALE = 10 ** DISPLAY_DECIMALS;
/**
 * Truncation runs on a value that has already been through floating-point
 * scaling, where `0.3 * 10` lands just below `3`. Nudging by far less than the
 * displayed precision keeps that from dropping a whole digit.
 *
 * It is what bounds the overstatement in `formatAmount`: a value within this
 * much of the next displayed digit is shown as that digit, so `0.9999999999`
 * reads `1`. Eight orders of magnitude below the displayed precision, and far
 * below any price the balance data expresses.
 */
const TRUNCATION_TOLERANCE = 1e-9;

/**
 * Formats one amount for display: two stable decimal places for abbreviated
 * tiers, then the suffix for its magnitude; ordinary integers stay unpadded.
 *
 * The displayed digits are truncated rather than rounded, because a balance
 * that reads higher than it is would promise an upgrade the player cannot
 * actually afford. Truncation is not exact at the last digit — see
 * `TRUNCATION_TOLERANCE`, which bounds how far a label may overstate — but the
 * gap is far smaller than the cheapest thing the player can buy.
 */
export function formatAmount(value: GameNumber): string {
  const { mantissa, exponent } = value;

  if (mantissa === 0) {
    return '0';
  }

  // Values below 1,000 carry no suffix, so a negative exponent must not select
  // one; it lowers the displayed digits instead.
  const tier = Math.max(0, Math.floor(exponent / TIER_EXPONENT_SPAN));
  const suffix = describeAmountTier(tier);

  if (suffix === null) {
    return value.serialize();
  }

  // Exact at every suffixed tier: the leftover exponent is 0, 1, or 2, so the
  // displayed number lands in [1, 1000). Below the first tier it can be
  // smaller, and underflows to zero for absurdly small values, which the label
  // below reports honestly rather than as `0`.
  const displayed = truncate(
    Math.abs(mantissa) * 10 ** (exponent - tier * TIER_EXPONENT_SPAN),
  );
  const isNegative = mantissa < 0;

  if (displayed === 0) {
    return isNegative ? SMALL_NEGATIVE_AMOUNT_LABEL : SMALL_POSITIVE_AMOUNT_LABEL;
  }

  const digits = Number.isInteger(displayed) && suffix === ''
    ? String(displayed)
    : displayed.toFixed(DISPLAY_DECIMALS);

  return `${isNegative ? '-' : ''}${digits}${suffix}`;
}


function truncate(value: number): number {
  return Math.floor(value * DISPLAY_SCALE + TRUNCATION_TOLERANCE) / DISPLAY_SCALE;
}

/** The suffix for one magnitude tier, or `null` past the alphabetic run. */
export function describeAmountTier(tier: number): string | null {
  if (!Number.isSafeInteger(tier) || tier < 0) {
    throw new Error('Amount tier must be a non-negative safe integer.');
  }

  if (tier < ABBREVIATION_TIER_SUFFIXES.length) {
    return ABBREVIATION_TIER_SUFFIXES[tier];
  }

  return describeAlphabeticTier(tier - ABBREVIATION_TIER_SUFFIXES.length);
}

/**
 * The alphabetic suffix at `index`, counting `aa`, `ab`, ... `zz`, `aaa`, ...
 * Each length is a plain base-26 run over the alphabet, so the sequence never
 * repeats a suffix and never skips one.
 */
function describeAlphabeticTier(index: number): string | null {
  let remaining = index;

  for (
    let length = MIN_ALPHABETIC_TIER_LENGTH;
    length <= MAX_ALPHABETIC_TIER_LENGTH;
    length += 1
  ) {
    const capacity = ALPHABETIC_TIER_LETTERS.length ** length;

    if (remaining < capacity) {
      let suffix = '';

      for (let position = 0; position < length; position += 1) {
        suffix =
          ALPHABETIC_TIER_LETTERS[remaining % ALPHABETIC_TIER_LETTERS.length] +
          suffix;
        remaining = Math.floor(remaining / ALPHABETIC_TIER_LETTERS.length);
      }

      return suffix;
    }

    remaining -= capacity;
  }

  return null;
}
