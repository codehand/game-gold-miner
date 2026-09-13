# Architecture

## Current Status

All 37 implementation-plan steps are complete and user-validated; Step 37 was validated on 2026-09-08, closing the base-game milestone. Step 37 changed no runtime code: it added `README.md`, corrected documentation that still described a four-floor mine and a round-robin elevator, and repeated the mobile benchmark against the full fifteen-floor scene. The physical mid-range Android Chrome pass and a human 30-second-comprehension playtest remain open caveats rather than blocking gates. This document describes the delivered base game; it is the map any post-milestone work starts from. Save-document and IndexedDB schema versions remain 1; there is no relational or server database.

## Implemented Foundation

| Path | Responsibility |
|---|---|
| `index.html`, `src/main.ts`, `src/style.css` | Browser entry point, self-hosted Fredoka 600/700 loading before Phaser startup, `viewport-fit=cover` opt-in, safe-area-inset host padding around the `#game-viewport` Phaser parent, game startup, and hot-reload cleanup. |
| `src/game/layout/mineLayout.ts`, `src/game/layout/palette.ts`, `src/game/layout/index.ts` | Pure Phaser-free portrait geometry and palette: logical viewport constants, HUD/surface/mine regions, scrollable mine content height, floor-slot regions, diagnostic region serialization, and the `#rrggbb` colors both the scene and the browser pixel probes read. |
| `src/game/view-model/mineViewModel.ts`, `src/game/view-model/mineShaftUpgradeModal.ts`, `src/game/view-model/hudViewModel.ts`, `src/game/view-model/purchaseControl.ts`, `src/game/view-model/formatAmount.ts`, `src/game/view-model/stageAnimation.ts`, `src/game/view-model/index.ts` | Pure Phaser-free presentation logic. The snapshot view model derives per-floor heading, level, visibility, lock status, progress ratio and label, queued-amount label, discrete pile height and backlog state, plus each shared stage's level, capacity, held amount, queue blocks, running/backed-up status, and cycle progress, and carries both HUD and open-floor detail models. The floor-modal module derives output/cycle, cycle time, waiting material, next output, and x1/x5/MAX batch choices from authoritative state and core quotes. The HUD module derives icon-led spendable gold, the authoritative warehouse input queue from `warehouse.inputQueue`, and income values from authoritative state and the core's effective production rate, with empty duplicate captions. The purchase-control module derives each priced control's action caption, price, enabled state, command target, and stable key, plus the lifetime of a press result; it covers shared-stage upgrades, floor selection badges, and floor unlocks. The format module is the single abbreviated-amount formatter every displayed quantity goes through. The animation module holds the cosmetic clock maths and workforce rules. |
| `src/game/runtime/MineSimulationDriver.ts`, `src/game/runtime/index.ts` | Phaser-free live bridge between the core and the screen: holds authoritative state and the balance data prices and the HUD estimate are derived from, advances state to an injected wall clock on each pull, memoizes the derived snapshot, routes upgrade presses to the matching core command, and accepts state replaced by a command. |
| `src/game/entities/HudView.ts`, `src/game/entities/BottomNavigationView.ts`, `src/game/entities/MineFloorView.ts`, `src/game/entities/SharedStageView.ts`, `src/game/entities/PurchaseControlView.ts`, `src/game/entities/index.ts` | Reusable Phaser views that build their own game objects once, rebind through `applySnapshot`, move decoration through `applyAnimation`, show press results through `applyUpgradeFeedback` and `applyUnlockFeedback`, and report what they actually display through `describeRenderedState`. `MineFloorView` smooths each 100 ms authoritative extraction-progress target across rendered frames and settles at that target without changing core timing. `HudView` owns the fixed top bar. `BottomNavigationView` owns the fixed icon-only five-button shell, thumb-safe hit regions, and press animation; activation is presentation-only and changes no authoritative state. `PurchaseControlView` is the one pressable purchase button shared by floor panels and both shared stages. |
| `src/game/assets/placeholderAssets.ts` | Semantic Phaser texture keys, public paths, and native shaft-texture dimensions for the original Step 32 family plus the Step 32A floor, filled/empty elevator-tower, warehouse, and supervisor pack loaded by `BootScene.preload`. |
| `src/game/assets/backlogTextures.ts` | Generates the solid backlog-colour silhouette once at boot from the source sprite, so the cue survives a Canvas fallback that would drop a WebGL-only tint. |
| `src/game/entities/setTextColor.ts` | The shared guard that compares a Phaser text colour before writing it, because `Text.setColor` re-rasterizes and re-uploads the caption texture on every call. |
| `src/game/layout/mineFloorPanel.ts` | Pure semantic geometry for the approved 288×132 floor composition; renderer and browser probes share its anchors and regions. |
| `public/assets/placeholder/`, `art-source/placeholder/` | Runtime-ready 128×128 RGBA sprites plus their art-direction/provenance manifest, and retained generated source, prompt, transparent sheet, frames, GIF, and deterministic QC metadata. |
| `package.json`, `package-lock.json`, `tsconfig.json` | Locked dependencies, strict compiler settings, and verified development/build/test scripts including the `verify` sequence and the production smoke run. |
| `vite.config.ts` | Declares the `/` deployment base path the runtime's absolute `/assets/...` texture requests depend on. |
| `eslint.config.mjs` | Flat lint configuration for TypeScript, configuration files, and the Node simulator script. |
| `vitest.config.ts`, `tests/unit/` | Node-based unit-test configuration and scaffold baseline coverage. |
| `playwright.config.ts`, `tests/e2e/` | Chromium E2E configuration, automatic Vite test server, browser smoke coverage, the Step 33 two-profile deterministic player journey, and Step 34 lifecycle equivalence/abrupt-navigation coverage. |
| `playwright.production.config.ts`, `tests/production/production-smoke.spec.ts` | Step 36 optimized-bundle smoke suite: builds and serves `dist/` through `vite preview` at the root base path, then verifies asset loading, bundle identity, save/restore, save-recovery and storage-failure handling, and responsive layout outside the development server. |
| `playwright.performance.config.ts`, `tests/performance/mobile-performance.spec.ts`, `performance-results/` | Step 35 optimized-build Google Chrome benchmark, Pixel 5 mobile emulation plus 4× CPU throttling, constant-memory frame histogram, post-GC heap/DOM/listener sampling, live-sampled Phaser object and unlocked-floor counts, alternating scroll-latency probes, asset/startup measurement, budget assertions, and retained raw/human-readable reports. |
| `tests/unit/architecture.test.ts` | Regression coverage proving the core, layout, view-model, and simulation-driver boundaries accept pure TypeScript and reject renderer, adapter, and browser dependencies. |
| `scripts/dev-simulator.mjs` | iPhone Simulator preview workflow retained from Step 2. |
| `src/game/scenes/BootScene.ts` | Single scene that builds the fixed HUD layer, the shared surface layer with both stage views, and the mine content layer with fifteen pooled floor views revealed in groups of five; repeats the shaft artwork through a native-height `TileSprite` rather than stretching it across the full mine; keeps the elevator's top-of-shaft world endpoint independent of mine-camera scroll and maps its surface twin from that same physical route; pulls the newest snapshot from its source on every frame, binds the filled/empty tower, gold pour, every surface cart, and every loaded-hauler pose exclusively to the warehouse input queue, advances the separate cosmetic animation clock from the frame delta, clips the mine through a dedicated camera viewport, and records startup, renderer, layout, rendered-view, HUD, and animation diagnostics on the game canvas. |
| `src/config/balance.ts`, `src/config/types.ts`, `src/config/validateBalance.ts` | Provisional fifteen-floor/shared-stage data, its public types, and fail-fast startup validation. |
| `src/core/numbers/GameNumber.ts` | Immutable numeric boundary backed privately by break_infinity.js, with arithmetic, comparison, string serialization, and normalized `mantissa`/`exponent` parts for display code. |
| `src/core/state/GameState.ts`, `src/core/state/createInitialGameState.ts` | Renderer-free authoritative state contracts and deterministic fresh-state construction from validated balance data plus an explicit timestamp. |
| `src/core/economy/calculateProductionRates.ts` | Pure theoretical floor throughput, aggregate unlocked extraction, shared-stage throughput, effective mine-rate, and bottleneck calculations. |
| `src/core/economy/simulateEconomyProgression.ts` | Deterministic automated balance-analysis policy, action trace, and ten-minute progression report. |
| `src/core/offline-income/calculateOfflineIncome.ts` | Pure elapsed/credited-time calculation, saved-rate reward calculation, future-clock handling, and immutable load-timestamp settlement. |
| `src/core/offline-income/claimOfflineIncome.ts` | Pure positive-pending-reward creation and exact-once claim-state transition that adds gold without changing unrelated authoritative state. |
| `src/core/progression/calculateLevelEffect.ts` | Shared level-growth and cumulative milestone-effect calculation used by state creation, simulation, rates, and upgrades. |
| `src/core/progression/unlocks.ts` | Immutable sequential floor-unlock command with explicit prerequisite, affordability, duplicate, and missing-floor outcomes, plus `describeFloorUnlock`, which reports one locked floor's price, prerequisite, and both gates from the same predicate the command uses. |
| `src/core/progression/upgrades.ts` | Pure next-upgrade pricing plus immutable mine-shaft, elevator, and warehouse purchase commands that apply level-derived yield/capacity effects with explicit results. |
| `src/core/simulation/advanceSimulation.ts` | Immutable elapsed-time advancement through bounded 100 ms fixed ticks, authoritative remainder carry, and config-driven mine-floor extraction. |
| `src/core/simulation/catchUpSimulation.ts` | Bounded slice-by-slice advancement across a gap in the render loop, so a hidden tab is simulated rather than consumed. |
| `src/core/simulation/advanceElevator.ts` | Capacity-limited sequential floor route, load-sensitive leg timing, signed route description, and surface delivery to the warehouse input queue. |
| `src/core/simulation/advanceWarehouse.ts` | Timed capacity-limited warehouse conversion from input material into spendable and cumulative delivered gold. |
| `src/persistence/saveSchema.ts`, `src/persistence/index.ts` | Version-1 plain-JSON save schema, serializer, strict validator, migration dispatcher, runtime deserializer, and persistence exports. |
| `src/persistence/ActiveSaveRepository.ts` | Storage-agnostic interface for loading and replacing the one active save document. |
| `src/persistence/DexieActiveSaveRepository.ts` | Dexie 4.4.5 adapter for the version-1 `cat-mine-idle` IndexedDB database and fixed `active` record. |
| `src/persistence/SavePersistenceCoordinator.ts` | Debounced writes, forced flushing, retry retention, and non-throwing load/save diagnostics. |
| `src/persistence/loadActiveGame.ts` | Valid-save restoration plus typed malformed/incompatible-save recovery into a fresh state with a safe diagnostic payload snapshot. |
| `src/platform/web/bindSaveLifecycle.ts` | Browser `visibilitychange` and `pagehide` binding that queues the current document and forces a flush when supported. |
| `src/platform/web/WebLifecycleSaveJournal.ts` | Validated synchronous pagehide journal plus an active-save repository decorator that selects a newer valid lifecycle snapshot and clears it after IndexedDB catches up. |
| `src/platform/web/supabaseClient.ts` | Server-milestone Step 8: builds the browser's Supabase client from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, or returns `null` without attempting any network call when either is unset. |
| `src/platform/web/guestSession.ts` | Server-milestone Step 8: `ensureGuestSession` reuses an existing session or signs in anonymously through an injected `GuestAuthClient` collaborator, never throwing — every failure resolves to a typed `sign-in-failed`/`unconfigured` result instead. |
| `src/ui/OfflineRewardModal.ts`, `src/ui/MineShaftUpgradeModal.ts` | Accessible DOM overlays: offline reward claim/save/retry, and the live mine-floor detail with attributes plus x1/x5/MAX CTAs. The floor overlay blocks background Phaser input until dismissed and rebinds after each purchase. |
| `src/ui/SaveDiagnosticBanner.ts` | Non-blocking DOM notice that surfaces save-recovery warnings and persistence diagnostics, de-duplicated by code and dismissible. |

## Current File Responsibilities

| File | Purpose |
|---|---|
| `README.md` | Human-facing entry point: requirements, install, every npm command and its port, architecture summary, testing layout, documentation map, delivered versus deferred scope, and style. |
| `AGENTS.md` | Repository-wide contributor rules, coding conventions, test expectations, and mandatory Memory Bank workflow. |
| `memory-bank/architecture.md` | Architectural map, file/module responsibilities, dependency rules, critical data flow, and complete database schema when one exists. |
| `memory-bank/activeContext.md` | Current focus, recent decisions, immediate next steps, and unresolved questions. |
| `memory-bank/game-design-document.md` | Product mechanics, game loop, UI direction, MVP scope, and observed versus inferred behavior. |
| `memory-bank/implementation-plan.md` | Authoritative ordered implementation steps and validation gate for each step. |
| `memory-bank/productContext.md` | Product motivation, target player, intended experience, UX principles, and base-game boundary. |
| `memory-bank/progress.md` | Completed work, outstanding work, acceptance targets, risks, and current step status. |
| `memory-bank/projectbrief.md` | Highest-level project goal, requirements, exclusions, and source-of-truth pointers. |
| `memory-bank/systemPatterns.md` | Approved architectural patterns, runtime boundaries, core invariants, and performance approach. |
| `memory-bank/tech-stack.md` | Technology choices and the rationale for the web-first Phaser stack. |
| `memory-bank/techContext.md` | Verified repository state, pinned technologies, planned commands, constraints, security rules, and database-schema status. |

## Runtime Module Boundaries

| Path | Responsibility |
|---|---|
| `src/core/` | Owns renderer-independent numbers, authoritative state, fixed-step timing, the production pipeline, derived rates, upgrades, milestones, sequential unlocks, deterministic economy analysis, offline-income calculation, and pending-reward claim transitions. |
| `src/config/` | Owns typed data-driven starting values, unlocks, stage timing/capacity, upgrade curves, milestones, and validation. |
| `src/game/` | Owns the Phaser game configuration, semantic placeholder-asset manifest, pure portrait geometry, pure presentation models and cosmetic animation maths, live simulation driver, reusable HUD/floor/shared-stage/purchase views, generated-sprite presentation, interactive controls, scroll input, and the single scene that pulls snapshots into them. |
| `src/ui/` | Owns the offline-reward modal, live mine-floor upgrade modal, and save-diagnostic notice. The HUD remains a Phaser view. |
| `src/persistence/` | Owns the save-document boundary, storage interface, Dexie active-save adapter, debounce/failure coordinator, runtime deserialization, and recovery-aware active-game loading. |
| `src/platform/web/` | Owns the implemented save lifecycle binding and, since server-milestone Step 8, the Supabase client factory and anonymous guest-session bootstrap — the first `src/` code that makes a network call, never awaited before boot and never throwing. Broader browser lifecycle translation remains future work. |
| `public/assets/placeholder/` | Runtime original placeholder sprites, art-direction brief, and provenance manifest. Generated source and processor outputs live in `art-source/placeholder/` so production builds ship only the semantic runtime files. |
| `tests/unit/` | Deterministic core, economy, save, migration, and offline-income tests. |
| `tests/e2e/` | Browser-level player journeys, responsive layout, persistence, and production-bundle smoke tests. |

## Dependency Boundaries

- `src/core/` must not import Phaser, DOM/browser APIs, persistence implementations, or platform adapters; scoped ESLint rules enforce this for direct, subpath, and type-only imports plus restricted browser globals.
- `src/config/` is declarative input to the core and must not contain renderer behavior.
- `src/game/` and `src/ui/` may read core snapshots and issue commands; they must not become authoritative stores. `src/game/layout/**`, `src/game/view-model/**`, and `src/game/runtime/**` must additionally stay renderer-free and browser-free, enforced by scoped ESLint rules probed in `tests/unit/architecture.test.ts`. The driver holds authoritative state for the session but derives every change from `catchUpSimulation` and injected time, never from rendered frames.
- `src/persistence/` serializes authoritative state but must not own economy or simulation rules.
- `src/platform/` translates host lifecycle events and must not contain game balance logic.
- Presentation animation timing must never determine production output.
- Runtime gold, material, yield, and cost values must cross the core through `GameNumber`; persistence uses its serialized string form and UI formatting remains a separate concern.

## Planned Data Flow

Load active payload → migrate and validate → restore valid state or warn and create a fully fresh state → calculate capped offline reward from the saved rate → persist the consumed timestamp interval → expose a positive pending reward in the modal → claim once into the driver's authoritative state → force-persist it → dismiss the modal → then, on every rendered frame, advance the driver to the injected wall clock → derive the pure mine view model → rebind the floor and shared-stage views → advance the separate cosmetic animation clock → translate player input into core commands → persist debounced authoritative snapshots.

The production pipeline is fifteen independent mine shafts → one shared sequential-stop elevator → one shared warehouse → spendable gold.

## Authoritative State Model

| State | Authoritative fields |
|---|---|
| Global | `saveVersion`, `lastUpdateTimestampMs`, `simulationTick`, `simulationRemainderMs`, `gold`, fifteen floor states, elevator state, warehouse state |
| Floor | Identifier/number, unlock status, mine-shaft level, normalized extraction progress, local material queue, total extracted, total transported |
| Elevator | Level, `GameNumber` capacity, signed route cursor, normalized leg progress, carried material |
| Warehouse | Level, `GameNumber` capacity, input queue, normalized conversion progress, total delivered gold |

