import { expect, test, type Locator, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState, GameNumber, type GameState } from '../../src/core';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_BACKGROUND,
  MINE_BACKGROUND,
  MIN_TOUCH_TARGET_PX,
} from '../../src/game/layout';
// The scene's and the scroll model's own diagnostic types, imported rather
// than restated, so a renamed field fails type-check instead of silently
// reading `undefined`.
import type { PublishedPurchaseControl } from '../../src/game/scenes/BootScene';
import {
  MINE_SCROLL_DRAG_THRESHOLD_PX,
  type MineScrollReadBack,
} from '../../src/game/view-model';
import { createSaveDocument } from '../../src/persistence';

const CANVAS_SELECTOR = '#game-viewport canvas';

/**
 * `Date.now` is pinned while the timers keep running, so the scene renders and
 * processes input normally but the simulation credits no elapsed time. No gold
 * is produced, so any change these tests observe came from a press.
 */
const FIXED_TIME = new Date('2026-08-28T10:00:00.000Z');
const FIXTURE_TIMESTAMP_MS = FIXED_TIME.getTime();

/** A phone viewport, which is what one-thumb input is being checked against. */
const PHONE_VIEWPORT = { width: 390, height: 844 };

const FLOOR_1_KEY = 'mine-shaft:floor-1';
const FLOOR_4_KEY = 'mine-shaft:floor-4';
const ELEVATOR_KEY = 'elevator';

/**
 * Logical probe points. `FIT` scales the canvas through CSS while its backing
 * store stays 360x640, so these hold at any host viewport.
 *
 * `MINE_FLOOR_BOTTOM_PROBE` is the one that proves the content actually moved
 * on screen rather than only in a diagnostic. Four floors of content are 514
 * logical pixels tall inside a 404-pixel region. At rest this point is inside
 * a floor panel; scrolled to the bottom it reaches the padding below the fifth
 * slot, where only the mine's own background shows.
 */
const HUD_PROBE: readonly [number, number] = [180, 30];
const MINE_FLOOR_BOTTOM_PROBE: readonly [number, number] = [220, 578];
/**
 * Empty HUD background, painted on the very first frame. The canvas reads back
 * as opaque black until a frame has actually been presented, and the scene
 * publishes its diagnostics inside `create` before that happens, so the probes
 * below wait on this one first.
 */
const RENDERED_FRAME_PROBE: readonly [number, number] = [180, 8];

interface CoreStateReadBack {
  readonly gold: string;
  readonly mineShaftLevels: readonly number[];
}

/**
 * The original four floors open and gold to spare; floor 5 stays locked.
 *
 * Every floor then offers a shaft upgrade a press could complete, which is what
 * makes "nothing was bought" a real assertion rather than a purchase that was
 * refused anyway. The preceding shafts sit at the levels the save schema
 * requires before the next floor may be open.
 */
function createFixtureState(): GameState {
  const base = createInitialGameState(BASE_GAME_BALANCE, FIXTURE_TIMESTAMP_MS);

  return {
    ...base,
    gold: GameNumber.from(1_000_000),
    floors: base.floors.map((floor, index) => {
      const nextRequirement =
        BASE_GAME_BALANCE.floors[index + 1]?.unlockRequirement ?? null;

      return {
        ...floor,
        isUnlocked: index < 4,
        mineShaftLevel:
          index < 4 ? nextRequirement?.level ?? floor.mineShaftLevel : 1,
      };
    }),
  };
}

