# Step 35 Mobile Performance Report

## Status

The automated ten-minute benchmark passes its frame, memory-stability,
scene-graph, and input budgets. This is reproducible emulation evidence, not a
physical Android-device measurement: no Android device or ADB target was
available on the development host. A physical mid-range Android Chrome pass
remains the recommended validation before Step 35 is accepted.

## Benchmark environment

- Optimized Vite production bundle with benchmark diagnostics enabled at build
  time only; the normal production bundle tree-shakes those diagnostics.
- Google Chrome 151 on macOS, using Playwright's Pixel 5 profile.
- Emulated Android 11 user agent, 393×727 CSS viewport, device pixel ratio 2.75.
- CPU throttled 4× through Chrome DevTools Protocol as the repeatable
  mid-range-device approximation.
- A seeded save opens all four floors; the run asserts four unlocked floors
  before sampling and again at the end, so a save that failed validation and
  recovered into a fresh single-floor state fails the benchmark instead of
  quietly passing every budget while profiling the wrong mine.
- Post-GC heap, DOM, listener, scene-graph, input, and frame samples collected
  every 30 s for 600,000 ms.

## Results

| Metric | Result | Budget / interpretation |
|---|---:|---|
| Startup to booted scene | 819 ms | Below 1 s in this local benchmark |
| Host display refresh rate | 120 Hz | See the frame-rate note below |
| Mean frame time | 8.33 ms | 16.67 ms is the 60 FPS budget |
| Frame time p95 / p99 | 9.2 / 9.3 ms | p95 no more than 20 ms |
| Maximum sampled frame | 16.0 ms | Still inside one 60 FPS interval |
| Frames above 33.34 ms | 0 of 72,188 | Asserted at no more than 0.1% |
| Post-GC live-heap change | +155,360 bytes | Below 2 MiB over ten minutes |
| Post-warm-up heap slope | -502 bytes/s | No sustained positive growth |
| Phaser game objects | 258 across all 20 samples | Asserted constant, resampled live |
| Unlocked floors | 4 at boot and at end | Asserted, not assumed |
| DOM nodes | 176, constant | No DOM growth |
| Event listeners | 160 after warm-up | Stable after one-time initialization |
| Scroll response p95 / max | 50.1 / 52.5 ms | Below 100 ms |
| Built output | 3,887,708 bytes | Recorded asset budget baseline |
| Image assets | 2,200,266 bytes | Largest shipped asset category |
| Font assets | 95,720 bytes | Fredoka 600/700 variants |
| First-load transferred resources | 2,343,440 bytes | Local uncompressed transfer accounting |
| Main JS chunk | 1,557,900 bytes raw / about 414 kB gzip | Vite warns above 500 kB raw |

### Reading the frame rate

The sampler measures `requestAnimationFrame` deltas, so its frames-per-second
figure reports the cadence the host actually presented at, not a ceiling the
game reached. This run presented at 120 Hz and the game met every interval, so
the meaningful result is the 8.33 ms mean and 16.0 ms maximum frame time
against the 16.67 ms budget the Step 35 60 FPS target implies — roughly two
times headroom. An earlier run of the same benchmark on a 60 Hz presentation
measured 16.67 ms mean and 17.8 ms maximum, which is the same conclusion at the
other refresh rate. A pass here means no frame missed its budget; it is not a
claim that 120 FPS is the game's limit.

### Object counts and pooling

The scene republishes its live scene-graph size twice a second while the
benchmark runs, and the benchmark asserts the minimum and maximum sampled
counts are equal. The count held at 258 for all twenty samples. Repeated floor
miners, surface haulers, carts, and animation sprites were already preallocated
and pooled by the Step 32A implementation, and `MineSimulationDriver.advance`
memoizes its view model so frames that complete no fixed tick hand the scene
the same object and skip rebinding entirely. Because the measured frame,
scene-graph, and heap budgets all pass, Step 35 adds no speculative runtime
rewrite.

The one per-frame allocation that remains by design is the core's immutable
state advance: `catchUpSimulation` returns a new state object each frame even
when no fixed tick completes. The post-GC heap slope is negative over ten
minutes, so this is within what the collector absorbs, and removing it would
mean giving up the immutability the core's determinism rests on.

## Reproduction

Run `npm run test:perf`. The command builds an optimized profiling bundle,
launches Google Chrome with the Pixel 5/4× CPU profile, runs for ten real
minutes, asserts the budgets, and writes the raw report to
`performance-results/step-35-latest.json`.

For a shorter harness check while editing the benchmark, set
`STEP35_DURATION_MS` to a safe integer of at least 30,000. Short runs do not
satisfy the Step 35 acceptance test, and runs under three samples cannot
exclude warm-up from the heap trend, so their slope check is expected to fail.