Fresh state uses version `1`, receives its timestamp from the caller, initializes the simulation tick and remainder to zero, and serializes `GameNumber` values as strings. Renderer, scene, canvas, sprite, texture, tween, animation, and function state are excluded.

## Simulation Timing Contract

Foreground simulation uses a 100 ms fixed tick. Each update credits at most 1,000 ms to the fixed-step accumulator, carries any sub-tick remainder in authoritative state, and advances the wall-clock timestamp by the full valid elapsed duration. Equal credited elapsed time produces identical tick, remainder, queue, total, and gold state regardless of chunking.

Within each fixed tick, all floors advance extraction in configured order, then the shared elevator advances, then the shared warehouse advances. This makes newly extracted material eligible for elevator pickup and newly delivered material eligible for warehouse progress in the same tick. All stages run automatically without a manager or player tap; locked floors remain completely inert.

## Extraction Contract

Every unlocked floor advances extraction on each fixed tick using its configured cycle duration. A completed cycle yields `baseYield × outputGrowthRate^(mineShaftLevel - 1) × cumulativeMilestoneMultiplier`. Completed output is added immutably to that floor's `materialQueue` and `totalExtracted`, while normalized overflow progress carries into the next cycle. Locked floors remain inert, and extraction never changes global gold, elevator state, warehouse state, or transport totals.

## Elevator Transport Contract

When any unlocked floor has waiting material, the shared elevator departs the surface toward floor one, stops at every unlocked floor in top-to-bottom order, and loads the lesser of that floor's queue and its remaining capacity only after arrival. It continues deeper only when the current floor was fully drained and the cabin still has capacity; otherwise it returns directly to the surface before beginning another top-down trip. A pickup equal to the computed remaining capacity reuses the configured capacity object as the carried total, preventing decimal subtract/add round-off from exposing a false fractional remainder and skipping past queued material. Surface arrival transfers `carriedMaterial` into `warehouse.inputQueue`. One floor of empty travel is half the configured 1,500 ms cycle; each leg is multiplied by `1 + loadRatio × 0.75`, and the return leg also scales by its floor distance. Excess remains at its source floor and elevator operations never change gold directly. The legacy field name `roundRobinCursor` is retained for save-version compatibility: non-negative `i` means descending toward floor index `i`, while negative `-(i + 1)` means returning from that floor. Because fractional extraction and transport totals reach the numeric backend through different arithmetic histories, pickup clamps accumulated `totalTransported` to `totalExtracted`; this preserves the exact save invariant at the natural upper boundary without creating or moving additional material.

## Warehouse Conversion Contract

The warehouse idles with no input. While input exists, it advances normalized conversion progress using the configured 1,200 ms cycle. Material remains in `inputQueue` until the cycle boundary; completion consumes the lesser of input and warehouse capacity, adds that amount 1:1 to global `gold` and `totalGoldDelivered`, and leaves excess for later cycles. Progress resets when the queue empties. For a state with no seeded material, conservation is `totalExtracted = floor queues + elevator carried material + warehouse input + totalGoldDelivered`.

## Production Rate Contract

Production rates are pure derived values and are not stored in authoritative state. Each floor's theoretical extraction per second includes level growth and the cumulative milestone multiplier, including a theoretical value for locked floors. Aggregate mine extraction sums only unlocked floors. Elevator and warehouse throughput use their milestone-aware authoritative capacity multiplied by `1,000 / cycleDurationMs`; effective mine production is the minimum of aggregate extraction and those two shared-stage rates. The result also identifies the limiting stage, with deterministic extraction → elevator → warehouse precedence for exact ties.

## Upgrade Purchase Contract

The next price for every upgradeable stage is `baseCost × costGrowthRate^currentLevel`, calculated without rounding through `GameNumber`. Mine-shaft, elevator, and warehouse purchases are distinct immutable commands. A successful command deducts exactly one price and increments only the selected level. Mine-shaft output is derived from the new level; elevator and warehouse capacity is recalculated with level growth and cumulative milestones without changing cycle duration. Queues, normalized progress, carried material, totals, cursors, timestamps, and unrelated stages remain unchanged. Insufficient funds, a missing floor, or a locked floor returns an explicit failure with the original state object. Invalid or non-incrementable levels are invariant errors.

## Milestone Contract

Milestones are cumulative pure functions of the current stage level. Reaching levels 10/25/50/100 multiplies the stage effect by x2/x2/x3/x4 respectively, producing cumulative multipliers x2/x4/x12/x48. No milestone-award flag or mutable bonus is stored, so reconstructing the same authoritative state cannot grant a multiplier twice. The same calculation drives fresh shared-stage capacity, purchases, actual extraction, and production-rate estimates.

## Floor Unlock Contract

Floors 2–15 unlock only through an immutable purchase command. The target must exist and still be locked; its configured immediately previous floor must already be unlocked and meet the required shaft level before affordability is checked. Success deducts the configured cost exactly once and replaces the locked target with a configured starting floor marked unlocked, resetting its level, progress, queues, and totals while preserving every unrelated state field. Repeated, premature, unaffordable, and unknown requests return explicit failures with the original state object.

## Economy Progression Simulation Contract

The pure Step 19 balance harness starts from fresh authoritative state and advances production in deterministic one-second decisions for a default ten-minute session. An eligible affordable next floor unlock takes priority; once a prerequisite is reached but its unlock is not yet affordable, the policy preserves gold until it can pay the cost. Otherwise it evaluates every currently affordable stage upgrade by recalculating effective production per second after the hypothetical purchase and selects the greatest improvement. Exact ties prefer the shaft needed for the next unlock, then configured floor/elevator/warehouse order. The report returns the final state and an immutable action trace with elapsed time, target, exact cost, and modeled rate improvement. This harness does not run in the player-facing update loop.

## Complete Player Journey E2E Contract

`tests/e2e/player-journey.spec.ts` converts the Step 19 action trace into real canvas presses rather than applying core commands directly in the browser. A test-process replay derives the exact expected version-1 save document and next rendered level for every decision. Each browser run starts by deleting `cat-mine-idle`, boots the real application, advances the injected wall clock to each policy timestamp, scrolls a control into view when necessary, and presses its published screen-space rectangle. The journey stops after it has bought every production-stage upgrade type, opened floors 2 and 3, and reached the first level-10 milestone.

The newest debounced save must equal the policy-derived authoritative document exactly. The context then leaves the running app at that timestamp, advances the controlled clock by one hour while away, reopens the app, verifies and claims the calculated offline reward through the DOM modal, reloads again at the same instant, and proves the interval was consumed. The entire journey runs twice in separate clean browser contexts; both pre-offline and post-claim documents must be byte-for-byte structurally equal to their expected documents and to each other, with no console or page errors.

## Lifecycle Persistence Contract

Before a hidden or pagehide save is stamped, the browser host advances the driver to the event's wall-clock boundary. The same document is written synchronously to the lifecycle journal and asynchronously queued for the authoritative IndexedDB record. If teardown aborts IndexedDB, the next boot validates both candidates, selects the newer valid version-1 document, persists the settled result to IndexedDB, and then clears the journal. Hidden-tab gaps run the real pipeline at foreground rate; closed-page gaps use saved-rate offline efficiency. Each elapsed interval is consumed by exactly one path.

## Save Document Schema — Version 1

Version 1 is a strict plain-JSON document. Unknown properties are rejected. Runtime `GameNumber` values serialize as finite decimal/scientific strings and are reconstructed only after validation.

| Path | JSON type | Constraints / relationship |
|---|---|---|
| `schemaVersion` | integer | Required; exactly `1`. Missing and unsupported versions fail through the migration dispatcher. |
| `savedAtTimestampMs` | number | Non-negative safe integer; cannot precede `state.lastUpdateTimestampMs`. |
| `effectiveProductionRatePerSecond` | string | Finite non-negative serialized `GameNumber`; authoritative rate snapshot used by offline-income calculation. |
| `state` | object | Exact serialized authoritative state described below. |
| `state.saveVersion` | integer | Required; exactly authoritative state version `1`. |
| `state.lastUpdateTimestampMs` | number | Non-negative safe integer. |
| `state.simulationTick` | integer | Non-negative safe integer. |
| `state.simulationRemainderMs` | number | Finite value in `[0, 100)`. |
| `state.gold` | string | Finite non-negative serialized `GameNumber`. |
| `state.floors` | array | Exactly fifteen entries in configured order with the exact configured identifiers and floor numbers. Legacy four-floor version-1 payloads are expanded before validation. |
| `state.floors[].id` | string | Must equal the configured identifier at that array position. |
| `state.floors[].floorNumber` | integer | Must equal the configured sequential floor number. |
| `state.floors[].isUnlocked` | boolean | Floor one must be unlocked; unlocked floors must be sequential and satisfy the preceding configured level gate. |
| `state.floors[].mineShaftLevel` | integer | Positive safe integer; locked floors remain at configured starting level. |
| `state.floors[].extractionProgress` | number | Finite value in `[0, 1)`; zero while locked. |
| `state.floors[].materialQueue` | string | Finite non-negative serialized `GameNumber`; zero while locked. |
| `state.floors[].totalExtracted` | string | Finite non-negative serialized `GameNumber`; zero while locked. |
| `state.floors[].totalTransported` | string | Finite non-negative serialized `GameNumber`, not greater than total extracted; zero while locked. |
| `state.elevator.level` | integer | Positive safe integer. |
| `state.elevator.capacity` | string | Positive serialized `GameNumber`; must equal the configured level effect. |
| `state.elevator.roundRobinCursor` | integer | In `[-15, 15)`; non-negative values encode a downward target and negative values encode an upward origin. |
| `state.elevator.transitProgress` | number | Finite value in `[0, 1)`; may be positive with zero carried material while the empty cabin descends or returns. |
| `state.elevator.carriedMaterial` | string | Finite non-negative serialized `GameNumber`. |
| `state.warehouse.level` | integer | Positive safe integer. |
| `state.warehouse.capacity` | string | Positive serialized `GameNumber`; must equal the configured level effect. |
| `state.warehouse.inputQueue` | string | Finite non-negative serialized `GameNumber`. |
| `state.warehouse.conversionProgress` | number | Finite value in `[0, 1)`; zero when input is zero. |
| `state.warehouse.totalGoldDelivered` | string | Finite non-negative serialized `GameNumber`. |

`createSaveDocument` derives the rate snapshot and serializes state, `migrateSaveDocument` is the single version-dispatch entry point, `validateSaveDocument` enforces this schema and configured relationships, and `deserializeSaveDocument` reconstructs `GameNumber` instances only after successful migration and validation. Level-derived capacities are compared through their canonical serialized form so valid floating-point-backed upgrade effects survive JSON and IndexedDB round trips exactly.

## Save Recovery Contract

`loadActiveGame` is the application load boundary above raw persistence. Empty storage creates a normal fresh state without a warning. A valid document is fully migrated, validated, and deserialized before any authoritative state is returned. If migration or validation fails, no field from the candidate enters runtime state: the loader classifies unsupported schema versions as incompatible and all other invalid candidates as corrupt, records a stable warning with a detached structured-clone snapshot when safe, and creates a complete fresh state at the caller-provided timestamp. Diagnostic callbacks are best-effort and cannot turn a recoverable persistence or save-format failure into an uncaught exception. The invalid IndexedDB record is not mutated during recovery.

## Offline Income Contract

Offline income is configured with a 7,200,000 ms cap and 0.5 efficiency. `calculateOfflineIncome` computes non-negative elapsed time from the validated save timestamp to an injected current timestamp, clamps credited time to the cap, and returns `savedEffectiveRate × creditedSeconds × efficiency` as a `GameNumber`. A future save timestamp produces zero elapsed time and zero reward. The calculation never changes spendable gold or other production state; it immutably replaces `lastUpdateTimestampMs` with the injected current time. During a valid `loadActiveGame`, that timestamp-settled state is serialized with a freshly derived rate snapshot and force-flushed before a positive pending reward is returned. A second load at the same timestamp therefore returns zero reward. If settlement persistence fails, the session continues with a save diagnostic but the exposed reward is zero so an unconsumed interval cannot be claimed and then duplicated.

The browser creates a pending-reward view model only for a positive calculated reward. Its accessible modal displays credited duration and the exact serialized reward. `claimOfflineReward` adds that value once to a new authoritative state and consumes the pending value; a call with no pending value is an identity result. Browser orchestration applies that state to the simulation driver, force-persists it before dismissing the modal, and guards the claim with a consumed-once flag rather than a cached state candidate: production continues while the modal is open, so a retry after a failed write saves the mine as it is at that moment and still adds the reward exactly once. The version-1 save and IndexedDB schemas remain unchanged because only the post-claim authoritative gold snapshot is stored.

## Portrait Layout Contract

The logical viewport stays fixed at 360×640. `#app` absorbs `env(safe-area-inset-*)` as padding so the `#game-viewport` Phaser parent is already the safe box when the scale manager measures it; `index.html` opts in with `viewport-fit=cover`. The scale manager uses `FIT` with `CENTER_BOTH`, which preserves aspect ratio and letterboxes rather than cropping, so no required control can leave the host viewport at any size.

`calculateMineLayout(width, height)` is pure and Phaser-free. It tiles four full-width regions top to bottom with no gaps or overlaps:

| Region | Logical rect (360×640) | Role |
|---|---|---|
| `hud` | `0,0,360,52` | Compact fixed top HUD; icon-plus-value pairs without duplicate captions. |
| `surface` | `0,52,360,164` | Shared elevator and warehouse panels. |
| `mine` | `0,216,360,366` | Clipped viewport the mine content scrolls behind; ends above fixed navigation. |
| `bottomNavigation` | `0,582,360,58` | Compact fixed five-icon navigation shell at the bottom safe edge. |

The complete visible navigation controls — chrome and icon together — render at 60% of their authored size inside unchanged 48×44 standard and 62×50 Boost hit regions. The layout rejects non-finite or non-positive dimensions and any height below `HUD_HEIGHT + SURFACE_HEIGHT + MINE_MIN_HEIGHT + BOTTOM_NAVIGATION_HEIGHT` (474). The initially revealed five edge-to-edge 288×132 floor slots plus 10-pixel top/bottom padding produce 680 logical pixels of content, so the 366-pixel mine region scrolls by 314. Content height expands to ten and fifteen slots only when the corresponding reveal gate opens. `calculateFloorSlotRegion(index)` returns each slot relative to the content origin. The 64-pixel shaft uses a 62-pixel cabin and 50-pixel cargo cat, exposes explicit fit constraints, and renders no shaft plaques. A 4-pixel shaft inset, 4-pixel shaft-to-floor gap, zero inter-floor gap, and zero right inset preserve the approved 288-pixel floor width and continuous cave backdrop.

`MIN_TOUCH_TARGET_PX` is 44 and `assertTouchTargetRegion` rejects any smaller interactive region. The visible shared-stage cards are replaced by art, so their live level/upgrade controls are compact 30×34 badges inside 44×50 hit regions: the elevator region is `(106,48,44,50)` relative to the surface and sits immediately right of and no lower than the discharge tray; the warehouse region is `(263,0,44,50)` and places its chrome above the roof. The hidden `SharedStageView` controls remain read-back models only. The surface strip remains 164 pixels tall.

Clipping uses a dedicated Phaser camera whose viewport equals the mine region, because Phaser 4 removed WebGL geometry masks. The main camera ignores the mine content layer and the mine camera ignores the fixed layers, so the HUD, surface, and bottom navigation never scroll and the scroll gesture drives only the mine camera's `scrollY`. Both halves of that cross-ignore are covered by browser pixel probes, because dataset diagnostics report only intended geometry and stay green when the cameras are misconfigured. The scene publishes `data-layout-viewport`, `data-layout-hud`, `data-layout-surface`, `data-layout-mine`, `data-layout-mine-content-height`, and `data-layout-bottom-navigation` on the canvas for browser assertions. Floor slots are layout placeholders replaced by bound floor views in Step 26.

## Mine Scroll and Input Contract

The initial five-floor mine content is 256 logical pixels taller than the region it is drawn through, so the player reaches the lower floors by dragging or wheeling. When a reveal gate expands the content to ten or fifteen floors, `resizeMineScrollContent` preserves and clamps the current offset. `src/game/view-model/mineScroll.ts` decides all of that from pointer coordinates and the mine region alone; the scene only applies the resulting `scrollY` to the mine camera, which is also the camera Phaser hit-tests through, so a control's pressable rectangle follows the content it is drawn on without further bookkeeping.

`createMineScrollState({region, contentHeight})` caps travel at `max(0, contentHeight - region.height)`, so content that already fits cannot scroll into empty space. `beginMineScrollGesture` anchors a press, `dragMineScroll` moves the content one pixel per pixel of travel from that anchor, `endMineScrollGesture` releases it, and `scrollMineByWheel` adds a wheel delta. Both scrolling entry points clamp at `[0, maxScrollY]`, and every transition returns its input unchanged by identity when nothing moved, so a held finger that only wobbles costs no camera write.

Telling a tap from a scroll is the awkward part, and it is decided in that pure model rather than in Phaser:

