# Active Context

## Current Focus

Implementation Plan Step 36 remains implemented and Step 37 has not started. The 2026-09-08 live-browser review now includes the compact warehouse-queue HUD, progressive fifteen-floor disclosure, filled/empty tower hopper, strict top-down elevator pickup priority, and one-baseline surface-hauler formation.

## Recent Changes

- Completed the 2026-09-08 HUD queue clarification: the centre slot now uses the warehouse icon, reads only authoritative `warehouse.inputQueue`, and exposes the unambiguous `warehouseQueueValueLabel` diagnostic. Nine focused unit assertions and two Chromium HUD regressions pass.
- Completed the 2026-09-08 tower-hopper feedback independently: `BootScene` swaps between filled and empty 512×512 headhouse textures from `warehouse.queueSteps`, so zero `warehouse.inputQueue` exposes an empty steel bin and any positive queue restores the gold pile. The generated edit is recorded in the asset manifest; four asset unit tests and two focused Chromium regressions pass.
- Completed the 2026-09-08 elevator priority bug independently: a cabin continues deeper only after the current floor queue is fully drained and capacity remains. Filling the computed remainder now snaps cargo to the authoritative capacity, preventing decimal round-off from making a full cabin appear fractionally under capacity. Thirty-two focused elevator/driver/time tests pass, including the `50.005` capacity regression.
- Completed the 2026-09-08 surface-crew alignment feedback independently: every assistant retains its phase-shifted horizontal route position and personal cart, but all cat and cart Y offsets are now zero so the full crew shares the lead baseline. Thirty-one animation unit tests and one focused Chromium crew regression pass.
- Completed aggregate verification on 2026-09-08: all 322 unit tests, 38 Chromium E2E tests, 9 production smoke tests, lint, strict build, and `git diff --check` pass. Direct inspection of `http://127.0.0.1:5174/` reports the warehouse icon/value, empty-hopper texture at queue zero, shared crew baselines, one canvas, and no console errors.
- Analyzed the supplied 8.56-second gameplay video.
- Created `memory-bank/game-design-document.md` with the core loop, systems, UI, MVP, and uncertainties.
- Selected a web-first Phaser/TypeScript stack in `memory-bank/tech-stack.md`.
- Added contributor guidance in `AGENTS.md`.
- Initialized the Memory Bank on 2026-08-27.
- Strengthened contributor rules to require pre-code context reads and complete database-schema documentation.
- Created `memory-bank/implementation-plan.md`, a 37-step test-driven delivery sequence for the base game.
- Consolidated the GDD, tech stack, and implementation plan inside `memory-bank/` and resolved base-game implementation defaults.
- Added `memory-bank/architecture.md` as an empty placeholder and required it to be read before code and updated after major features or milestones.
- Validated Step 1 on 2026-08-27 and documented current file responsibilities, planned module ownership, dependency boundaries, data flow, and the absence of a database in `memory-bank/architecture.md`.
- Completed and validated Step 2 on 2026-08-27 with a root Vite/TypeScript scaffold, Phaser 4.2.1, an npm lockfile, and a simulator-preview workflow.
- Implemented Step 3 quality tooling with strict TypeScript 6.0.3, ESLint 10.9.1, Vitest 4.1.11, and Playwright 1.62.1.
- Added one baseline unit test and one Chromium browser smoke test; lint, unit tests, E2E tests, production build, and the development-server HTTP check pass.
- The user validated Step 3 and authorized Step 4 on 2026-08-27.
- Implemented Step 4 module entry points for core, config, game, UI, persistence, and the browser platform adapter, plus tracked placeholder asset storage.
- Added scoped ESLint rules and a regression test that keep core modules independent of Phaser, persistence/platform adapters, and browser globals.
- The user validated Step 4 and authorized Step 5 on 2026-08-27.
- Implemented one Phaser game and one boot scene with automatic WebGL/Canvas selection, a 360×640 logical viewport, fit-and-center scaling, a neutral background, and no physics configuration.
- Replaced the temporary DOM scaffold with the Phaser canvas and added hot-reload cleanup that destroys the prior game instance before replacement.
- Updated the Chromium smoke test to verify one canvas, one boot-scene start per load, the logical dimensions, a valid renderer, reload behavior, and no browser errors.
- The user validated Step 5 and authorized Step 6 on 2026-08-27.
- Added typed, data-driven provisional balance configuration for four mine floors, one shared elevator, one shared warehouse, and the required level 10/25/50/100 milestones.
- Added startup validation plus unit coverage for missing floors, duplicate identifiers, invalid durations, non-positive yields, and invalid milestone ordering.
- The user validated Step 6 and authorized Step 7 on 2026-08-27.
- Added an immutable `GameNumber` abstraction backed privately by `break_infinity.js` 2.2.0 for arithmetic, comparisons, and stable string serialization.
- Added unit coverage for ordinary and very large values, immutable operations, serialization/JSON round trips, and invalid numeric sources.
- The user validated Step 7 and authorized Step 8 on 2026-08-27.
- Added renderer-independent authoritative state types for global gold, four floors, the elevator, and the warehouse, with save version and last-update timestamp.
- Added a deterministic fresh-state factory that consumes validated balance data and an explicit timestamp, plus tests for unlocks, progress, quantities, serialization, and invalid timestamps.
- The user validated Step 8 and authorized Step 9 on 2026-08-27.
- Added a pure 100 ms fixed-step simulation clock with a 1,000 ms foreground-delta cap, authoritative tick/remainder state, immutable elapsed-time advancement, and full wall-clock timestamp consumption.
- Added deterministic timing coverage for single, repeated, and irregular update chunks, partial-tick carry, oversized deltas, invalid elapsed values, and unchanged production state before Step 10.
- The user validated Step 9 and authorized Step 10 on 2026-08-27.
- Added config-driven extraction to fixed simulation ticks: unlocked floors advance normalized progress, completed cycles add level-adjusted yield to local queues and extraction totals, and overflow carries into the next cycle.
- Added extraction coverage for cycle boundaries, overflow, exponential level yield, all configured floor durations/yields, locked floors, deterministic chunking, and no direct spendable-gold increase.
- The user validated Step 10 and authorized Step 11 on 2026-08-27.
- Added one timed shared elevator that selects unlocked non-empty floors round-robin, removes at most its capacity, records transported totals, carries material during transit, and delivers only to the warehouse input queue.
- Added elevator coverage for empty idling, limited-capacity excess, locked/empty skipping, round-robin fairness, exact delivery timing, immutable state, and conservation across multiple extraction/transit cycles.
- The user validated Step 11 and authorized Step 12 on 2026-08-27.
- Added timed warehouse conversion that retains material in the input queue during progress, converts up to warehouse capacity at completion, and adds the same amount to spendable gold and total delivered gold.
- Added warehouse coverage for idle behavior, pre-boundary isolation, capacity-limited and repeated cycles, immutable input, deterministic chunking, and end-to-end material conservation.
- The user validated Step 12 and authorized Step 13 on 2026-08-27.
- Finalized each fixed tick as all unlocked floor extractions in configured order, then the shared elevator, then the shared warehouse; locked floors remain inert and all production runs automatically.
- Added concurrent-pipeline coverage for independently calculated floor output/progress, same-tick handoffs, locked-floor inactivity, material conservation, and equivalent update chunking.
- The user validated Step 13 and authorized Step 14 on 2026-08-27.
- Added pure theoretical per-floor extraction rates and a mine-wide effective production estimate based on the slowest of aggregate unlocked extraction, shared elevator throughput, and shared warehouse throughput.
- Added rate coverage for current floor levels, locked-floor exclusion from the mine aggregate, extraction/elevator/warehouse bottlenecks, and authoritative-state immutability.
- The user validated Step 14 and authorized Step 15 on 2026-08-27.
- Added deterministic next-upgrade prices for mine shafts, the elevator, and the warehouse using `baseCost × costGrowthRate^currentLevel` through `GameNumber` arithmetic.
- Added three immutable purchase commands with explicit insufficient-funds, missing-floor, and locked-floor results; successful purchases deduct the exact cost and increment only the selected level.
- Added upgrade coverage for starting and representative costs, exact-balance purchases, all three success paths, expected failures, invalid levels, and preservation of unrelated authoritative state.
- The user validated Step 15 and authorized Step 16 on 2026-08-28.
- Applied stage-specific upgrade effects: mine-shaft levels increase extraction yield, while elevator and warehouse purchases deterministically recalculate capacity from base capacity and the configured growth rate.
- Added coverage comparing equal-duration production and derived rates before and after every stage upgrade, including preservation of queues, carried material, totals, cursors, timestamps, and normalized in-progress completion.
- The user validated Step 16 and authorized Step 17 on 2026-08-28.
- Added one shared level-effect calculation that applies configured milestone multipliers cumulatively at levels 10/25/50/100 to mine-shaft yield and shared-stage capacity.
- Added milestone coverage for every threshold, actual production and derived rates across all three stages, milestone-aware initial state, preserved in-progress work, and reload-style idempotence.
- The user validated Step 17 and authorized Step 18 on 2026-08-28.
- Added an immutable floor-unlock purchase command that enforces the configured immediately previous unlocked-floor level requirement, checks funds, deducts the exact cost once, and initializes the opened floor from balance configuration.
- Added unlock coverage for unmet and locked prerequisites, insufficient funds, configured initialization, repeated requests, unknown floors, all three sequential unlocks, and production after opening.
- The user validated Step 18 and authorized Step 19 on 2026-08-28.
- Added a deterministic automated economy playthrough that advances production once per second, prioritizes eligible floor unlocks, otherwise purchases the affordable upgrade with the greatest modeled effective-rate improvement, and resolves ties toward the next unlock prerequisite.
- Confirmed the provisional balance opens all four floors by 317 simulated seconds, reaches a level-10 multiplier without runaway level-100 growth, preserves finite non-negative state, and remains deterministic over ten simulated minutes without balance changes.
- The user validated Step 19 and authorized Step 20 on 2026-08-28.
- Added a plain-JSON version-1 save document containing its schema version, save timestamp, effective production-rate snapshot, and the complete serialized authoritative game state.
- Added strict config-aware validation, runtime deserialization, and a migration entry point that accepts version 1 unchanged while rejecting missing or unsupported versions; no storage adapter exists yet.
- The user validated Step 20 and authorized Step 21.
- Added a Dexie-backed repository with one fixed `active` save record, a debounced persistence coordinator, non-throwing load/save diagnostics, and web `visibilitychange`/`pagehide` forced flushes.
- Added exact close/reopen restoration coverage plus a regression fix that compares level-derived capacities at their canonical serialized boundary.
- The user validated Step 21 and authorized Step 22 on 2026-08-28.
- Added a recovery-aware active-game loader that restores valid saves, creates a fresh playable state for empty storage, and converts malformed or unsupported payloads into typed visible warnings plus fresh state without partial application.
- Preserved invalid payloads as detached diagnostic snapshots when structured cloning is safe, and isolated persistence/recovery callbacks so presentation failures cannot escape into the running session.
- The user validated Step 22 and authorized Step 23 on 2026-08-28.
- Added pure saved-rate offline-income calculation with a configured two-hour cap and 50% efficiency; zero/normal/capped/future-clock intervals remain deterministic inside the `GameNumber` boundary.
- Integrated offline settlement into valid-save loading: the authoritative timestamp advances to the caller-provided current time and is persisted before a positive pending reward is exposed, preventing repeated reloads from rewarding the same interval. Failed settlement writes withhold the reward and surface the existing persistence diagnostic.
- The user validated Step 23 and authorized Step 24 on 2026-08-28.
- Added a pure pending-reward claim command that adds the exact `GameNumber` reward to gold and consumes the pending value, while a repeated claim with no pending value returns the original state.
- Wired browser startup through IndexedDB recovery and offline calculation, added a simple accessible modal showing credited time and reward, and force-persists the claimed snapshot before dismissing the modal. A failed write keeps the same claim candidate for retry without adding the reward again.
- Added browser coverage proving fresh players see no modal and a returning player can claim a capped reward exactly once across reload; one hundred twenty-five unit tests, two Chromium E2E tests, lint, and production build pass.
- The user authorized Step 25 on 2026-08-28, which validated Step 24.
- Added `src/game/layout/mineLayout.ts`, a pure Phaser-free module that tiles the 360×640 portrait viewport into a fixed HUD, a shared surface strip, and a scrollable mine region reaching the bottom edge with no reserved bottom navigation.
- Moved the Phaser parent into `#game-viewport` and gave `#app` `env(safe-area-inset-*)` padding plus `viewport-fit=cover`, so safe-area insets are applied once, outside the canvas, before the scale manager measures its parent.
- Rebuilt `BootScene` around separate fixed and scrolling layers, English HUD/surface placeholders, and four placeholder floor slots whose then-current 508-pixel content exceeded the 428-pixel mine region.
- Replaced an initial geometry-mask attempt with a dedicated mine camera viewport after Phaser 4 warned that `setMask` does nothing in WebGL; the mine area is now genuinely clipped in both renderers.
- Added sixteen layout/palette unit tests and four Playwright viewport tests (320×568, 390×844, 768×1024, 1280×800).
- Review of the first Step 25 implementation found the browser suite could not detect a broken render: deleting either camera-ignore call left all four viewport tests green while the HUD was visibly destroyed. Added pixel probes that sample the real canvas, extracted the palette into a pure module so scene and test read one source of truth, replaced a hardcoded `428` with the published mine height, threaded `layout.width` into the floor slots, and put the `src/game/layout` purity claim behind a lint rule with an `architecture.test.ts` probe.
- Verified the new probes by mutation: removing either ignore call, or misplacing the mine camera viewport, now fails with a named assertion. A first attempt probing a floor panel missed one mutation because a later-drawn panel hid the duplicated layer; the probe moved to the mine gutter.
- One hundred forty-four unit tests, six Chromium E2E tests, lint, and production build pass.
- The user authorized Step 26 on 2026-08-28, which validated Step 25.
- Added `src/game/view-model/mineViewModel.ts`, a pure Phaser-free module that turns a read-only `GameState` into the exact strings, ratios, and pile heights the screen shows, so every displayed value is unit-testable in Node.
- Added reusable `MineFloorView` and `SharedStageView` entities in `src/game/entities/`. Each owns its game objects, changes only through `applySnapshot`, and reports what it actually shows through `describeRenderedState`.
- `BootScene` now takes the loaded snapshot at construction, builds four floor views into the scrollable mine slots and two stage views into the surface strip, and exposes `applySnapshot` for the live snapshots Step 27 will push.
- Locked floors are drawn in their own `#1a2333` panel colour with a `Locked` badge, muted text, no placeholder miner, and no upgrade control; unlocked floors keep the `#27364b` panel.
- The material queue is derived as a discrete four-step diagnostic measured against one elevator trip; the fixed far-right mound is environmental art and does not encode this value.
- Amount display is deliberately provisional (`formatAmount` rounds to one decimal and leaves very large values serialized); Step 28 replaces it with the shared abbreviated K/M/B/T formatter.
- The browser test seeds a known version-1 save whose four floors differ in lock state, level, progress, and queued material, then compares the rendered values read back from the view objects against that snapshot, backed by eight pixel probes.
- Six deliberate mutations were confirmed to fail with named assertions, including one where the views hold correct values but never reach the framebuffer — which only the pixel probes catch.
- The Step 25 surface pixel probe moved from `300,100` to `300,85` because the new stage panels now occupy the lower part of the surface strip; the probe again samples a point the surface background itself owns.
- Review of the first Step 26 implementation found two defects that only bite later. The rendered-state diagnostic was published once at the end of `create` and never again, so from Step 27 onward a live snapshot that never reached the views would still report a healthy first frame — defeating the read-back's whole purpose. `applySnapshot` also skipped a floor whose snapshot entry was missing, which would leave surplus views showing blank panels that look like real unlocked floors.
- Fixed both: `#publishViewDiagnostics` is now called on every rebind as well as at boot, a mismatched floor count throws through the pure `assertRenderableMineViewModel` guard, and a snapshot arriving before `create` is kept and bound by `create` rather than dropped.
- Both fixes were mutation-verified: freezing the diagnostic at boot fails the new rebind browser test with a named assertion, and disabling the guard fails its unit test.
- Two review cleanups followed: `MineFloorView` now derives its progress-track width from the floor slot exactly as `SharedStageView` does, instead of hardcoding `196` while its neighbouring label and upgrade control tracked `region.width`; and the browser test imports the views' own `RenderedFloorState`/`RenderedSharedStageState` types rather than restating them, so a renamed read-back field now fails type-check instead of silently reading `undefined`.
- Both cleanups were mutation-verified: an overflowing track fails the new containment assertion by name, and renaming a field on `describeRenderedState` fails `tsc`.
- Two more cleanups: `MineFloorView` derives its `Locked` badge and upgrade control from one anchor each instead of three hand-synchronised offsets, and the browser test stopped asserting a constant. `SharedStageView` never hides its upgrade control, so reporting its visibility was an assertion that could not fail; the read-back now reports the bound `upgradeControlLabel`, which does catch a broken binding.
- The floor pile expectation is derived through `calculateMaterialPileSteps` rather than hardcoded, so tuning the elevator capacity cannot fail the test with an opaque number, and a named guard keeps the empty-pile pixel probe meaningful if a tuning change ever fills the stack.
- Mutation-verified: dropping the shared-stage label binding and binding every floor view to floor one both fail by name. The badge-anchor extraction is a behaviour-preserving refactor with no new assertion; the existing pixel probes and read-back values are unchanged by it.
- One hundred sixty-one unit tests, eight Chromium E2E tests, lint, and the production build pass.
- The user authorized Step 27 on 2026-08-28, which validated Step 26.
- Added `src/game/runtime/MineSimulationDriver.ts`, the live bridge the mine screen pulls from. It holds authoritative state, advances it to an injected wall clock through `advanceSimulation`, memoizes the derived view model, and accepts state replaced by a command. `Date.now` is injected from `src/main.ts`, so the clock stays in one place and Node tests advance time exactly.
- Reversed the direction of the render loop from Step 26's push to a pull. `BootScene.update` asks the source for the newest snapshot every frame; the public `applySnapshot` is gone, because a pushed snapshot would be overwritten by the next frame anyway.
- Added `src/game/view-model/stageAnimation.ts`, the cosmetic clock: frame accumulation capped at 250 ms and scaled by a validated `animationSpeedMultiplier`, wrapping at a whole multiple of both the 800 ms miner swing and the 900 ms conveyor cycle, plus the progress-driven cycle-marker offset.
- Gave each production stage its own indicator and its own queued material. Floors gained a swinging pick and a `Backed up` label; both shared stages gained discrete queue blocks, an `Idle` / `In transit` / `Converting` / `Backed up` status, a marker travelling the cycle track, and conveyor dashes that run only while the stage holds material.
- A full queue still derives `isMaterialBackedUp` for stage diagnostics. The elevator deliberately never reports a backlog: a full car is one full trip, and transport pressure belongs to the floor queue/cart state rather than the fixed mound.
- Each pile measures against the capacity of whichever stage removes it — floor piles against the elevator, the warehouse queue against the warehouse — so the same amount reads differently in the two places, correctly.
- Reworked the offline-claim retry. It used to cache a post-claim state candidate; with the mine now producing while the modal is open, that candidate would discard whatever was mined between a failed write and the retry. A consumed-once flag replaces it, so the retry saves current state and still adds the reward exactly once.
- Browser diagnostics are now published on a 100 ms cadence rather than on every rebind, because displayed progress changes every frame and an unthrottled read-back would serialize the whole screen 60 times a second purely for tests.
- Playwright's clock turned out to give exactly the two controls Step 27's validation needs: `install` plus `setFixedTime` pins `Date.now` while rAF keeps running, which pauses the core and leaves the renderer live; `install` plus `pauseAt` then `runFor` advances both deterministically. The bottleneck fixtures use the first, the animation-speed trial the second.
- The animation-speed trial settles the core explicitly at the end of each run, so gold depends on total elapsed time rather than on where frames happened to land, and the two runs compare byte-identical serialized gold.
- Nine mutations were confirmed to fail with named assertions: a speed multiplier wired to nothing, a scene that never advances the core, a pile that ignores the backlog colour, shared-stage queue blocks that ignore the amount, a cycle marker parked at the start of its track, a conveyor that never stops, a cosmetic clock allowed to drive the authoritative progress bar, a diagnostic frozen at boot, and a floor pick that never moves.
- A latent pixel-probe race surfaced once a third probing spec joined the suite: diagnostics are published inside `create`, before the first frame is presented, and a canvas that has not presented reads back as opaque black — so under parallel load a probe could sample an empty buffer and fail on a correct render. Both browser specs now poll an always-painted HUD point before any probe, and the full suite passed five consecutive runs.
- Fixed a time-loss bug found while reviewing Step 27: the driver handed the whole wall-clock gap to `advanceSimulation`, which credits at most one second but consumes the entire delta. A hidden tab is not a slow frame — the browser stops the render loop, so the absence arrived as one delta and everything past its first second was consumed unsimulated. Reproduced at sixty seconds: 380 gold when frames ran throughout, 100 (the starting balance) when the same minute arrived as one frame. No reload happens in that scenario, so offline income never saw the interval either.
- Added `src/core/simulation/catchUpSimulation.ts`, which walks a gap in credited-size slices. Slicing is exact rather than approximate because `advanceSimulation` carries its sub-tick remainder in authoritative state, so a run of slices is indistinguishable from continuous time. The catch-up lives in the core, not the driver: how much wall-clock time is credited is simulation semantics, and the driver stays a thin bridge.
- Bounded catch-up at `MAX_CATCH_UP_MS` (two hours), because it runs inside the frame that discovers the gap. Measured worst case is roughly thirty milliseconds for the full seventy-two thousand ticks. The bound matches the horizon `offlineIncome.capDurationMs` already applies to away time, so leaving the tab open and closing it are capped alike, and time past the cap is still consumed by `lastUpdateTimestampMs` — a timestamp left behind real time would hand the same interval to offline income on the next load.
- Three mutations were confirmed to fail with named assertions: the driver reverted to a single bounded advance, catch-up dropping uncredited time instead of consuming it, and catch-up left unbounded.
- Fixed the two remaining review findings. The driver now re-derives its snapshot only when a fixed tick completed: a sixty-frame second completes ten ticks, so most frames left a state differing solely in timestamp and sub-tick remainder, and re-deriving rebuilt an identical view model while handing the scene a new object to rebind. The tick counter is the exact condition, not a heuristic, because `advanceSimulation` increments it once per tick and nothing else touches production state. `replaceState` still always re-derives, since a command changes displayed values without completing a tick.
- With that in place `BootScene.#bindSnapshot`'s identity check finally fires on most frames, so the renderable guard moved behind it. Every distinct snapshot is still checked once, on the frame it first arrives.
- Gated the rendered-state read-back behind `import.meta.env.DEV`. Nothing in the game reads those attributes, and a shipped build was serializing the whole screen ten times a second for an audience that does not exist. Playwright runs against the dev server, so browser tests are unaffected; the production bundle no longer contains the `floorViews` or `surfaceViews` dataset writes at all, though the unreferenced `describeRenderedState` bodies still ride along as dead code. The boot and layout diagnostics are untouched, as are the canvas accessibility attributes.
- Three more mutations fail by name: a driver that never memoizes, a driver that never re-derives, and a `replaceState` that reuses the snapshot.
- One hundred ninety-eight unit tests, twelve Chromium E2E tests, lint, strict production build, and `git diff --check` pass.

