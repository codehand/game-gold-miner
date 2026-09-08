import { describe, expect, it } from 'vitest';

import {
  advanceAnimationTimeMs,
  assertAnimationSpeedMultiplier,
  calculateConveyorOffsetPx,
  calculateCycleMarkerOffsetPx,
  calculateGeneratedAssetFrame,
  calculateMineFloorMinerAssistantPose,
  calculateMineFloorMinerCount,
  interpolateNormalizedProgressForward,
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

  it('adds one presentation miner every fifty floor levels through level 200', () => {
    expect(calculateMineFloorMinerCount(1)).toBe(1);
    expect(calculateMineFloorMinerCount(49)).toBe(1);
    expect(calculateMineFloorMinerCount(50)).toBe(2);
    expect(calculateMineFloorMinerCount(99)).toBe(2);
    expect(calculateMineFloorMinerCount(100)).toBe(3);
    expect(calculateMineFloorMinerCount(150)).toBe(4);
    expect(calculateMineFloorMinerCount(200)).toBe(5);
    expect(calculateMineFloorMinerCount(201)).toBe(5);
  });

  it('phase-shifts floor assistants into shallow independent patrol lanes', () => {
    const crew = Array.from({ length: 4 }, (_, assistantIndex) =>
      calculateMineFloorMinerAssistantPose(
        0.25,
        assistantIndex,
        5,
        100,
        212,
      ));

    expect(new Set(crew.map(({ x, yOffset }) => `${x}:${yOffset}`)).size).toBe(4);
    expect(crew.map(({ yOffset }) => yOffset)).toEqual([-4, 4, -7, 7]);
    expect(new Set(crew.map(({ animationTimeOffsetMs }) => animationTimeOffsetMs)).size)
      .toBe(4);
  });

  it('rejects invalid mine-floor crew inputs', () => {
    expect(() => calculateMineFloorMinerCount(0)).toThrow(/positive safe integer/);
    expect(() => calculateMineFloorMinerCount(1.5)).toThrow(/positive safe integer/);
    expect(() => calculateMineFloorMinerAssistantPose(1, 0, 2, 100, 212))
      .toThrow(/\[0, 1\)/);
    expect(() => calculateMineFloorMinerAssistantPose(0.2, 0, 1, 100, 212))
      .toThrow(/count is outside the crew/);
    expect(() => calculateMineFloorMinerAssistantPose(0.2, 2, 3, 100, 212))
      .toThrow(/assistant index is outside the crew/);
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

describe('rendered progress interpolation', () => {
  it('spreads one fixed-step update across rendered frames', () => {
    expect(interpolateNormalizedProgressForward(0.2, 0.25, 0, 100)).toBe(0.2);
    expect(
      interpolateNormalizedProgressForward(0.2, 0.25, 50, 100),
    ).toBeCloseTo(0.225);
    expect(
      interpolateNormalizedProgressForward(0.2, 0.25, 100, 100),
    ).toBe(0.25);
    expect(
      interpolateNormalizedProgressForward(0.2, 0.25, 500, 100),
    ).toBe(0.25);
  });

  it('moves forward smoothly across a cycle wrap', () => {
    expect(
      interpolateNormalizedProgressForward(0.98, 0.03, 50, 100),
    ).toBeCloseTo(0.005);
    expect(
      interpolateNormalizedProgressForward(0.98, 0.03, 100, 100),
    ).toBeCloseTo(0.03);
  });

  it('rejects invalid progress transition inputs', () => {
    expect(() =>
      interpolateNormalizedProgressForward(-0.1, 0.2, 10, 100),
    ).toThrow(/Progress start/);
    expect(() =>
      interpolateNormalizedProgressForward(0.1, 1, 10, 100),
    ).toThrow(/Progress target/);
    expect(() =>
      interpolateNormalizedProgressForward(0.1, 0.2, -1, 100),
    ).toThrow(/transition time/);
    expect(() =>
      interpolateNormalizedProgressForward(0.1, 0.2, 10, 0),
    ).toThrow(/transition duration/);
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

  it('spaces assistants horizontally on one mirrored route line', () => {
    expect(calculateSurfaceHaulerAssistantOffset(0, false)).toEqual({
      x: -8,
      y: 0,
    });
    expect(calculateSurfaceHaulerAssistantOffset(4, false)).toEqual({
      x: -16,
      y: 0,
    });
    expect(calculateSurfaceHaulerAssistantOffset(5, true)).toEqual({
      x: 24,
      y: 0,
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

  it('keeps empty assistants moving on independent route phases', () => {
    const firstAssistant = calculateSurfaceHaulerAssistantPose(0, false, 0, 3);
    const secondAssistant = calculateSurfaceHaulerAssistantPose(0, false, 1, 3);

    expect(firstAssistant.phase).toBe('delivering');
    expect(firstAssistant.routeProgress).toBeGreaterThan(0);
    expect(secondAssistant.phase).toBe('unloading');
    expect(secondAssistant.routeProgress).toBe(1);
    expect(firstAssistant.cartIsFilled).toBe(false);
    expect(secondAssistant.cartIsFilled).toBe(false);
    expect(firstAssistant.goldPourVisible).toBe(false);
    expect(secondAssistant.goldPourVisible).toBe(false);
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

  it('keeps making empty round trips when the tower has no gold', () => {
    const delivering = calculateSurfaceHaulerPose(
      SURFACE_HAULER_PERIOD_MS * 0.4,
      false,
    );
    const returning = calculateSurfaceHaulerPose(
      SURFACE_HAULER_PERIOD_MS * 0.85,
      false,
    );

    expect(delivering.phase).toBe('delivering');
    expect(delivering.routeProgress).toBeGreaterThan(0);
    expect(delivering.facesLeft).toBe(false);
    expect(returning.phase).toBe('returning');
    expect(returning.routeProgress).toBeGreaterThan(0);
    expect(returning.facesLeft).toBe(true);

    for (const pose of [delivering, returning]) {
      expect(pose.cartIsFilled).toBe(false);
      expect(pose.goldPourVisible).toBe(false);
    }
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