test('scrolls the mine with a drag while the fixed layers stay put', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);

  await bootScrollFixture(page);

  const atRest = await readMineScroll(page);

  expect(atRest.scrollY, 'the mine starts at the top').toBe(0);
  expect(atRest.maxScrollY, 'the content must overflow its region').toBeGreaterThan(
    0,
  );
  expect(atRest.contentHeight).toBeGreaterThan(atRest.viewportHeight);

  const floorBefore = await readPurchaseControl(page, FLOOR_1_KEY);
  const elevatorBefore = await readPurchaseControl(page, ELEVATOR_KEY);

  await waitForRenderedFrame(page);

  const [hudAtRest, mineBottomAtRest] = await readLogicalPixels(page, [
    HUD_PROBE,
    MINE_FLOOR_BOTTOM_PROBE,
  ]);

  expect(mineBottomAtRest, 'mine floor art fills the bottom at rest').not.toBe(
    MINE_BACKGROUND,
  );

  // Dragging up past the end of the content, so the scroll clamps rather than
  // stopping wherever the gesture happened to finish.
  await dragMine(page, { x: 6, y: 570 }, -(atRest.maxScrollY + 60));

  await expect
    .poll(async () => (await readMineScroll(page)).scrollY, {
      message: 'a drag up must scroll to the bottom and clamp there',
    })
    .toBe(atRest.maxScrollY);

  const [hudScrolled, mineBottomScrolled] = await readLogicalPixels(page, [
    HUD_PROBE,
    MINE_FLOOR_BOTTOM_PROBE,
  ]);

  expect(hudScrolled, 'the HUD must not move or be overdrawn').toBe(hudAtRest);
  expect(hudScrolled).toBe(HUD_BACKGROUND);
  expect(
    mineBottomScrolled,
    'the mine framebuffer must move with the scroll',
  ).not.toBe(mineBottomAtRest);

  const floorScrolled = await readPurchaseControl(page, FLOOR_1_KEY);
  const elevatorScrolled = await readPurchaseControl(page, ELEVATOR_KEY);

  expect(
    floorScrolled.screenBounds.y,
    'a floor control moves with the content it is drawn on',
  ).toBe(floorBefore.screenBounds.y - atRest.maxScrollY);
  expect(
    elevatorScrolled.screenBounds,
    'the shared stages are fixed and must not move',
  ).toEqual(elevatorBefore.screenBounds);

  // Dragging back down returns the mine to the top and clamps there too.
  await dragMine(page, { x: 6, y: 300 }, atRest.maxScrollY + 60);

  await expect
    .poll(async () => (await readMineScroll(page)).scrollY, {
      message: 'a drag down must return to the top and clamp there',
    })
    .toBe(0);
  expect(errors).toEqual([]);
});

test('does not buy the button a scroll gesture started on', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const before = await bootScrollFixture(page);
  const control = await readPurchaseControl(page, FLOOR_1_KEY);

  // The press would otherwise succeed, so a purchase here would be the
  // accidental one this step exists to prevent.
  expect(control.isEnabledAppearance, 'the control must be affordable').toBe(true);

  await dragMine(page, controlCenter(control), -80);

  await expect
    .poll(async () => (await readMineScroll(page)).scrollY, {
      message: 'a drag that starts on a button must still scroll the mine',
    })
    .toBeGreaterThan(0);

  const after = await readCoreState(page);

  expect(after.gold, 'a scroll must not spend gold').toBe(before.gold);
  expect(after.mineShaftLevels, 'a scroll must not raise a level').toEqual(
    before.mineShaftLevels,
  );
  expect(
    (await readPurchaseControl(page, FLOOR_1_KEY)).feedbackLabel,
    'the control must not report a press at all',
  ).toBeNull();
  expect(errors).toEqual([]);
});