- Implemented Step 28 on 2026-08-29 after the user authorized it. The HUD is live: `createHudViewModel(state, balance)` derives the English `Gold` and `Income /s` captions and their values and rides on the same `MineViewModel` the mine views are bound from, so one snapshot drives the whole screen and `createMineViewModel` plus `MineSimulationDriver` now take balance data. Income is the core's `effectiveProductionPerSecond`, already capped at the chain's slowest stage. `HudView` builds its background, divider, and four text objects once and changes only through `applySnapshot`; `BootScene` publishes `data-hud-view` on the existing 100 ms cadence.
- `src/game/view-model/formatAmount.ts` replaced the provisional display helper and is now the single formatter for every displayed amount. At most one decimal place, then no suffix below 1,000, `K`/`M`/`B`/`T`, then alphabetic suffixes `aa`, `ab`, ... `zz`, `aaa`, ... matching the GDD's `14.6aa` and `7.2ab`; past three letters the serialized scientific form is shown. Digits truncate rather than round, and a present-but-tiny amount reads `<0.1`.
- `GameNumber` gained normalized `mantissa`/`exponent` getters. The formatter needs a magnitude, and reading one through `Number` prints the same thing for every value past 1e308; the two plain numbers give display code what it needs without leaking the numeric library's type.
- Step 28 evidence: two hundred seventeen unit tests, fourteen Chromium E2E tests, lint, the strict production build, and `git diff --check` pass. One browser test asserts the HUD's abbreviated gold and its income against the core's own rate calculation; a second boots the real driver one conversion cycle short of a delivery, runs two seconds of fake wall clock, and asserts the displayed gold equals the authoritative balance while the scene's display-object count is unchanged. Six mutations fail with named assertions: a HUD bound once at boot and never rebound, a HUD never bound at all, a formatter that rounds instead of truncating, an alphabetic run starting one tier late, a formatter reading magnitude through `Number`, an income value taken from aggregate extraction instead of the bottleneck-capped rate, and a `HudView` that appends a text object per rebind.
- Step 28 review fixes: four review findings were corrected without changing behaviour. `TRUNCATION_TOLERANCE` in `formatAmount.ts` claimed a displayed amount can never read high, but the tolerance that keeps floating-point scaling from dropping a digit also lifts a value within `1e-9` of the next digit onto it, so `0.9999999999` reads `1`; the tolerance is now documented as the bound on that overstatement and a unit test pins both sides of it, making the claim checkable rather than asserted. `HudView` typed its text anchor as a bare `number` after the move out of `BootScene`, losing the old `'left' | 'right'` safety, and now uses a `HorizontalOrigin = 0 | 1` alias with named constants. `BootScene` published `data-hud-view` as `"null"` before the view existed, which would have surfaced in a browser test as a property access on `null` rather than a named diagnostic failure; the attribute is now written only once the view exists. `GameNumber`'s `mantissa`/`exponent` getters moved out of the middle of the arithmetic group to sit beside `serialize()`, and `exponent` gained its own doc.

