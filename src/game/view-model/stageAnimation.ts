/**
 * Pure cosmetic-animation maths for the three production stages.
 *
 * Everything here is decoration. The core decides when a cycle completes; this
 * module only decides how the screen looks between those decisions, so scaling
 * or freezing it cannot change extraction, transport, conversion, or gold.
 * That separation is the point of `animationSpeedMultiplier`: it multiplies the
 * cosmetic clock only, and no production value is ever derived from it.
 *
 * Kept Phaser-free and browser-free so Node tests can exercise it directly.
 */

export const DEFAULT_ANIMATION_SPEED_MULTIPLIER = 1;
/** Generated Step 32A loops contain four equally timed frames. */
export const GENERATED_ASSET_FRAME_COUNT = 4;
export const GENERATED_ASSET_FRAME_DURATION_MS = 160;
export const MINER_PATROL_PERIOD_MS = 3_200;
/** One base miner, plus one visible assistant per fifty floor levels. */
export const MINE_FLOOR_MINER_LEVEL_INTERVAL = 50;
export const MINE_FLOOR_MINER_MAX_LEVEL = 200;
export const MINE_FLOOR_MINER_MAX_COUNT = 5;
export const MINE_FLOOR_MINER_ASSISTANT_COUNT =
  MINE_FLOOR_MINER_MAX_COUNT - 1;
/** One load, delivery, unload, and return lap across the surface. */
export const SURFACE_HAULER_PERIOD_MS = 5_200;
/** One base worker, plus one visible assistant per ten warehouse levels. */
export const SURFACE_HAULER_LEVEL_INTERVAL = 10;
export const SURFACE_HAULER_MAX_WAREHOUSE_LEVEL = 100;
export const SURFACE_HAULER_MAX_COUNT = 11;
export const SURFACE_HAULER_ASSISTANT_COUNT = SURFACE_HAULER_MAX_COUNT - 1;

export interface SurfaceHaulerAssistantOffset {
  readonly x: number;
  readonly y: number;
}

export interface SurfaceHaulerAssistantPose extends SurfaceHaulerPose {
  readonly animationTimeOffsetMs: number;
}

export type SurfaceHaulerPhase =
  | 'loading'
  | 'delivering'
  | 'unloading'
  | 'returning';

export interface SurfaceHaulerPose {
  readonly phase: SurfaceHaulerPhase;
  /** Normalized left-to-right position between chute and warehouse. */
  readonly routeProgress: number;
  readonly facesLeft: boolean;
  readonly cartIsFilled: boolean;
  readonly goldPourVisible: boolean;
  readonly frame: number;
}

export interface MinerPatrolPose {
  readonly x: number;
  readonly facesLeft: boolean;
}

export interface MineFloorMinerAssistantPose extends MinerPatrolPose {
  readonly yOffset: number;
  readonly animationTimeOffsetMs: number;
}

/** Presentation-only miner count derived from one floor's shaft level. */
export function calculateMineFloorMinerCount(mineShaftLevel: number): number {
  if (!Number.isSafeInteger(mineShaftLevel) || mineShaftLevel < 1) {
    throw new Error('Mine-shaft level must be a positive safe integer.');
  }

  const cappedLevel = Math.min(mineShaftLevel, MINE_FLOOR_MINER_MAX_LEVEL);

  return 1 + Math.floor(cappedLevel / MINE_FLOOR_MINER_LEVEL_INTERVAL);
}

/**
 * Places one assistant on an independently phased patrol with a shallow lane.
 * Core extraction progress still drives every route; these offsets only keep
 * a growing cosmetic crew readable inside the same floor corridor.
 */
