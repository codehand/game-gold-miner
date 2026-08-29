import { describe, expect, it } from 'vitest';

import {
  advanceAnimationTimeMs,
  assertAnimationSpeedMultiplier,
  calculateConveyorOffsetPx,
  calculateCycleMarkerOffsetPx,
  calculateMinerSwingOffsetPx,
  ANIMATION_TIME_WRAP_MS,
  CONVEYOR_CYCLE_MS,
  MAX_ANIMATION_FRAME_MS,
  MINER_SWING_PERIOD_MS,
} from '../../src/game/view-model';

describe('cosmetic animation clock', () => {
  it('accumulates the rendered frame delta scaled by the speed multiplier', () => {
    expect(advanceAnimationTimeMs(0, 16, 1)).toBe(16);
    expect(advanceAnimationTimeMs(100, 16, 4)).toBe(164);
  });

  it('freezes at speed zero without freezing anything else', () => {
    expect(advanceAnimationTimeMs(250, 16, 0)).toBe(250);
  });

  it('caps a single frame so a hitch cannot teleport an animation', () => {
    expect(advanceAnimationTimeMs(0, 10_000, 1)).toBe(MAX_ANIMATION_FRAME_MS);
  });

  it('ignores a non-positive or invalid frame delta from the renderer', () => {
    expect(advanceAnimationTimeMs(120, 0, 1)).toBe(120);
    expect(advanceAnimationTimeMs(120, -16, 1)).toBe(120);
    expect(advanceAnimationTimeMs(120, Number.NaN, 1)).toBe(120);
  });

  it('wraps on a whole multiple of both cycle lengths, so motion is seamless', () => {
    expect(advanceAnimationTimeMs(ANIMATION_TIME_WRAP_MS - 10, 30, 1)).toBe(20);
    expect(ANIMATION_TIME_WRAP_MS % MINER_SWING_PERIOD_MS).toBe(0);
    expect(ANIMATION_TIME_WRAP_MS % CONVEYOR_CYCLE_MS).toBe(0);
  });

  it('rejects an invalid speed multiplier or accumulated time', () => {
    expect(() => assertAnimationSpeedMultiplier(-1)).toThrow(
      /finite non-negative/,
    );
    expect(() => assertAnimationSpeedMultiplier(Number.NaN)).toThrow(
      /finite non-negative/,
    );
    expect(() => advanceAnimationTimeMs(-1, 16, 1)).toThrow(
      /finite non-negative/,
    );
  });
});

describe('miner swing', () => {
  it('starts at rest and stays inside its amplitude', () => {
    expect(calculateMinerSwingOffsetPx(0, 6)).toBeCloseTo(0, 10);

    for (let timeMs = 0; timeMs < MINER_SWING_PERIOD_MS * 3; timeMs += 7) {
      expect(Math.abs(calculateMinerSwingOffsetPx(timeMs, 6))).toBeLessThanOrEqual(6);
    }
  });

  it('repeats exactly once per swing period', () => {
    const sampleMs = 137;

    expect(
      calculateMinerSwingOffsetPx(sampleMs + MINER_SWING_PERIOD_MS, 6),
    ).toBeCloseTo(calculateMinerSwingOffsetPx(sampleMs, 6), 10);
    expect(
      calculateMinerSwingOffsetPx(MINER_SWING_PERIOD_MS / 4, 6),
    ).toBeCloseTo(6, 10);
  });

  it('rejects an invalid time or amplitude', () => {
    expect(() => calculateMinerSwingOffsetPx(-1, 6)).toThrow(/finite non-negative/);
    expect(() => calculateMinerSwingOffsetPx(0, -6)).toThrow(/finite non-negative/);
  });
});

describe('conveyor travel', () => {
  it('travels the span once per cycle and restarts', () => {
    expect(calculateConveyorOffsetPx(0, 60)).toBe(0);
    expect(calculateConveyorOffsetPx(CONVEYOR_CYCLE_MS / 2, 60)).toBeCloseTo(30, 10);
    expect(calculateConveyorOffsetPx(CONVEYOR_CYCLE_MS, 60)).toBe(0);
  });

  it('stays inside the span', () => {
    for (let timeMs = 0; timeMs < CONVEYOR_CYCLE_MS * 2; timeMs += 13) {
      const offset = calculateConveyorOffsetPx(timeMs, 60);

      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(60);
    }
  });
});

describe('cycle marker', () => {
  it('follows authoritative progress and nothing else', () => {
    expect(calculateCycleMarkerOffsetPx(0, 100)).toBe(0);
    expect(calculateCycleMarkerOffsetPx(0.25, 100)).toBe(25);
    expect(calculateCycleMarkerOffsetPx(0.999, 100)).toBeCloseTo(99.9, 10);
  });

  it('rejects progress outside the normalized cycle range', () => {
    expect(() => calculateCycleMarkerOffsetPx(1, 100)).toThrow(/\[0, 1\)/);
    expect(() => calculateCycleMarkerOffsetPx(-0.1, 100)).toThrow(/\[0, 1\)/);
  });
});