- Implemented Step 29 on 2026-08-29 after the user authorized it. Every unlocked mine shaft and both shared stages now carry a working upgrade control. `createUpgradeControlViewModel(target, cost, gold)` derives the `Upgrade` caption, the abbreviated price, `isAffordable`, the command target, and a stable key; a locked floor's `upgradeControl` is `null`. Each price comes from the same core function that charges it, so `createMineViewModel` now takes each floor's balance config and the spendable balance alongside the state it reads.
- `UpgradeControlView` is one reusable entity used by both the floor panels (`stacked` layout) and the shared-stage panels (`inline`). Its background rectangle carries the hit area, so the pressable region is exactly the drawn one and a hidden control is unreachable — which is how locked floors have no button. An unaffordable control is drawn disabled but still accepts a press, because refusing in the view would substitute the renderer's guess for the core's answer and leave the player with no feedback.
- `MineSimulationDriver.purchaseUpgrade(target)` is the scene's command sink. It advances to the current time first, dispatches to `purchaseMineShaftUpgrade` / `purchaseElevatorUpgrade` / `purchaseWarehouseUpgrade`, and returns `purchased`, `insufficient-funds`, or `unavailable`. A refusal leaves state and the memoized snapshot untouched; a purchase re-derives the snapshot and calls the new optional `onCommandApplied` hook, which `src/main.ts` uses to queue a debounced save so a purchase is not lost on the next reload.
- The result appears on the pressed control for 1,200 ms — `Upgraded!` on green, `Need more gold` on red — expired by the pure `describeUpgradeFeedback`, run on the Phaser scene clock rather than the cosmetic animation clock. `BootScene` rebinds and republishes diagnostics immediately on a press, since a purchase changes displayed values without any tick completing, and publishes `data-upgrade-controls` with each control's screen-space rectangle so a browser test can aim a real press at it.
- Step 29 evidence: two hundred thirty-two unit tests, eighteen Chromium E2E tests, lint, the strict production build, and `git diff --check` pass. Three browser flows press real controls at published coordinates: an unaffordable press that spends nothing and says `Need more gold`, one mine-shaft purchase with exactly one deduction, one level increase, an unchanged display-object count, and an updated button price, and the two shared stages bought through their own commands. Eight mutations fail with named assertions: affordability using strictly-greater instead of at-least, a purchase that skips advancing to the current time, feedback that never expires, a refused command reported as applied, a view that refuses an unaffordable press itself, every press routed to the mine shaft, floor control geometry that ignores the mine camera, and a control bound once and never rebound.