test('does not buy a button a swipe merely ended on', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const before = await bootScrollFixture(page);
  const control = await readPurchaseControl(page, FLOOR_1_KEY);
  const target = controlCenter(control);

  // Down on the fixed surface strip, up on a floor's upgrade button. Phaser
  // reports a press on whatever the pointer is over when it lifts, so without
  // the gesture model this swipe would buy a level the player never aimed at.
  await dragMine(page, { x: target.x, y: 150 }, target.y - 150);

  const after = await readCoreState(page);

  expect(after.gold, 'a swipe must not spend gold').toBe(before.gold);
  expect(after.mineShaftLevels, 'a swipe must not raise a level').toEqual(
    before.mineShaftLevels,
  );
  expect(
    (await readMineScroll(page)).scrollY,
    'a swipe that began off the mine must not scroll it either',
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('does not open a surface popup after a drag gesture', async ({ page }) => {
  const errors = collectBrowserErrors(page);

  await bootScrollFixture(page);
  const elevator = await readPurchaseControl(page, ELEVATOR_KEY);

  // Both ends remain inside the 44x50 Level hit area. The movement exceeds
  // the tap threshold, so pointerup must not be interpreted as a selection.
  await dragMine(
    page,
    controlCenter(elevator),
    MINE_SCROLL_DRAG_THRESHOLD_PX + 4,
  );

  await expect(page.getByTestId('mine-upgrade-modal')).toBeHidden();
  expect((await readMineScroll(page)).scrollY).toBe(0);
  expect(errors).toEqual([]);
});

test('buys from a control before scrolling, and from one only scrolling reveals', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  const before = await bootScrollFixture(page);

  await pressPurchaseControl(page, FLOOR_1_KEY);
  await expect(page.getByTestId('mine-upgrade-modal')).toBeVisible();
  await page.getByTestId('mine-upgrade-x1').click();
  await page.getByTestId('mine-upgrade-close').click();

  await expect
    .poll(async () => (await readCoreState(page)).mineShaftLevels[0], {
      message: 'a tap before scrolling must buy one level',
    })
    .toBe(before.mineShaftLevels[0] + 1);

  const scroll = await readMineScroll(page);
  const hidden = await readPurchaseControl(page, FLOOR_4_KEY);

  expect(
    hidden.isPressable,
    'the deepest floor starts below the mine viewport',
  ).toBe(false);

  await dragMine(page, { x: 6, y: 570 }, -(scroll.maxScrollY + 60));

  await expect
    .poll(async () => (await readPurchaseControl(page, FLOOR_4_KEY)).isPressable, {
      message: 'scrolling to the bottom must bring the deepest floor into reach',
    })
    .toBe(true);

  // The diagnostic can publish on the same tick that the camera reaches its
  // clamp; wait for one presented frame before asking Phaser to hit-test the
  // newly revealed control.
  await waitForFrames(page, 1);

  await pressPurchaseControl(page, FLOOR_4_KEY);
  await expect(page.getByTestId('mine-upgrade-modal')).toBeVisible();
  await page.getByTestId('mine-upgrade-x1').click();
  await page.getByTestId('mine-upgrade-close').click();

  await expect
    .poll(async () => (await readCoreState(page)).mineShaftLevels[3], {
      message: 'a tap after scrolling must buy the control it was aimed at',
    })
    .toBe(before.mineShaftLevels[3] + 1);

  const after = await readCoreState(page);

  expect(
    after.mineShaftLevels.slice(1, 3),
    'no floor in between may be charged',
  ).toEqual(before.mineShaftLevels.slice(1, 3));
  expect(errors).toEqual([]);
});

test('keeps a tap that wobbles below the drag threshold', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const before = await bootScrollFixture(page);
  const control = await readPurchaseControl(page, FLOOR_1_KEY);

  // A thumb never lands perfectly still, so a press that moves by less than the
  // threshold must remain a press — and must not shift the screen under it.
  await dragMine(
    page,
    controlCenter(control),
    -(MINE_SCROLL_DRAG_THRESHOLD_PX - 1),
    2,
  );

  await expect(page.getByTestId('mine-upgrade-modal')).toBeVisible();
  await page.getByTestId('mine-upgrade-x1').click();

  await expect
    .poll(async () => (await readCoreState(page)).mineShaftLevels[0], {
      message: 'a wobbling tap must still buy one level',
    })
    .toBe(before.mineShaftLevels[0] + 1);
  expect(
    (await readMineScroll(page)).scrollY,
    'a tap must not scroll the mine at all',
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('scrolls with the wheel over the mine but not over the fixed layers', async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);

  await bootScrollFixture(page);

  const scroll = await readMineScroll(page);

  await wheelOver(page, { x: 180, y: 30 }, scroll.maxScrollY + 60);

  // Nothing to poll for: the assertion is that the value never moves. A frame
  // is awaited so the wheel has been through the game loop before it is read.
  await waitForFrames(page, 2);
  expect(
    (await readMineScroll(page)).scrollY,
    'a wheel over the HUD must not scroll the mine',
  ).toBe(0);

  await wheelOver(page, { x: 180, y: 400 }, scroll.maxScrollY + 60);

  await expect
    .poll(async () => (await readMineScroll(page)).scrollY, {
      message: 'a wheel over the mine must scroll it and clamp at the bottom',
    })
    .toBe(scroll.maxScrollY);

  await wheelOver(page, { x: 180, y: 400 }, -(scroll.maxScrollY + 60));

  await expect
    .poll(async () => (await readMineScroll(page)).scrollY, {
      message: 'wheeling back must return to the top and clamp there',
    })
    .toBe(0);
  expect(errors).toEqual([]);
});

test('gives every control a thumb-sized target', async ({ page }) => {
  const errors = collectBrowserErrors(page);

  await bootScrollFixture(page);

  // The mine is scrolled by dragging the canvas, so the browser must not claim
  // that gesture for a page pan or a pinch-zoom first.
  expect(
    await page
      .locator(CANVAS_SELECTOR)
      .evaluate((canvas) => globalThis.getComputedStyle(canvas).touchAction),
    'the canvas must own its touch gestures',
  ).toBe('none');

  const controls = await readPurchaseControls(page);

  // Four open shafts, floor 5's unlock, and two shared stages.
  expect(controls.length).toBe(7);

  for (const control of controls) {
    expect(
      control.screenBounds.width,
      `${control.key} must be wide enough to press`,
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(
      control.screenBounds.height,
      `${control.key} must be tall enough to press`,
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }

  expect(errors).toEqual([]);
});

/**
 * Boots the real driver and scene at a phone viewport against a pinned wall
 * clock, exposing a read-only view of authoritative state.
 */
async function bootScrollFixture(page: Page): Promise<CoreStateReadBack> {
  await page.setViewportSize(PHONE_VIEWPORT);
  // Phaser disables preserveDrawingBuffer for performance, which makes the
  // WebGL canvas read back as transparent black. Forcing it on for this browser
  // context only lets the pixel probes sample real pixels; it changes whether
  // the buffer is retained, not what is drawn.
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function patchedGetContext(
      this: HTMLCanvasElement,
      contextType: string,
      attributes?: unknown,
    ) {
      if (contextType === 'webgl' || contextType === 'webgl2') {
        return originalGetContext.call(this, contextType, {
          ...(attributes as Record<string, unknown> | undefined),
          preserveDrawingBuffer: true,
        });
      }

      return originalGetContext.call(this, contextType, attributes);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.clock.install({ time: FIXED_TIME });
  await page.clock.setFixedTime(FIXED_TIME);
  await routeMainModule(
    page,
    `
      import '/src/style.css';

      import { createGame, MineSimulationDriver } from '/src/game/index.ts';
      import { deserializeSaveDocument } from '/src/persistence/index.ts';
      import { BASE_GAME_BALANCE } from '/src/config/index.ts';

      const loaded = deserializeSaveDocument(
        ${JSON.stringify(
          createSaveDocument(
            createFixtureState(),
            BASE_GAME_BALANCE,
            FIXTURE_TIMESTAMP_MS,
          ),
        )},
        BASE_GAME_BALANCE,
      );
      const driver = new MineSimulationDriver({
        state: loaded.state,
        balance: BASE_GAME_BALANCE,
        now: () => Date.now(),
      });

      const game = createGame(document.querySelector('#game-viewport'), driver);

      window.catMineIdleCore = () => ({
        gold: driver.state.gold.serialize(),
        mineShaftLevels: driver.state.floors.map((floor) => floor.mineShaftLevel),
      });
      window.catMineIdleFrame = () => game.loop.frame;
    `,
  );

  await page.goto('/');
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-boot-scene',
    'BootScene',
  );
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-purchase-controls',
    /"key":"elevator"/,
  );

  return readCoreState(page);
}

/**
 * Presses at a logical point, drags vertically by a logical distance, and
 * releases.
 *
 * The canvas is fitted and centred by CSS while its logical size stays
 * 360x640, so every coordinate is mapped through the canvas' own box rather
 * than assumed to be one-to-one with page pixels.
 */
async function dragMine(
  page: Page,
  from: { x: number; y: number },
  deltaY: number,
  steps = 8,
): Promise<void> {
  const box = await boundingBox(page.locator(CANVAS_SELECTOR));
  const start = toPagePoint(box, from);
  const end = toPagePoint(box, { x: from.x, y: from.y + deltaY });

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

/** Wheels by a logical delta with the pointer over a logical point. */
async function wheelOver(
  page: Page,
  over: { x: number; y: number },
  deltaY: number,
): Promise<void> {
  const box = await boundingBox(page.locator(CANVAS_SELECTOR));
  const point = toPagePoint(box, over);

  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, deltaY);
}

/** Presses one published control where it currently is on screen. */
async function pressPurchaseControl(page: Page, key: string): Promise<void> {
  const box = await boundingBox(page.locator(CANVAS_SELECTOR));
  const control = await readPurchaseControl(page, key);

  expect(control.isPressable, `${key} must be reachable before it is pressed`).toBe(
    true,
  );

  const center = toPagePoint(box, controlCenter(control));

  await page.mouse.click(center.x, center.y);
}

function controlCenter(control: PublishedPurchaseControl): {
  x: number;
  y: number;
} {
  return {
    x: control.screenBounds.x + control.screenBounds.width / 2,
    y: control.screenBounds.y + control.screenBounds.height / 2,
  };
}

function toPagePoint(
  box: { x: number; y: number; width: number; height: number },
  logical: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: box.x + logical.x * (box.width / GAME_WIDTH),
    y: box.y + logical.y * (box.height / GAME_HEIGHT),
  };
}

async function readMineScroll(page: Page): Promise<MineScrollReadBack> {
  return readDiagnostic<MineScrollReadBack>(page, 'data-mine-scroll');
}

async function readPurchaseControls(
  page: Page,
): Promise<PublishedPurchaseControl[]> {
  return readDiagnostic<PublishedPurchaseControl[]>(
    page,
    'data-purchase-controls',
  );
}

async function readPurchaseControl(
  page: Page,
  key: string,
): Promise<PublishedPurchaseControl> {
  const controls = await readPurchaseControls(page);
  const control = controls.find((candidate) => candidate.key === key);

  if (control === undefined) {
    throw new Error(
      `No purchase control "${key}" was published; found ${controls
        .map(({ key: published }) => published)
        .join(', ')}.`,
    );
  }

  return control;
}

async function readDiagnostic<T>(page: Page, attribute: string): Promise<T> {
  const serialized = await page
    .locator(CANVAS_SELECTOR)
    .getAttribute(attribute);

  if (serialized === null) {
    throw new Error(`Diagnostic "${attribute}" was not published.`);
  }

  return JSON.parse(serialized) as T;
}

async function readCoreState(page: Page): Promise<CoreStateReadBack> {
  return page.evaluate(() => {
    return (
      window as unknown as { catMineIdleCore(): CoreStateReadBack }
    ).catMineIdleCore();
  });
}

/** Waits for the render loop to advance, so queued input has been processed. */
async function waitForFrames(page: Page, frames: number): Promise<void> {
  const start = await page.evaluate(() => {
    return (window as unknown as { catMineIdleFrame(): number }).catMineIdleFrame();
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          return (
            window as unknown as { catMineIdleFrame(): number }
          ).catMineIdleFrame();
        }),
      { message: 'the render loop must actually run' },
    )
    .toBeGreaterThan(start + frames);
}