export function calculateMineFloorMinerAssistantPose(
  extractionProgress: number,
  assistantIndex: number,
  activeMinerCount: number,
  startX: number,
  endX: number,
): MineFloorMinerAssistantPose {
  if (
    !Number.isFinite(extractionProgress) ||
    extractionProgress < 0 ||
    extractionProgress >= 1
  ) {
    throw new Error('Extraction progress must be in [0, 1).');
  }

  if (
    !Number.isSafeInteger(activeMinerCount) ||
    activeMinerCount < 2 ||
    activeMinerCount > MINE_FLOOR_MINER_MAX_COUNT
  ) {
    throw new Error('Active mine-floor miner count is outside the crew.');
  }

  if (
    !Number.isSafeInteger(assistantIndex) ||
    assistantIndex < 0 ||
    assistantIndex >= activeMinerCount - 1
  ) {
    throw new Error('Active mine-floor assistant index is outside the crew.');
  }

  const progressOffset = (assistantIndex + 1) / (activeMinerCount + 1);
  const assistantProgress = (extractionProgress + progressOffset) % 1;
  const animationTimeOffsetMs = progressOffset * MINER_PATROL_PERIOD_MS;
  const patrol = calculateMinerPatrolPose(
    assistantProgress * MINER_PATROL_PERIOD_MS,
    startX,
    endX,
  );
  const laneMagnitude = 4 + Math.floor(assistantIndex / 2) * 3;

  return {
    ...patrol,
    yOffset: assistantIndex % 2 === 0 ? -laneMagnitude : laneMagnitude,
    animationTimeOffsetMs,
  };
}

/**
 * Presentation-only worker count derived from warehouse progression.
 *
 * Level 1 starts with one worker. Levels 10, 20, ... 100 reveal one more
 * assistant each, and levels beyond the current cap keep the level-100 crew.
 */
export function calculateSurfaceHaulerCount(warehouseLevel: number): number {
  if (!Number.isSafeInteger(warehouseLevel) || warehouseLevel < 1) {
    throw new Error('Warehouse level must be a positive safe integer.');
  }

  const cappedLevel = Math.min(
    warehouseLevel,
    SURFACE_HAULER_MAX_WAREHOUSE_LEVEL,
  );

  return 1 + Math.floor(cappedLevel / SURFACE_HAULER_LEVEL_INTERVAL);
}

/**
 * Stagger assistants horizontally along the lead worker's single route line.
 * The formation mirrors when the crew returns so helpers never stack exactly.
 */
export function calculateSurfaceHaulerAssistantOffset(
  assistantIndex: number,
  facesLeft: boolean,
): SurfaceHaulerAssistantOffset {
  if (
    !Number.isSafeInteger(assistantIndex) ||
    assistantIndex < 0 ||
    assistantIndex >= SURFACE_HAULER_ASSISTANT_COUNT
  ) {
    throw new Error('Surface hauler assistant index is outside the crew.');
  }

  const column = assistantIndex % 3 + 1;
  const direction = facesLeft ? 1 : -1;

  return {
    x: direction * column * 8,
    y: 0,
  };
}

/**
 * Gives each assistant its own point in the delivery loop.
 *
 * Active workers are evenly phase-shifted around the route instead of copying
 * the lead cat's transform. An empty tower changes only cargo feedback: every
 * assistant still completes the same collection-and-return route.
 */
export function calculateSurfaceHaulerAssistantPose(
  animationTimeMs: number,
  hasCargo: boolean,
  assistantIndex: number,
  activeHaulerCount: number,
): SurfaceHaulerAssistantPose {
  assertAnimationTime(animationTimeMs);

  if (
    !Number.isSafeInteger(activeHaulerCount) ||
    activeHaulerCount < 2 ||
    activeHaulerCount > SURFACE_HAULER_MAX_COUNT
  ) {
    throw new Error('Active surface hauler count is outside the crew.');
  }

  if (
    !Number.isSafeInteger(assistantIndex) ||
    assistantIndex < 0 ||
    assistantIndex >= activeHaulerCount - 1
  ) {
    throw new Error('Active surface hauler assistant index is outside the crew.');
  }

  const animationTimeOffsetMs = SURFACE_HAULER_PERIOD_MS *
    (assistantIndex + 1) / activeHaulerCount;
  const offsetTimeMs = animationTimeMs + animationTimeOffsetMs;

  return {
    ...calculateSurfaceHaulerPose(offsetTimeMs, hasCargo),
    animationTimeOffsetMs,
  };
}

