import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CANVAS_SELECTOR = '#game-viewport canvas';
const DEFAULT_DURATION_MS = 10 * 60 * 1_000;
const SAMPLE_INTERVAL_MS = 30_000;
const CPU_THROTTLING_RATE = 4;
const RESPONSIVE_INPUT_MS = 100;
const MAX_LIVE_HEAP_GROWTH_BYTES = 2 * 1024 * 1024;
const MAX_MEMORY_SLOPE_BYTES_PER_SECOND = 2 * 1024;
const REPORT_DIRECTORY = path.resolve('performance-results');
const REPORT_PATH = path.join(REPORT_DIRECTORY, 'step-35-latest.json');

interface FrameStats {
  readonly samples: number;
  readonly fps: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly framesOverBudget: number;
  readonly framesOver33Ms: number;
}

interface MemorySample {
  readonly elapsedMs: number;
  readonly liveHeapBytes: number;
  readonly usedHeapBytes: number;
  readonly domNodes: number;
  readonly documents: number;
  readonly eventListeners: number;
  readonly phaserGameObjects: number;
}

interface PerformanceReport {
  readonly environment: {
    readonly benchmarkKind: string;
    readonly browser: string;
    readonly viewport: string;
    readonly deviceScaleFactor: number;
    readonly cpuThrottlingRate: number;
    readonly durationMs: number;
  };
  readonly startupMs: number;
  readonly frame: FrameStats;
  readonly memory: {
    readonly samples: readonly MemorySample[];
    readonly liveHeapGrowthBytes: number;
    readonly trendStartsAtMs: number;
    readonly liveHeapSlopeBytesPerSecond: number;
  };
  readonly objects: {
    readonly bootPhaserGameObjects: number;
    readonly minPhaserGameObjects: number;
    readonly maxPhaserGameObjects: number;
    readonly minDomNodes: number;
    readonly maxDomNodes: number;
  };
  readonly floors: {
    readonly unlockedAtBoot: number;
    readonly unlockedAtEnd: number;
  };
  readonly assets: {
    readonly distBytes: number;
    readonly imageBytes: number;
    readonly fontBytes: number;
    readonly transferredBytes: number;
  };
  readonly input: {
    readonly samplesMs: readonly number[];
    readonly p95Ms: number;
    readonly maxMs: number;
  };
}

declare global {
  interface Window {
    __step35Frames: {
      lastMs: number | null;
      samples: number;
      sumMs: number;
      maxMs: number;
      framesOverBudget: number;
      framesOver33Ms: number;
      buckets: Uint32Array;
    };
  }
}

