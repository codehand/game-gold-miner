import { describe, expect, it } from 'vitest';

import {
  advanceAnimationTimeMs,
  assertAnimationSpeedMultiplier,
  calculateConveyorOffsetPx,
  calculateCycleMarkerOffsetPx,
  calculateGeneratedAssetFrame,
  calculateMinerSwingOffsetPx,
  calculateMinerPatrolPose,
  calculateSurfaceHaulerAssistantOffset,
  calculateSurfaceHaulerAssistantPose,
  calculateSurfaceHaulerCount,
  calculateSurfaceHaulerPose,
  easeElevatorTravelProgress,
  ANIMATION_TIME_WRAP_MS,
  CONVEYOR_CYCLE_MS,
  GENERATED_ASSET_FRAME_DURATION_MS,
  MAX_ANIMATION_FRAME_MS,
  MINER_SWING_PERIOD_MS,
  MINER_PATROL_PERIOD_MS,
  SURFACE_HAULER_PERIOD_MS,
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
    expect(ANIMATION_TIME_WRAP_MS % MINER_PATROL_PERIOD_MS).toBe(0);
    expect(ANIMATION_TIME_WRAP_MS % SURFACE_HAULER_PERIOD_MS).toBe(0);
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

describe('elevator travel easing', () => {
  it('keeps exact stops while slowing visually near both ends of a leg', () => {
    expect(easeElevatorTravelProgress(0)).toBe(0);
    expect(easeElevatorTravelProgress(0.25)).toBeLessThan(0.25);
    expect(easeElevatorTravelProgress(0.5)).toBeCloseTo(0.5, 10);
    expect(easeElevatorTravelProgress(0.75)).toBeGreaterThan(0.75);
    expect(easeElevatorTravelProgress(1)).toBe(1);
  });

  it('rejects progress outside one authoritative leg', () => {
    expect(() => easeElevatorTravelProgress(-0.01)).toThrow(/\[0, 1\]/);
    expect(() => easeElevatorTravelProgress(1.01)).toThrow(/\[0, 1\]/);
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

describe('miner floor patrol', () => {
  it('walks right, turns, walks left, and loops at the approved bounds', () => {
    expect(calculateMinerPatrolPose(0, 100, 170)).toEqual({
      x: 100,
      facesLeft: false,
    });
    expect(calculateMinerPatrolPose(MINER_PATROL_PERIOD_MS / 2, 100, 170)).toEqual({
      x: 170,
      facesLeft: true,
    });
    expect(calculateMinerPatrolPose(MINER_PATROL_PERIOD_MS * 0.75, 100, 170)).toEqual({
      x: 135,
      facesLeft: true,
    });
    expect(calculateMinerPatrolPose(MINER_PATROL_PERIOD_MS, 100, 170)).toEqual({
      x: 100,
      facesLeft: false,
    });
  });

  it('rejects invalid patrol bounds', () => {
    expect(() => calculateMinerPatrolPose(0, 170, 100)).toThrow(/finite and ordered/);
    expect(() => calculateMinerPatrolPose(-1, 100, 170)).toThrow(/finite non-negative/);
  });
});

describe('generated asset frames', () => {
  it('walks four sprite-sheet frames and loops on cosmetic time only', () => {
    expect(calculateGeneratedAssetFrame(0)).toBe(0);
    expect(calculateGeneratedAssetFrame(GENERATED_ASSET_FRAME_DURATION_MS)).toBe(1);
    expect(calculateGeneratedAssetFrame(GENERATED_ASSET_FRAME_DURATION_MS * 3)).toBe(3);
    expect(calculateGeneratedAssetFrame(GENERATED_ASSET_FRAME_DURATION_MS * 4)).toBe(0);
  });

  it('rejects invalid frame contracts', () => {
    expect(() => calculateGeneratedAssetFrame(-1)).toThrow(/finite non-negative/);
    expect(() => calculateGeneratedAssetFrame(0, 0)).toThrow(/positive integer/);
    expect(() => calculateGeneratedAssetFrame(0, 4, 0)).toThrow(/finite positive/);
  });
});

describe('surface hauler loop', () => {
  it('reveals one assistant every ten warehouse levels through level 100', () => {
    expect(calculateSurfaceHaulerCount(1)).toBe(1);
    expect(calculateSurfaceHaulerCount(9)).toBe(1);
    expect(calculateSurfaceHaulerCount(10)).toBe(2);
    expect(calculateSurfaceHaulerCount(20)).toBe(3);
    expect(calculateSurfaceHaulerCount(99)).toBe(10);
    expect(calculateSurfaceHaulerCount(100)).toBe(11);
    expect(calculateSurfaceHaulerCount(101)).toBe(11);
  });

  it('arranges assistants in mirrored rows instead of exact overlap', () => {
    expect(calculateSurfaceHaulerAssistantOffset(0, false)).toEqual({
      x: -8,
      y: -10,
    });
    expect(calculateSurfaceHaulerAssistantOffset(4, false)).toEqual({
      x: -16,
      y: -10,
    });
    expect(calculateSurfaceHaulerAssistantOffset(5, true)).toEqual({
      x: 24,
      y: -20,
    });
  });

  it('phase-shifts every active assistant onto an independent route pose', () => {
    const lead = calculateSurfaceHaulerPose(0, true);
    const firstAssistant = calculateSurfaceHaulerAssistantPose(0, true, 0, 3);
    const secondAssistant = calculateSurfaceHaulerAssistantPose(0, true, 1, 3);

    expect(lead.phase).toBe('loading');
    expect(firstAssistant.phase).toBe('delivering');
    expect(secondAssistant.phase).toBe('unloading');
    expect(firstAssistant.animationTimeOffsetMs).toBeCloseTo(
      SURFACE_HAULER_PERIOD_MS / 3,
    );
    expect(secondAssistant.animationTimeOffsetMs).toBeCloseTo(
      SURFACE_HAULER_PERIOD_MS * 2 / 3,
    );
  });

  it('parks idle assistants apart while keeping independent frames', () => {
    const firstAssistant = calculateSurfaceHaulerAssistantPose(0, false, 0, 3);
    const secondAssistant = calculateSurfaceHaulerAssistantPose(0, false, 1, 3);

    expect(firstAssistant.routeProgress).toBeCloseTo(1 / 3);
    expect(secondAssistant.routeProgress).toBeCloseTo(2 / 3);
    expect(firstAssistant.frame).not.toBe(secondAssistant.frame);
  });

  it('rejects invalid warehouse levels and assistant indexes', () => {
    expect(() => calculateSurfaceHaulerCount(0)).toThrow(/positive safe integer/);
    expect(() => calculateSurfaceHaulerCount(1.5)).toThrow(/positive safe integer/);
    expect(() => calculateSurfaceHaulerAssistantOffset(-1, false)).toThrow(
      /outside the crew/,
    );
    expect(() => calculateSurfaceHaulerAssistantOffset(10, false)).toThrow(
      /outside the crew/,
    );
    expect(() => calculateSurfaceHaulerAssistantPose(0, true, 0, 1)).toThrow(
      /count is outside the crew/,
    );
    expect(() => calculateSurfaceHaulerAssistantPose(0, true, 2, 3)).toThrow(
      /assistant index is outside the crew/,
    );
  });

  it('waits empty beneath the chute when neither shared stage holds gold', () => {
    expect(calculateSurfaceHaulerPose(4_000, false)).toEqual({
      phase: 'idle',
      routeProgress: 0,
      facesLeft: false,
      cartIsFilled: false,
      goldPourVisible: false,
      frame: 0,
    });
  });

  it('pours only while the cart is parked beneath a loaded tower', () => {
    const loading = calculateSurfaceHaulerPose(
      SURFACE_HAULER_PERIOD_MS * 0.1,
      true,
    );
    const delivering = calculateSurfaceHaulerPose(
      SURFACE_HAULER_PERIOD_MS * 0.4,
      true,
    );

    expect(loading).toMatchObject({
      phase: 'loading',
      routeProgress: 0,
      cartIsFilled: false,
      goldPourVisible: true,
    });
    expect(delivering.phase).toBe('delivering');
    expect(delivering.routeProgress).toBeGreaterThan(0);
    expect(delivering.routeProgress).toBeLessThan(1);
    expect(delivering.cartIsFilled).toBe(true);
    expect(delivering.goldPourVisible).toBe(false);
  });

  it('returns the empty cart with the worker facing left', () => {
    const returning = calculateSurfaceHaulerPose(
      SURFACE_HAULER_PERIOD_MS * 0.85,
      true,
    );

    expect(returning.phase).toBe('returning');
    expect(returning.routeProgress).toBeGreaterThan(0);
    expect(returning.routeProgress).toBeLessThan(1);
    expect(returning.facesLeft).toBe(true);
    expect(returning.cartIsFilled).toBe(false);
    expect(returning.goldPourVisible).toBe(false);
  });

  it('rejects invalid animation time', () => {
    expect(() => calculateSurfaceHaulerPose(-1, true)).toThrow(
      /finite non-negative/,
    );
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