- Step 30 implemented on 2026-08-30: every locked floor now sells itself. `describeFloorUnlock(state, floorId, config)` in `src/core/progression/unlocks.ts` reports one locked floor's price, the prerequisite shaft it waits on (id, player-facing number, required level, current level), `isRequirementMet`, `isAffordable`, and `canUnlock`, or `null` once the floor is open. It and `purchaseFloorUnlock` now share one private predicate, so the description a control renders and the command that charges gold cannot disagree — a unit test asserts that agreement across every combination of prerequisite level and balance.
- Step 30 controls: the upgrade-control model generalized into `src/game/view-model/purchaseControl.ts`, because an unlock is the same control to the player — a labelled button with a price that either can or cannot be pressed to effect right now. `UpgradeTarget`/`UpgradeOutcome`/`UpgradeControlViewModel` became `PurchaseTarget`/`PurchaseOutcome`/`PurchaseControlViewModel`, `isAffordable` became `isEnabled` (a control is now drawn enabled for two reasons, not one), `UpgradeControlView` became `PurchaseControlView`, `MineSimulationDriver.purchaseUpgrade` became `purchase`, and the canvas diagnostic became `data-purchase-controls`. `PurchaseTarget` gained `{ type: 'floor-unlock', floorId }`; `PurchaseOutcome` gained `unlocked` and `requirement-not-met`, labelled `Unlocked!` and `Level too low`.
- Step 30 presentation: `MineFloorView` holds two `PurchaseControlView` instances in one slot — the shaft upgrade and the unlock — of which exactly one is ever visible, and Phaser skips invisible objects when hit-testing, so the two can never both take a press. The requirement is not on the button but beside it: `Needs Floor 1 Lv 5`, drawn in `TEXT_WARNING` while unmet and `TEXT_MUTED` once satisfied, so a player who is only short of gold is not told to keep upgrading. `assertRenderableMineViewModel` now requires exactly one of the two controls per floor, and `createMineFloorViewModel` rejects an unlock description that disagrees with the floor's lock state.
- Step 30 commands: `MineSimulationDriver.purchase` dispatches a `floor-unlock` target to `purchaseFloorUnlock` and maps refusals through one `describeRefusal` — only `insufficient-funds` and `prerequisite-not-met` are named, because every other core failure is a press that should not have been reachable and reads as advice the player cannot use. A successful unlock fires the same `onCommandApplied` hook, so `src/main.ts` persists the opened floor without waiting for a tick. `BootScene` now expires its whole feedback map each frame rather than only the entries whose control is still on screen, because a successful unlock hides the control that was pressed and its result would otherwise never be collected.
- Step 30 evidence: two hundred forty-seven unit tests, nineteen Chromium E2E tests, lint, the strict production build, and `git diff --check` pass. One browser flow drives the whole journey on a paused clock: floor 2 shows `Locked`, `Needs Floor 1 Lv 5`, and its price with the button disabled although the balance already covers it; a premature press reads `Level too low` and leaves the floor closed; one floor-1 upgrade satisfies the gate and the button enables; the unlock deducts about one price, opens the floor in place — locked colour gone, miner working, unlock control replaced by the shaft upgrade — with `data-boot-scene-starts` still `1`; the open floor reaches IndexedDB before a reload, and after the reload it is still open and extracts material.
- Step 30 mutation verification: seven mutations fail with named assertions — an unlock enabled by gold alone (`level 4 with 5000 gold`), a description drifting from the command it describes (four unrelated unlock tests break), locked floors carrying no unlock control (six assertions across two files), a prerequisite refusal reported as merely unavailable (`a premature unlock must say which gate refused it`), an unlock that skips the applied-command hook (`the open floor must reach the save before the reload`), a scene that does not rebind after a purchase (`one level bought`), and an unlock control bound once and never rebound (`a locked floor offers an unlock instead`).
- Step 30 browser-test finding: under a Playwright clock paused with `pauseAt`, the Phaser game loop does not step again after `create`, and a pointer event dispatched before it steps is never taken up. The spec grants one `runFor` after the scene exists, and every press then waits — advancing the clock in slices — until the control reports a result or disappears, rather than assuming a fixed settling time.

## Active Decisions

- Target browser and Telegram Mini App first.
- Keep core simulation deterministic and independent of Phaser.
- Use original branding and assets rather than copying the reference game's protected content.
- Keep MVP client-only and exclude monetization, blockchain, and social systems.
- Treat balance values in the GDD as starting hypotheses requiring playtests.
- Use English UI at a 360×640 logical resolution with no deferred bottom navigation.
- Run production automatically through four mine shafts, one shared sequential-stop elevator, and one shared warehouse.
- Upgrade mine shafts, elevator, and warehouse independently while preserving progress percentage.
- Use saved-rate offline rewards, lowercase `k/m/b/t/qa/qi/sx/sp/oc/no/dc`
  tiers followed by `aa` from `10^36`, Phaser 4.2.1, and a mid-range Android
  Chrome performance baseline.