test('sustains the all-floor mobile performance budget', async ({ page }) => {
  const durationMs = readDurationMs();
  const client = await page.context().newCDPSession(page);

  await client.send('Emulation.setCPUThrottlingRate', {
    rate: CPU_THROTTLING_RATE,
  });
  await client.send('Performance.enable');
  await page.addInitScript(installFrameSampler);
  await seedAllFloorSave(page);

  const navigationStartedAt = Date.now();
  await page.goto('/');
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-boot-scene',
    'BootScene',
  );
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-performance-object-count',
    /\d+/,
  );
  await expect(page.locator(CANVAS_SELECTOR)).toHaveAttribute(
    'data-performance-unlocked-floors',
    /\d+/,
  );
  const startupMs = Date.now() - navigationStartedAt;
  const bootPhaserGameObjects = await readObjectCount(page);
  const unlockedFloorsAtBoot = await readUnlockedFloors(page);

  // Asserted before the run rather than reported after it: a seeded save that
  // failed validation would recover into a fresh single-floor state, and every
  // frame and memory budget below would then pass while profiling the wrong
  // mine entirely.
  expect(unlockedFloorsAtBoot, 'unlocked floors under benchmark').toBe(4);

  await page.evaluate(() => {
    window.__step35Frames.lastMs = null;
    window.__step35Frames.samples = 0;
    window.__step35Frames.sumMs = 0;
    window.__step35Frames.maxMs = 0;
    window.__step35Frames.framesOverBudget = 0;
    window.__step35Frames.framesOver33Ms = 0;
    window.__step35Frames.buckets.fill(0);
  });

  const memorySamples: MemorySample[] = [];
  const inputSamplesMs: number[] = [];
  const startedAt = Date.now();

  for (let elapsedMs = 0; elapsedMs < durationMs; elapsedMs += SAMPLE_INTERVAL_MS) {
    await page.waitForTimeout(Math.min(SAMPLE_INTERVAL_MS, durationMs - elapsedMs));
    const actualElapsedMs = Date.now() - startedAt;

    memorySamples.push(await sampleMemory(client, page, actualElapsedMs));
    inputSamplesMs.push(await measureScrollInput(page, memorySamples.length));
  }

  const frame = await page.evaluate(() => {
    const sample = window.__step35Frames;
    const percentileFromBuckets = (ratio: number): number => {
      const target = Math.ceil(sample.samples * ratio);
      let seen = 0;

      for (let index = 0; index < sample.buckets.length; index += 1) {
        seen += sample.buckets[index];

        if (seen >= target) {
          return index / 10;
        }
      }

      return sample.maxMs;
    };

    return {
      samples: sample.samples,
      fps: sample.samples * 1_000 / sample.sumMs,
      meanMs: sample.sumMs / sample.samples,
      p50Ms: percentileFromBuckets(0.5),
      p95Ms: percentileFromBuckets(0.95),
      p99Ms: percentileFromBuckets(0.99),
      maxMs: sample.maxMs,
      framesOverBudget: sample.framesOverBudget,
      framesOver33Ms: sample.framesOver33Ms,
    };
  });
  const unlockedFloorsAtEnd = await readUnlockedFloors(page);
  const objectCounts = memorySamples.map(
    ({ phaserGameObjects }) => phaserGameObjects,
  );
  const assetSizes = await measureAssetSizes();
  const transferredBytes = await page.evaluate(() => {
    return performance.getEntriesByType('resource').reduce((total, entry) => {
      return total + (entry as PerformanceResourceTiming).transferSize;
    }, 0);
  });
  const liveHeapGrowthBytes =
    memorySamples.at(-1)!.liveHeapBytes - memorySamples[0].liveHeapBytes;
  // The first interval includes V8 optimization and lazy Phaser/Dexie setup.
  // A sustained-growth check starts after that bounded warm-up instead of
  // treating one-time initialization as a leak.
  const trendSamples = memorySamples.length >= 3
    ? memorySamples.slice(1)
    : memorySamples;
  const liveHeapSlopeBytesPerSecond = calculateSlope(
    trendSamples.map((sample) => ({
      x: sample.elapsedMs / 1_000,
      y: sample.liveHeapBytes,
    })),
  );
  const report: PerformanceReport = {
    environment: {
      benchmarkKind: 'Pixel 5 emulation in desktop Google Chrome',
      browser: await page.evaluate(() => navigator.userAgent),
      viewport: `${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
      deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
      cpuThrottlingRate: CPU_THROTTLING_RATE,
      durationMs,
    },
    startupMs,
    frame,
    memory: {
      samples: memorySamples,
      liveHeapGrowthBytes,
      trendStartsAtMs: trendSamples[0].elapsedMs,
      liveHeapSlopeBytesPerSecond,
    },
    objects: {
      bootPhaserGameObjects,
      minPhaserGameObjects: Math.min(...objectCounts),
      maxPhaserGameObjects: Math.max(...objectCounts),
      minDomNodes: Math.min(...memorySamples.map(({ domNodes }) => domNodes)),
      maxDomNodes: Math.max(...memorySamples.map(({ domNodes }) => domNodes)),
    },
    floors: {
      unlockedAtBoot: unlockedFloorsAtBoot,
      unlockedAtEnd: unlockedFloorsAtEnd,
    },
    assets: {
      ...assetSizes,
      transferredBytes,
    },
    input: {
      samplesMs: inputSamplesMs,
      p95Ms: percentile(inputSamplesMs, 0.95),
      maxMs: Math.max(...inputSamplesMs),
    },
  };

  await mkdir(REPORT_DIRECTORY, { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Step 35 report: ${REPORT_PATH}`);
  console.log(JSON.stringify(report, null, 2));

  expect(frame.fps, 'average frame rate').toBeGreaterThanOrEqual(58);
  expect(frame.p95Ms, '95th-percentile frame time').toBeLessThanOrEqual(20);
  expect(liveHeapGrowthBytes, 'post-GC live heap growth').toBeLessThanOrEqual(
    MAX_LIVE_HEAP_GROWTH_BYTES,
  );
  expect(
    liveHeapSlopeBytesPerSecond,
    'post-GC live heap trend',
  ).toBeLessThanOrEqual(MAX_MEMORY_SLOPE_BYTES_PER_SECOND);
  expect(report.objects.maxDomNodes, 'DOM node count remains stable').toBe(
    report.objects.minDomNodes,
  );
  expect(
    report.objects.maxPhaserGameObjects,
    'scene graph does not grow across the run',
  ).toBe(report.objects.minPhaserGameObjects);
  expect(
    report.objects.minPhaserGameObjects,
    'scene graph does not grow after boot',
  ).toBeLessThanOrEqual(bootPhaserGameObjects);
  expect(report.floors.unlockedAtEnd, 'floors stay unlocked').toBe(4);
  // Not a hard zero: one host-level scheduling hiccup in ten minutes is not a
  // rendering defect. A visible stall pattern is, so the tolerance is a rate.
  expect(
    frame.framesOver33Ms / frame.samples,
    'rate of frames beyond two vsync intervals',
  ).toBeLessThanOrEqual(0.001);
  expect(report.input.p95Ms, 'scroll input response').toBeLessThanOrEqual(
    RESPONSIVE_INPUT_MS,
  );
});

