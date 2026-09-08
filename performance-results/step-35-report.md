# Step 35 Mobile Performance Report

## Status

The automated ten-minute benchmark passes its frame, memory-stability,
scene-graph, and input budgets with **all fifteen floors unlocked and
producing**. This is reproducible emulation evidence, not a physical
Android-device measurement: no Android device or ADB target was available on the
development host. A physical mid-range Android Chrome pass remains the
recommended validation and is carried past the base-game milestone as a recorded
open item.

This report replaces an earlier run that measured the former four-floor maximum.
That run predated the fifteen-floor expansion; the fixture had since been changed
to seed fifteen floors but the ten-minute run had not been repeated, so the
recorded evidence no longer matched the scope the plan requires. Step 37 re-ran
it. The four-floor figures are kept below for comparison only.

## Benchmark environment

- Optimized Vite production bundle with benchmark diagnostics enabled at build
  time only; the normal production bundle tree-shakes those diagnostics.
- Google Chrome 151 on macOS, using Playwright's Pixel 5 profile.
- Emulated Android 11 user agent, 393×727 CSS viewport, device pixel ratio 2.75.
- CPU throttled 4× through Chrome DevTools Protocol as the repeatable
  mid-range-device approximation.
- A seeded save opens **all fifteen floors**; the run asserts fifteen unlocked
  floors before sampling and again at the end, so a save that failed validation
  and recovered into a fresh single-floor state fails the benchmark instead of
  quietly passing every budget while profiling the wrong mine.
- Post-GC heap, DOM, listener, scene-graph, input, and frame samples collected
  every 30 s for 600,000 ms.
- Run date 2026-09-08. The host was not fully idle: Markdown documentation edits
  ran alongside it. That is negligible against a 4×-throttled browser process,
  but it is recorded rather than assumed away.

## Results — fifteen floors

| Metric | Result | Budget / interpretation |
|---|---:|---|
| Startup to booted scene | 1,177 ms | Not asserted; recorded. Was 819 ms at four floors |
| Host display refresh rate | 60 Hz | See the frame-rate note below |
| Sampled frame rate | 60.00 FPS | Asserted at no less than 58 |
| Mean frame time | 16.67 ms | Equals the 60 Hz presentation interval |
| Frame time p50 | 16.7 ms | — |
| Frame time p95 / p99 | 17.6 / 17.7 ms | p95 asserted at no more than 20 ms |
| Maximum sampled frame | 17.8 ms | Below the 18.34 ms over-budget threshold |
| Frames beyond budget (>18.34 ms) | 0 of 36,135 | Not one frame missed its interval |
| Frames above 33.34 ms | 0 of 36,135 | Asserted at no more than 0.1% |
| Post-GC live-heap change | +193,680 bytes | Asserted below 2 MiB over ten minutes |
| Post-warm-up heap slope | +990 bytes/s | Asserted at no more than 2,048 bytes/s |
| Phaser game objects | 665 across all 20 samples | Asserted constant, resampled live |
| Unlocked floors | 15 at boot and at end | Asserted, not assumed |
| DOM nodes | 371, constant | Asserted stable |
| Event listeners | 168 after warm-up | Stable after one-time initialization |
| Scroll response p95 / max | 83.5 / 87.8 ms | Asserted below 100 ms |
| Built output | 4,134,573 bytes | Recorded asset budget baseline |
| Image assets | 2,435,609 bytes | Largest shipped asset category |
| Font assets | 95,720 bytes | Fredoka 600/700 variants |
| First-load transferred resources | 2,582,193 bytes | Local uncompressed transfer accounting |
| Main JS chunk | about 1.56 MB raw / 414 kB gzip | Vite warns above 500 kB raw |

### Reading the frame rate

The sampler measures `requestAnimationFrame` deltas, so its frames-per-second
figure reports the cadence the host actually presented at, not a ceiling the game
reached. **This run presented at 60 Hz**, so the 16.67 ms mean is the vsync
interval itself and carries no headroom information — unlike the earlier
four-floor run, which presented at 120 Hz and could therefore show a mean of
8.33 ms.

What this run does establish is that the game met every interval it was given:
the maximum frame across 36,135 samples was 17.8 ms, below the 18.34 ms
over-budget threshold, and not one frame exceeded it. Frame time did rise with
the mine — p95 moved from 9.2 ms at four floors to 17.6 ms at fifteen — but the
comparison is across two different presentation cadences and is not a like-for-
like delta. The honest conclusion is a pass with unknown remaining headroom at
60 Hz, not a measured multiple of the budget.

### Memory

The heap slope is positive this time — +990 bytes/s after warm-up, against the
four-floor run's −502 bytes/s — and total post-GC growth is +193,680 bytes over
ten minutes. Both are inside budget (2,048 bytes/s and 2 MiB), and the sample
series oscillates rather than climbing monotonically: it moves between roughly
9.10 MB and 9.87 MB and ends at 9.44 MB, which is collector behaviour rather
than retention. Scene-graph and DOM counts are exactly constant across all
twenty samples, so nothing is accumulating objects. This is worth re-checking if
a future change raises it further, but at 15 floors it does not indicate a leak.

### Object counts and pooling

The scene republishes its live scene-graph size twice a second while the
benchmark runs, and the benchmark asserts the minimum and maximum sampled counts
are equal. The count held at 665 for all twenty samples — up from 258 at four
floors, which is the expected cost of eleven more floor panels with their pooled
crews. Repeated floor miners, surface haulers, carts, and animation sprites are
preallocated and pooled, and `MineSimulationDriver.advance` memoizes its view
model so frames that complete no fixed tick hand the scene the same object and
skip rebinding entirely.

Scroll response is the metric that moved most: p95 83.5 ms against 50.1 ms at
four floors, still inside the 100 ms budget. Hit-testing and repositioning a
scene graph 2.6× larger under 4× CPU throttling accounts for the direction of
that change. It has the least remaining margin of any budget here and is the
first thing to measure again if the mine grows.

The one per-frame allocation that remains by design is the core's immutable state
advance: `catchUpSimulation` returns a new state object each frame even when no
fixed tick completes. Removing it would mean giving up the immutability the
core's determinism rests on.

## Previous run — four floors, kept for comparison

Recorded 2026-09-03 against the then-current four-floor maximum, on a 120 Hz
host: startup 819 ms, mean frame 8.33 ms, p95 9.2 ms, p99 9.3 ms, max 16.0 ms,
0 of 72,188 frames above 33.34 ms, post-GC heap change +155,360 bytes, slope
−502 bytes/s, 258 Phaser objects constant, 176 DOM nodes, 160 listeners, scroll
p95 50.1 ms / max 52.5 ms, built output 3,887,708 bytes.

## Reproduction

Run `npm run test:perf`. The command builds an optimized profiling bundle,
launches Google Chrome with the Pixel 5/4× CPU profile, runs for ten real
minutes, asserts the budgets, and writes the raw report to
`performance-results/step-35-latest.json`.

For a shorter harness check while editing the benchmark, set `STEP35_DURATION_MS`
to a safe integer of at least 30,000. Short runs do not satisfy the Step 35
acceptance test, and runs under three samples cannot exclude warm-up from the
heap trend, so their slope check is expected to fail.