- Start with 100 gold; provisional floor unlock costs are 250, 1,500, and 7,500, gated by prior-floor levels 5, 5, and 7.
- Use a 1.15 upgrade-cost growth rate, 1.10 mine-yield growth, and 1.12 shared-stage capacity growth until the Step 19 economy simulation and playtesting refine them.
- Represent runtime gold, material quantities, yields, and costs through `GameNumber`; keep abbreviated display formatting outside the arithmetic abstraction.
- Store only authoritative production data in core state; renderer, scene, animation, sprite, tween, and texture objects never enter serialized state.
- Advance foreground simulation in deterministic 100 ms ticks, carry sub-tick remainder in authoritative state, and credit at most 1,000 ms of simulation per update while consuming the full wall-clock delta.
- Calculate mine-shaft yield as base yield multiplied by the configured output-growth rate for each level above one and every cumulative milestone multiplier reached at the current level.
- Deposit completed extraction only into the producing floor's material queue and total-extracted counter; spendable gold changes only after later transport and warehouse stages.
- Treat non-negative `roundRobinCursor` as the downward target floor and negative `-(index + 1)` as the upward origin floor; zero with no waiting/carried material is surface idle.
- Remove material from a floor and increment its transported total only when the cabin arrives; visit each unlocked floor while capacity remains, slow travel as load rises, and deliver carried material only at the surface without changing gold directly.
- During every fixed tick, advance every unlocked floor's extraction first, then the shared elevator, then the shared warehouse; newly produced and delivered material is eligible for the next stage in that same tick.
- Convert warehouse material to gold at a 1:1 ratio only on a completed configured cycle; leave excess input queued for later cycles and reset progress when no input remains.
- Keep locked floors fully inert while all unlocked production stages run automatically without managers or player taps.
- Treat production rates as derived read-only values: expose every floor's theoretical rate, sum only unlocked floors for the mine estimate, and cap that estimate at the slower shared-stage throughput.
- Calculate an upgrade's next price from the stage's current level without rounding; expected player-action failures return the original state, while invalid/non-incrementable levels are invariant errors.
- Recalculate each stage effect as `baseValue × outputGrowthRate^(level - 1) × cumulativeMilestoneMultiplier`; shared-stage cycle durations remain fixed.
- Derive milestone effects from the current level rather than storing grant state, so each threshold activates once and reloads cannot apply it twice.
- Unlock floors 2–4 only in sequence after the immediately previous unlocked mine shaft reaches levels 5, 5, and 7 respectively and the configured 250/1,500/7,500 gold cost can be paid.
- Initialize a successfully opened floor at its configured starting level with zero progress, queues, and totals; preserve unrelated floors, shared stages, and simulation metadata.
- Format every displayed amount through one shared two-decimal function, so a value never reads one way in the HUD and another in the mine.
- Truncate a displayed balance rather than rounding it: a number that reads higher than it is promises a purchase the player cannot make.
- Read a magnitude through `GameNumber`'s own mantissa and exponent, never through `Number`, which collapses everything past its range to the same value.
- Estimate income from the core's bottleneck-capped effective rate, never from aggregate extraction and never from what the renderer observed.
- Price every control through the same core function the command charges, so the shown and charged figures cannot drift.
- Let a control drawn unaffordable still be pressable and let the core answer: the view must not decide a purchase, and a silent press is worse than a refusal the player can read.
- Advance the simulation to the current time before applying a command, so the player spends the gold the mine has now rather than the gold the last frame showed.
- Persist a command's result explicitly; a purchase completes no tick, and a save that follows only ticks would lose it.
- Time press feedback on the presentation clock, never the cosmetic one, so animation speed cannot change how long a message is readable.
- Publish an interactive element's screen-space rectangle, converted through the camera that draws it, so browser tests press the real control.
- Bulk purchases remain deferred; mine scroll input arrives in Step 31.
- Use the Step 19 automated policy only as a reproducible balance-analysis harness; it does not issue player-runtime purchases or replace later playtesting.
- Persist every `GameNumber` as a finite decimal/scientific string, validate exact version-1 structure and authoritative invariants before deserialization, and keep migration dispatch separate from IndexedDB storage.
- Store one active document under the fixed `active` key, debounce routine writes by 500 ms, force the newest snapshot on supported lifecycle events, and surface storage failures without terminating the running session.
- Treat unsupported schema versions separately from malformed current-version saves, preserve a cloneable invalid payload in the recovery warning, and initialize a fully fresh state at the caller-provided current timestamp.
- Configure offline income as a 7,200,000 ms cap at 0.5 efficiency, calculate from the saved effective-rate snapshot, keep a positive reward outside spendable gold until the player claims it, and settle consumed time before exposing that reward.
- Consume pending rewards through one pure claim result, reuse the same in-memory claim candidate across save retries, and dismiss the modal only after the claimed authoritative snapshot is force-persisted.
- Keep the logical viewport a fixed 360×640 and make responsiveness a scaling concern: `FIT` plus `CENTER_BOTH` letterboxes instead of cropping, so later render steps keep addressing stable logical coordinates.
- Apply host safe-area insets exactly once, as CSS padding on `#app` around the `#game-viewport` Phaser parent, never inside the canvas.
- Keep layout geometry pure and Phaser-free so it is unit-testable in Node; the scene only positions objects and publishes canvas dataset diagnostics for browser assertions.
- Clip the scrollable mine with a dedicated camera viewport rather than a geometry mask, because Phaser 4 removed WebGL geometry masks; Step 31 will drive only that camera's scroll.
- Render no bottom navigation and reserve no space for it; the mine region runs to the bottom edge.
- Treat canvas dataset diagnostics as geometry reporting only, never as renderer evidence; every rendering guarantee needs a pixel probe sampling the shared palette.
- Keep colors in the pure layout palette rather than private scene constants, so browser tests assert the same values the scene draws.
- Derive every on-screen string, ratio, and discrete step in a pure view model, and let Phaser entities only position and paint what that model already decided.
- Give each view an `applySnapshot` rebinding method and a `describeRenderedState` read-back, so views hold no authoritative state and browser tests compare rendered output rather than scene intentions.
- Draw locked floors with their own panel colour and badge instead of an alpha dim, so a pixel probe can prove the distinction.
- Keep Step 26 controls presentational: costs, affordability, commands, and feedback belong to Steps 29 and 30.
- Republish the rendered-state diagnostic on every rebind, never only at boot: a diagnostic frozen at the first frame reports success for a rendering path that has since broken.
- Hold structural render invariants in the pure view model (`assertRenderableMineViewModel`) so they are unit-testable in Node, and throw on violation rather than skipping the affected view.
- Derive every view's internal geometry from the `LayoutRegion` it is given; a hardcoded dimension beside region-relative neighbours drifts apart the moment the region changes.
- Let browser tests import the read-back types from the views themselves, never restate them, so the diagnostic contract cannot drift unnoticed.
- Never report a constant through the rendered-state read-back; report a bound value instead, so the assertion can actually fail.
- Derive test expectations that depend on balance data through the same pure function the code uses, and keep hardcoded values only for fixture-owned amounts.
- Let the renderer pull snapshots from a driver each frame; never let a frame delta, frame rate, or animation speed reach the core. Production is a function of injected wall-clock time alone.
- Treat a frozen host clock as a paused mine that still renders, and a backwards clock as crediting nothing until real time catches up.
- Treat a gap in the render loop as elapsed time to be simulated, never as one oversized frame: walk it in credited-size slices, bound the walk so resuming cannot freeze the tab, and consume the timestamp in full whether or not the time was credited.
- Drive every stage indicator from authoritative progress and every decoration from a separate validated cosmetic clock, gated on whether the stage holds material.
- Render queue state wherever material accumulates, measured against the capacity of the stage that removes it, without hiding or rescaling fixed environmental decoration.
- Never report a bottleneck a stage cannot observe from its own state.
- Guard a one-time claim with a consumed-once flag rather than a cached state candidate once the world keeps changing behind the modal.
- Publish read-back diagnostics on a 100 ms cadence rather than every frame, and keep the forced publish at boot and on external binds.
- Never sample a pixel probe on the strength of a dataset diagnostic alone: diagnostics are published inside `create`, before a frame exists, so wait for an always-painted point first.
- Treat every purchase as one control kind: a second thing to buy reuses the button, the command sink, the feedback, and the diagnostic rather than duplicating them.
- Enable a control from everything its purchase needs, never from the price alone, and carry any second requirement beside the button as its own coloured line.
- Give a panel slot exactly one live control, and assert it in the pure view model so two overlapping buttons fail before the scene draws them.
- Name only the refusals a player can act on; every other core failure reads as unavailable.
- Expire a press-result map on its own terms rather than through the controls still on screen, because a purchase can remove the control it was made on.
- Let a completed change be its own confirmation: a floor that visibly opens says more than a message on a button the same frame removes.
- Wait for a browser press to be observed rather than assuming a settling time, and grant the paused-clock game loop one step before pressing anything at all.
- Review of the Step 30 implementation found no defect, but one untested path: the shaft-upgrade control on a floor that was just opened occupies the exact rectangle the unlock control had, and nothing pressed it. Sharing one slot rests on Phaser skipping invisible objects when hit-testing, so the behaviour was pinned by a test rather than left to that mechanism: the browser test now asserts the two controls report the same screen rectangle, that the opened shaft is affordable, and that a press there buys a shaft level.
- Mutation-verified: offsetting the unlock control out of the shared slot fails the new bounds assertion by name, and routing an upgrade press to the unlock handler fails with the press never reaching the scene.
- Three review cleanups with no behaviour change. `createPurchaseControlViewModel` became `createUpgradeControlViewModel`, because the generically named factory only ever produced the `Upgrade` caption while its sibling was specific. `RenderedFloorState.isUnlockRequirementUnmet` became `isUnlockRequirementMet`, so the read-back and the view model state the flag in one sense; the two browser assertions that read it prove the met and unmet colours still differ. The feedback-map expiry comment no longer implies an unbounded map: it is keyed by control and bounded either way, and the reason to expire it directly is that collection should not depend on what is currently on screen.
- Mutation-verified: inverting the requirement colour fails the polarity assertion by name.
- The user validated Step 30 and authorized Step 31 on 2026-08-30.
- Added a pure mine scroll and gesture model (`src/game/view-model/mineScroll.ts`): travel clamped to the content that does not fit, one-pixel-per-pixel dragging from the press anchor, wheel scrolling accepted only over the mine, and a six-pixel threshold separating a tap from a scroll.
- `BootScene` binds scene-wide pointer and wheel handlers rather than a draggable object, because the mine is dragged from anywhere over it including its own buttons, and applies the resulting `scrollY` to the mine camera alone. Phaser hit-tests through that same camera and honours both its scroll and each object's camera filter, so the controls' pressable rectangles follow the scrolled content with no extra bookkeeping.
- The surface strip grew from 140 to 164 logical pixels so each stage panel can end in a 44-pixel upgrade control; mine floor controls grew from 92×32 to 92×44. `MIN_TOUCH_TARGET_PX` and `assertTouchTargetRegion` live in the pure layout module and every `PurchaseControlView` asserts its own region at construction, so an undersized button throws on the frame it is built. Eight mine pixel probes in three existing browser specs moved down by the 24 pixels the strip gained.
- `#game-viewport canvas` sets `touch-action: none`: Phaser's touch listeners are non-passive and do call `preventDefault`, but a browser that has already started panning the page cannot have the gesture taken back.
- `PublishedPurchaseControl` gained `isPressable`. A floor control scrolled out of the mine viewport is clipped away and hit-tested by no camera, so its published rectangle would otherwise invite a press that lands on whatever took its place.
- Step 31 automated evidence: two hundred seventy-three unit tests and twenty-six Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Twenty new unit tests cover the scroll range and its rejections, one-to-one dragging, clamping at both ends, the threshold in both directions, a pointer that wanders outside the mine mid-drag, a swipe that began on a fixed layer, a second finger that did not start the gesture, tap suppression surviving the release and clearing on the next press, suppression after a swipe that could not scroll, wheel clamping and region gating, and the read-back. Six new layout tests cover region containment and the touch-target minimum.
- Step 31 browser flow: seven Playwright tests at a 390×844 phone viewport, on a clock pinned so no gold is produced and every observed change came from a gesture. A drag scrolls the mine to its clamped maximum and back to zero; the HUD pixel is unchanged, the bottom of the mine comes into view as a pixel change from panel to mine background, floor controls move by exactly the scroll distance and the shared stages do not move at all. A drag started on an affordable button scrolls the mine and leaves gold, levels, and even the control's own feedback untouched. A swipe from the surface strip that lifts on a floor's button buys nothing. A tap buys before scrolling, and after scrolling to the bottom a press buys from floor 4's control, which reported `isPressable: false` before the scroll and true after. A press that wobbles by less than the threshold still buys and scrolls nothing. The wheel is refused over the HUD and clamps at both ends over the mine. Every published control measures at least 44×44 and the canvas owns its touch gestures.
- Step 31 mutation verification: nine mutations fail with named assertions — dropping the tap suppression (`a scroll must not spend gold`), publishing bounds that ignore the camera scroll (`a floor control moves with the content it is drawn on`, plus the reveal assertion), a zero drag threshold (`a wobbling tap must still buy one level` and two unit tests), a camera that never follows the scroll state (`the bottom of the mine must come into view`), a wheel that ignores the mine region (`a wheel over the HUD must not scroll the mine`), `isPressable` reduced to visibility (`the deepest floor starts below the mine viewport`), a 20-pixel shared-stage control (the boot-time touch-target assertion), removing `touch-action` (`the canvas must own its touch gestures`), and suppressing a tap only for gestures that began over the mine (`a swipe must not spend gold`).
- Review of the first Step 31 implementation found one defect: only a press that began over the mine was tracked, so a swipe that started on the surface strip and lifted on a floor's button still bought a level — an accidental purchase from a gesture, which is exactly what the step forbids. Every press is now tracked; whether it scrolls and whether it stays a tap became two separate questions. A browser test drives that swipe, and the mutation above pins it.
- A Step 31 test defect worth recording: the browser fixture routes `/src/main.ts` to its own module, which does not import `src/style.css` unless it says so. A `touch-action` assertion therefore read `auto` against a stylesheet that had never loaded. The fixture now imports the stylesheet, which also boots it closer to the real application.
- Step 32 implemented an original clean-HD cartoon placeholder family through the `create-game-assets`, `generate2dsprite`, and built-in image-generation workflows. Nine generated 128×128 RGBA sprites distinguish the cat miner, elevator, warehouse, gold pile, padlock, upgrade arrow, gold coin, mine cart, and ore crate; their prompt, raw source, processed sheet, QC metadata, art-direction brief, and provenance manifest are retained in the repository.
- `BootScene.preload` now loads the semantic placeholder manifest before any view is constructed. `HudView`, `MineFloorView`, `SharedStageView`, and `PurchaseControlView` use the generated family while English labels, values, progress bars, touch hit areas, affordability, and feedback remain code-native.
- The palette now matches the generated navy/steel-blue/teal/warm-gold family. Ordinary queued gold retains its illustrated sprite, while a backed-up pile or crate swaps to a red silhouette generated once at boot from the same artwork; generated art remains cosmetic and never enters authoritative state.
- Step 32 visual review passed at an exact 360×640 viewport and a reduced 320×568 phone viewport with all required objects distinguishable and no browser warnings or errors. Strict sprite QC reports 128×128 RGBA output with usable alpha; two visually complete source-cell contacts were explicitly accepted while output-edge contact and paste clamping remain absent.
- Step 32 automated evidence: 278 unit tests and 27 Chromium E2E tests pass, including provenance/dimension checks for every runtime asset and real framebuffer probes updated to prove generated gold and backlog silhouettes render under both the WebGL and the Canvas renderer. Lint, strict production build, and asset alpha/size reporting pass.
- A code review of the Step 32 change corrected six defects before the gate: the backlog cue was a WebGL-only fill tint and vanished on a Canvas fallback, so it is now a boot-generated recoloured texture; `describeRenderedState` had started echoing cached snapshot fields, so pile size and backlog state are measured back off the drawn sprite again; the stacked purchase control overlapped its icon with its action label; `PurchaseControlView.#render` called the unguarded `setTexture` every frame; a second finger stole a live scroll gesture and froze the mine mid-drag; and foreground progress was persisted only by a purchase or a lifecycle flush, so a 30-second save heartbeat now covers a webview killed without `pagehide`.

