import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { BASE_GAME_BALANCE } from '../../src/config';
import { catchUpSimulation, createInitialGameState } from '../../src/core';
import {
  PLACEHOLDER_ANIMATION_ASSETS,
  PLACEHOLDER_ASSETS,
} from '../../src/game/assets/placeholderAssets';
import { HUD_BACKGROUND, MINE_BACKGROUND } from '../../src/game/layout';
import {
  CORRUPT_SAVE_WARNING_MESSAGE,
  INCOMPATIBLE_SAVE_WARNING_MESSAGE,
  LOAD_FAILURE_MESSAGE,
  SAVE_FAILURE_MESSAGE,
  createSaveDocument,
  deserializeSaveDocument,
  type SaveDocumentV2,
} from '../../src/persistence';

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

const CANVAS_SELECTOR = '#game-viewport canvas';

const VIEWPORTS: readonly Viewport[] = [
  { name: 'narrow phone', width: 320, height: 568 },
  { name: 'tall phone', width: 390, height: 844 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

/** Sub-pixel canvas placement is expected once the logical viewport is scaled. */
const TOLERANCE = 1;

const HUD_PROBE: readonly [number, number] = [180, 30];
const MINE_PANEL_PROBE: readonly [number, number] = [180, 254];

const START_TIMESTAMP_MS = new Date('2026-09-03T04:00:00.000Z').getTime();
const FOREGROUND_MS = 40_000;
const AFTER_RELOAD_MS = 20_000;

/**
 * Every runtime texture the loader asks for by absolute path. A non-root base
 * path, a missing `public/` file, or a preview server that does not serve the
 * static tree all show up here as a request that never returned 200.
 */
const RUNTIME_ASSET_PATHS: readonly string[] = [
  ...PLACEHOLDER_ASSETS.map(([, path]) => path),
  ...PLACEHOLDER_ANIMATION_ASSETS.map(([, path]) => path),
];

test('serves the optimized bundle and every runtime asset from the root base path', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  const responses: { path: string; status: number }[] = [];
  const failedRequests: string[] = [];

  page.on('response', (response) => {
    responses.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.url()} (${request.failure()?.errorText ?? 'unknown'})`,
    );
  });

  await forceCanvasReadback(page);
  await page.goto('/');
  await waitForBootedScene(page);

  // The bundle is served, not transpiled on demand: a dev server answers module
  // requests under `/src/`, and the built document references hashed assets.
  const documentReferences = await page.evaluate(() => [
    ...[...document.querySelectorAll('script[src]')].map((element) =>
      element.getAttribute('src'),
    ),
    ...[...document.querySelectorAll('link[rel="stylesheet"]')].map((element) =>
      element.getAttribute('href'),
    ),
  ]);

  expect(documentReferences.length).toBeGreaterThan(0);
  for (const reference of documentReferences) {
    expect(reference, 'bundled entries resolve from the root base path').toMatch(
      /^\/assets\//,
    );
  }

  expect(
    responses.filter((response) => response.path.startsWith('/src/')),
    'the production bundle serves no unbundled source modules',
  ).toEqual([]);

  // Diagnostics that exist only for the dev-server browser tests, and the
  // opt-in profiler read-back, must both be absent from a shipped build.
  const canvas = page.locator(CANVAS_SELECTOR);
  for (const attribute of [
    'data-floor-views',
    'data-surface-views',
    'data-hud-view',
    'data-purchase-controls',
    'data-animation',
    'data-mine-scroll',
    'data-performance-object-count',
  ]) {
    expect(
      await canvas.getAttribute(attribute),
      `${attribute} must not ship in the production bundle`,
    ).toBeNull();
  }

  await expect(page).toHaveTitle('Cat Mine Idle');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('width', '360');
  await expect(canvas).toHaveAttribute('height', '640');
  await expect(canvas).toHaveAttribute('data-boot-scene-starts', '1');
  await expect(canvas).toHaveAttribute('data-renderer', /^(canvas|webgl)$/);
  await expect(canvas).toHaveAttribute('data-layout-viewport', '360,640');
  await expect(canvas).toHaveAttribute(
    'data-layout-bottom-navigation',
    '0,582,360,58',
  );
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  await expect(page.getByTestId('save-diagnostic')).toHaveCount(0);

  const servedOk = new Set(
    responses
      .filter((response) => response.status >= 200 && response.status < 400)
      .map((response) => response.path),
  );

  for (const assetPath of RUNTIME_ASSET_PATHS) {
    expect(
      servedOk.has(assetPath),
      `${assetPath} must load from the served production bundle`,
    ).toBe(true);
  }

  // The self-hosted game font is bundled rather than fetched from a font CDN,
  // and both required weights must be usable before Phaser rasterizes text.
  expect(
    [...servedOk].some((path) => /^\/assets\/fredoka-.*\.woff2?$/.test(path)),
    'the self-hosted Fredoka weights are served from the bundle',
  ).toBe(true);
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;

      return {
        semibold: document.fonts.check('600 16px Fredoka'),
        bold: document.fonts.check('700 16px Fredoka'),
      };
    }),
  ).toEqual({ semibold: true, bold: true });

  // Server-milestone Step 17's cloud-save reconcile is deliberately a
  // background, best-effort request — "the game never blocks on cloud
  // sync" — fired once a guest session exists and never awaited before this
  // test's own assertions run. It is expected, not a bundle-loading defect,
  // for the browser to still cancel it mid-flight when this test's page
  // closes before it resolves; every other request this build makes must
  // still complete cleanly.
  expect(
    failedRequests.filter((request) => !request.includes('/functions/v1/save-sync/v1/save')),
    'no request fails against the production server',
  ).toEqual([]);
  expect(
    responses.filter((response) => response.status >= 400),
    'no response is an error against the production server',
  ).toEqual([]);

  // Diagnostics report intended geometry, so real pixels are what prove the
  // optimized bundle actually painted its regions and loaded textures.
  const [hudPixel, minePanelPixel] = await readLogicalPixels(page, [
    HUD_PROBE,
    MINE_PANEL_PROBE,
  ]);
  expect(hudPixel, 'the HUD renders in the production bundle').toBe(
    HUD_BACKGROUND,
  );
  expect(minePanelPixel, 'floor art renders in the production bundle').not.toBe(
    MINE_BACKGROUND,
  );

  expect(browserErrors, 'the production bundle boots without errors').toEqual([]);
});

test('saves and restores authoritative progress across a production reload', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);

  await installControlledClock(page);
  await setControlledTime(page, START_TIMESTAMP_MS);
  await page.goto('/');
  await waitForBootedScene(page);

  const initialState = createInitialGameState(
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS,
  );
  const playedState = catchUpSimulation(initialState, FOREGROUND_MS);
  const playedDocument = createSaveDocument(
    playedState,
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS + FOREGROUND_MS,
  );

  // A fixture that produced nothing would let a reset-to-fresh reload pass the
  // restore assertion below.
  expect(
    Number(playedDocument.state.gold),
    'the fixture must actually earn gold before saving',
  ).toBeGreaterThan(BASE_GAME_BALANCE.startingGold);

  await dispatchVisibility(page, 'hidden', START_TIMESTAMP_MS + FOREGROUND_MS);
  await expect
    .poll(() => readStoredSave(page), {
      message: 'the production bundle writes the exact authoritative document',
    })
    .toEqual(playedDocument);

  await page.reload();
  await waitForBootedScene(page);

  // Reloading at the same instant credits no offline time, so a restored
  // session re-settles the identical document while a reset one would not.
  await expect(page.getByTestId('offline-reward-modal')).toHaveCount(0);
  await expect
    .poll(() => readStoredSave(page), {
      message: 'the reloaded production bundle restores the saved document',
    })
    .toEqual(playedDocument);

  const restoredState = deserializeSaveDocument(
    playedDocument,
    BASE_GAME_BALANCE,
  ).state;
  const continuedDocument = createSaveDocument(
    catchUpSimulation(restoredState, AFTER_RELOAD_MS),
    BASE_GAME_BALANCE,
    START_TIMESTAMP_MS + FOREGROUND_MS + AFTER_RELOAD_MS,
  );

  await dispatchVisibility(
    page,
    'hidden',
    START_TIMESTAMP_MS + FOREGROUND_MS + AFTER_RELOAD_MS,
  );
  await expect
    .poll(() => readStoredSave(page), {
      message: 'production continues from the restored state, not a fresh one',
    })
    .toEqual(continuedDocument);

  expect(browserErrors, 'saving and restoring emit no browser errors').toEqual([]);
});

for (const recovery of [
  {
    name: 'corrupt',
    message: CORRUPT_SAVE_WARNING_MESSAGE,
    code: 'corrupt-save',
    document: { schemaVersion: 1, state: { gold: 'not-a-number' } },
  },
  {
    name: 'unsupported',
    message: INCOMPATIBLE_SAVE_WARNING_MESSAGE,
    code: 'incompatible-save',
    document: { schemaVersion: 99, savedAtTimestampMs: 0, state: {} },
  },
] as const) {
  test(`recovers from a ${recovery.name} save with a visible warning`, async ({
    page,
  }) => {
    await installControlledClock(page);
    await setControlledTime(page, START_TIMESTAMP_MS);
    await seedActiveSave(page, recovery.document);

    // Errors are collected only from the recovery load: the seeding navigation
    // deliberately blocks the bundle, which the browser reports as a failure.
    const browserErrors = collectBrowserErrors(page);

    await page.reload();
    await waitForBootedScene(page);

    const banner = page.getByTestId('save-diagnostic');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-code', recovery.code);
    await expect(page.getByTestId('save-diagnostic-message')).toHaveText(
      recovery.message,
    );

    // Recovery is automatic and unblocking: the fresh game is already playable
    // behind the notice, and the notice can be dismissed.
    await page.getByTestId('save-diagnostic-dismiss').click();
    await expect(banner).toHaveCount(0);

    const freshDocument = createSaveDocument(
      catchUpSimulation(
        createInitialGameState(BASE_GAME_BALANCE, START_TIMESTAMP_MS),
        FOREGROUND_MS,
      ),
      BASE_GAME_BALANCE,
      START_TIMESTAMP_MS + FOREGROUND_MS,
    );

    await dispatchVisibility(page, 'hidden', START_TIMESTAMP_MS + FOREGROUND_MS);
    await expect
      .poll(() => readStoredSave(page), {
        message: 'the rejected payload is replaced by a valid fresh save',
      })
      .toEqual(freshDocument);

    expect(
      browserErrors,
      'save recovery raises no uncaught browser error',
    ).toEqual([]);
  });
}

test('continues playing with a visible diagnostic when local storage fails', async ({
  page,
}) => {
  const pageErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await installControlledClock(page);
  await forceCanvasReadback(page);
  await setControlledTime(page, START_TIMESTAMP_MS);
  await page.addInitScript(() => {
    // Storage that refuses to open is the shape a private-mode or quota-blocked
    // browser presents. The session must continue rather than fail to boot.
    indexedDB.open = () => {
      throw new Error('IndexedDB is unavailable.');
    };
  });

  await page.goto('/');
  await waitForBootedScene(page);

  await expect(page.getByTestId('save-diagnostic')).toBeVisible();
  await expect(page.getByTestId('save-diagnostic-message')).toHaveText(
    LOAD_FAILURE_MESSAGE,
  );

  await dispatchVisibility(page, 'hidden', START_TIMESTAMP_MS + FOREGROUND_MS);
  await expect(page.getByTestId('save-diagnostic-message')).toHaveText(
    SAVE_FAILURE_MESSAGE,
  );

  // The same session that is showing the notice is still rendering behind it.
  const [hudPixel] = await readLogicalPixels(page, [HUD_PROBE]);
  expect(hudPixel, 'the game renders without working storage').toBe(
    HUD_BACKGROUND,
  );

  expect(pageErrors, 'a storage failure raises no uncaught error').toEqual([]);
});

test('continues playing when the lazily-loaded Supabase chunk fails to fetch', async ({
  page,
}) => {
  // Server-milestone Step 8: `createSupabaseClient` dynamically imports
  // `@supabase/supabase-js` rather than bundling it into the entry chunk
  // (`src/platform/web/supabaseClient.ts`), so it ships as its own chunk that
  // a real deploy can fail to fetch — a stale hash after a redeploy, or a
  // flaky network. The dev server this suite's sibling `tests/e2e/` runs
  // against never bundles at all, so nothing there can reproduce this; only
  // the real production build, exercised here, has a lazy chunk to fail.
  //
  // A 2026-09-09 review found that a rejection here reached `src/main.ts`'s
  // `void`-ed promise chain uncaught, because `ensureGuestSession`'s own
  // try/catch covers only the collaborator calls made *inside* it, not the
  // client-construction promise one level above — an unhandled rejection
  // that would have shown up here as a `pageerror`, breaking
  // `guestSession.ts`'s own documented "this never throws" contract.
  const pageErrors: string[] = [];
  let abortedChunkRequests = 0;

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  // This spec is only meaningful against a *configured* build. Vite inlines
  // `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` at build time, so a build
  // with neither set makes `createSupabaseClient`'s guard constantly true and
  // the bundler eliminates the dynamic `import()` altogether — correct
  // behaviour (an unconfigured build should ship no SDK at all), but it leaves
  // no lazy chunk to fail. Skipping loudly here is the honest outcome: a
  // 2026-09-09 review reproduced this spec passing in 4.3 s against such a
  // build with the `src/main.ts` guard deliberately removed, which is a false
  // green, not a pass. `tests/unit/server-stack.test.ts` carries the gate that
  // does run on every CI push.
  const chunkFileName = findLazySupabaseChunk();

  test.skip(
    chunkFileName === null,
    'this build inlined no Supabase configuration, so it emitted no lazy SDK chunk to fail',
  );

  await forceCanvasReadback(page);
  // Routed by the chunk's real, content-identified file name rather than a
  // `dist-*` glob: that name is one rolldown derives from the `dist/`
  // directory *inside* `@supabase/supabase-js`, so an SDK layout change or a
  // bundler naming change would silently stop a glob matching. Counted, too —
  // a route that matches nothing aborts nothing, which would leave every
  // assertion below trivially true.
  await page.route(`**/assets/${chunkFileName}`, (route) => {
    abortedChunkRequests += 1;
    return route.abort();
  });

  await page.goto('/');
  await waitForBootedScene(page);

  // The mine boots and plays with no working guest session, exactly as it
  // would with no Supabase project configured at all.
  const [hudPixel] = await readLogicalPixels(page, [HUD_PROBE]);
  expect(hudPixel, 'the game renders with no Supabase chunk available').toBe(
    HUD_BACKGROUND,
  );

  expect(
    pageErrors,
    'a failed lazy-chunk fetch must not surface as an unhandled rejection',
  ).toEqual([]);

  expect(
    abortedChunkRequests,
    'the lazy Supabase chunk must actually be requested, or this test proves nothing',
  ).toBeGreaterThan(0);
});

for (const viewport of VIEWPORTS) {
  test(`keeps the production layout inside a ${viewport.name} viewport`, async ({
    page,
  }) => {
    const browserErrors = collectBrowserErrors(page);

    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto('/');
    await waitForBootedScene(page);

    const canvas = page.locator(CANVAS_SELECTOR);
    const canvasBox = await requireBoundingBox(canvas);

    expect(canvasBox.x).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(canvasBox.y).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(
      viewport.width + TOLERANCE,
    );
    expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(
      viewport.height + TOLERANCE,
    );
    expect(canvasBox.width / canvasBox.height).toBeCloseTo(360 / 640, 2);

    for (const datasetKey of [
      'layoutHud',
      'layoutSurface',
      'layoutMine',
      'layoutBottomNavigation',
    ]) {
      const region = toScreen(
        await readLogicalRegion(page, datasetKey),
        canvasBox,
      );

      expect(region.height, `${datasetKey} must be visible`).toBeGreaterThan(0);
      expect(region.x).toBeGreaterThanOrEqual(-TOLERANCE);
      expect(region.y).toBeGreaterThanOrEqual(-TOLERANCE);
      expect(region.x + region.width).toBeLessThanOrEqual(
        viewport.width + TOLERANCE,
      );
      expect(region.y + region.height).toBeLessThanOrEqual(
        viewport.height + TOLERANCE,
      );
    }

    await expect(canvas).toHaveAttribute(
      'data-layout-bottom-navigation',
      '0,582,360,58',
    );
    // Scoped to a direct child of the Phaser parent — see the identical
    // comment in tests/e2e/layout.spec.ts: the marketplace dialog renders its
    // own unrelated `<nav class="market-tabs">` when open.
    await expect(page.locator('#game-viewport > nav')).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  });
}

/**
 * Routes `Date.now` through `window.name`, which survives navigation inside the
 * tab. The production entry is a hashed bundle, so the dev-server trick of
 * rewriting `/src/main.ts` is unavailable; an init script reaches the same
 * single injected clock before any application module runs.
 */
async function installControlledClock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const realNow = Date.now.bind(Date);

    Date.now = () => {
      const controlled = Number(window.name);

      return Number.isFinite(controlled) && controlled > 0
        ? controlled
        : realNow();
    };
  });
}

async function setControlledTime(page: Page, timestampMs: number): Promise<void> {
  await page.evaluate((value) => {
    window.name = String(value);
  }, timestampMs);
}

async function dispatchVisibility(
  page: Page,
  visibilityState: 'hidden' | 'visible',
  timestampMs: number,
): Promise<void> {
  await page.evaluate(({ state, now }) => {
    window.name = String(now);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: state,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, { state: visibilityState, now: timestampMs });
}

/**
 * Writes one active-save record without letting the application run.
 *
 * The bundle is blocked for this navigation only, so nothing boots to flush a
 * valid document over the seeded payload before the reload under test.
 */
async function seedActiveSave(page: Page, payload: unknown): Promise<void> {
  const blockBundle = '**/assets/*.js';

  await page.route(blockBundle, (route) => route.abort());
  await page.goto('/');
  await page.evaluate(async (seeded) => {
    const request = indexedDB.open('cat-mine-idle');

    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore('saves', { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('saves', 'readwrite');
        transaction.objectStore('saves').put({ id: 'active', document: seeded });
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });
  }, payload);
  await page.unroute(blockBundle);
}

async function waitForBootedScene(page: Page): Promise<void> {
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-boot-scene',
    'BootScene',
  );
}

async function readStoredSave(page: Page): Promise<SaveDocumentV2 | null> {
  return page.evaluate(async () => {
    const request = indexedDB.open('cat-mine-idle');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (!database.objectStoreNames.contains('saves')) {
      database.close();
      return null;
    }

    const transaction = database.transaction('saves', 'readonly');
    const getRequest = transaction.objectStore('saves').get('active');
    const record = await new Promise<{ document?: SaveDocumentV2 } | undefined>(
      (resolve, reject) => {
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve(getRequest.result);
      },
    );
    database.close();

    return record?.document ?? null;
  });
}

/**
 * Phaser disables `preserveDrawingBuffer` for performance, which makes the
 * WebGL canvas read back as transparent black. Forcing it on for the test
 * browser context only changes whether the buffer is retained, not what the
 * production bundle draws.
 */
async function forceCanvasReadback(page: Page): Promise<void> {
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
}

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

async function readLogicalRegion(page: Page, datasetKey: string): Promise<Rect> {
  const attribute = `data-${datasetKey.replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`,
  )}`;
  const serialized = await page
    .locator(CANVAS_SELECTOR)
    .getAttribute(attribute);

  if (serialized === null) {
    throw new Error(`Layout diagnostic "${datasetKey}" was not published.`);
  }

  const [x, y, width, height] = serialized.split(',').map(Number);

  return { x, y, width, height };
}

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

async function requireBoundingBox(
  locator: ReturnType<Page['locator']>,
): Promise<Rect> {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('Expected the element to have a bounding box.');
  }

  return box;
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

/**
 * The emitted chunk holding `@supabase/supabase-js`, identified by its
 * contents rather than by its file name, or `null` when this build eliminated
 * the SDK because no Supabase configuration was inlined into it.
 */
function findLazySupabaseChunk(): string | null {
  const assetsDirectory = join(process.cwd(), 'dist', 'assets');
  const entryMarker = 'createInitialGameState';

  for (const fileName of readdirSync(assetsDirectory)) {
    if (!fileName.endsWith('.js')) {
      continue;
    }

    const contents = readFileSync(join(assetsDirectory, fileName), 'utf8');

    // `GoTrueClient` is the SDK's own auth class name, present in the chunk
    // that carries it and nowhere else. The entry-chunk exclusion matters for
    // the day someone reverts the dynamic import: the SDK would then live
    // inside the entry chunk, and aborting *that* would abort the game itself
    // rather than prove anything about a lazy fetch.
    if (contents.includes('GoTrueClient') && !contents.includes(entryMarker)) {
      return fileName;
    }
  }

  return null;
}