- Travel under `MINE_SCROLL_DRAG_THRESHOLD_PX` (6) scrolls nothing and suppresses nothing, because a thumb never lands perfectly still and a press that wobbles must still buy what it aimed at. Crossing the threshold scrolls the whole travel including those first pixels — six pixels is below what the eye catches, while losing one-to-one tracking is not.
- Every press is tracked, not only one that landed on the mine, because a gesture decides two separate things: whether the mine scrolls, which needs the press to have started over it, and whether the release is still a tap, which is about how far the pointer travelled wherever it began. A swipe from the surface strip that lifts on a floor's button is not a tap on that button.
- `hasDragged` outlives the gesture that set it and is cleared only by the next pointer-down. Phaser reports a control's press while the pointer is still coming up, so the flag has to survive that release; `BootScene.#requestPurchase` returns early while it is set. A wheel never sets it, because a notch of scroll followed by a click is two separate intentions.

The wheel is ignored unless the pointer is over the mine, so the fixed layers cannot scroll it. Wheel deltas arrive in host pixels rather than logical ones, which differ by the fitted canvas scale; for a wheel that is not worth carrying the scale factor into a pure module. `#game-viewport canvas` sets `touch-action: none` so the browser cannot claim a vertical gesture as a page pan before Phaser sees it.

`PublishedPurchaseControl` carries `isPressable` beside its screen rectangle: a floor control scrolled out of the mine viewport is clipped away and hit-tested by no camera, so the rectangle outlives the control behind it. `describeMineScroll` is published as `data-mine-scroll` on the same 100 ms cadence as the other read-backs.

## Mine View Contract

All fifteen floors exist in authoritative state and are instantiated once by the scene. `calculateVisibleMineFloorCount` exposes floors 1–5 initially, expands to 1–10 when floor 5 is unlocked, and expands to 1–15 when floor 10 is unlocked. Hidden floor roots do not render, animate, publish controls, or contribute to the active scroll height.

Presentation is a two-layer read of authoritative state. `createMineViewModel(state, balance)` is pure and Phaser-free: it derives each floor's `Floor N` heading, `Lv N` level label, `Locked` status or `null`, normalized extraction progress plus its percentage label, queued-amount label, and discrete material-pile height, and the shared elevator/warehouse title, level, capacity, held amount, cycle progress, and control labels. It rejects progress outside `[0, 1)` and non-positive levels, and never mutates the state it reads.

`MineFloorView` and `SharedStageView` build their game objects once inside a supplied `LayoutRegion` and change only through `applySnapshot`. An open floor shows a 17×17 number-only badge with 10.5 px text, one baseline-aligned coin-plus-amount queue label, the receiving container and unloader, a miner whose position/facing derive from authoritative extraction progress, a fixed 52×52 layout1-referenced gold mound, and 30×34 visible `Level N` chrome shifted 5 px right inside a 44×50 touch target. The decorative mound stays visible regardless of queue fullness. A zero queue uses the empty-cart asset; any positive queue swaps to the generated filled-cart asset and reapplies the same semantic display bounds. It does not draw a duplicate `Floor N` heading or extraction bar. Floor one uses the full cave ceiling frame; floors two onward use a named crop that halves the soil/rock seam without changing slot geometry. Locked floors retain the wider unlock control.

Every unlocked floor derives its presentation crew from `mineShaftLevel` through one shared pure rule: one base miner, then one assistant at levels 50, 100, 150, and 200, capped at five visible miners above level 200. `MineFloorView` pools four assistant sprites once, reveals only the reached count, and gives each a phase-shifted progress-driven patrol plus a shallow personal Y lane and cosmetic frame offset. This is identical across floor instances and does not multiply yield, mutate authoritative state, or add save fields. Rendered diagnostics publish the active count and every measured miner pose.

Queue fullness is still derived as four discrete `materialPileSteps` measured against one elevator trip for diagnostics and bottleneck logic, but it does not resize or hide the environmental gold mound. The receiving cart's empty/filled texture and numeric queue readout carry the visible material-state distinction.

`describeRenderedState` reads values back from the view's own game objects, and `BootScene` publishes them as `data-floor-views` and `data-surface-views`. Browser tests therefore compare rendered output rather than the scene's intentions, and pixel probes still guard the case where correct values never reach the framebuffer.

`BootScene` receives its snapshot source through its constructor, so the mine boots already bound rather than showing placeholder values first.

## Save-Sync Protocol Contract

Designed in server-milestone Step 2 and specified in full in
`memory-bank/server-save-sync-protocol.md`. No code implements it yet.

`GET /v1/save` and `PUT /v1/save` on a Supabase Edge Function are the only save
path; `saves` denies client writes entirely, so PostgREST is never used for a
save. A `SaveDocumentV1` crosses the wire byte-for-byte — the protocol adds no
field to it and rewrites none of it. A server-owned monotonic `revision`
provides optimistic concurrency: an upload carries the `baseRevision` it started
from, and a stale one is refused with the server's current revision and
document so the client can resolve in one round trip.

Every elapsed-time calculation anchors on the server's own `receivedAt`. The
document's `savedAtTimestampMs` and `state.lastUpdateTimestampMs` are stored and
returned verbatim because the client's local simulation needs them, and are
never a server input.

Divergent devices resolve by dominance over the monotonic progress vector —
per-floor `isUnlocked`, `mineShaftLevel`, `totalExtracted`, `totalTransported`,
plus `elevator.level`, `warehouse.level`, and `warehouse.totalGoldDelivered`.
One document dominating the other is adopted silently because it loses nothing;
only a genuine fork asks the player. `gold` and every queue, progress, and
cursor value are excluded because they legitimately fall, which is the same
distinction Step 23 makes. The predicate is pure, operates on two
`SaveDocumentV1` values, and belongs in `src/persistence` — `src/core` must not
learn that saves exist. It holds only while those fields are monotonic, so a
prestige or reset mechanic would have to revise it in the same change.

Local persistence keeps its 500 ms debounce; cloud upload is a separate cadence
of at most one per 60 seconds, forced on lifecycle flush, on a claimed offline
reward, and once after boot reconcile. Boot never waits on the network.

## Server Stack Contract

Landed in server-milestone Steps 4 through 7, spanning 2026-09-08 to
2026-09-09 — Step 7 closes Phase 1 (server foundation). The whole backend
runs locally through the Supabase CLI, pinned at 2.117.0 as an exact
devDependency so a clean checkout resolves the same version rather than
whatever is installed globally. `.github/workflows/ci.yml` runs a `client` job
(`npm run verify`) and a `server` job (`npm run verify:server`) on every push
and pull request; `package.json`'s `verify:all` runs both locally in sequence.

```
supabase/
├── config.toml                     committed; project id `cat-mine-idle`
├── seed.sql                        local-only fixture guest (Step 5)
├── migrations/                     forward-only, applied in filename order
│   ├── 20260908120000_bootstrap_platform_requirements.sql
│   └── 20260908130000_create_platform_tables.sql
└── functions/
    ├── save-sync/                  the save-sync protocol's one HTTP surface
    │   ├── index.ts
    │   └── index.test.ts           Step 7: unit tests, direct import, no HTTP
    ├── core-portability-check/     Step 6 proof, not part of the protocol
    │   ├── index.ts
    │   └── (imports ../_shared/generated/core-bundle.js — see below)
    ├── whoami-check/               Step 7's "trivial authenticated endpoint"
    │   ├── index.ts
    │   └── index.test.ts
    └── _shared/
        ├── coreBundleEntry.ts      pure re-export; the bundler's real entry
        ├── generated/              git-ignored; `npm run build:server-core`
        ├── http.ts                 Step 7: shared response envelope
        └── http.test.ts
```

Local ports are the CLI defaults and do not collide with the client's 5173,
4173, 4174, or 4175: API 54321, database 54322, Studio 54323, mail 54324.
`realtime`, `storage`, and `analytics` are disabled in `config.toml` because no
step in the milestone plan uses them and each is a container at start-up.

**One function, versioned inside itself.** `save-sync` hosts the entire contract
in `memory-bank/server-save-sync-protocol.md` behind `/functions/v1/save-sync`,
with its own `/v1/...` paths after that prefix. Only §10.1 `GET /v1/health`
exists; §10.2 download and §10.3 upload arrive in Steps 16 and 17 and reuse this
router, envelope, and vocabulary rather than opening a second contract.

`verify_jwt` is **false** at the platform level for this function, because the
health route must answer an unauthenticated caller and platform verification
would reject it before the handler ran. The authenticated routes therefore
verify their own bearer token inside the handler; Step 16 implements that, and
until it does, no route reads or writes any data. `whoami-check` below is the
dress rehearsal for that manual-verification pattern.

`Deno.serve(...)` in `save-sync` and `core-portability-check` is guarded by
`if (import.meta.main)` (Step 7): `index.test.ts` imports the module directly
to unit-test `resolveFunctionRoute`/`handleRequest` without starting a second
live listener, and `import.meta.main` is true only when the edge runtime runs
the file itself to serve real requests — proven live rather than assumed:
after adding the guard, both functions still answered real requests exactly as
before. Their previously-duplicated `JSON_HEADERS`/`jsonResponse`/`errorResponse`
moved to `supabase/functions/_shared/http.ts`, itself unit-tested, so a third
function never grows a third copy to drift from the other two.

**The health route never touches the service-role key.** It is the one route
open to unauthenticated callers, so it must not hold the credential that
bypasses row-level security and is, from Step 15, the only writer of `saves`. It
proves database reachability by round-tripping PostgREST with the anon key,
which fails when the database is down; a unit assertion pins the absence of the
service-role key from the file. Step 16 replaces the probe with a query against
`saves` once that table exists.

Failures use the §4 envelope and only §4 codes. That vocabulary contains no
`not_found` and no `method_not_allowed`, so an undefined route or method is
answered `malformed_request` / 400 — under the protocol's reading that a request
outside the contract is a client bug.

**The bootstrap migration creates nothing.** It asserts the PostgreSQL 13+
premise the Step 3 schema relies on for `gen_random_uuid()`, resolving the
function rather than trusting the version number, and gives the migration
pipeline a real file to apply. **The second migration lands all six designed
tables**, verbatim against the "Complete Database Schema" block below, with row-
level security enabled on every one and exactly the policies that block's RLS
matrix names — `profiles`/`entitlements` select-own, `profiles` update-own,
`saves` select-own with no write policy anywhere, `leaderboard_entries`
select-all, and `save_audit`/`recovery_codes` with no policy at all, which
denies every non-service-role access outright. `supabase/seed.sql` inserts one
local-only fixture guest so Studio shows a real row without the Step 8 sign-in
flow existing yet; `saves`, `save_audit`, `leaderboard_entries`, and
`entitlements` stay unseeded until the steps that produce real rows for them
(16, 26, 31) exist.

**`src/core`, `src/config`, and the save-document boundary run on Deno,
unmodified, via a generated bundle rather than a raw import.** Deno's edge
runtime does not append a `.ts` extension to an extension-less relative
specifier — `src/core/index.ts`'s own `from './economy/calculateProductionRates'`
fails to resolve unmodified inside it, a blocker independent of and prior to
`break_infinity.js`, discovered empirically while implementing Step 6 and
recorded as finding F10 in `memory-bank/server-threat-model.md` §8. `npm run
build:server-core` (`vite.server-core.config.ts`, Vite library mode) compiles
`supabase/functions/_shared/coreBundleEntry.ts` — a zero-logic file whose only
content is `export * from '../../../src/core'` and its two siblings — into
`supabase/functions/_shared/generated/core-bundle.js`: one dependency-free ES
module with every specifier already resolved, `break_infinity.js` included,
inlined by the same resolution the client bundle already relies on. That
resolves finding F2 (`break_infinity.js` importing into Deno was unproven): it
imports cleanly once bundled, and no shim was needed. The bundle is
git-ignored and rebuilt by `npm run verify:server` before the stack starts, so
it is a build artifact rather than a maintained copy and cannot drift from
`src/` the way a hand-forked port could.

`supabase/functions/core-portability-check` imports that bundle and, on
request, runs a fixed input document (`tests/fixtures/ten-minute-core-fixture.json`)
through the real `migrateSaveDocument` → `validateSaveDocument` →
`deserializeSaveDocument` → one explicit `advanceSimulation` tick →
`catchUpSimulation` for the remaining 599,900 ms → `createSaveDocument`, and
returns the resulting document. `tests/unit/server-core-portability.test.ts`
runs the identical sequence against the unbundled source and pins the same
result (gold `"100"` → `"3080"` over ten minutes); `npm run verify:server`
fetches the live function and asserts its response is byte-for-byte identical
to that pinned document. This function is not part of the save-sync protocol
and carries no protocol version prefix; `verify_jwt = false` because it reads
and writes no data, the same reasoning as the health route.

`eslint.config.mjs` extends `src/core/**/*.ts`'s purity rules with a
`no-restricted-globals` entry for `Deno` and two `no-restricted-imports`
patterns — any specifier matching `(^|/)supabase(/|$)`, and (added at Step 7,
once the npm scope existed to ban) `^@supabase/` — the boundary runs one
direction only, `supabase/` importing `src/core`, never the reverse.
`tests/unit/architecture.test.ts` probes both. Mutation-proven end to end:
doubling a floor's extraction yield in
`src/core/simulation/advanceSimulation.ts` broke the pinned client assertion
and moved the live function's returned gold from `3080` to `6060` in the same
run, before the edit was reverted.

**The secret boundary is the `VITE_` prefix.** Vite inlines `VITE_`-prefixed
variables into the browser bundle, so that prefix separates a public value from
a secret one. `.env.example` is the committed template; `.env.local` holds real
values and is git-ignored. `npm run scan:secrets` fails the build if the output
contains a service-role JWT, an `sb_secret_*` key, any exact non-`VITE_` value
from the environment, or any server-only variable name, and it runs inside
`npm run verify` between `build` and `test:prod`.

**The Edge Function test harness (Step 7).** `deno-bin@2.1.4` is an exact
devDependency — a real Deno CLI, pinned to the version the edge runtime itself
reports being compatible with — because the Supabase CLI's own `test`
subcommand only wraps pgTAP, not Deno. `npm run test:server-unit`
(`deno test supabase/functions`) type-checks and runs every `*.test.ts` file
under the directory: `_shared/http.test.ts`, `save-sync/index.test.ts`, and
`whoami-check/index.test.ts`, 19 tests total, each importing its handler
directly and running with **zero `--allow-*` permission flags** — a Deno
sandbox refusing real network/env access without an explicit grant is exactly
what makes "unit test against a pure handler" checkable rather than asserted.
`supabase/functions/**` still sits outside `tsconfig.json` (`Deno` has no type
in the Node/DOM libraries the client compiles against), but Deno's own
type-checker now covers it.

`whoami-check` is Step 7's "trivial authenticated endpoint," not part of the
save-sync protocol. `handleWhoAmI` takes caller resolution as an injected
`ResolveCaller` collaborator instead of calling Supabase Auth itself, so unit
tests exercise every response the route can give — missing token, rejected
token, resolved caller, wrong method — with a fake. The one real
implementation, `resolveCallerViaSupabaseAuth`, uses `@supabase/supabase-js`
to verify the bearer token against GoTrue's `/auth/v1/user` and then read the
caller's own `profiles.display_name` with that same token, so row-level
security applies exactly as it would for a real client — the
authenticate-then-read-under-RLS shape every real authenticated route from
Step 9 onward needs. That package is a `devDependency`, exact-pinned
(`2.116.0`), not a client `dependency`: nothing in `src/` imports it yet, and
the Deno import specifier in `whoami-check/index.ts` pins the identical exact
version rather than a floating `@2` — locally, Deno resolves the bare
specifier from this repository's own `node_modules` (byonm mode), but a
function deployed without that context would otherwise let Deno fetch
whatever currently satisfies `@2` from the registry, testing a version no
deployment runs. `tests/unit/server-stack.test.ts` asserts both facts so they
cannot drift apart silently. Step 8's client-side sign-in is what should
promote the package to `dependencies`, deliberately, in the same change that
adds the first `src/` import.