/**
 * Waits until a frame has actually been presented.
 *
 * The canvas reads back as opaque black before that, and the scene publishes
 * its diagnostics inside `create`, so an attribute is no proof there are
 * pixels to sample.
 */
async function waitForRenderedFrame(page: Page): Promise<void> {
  await expect
    .poll(async () => (await readLogicalPixels(page, [RENDERED_FRAME_PROBE]))[0], {
      message: 'the first frame must reach the framebuffer',
    })
    .toBe(HUD_BACKGROUND);
}

/**
 * Samples the canvas backing store at logical coordinates and returns each
 * colour as a lowercase `#rrggbb` string, matching the shared palette.
 */
async function readLogicalPixels(
  page: Page,
  points: readonly (readonly [number, number])[],
): Promise<string[]> {
  return page.evaluate((probes) => {
    const source = document.querySelector<HTMLCanvasElement>(
      '#game-viewport canvas',
    );

    if (source === null) {
      throw new Error('Game canvas was not found.');
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = source.width;
    offscreen.height = source.height;

    const context = offscreen.getContext('2d');

    if (context === null) {
      throw new Error('A 2D context was not available for pixel sampling.');
    }

    context.drawImage(source, 0, 0);

    return probes.map(([x, y]) => {
      const [red, green, blue] = context.getImageData(x, y, 1, 1).data;

      return `#${[red, green, blue]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`;
    });
  }, points);
}

async function boundingBox(locator: Locator) {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('The game canvas has no bounding box.');
  }

  return box;
}

/** Replaces the application entry once, then lets later imports through. */
async function routeMainModule(page: Page, body: string): Promise<void> {
  let pending = true;

  await page.route('**/src/main.ts*', async (route) => {
    if (!pending) {
      await route.continue();
      return;
    }

    pending = false;
    await route.fulfill({ body, contentType: 'application/javascript' });
  });
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  return errors;
}
