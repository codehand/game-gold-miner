import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  createInitialGameState,
  GameNumber,
  MAX_CATCH_UP_MS,
  SIMULATION_STEP_MS,
} from '../../src/core';
// Imported from the runtime barrel rather than `src/game`, whose barrel loads
// Phaser: the driver is deliberately renderer-free so Node can advance it.
import { MineSimulationDriver } from '../../src/game/runtime';
import { advanceAnimationTimeMs } from '../../src/game/view-model';

const START_TIMESTAMP_MS = 1_700_000_000_000;

/** A controllable stand-in for `Date.now`, so no test reads the wall clock. */
function createClock(startMs: number) {
  let nowMs = startMs;

  return {
    now: () => nowMs,
    advance(byMs: number): void {
      nowMs += byMs;
    },
    set(toMs: number): void {
      nowMs = toMs;
    },
  };
}

function createDriver(clock: { now: () => number }) {
  return new MineSimulationDriver({
    state: createInitialGameState(BASE_GAME_BALANCE, START_TIMESTAMP_MS),
    balance: BASE_GAME_BALANCE,
    now: clock.now,
  });
}

/**
 * Drives the same pull the scene performs each frame: step the clock by one
 * frame, then ask the driver for the newest snapshot.
 */
function runFrames(
  driver: MineSimulationDriver,
  clock: ReturnType<typeof createClock>,
  frameMs: number,
  frameCount: number,
): void {
  for (let frame = 0; frame < frameCount; frame += 1) {
    clock.advance(frameMs);
    driver.advance();
  }
}