## Step 32A — approved layout and first animation asset pack

- Implemented the approved `art-source/spritecook-review/layout-proposal/layout1.png`
  composition inside Step 32. The shaft is 48 px wide, each floor is 288×132,
  mine content was initially 572 px tall with 168 px maximum scroll; HUD, surface, and
  mine viewport geometry remain unchanged.
- Added pure `mineFloorPanel.ts` geometry for the timer/title area, receiving
  container, unloading cat, miner patrol corridor, gold pile, far-right level
  control, and extraction track. Renderer and browser probes share this contract.
- Added the first generated pack under `public/assets/step-32a/`: cave background,
  gold container, gold pile, shaft frame, cabin, 4-frame miner walk, 4-frame
  unloader idle, and 4-frame cargo-cat idle. Sources, rejected first passes,
  prompts, deterministic outputs, GIFs, QC, and provenance remain under
  `art-source/step-32a-asset-pack/` and the public pack manifest.
- The miner walks right through its floor corridor, flips horizontally, and
  returns left on a 3.2-second cosmetic loop. The unloading cat stays at the
  floor head beside its own empty container. The cabin follows authoritative
  elevator progress while its cargo cat animates only cosmetically.
- Strict QC reports zero empty frames, output-edge contacts, and paste clamps.
  The first miner/unloader sheets failed the feet-anchor gate and were regenerated;
  accepted anchor-Y standard deviations are 0.0449, 0.0424, and 0.0299.
- Gameplay state, text, controls, and purchase behavior remain code-native. The
  pack is awaiting user visual validation and is not yet marked final production art.
- Applied the six Step 32A annotation fixes on 2026-08-31: floor extraction bars
  and duplicate `Floor N` headings are hidden; miner travel now follows
  authoritative extraction progress while walk frames stay cosmetic; queued
  gold reads as coin icon plus amount; the gold pile stays gold and is centred
  under the timber support; open-floor controls use a compact 44×50 `Level N`
  badge; and floors two onward crop the ceiling seam to half thickness while
  floor one and the surface remain unchanged. All 288 unit and 27 Chromium E2E
  tests, lint, and the production build pass. Step 33 remains blocked.
- Follow-up annotations further reduced the level control to its minimum
  thumb-safe footprint, raised the gold pile clear of the floor seam, and
  extended miner travel from the unloading cat to the pile before turning.
- A second annotation pass gives the offline-reward modal a two-decimal,
  stable-`k` formatter (`1213.12k`), restores a number-only floor badge without restoring
  `Floor N`, aligns the queue coin and amount on one baseline, and replaces the
  coarse pile with a new layout1-referenced 128×128 RGBA sprite. The visible
  level badge is now 30×34 with resolution-2 text inside an unchanged 44×50
  hit target. The revised pile passed strict sprite QC and native-scale browser
  inspection. All 290 unit and 27 Chromium E2E tests pass; Step 33 remains
  blocked pending user validation.
- The latest elevator annotations remove duplicate floor-number plaques from
  the shaft and replace instant round-robin pickup with a physical route. The
  cabin starts at the surface, stops at each unlocked floor in order, loads its
  remaining capacity on arrival, continues downward while room remains, then
  returns when full or after the deepest floor. Load increases leg duration up
  to 75% at full capacity; the cabin and cargo cat follow the same authoritative
  direction, floor, and progress. Save format version 1 is retained by encoding
  descent with non-negative legacy `roundRobinCursor` values and ascent with
  negative values. All 292 unit tests, 27 Chromium E2E tests, lint, and the
  production build pass. Step 33 remains blocked pending user validation.
- The latest visual alignment pass moves every cabin stop from the generic
  floor-slot centre to the semantic centre of that floor's gold container. The
  shaft remains 48 px wide while the cabin grows from 36 to 46 px and its cargo
  cat from 25 to 32 px, using the existing 128 px sources at a sharper readable
  scale. The number-only floor badge grows about 30%, from 26×26 with 16 px text
  to 34×34 with 21 px text, while its centre remains fixed and the separate
  `Level N` control remains unchanged. Unit geometry pins these values and
  direct browser inspection confirms the cabin/cart alignment without overlap.
  All 292 unit tests and 28 Chromium E2E tests pass with lint and production
  build. Step 33 remains blocked pending user validation.
- The latest annotation follow-up scales the number-only floor badge to exactly
  60% of its prior reviewed size: 20.4×20.4 with 12.6 px text, centred on the
  same anchor. The 30×34 visible `Level N` chrome moves 5 px right inside its
  unchanged 44×50 hit target, preserving touch safety. The browser view, all
  292 unit tests, all 28 Chromium E2E tests, lint, and the production build
  pass. Step 33 remains blocked pending user validation.
- The newest elevator/cart review adds three generated runtime assets: a
  256×256 cabin v2 with a wider interior, a larger four-frame cargo-cat v2,
  and a 256×256 gold-filled cart state. The shaft grows to 64 px, the cabin to
  62 px, and the cargo cat to 50 px while the approved floor stays 288×132.
  A pure smootherstep mapping eases the cabin into and out of every stop without
  changing authoritative route timing or production. Any positive floor queue
  switches its receiving cart from empty to filled. The number-only floor badge
  is now half of the annotated 34 px size (17×17 with 10.5 px text). Strict
  asset QC, direct browser inspection, 294 unit tests, 28 Chromium E2E tests,
  lint, and the production build pass. Step 33 remains blocked.
- The newest typography/character-scale review self-hosts Fredoka 600 and 700,
  waits for both weights before constructing the Phaser canvas, and uses only
  SemiBold/Bold game text. The redundant `Gold` and `Income /s` captions are
  empty while their icons and live values remain. Both floor-character sprite
  frames now draw at 75 px; their roughly 59% occupied frame height matches the
  50 px elevator cat's roughly 88% occupied height. Direct review at 434×934,
  296 unit tests, 28 Chromium E2E tests, lint, and build pass. Step 33 remains
  blocked.
- The surface-elevator review adds a generated 512×512 transparent headhouse
  with a visible gold hopper and a segmented right-side discharge chute. The
  cabin route now continues above the mine boundary to a fixed stop at
  `(55, 118)` inside the tower bay. A presentation-only fixed-layer twin fades
  across the camera seam; authoritative timing, load behavior, and save schema
  remain unchanged. The legacy elevator card and `Surface operations` caption
  are no longer drawn over the tower; tapping the tower retains the elevator
  upgrade action. Abbreviated whole tiers now keep one decimal (`2.0M`) across
  HUD, floor, stage, and price labels. All 296 unit tests and 29 Chromium E2E
  tests pass with lint and build. Step 33 remains blocked.