function installFrameSampler(): void {
  const targetFrameMs = 1_000 / 60;
  window.__step35Frames = {
    lastMs: null,
    samples: 0,
    sumMs: 0,
    maxMs: 0,
    framesOverBudget: 0,
    framesOver33Ms: 0,
    buckets: new Uint32Array(1_001),
  };

  const sample = (nowMs: number): void => {
    const previousMs = window.__step35Frames.lastMs;

    if (previousMs !== null) {
      const deltaMs = nowMs - previousMs;

      if (deltaMs > 0 && deltaMs < 1_000) {
        const samples = window.__step35Frames;
        samples.samples += 1;
        samples.sumMs += deltaMs;
        samples.maxMs = Math.max(samples.maxMs, deltaMs);
        samples.framesOverBudget += Number(deltaMs > targetFrameMs * 1.1);
        samples.framesOver33Ms += Number(deltaMs > 33.34);
        samples.buckets[Math.min(1_000, Math.round(deltaMs * 10))] += 1;
      }
    }

    window.__step35Frames.lastMs = nowMs;
    requestAnimationFrame(sample);
  };

  requestAnimationFrame(sample);
}

async function seedAllFloorSave(page: Page): Promise<void> {
  await page.route('**/step-35-seed.html', async (route) => {
    await route.fulfill({
      body: '<!doctype html><title>Step 35 seed</title>',
      contentType: 'text/html',
    });
  });
  await page.goto('/step-35-seed.html');
  const timestampMs = Date.now();

  await page.evaluate(async ({ savedAtTimestampMs }) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('cat-mine-idle');
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
      deletion.onblocked = () => reject(new Error('IndexedDB deletion blocked.'));
    });

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('cat-mine-idle', 1);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore('saves', { keyPath: 'id' });
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    const floorLevels = [5, 5, 7, 1];
    const transaction = database.transaction('saves', 'readwrite');

    transaction.objectStore('saves').put({
      id: 'active',
      document: {
        schemaVersion: 1,
        savedAtTimestampMs,
        effectiveProductionRatePerSecond: '0',
        state: {
          saveVersion: 1,
          lastUpdateTimestampMs: savedAtTimestampMs,
          simulationTick: 0,
          simulationRemainderMs: 0,
          gold: '1000000',
          floors: floorLevels.map((mineShaftLevel, index) => ({
            id: `floor-${index + 1}`,
            floorNumber: index + 1,
            isUnlocked: true,
            mineShaftLevel,
            extractionProgress: 0,
            materialQueue: '0',
            totalExtracted: '0',
            totalTransported: '0',
          })),
          elevator: {
            level: 1,
            capacity: '50',
            roundRobinCursor: 0,
            transitProgress: 0,
            carriedMaterial: '0',
          },
          warehouse: {
            level: 1,
            capacity: '60',
            inputQueue: '0',
            conversionProgress: 0,
            totalGoldDelivered: '0',
          },
        },
      },
    });

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { savedAtTimestampMs: timestampMs });
}

