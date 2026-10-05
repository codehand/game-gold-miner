/** A short, global production overdrive. All times are wall-clock milliseconds. */
export const BOOST_MULTIPLIER = 4;
export const BOOST_DURATION_MS = 5 * 60 * 1_000;
export const BOOST_COOLDOWN_MS = 8 * 60 * 60 * 1_000;

/** The last activation is enough to derive both expiry and next availability. */
export interface BoostState {
  readonly lastActivatedAtMs: number | null;
}

export const EMPTY_BOOST_STATE: BoostState = { lastActivatedAtMs: null };

export function validateBoostState(value: BoostState): BoostState {
  if (value.lastActivatedAtMs !== null &&
    (!Number.isSafeInteger(value.lastActivatedAtMs) || value.lastActivatedAtMs < 0)) {
    throw new Error('Boost activation time must be a non-negative safe integer or null.');
  }
  return value;
}

export function boostEndsAtMs(boost: BoostState): number | null {
  validateBoostState(boost);
  return boost.lastActivatedAtMs === null
    ? null
    : boost.lastActivatedAtMs + BOOST_DURATION_MS;
}

export function boostAvailableAtMs(boost: BoostState): number {
  validateBoostState(boost);
  return boost.lastActivatedAtMs === null
    ? 0
    : boost.lastActivatedAtMs + BOOST_COOLDOWN_MS;
}

export function isBoostActive(boost: BoostState, nowMs: number): boolean {
  validateTime(nowMs);
  const start = validateBoostState(boost).lastActivatedAtMs;
  return start !== null && nowMs >= start && nowMs < start + BOOST_DURATION_MS;
}

export type BoostActivationResult =
  | { readonly kind: 'activated'; readonly boost: BoostState }
  | { readonly kind: 'cooldown'; readonly availableAtMs: number };

export function activateBoost(boost: BoostState, nowMs: number): BoostActivationResult {
  validateTime(nowMs);
  const availableAtMs = boostAvailableAtMs(boost);
  if (nowMs < availableAtMs) {
    return { kind: 'cooldown', availableAtMs };
  }
  return { kind: 'activated', boost: { lastActivatedAtMs: nowMs } };
}

/** Exact overlap of a half-open interval with the active boost window. */
export function boostOverlapMs(boost: BoostState, startMs: number, endMs: number): number {
  validateTime(startMs);
  validateTime(endMs);
  if (endMs < startMs) {
    throw new Error('Boost interval end cannot precede its start.');
  }
  const boostEnd = boostEndsAtMs(boost);
  if (boost.lastActivatedAtMs === null || boostEnd === null) {
    return 0;
  }
  return Math.max(0, Math.min(endMs, boostEnd) - Math.max(startMs, boost.lastActivatedAtMs));
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Time must be a non-negative safe integer.');
  }
}
