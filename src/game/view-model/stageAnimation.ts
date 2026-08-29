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

/** A hitch or a backgrounded tab must not teleport a cosmetic animation. */
export const MAX_ANIMATION_FRAME_MS = 250;

/** One full swing of a placeholder miner's pick. */
export const MINER_SWING_PERIOD_MS = 800;

/** One full travel of a shared stage's conveyor dash. */
export const CONVEYOR_CYCLE_MS = 900;

/**
 * Cosmetic time wraps here to stay in comfortable floating-point range. The
 * value is a whole multiple of both cycle lengths, so the wrap is seamless.
 */
export const ANIMATION_TIME_WRAP_MS = 7_200_000;

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

function assertSpan(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}