/** The scene's live scene-graph size, resampled by the running scene. */
async function readObjectCount(page: Page): Promise<number> {
  return readNumericProbe(page, 'data-performance-object-count');
}

/** How many floors the loaded save actually has unlocked right now. */
async function readUnlockedFloors(page: Page): Promise<number> {
  return readNumericProbe(page, 'data-performance-unlocked-floors');
}

async function readNumericProbe(page: Page, attribute: string): Promise<number> {
  const raw = await page.locator(CANVAS_SELECTOR).getAttribute(attribute);

  if (raw === null || !Number.isFinite(Number(raw))) {
    throw new Error(`Performance probe ${attribute} is unavailable.`);
  }

  return Number(raw);
}

async function sampleMemory(
  client: CDPSession,
  page: Page,
  elapsedMs: number,
): Promise<MemorySample> {
  await client.send('HeapProfiler.collectGarbage');
  const [heap, metrics, dom] = await Promise.all([
    client.send('Runtime.getHeapUsage'),
    client.send('Performance.getMetrics'),
    client.send('Memory.getDOMCounters'),
  ]);
  const metricMap = new Map(
    metrics.metrics.map(({ name, value }) => [name, value]),
  );

  return {
    elapsedMs,
    phaserGameObjects: await readObjectCount(page),
    liveHeapBytes: heap.usedSize,
    usedHeapBytes: metricMap.get('JSHeapUsedSize') ?? heap.usedSize,
    domNodes: dom.nodes,
    documents: dom.documents,
    eventListeners: dom.jsEventListeners,
  };
}

async function measureScrollInput(page: Page, sampleIndex: number): Promise<number> {
  const canvas = page.locator(CANVAS_SELECTOR);
  const before = await canvas.getAttribute('data-performance-mine-scroll-y');
  const box = await canvas.boundingBox();

  if (box === null || before === null) {
    throw new Error('Performance input probe requires the game canvas.');
  }

  const startedAt = await page.evaluate(() => performance.now());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.75);
  await page.mouse.wheel(0, sampleIndex % 2 === 0 ? -80 : 80);
  await expect.poll(
    () => canvas.getAttribute('data-performance-mine-scroll-y'),
    { timeout: 1_000 },
  ).not.toBe(before);
  const completedAt = await page.evaluate(() => performance.now());

  return completedAt - startedAt;
}

async function measureAssetSizes(): Promise<{
  distBytes: number;
  imageBytes: number;
  fontBytes: number;
}> {
  const files = await walkFiles(path.resolve('dist'));
  let distBytes = 0;
  let imageBytes = 0;
  let fontBytes = 0;

  for (const file of files) {
    const bytes = (await stat(file)).size;
    distBytes += bytes;

    if (/\.(png|webp|jpe?g)$/i.test(file)) {
      imageBytes += bytes;
    } else if (/\.(woff2?|ttf|otf)$/i.test(file)) {
      fontBytes += bytes;
    }
  }

  return { distBytes, imageBytes, fontBytes };
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

function readDurationMs(): number {
  const durationMs = Number(process.env.STEP35_DURATION_MS ?? DEFAULT_DURATION_MS);

  if (!Number.isSafeInteger(durationMs) || durationMs < SAMPLE_INTERVAL_MS) {
    throw new Error('STEP35_DURATION_MS must be a safe integer of at least 30000.');
  }

  return durationMs;
}

function calculateSlope(points: readonly { x: number; y: number }[]): number {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce((sum, point) => {
    return sum + (point.x - meanX) * (point.y - meanY);
  }, 0);
  const denominator = points.reduce((sum, point) => {
    return sum + (point.x - meanX) ** 2;
  }, 0);

  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);

  return sorted[index];
}