- The latest floor-continuity review decouples the far-right gold mound from
  queue fullness: every unlocked floor always draws the approved mound at a
  fixed 52×52 display size, while only the left receiving cart swaps between
  empty and filled states. `materialPileSteps` remains an authoritative
  diagnostic and no longer scales or hides the environmental art. Floor-slot
  gap is now zero, so four 288×132 slots plus 10 px top/bottom padding produce
  548 px of mine content and 144 px maximum scroll. Direct canvas inspection,
  296 unit tests, 29 Chromium E2E tests, lint, and build pass. Step 33 remains
  blocked.
- The latest surface-warehouse review replaces the remaining warehouse card
  with an original 512×512 open loading depot and a strict four-frame warehouse
  supervisor idle sheet. The building is the warehouse upgrade target; its
  hidden `SharedStageView` remains the authoritative read-back/purchase model.
  The supervisor is presentation-only and does not introduce the deferred
  gameplay Manager system. Because the elevator tower includes a right-side
  chute, its semantic cabin bay is left of the texture's full-image centre; the
  surface stop moves from `(55, 118)` to `(48, 118)` to align with that bay.
  Direct canvas inspection, 298 unit tests, all 29 Chromium E2E tests, lint,
  build, and diff checks pass.
- The newest alignment review removes the final diagonal surface movement.
  Cabin X is now the shared shaft axis `36` for every underground and surface
  pose; the tower moves 12 px left so its bay, rather than its asymmetric
  texture centre, sits on that same axis. The warehouse display shrinks from
  164×158 to 140×140, is flush with the right edge at x=360, and its 56 px
  supervisor is mirrored to look left toward the production flow. Direct
  browser review, 298 unit tests, all 29 Chromium E2E tests, lint, and build
  pass. Save/database schema version 1 is unchanged.
- The shared-stage upgrade affordance review adds explicit compact `Level N`
  badges to both surface assets. Warehouse chrome is centred above the roof;
  elevator chrome sits immediately right of the discharge tray, level with or
  slightly above it. Each keeps 30×34 visible chrome inside a 44×50 touch
  region and routes through the existing elevator/warehouse purchase command.
  Elevator tower v2 adds a steel-blue mounting bracket for that badge without
  baking functional text into the raster. Direct mobile-browser review, strict
  asset QC, 299 unit tests, all 29 Chromium E2E tests, lint, and build pass.
  Save/database schema version 1 remains unchanged.
- The surface-delivery annotation follow-up moves the elevator level hit region
  from `(124,58,44,50)` to `(106,53,44,50)`, placing its 30×34 visible chrome
  immediately beside the discharge outlet and slightly above the tray bottom.
  Two new strict four-frame sheets add a right-facing worker cat and a vertical
  gold-pour effect. A presentation-only 5.2-second loop parks an empty cart at
  x=112 beneath the chute, shows the pour only while shared-stage material is
  available, eases the filled cart toward the warehouse at x=220, unloads, and
  returns empty with the cat mirrored. The loop reads snapshot state but never
  writes production, gold, save data, or schema. Direct browser review, 304
  unit tests, the targeted Chromium regression, lint, build, and diff checks
  pass; all 30 Chromium E2E tests pass.
- The latest surface polish locks both empty and filled delivery-cart textures
  to the same 46×46 display box after every runtime texture swap, fixing the
  128 px empty source and 256 px filled source from visibly changing scale.
  The elevator badge moves another 5 px up to `(106,48,44,50)`. A new original
  720×328 blue-sky landscape plate renders at 360×164 behind the tower,
  delivery route, and warehouse while the existing ground strip stays in
  front. Native browser review confirms the empty/filled cart size, sky
  composition, and raised badge. The landscape passes exact-size raster QA;
  304 unit tests, all 30 Chromium E2E tests, lint, build, and diff checks pass.
  Save/database schema version 1 remains unchanged and Step 33 stays blocked.
- The latest warehouse-hauler crew pass keeps one lead cat at every level and
  reveals one pooled assistant at warehouse levels `10/20/.../100`, producing
  2/3/.../11 visible cats. Ten assistants reuse the current strict hauler sheet,
  vary their cosmetic frames, and follow the same cart in two shallow mirrored
  rows so they do not stack exactly. Count and formation remain pure view-model
  logic; throughput, economy, authoritative/save state, IndexedDB schema
  version 1, and the Step 33 gate are unchanged. All 307 unit tests and 31
  Chromium E2E tests pass.
- The latest motion/notation pass replaces the assistant formation's copied
  lead transform with evenly phase-shifted route poses. At Warehouse level 10,
  live canvas diagnostics show the lead at x≈85 facing right while its assistant
  is near x≈256 facing left, with separate frames and a 10 px lane offset. The
  shared amount-tier resolver now uses lowercase `k/m/b/t/qa/qi/sx/sp/oc/no/dc`
  and starts `aa` at `10^36`; the offline reward overlay shares the same tiers
  while retaining its two-decimal precision. Economy, save schema version 1,
  and Step 33 remain unchanged. All 309 unit tests and 31 Chromium E2E tests
  pass.
- The latest HUD/crew annotation pass gives every visible surface transport
  cat its own pooled 46×46 cart bound to that cat's independent route pose.
  The centre HUD slot now shows authoritative `elevator.carriedMaterial` with
  an elevator icon, while the shared formatter retains two decimal places on
  main-screen non-integer and abbreviated values (`3.40m`, `203.40`). Core
  throughput, economy, save document version 1, IndexedDB schema version 1,
  and the Step 33 gate remain unchanged.
- The latest mine-floor crew annotation pass gives every unlocked floor one
  base miner and adds one pooled assistant at levels 50/100/150/200, producing
  1/2/3/4/5 visible miners and holding five above level 200. Assistants share
  authoritative extraction progress but use separate patrol phases, shallow
  lanes, facings, and cosmetic frames. The rule is identical for all four
  floor views and remains presentation-only: extraction throughput, economy,
  save document version 1, IndexedDB schema version 1, and the Step 33 gate are
  unchanged. All 313 unit tests and 32 Chromium E2E tests pass with lint and
  production build.
- The user validated Step 32/32A and authorized Step 33 on 2026-09-02.
- Step 33 added `tests/e2e/player-journey.spec.ts`, which runs the same real-UI
  journey twice in separate clean browser contexts. Each run earns gold through
  controlled wall-clock progression, buys mine-shaft/elevator/warehouse levels,
  opens floors 2 and 3, reaches a level-10 milestone, persists the newest state,
  reloads, claims a one-hour offline reward, reloads again, and proves the
  interval cannot be claimed twice. Both runs must match the policy-derived
  version-1 documents exactly and emit no console or page errors.
- Step 33 exposed a long-run precision defect: repeated fractional elevator
  pickups could accumulate `totalTransported` one final digit above
  `totalExtracted` (about `1e-10` after six minutes), causing a legitimate save
  to fail validation. Elevator pickup now clamps the accumulated transport total
  to its authoritative extracted upper bound, and a ten-minute regression keeps
  the full economy progression saveable.
- Step 33 automated evidence: 314 unit tests, 33 Chromium E2E tests, lint,
  production build, and `git diff --check` pass. Step 34 remains untouched.
- The user authorized Step 34 on 2026-09-02 and explicitly required work to
  stop before Step 35.
- Step 34 now advances authoritative state to the lifecycle event's injected
  wall-clock boundary before creating the hidden/pagehide document. This closes
  a gap where `savedAtTimestampMs` could consume the final foreground interval
  without simulating it or leaving it eligible for offline income.
- Added a validated synchronous lifecycle journal at localStorage key
  `cat-mine-idle:lifecycle-save-v1`. IndexedDB remains authoritative; the
  journal only protects a pagehide write from document teardown, is selected
  only when it is a newer valid version-1 document, and is cleared after the
  same-or-newer snapshot reaches IndexedDB.
- Added `tests/e2e/lifecycle-persistence.spec.ts`: one controlled-clock scenario
  proves hidden/visible play matches an uninterrupted 50-second session exactly;
  another performs real abrupt navigation, recovers the journal, settles the
  30-second offline interval before presenting it, claims once, and reloads
  without duplication or browser errors.
- Step 34 automated evidence: 318 unit tests, 35 Chromium E2E tests, lint,
  strict production build, and `git diff --check` pass. Save document and
  IndexedDB schema versions remain 1.
- The user validated Step 34 and authorized Step 35 on 2026-09-03, explicitly
  requiring work to stop before Step 36.
- Step 35 adds an optimized-build Google Chrome benchmark using a Pixel 5
  profile, Android 11 user agent, 393×727 viewport, DPR 2.75, and 4× CPU
  throttling. Benchmark-only object/floor/input diagnostics are statically
  removed from ordinary production builds.
- A first Step 35 implementation published the scene-graph size once from
  `create` and read it back after ten minutes, reporting it as constant. That
  was a boot-time value re-read from a static attribute, not a trend, so the
  object-count metric could not have detected growth at all. The scene now
  republishes its live object count and unlocked-floor count twice a second
  behind the profiling flag, the benchmark samples both alongside every heap
  sample, and it asserts the sampled minimum equals the maximum.
- The benchmark now also asserts four unlocked floors before sampling and again
  at the end. A seeded save that failed validation would recover into a fresh
  single-floor state, and every budget would otherwise pass while profiling the
  wrong mine.
