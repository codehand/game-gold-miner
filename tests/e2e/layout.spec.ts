import { expect, test, type Page } from '@playwright/test';

import {
  HUD_BACKGROUND,
  MINE_BACKGROUND,
  MINE_SHAFT_INSET_X,
} from '../../src/game/layout';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Viewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

const VIEWPORTS: readonly Viewport[] = [
  { name: 'narrow phone', width: 320, height: 568 },
  { name: 'tall phone', width: 390, height: 844 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

// Sub-pixel canvas placement is expected once the logical viewport is scaled.
const TOLERANCE = 1;

const CANVAS_SELECTOR = '#game-viewport canvas';

/**
 * Logical probe points. `FIT` scales the canvas through CSS while its backing
 * store stays 360x640, so the same logical coordinates hold at every host
 * viewport.
 *
 * `MINE_GUTTER_PROBE` sits in the left content inset, where only the mine
 * camera's own background shows. A floor panel would hide a duplicated fixed
 * layer drawn beneath it, so probing a panel alone cannot prove the mine
 * camera ignores the HUD and surface.
 *
 * `SURFACE_PROBE` sits in the strip above the elevator and warehouse panels,
 * which is the only part of the surface region its own background still owns.
 */
const HUD_PROBE: readonly [number, number] = [180, 30];
// Between the elevator badge and the right-flush warehouse. The earlier point
// at x=300 is now intentionally occupied by the warehouse Level control.
const SURFACE_PROBE: readonly [number, number] = [190, 85];
const MINE_GUTTER_PROBE: readonly [number, number] = [MINE_SHAFT_INSET_X / 2, 254];
const MINE_PANEL_PROBE: readonly [number, number] = [180, 254];

test.beforeEach(async ({ page }) => {
  // Phaser disables preserveDrawingBuffer for performance, which makes the
  // WebGL canvas read back as transparent black. Forcing it on for the test
  // browser context only lets the assertions below sample real pixels; it
  // changes whether the buffer is retained, not what is drawn.
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
});

for (const viewport of VIEWPORTS) {
  test(`fits the portrait layout inside a ${viewport.name} viewport`, async ({
    page,
  }) => {
    const browserErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') {
        browserErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      browserErrors.push(error.message);
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveAttribute('data-boot-scene', 'BootScene');
    await expect(canvas).toHaveAttribute('data-layout-viewport', '360,640');

    const canvasBox = await requireBoundingBox(canvas);

    // The canvas is scaled to fit, never cropped by the host viewport.
    expect(canvasBox.x).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(canvasBox.y).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(
      viewport.width + TOLERANCE,
    );
    expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(
      viewport.height + TOLERANCE,
    );
    expect(canvasBox.width).toBeGreaterThan(0);
    expect(canvasBox.height).toBeGreaterThan(0);

    // Aspect ratio is preserved, so no required control is squashed away.
    expect(canvasBox.width / canvasBox.height).toBeCloseTo(360 / 640, 2);

    // The canvas stays inside the safe-area box the host reserves for it.
    const safeBox = await requireBoundingBox(page.getByTestId('game-viewport'));
    expect(canvasBox.x).toBeGreaterThanOrEqual(safeBox.x - TOLERANCE);
    expect(canvasBox.y).toBeGreaterThanOrEqual(safeBox.y - TOLERANCE);
    expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(
      safeBox.x + safeBox.width + TOLERANCE,
    );
    expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(
      safeBox.y + safeBox.height + TOLERANCE,
    );

    const logicalHud = await readLogicalRegion(page, 'layoutHud');
    const logicalSurface = await readLogicalRegion(page, 'layoutSurface');
    const logicalMine = await readLogicalRegion(page, 'layoutMine');

    const hud = toScreen(logicalHud, canvasBox);
    const surface = toScreen(logicalSurface, canvasBox);
    const mine = toScreen(logicalMine, canvasBox);

    for (const [name, region] of [
      ['HUD', hud],
      ['surface', surface],
      ['mine', mine],
    ] as const) {
      expect(region.height, `${name} must be visible`).toBeGreaterThan(0);
      expect(region.x, `${name} left edge`).toBeGreaterThanOrEqual(-TOLERANCE);
      expect(region.y, `${name} top edge`).toBeGreaterThanOrEqual(-TOLERANCE);
      expect(region.x + region.width, `${name} right edge`).toBeLessThanOrEqual(
        viewport.width + TOLERANCE,
      );
      expect(region.y + region.height, `${name} bottom edge`).toBeLessThanOrEqual(
        viewport.height + TOLERANCE,
      );
    }

    // The HUD is pinned to the top and the mine area runs to the bottom edge.
    expect(hud.y).toBeCloseTo(canvasBox.y, 0);
    expect(surface.y).toBeCloseTo(hud.y + hud.height, 0);
    expect(mine.y).toBeCloseTo(surface.y + surface.height, 0);
    expect(mine.y + mine.height).toBeCloseTo(
      canvasBox.y + canvasBox.height,
      0,
    );

    // No bottom navigation is reserved or rendered for deferred features.
    await expect(canvas).toHaveAttribute('data-layout-bottom-navigation', 'none');
    await expect(page.locator('nav')).toHaveCount(0);

    // The mine content overflows its own region, so the area must scroll.
    const contentHeight = Number(
      await canvas.getAttribute('data-layout-mine-content-height'),
    );
    expect(contentHeight).toBeGreaterThan(logicalMine.height);

    // Real pixels prove the two cameras are cross-ignoring correctly: the
    // scrolling mine content is clipped instead of overdrawing the fixed
    // layers, and the fixed layers are not repeated inside the mine. The
    // dataset diagnostics above cannot show either, because they only report
    // the geometry the scene intended.
    const [hudPixel, surfacePixel, mineGutterPixel, minePanelPixel] =
      await readLogicalPixels(page, [
        HUD_PROBE,
        SURFACE_PROBE,
        MINE_GUTTER_PROBE,
        MINE_PANEL_PROBE,
      ]);
    expect(hudPixel, 'HUD background must not be overdrawn').toBe(HUD_BACKGROUND);
    const surfaceChannels = surfacePixel
      .slice(1)
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16));

    expect(surfaceChannels, 'surface landscape pixel must be RGB').toHaveLength(3);
    expect(
      surfaceChannels?.[2],
      'surface landscape sky must not be overdrawn',
    ).toBeGreaterThan(surfaceChannels?.[0] ?? Number.POSITIVE_INFINITY);
    expect(
      surfaceChannels?.[2],
      'surface landscape remains blue behind the stages',
    ).toBeGreaterThan(surfaceChannels?.[1] ?? Number.POSITIVE_INFINITY);
    expect(mineGutterPixel, 'fixed layers must not repeat inside the mine').toBe(
      MINE_BACKGROUND,
    );
    expect(minePanelPixel, 'floor slots must actually render').not.toBe(
      MINE_BACKGROUND,
    );

    expect(browserErrors).toEqual([]);
  });
}

async function requireBoundingBox(
  locator: ReturnType<Page['locator']>,
): Promise<Rect> {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('Expected the element to have a bounding box.');
  }

  return box;
}

/** Reads one published layout region in unscaled logical pixels. */
async function readLogicalRegion(page: Page, datasetKey: string): Promise<Rect> {
  const serialized = await page
    .locator(CANVAS_SELECTOR)
    .getAttribute(toDataAttribute(datasetKey));

  if (serialized === null) {
    throw new Error(`Layout diagnostic "${datasetKey}" was not published.`);
  }

  const [x, y, width, height] = serialized.split(',').map(Number);

  return { x, y, width, height };
}

/** Projects a logical region onto the scaled, centred canvas on screen. */
function toScreen(region: Rect, canvasBox: Rect): Rect {
  const scaleX = canvasBox.width / 360;
  const scaleY = canvasBox.height / 640;

  return {
    x: canvasBox.x + region.x * scaleX,
    y: canvasBox.y + region.y * scaleY,
    width: region.width * scaleX,
    height: region.height * scaleY,
  };
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

function toDataAttribute(datasetKey: string): string {
  return `data-${datasetKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}