/**
 * Smooth start and arrival for one authoritative elevator leg.
 *
 * The endpoints and total leg duration still come from the core. This only
 * remaps the rendered position with zero visual velocity at both stops, so the
 * cabin settles instead of snapping through floors and tiring the eye.
 */
export function easeElevatorTravelProgress(progress: number): number {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new Error('Elevator travel progress must be in [0, 1].');
  }

  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

/**
 * Cosmetic surface-delivery loop with cargo feedback driven by tower gold.
 *
 * The worker always visits the tower, travels to the warehouse, and returns.
 * Material only controls the pour and filled-cart appearance, so an empty
 * tower produces an empty round trip rather than parking the crew. No value
 * from this pose is fed back into production or persistence.
 */
export function calculateSurfaceHaulerPose(
  animationTimeMs: number,
  hasCargo: boolean,
): SurfaceHaulerPose {
  assertAnimationTime(animationTimeMs);

  const phase = (animationTimeMs % SURFACE_HAULER_PERIOD_MS) /
    SURFACE_HAULER_PERIOD_MS;
  const frame = calculateGeneratedAssetFrame(animationTimeMs, 4, 180);

  if (phase < 0.2) {
    return {
      phase: 'loading',
      routeProgress: 0,
      facesLeft: false,
      cartIsFilled: hasCargo && phase >= 0.12,
      goldPourVisible: hasCargo,
      frame,
    };
  }

  if (phase < 0.62) {
    return {
      phase: 'delivering',
      routeProgress: easeElevatorTravelProgress((phase - 0.2) / 0.42),
      facesLeft: false,
      cartIsFilled: hasCargo,
      goldPourVisible: false,
      frame,
    };
  }

  if (phase < 0.74) {
    return {
      phase: 'unloading',
      routeProgress: 1,
      facesLeft: true,
      cartIsFilled: hasCargo && phase < 0.68,
      goldPourVisible: false,
      frame,
    };
  }

  return {
    phase: 'returning',
    routeProgress: 1 - easeElevatorTravelProgress((phase - 0.74) / 0.26),
    facesLeft: true,
    cartIsFilled: false,
    goldPourVisible: false,
    frame,
  };
}

/** Ping-pong walk along one floor, with a direction flip at each end. */
export function calculateMinerPatrolPose(
  animationTimeMs: number,
  startX: number,
  endX: number,
): MinerPatrolPose {
  assertAnimationTime(animationTimeMs);

  if (!Number.isFinite(startX) || !Number.isFinite(endX) || endX < startX) {
    throw new Error('Miner patrol bounds must be finite and ordered.');
  }

  const phase = (animationTimeMs % MINER_PATROL_PERIOD_MS) / MINER_PATROL_PERIOD_MS;
  const facesLeft = phase >= 0.5;
  const localProgress = facesLeft ? (1 - phase) * 2 : phase * 2;

  return {
    x: startX + (endX - startX) * localProgress,
    facesLeft,
  };
}

/**
 * Smooths one authoritative fixed-step progress update across rendered frames.
 *
 * The target always advances around the normalized cycle, including a wrap
 * from a high value to a low one. Once the transition duration has elapsed the
 * exact authoritative target is returned, so a paused core cannot keep moving.
 */
export function interpolateNormalizedProgressForward(
  from: number,
  target: number,
  elapsedMs: number,
  transitionDurationMs: number,
): number {
  assertNormalizedProgress(from, 'Progress start');
  assertNormalizedProgress(target, 'Progress target');

  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('Progress transition time must be finite and non-negative.');
  }

  if (!Number.isFinite(transitionDurationMs) || transitionDurationMs <= 0) {
    throw new Error('Progress transition duration must be finite and positive.');
  }

  const transitionProgress = Math.min(elapsedMs / transitionDurationMs, 1);
  const forwardDistance = target >= from
    ? target - from
    : 1 - from + target;

  return (from + forwardDistance * transitionProgress) % 1;
}