describe('mine simulation driver', () => {
  it('advances authoritative state from the injected clock', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);

    runFrames(driver, clock, 20, 300);

    expect(driver.state.lastUpdateTimestampMs).toBe(START_TIMESTAMP_MS + 6_000);
    expect(driver.state.gold.greaterThan(GameNumber.from(100))).toBe(true);
    expect(driver.state.floors[0].totalExtracted.greaterThan(0)).toBe(true);
  });

  it('credits nothing while the clock is frozen, and reuses one snapshot', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);
    const before = driver.snapshot;

    driver.advance();
    driver.advance();

    expect(driver.snapshot).toBe(before);
    expect(driver.state.lastUpdateTimestampMs).toBe(START_TIMESTAMP_MS);
    expect(driver.state.gold.serialize()).toBe(
      GameNumber.from(BASE_GAME_BALANCE.startingGold).serialize(),
    );
  });

  it('credits nothing when the host clock moves backwards', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);

    runFrames(driver, clock, 100, 20);

    const settled = driver.state;

    clock.set(START_TIMESTAMP_MS - 60_000);
    driver.advance();

    expect(driver.state).toBe(settled);
  });

  /**
   * The reported bug: a hidden tab or a locked phone stops the render loop, so
   * the whole absence arrives as one frame delta. Production was bounded to the
   * first second of it while the authoritative timestamp consumed the rest, and
   * because no reload happened, offline income never saw the interval either —
   * the time was simply gone.
   */
  it('credits a render-loop gap instead of discarding it', () => {
    const smoothClock = createClock(START_TIMESTAMP_MS);
    const hiddenClock = createClock(START_TIMESTAMP_MS);
    const smooth = createDriver(smoothClock);
    const hidden = createDriver(hiddenClock);

    runFrames(smooth, smoothClock, 100, 600);
    // One resumed frame carrying the same sixty seconds.
    runFrames(hidden, hiddenClock, 60_000, 1);

    expect(hidden.state.gold.serialize()).toBe(smooth.state.gold.serialize());
    expect(hidden.state.lastUpdateTimestampMs).toBe(
      smooth.state.lastUpdateTimestampMs,
    );
    expect(hidden.state.simulationTick).toBe(smooth.state.simulationTick);
    // The gap must actually have produced something, or the equality above
    // would hold for two drivers that both did nothing.
    expect(
      hidden.state.gold.greaterThan(
        GameNumber.from(BASE_GAME_BALANCE.startingGold),
      ),
    ).toBe(true);
  });

  it('bounds catch-up so a very long gap cannot freeze the frame', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);
    const gapMs = MAX_CATCH_UP_MS + 90_000;

    clock.advance(gapMs);
    driver.advance();

    expect(driver.state.simulationTick).toBe(
      MAX_CATCH_UP_MS / SIMULATION_STEP_MS,
    );
    // Uncredited time is still consumed, so the next load cannot pay it out a
    // second time through offline income.
    expect(driver.state.lastUpdateTimestampMs).toBe(START_TIMESTAMP_MS + gapMs);
  });

  /**
   * A sixty-frame second completes only ten fixed ticks, so most frames change
   * no displayed value. Re-deriving on those frames would rebuild an identical
   * view model and hand the scene a new object, defeating the identity check it
   * uses to skip rebinding.
   */
  it('reuses one snapshot between fixed ticks and derives a new one on a tick', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);
    const derived = new Set([driver.snapshot]);
    const frameMs = 16;
    const frameCount = 60;

    for (let frame = 0; frame < frameCount; frame += 1) {
      clock.advance(frameMs);
      derived.add(driver.advance());
    }

    const elapsedMs = frameMs * frameCount;
    const completedTicks = Math.floor(elapsedMs / SIMULATION_STEP_MS);

    // One snapshot per completed tick, plus the one derived at construction.
    expect(derived.size).toBe(completedTicks + 1);
    expect(driver.state.simulationTick).toBe(completedTicks);
    // Sub-tick time is still consumed, so nothing is silently dropped.
    expect(driver.state.lastUpdateTimestampMs).toBe(
      START_TIMESTAMP_MS + elapsedMs,
    );
  });

  it('derives a fresh snapshot the frame a tick completes', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);

    clock.advance(SIMULATION_STEP_MS - 1);

    const beforeTick = driver.advance();

    expect(beforeTick).toBe(driver.snapshot);

    clock.advance(1);

    expect(driver.advance()).not.toBe(beforeTick);
  });

  it('always derives a snapshot for state replaced by a command', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);
    const [firstFloor, ...restFloors] = driver.state.floors;

    // An upgrade changes a displayed value without completing a tick, so the
    // tick-based reuse above must not reach this path.
    driver.replaceState({
      ...driver.state,
      floors: [
        { ...firstFloor, mineShaftLevel: firstFloor.mineShaftLevel + 9 },
        ...restFloors,
      ],
    });

    expect(driver.snapshot.floors[0].levelLabel).toBe(
      `Lv ${firstFloor.mineShaftLevel + 9}`,
    );
  });

  it('produces the same result at any frame rate, for equal wall-clock time', () => {
    const slowClock = createClock(START_TIMESTAMP_MS);
    const fastClock = createClock(START_TIMESTAMP_MS);
    const slow = createDriver(slowClock);
    const fast = createDriver(fastClock);

    runFrames(slow, slowClock, 200, 30);
    runFrames(fast, fastClock, 20, 300);

    expect(slow.state.lastUpdateTimestampMs).toBe(fast.state.lastUpdateTimestampMs);
    expect(slow.state.gold.serialize()).toBe(fast.state.gold.serialize());
    expect(slow.state.floors[0].materialQueue.serialize()).toBe(
      fast.state.floors[0].materialQueue.serialize(),
    );
    expect(slow.state.warehouse.inputQueue.serialize()).toBe(
      fast.state.warehouse.inputQueue.serialize(),
    );
  });

  it('cannot be influenced by the cosmetic animation speed', () => {
    const results = [0, 1, 25].map((speedMultiplier) => {
      const clock = createClock(START_TIMESTAMP_MS);
      const driver = createDriver(clock);
      let animationTimeMs = 0;

      for (let frame = 0; frame < 300; frame += 1) {
        clock.advance(20);
        driver.advance();
        // Exactly what the scene does each frame, alongside the same pull.
        animationTimeMs = advanceAnimationTimeMs(animationTimeMs, 20, speedMultiplier);
      }

      return { animationTimeMs, gold: driver.state.gold.serialize() };
    });
    const [frozen, normal, fast] = results;

    expect(normal.gold).toBe(frozen.gold);
    expect(fast.gold).toBe(frozen.gold);
    // The multiplier must genuinely do something, or the equality above would
    // hold for a knob that is wired to nothing.
    expect(frozen.animationTimeMs).toBe(0);
    expect(fast.animationTimeMs).toBeCloseTo(normal.animationTimeMs * 25, 6);
  });

  it('continues from state replaced by a command', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);
    const claimed = {
      ...driver.state,
      gold: driver.state.gold.add(GameNumber.from(5_000)),
    };

    driver.replaceState(claimed);

    expect(driver.state).toBe(claimed);
    expect(driver.snapshot.floors).toHaveLength(claimed.floors.length);

    runFrames(driver, clock, 100, 10);

    expect(
      driver.state.gold.greaterThanOrEqualTo(GameNumber.from(5_100)),
    ).toBe(true);
  });

  it('derives its snapshot from the state it holds', () => {
    const clock = createClock(START_TIMESTAMP_MS);
    const driver = createDriver(clock);

    runFrames(driver, clock, 100, 60);

    const { snapshot, state } = driver;

    expect(snapshot.floors.map(({ floorNumber }) => floorNumber)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(snapshot.floors[0].extractionProgress).toBe(
      state.floors[0].extractionProgress,
    );
    expect(snapshot.elevator.progress).toBe(state.elevator.transitProgress);
    expect(snapshot.warehouse.progress).toBe(state.warehouse.conversionProgress);
  });
});