**A server misconfiguration must never look like a bad token.**
`resolveCallerViaSupabaseAuth` **throws** if `SUPABASE_URL`/`SUPABASE_ANON_KEY`
is missing, rather than returning `null` the way it does for a genuinely
invalid token. `handleWhoAmI` does not catch the throw, so it propagates to
the `Deno.serve` wrapper's existing catch, which turns it into `500
server_error` — never the `401 unauthenticated` a bad token gets. This is the
identical distinction `save-sync`'s `probeDatabase`/`handleHealth` already
draw between `misconfigured` and a real per-caller rejection, and it matters
for the same reason: a deployment missing its environment would otherwise
tell every caller, valid token or not, that their credential was bad, and a
client that reasonably treats 401 as "sign out and re-authenticate" would
sign every user out in a loop against a database that was never broken. A
first Step 7 review pass missed this; a follow-up caught it. Two tests guard
it: `whoami-check/index.test.ts` asserts a thrown resolver error rejects
`handleWhoAmI`'s promise instead of resolving to 401 (the fake-resolver unit
tests can prove that contract but can never see which branch the *real*
resolver takes), and `tests/unit/server-stack.test.ts` gained a static-source
assertion, mirroring `save-sync`'s own, that the missing-config branch throws
rather than returning `null` — mutation-proven: reverting to `return null`
fails only the static assertion, unaffected pure-handler tests included,
which is why both exist together.

**"Fix the fixture pattern for an authenticated caller."**
`tests/server-integration/authFixture.ts` mints an HS256 JWT — `sub`,
`role: authenticated`, `aud: authenticated`, an expiry — for the seeded
fixture guest, signed with the Supabase CLI's fixed local `JWT_SECRET` (the
same value on every local stack anyone runs; not a secret this repository
protects). This is the one place any test that needs an authenticated caller
mints a token, replacing the ad hoc inline script Step 5's evidence-gathering
used. `tests/server-integration/whoami.integration.test.ts` uses it against
the real running stack — from its own `vitest.server-integration.config.ts`
(`tests/server-integration/**/*.test.ts`), deliberately excluded from
`vitest.config.ts`'s `tests/unit/**` glob so `npm test`/`npm run verify`, which
must work with no Docker running, never picks it up by accident.
`scripts/verify-server-stack.mjs` runs `npm run test:server-unit` before the
stack even starts and `npm run test:server-integration` once the database is
reset and the stack is confirmed live, satisfying Step 7's "both run in CI
from a clean database."

A real bug surfaced live while wiring the integration test, not assumed away:
`auth.getUser` against the seeded fixture guest 500'd with a GoTrue scan
error, because `supabase/seed.sql` left `confirmation_token`, `recovery_token`,
`email_change_token_new`, and `email_change` NULL — columns with no default
that GoTrue's Go row scanner cannot read as a nullable string. No step before
this one ever triggered it, since Steps 4 through 6 only ever handed
PostgREST a hand-signed JWT directly, never asking GoTrue to load the user
row. Fixed by seeding those four columns as `''`, matching what GoTrue itself
writes for a real sign-up.

**No Edge Function handles CORS or `OPTIONS` yet** — recorded as finding F11
in `memory-bank/server-threat-model.md` §8, noticed while implementing
`whoami-check`. Every function answers `malformed_request` / 400 for a method
it does not recognize, `OPTIONS` included, and this is not yet a defect:
nothing calls a function directly from a browser context that would trigger a
preflight request. The first step whose own client code does — concretely,
Step 16 or 17's save download/upload, not Step 8's sign-in, which goes
through the Auth client SDK rather than a function here — must add an
explicit CORS policy as part of its own instructions.

### Google sign-in (Step 10)

`supabase/config.toml` gains `[auth] enable_manual_linking = true` (was
`false`) and a new `[auth.external.google]` block —
`client_id = "env(GOOGLE_CLIENT_ID)"`, `secret = "env(GOOGLE_CLIENT_SECRET)"`.
Manual linking is load-bearing, not cosmetic: Supabase refuses
`linkIdentity()` outright with "Manual linking is disabled" while it is
`false`, and `linkIdentity()` is the one call that satisfies the step's
requirement — attach Google to the guest session Step 8 already established
while keeping the same `auth.users` id, rather than `signInWithOAuth()`
minting a second one. `src/platform/web/googleSignIn.ts`'s
`beginGoogleSignIn` chooses between the two by whether a session already
exists (`getSession()`), the same collaborator-injection, never-throws shape
`guestSession.ts` established, faked by `tests/unit/google-sign-in.test.ts`
rather than mocking the SDK. `signOutOfSession` is the matching thin
`signOut()` wrapper. `beginGoogleSignIn`'s own return value only ever
describes the *pre-redirect* outcome — whether GoTrue's initial
"issue me an authorize URL" request succeeded — never whether the Google
identity the player goes on to pick already belongs to a different
`auth.users` row. That conflict cannot be known yet at that point: GoTrue
only discovers it after the player has chosen an account on Google's own
page and the browser returns with `error_code=identity_already_exists` on
the *return* URL, a fresh page load the client's own session-detection
parses — long after `beginGoogleSignIn`'s promise already resolved
`redirecting`. Nothing in `src/` reads those return-URL parameters yet; that
read (or an `onAuthStateChange` subscription) is what Step 13's collision
handling requires, not this function. Confirmed live during this step's own
verification below: attempting to re-link an already-linked identity
produced no consent screen at all, only an immediate redirect back carrying
`error_code=identity_already_exists`, with the existing session and account
untouched.

`config.toml`'s `env(...)` substitution is read by the Supabase CLI itself
and only auto-loads a file literally named `.env` at the project root — not
`.env.local`, which is what the rest of this repository's tooling
(Vite, Node scripts) uses, and `supabase start`/`stop`/`reset` have no flag to
point it elsewhere. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` therefore live in
a second, separate git-ignored `.env` file (`.gitignore` already covers both
`.env` and `.env.*`, excepting only `.env.example`), documented in
`.env.example` alongside the exact Google Cloud Console setup: a Web
application OAuth client with `http://127.0.0.1:54321/auth/v1/callback` (the
fixed local GoTrue callback) as its authorized redirect URI — no domain
needed, since Google permits `localhost`/`127.0.0.1` redirects in
development, unlike Step 11's Apple.

No production UI exists for this yet. `HudView.ts`'s fixed HUD already draws
gold at the left edge, the warehouse queue centered, and income anchored to
the right edge across the full 360×640 canvas, and the surface strip, mine,
and bottom navigation account for the rest — there is no free region to place
a DOM overlay without either visually colliding with existing HUD content or
sitting on top of an existing canvas click target. A real entry point is a
Phaser-rendered control akin to the bottom-nav tiles, left for a later polish
step. Until then, `import.meta.env.DEV` gates a `window.catMineIdleAccount`
hook in `src/main.ts` exposing `beginGoogleSignIn()`/`signOut()` bound to the
resolved Supabase client — the same `app.dataset.guestSession`-style
diagnostic pattern Step 8 established, not new production surface.

**What nothing local can prove.** A real human completing Google's own
consent screen is the one thing no test double, local mock, or CI runner can
substitute for — unlike Steps 8–9's live-GoTrue proofs, which only needed
*this* stack. The step's own test ("keeps the same user id and progress;
signing out and back in with Google returns the same account") was therefore
validated once, by hand, with a real Google Cloud OAuth client and a real
Google account, using the `chrome-devtools` MCP tools — not part of
`npm run verify:server`. It passed: linking preserved the same `user.id`
and `profiles` row while flipping `isAnonymous` to `false` and adding one
`google` identity, and a sign-out followed by a fresh sign-in-with-Google
(no consent screen reappearing, since Google had already authorized the app)
returned the identical account. Everything short of that live redirect (the
link-vs-sign-in decision, error surfacing, the config invariants) is unit-
and static-source-tested with no Docker, the same split Step 11 (Apple,
membership/domain) and Step 12 (Telegram, bot host) already record for their
own unautomatable prerequisites.

A 2026-09-10 review found four issues, all fixed: (1) the `DEV`-only
`window.catMineIdleAccount` bootstrap in `src/main.ts` was a second,
independent consumer of `supabaseClientPromise`, and the guest-session
chain's own `.catch` settles only *that* chain's derived promise — a
rejected client promise (the same flaky dynamic-`import()` case Step 8's own
review already fixed once) reached an unhandled rejection a second time;
fixed with its own `.catch(() => {})`, mutation-proven by removing it and
watching the new static-source test fail by name. (2) `scan-bundle-secrets.mjs`
only ever read `.env.local` for its exact-value check, so `GOOGLE_CLIENT_SECRET`
— deliberately placed in the separate `.env` file above — had no value-level
guard, only the (weaker) name-level one; fixed by reading `.env` alongside
`.env.local` and merging both into the same forbidden-value set,
mutation-proven the same way. (3) the claim that "identity already linked to
another user" surfaces as a typed `error` result here was wrong, corrected
above and empirically disproven live rather than merely reasoned about — the
prior wording is what this document, `techContext.md`,
`server-milestone-plan.md`, and `README.md` all said before this pass; all
four are corrected. (4) four smaller cleanups: `describeError` was
duplicated verbatim between `guestSession.ts` and `googleSignIn.ts`, now
shared as `src/platform/web/describeError.ts`; `GoogleAuthClient`'s session
type carried an unread `user` field, narrowed to `unknown` since only its
nullness is ever read; the `declare global` block in `main.ts` sat between
two import statements, moved after all of them; and neither OAuth call
passed `redirectTo`, so GoTrue's default (`site_url`) could silently bounce
a player who opened the game at `localhost:5173` — a redirect URI
`.env.example` itself tells them to authorize — back to `127.0.0.1:5173`
mid-flow, stranding their pre-link session in the origin they actually
started from; fixed by passing `window.location.origin` in from `main.ts`
(not read inside `googleSignIn.ts` itself, which stays importable under
Node). All fixes re-verified against the full client gate (422 unit tests,
51 E2E, build, secret scan, 10 production smoke) and against the live stack
a second time: the same account from the first live pass, reloaded, still
held its session, and a repeated `beginGoogleSignIn()` on an
already-Google-linked account produced exactly finding (3)'s corrected
behaviour rather than a typed error.

A follow-up review found a fifth issue, inside finding (4)'s own test:
`beginGoogleSignIn` built `{ provider: 'google', options: undefined }` — the
`options` key present with an undefined value — while the accompanying
test's title claimed the code omitted the key entirely, and
`toHaveBeenCalledExactlyOnceWith` is itself undefined-tolerant, so the
assertion passed under either shape and proved neither claim. Confirmed
with a standalone Vitest probe before changing anything: a call of
`{ provider: 'google' }` alone satisfies an expectation of
`{ provider: 'google', options: undefined }`. Fixed on both sides — the
credentials object now genuinely omits `options` when no `redirectTo` is
given, and the test reads `Object.keys()` off the real mock call, which
does distinguish "absent" from "present but undefined" — and mutation-proven
in both directions. The full gate (422 unit tests, unchanged) passes.

### Telegram sign-in (Step 12)

Step 11 (Apple) was cut on 2026-09-11 rather than implemented — see the
`server-milestone-plan.md` status table and `server-threat-model.md`
finding F7's exercised contingency. Step 12 is Telegram sign-in, and unlike
Steps 10–11 it needs no real external account, domain, or paid membership
to satisfy its own test: `initData` verification is self-contained
HMAC-SHA256 signature checking that never contacts Telegram at all, so
every one of the step's test assertions — valid `initData` produces a
session; tampered, stale, and wrong-bot-token payloads are each rejected
with none issued; the bot token never leaks — is proven against the real
local Supabase stack using hand-signed test vectors under a fixture bot
token, no real bot or Mini App host required.

**Verification algorithm**, implemented in
`supabase/functions/telegram-sign-in/index.ts`'s `verifyTelegramInitData`,
matching Telegram's own documentation exactly: every field except `hash`
(and `signature`, a separate Ed25519 third-party scheme this function does
not use), as `key=value` pairs sorted alphabetically and joined by `\n`, is
the data-check-string; `secret_key = HMAC_SHA256(key="WebAppData",
data=botToken)`; `computed = hex(HMAC_SHA256(key=secret_key,
data=dataCheckString))` must equal `hash`, compared in constant time.
`auth_date` freshness has no Telegram-mandated window —
`MAX_INIT_DATA_AGE_SECONDS = 86400` (24 h) is a deliberate, documented
default (the `@telegram-apps/init-data-node` ecosystem convention), not an
unstated one. Everything runs on `crypto.subtle` (Web Crypto), not
`node:crypto`, so it executes unmodified on Deno's edge runtime.

**Minting a session.** Supabase Auth has no first-class "trust this
server-verified identity" admin API. The confirmed community/official
pattern this function uses: `admin.generateLink({ type: 'magiclink', email })`
— which creates the `auth.users` row if it doesn't already exist — returns
`properties.hashed_token`; the client then calls
`auth.verifyOtp({ token_hash: hashedToken, type: 'email' })` (not
`type: 'magiclink'`, deprecated for `verifyOtp`) to establish a real,
GoTrue-tracked session with working refresh. No email is ever sent — the
token is generated server-side and handed to the client directly in the
function's own JSON response.

**No schema change.** A Telegram user maps to
`auth.users.email = telegram-<telegramUserId>@telegram.invalid` —
`.invalid` is the RFC 2606-reserved TLD for exactly this, a never-delivered,
never-resolvable placeholder (`telegramPlaceholderEmail`). `generateLink`
finds-or-creates by that deterministic email, so no `profiles` column or
migration was needed, matching how Steps 8 and 10 also shipped with zero
schema changes — identity linking lives entirely in `auth.users`.
**This mechanism is only safe because `[auth.email] enable_signup = false`
(`supabase/config.toml`).** A 2026-09-12 review found and this repository
confirmed live: with public email signup open, an attacker who knows a
Telegram id can `POST /auth/v1/signup` with that exact placeholder email
and a password of their own choosing *before* the real user ever signs in
— `enable_confirmations = false` lets it complete immediately, since
nothing needs to be delivered to the unreachable address — and
`generateLink` then hands the real Telegram user a session into the
attacker's own, password-protected account. See finding **F13** in
`server-threat-model.md` for the full reproduction and fix.

**CORS**, the first function `src/` ever calls directly with `fetch()` —
finding F11's trigger — and what proving it live found — finding F12, both
in `server-threat-model.md` — plus the resulting shared
`_shared/http.ts` policy and its `server-save-sync-protocol.md §14` record,
are documented there rather than duplicated here.

**Client side**, `src/platform/telegram/telegramSignIn.ts`: `readTelegramInitData()`
reads `window.Telegram.WebApp.initData` — the raw, still-signed string,
never `initDataUnsafe`, the SDK's own unverified convenience parse — and
resolves `null` for every player today, since no Telegram Web App
`<script>` tag was added to `index.html` (that is the still-unbuilt Mini App
host, finding F1, deliberately separate work). `signInWithTelegram` POSTs
the raw `initData` to the function and completes `verifyOtp` on success;
same never-throws, typed-result shape as `guestSession.ts`/`googleSignIn.ts`.
`src/main.ts` computes `readTelegramInitData()` once at boot, before either
identity chain runs: a non-null result calls `signInWithTelegram` **instead
of** `ensureGuestSession` — "Inside Telegram this replaces the guest path
entirely," the step's own words, not a linking flow the way Google's is —
so today, with the detector always `null`, the guest bootstrap is the only
chain that ever runs; `supabaseClientPromise` now has three independent
consumers (Telegram, guest, and the Step 10 DEV hook), and the Telegram
chain carries its own `.catch`, the same lesson Step 10's own review
already applied to the DEV hook.

`describeError` moved out of `src/platform/web/` to
`src/platform/describeError.ts`, shared by `web/` and the new `telegram/`
sibling rather than reached across directories.

`tests/server-integration/telegramInitDataFixture.ts` independently
re-implements the signing algorithm with `node:crypto` (not Web Crypto),
deliberately — a real, deployed `telegram-sign-in` function accepting a
vector signed this way is proof two independent implementations of the same
published algorithm agree, not proof one merely matches itself, the same
principle `authFixture.ts` already established for bearer tokens.

**A 2026-09-12 review found and fixed one critical and three smaller
issues**, all mutation-proven and reproduced live rather than only reasoned
about. **Critical (finding F13):** the placeholder-email mechanism above
was pre-account-stealable through public email signup — fixed with
`[auth.email] enable_signup = false`, and
`tests/server-integration/telegram-sign-in.integration.test.ts` gained a
test that attempts the exact attack directly against the live stack
(signup refused, legitimate Telegram sign-in for that same id still
succeeds) rather than only asserting the config line; a static assertion
in `tests/unit/server-stack.test.ts` pins the flag too, scoped to the
`[auth.email]` section specifically after an initial version of that
assertion was found to pass vacuously against a mutated flag — its lazy
regex crossed into the unrelated, already-`false` `[auth.sms]` section
further down the same file. **Medium:** `scan-bundle-secrets.mjs` had been
widened for `.env` (Step 10) but not for `supabase/functions/.env` — the
most sensitive of the three env files, since `TELEGRAM_BOT_TOKEN` is the
HMAC key that signs `initData` for every Telegram user — so a hardcoded
literal token would have passed the exact-value check; fixed by merging
that third file into the same check. **Minor:** `MintSessionResult`'s
`error` variant carried a `reason` string nothing ever read
(`handleTelegramSignIn` only branches on `status`, and the real
implementation already logs separately) — removed, strengthening the
existing no-leak test structurally rather than just by convention; and
`verifyTelegramInitData`'s freshness check compared `now - authDate` in one
direction only, so a validly-signed but *future*-dated payload was never
flagged stale — fixed with `Math.abs`, low-severity since exploiting it
still needs the real bot token. **Deliberately not changed:** a wrong
method answers `400 malformed_request`, not `405` with an `Allow` header —
`save-sync/index.ts`'s own header comment already made this the
deliberate, documented choice for every function reusing the save-sync
protocol's error vocabulary ("that vocabulary has no ... `method_not_allowed`,
so a request for ... a method the contract does not define is a client bug
and is answered `malformed_request` / 400"), which `server-save-sync-protocol.md`
§1 states identity endpoints reuse; introducing a code that vocabulary
deliberately omits would itself be the inconsistency.

### Save storage, upload, and download (Steps 15–17)

`saves` (Step 5 migration) already carried `saves_select_own` (select, own
row) and no insert/update/delete policy of any kind, so RLS's own
default-deny already satisfied Step 15's "permits no client write at all"
before any code in this section existed; Step 15 only added the live-stack
evidence (`tests/server-integration/saves-rls.integration.test.ts`).

`supabase/functions/save-sync/index.ts` implements `PUT`/`GET /v1/save`
(§10.2–10.3 of `memory-bank/server-save-sync-protocol.md`) alongside the
existing `GET /v1/health`, sharing `resolveFunctionRoute` and the
`_shared/http.ts` envelope/CORS helpers. `handleRequest` now takes an
optional `SaveSyncDeps` (`resolveCaller`, `readCurrentSave`, `writeSaveRow`)
— real collaborators by default, faked in `index.test.ts` — the same split
`whoami-check`/`telegram-sign-in` already established.

- **Auth**: `resolveCallerViaSupabaseAuth` — an anon-key client scoped to the
  caller's own bearer token, `auth.getUser()` — identical in shape to
  `whoami-check`'s collaborator.
- **Read** (`readCurrentSaveRow`): the same anon-scoped client selecting
  `revision, document_json, received_at` from `saves` — no elevated
  privilege needed, since `saves_select_own` already permits it.
- **Write** (`writeSaveRowViaServiceRole`): a service-role client is the
  *only* thing in this function (or, before it, anywhere in `src/`) that
  writes `saves` at all — `saves`'s RLS permanently denies every client
  write, by design. `tests/unit/server-stack.test.ts`'s blanket
  "no function reads the service-role key" check names `save-sync` as its
  second exception (`telegram-sign-in` is the first), with its own positive
  assertion pinning the read to `writeSaveRowViaServiceRole`'s
  `insert`/`update` — not an `upsert`, per the concurrency fix immediately
  below.
- **Concurrency** (§5, decision D2): `PUT` accepts when the request's
  `baseRevision` strictly equals the stored `revision` (`null` on both sides
  for a first write); otherwise `409 revision_conflict` with the server's
  own `serverRevision`/`receivedAt`/`document` attached, and the stored row
  untouched. On accept, the current row's `revision`/`document_json`/
  `received_at` shift into `previous_revision`/`previous_document_json`/
  `previous_received_at` (the one-generation-of-rollback shape Step 3
  designed) before the new values are written. **The write itself is a
  compare-and-swap, not a blind `upsert`** — a 2026-09-12 review found the
  original `upsert` let two overlapping uploads both read the same
  `revision`, both pass the `baseRevision` check, and both write, silently
  discarding one and breaking §5's "one monotonic revision" guarantee (not
  player-reachable before Step 19's client upload cadence exists, but the
  endpoint was already live). `writeSaveRowViaServiceRole` now branches on
  `row.previousRevision === null` (no row existed at read time): a first
  write is a plain `insert`, where the `user_id` primary key turns a
  concurrent racer's insert into a `23505` unique violation rather than a
  silent second winner; a subsequent write is
  `update ... where user_id = ? and revision = ?` — atomic in Postgres —
  with `.select()`'s returned row count telling the caller whether it
  actually applied. `handleSaveUpload` turns a lost race (`applied === false`)
  into the same `409 revision_conflict` a stale `baseRevision` gets, after
  re-reading the row so the conflict carries the actual winner's document
  rather than the snapshot this request lost against.
- **Validation**: `migrateSaveDocument`/`validateSaveDocument` are imported
  from `supabase/functions/_shared/generated/core-bundle.js` — the same Step
  6 bundle, never reimplemented for Deno. A thrown `SaveDocumentError` maps
  to `422 save_invalid`; a `schemaVersion` other than
  `CURRENT_SAVE_SCHEMA_VERSION` maps to `422 schema_unsupported` before
  validation even runs. The body is capped at 64 KB: a `Content-Length`
  pre-check refuses an oversized body before it is even buffered (a
  2026-09-12 review finding — the post-read check alone contradicted its own
  "refuse cheaply" comment, since `request.text()` had already read the
  whole body into memory by the time it ran), and the same post-read check
  still runs afterward as the authoritative one for a chunked body with no
  `Content-Length` header, or one that understates it.
- **Download** (`GET`): `200 {revision, receivedAt, document}` when a row
  exists, `204` with no body otherwise — "the normal first-sign-in path, not
  an error."

`src/persistence/guestUpgradeReconciliation.ts` adds two pure functions,
reused by both Step 17's boot reconcile and Step 13's collision resolution:

- `hasAnyProgress(document, config)` — true when any of the same
  "progress vector" fields §7.1 of the protocol defines (per floor:
  `isUnlocked`, `mineShaftLevel`, `totalExtracted`, `totalTransported`;
  `elevator.level`; `warehouse.level`, `warehouse.totalGoldDelivered`) sits
  above its configured starting value. Deliberately excludes `gold`, every
  queue, `carriedMaterial`, and progress fractions — idle play alone moves
  those from the very first tick, which would make "no progress" true for
  only an instant.
- `reconcileGuestUpgrade(local, remote, config)` → `'adopt-local'` (no
  remote save, or remote has no progress), `'adopt-remote'` (local has no
  progress), or `'ask'` (both have progress — a genuine fork), carrying each
  candidate's document and last-played time per §7.3's display fields
  (`local.lastPlayedMs` = `savedAtTimestampMs`; `remote.lastPlayedMs` =
  the download's `receivedAt`).

`src/platform/web/cloudSaveReconcile.ts`'s `reconcileCloudSaveAtBoot` is the
boot-order half (§11): downloads via `downloadCloudSaveViaFetch`, reads the
local document via the injected repository (treating no local record at all
— a genuinely new device — as the same "no progress" baseline
`createInitialGameState` produces, not as "nothing to compare"), runs the
downloaded document through `validateSaveDocument` before using it at all —
a 2026-09-12 review found the original code cast `body.document` straight to
`SaveDocumentV1` with no migration, harmless only by luck until a schema 2
exists to skip past — and applies `reconcileGuestUpgrade`'s decision.
`'adopt-remote'` writes the cloud document into local storage and reloads
the page; `'adopt-local'` and `'ask'` are no-ops from this module's own
point of view — `'ask'` is deliberately left for Step 18 (or, in-session,
for Step 13's DEV hook) to resolve, never silently written over.
`src/main.ts` calls `triggerCloudSaveReconcile()` from the tail of both the
guest and Telegram boot chains, once each resolves `signed-in` — a fourth
independent consumer of `supabaseClientPromise`, with its own `.catch`,
never on the boot-blocking path — passing the *lifecycle-safe*
`repository` (`LifecycleSafeActiveSaveRepository`), not the raw
`indexedRepository` it wraps: the same 2026-09-12 review found that passing
the raw Dexie repository let the running `SavePersistenceCoordinator`'s own
debounced flush land between this reconcile's `storeActiveSave` and
`reload()` and silently revert the adopt — two writers racing one record,
now both going through the wrapper the coordinator itself uses.

`_shared/http.ts`'s `ALLOWED_ORIGINS` gained this repository's own Playwright
preview ports (`4173` E2E, `4175` production smoke, `4176` server-e2e)
alongside the existing `5173` dev-server pair: the reconcile's `fetch()` is
the first call from outside `5173` this milestone makes, and
`production-smoke.spec.ts`'s "no request fails" assertion caught both that
gap and the test's own need to exclude this one documented, best-effort,
sometimes-cancelled-by-teardown request from its otherwise-unchanged check.

### Guest linking and the identity collision (Step 13)

Three of the step's required flows fall out of what Steps 10/12/17 already
do: a fresh identity link keeps the same `auth.users` id (Steps 10/12), and
"no progress, never asked" plus the silent no-conflict cases are exactly
`reconcileGuestUpgrade`'s existing behaviour (Step 17). What Step 13 adds is
the missing piece — detecting and resolving the one collision Google's
`linkIdentity` can produce that `reconcileGuestUpgrade` alone cannot get the
caller into:

- `detectGoogleIdentityCollision` (`src/platform/web/googleSignIn.ts`) calls
  `client.auth.initialize()` — the SDK's own memoized boot-URL parser,
  already triggered once by `ensureGuestSession`'s `getSession()`, so a
  second call is free and returns the cached result — and reads
  `error.details?.code === 'identity_already_exists'`, mirrored from the
  SDK's own internal check (`GoTrueClient._initialize`) since no
  higher-level named constant exists for it.
- `beginGoogleAccountSwitch` always calls `signInWithOAuth`, never
  `linkIdentity`, regardless of whether a guest session already exists:
  GoTrue never reveals *which* account a colliding identity belongs to, so
  there is no way to become that account except a second, full Google
  consent round trip. The still-present local IndexedDB save is untouched by
  the session switch — `DexieActiveSaveRepository` keys one fixed record,
  not per-user — so it remains exactly what the next boot's
  `reconcileCloudSaveAtBoot` compares against the newly-authenticated
  account's cloud save.
- Telegram needs neither addition: it never attempts `linkIdentity` at all
  (`src/main.ts` calls `signInWithTelegram` *instead of* the guest
  bootstrap), so every Telegram sign-in already runs through Step 17's
  reconcile unconditionally.

No production UI exists yet, matching Steps 8/10/12: `main.ts`'s existing
`DEV`-only `window.catMineIdleAccount` hook gained `beginGoogleAccountSwitch`
alongside `beginGoogleSignIn`, and a `data-google-identity-collision`
diagnostic published from `detectGoogleIdentityCollision`.

### Recovery code (Step 14)

`recovery_codes` (Step 3/5 schema — one policy-free table, an HMAC-SHA-256
`code_hash` under a pepper never stored in the database, a partial unique
index permitting only one active code per user) is unchanged by this step;
`supabase/functions/recovery-code/index.ts` is the first code to touch it,
under two routes (`/functions/v1/recovery-code/v1/generate`,
`.../v1/redeem`) reusing `_shared/http.ts`'s envelope/CORS helpers.

- **Code**: 16 random bytes (128-bit entropy), hex-encoded and grouped for
  display (`xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx`). The canonical form
  that gets hashed strips every non-hex character and lowercases, so a
  player can paste the code with or without its dashes.
- **Rotation** (`rotateRecoveryCodeViaServiceRole`): revokes whatever is
  currently active (`update ... where user_id = ? and redeemed_at is null
  and revoked_at is null`) before inserting the new row — the partial
  unique index would otherwise reject a second active row outright.
- **Redemption** (`redeemRecoveryCodeViaServiceRole`) is a single atomic
  `update ... where code_hash = ? and redeemed_at is null and revoked_at is
  null returning user_id` — proactively applying the compare-and-swap
  lesson the Step 16 review taught for `save-sync`'s upload endpoint,
  rather than shipping a read-then-write and waiting for a review to find
  the same race. Mutation-proven: temporarily reverting to read-then-write
  let two concurrent redemptions of the same code both succeed in 2 of 3
  live runs.
- **Minting a session for the resolved `user_id`** adapts
  `telegram-sign-in`'s `admin.generateLink`/client-`verifyOtp` pattern for
  an id-keyed rather than email-keyed lookup: `generateLink` finds-**or
  creates** by email, so calling it blind for a pure anonymous guest (no
  email at all) would silently mint a new, wrong account.
  `mintSessionForUserViaGenerateLink` resolves the caller's existing email
  first (Google-linked, or a Telegram placeholder) and only assigns a
  deterministic `recovery-<user_id>@recovery.invalid` (via
  `admin.updateUserById(..., {email_confirm: true})`, no confirmation email
  sent) when the account has none — guaranteeing `generateLink` *finds* the
  correct row. Confirmed live for exactly the pure-anonymous case.
- **Hashing stays out of the pure handler.** `handleGenerate`/`handleRedeem`
  never call `Deno.env.get` themselves — `RotateRecoveryCode`/
  `RedeemRecoveryCode` take the *canonical code*, not a pre-computed hash,
  and the real service-role implementations hash internally. This is what
  keeps the handler testable under `deno test`'s zero-`--allow-*` harness:
  a design that hashed inline in the handler would need `--allow-env` just
  to run its own unit tests.
- **Rate limiting is a deliberate interim seam, not Step 25 itself.** Step
  25 is the plan's own named owner of a persistent, distributed per-user/
  per-address limiter across every endpoint in this milestone; the Step 3
  schema deliberately carries no per-code failed-attempt counter. This
  ships a minimal in-memory, address-keyed fixed-window limiter
  (`checkRedemptionRateLimitInMemory`) — not safe across multiple worker
  instances or a restart, documented as such — sufficient for this step's
  own "wrong codes are... throttled" test.
- `src/platform/web/recoveryCode.ts` (`generateRecoveryCode`/
  `redeemRecoveryCode`) mirrors `telegramSignIn.ts`'s shape exactly,
  completing the session with `auth.verifyOtp({token_hash, type:'email'})`.
  `main.ts`'s existing DEV-only hook gained both; `redeemRecoveryCode`
  triggers the same `triggerCloudSaveReconcile()` every other sign-in path
  already runs once redemption succeeds — "redemption... must reuse the
  Step 13 collision flow" needed no new merge logic, since the redeeming
  device's local save is untouched by the session swap.

**2026-09-12 review of Step 14.** Five findings, all fixed and re-verified
against the live stack:

1. **HIGH — a failed mint permanently destroyed the account.**
   `redeemRecoveryCodeViaServiceRole` marks the row redeemed *before*
   `mintSessionForUserViaGenerateLink` runs; if minting then failed, the code
   was already spent with no session ever delivered — unrecoverable.
   `handleRedeem` now calls a new `revertRecoveryCodeRedemption` collaborator
   (best-effort, its own failure only logged) to clear `redeemed_at` before
   answering `500`, so the same code stays usable. Mutation-proven live: with
   the revert removed and minting forced to fail, the row stayed
   `redeemed_at`-set forever; with the revert restored, the same forced
   failure left `redeemed_at` null.
2. **MEDIUM — the CORS preflight blocked every real browser call.**
   `corsPreflightResponse` (`_shared/http.ts`) answered
   `access-control-allow-headers: content-type` only, so a real browser's
   preflight for `recoveryCode.ts`'s or `cloudSaveReconcile.ts`'s
   `Authorization`-bearing cross-origin request would have been refused
   before it left — invisible locally only because Kong's own CORS handling
   (finding F12) overrides every function's response regardless. Fixed to
   `content-type, authorization`.
3. **MEDIUM — the rate limiter's own doc comment misdescribed its failure
   mode, and (once fixed) the address it read was proven to always be
   populated locally by the platform gateway.** `extractCallerAddress` now
   reads the *last* `X-Forwarded-For` hop — the one the gateway (Kong
   locally, Supabase's edge network in production) appends and a client
   cannot forge — instead of the first, client-suppliable one, closing the
   "attacker rotates the header every request" exploit the review named
   (which the integration suite's own old per-call random address
   inadvertently demonstrated). Confirmed live that the gateway supplies this
   trusted hop unconditionally, whether or not the client sends the header
   at all — the `null`/"no address" branch in
   `checkRedemptionRateLimitInMemory` is a defensive default for a caller
   that bypasses the gateway entirely, a path no deployment here allows
   today, not a case this project's own traffic exercises. Given that every
   real caller is now bucketed by an address it cannot spoof, the threshold
   was raised from 10 to 30 attempts/minute — free against a real attacker
   (128-bit code entropy is the actual backstop, not this counter) while
   comfortably absorbing a real user's own retry bursts or many distinct
   users behind one shared address (an office NAT).
4. **MEDIUM — unbounded map growth.** `redemptionAttemptsByAddress` never
   dropped a key once its window emptied, so a caller who never reused an
   address grew the map forever. `pruneExpiredRateLimitEntries` now sweeps
   every key each check, deleting any whose live-attempt window is empty.
5. **MEDIUM — rotation revoked before it knew the insert succeeded.**
   `rotateRecoveryCodeViaServiceRole` was a separate `.update()` (revoke)
   then `.insert()` — two independent, non-transactional PostgREST
   statements. An insert failure after a successful revoke stranded the
   user with no active code at all. Fixed with a single Postgres function,
   `rotate_recovery_code` (migration
   `20260913090000_recovery_code_rotation_rpc.sql`, DDL in the schema
   section below), called through `admin.rpc(...)` — both statements now run
   in one transaction. Mutation-proven live: forcing the insert to fail via
   a global `code_hash` collision left the RPC-based rotation's original
   code still active (rolled back), while reproducing the old two-statement
   sequence by hand against the same collision left the user with zero
   active codes (revoked, insert failed, nothing rolled back).

**2026-09-13 review of Step 14.** Five more findings, all fixed and
re-verified against the live stack:

1. **The migration's own comment overstated what atomicity guarantees.**
   `20260913090000_recovery_code_rotation_rpc.sql` originally credited
   Postgres with "serializing concurrent callers on the same `user_id`" —
   it doesn't: two concurrent rotations can both clear the same revoke
   predicate before either commits, and both then race their own `insert`.
   What actually makes that race safe is
   `recovery_codes_one_active_per_user_idx` — whichever insert commits first
   wins outright, the loser's insert raises `23505` against that same
   index, and because the revoke and insert now share one transaction, that
   failure rolls the loser's revoke back too, rather than leaving a
   committed revoke with no matching insert. The migration's comment and
   this document's own §5 entry above are corrected to say so.
2. **Fix #5 had no committed behavioral test.** `server-stack.test.ts`'s
   assertions were string greps against the source and the migration —
   both would pass against an RPC that did the wrong thing. Added two live
   integration tests: a forced global `code_hash` collision on the insert
   half, proving the rollback directly (the RPC leaves the pre-existing
   code untouched; a hand-reproduced version of the old two-statement
   sequence against the identical collision leaves zero active codes); and
   a genuine concurrent `generate`/`generate` race (`Promise.all`), proving
   the account ends up with exactly one active, redeemable code regardless
   of which of the two legitimate outcomes the real network timing
   produces (both succeed, the second silently superseding the first; or
   one succeeds and the other's insert genuinely collides).
3. **`revertRecoveryCodeRedemptionViaServiceRole` could itself collide with
   the one-active-code index.** If a `POST /v1/generate` landed in the
   narrow window between a failed mint and this revert, the plain `update
   ... where revoked_at is null` it used would try to revive the
   just-spent code as a *second* active row, alongside the fresh one the
   concurrent `generate` had just rotated in — rejected by
   `recovery_codes_one_active_per_user_idx`, caught and logged by
   `handleRedeem`'s own try/catch, but a real avoidable error rather than a
   deliberate decision. Not account-corrupting (the fresh code from that
   concurrent `generate` remains the sole way back in either way), but a
   narrow path where the fix silently degraded to pre-fix behavior for the
   specific code being reverted. Fixed with a second Postgres function,
   `revert_recovery_code_redemption` (migration
   `20260913090100_recovery_code_revert_rpc.sql`, DDL below), which only
   clears `redeemed_at` when the account holds no other active code —
   otherwise a silent no-op, not a constraint violation. Two live
   integration tests prove both branches directly against the RPC.
4. **The rate-limit sweep ran on every request, not just when needed.**
   `pruneExpiredRateLimitEntries` swept the *entire* map on every single
   `checkRedemptionRateLimitInMemory` call — under the exact rotated-address
   attack it exists to bound, nothing has expired yet at the moment each new
   address is added, so this was O(n) per request, i.e. O(n²) total: memory
   exhaustion traded for quadratic CPU. Fixed by gating the sweep on map
   size (`RATE_LIMIT_PRUNE_SIZE_THRESHOLD`, 1,000) rather than running it
   unconditionally — amortized O(1) per request once the map is below
   threshold, with one real sweep once it isn't.
5. **The integration suite shared one real rate-limit bucket with no way to
   reset it, undocumented.** Once `extractCallerAddress` reads the platform
   gateway's own trusted hop (finding 3 from the prior round), every request
   the whole integration file makes shares one real, gateway-observed
   bucket — confirmed live that the local Kong gateway supplies this hop
   unconditionally, whether or not the client sets `X-Forwarded-For` at
   all, so there is no client-side way to get a fresh one. Left as-is, a
   re-run of the suite inside the 60-second window failed unrelated tests
   (the basic round-trip, the concurrent-redemption race) with `429`
   instead of their real expectations — an undocumented cooldown nobody
   would expect to hit. Fixed with a new route,
   `POST /v1/test-only-reset-rate-limit`, gated behind
   `RECOVERY_CODE_TEST_RESET_TOKEN` — unset (and therefore inert) in any
   real deployment, and answering an unauthorized caller the identical
   response an unknown route gets, so its existence is not discoverable
   without already knowing the token. The integration suite calls it in a
   `beforeAll`/`afterAll` around the whole file. Proven live: the suite now
   passes cleanly five consecutive runs back to back with no stack restart
   between them, where it previously failed on the second run.

A same-review pass also recorded F13's mandated re-derivation for the
`recovery.invalid` placeholder-email namespace in `server-threat-model.md`
(passes — see that document) and corrected `server-save-sync-protocol.md`'s
CORS-header documentation, which had drifted out of sync with finding 2's
fix above. All five re-verified: `npm run verify:server` (98 Deno unit
tests, 69 integration tests, 3 server-e2e) and the full client gate (502
unit tests, 51 E2E, build, secret scan, 10 production smoke) both re-pass
end to end from a clean cycle.

**Follow-up pass on the same 2026-09-13 review (one LOW residual on the
Step 17 fix, three consistency notes, one optional hardening).**

- **LOW, verified live — the unbind fix removes the `pagehide` write but not
  a journal entry already there.** `storeActiveSave(remoteDocument)` calls
  `journal.clearThrough(remoteDocument.savedAtTimestampMs)`, which only
  discards an entry *at or below* that timestamp. The adopted document
  carries the other device's clock, so a journal entry written earlier in
  this session — a `visibilitychange`→hidden while the player backgrounds
  the tab during boot, before the reconcile ever runs — reads as newer and
  survives, then wins on the next boot, reverting the adopt (though not
  looping: the next boot's own debounced save clears the journal and the
  second adopt sticks). Confirmed with a scratch test against the real
  `WebLifecycleSaveJournal`/`LifecycleSafeActiveSaveRepository` classes.
  Restamping the adopted document to `Date.now()` before storing it was
  considered and rejected: `savedAtTimestampMs` is not cosmetic — `loadActiveGame`
  anchors offline-income settlement to it directly
  (`calculateOfflineIncome(state, loadedSave.savedAtTimestampMs, ...)`), so
  restamping would silently zero the offline income a cloud-adopt is
  supposed to credit for time elapsed since the *other* device's last save.
  Fixed instead with a new `WebLifecycleSaveJournal.clear()` — unconditional,
  unlike `clearThrough`, and deliberately *not* used by the routine
  debounced-flush path (`storeActiveSave` keeps its existing conditional
  clear there, since a routine flush must not clobber a genuinely newer
  entry a concurrent `pagehide` wrote while that flush was still in
  flight) — called through a new `CloudSaveReconcileDeps.clearLifecycleJournal`
  right before `reload()`, safe specifically because the reload's own
  unbind means no further local write can race it. Mutation-proven:
  removing the call fails a new unit test by name.
- **The `main.ts` comment asserted a safety it didn't establish.** It
  claimed a reconcile resolving before `startApplication()` reaches the
  `unbindSaveLifecycle` assignment means "there is no race to guard against
  in that ordering either." The real risk in that ordering isn't a failed
  unbind — it's `bindSaveLifecycle` registering *after* the unbind ran and
  before the document actually unloads, since `reload()` doesn't stop
  script execution. That needs the network round trip this reconcile makes
  to outrace `startApplication()`'s own font loading and `loadActiveGame`,
  which is improbable, not impossible. Comment corrected to say so rather
  than claim otherwise.
- **`checkTestResetAuthorizationViaEnv` compared the token with `===`.**
  This codebase constant-time-compares the Telegram HMAC
  (`timingSafeEqualHex`); the reset route is local-only so the practical
  risk was nil, but for consistency `recovery-code/index.ts` gained its own
  `timingSafeEqual` (the identical XOR-diff algorithm, generalized past hex
  since a token is an opaque string) and now uses it here.
- **`revert_recovery_code_redemption`'s "silent no-op, not an error" isn't
  unconditional.** Its own `not exists` check and its `update` are not
  atomic with each other, so a `generate` whose transaction commits in that
  gap can still make the `update` raise the identical `23505` a plain
  `update` would have — which is exactly why `handleRedeem`'s try/catch
  around this call has to stay; the outcome is safe either way (the fresh
  code wins, the reverted one just stays spent). Documented with a clause
  in the migration's own comment and in the calling function's doc comment,
  rather than left implicit.
- **Optional hardening, applied: RPC execute grants, belt-and-braces over
  RLS.** Both RPCs were `security invoker` with Postgres's default execute
  grant to `public`; `recovery_codes`' own RLS (no policy at all, confirmed
  via `pg_policies`) already makes them inert for `anon`/`authenticated`,
  but a new migration
  (`20260913090200_recovery_code_rpc_grants.sql`) closes it at the grant
  layer too. Non-trivial in practice: Supabase's own bootstrap grants
  `execute` to `anon`/`authenticated`/`service_role` *individually* when a
  function is created (not merely through `public`), confirmed live by
  inspecting `pg_proc.proacl` right after `rotate_recovery_code` was first
  created — `revoke ... from public` alone left `anon`/`authenticated`
  untouched, and each had to be named explicitly. `service_role` is not a
  Postgres superuser locally (`rolbypassrls` only, confirmed via
  `pg_roles`), so it needed its own explicit re-grant — verified live that
  omitting it breaks the Edge Function's own `admin.rpc(...)` calls with a
  permission-denied error, not merely a no-op. A new live integration test
  calls both RPCs directly through PostgREST's `/rest/v1/rpc/...` endpoint
  as an authenticated (non-service-role) caller and asserts `403`;
  mutation-proven by manually re-granting `execute` to `anon`/`authenticated`
  and watching that same test fail, then restoring via a clean
  `supabase db reset`.

All re-verified: `npm run verify:server` (98 Deno unit tests, 70 integration
tests, 3 server-e2e) and the full client gate (506 unit tests, 51 E2E,
build, secret scan, 10 production smoke) both re-pass end to end from a
clean cycle.

## Cat Role Asset Catalog Contract

`art-source/cat-role-catalog/` is the source-of-truth workspace for role-based
cat variants. Its art-direction brief fixes the rarity order
`N < R < SR < SSR < UR`, with gray, green, blue, purple, and gold visual
identities respectively. Its manifest records role/tier status, references,
provenance, and the boundary between candidates and runtime assets.

The term `rarityTier` is used in asset metadata to avoid collision with the
existing numeric stage `level`. The existing Step 32A `unloader` sheet is the
default runtime fallback and the baseline candidate for `unloader:N`. Future
role/tier assets remain under `art-source/` until they pass deterministic raster
QA and explicit visual approval. The current catalog phase creates no runtime
loader entry, selection rule, gameplay attribute, authoritative state field,
balance input, persistence field, or save/database schema change.

## Live Production Stage Contract

The screen pulls; the core never pushes. `MineSimulationDriver` holds authoritative state, and each rendered frame `BootScene.update` asks it to advance. The driver credits `now() - state.lastUpdateTimestampMs` through `catchUpSimulation`, where `now` is injected so `Date.now()` stays in `src/main.ts`. That delta is not always a frame: the browser stops the render loop for a hidden tab, so it is routinely a whole absence, and `advanceSimulation`'s per-call `MAX_FOREGROUND_DELTA_MS` bound — which exists so one slow frame cannot pay out a burst — would consume the rest unsimulated. `catchUpSimulation` walks the gap in credited-size slices instead, exactly rather than approximately, because the sub-tick remainder is carried in authoritative state. The walk is bounded at `MAX_CATCH_UP_MS` (two hours, matching the offline-income horizon) so resuming cannot freeze the tab; time past the bound is still consumed by `lastUpdateTimestampMs`, since a timestamp left behind real time would hand the same interval to offline income on the next load. Nothing about the frame — its rate, its delta, its animation speed — enters that calculation, so equal wall-clock time produces equal state at any frame rate, and a frozen clock is a paused mine that still renders. A clock that moves backwards credits nothing and leaves the authoritative timestamp ahead until real time catches up. The driver memoizes its derived snapshot and re-derives it only when a fixed tick completed. A sixty-frame second completes ten ticks, so most frames leave a state differing solely in timestamp and sub-tick remainder; those hand back the same object and the scene skips rebinding by identity, with its renderable guard ordered behind that check. `replaceState` always re-derives, because a command changes displayed values without completing a tick. The rendered-state read-back that browser tests assert against is gated on `import.meta.env.DEV`, so a shipped build neither runs nor contains it. Commands replace state through `replaceState`, which the offline-reward claim uses before the next frame continues from it.

Each production stage retains authoritative state in its view model. For a floor, extraction progress feeds the ping-pong patrol across the full corridor from the unloader to the gold pile, so position and facing freeze with a paused core while walk frames stay cosmetic. The cabin's vertical position follows its signed route direction, floor target, and leg progress, remapped through pure smootherstep easing so visual velocity reaches zero at both ends without changing leg duration. Each underground stop uses the semantic Y centre of that floor's gold container. Underground and surface cabin twins share the shaft-centre X coordinate `36`; only Y changes, so entry into the tower is perfectly vertical. The asymmetric tower v2 is positioned around that semantic bay axis rather than forcing the cabin toward its full texture centre, and adds a right-side mounting bracket for its code-rendered level badge. Its hopper has filled and empty texture variants: `warehouse.queueSteps > 0` shows the gold-filled tower, while zero swaps to the empty steel-bin artwork; both retain identical 128×128 runtime bounds. A fixed-layer cabin twin fades in after boundary entry to bridge the camera seam without duplicating simulation state. A 720×328 original sky/mountain/meadow landscape is displayed at 360×164 as the bottom surface-art layer, behind the tower, delivery objects, warehouse, and foreground ground strip. The legacy elevator and warehouse cards are hidden while their bound `SharedStageView` instances remain read-back models; the generated tower, right-flush 140×140 warehouse building, and explicit compact level badges route to the corresponding upgrade commands. The elevator badge region is `(106,48,44,50)`, placing its 30×34 chrome immediately beside and higher than the chute; the warehouse region remains `(263,0,44,50)`. The 56 px warehouse supervisor is mirrored left and its four-frame idle is cosmetic only. Number plaques inside the shaft are omitted because the cave panels already provide number-only floor badges.

Decoration is a separate clock. `BootScene` accumulates `advanceAnimationTimeMs(frameDelta × animationSpeedMultiplier)` and drives only cosmetic sprite frames, conveyors, and the surface delivery loop. Pure `calculateSurfaceHaulerPose` always divides a 5,200 ms lap into tower collection, delivery, warehouse stop, and empty return; whether `warehouse.inputQueue` has material changes only the pour and filled-cart flags, never whether the worker moves. `calculateSurfaceHaulerCount` derives one base cat plus one assistant at every ten warehouse levels, capped at eleven total at level 100. `calculateSurfaceHaulerAssistantPose` distributes every active assistant around that same loop even when all carts are empty; `calculateSurfaceHaulerAssistantOffset` adds mirrored horizontal spacing with zero Y offset so all cats and carts share one baseline. Each cat therefore owns an independent phase, frame, horizontal position, facing, and one paired cart rather than copying the lead transform or sharing its vehicle. Every paired cart follows its cat's route pose. The cart's empty and filled files have different native dimensions, so every `setTexture` is immediately followed by the same semantic 46×46 display size; diagnostics publish measured cart bounds, active cat/cart counts, and assistant poses to prevent texture-driven scale pulses, missing carts, exact crew overlap, or vertical lane drift. The multiplier and workforce visuals reach nothing authoritative, so scaling, freezing, or adding assistants cannot change production or gold.

The same separation governs floor crews: authoritative extraction progress remains the only route input, while the number of visible miners comes from the existing shaft level and their frame/phase/lane differences are cosmetic. No miner sprite count is consulted by the simulation.

## HUD Contract

The fixed 52-pixel top bar shows three icon-led numbers: spendable gold on the left, authoritative `warehouse.inputQueue` with a warehouse icon in the centre, and income on the right. Gold and income are identified by their icons, so the `Gold` and `Income /s` captions are intentionally empty. `createHudViewModel(state, balance)` derives all three values and is carried on the same `MineViewModel` the mine views are bound from, so one snapshot drives the whole screen. Income is `calculateMineProductionRates(...).effectiveProductionPerSecond` — the rate already capped at the chain's slowest stage — so the HUD estimates what the mine can deliver rather than what the shafts could extract if transport and conversion were free. All Phaser and DOM text uses self-hosted Fredoka SemiBold/Bold; `src/main.ts` waits for both weights before constructing the canvas.

`formatAmount` is the one formatter every displayed amount goes through, in the HUD and in the mine views alike. It shows two stable decimal places for abbreviated tiers (`2.00m`, `14.60qa`) followed by the lowercase suffix for the value's magnitude; ordinary unsuffixed integers remain unpadded and non-integers retain two decimals. Named suffixes are `k`, `m`, `b`, `t`, `qa`, `qi`, `sx`, `sp`, `oc`, `no`, and `dc` for `10^3` through `10^33`; the alphabetic run begins with `aa` at `10^36`, continues `ab`, ... `az`, `ba`, and extends through three-letter suffixes. `describeAmountTier` is shared by the main formatter and the offline-reward formatter, so overlays cannot drift to a different unit system. Past three letters — beyond 1e54000, which no reachable balance approaches — the serialized scientific form is shown instead of an unbounded run of letters. Main-display digits are truncated rather than rounded, because a balance that reads higher than it is would promise an upgrade the player cannot afford; a value that is present but smaller than the displayed precision reads `<0.01` rather than `0`. Values are read through `GameNumber`'s normalized `mantissa` and `exponent` rather than converted to a `number`, so magnitudes past `Number.MAX_VALUE` format like any other instead of collapsing to `Infinity`.

`HudView` builds its background, divider, three resource icons, and five text objects once and changes only through `applySnapshot`, so a value that moves ten times a second costs a string assignment rather than a rebuilt display list. `describeRenderedState` reads the five strings plus the warehouse icon's texture key back from those objects, and `BootScene` publishes them as `data-hud-view` on the same 100 ms cadence as the other rendered-state diagnostics.

## Purchase Control Contract

Every shared-stage or unlock purchase is a labelled control with affordability and an authoritative command. An open floor's compact Level control is now selection-only: it opens `MineShaftUpgradeModal` and cannot spend. `createMineShaftUpgradeModalViewModel` uses the same `calculateMineShaftUpgradeBatchCost` charged by `purchaseMineShaftUpgrades`, so x1, x5, and the binary-searched MAX affordable quantity cannot drift from the state transition. A batch increments the shaft once by its quantity, deducts the total geometric-series cost once, preserves progress/queues/totals, and fires one persistence notification.

`PurchaseControlView` is one reusable entity used by open floor panels (`floor-level`: compact `Level` plus current level), locked floors (`stacked`: action over price), and shared-stage panels (`inline`: action left, price right). Floor-level mode separates 30×34 visible chrome, offset 5 px right from its former centred position, from a nearly transparent 44×50 interactive rectangle and renders its tiny labels at resolution 2. Its rendered-state diagnostic reports both bounds so browser tests pin visual placement without weakening the input target. The display override changes presentation only; the priced command, affordability, deduction, and feedback remain unchanged.

A direct press goes to `MineSimulationDriver.purchase(target)`; every floor/elevator/warehouse popup CTA goes to `purchaseUpgradeBatch(target, quantity)`. Both advance to the current time first, because the player spends current gold, then return the shared outcome vocabulary. Exact batch costs use the same geometric-series calculator for shafts and shared stages. A refusal preserves state/snapshot; a purchase replaces state, re-derives the snapshot, and invokes `onCommandApplied` exactly once. `BootScene` disables Phaser input while the DOM upgrade modal is visible, preventing a popup gesture from activating a building or mine control underneath, and republishes `data-floor-upgrade-modal` with its rendered detail/CTA state in development. No database exists and schema version 1 is unchanged.

The result is shown on the pressed control for `PURCHASE_FEEDBACK_DURATION_MS` (1,200 ms): `Upgraded!` or `Unlocked!` on green, `Need more gold`, `Level too low`, or `Unavailable` on red, in place of the action and price. `describePurchaseFeedback(feedback, nowMs)` is pure and expires the message, and the scene runs it on the Phaser scene clock rather than the cosmetic animation clock, so how long a message stays readable cannot change with animation speed. The scene expires its whole feedback map each frame rather than only the entries whose control is still on screen: the map is keyed by control and so is bounded either way, but a successful unlock hides the control that was pressed, and collecting through live controls alone would leave that result in place until the control came back. `BootScene` rebinds the snapshot and republishes diagnostics immediately on a press instead of waiting for the next tick. Because that expiry runs on the frame clock, every control re-renders on every frame, so the render path must cost nothing when nothing changed: text colours are compared before they are written, since `Text.setColor` — unlike `Text.setText` — repaints the caption's canvas and re-uploads its texture on every call. A browser test counts repaints across idle frames and requires zero.

`BootScene` publishes `data-purchase-controls`: every visible control's key, rendered labels, enabled appearance, live feedback, and its pressable rectangle in screen coordinates. Floor controls are drawn through the mine camera, so their world rectangle is offset by that camera's viewport and scroll. Surface-stage entries come from the two visible compact badge instances rather than the hidden legacy card controls; the main camera leaves their world and screen rectangles equal. This is what lets a browser test aim a real press at a real control instead of assuming a coordinate.

## Floor Unlock Contract

A floor offers exactly one purchase: an open floor sells its shaft upgrade, and a locked floor sells itself. `describeFloorUnlock(state, floorId, config)` returns one locked floor's price, the prerequisite shaft it waits on (id, player-facing number, required level, and where that shaft stands now), `isRequirementMet`, `isAffordable`, and `canUnlock`, or `null` once the floor is open. It and `purchaseFloorUnlock` share one private predicate, so a floor can never look unlockable to the player while the command refuses it, or the reverse; a unit test asserts that agreement across every combination of prerequisite level and balance.

`createFloorUnlockControlViewModel(availability)` turns that description into the same `PurchaseControlViewModel` an upgrade uses, with the `Unlock` caption and `isEnabled` set from `canUnlock` — so gold alone never enables the button while the prerequisite is short. The requirement itself is not on the button but beside it: `formatUnlockRequirement` produces `Needs Floor 1 Lv 5`, drawn in `TEXT_WARNING` while unmet and `TEXT_MUTED` once satisfied, so a player who is only short of gold is not told to keep upgrading.

`MineFloorView` holds two `PurchaseControlView` instances, of which exactly one is visible: a wider unlock control while locked and the compact far-right level control after opening. Phaser skips invisible objects when hit-testing, and a browser test presses the revealed compact control to prove the hidden unlock control left the input path.

A successful unlock is applied in place: `purchaseFloorUnlock` initializes the floor from balance data, the driver re-derives the snapshot, and the scene rebinds on the same press — the panel loses its locked colour and `Locked` badge, gains its miner and shaft-upgrade control, and the unlock control disappears, all without the scene restarting. That visible change is the confirmation; the `Unlocked!` message is on a control that the same frame removes.

## Provisional Balance Snapshot

| Stage | Starting values | Upgrade values | Unlock |
|---|---|---|---|
| Floor 1 | Level 1, yield 10 / 2,000 ms, unlocked | Base cost 25, cost x1.15, yield x1.10 | None |
| Floor 2 | Level 1, yield 30 / 2,500 ms, locked | Base cost 75, cost x1.15, yield x1.10 | 250 gold; Floor 1 level 5 |
| Floor 3 | Level 1, yield 90 / 3,000 ms, locked | Base cost 225, cost x1.15, yield x1.10 | 1,500 gold; Floor 2 level 5 |
| Floor 4 | Level 1, yield 270 / 3,500 ms, locked | Base cost 675, cost x1.15, yield x1.10 | 7,500 gold; Floor 3 level 7 |
| Floors 5–10 | Level 1, locked; yield triples and cycle grows 500 ms per depth | Upgrade base triples per depth, cost x1.15, yield x1.10 | Unlock cost x5 per depth; previous floor level 7 |
| Floors 11–15 | Level 1, locked; same generated depth curve | Same generated depth curve | Unlock cost x5 per depth; previous floor level 10 |
| Elevator | Level 1, capacity 50 / 1,500 ms | Base cost 100, cost x1.15, capacity x1.12 | Shared and always available |
| Warehouse | Level 1, capacity 60 / 1,200 ms | Base cost 120, cost x1.15, capacity x1.12 | Shared and always available |

Starting gold is 100. Every upgradeable stage uses milestones at levels 10/25/50/100 with x2/x2/x3/x4 multipliers. The Step 19 deterministic simulation validates that these values meet the automated ten-minute progression targets without tuning; they remain provisional until player-facing playtesting.

## Production Build Contract

The shipped artefact is the optimized `dist/` bundle served from the root base path `/`. `vite.config.ts` declares that base explicitly rather than relying on the default, because the runtime asks for its textures through absolute `/assets/...` paths that no bundler rewrites: a prefixed base would emit hashed bundles under the prefix while the loader kept requesting the root, and every texture would 404 only in the deployed build.

`playwright.production.config.ts` builds and serves that bundle through `vite preview` on port 4175 and runs `tests/production/production-smoke.spec.ts` against it. The build is part of the server command so the served output always matches current sources, whether the suite runs alone through `npm run test:prod` or as the final stage of `npm run verify` (lint → unit → E2E → build → smoke).

The smoke suite asserts what only the served bundle can show:

- **Asset loading.** Every path in `PLACEHOLDER_ASSETS` and `PLACEHOLDER_ANIMATION_ASSETS` returns a success status, both self-hosted Fredoka weights are served from `/assets/` and report `document.fonts.check`, no request fails, and no response is 4xx/5xx.
- **Bundle identity.** Every `<script>`/`<link>` in the served document resolves under `/assets/`, no response is served from `/src/`, and the dev-only rendered-state read-backs (`data-floor-views`, `data-hud-view`, `data-purchase-controls`, `data-animation`, `data-mine-scroll`, `data-surface-views`) plus the opt-in profiler attributes are absent. A dev server or an unstripped diagnostic build fails here rather than silently passing the rest.
- **Real rendering.** Pixel probes read the HUD background and a floor panel out of the canvas backing store, because layout diagnostics report intended geometry and stay green when nothing was painted.
- **Save behavior.** With `Date.now` routed through `window.name` by an init script — the hashed entry cannot be rewritten the way the dev-server tests rewrite `/src/main.ts` — a controlled 40-second session is flushed at a `visibilitychange` boundary and must equal the document derived in the test process. A reload at the same instant credits no offline time and must re-settle the identical document, and a further 20 seconds must continue from the deserialized saved state rather than a fresh one.
- **Error handling.** A corrupt payload and an unsupported schema version are each seeded into IndexedDB during a navigation whose bundle is blocked, so nothing boots to overwrite them. The reload must show the matching recovery notice, stay playable, replace the rejected payload with a valid fresh document, and raise no uncaught error. A browser whose `indexedDB.open` throws must still boot, show the load-failure and then the save-failure notice, and keep rendering.
- **Responsive layout.** The canvas and all four logical regions stay inside narrow-phone, tall-phone, tablet-portrait, and desktop viewports at the preserved 360:640 ratio. The bottom navigation remains fixed while the mine camera scrolls only in its reduced middle viewport.

## Save Diagnostic Surface

`createSaveDiagnosticBanner(parent)` renders one non-blocking DOM notice for both recoverable persistence problems: the loader's `SaveRecoveryWarning` and the coordinator's `PersistenceDiagnostic`, whose shapes both satisfy `SaveDiagnosticNotice`. `src/main.ts` passes it as `loadActiveGame`'s `onWarning` and the coordinator's `onDiagnostic`.

Steps 21 and 22 specified a visible diagnostic, and the core produced one, but the application never passed either callback — a player whose save was rejected simply found themselves at the start of a fresh game with no explanation. Step 36 found that only against the served bundle, where the recovery path is what a real corrupt record actually reaches.

The notice never takes focus and overlays only the non-interactive HUD strip, because the session always continues: a corrupt save has already been replaced and a failed write is still retried. A code that is already showing is ignored rather than re-rendered, since a broken storage backend reports a failed write on every debounce, and a dismissed code stays dismissed until a different problem occurs. It is not withdrawn when a later write succeeds — the coordinator reports failures, not recoveries, and leaving a stale notice the player can dismiss is safer than silently retracting the news that progress may not be stored.

## Complete Database Schema

**Relational/server database schema — landed in the local Supabase stack.**
Server-milestone Step 3 designed the schema below on 2026-09-08; Step 4 stood up
the local Supabase stack; Step 5 landed it on 2026-09-08 as
`supabase/migrations/20260908130000_create_platform_tables.sql`, applied after
Step 4's bootstrap migration
(`supabase/migrations/20260908120000_bootstrap_platform_requirements.sql`, which
creates nothing — it only asserts the PostgreSQL 13+ premise this block relies on
for `gen_random_uuid()`). All six tables and the row-level-security policies in
the matrix below exist in the local development database after
`supabase db reset`; **no deployed database contains them**, because no
deployment exists yet. This block and its twin in the other document are
byte-identical by construction and must be changed together, in the same change
as every future migration, exactly as `AGENTS.md` requires.

Full protocol context is in `memory-bank/server-save-sync-protocol.md`; the
threat model and recorded defaults it obeys are in
`memory-bank/server-threat-model.md`.

### How a `GameNumber` is stored

Three rules, and they differ by location.

1. **Inside a save document, nothing changes.** `GameNumber` values stay
   serialized decimal/scientific strings inside the document text, exactly as
   the version-1 save schema already defines them. The server neither reformats
   nor re-serializes them.
2. **Anywhere SQL must sort or rank a `GameNumber`, store two columns.**
   `*_exact text` holds the canonical serialized form and is the only value ever
   displayed; `*_log10 double precision` holds its base-10 magnitude and is used
   only for `ORDER BY`. A value past `1e308` cannot enter a `double precision`
   column, but its logarithm can, which is what makes the pair work.
3. **`numeric` is deliberately not used.** It could hold these magnitudes, but
   round-tripping the canonical string through `numeric` is not guaranteed to
   reproduce the exact serialization display depends on, and comparison and
   index cost grow with digit count while idle-game values grow without bound.
   The `exact` + `log10` pair keeps display exact and sort cost constant.

Sorting on `log10` orders distinct magnitudes correctly. Two values whose
mantissas differ beyond double precision can tie; the ranking index carries a
deterministic secondary column so that tie resolves stably, and the exact string
is what the player is shown either way.

### Storage of the save document — `text`, not `jsonb`

`saves.document_json` is `text` holding the exact serialized document. It is
**not** `jsonb`, and this is a correctness requirement rather than a preference:
`jsonb` does not preserve key order, discards insignificant whitespace, and
normalizes numeric literals, whereas Step 20's test requires a pre-milestone
save to come back from download **byte-for-byte** identical. The server parses
the document to validate it and stores the original text unchanged. Nothing in
SQL ever queries inside the document — re-simulation parses it in the Edge
Function, and leaderboard values are projected into their own table — so `jsonb`
would buy nothing and cost the round-trip guarantee.

`save_audit.detail` is `jsonb` because it is server-authored, never returned to
a client, and never round-tripped.

### Tables

Schema `public`. `gen_random_uuid()` is built into PostgreSQL 13+, which
Supabase provides; no extension is required.

```sql
-- Shared trigger: maintains updated_at on rows that carry it.
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles --
create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  display_name text            null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 24)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Server-milestone Step 9: creates the row `profiles` has no insert policy
-- for. `security definer` lets it run as the function's owner (`postgres`,
-- which owns `profiles` and so bypasses its RLS) rather than as
-- `supabase_auth_admin`, the role that actually performs the `auth.users`
-- insert and holds no privilege on `public.profiles` at all.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------- saves --
create table public.saves (
  user_id                uuid        primary key references auth.users(id) on delete cascade,
  revision               bigint      not null,
  schema_version         integer     not null,
  document_json          text        not null,
  received_at            timestamptz not null default now(),
  previous_revision      bigint          null,
  previous_document_json text            null,
  previous_received_at   timestamptz     null,
  created_at             timestamptz not null default now(),
  constraint saves_revision_positive
    check (revision > 0),
  constraint saves_schema_version_positive
    check (schema_version > 0),
  constraint saves_document_size
    check (octet_length(document_json) <= 65536),
  constraint saves_previous_all_or_none
    check (num_nulls(previous_revision, previous_document_json, previous_received_at) in (0, 3)),
  constraint saves_previous_revision_older
    check (previous_revision is null or previous_revision < revision),
  constraint saves_previous_document_size
    check (previous_document_json is null or octet_length(previous_document_json) <= 65536)
);

-- ---------------------------------------------------------------- save_audit --
create table public.save_audit (
  id                 bigint      generated always as identity primary key,
  user_id            uuid        not null references auth.users(id) on delete cascade,
  occurred_at        timestamptz not null default now(),
  outcome            text        not null,
  error_code         text            null,
  base_revision      bigint          null,
  resulting_revision bigint          null,
  document_bytes     integer     not null,
  client_reported_at timestamptz     null,
  detail             jsonb           null,
  constraint save_audit_outcome_known
    check (outcome in ('accepted', 'rejected')),
  constraint save_audit_error_code_matches_outcome
    check ((outcome = 'accepted') = (error_code is null)),
  constraint save_audit_resulting_revision_matches_outcome
    check ((outcome = 'accepted') = (resulting_revision is not null)),
  constraint save_audit_document_bytes_non_negative
    check (document_bytes >= 0),
  constraint save_audit_detail_size
    check (detail is null or octet_length(detail::text) <= 4096)
);

create index save_audit_user_time_idx
  on public.save_audit (user_id, occurred_at desc);

create index save_audit_rejected_time_idx
  on public.save_audit (occurred_at desc)
  where outcome = 'rejected';

-- ----------------------------------------------------------- recovery_codes --
create table public.recovery_codes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  code_hash   text        not null,
  created_at  timestamptz not null default now(),
  redeemed_at timestamptz     null,
  revoked_at  timestamptz     null,
  constraint recovery_codes_hash_format
    check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint recovery_codes_single_terminal_state
    check (redeemed_at is null or revoked_at is null)
);

create unique index recovery_codes_hash_key
  on public.recovery_codes (code_hash);

create unique index recovery_codes_one_active_per_user_idx
  on public.recovery_codes (user_id)
  where redeemed_at is null and revoked_at is null;

-- Server-milestone Step 14 review finding (2026-09-12): rotating a code was
-- a revoke `update` followed by a separate `insert` — two independent,
-- non-transactional PostgREST requests. An insert failure after a
-- successful revoke stranded a user with no active code. Wrapping both
-- statements in one `plpgsql` function makes them one transaction.
--
-- This does not mean Postgres serializes two concurrent `generate` calls
-- for the same user into a well-ordered queue (a 2026-09-13 correction —
-- the migration's own comment originally overstated this): both
-- transactions' revokes can still clear the same predicate before either
-- commits, and both then race their own insert. `recovery_codes_one_active_per_user_idx`
-- is what makes that race safe — the loser's insert raises `23505`, and
-- because the revoke and insert share one transaction, that failure rolls
-- the loser's revoke back too.
create function public.rotate_recovery_code(p_user_id uuid, p_code_hash text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.recovery_codes
  set revoked_at = now()
  where user_id = p_user_id
    and redeemed_at is null
    and revoked_at is null;

  insert into public.recovery_codes (user_id, code_hash) values (p_user_id, p_code_hash);
end;
$$;

-- Server-milestone Step 14 review finding (2026-09-13): a `generate` landing
-- in the narrow window between a failed session mint and
-- `revertRecoveryCodeRedemption` running could leave the account holding a
-- fresh active code by the time the revert executes — a plain `update`
-- would then try to revive the just-spent code as a *second* active row,
-- colliding with `recovery_codes_one_active_per_user_idx`. This function
-- checks for that fresher code first and no-ops instead of raising an
-- avoidable constraint violation in the common case — though the check and
-- the write are not atomic with each other, so a `generate` committing in
-- the narrow gap between them can still make the `update` itself raise the
-- identical `23505`; `handleRedeem`'s own try/catch around this call stays
-- for exactly that reason, and the outcome is safe either way.
create function public.revert_recovery_code_redemption(p_code_hash text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.recovery_codes where code_hash = p_code_hash;

  if v_user_id is null then
    return;
  end if;

  update public.recovery_codes
  set redeemed_at = null
  where code_hash = p_code_hash
    and revoked_at is null
    and not exists (
      select 1
      from public.recovery_codes existing
      where existing.user_id = v_user_id
        and existing.redeemed_at is null
        and existing.revoked_at is null
    );
end;
$$;

-- Server-milestone Step 14 review finding (2026-09-13, optional hardening):
-- both RPCs above are `security invoker` with Postgres's default execute
-- grant to `public`. `recovery_codes` RLS (no policy at all) already makes
-- them inert for `anon`/`authenticated`; this closes it at the grant layer
-- too. `revoke ... from public` alone is not enough — Supabase's own
-- bootstrap grants execute to `anon`/`authenticated`/`service_role`
-- individually when a function is created, not merely through `public` —
-- and `service_role` is not a superuser locally, so it needs its own
-- explicit re-grant.
revoke execute on function public.rotate_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.rotate_recovery_code(uuid, text) to service_role;

revoke execute on function public.revert_recovery_code_redemption(text) from public, anon, authenticated;
grant execute on function public.revert_recovery_code_redemption(text) to service_role;

-- ------------------------------------------------------ leaderboard_entries --
create table public.leaderboard_entries (
  board_key       text             not null,
  user_id         uuid             not null references auth.users(id) on delete cascade,
  display_name    text                 null,
  metric_exact    text             not null,
  metric_log10    double precision not null,
  source_revision bigint           not null,
  updated_at      timestamptz      not null default now(),
  primary key (board_key, user_id),
  constraint leaderboard_entries_board_key_format
    check (board_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  constraint leaderboard_entries_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 24),
  constraint leaderboard_entries_metric_exact_length
    check (char_length(metric_exact) between 1 and 64),
  constraint leaderboard_entries_metric_log10_finite
    check (metric_log10 <> 'NaN'::double precision
           and metric_log10 > '-Infinity'::double precision
           and metric_log10 < 'Infinity'::double precision),
  constraint leaderboard_entries_source_revision_positive
    check (source_revision > 0)
);

create index leaderboard_entries_rank_idx
  on public.leaderboard_entries (board_key, metric_log10 desc, updated_at asc);

create trigger leaderboard_entries_set_updated_at
  before update on public.leaderboard_entries
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ entitlements --
create table public.entitlements (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  entitlement_key text        not null,
  granted_at      timestamptz not null default now(),
  granted_by      text        not null,
  source          text            null,
  revoked_at      timestamptz     null,
  primary key (user_id, entitlement_key),
  constraint entitlements_key_known
    check (entitlement_key in ('cosmetic.supporter_badge')),
  constraint entitlements_granted_by_length
    check (char_length(granted_by) between 1 and 64)
);
```

### Column reference

| Table | Column | Type | Null | Default | Key / constraint |
|---|---|---|---|---|---|
| `profiles` | `id` | uuid | no | — | PK; FK → `auth.users(id)` on delete cascade |
| `profiles` | `display_name` | text | yes | — | 1–24 characters when present; player-supplied, untrusted on render |
| `profiles` | `created_at` | timestamptz | no | `now()` | — |
| `profiles` | `updated_at` | timestamptz | no | `now()` | maintained by `profiles_set_updated_at` |
| `saves` | `user_id` | uuid | no | — | PK; FK → `auth.users(id)` on delete cascade; one row per user |
| `saves` | `revision` | bigint | no | — | `> 0`; monotonic, `+1` per accepted upload; the D2 concurrency token |
| `saves` | `schema_version` | integer | no | — | `> 0`; denormalized from the document for migration sweeps |
| `saves` | `document_json` | text | no | — | ≤ 65536 bytes; exact serialized `SaveDocumentV1` |
| `saves` | `received_at` | timestamptz | no | `now()` | server clock; the D3 anchor for every elapsed-time calculation |
| `saves` | `previous_revision` | bigint | yes | — | `< revision`; null-together with the other two `previous_*` columns |
| `saves` | `previous_document_json` | text | yes | — | ≤ 65536 bytes; one generation of rollback |
| `saves` | `previous_received_at` | timestamptz | yes | — | — |
| `saves` | `created_at` | timestamptz | no | `now()` | — |
| `save_audit` | `id` | bigint | no | identity | PK, generated always |
| `save_audit` | `user_id` | uuid | no | — | FK → `auth.users(id)` on delete cascade |
| `save_audit` | `occurred_at` | timestamptz | no | `now()` | server clock |
| `save_audit` | `outcome` | text | no | — | `accepted` or `rejected` |
| `save_audit` | `error_code` | text | yes | — | present exactly when rejected; a code from the protocol vocabulary |
| `save_audit` | `base_revision` | bigint | yes | — | what the client claimed to be building on |
| `save_audit` | `resulting_revision` | bigint | yes | — | present exactly when accepted |
| `save_audit` | `document_bytes` | integer | no | — | `>= 0`; body size, for abuse analysis |
| `save_audit` | `client_reported_at` | timestamptz | yes | — | the client's own claimed time, recorded and never trusted; a clock attack is visible as divergence from `occurred_at` |
| `save_audit` | `detail` | jsonb | yes | — | ≤ 4096 bytes; server-authored reason |
| `recovery_codes` | `id` | uuid | no | `gen_random_uuid()` | PK |
| `recovery_codes` | `user_id` | uuid | no | — | FK → `auth.users(id)` on delete cascade |
| `recovery_codes` | `code_hash` | text | no | — | unique; 64 lowercase hex characters |
| `recovery_codes` | `created_at` | timestamptz | no | `now()` | — |
| `recovery_codes` | `redeemed_at` | timestamptz | yes | — | mutually exclusive with `revoked_at` |
| `recovery_codes` | `revoked_at` | timestamptz | yes | — | set when a replacement code is issued |
| `leaderboard_entries` | `board_key` | text | no | — | PK part 1; `^[a-z0-9][a-z0-9._-]{0,63}$` |
| `leaderboard_entries` | `user_id` | uuid | no | — | PK part 2; FK → `auth.users(id)` on delete cascade |
| `leaderboard_entries` | `display_name` | text | yes | — | 1–24 characters; snapshot taken at publish time |
| `leaderboard_entries` | `metric_exact` | text | no | — | 1–64 characters; serialized `GameNumber`, the only displayed value |
| `leaderboard_entries` | `metric_log10` | double precision | no | — | finite, not NaN; sort key only, never displayed |
| `leaderboard_entries` | `source_revision` | bigint | no | — | `> 0`; the `saves.revision` this entry derives from |
| `leaderboard_entries` | `updated_at` | timestamptz | no | `now()` | maintained by `leaderboard_entries_set_updated_at`; the ranking tie-break |
| `entitlements` | `user_id` | uuid | no | — | PK part 1; FK → `auth.users(id)` on delete cascade |
| `entitlements` | `entitlement_key` | text | no | — | PK part 2; must be a known key |
| `entitlements` | `granted_at` | timestamptz | no | `now()` | — |
| `entitlements` | `granted_by` | text | no | — | 1–64 characters; no client path grants |
| `entitlements` | `source` | text | yes | — | why it was granted |
| `entitlements` | `revoked_at` | timestamptz | yes | — | — |

### Indexes, and the ones deliberately absent

| Index | Table | Definition | Why |
|---|---|---|---|
| PK | `profiles` | `(id)` | Only access path is by user. |
| PK | `saves` | `(user_id)` | Only access path is by user. **No secondary index exists**: at the recorded scale of ~10⁴ rows every read and write is by primary key, so another index would cost writes and buy nothing. |
| `save_audit_user_time_idx` | `save_audit` | `(user_id, occurred_at desc)` | Per-user history when investigating one account. |
| `save_audit_rejected_time_idx` | `save_audit` | `(occurred_at desc) where outcome = 'rejected'` | Partial, because Step 35's alert watches the rejection rate and rejections are the rare minority. |
| `recovery_codes_hash_key` | `recovery_codes` | unique `(code_hash)` | Redemption looks a code up directly instead of scanning. |
| `recovery_codes_one_active_per_user_idx` | `recovery_codes` | unique `(user_id) where redeemed_at is null and revoked_at is null` | Enforces at most one live code per user in the database rather than in application logic. |
| `leaderboard_entries_rank_idx` | `leaderboard_entries` | `(board_key, metric_log10 desc, updated_at asc)` | The ranking query. The trailing column is the tie-break; Step 27 may choose a different one, which is an index change, not a table change. |
| PK | `leaderboard_entries` | `(board_key, user_id)` | One entry per user per board. |
| PK | `entitlements` | `(user_id, entitlement_key)` | Covers lookup by user as a prefix, so **no separate per-user index exists**. |

### Row-level security

RLS is **enabled on every table**. Anything not listed is denied. The service
role used by Edge Functions bypasses RLS and is the only writer anywhere in this
schema.

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | own row | none — created by the `on_auth_user_created` sign-up trigger (Step 9) | own row | none |
| `saves` | own row | **none** | **none** | **none** |
| `save_audit` | none | none | none | none |
| `recovery_codes` | none | none | none | none |
| `leaderboard_entries` | all rows, every column but `user_id` | none | none | none |
| `entitlements` | own row | none | none | none |

`saves` denying every client write is the rule the whole anti-cheat design rests
on: row-level security cannot re-simulate a save, so it cannot judge one, and a
client that could reach `saves` through PostgREST would make Phase 4 decoration.
Step 15 establishes it and Step 26 attacks it.

`leaderboard_entries` is world-readable by design — that is what a leaderboard
is. It carries its own `display_name` snapshot precisely so that publishing a
board does **not** require widening `profiles` beyond own-row access.

Its `user_id` is withheld at the **grant** level rather than the policy level,
because a row policy alone does not constrain which columns a caller asks for:
against a world-readable table, `?select=user_id` would enumerate the
`auth.users` id of every player who has ever published to a board, with no
authentication at all. Grants and row-level security are independent and both
must permit a read, so `revoke select … ; grant select (board_key,
display_name, metric_exact, metric_log10, source_revision, updated_at)` keeps
the board public without publishing ids. Two consequences for Step 27, recorded
rather than discovered and verified against the local stack: a client cannot
select, filter, or sort by `user_id`, so "where do I rank" is answered by the
Edge Function rather than by a direct query here; and `select=*` is refused
outright (`42501`), because PostgREST expands it to every column including the
withheld one, so a board query must name its columns.

### Relationships and deletion

Every table holds exactly one foreign key, to `auth.users(id)`, with
`on delete cascade`. There are no other relationships. That gives Step 33 a
single deletion path: removing the `auth.users` row removes every row this
schema holds for that person.

**Invariant for every future table:** it must carry a cascading foreign key to
`auth.users(id)`, or declare its own explicit deletion path in the same change.
Step 33's test enumerates the tables, so one added without a deletion path fails
it.

Consequence recorded rather than discovered later: `save_audit` rows cascade
away with the account, so deleting an account also erases the evidence of abuse
from it. That is the right default while no money is at stake and GDPR is
assumed to apply, and it is a trade, not an oversight.

### Recovery-code hashing

`code_hash` holds an HMAC-SHA-256 digest, hex-encoded, of the recovery code
under a pepper held in Edge Function configuration and **never** stored in the
database. Plaintext codes are never stored, logged, or returned after issuance.

A fast keyed digest is correct here rather than a slow password hash: the code
is a high-entropy machine-generated secret, not a human-chosen password, so
there is no small candidate space to make expensive. Keeping the pepper outside
the database means a database leak alone does not permit offline enumeration,
and the unique index on the digest is what lets redemption find the row without
scanning. Step 14 fixes the code's own format and entropy.

There is deliberately **no per-code failed-attempt counter**: a wrong code
usually matches no row at all, so counting per code would miss the attack.
Throttling belongs per caller and per address, in Step 25.

### What Step 3 does not design

- The Step 32 account audit log covering identity changes, recovery issuance and
  redemption, and entitlement grants. It is a separate table designed in its own
  step; merging it with `save_audit` would put frequent save rows and rare
  identity events in one table with opposing access patterns.
- The leaderboard metric, reset period, and tie-break — Step 27. The schema is
  metric-agnostic on purpose: a season or period is a `board_key` value, not a
  schema change.
- Rate-limit counters — Step 25, which may use platform facilities rather than
  tables.
- `offlineGrant` and anything Step 22 needs beyond `received_at`, which already
  anchors it.

**IndexedDB database:** `cat-mine-idle`, schema version `1`.

| Object store | Field | Type | Required / nullable | Key / constraint |
|---|---|---|---|---|
| `saves` | `id` | string | Required, non-null | Primary key via key path `id`; application writes only the literal `active`. |
| `saves` | `document` | structured-clone-compatible `SaveDocumentV1` object | Required, non-null | Must pass version-1 migration and validation before runtime deserialization. |

The store has no auto-increment key, secondary indexes, foreign keys, relationships, or additional records by design. `put({ id: 'active', document })` replaces the prior snapshot, enforcing one logical active save. Dexie database version 1 creates `saves` with schema string `id`; no IndexedDB structural migration exists. At the document layer, legacy version-1 saves containing the former four-floor prefix are expanded to fifteen floors before validation, with floors 5–15 initialized as locked defaults; the document and database versions remain `1`.

**Synchronous lifecycle journal:** localStorage key `cat-mine-idle:lifecycle-save-v1`.

| Key | Value | Lifetime / relationship |
|---|---|---|
| `cat-mine-idle:lifecycle-save-v1` | JSON string encoding one validated `SaveDocumentV1` | Written synchronously only at hidden/pagehide boundaries; considered only when newer than the valid IndexedDB record; removed after the same-or-newer document commits to IndexedDB. |

The journal introduces no new save schema version and is not a second progression store. Malformed or unsupported journal values are discarded and never override a valid IndexedDB snapshot.


## Marketplace popup — 2026-09-09

The user authorized the Shop icon to open a marketplace design for buying and
hourly rental of cat roles. `src/ui/MarketplaceModal.ts` now owns a native modal
dialog opened by `BootScene`'s Shop callback. It blocks background input, restores
scene input on close, supports Escape/native focus containment, and is destroyed
on scene shutdown. The responsive navy/gold interface includes Buy, Rent and My
listings, name search, role/rarity filters, price sorting, empty-state reset, cat
details, 1–24 hour rental totals, and validated session-only listing drafts with
removal. Four catalog portraits (Mofy, Baron, Elon, Cipher) are copied into
`public/assets/marketplace/` for this presentation only; gameplay assignments
and rarity bonuses are not integrated.

This is explicitly a Preview with sample prices/listings. Live trading is disabled;
no ownership inventory, transaction service, gold debit, or public listing is
implemented. Drafts survive popup close but disappear on reload. No database,
IndexedDB, localStorage journal, save-document, or server schema changes.
The existing server milestone remains at Step 8 awaiting validation.

Validation: production build and lint pass. Marketplace browser coverage checks
390×844 and 320×568 layouts, search/filter/reset, rental totals, draft creation
and removal, disabled live trading, and Escape dismissal. Navigation coverage
closes Marketplace before testing the remaining icons.

## Marketplace hardening and close-race correction — 2026-09-10

`MarketplaceModal` is exported from the `src/ui/index.ts` barrel, restoring the
rule that each layer's public surface is re-exported from its `index.ts`.
`BootScene` still imports it by deep path, as it does `MineShaftUpgradeModal`.

The modal constructs its entire tree with `createElement`/`textContent`. No
`innerHTML` or `insertAdjacentHTML` remains anywhere in `src/`. This is a
structural decision, not a cleanup: the marketplace is the one screen whose
purpose is to render listings authored by other players, so the day `CATS` stops
being a module constant, the template-string form would have been a stored-XSS
sink. It narrows what finding F5 describes without closing it — `index.html`
still ships no Content Security Policy, and F5 remains the single open item in
`memory-bank/server-threat-model.md` §9.

The close contract is now explicit. `dialog.close()` queues its `close` event as
a task, so the native event — not `#close()` — is the sole place `#onClose()`
runs, and a `#destroyed` flag suppresses it for the teardown path where
`destroy()`'s synchronous `remove()` has already run. Suppression is safe
because Phaser's `InputPlugin.start()` sets `enabled = true`, so a scene restart
re-enables input regardless of whether the callback fired. `BootScene`
surrenders scene input only after an explicit `this.#marketplace !== null`
check, so input is never disabled for a modal that cannot restore it.

`data-marketplace-close-count` is part of that contract rather than a bare
counter: `BootScene` bumps it inside `#onClose()` *after* re-enabling input, so
it is the one observable that proves input is live again. Browser tests wait on
it before dispatching the next canvas press.