/** Frame selection for generated sprite sheets, driven only by cosmetic time. */
export function calculateGeneratedAssetFrame(
  animationTimeMs: number,
  frameCount: number = GENERATED_ASSET_FRAME_COUNT,
  frameDurationMs: number = GENERATED_ASSET_FRAME_DURATION_MS,
): number {
  if (!Number.isFinite(animationTimeMs) || animationTimeMs < 0) {
    throw new Error('Animation time must be a finite non-negative number.');
  }

  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error('Animation frame count must be a positive integer.');
  }

  if (!Number.isFinite(frameDurationMs) || frameDurationMs <= 0) {
    throw new Error('Animation frame duration must be a finite positive number.');
  }

  return Math.floor(animationTimeMs / frameDurationMs) % frameCount;
}

/** A hitch or a backgrounded tab must not teleport a cosmetic animation. */
export const MAX_ANIMATION_FRAME_MS = 250;

/** One full swing of a placeholder miner's pick. */
export const MINER_SWING_PERIOD_MS = 800;

/** One full travel of a shared stage's conveyor dash. */
export const CONVEYOR_CYCLE_MS = 900;

/**
 * Cosmetic time wraps here to stay in comfortable floating-point range. The
 * value is a whole multiple of every cosmetic loop, so the wrap is seamless.
 */
export const ANIMATION_TIME_WRAP_MS = 7_488_000;

const TAU = Math.PI * 2;

export function assertAnimationSpeedMultiplier(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      'Animation speed multiplier must be a finite non-negative number.',
    );
  }
}

/**
 * Accumulates cosmetic time from one rendered frame.
 *
 * A non-positive or invalid frame delta advances nothing rather than throwing,
 * because the renderer, not the player, supplies it.
 */
export function advanceAnimationTimeMs(
  currentMs: number,
  frameDeltaMs: number,
  speedMultiplier: number,
): number {
  assertAnimationSpeedMultiplier(speedMultiplier);

  if (!Number.isFinite(currentMs) || currentMs < 0) {
    throw new Error('Animation time must be a finite non-negative number.');
  }

  if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) {
    return currentMs;
  }

  const creditedMs =
    Math.min(frameDeltaMs, MAX_ANIMATION_FRAME_MS) * speedMultiplier;

  return (currentMs + creditedMs) % ANIMATION_TIME_WRAP_MS;
}

/** Signed swing offset in `[-amplitudePx, amplitudePx]`. */
export function calculateMinerSwingOffsetPx(
  animationTimeMs: number,
  amplitudePx: number,
): number {
  assertAnimationTime(animationTimeMs);
  assertSpan(amplitudePx, 'Miner swing amplitude');

  return Math.sin((animationTimeMs / MINER_SWING_PERIOD_MS) * TAU) * amplitudePx;
}

/** Conveyor travel offset in `[0, spanPx)`, restarting every cycle. */
export function calculateConveyorOffsetPx(
  animationTimeMs: number,
  spanPx: number,
): number {
  assertAnimationTime(animationTimeMs);
  assertSpan(spanPx, 'Conveyor span');

  return ((animationTimeMs % CONVEYOR_CYCLE_MS) / CONVEYOR_CYCLE_MS) * spanPx;
}

/**
 * Position of a stage's cycle marker along its track.
 *
 * Deliberately a function of authoritative progress and nothing else: the
 * marker reaches the end of its track exactly when the core completes the
 * cycle, and the cosmetic clock cannot move it.
 */
export function calculateCycleMarkerOffsetPx(
  progress: number,
  spanPx: number,
): number {
  if (!Number.isFinite(progress) || progress < 0 || progress >= 1) {
    throw new Error('Cycle marker progress must be in [0, 1).');
  }

  assertSpan(spanPx, 'Cycle marker span');

  return progress * spanPx;
}

function assertAnimationTime(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Animation time must be a finite non-negative number.');
  }
}

function assertNormalizedProgress(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`${name} must be in [0, 1).`);
  }
}

function assertSpan(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}