- The required ten-minute all-four-floor run passed with 8.33 ms mean, 9.2 ms
  p95, 9.3 ms p99, and 16.0 ms maximum frame time across 72,188 frames, with no
  frame above 33.34 ms. The host presented at 120 Hz, so the sampler's raw
  120.01 FPS figure reports presentation cadence, not a game ceiling; the
  meaningful result is roughly two times headroom against the 16.67 ms budget
  the 60 FPS target implies. An earlier run of the same benchmark at 60 Hz
  measured 16.67 ms mean / 17.8 ms maximum, the same conclusion.
- Post-GC live heap changed by 155,360 bytes with a -502 bytes/s post-warm-up
  slope. Phaser objects held at 258 across all twenty samples, unlocked floors
  at 4, DOM nodes at 176, listeners at 160, and scroll response measured
  50.1 ms p95 / 52.5 ms maximum.
- The optimized output measured 3,887,708 bytes total, including 2,200,266
  image bytes and 95,720 font bytes; first-load resource transfer accounting
  was 2,343,440 bytes. Startup reached the booted scene in 819 ms. The main JS
  chunk remains 1,557,900 bytes raw (about 414 kB gzip) and is recorded as a
  future startup/code-splitting observation rather than an active frame-time
  bottleneck.
- No Android/ADB target was connected, so this is reproducible Pixel 5
  emulation in desktop Chrome, not physical mid-range Android evidence. The
  physical-device pass remains the user-validation caveat. Repeated miners,
  haulers, carts, and effects were already pooled and the sampled object count
  never moved, so no speculative runtime rewrite was justified by the profile.
  The one per-frame allocation left by design is `catchUpSimulation` returning
  a new immutable state each frame; the negative heap slope shows the collector
  absorbs it, and removing it would cost the core its determinism.
- Step 35 verification also passes 318 unit tests, all 35 Chromium E2E tests,
  lint, the ordinary production build with profiler hooks absent, and
  `git diff --check`. Save document and IndexedDB schema versions remain 1.

- The user validated Step 35 and authorized Step 36 on 2026-09-03, explicitly
  requiring work to stop before Step 37. The outstanding physical mid-range
  Android pass stays recorded as a caveat rather than a blocking gate.
- Step 36 adds `vite.config.ts`, which declares the `/` deployment base path.
  Vite already defaulted to it, but the runtime requests every texture through
  absolute `/assets/...` paths that no bundler rewrites, so a prefixed base
  would emit the bundle under the prefix while the loader kept asking the root.
  The base is a deployment contract and is now written down and asserted.
- Added `playwright.production.config.ts` and
  `tests/production/production-smoke.spec.ts`: nine tests that build `dist/`,
  serve it through `vite preview` at `127.0.0.1:4175`, and verify the served
  bundle rather than the development server.
- The smoke suite pins all four Step 36 concerns. Asset loading: every path in
  `PLACEHOLDER_ASSETS` and `PLACEHOLDER_ANIMATION_ASSETS` plus both self-hosted
  Fredoka weights return success, no request fails, and no response is 4xx/5xx.
  Save behavior: a controlled 40-second session flushed at a `visibilitychange`
  boundary must equal the document derived in the test process, a reload at the
  same instant must re-settle that identical document, and a further 20 seconds
  must continue from the deserialized saved state. Error handling: corrupt and
  unsupported payloads each recover into a playable fresh game with a visible
  notice and no uncaught error, and a browser whose `indexedDB.open` throws
  still boots and keeps rendering. Responsive layout: canvas and all three
  logical regions stay inside four representative viewports.
- The suite also proves it is testing the shipped artefact: every document
  entry resolves under `/assets/`, nothing is served from `/src/`, and the
  dev-only rendered-state read-backs and opt-in profiler attributes are absent.
  Because those diagnostics are stripped, the production evidence for actual
  rendering is a pixel probe of the canvas backing store rather than a dataset
  attribute.
- Two production-only test techniques were needed. The hashed entry cannot be
  rewritten the way the dev-server suites fulfil `/src/main.ts`, so the injected
  clock is installed through an init script that routes `Date.now` via
  `window.name`. And an invalid save is seeded during a navigation whose bundle
  is blocked, because a page that boots flushes a valid document over the
  fixture at its next lifecycle boundary before the recovery path can see it.
- Step 36 exposed a real gap rather than only confirming the build. Steps 21
  and 22 required a visible diagnostic and a recorded warning, the core produced
  both, and every unit test passed — but `src/main.ts` never passed
  `loadActiveGame`'s `onWarning` or the coordinator's `onDiagnostic`, so a
  player whose save was rejected silently restarted with no explanation. Added
  `src/ui/SaveDiagnosticBanner.ts`, a non-blocking dismissible notice shared by
  both callbacks, de-duplicated by code because a broken storage backend reports
  a failed write on every debounce. Removing the wiring fails exactly the three
  new error-handling tests, which was verified by mutation.
- Added `npm run test:prod` and `npm run verify`; the latter runs lint, unit
  tests, E2E tests, the production build, and the production smoke suite in the
  order Step 36 specifies.
- Step 36 automated evidence: 318 unit tests, 35 Chromium E2E tests, all nine
  production smoke tests, lint, the strict production build, and
  `git diff --check` pass. Save document and IndexedDB schema versions remain 1.

The newest tower-empty feedback is complete and recorded immediately: every surface delivery visual now reads only `warehouse.inputQueue` through `warehouse.queueSteps > 0`. Elevator cargo can no longer make the chute pour, a cart fill, or a hauler carry gold before the cabin actually delivers to the tower. A browser regression holds elevator cargo in transit while forcing the tower queue to zero and proves both sampled poses keep the empty tower/cart textures and hide the pour; the two focused surface-cart browser tests pass. Save document and IndexedDB schema versions remain 1.

The mine-floor popup feedback is also complete and recorded immediately. A Level badge now opens an accessible DOM detail dialog without purchasing; it shows current level, output/cycle, cycle time, waiting gold, next output, and x1/x5/MAX CTAs derived from exact core batch quotes. Batch purchases are atomic, preserve production state, persist once, and rebind the open dialog immediately. Phaser input is disabled while the popup is visible after regression testing exposed a close-button gesture reaching the warehouse underneath. Final evidence: lint, 327 unit tests, all 40 Chromium E2E flows, the strict production build, all nine optimized-bundle smoke tests, and `git diff --check` pass. Direct in-app browser review at `http://localhost:5174/` confirms the responsive popup, correct four attributes, x1/x5/MAX prices, an x5 transition from Level 1 to Level 6, an unchanged warehouse level (no click-through), and no console errors. Save document and IndexedDB schemas remain version 1; no database fields changed.

## Next Steps

The follow-up HUD clarification renames the centre field and rendered diagnostic to `warehouseQueueValueLabel` and replaces the elevator icon with the warehouse icon. The value remains sourced directly from authoritative `warehouse.inputQueue`; this is a semantic/UI correction only and does not change conversion timing, economy state, or save/database schema.

The 2026-09-07 browser-feedback revision is implemented: `HUD_HEIGHT` is 52, the centre HUD value reads `warehouse.inputQueue`, and balance/state/view construction now supports exactly fifteen floors. Floors 1–5 are visible initially; opening floor 5 expands the mine to floors 1–10, and opening floor 10 expands it to floors 1–15 without restarting the scene. The active scroll range resizes with each reveal while retaining the current scroll position. Save document and IndexedDB versions remain 1; legacy four-floor version-1 documents are expanded to the fifteen-floor shape before strict validation, preserving floors 1–4 and adding locked configured defaults. The game UI/UX skill guided the compact fixed-region and progressive-disclosure implementation without weakening safe-area scaling or touch targets. Automated evidence: 321 unit tests, 37 Chromium E2E tests, all nine production smoke tests, lint, build, and `git diff --check` pass; direct in-app browser inspection confirms the 52 px HUD, five initially visible floors, and no console errors.

1. Ask the user to review the three applied browser-feedback changes.
2. Do not begin Step 37 without explicit user authorization.
3. Keep the outstanding physical mid-range Android Chrome pass on the record as
   a Step 35 caveat to close before the milestone is called done.
4. Defer managers, boosts, gift drops, and other expanded features until the base-game milestone passes.
- Reviewed the Step 31 branch: lint, type-check, 274 unit tests, and 26 browser tests pass; three follow-ups were applied in place rather than deferred.
- Confirmed as deliberate that a backgrounded tab is credited at full pipeline rate while a closed one is credited through the 50% offline efficiency, so the same two-hour absence is worth about twice as much with the tab left open. Documented the asymmetry on `MAX_CATCH_UP_MS` and pinned the ratio in `tests/unit/simulation-time.test.ts`, verified by mutation to fail if either side changes.
- Extracted the `Text.setColor` repaint guard into a shared `setTextColor` helper and applied it to the mine-floor and shared-stage views, which were repainting fourteen captions per simulation tick to produce the colours already on screen.
- Recorded the measured worst-case catch-up cost — 72,000 ticks in roughly 50 ms with four floors open on a development machine — on `MAX_CATCH_UP_MS`, so a future change to the cap can weigh the resume hitch it buys.
- The analytic `calculateMineProductionRates` estimate remains route-agnostic. The live sequential elevator includes distance and weight, so deep-floor catch-up can fall below the saved offline-rate estimate; the simulation-time regression now checks broad safety bounds instead of the obsolete single-leg 2× ratio.

## Open Questions

- Validation and refinement of the provisional balance curve through Step 19 and playtesting.
- Whether `calculateMineProductionRates` should model sequential route distance and load-sensitive leg timing, or whether the estimate stays a route-agnostic upper bound used by the HUD and offline snapshot.
- Final art-production workflow and original visual identity.
- Target Telegram launch requirements beyond the prototype.
