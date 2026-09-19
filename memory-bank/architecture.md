# Architecture

## Current Status

All 37 implementation-plan steps are complete and user-validated; Step 37 was validated on 2026-09-08, closing the base-game milestone. Step 37 changed no runtime code: it added `README.md`, corrected documentation that still described a four-floor mine and a round-robin elevator, and repeated the mobile benchmark against the full fifteen-floor scene. The physical mid-range Android Chrome pass and a human 30-second-comprehension playtest remain open caveats rather than blocking gates. This document describes the delivered base game and the server milestone layered over it. The IndexedDB database schema version remains 1; the save-document schema is version 2; the local Supabase schema contains seven public tables.

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
| `src/platform/web/bindSaveLifecycle.ts` | Browser `visibilitychange` and `pagehide` binding that queues the current document, forces a flush, and (Step 19) fires the optional best-effort `onForceSave` callback so a lifecycle flush is one of §9's forced cloud-upload triggers. |
| `src/platform/web/WebLifecycleSaveJournal.ts` | Validated synchronous pagehide journal plus an active-save repository decorator that selects a newer valid lifecycle snapshot and clears it after IndexedDB catches up. |
| `src/persistence/ReplicatingActiveSaveRepository.ts` | Server-milestone Step 19: composes the local repository with a cloud replica behind `ActiveSaveRepository`. Reads local only; writes local first and awaits it before offering the same document to the replica; `forceCloudUpload` is the §9 forced-trigger entry point. |
| `src/persistence/cloudSaveReplica.ts` | Server-milestone Step 19: pure, injected upload policy — §9's 60 s interval, coalescing, forced bypass, bounded retry backoff, and §7's `409` handling through `resolveSaveConflict`. Holds no `fetch`, no DOM type, and no storage. |
| `src/platform/web/cloudSaveUpload.ts` | Server-milestone Step 19: the single network call (`PUT /v1/save`), mapping every §4 status to `CloudSaveUploadResult` and refreshing the session once on `unauthenticated`. Never throws. |
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
| `src/core/` | Owns renderer-independent numbers, authoritative state, fixed-step timing, the production pipeline, derived rates, upgrades, milestones, sequential unlocks, deterministic economy analysis, offline-income calculation, pending-reward claim transitions, and the server-side progress bound on an uploaded save (`src/core/anti-cheat/progressBound.ts`). |
| `src/config/` | Owns typed data-driven starting values, unlocks, stage timing/capacity, upgrade curves, milestones, and validation. |
| `src/game/` | Owns the Phaser game configuration, semantic placeholder-asset manifest, pure portrait geometry, pure presentation models and cosmetic animation maths, live simulation driver, reusable HUD/floor/shared-stage/purchase views, generated-sprite presentation, interactive controls, scroll input, and the single scene that pulls snapshots into them. |
| `src/ui/` | Owns the offline-reward modal, live mine-floor upgrade modal, and save-diagnostic notice. The HUD remains a Phaser view. |
| `src/persistence/` | Owns the save-document boundary, storage interface, Dexie active-save adapter, debounce/failure coordinator, runtime deserialization, and recovery-aware active-game loading. |
| `src/platform/web/` | Owns the implemented save lifecycle binding and, since server-milestone Step 8, the Supabase client factory and anonymous guest-session bootstrap — the first `src/` code that makes a network call, never awaited before boot and never throwing. Broader browser lifecycle translation remains future work. |
| `public/assets/placeholder/` | Runtime original placeholder sprites, art-direction brief, and provenance manifest. Generated source and processor outputs live in `art-source/placeholder/` so production builds ship only the semantic runtime files. |
| `tests/unit/` | Deterministic core, economy, save, migration, offline-income, and anti-cheat progress-bound tests. |
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

Before a hidden or pagehide save is stamped, the browser host advances the driver to the event's wall-clock boundary. The same document is written synchronously to the lifecycle journal and asynchronously queued for the authoritative IndexedDB record. If teardown aborts IndexedDB, the next boot validates both candidates, selects the newer valid version-2 document, persists the settled result to IndexedDB, and then clears the journal. Hidden-tab gaps run the real pipeline at foreground rate; closed-page gaps use saved-rate offline efficiency. Each elapsed interval is consumed by exactly one path.

## Save Document Schema — Version 2

Version 2 is a strict plain-JSON document. Unknown properties are rejected. Runtime `GameNumber` values serialize as finite decimal/scientific strings and are reconstructed only after validation. Version 2 added `state.warehouse.totalOfflineGoldClaimed` (Server-milestone Step 18); a version-1 document is upgraded by defaulting that counter to `"0"`, which is exact because no version-1 save recorded an offline claim in it.

| Path | JSON type | Constraints / relationship |
|---|---|---|
| `schemaVersion` | integer | Required; exactly `2`. A version-`1` document is upgraded by the migration dispatcher. Missing and unsupported versions fail. |
| `savedAtTimestampMs` | number | Non-negative safe integer; cannot precede `state.lastUpdateTimestampMs`. |
| `effectiveProductionRatePerSecond` | string | Finite non-negative serialized `GameNumber`; authoritative rate snapshot used by offline-income calculation. |
| `state` | object | Exact serialized authoritative state described below. |
| `state.saveVersion` | integer | Required; exactly authoritative state version `1`. |
| `state.lastUpdateTimestampMs` | number | Non-negative safe integer. |
| `state.simulationTick` | integer | Non-negative safe integer. |
| `state.simulationRemainderMs` | number | Finite value in `[0, 100)`. |
| `state.gold` | string | Finite non-negative serialized `GameNumber`. |
| `state.floors` | array | Exactly fifteen entries in configured order with the exact configured identifiers and floor numbers. Legacy four-floor payloads (version 1 or 2) are expanded before validation. |
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
| `state.warehouse.totalGoldDelivered` | string | Finite non-negative serialized `GameNumber`; lifetime warehouse deliveries. |
| `state.warehouse.totalOfflineGoldClaimed` | string | Finite non-negative serialized `GameNumber`; lifetime `claimOfflineReward` grants. Monotonic, and part of the save-conflict progress vector. Defaults to `"0"` when a version-1 document is migrated. |

`createSaveDocument` derives the rate snapshot and serializes state, `migrateSaveDocument` is the single version-dispatch entry point (upgrading a version-1 document by defaulting `state.warehouse.totalOfflineGoldClaimed` to `"0"` and stamping version 2), `validateSaveDocument` enforces this schema and configured relationships, and `deserializeSaveDocument` reconstructs `GameNumber` instances only after successful migration and validation. Level-derived capacities are compared through their canonical serialized form so valid floating-point-backed upgrade effects survive JSON and IndexedDB round trips exactly.

## Save Recovery Contract

`loadActiveGame` is the application load boundary above raw persistence. Empty storage creates a normal fresh state without a warning. A valid document is fully migrated, validated, and deserialized before any authoritative state is returned. If migration or validation fails, no field from the candidate enters runtime state: the loader classifies unsupported schema versions as incompatible and all other invalid candidates as corrupt, records a stable warning with a detached structured-clone snapshot when safe, and creates a complete fresh state at the caller-provided timestamp. Diagnostic callbacks are best-effort and cannot turn a recoverable persistence or save-format failure into an uncaught exception. The invalid IndexedDB record is not mutated during recovery.

## Offline Income Contract

Offline income is configured with a 7,200,000 ms cap and 0.5 efficiency. One pure function, `calculateOfflineGrant(receivedAtTimestampMs, currentTimestampMs, rate, config)`, computes the reward from two opaque timestamps; `calculateOfflineIncome` (the client's local projection) and `save-sync`'s download handler (the server's authoritative grant) both call it, so the formula, the cap, and the efficiency cannot drift between them (finding F4). The two timestamps are not symmetric in authority: the client projection passes the document's own `savedAtTimestampMs` and `Date.now()`, while the server passes the stored `received_at` and its own `now()`, which is what makes a manipulated device clock irrelevant to the credited amount (Step 22).

`calculateOfflineIncome` clamps credited time to the cap, returns `rate × creditedSeconds × efficiency` as a `GameNumber`, awards zero for a receipt at or after the current time, and immutably replaces `lastUpdateTimestampMs` with the injected current time. During a valid `loadActiveGame`, that timestamp-settled state is serialized with a freshly derived rate snapshot and force-flushed before a positive pending reward is returned. A second load at the same timestamp therefore returns zero reward. If settlement persistence fails, the session continues with a save diagnostic but the exposed reward is zero so an unconsumed interval cannot be claimed and then duplicated.

The browser creates a pending-reward view model only for a positive calculated reward. Its accessible modal displays credited duration and the exact serialized reward. `claimOfflineReward` adds that value once to a new authoritative state and consumes the pending value; a call with no pending value is an identity result. Browser orchestration applies that state to the simulation driver, force-persists it before dismissing the modal, and guards the claim with a consumed-once flag rather than a cached state candidate: production continues while the modal is open, so a retry after a failed write saves the mine as it is at that moment and still adds the reward exactly once. The version-2 save schema and the version-1 IndexedDB schema are unchanged by a claim beyond the two counters it legitimately moves: only the post-claim authoritative snapshot is stored.

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
`memory-bank/server-save-sync-protocol.md`. Steps 15–19 implement it: the
local-write-denied `saves` table (15), `PUT /v1/save` (16), `GET /v1/save`
plus the boot reconcile (17), the §7 conflict policy (18), and the client
remote repository with §9's upload cadence and §7's `409` half (19).

`GET /v1/save` and `PUT /v1/save` on a Supabase Edge Function are the only save
path; `saves` denies client writes entirely, so PostgREST is never used for a
save. A `SaveDocumentV2` crosses the wire byte-for-byte — the protocol adds no
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
plus `elevator.level`, `warehouse.level`, `warehouse.totalGoldDelivered`, and
`warehouse.totalOfflineGoldClaimed`.
One document dominating the other is adopted silently because it loses nothing;
only a genuine fork asks the player. `gold` and every queue, progress, and
cursor value are excluded because they legitimately fall, which is the same
distinction Step 23 makes. Excluding `gold` is sound only because every gold
*source* is vectored: Step 18 added `warehouse.totalOfflineGoldClaimed` so an
offline reward can no longer move `gold` without moving the vector (see the
Step 18 section below). The predicate is pure, operates on two
`SaveDocumentV2` values, and belongs in `src/persistence` — `src/core` must not
learn that saves exist. It holds only while those fields are monotonic, so a
prestige or reset mechanic would have to revise it in the same change, and a new
gold source would have to join the vector.

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
│   ├── 20260908130000_create_platform_tables.sql
│   ├── 20260913090000_recovery_code_rotation_rpc.sql
│   ├── 20260913090100_recovery_code_revert_rpc.sql
│   ├── 20260913090200_recovery_code_rpc_grants.sql
│   ├── 20260918100000_leaderboard_lifetime_gold_board.sql
│   └── 20260919100000_account_audit_log.sql
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
    ├── entitlement-check/          Step 31's server-owned effect check
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
pipeline a real file to apply. **The second migration lands the original six
designed tables**, verbatim against the "Complete Database Schema" block below,
with row-level security enabled on every one and exactly the policies that
block's RLS matrix names — `profiles`/`entitlements` select-own, `profiles`
update-own, `saves` select-own with no write policy anywhere,
`leaderboard_entries` select-all, and `save_audit`/`recovery_codes` with no
policy at all, which denies every non-service-role access outright. The
Step 32 migration adds the seventh `account_audit` table, its triggers, and the
service-only append path. `supabase/seed.sql` inserts one
local-only fixture guest so Studio shows a real row without the Step 8 sign-in
flow existing yet; `saves`, `save_audit`, `leaderboard_entries`, `entitlements`,
and `account_audit` stay unseeded until the steps that produce real rows for
them (16, 24, 28, 31, 32) exist.

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

`HudView.ts` now adds a compact settings control beside the income value. It
opens `src/ui/AccountSettingsModal.ts`, a DOM modal with keyboard focus,
account status/email/user id, app version, and either Google sign-in or
logout-and-reset. The modal keeps auth effects injected from `src/main.ts`,
while the DEV-only `window.catMineIdleAccount` hook remains for guided
verification and collision diagnostics.

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
- **Upper-bound validation (Step 23)**: after the `baseRevision` concurrency
  check and before any write, `handleSaveUpload` calls
  `findProgressBoundViolation` (`src/core/anti-cheat/progressBound.ts`'s
  `evaluateProgressBound`). It re-derives, from the last accepted document over
  the server-measured elapsed time, the most the mine could have produced, and
  returns `422 save_rejected` with `detail: { counter, claimed, maximum }` for a
  document that claims more; the stored row and revision are unchanged. **A
  first upload (`current === null`) is exempt**, and a stored row whose document
  or `received_at` cannot be read also skips the check (logged), so the server
  never rejects an honest save over its own unreadable row. When the tight bound
  fails but the row's one-generation ancestor exists, the check is retried
  against that ancestor over the full interval — a §7 branch re-upload diverged
  from it, not from the stored row (review finding F2). The modelling rule, the
  carried terms, and the tolerance are in the Step 23 section below; every
  authenticated attempt also writes one `save_audit` row (Step 24 section below).
- **Download** (`GET`): `200 {revision, receivedAt, document}` when a row
  exists, `204` with no body otherwise — "the normal first-sign-in path, not
  an error."

`src/persistence/saveConflictPolicy.ts` is Step 18's implementation of §7's
conflict policy — the single adjudicator both the boot reconcile and (from
Step 19) the upload `409` path call:

- `compareProgress(left, right)` — the §7.1 dominance comparison over the
  "progress vector" `M`: per floor (all fifteen) `isUnlocked`,
  `mineShaftLevel`, `totalExtracted`, `totalTransported`; `elevator.level`;
  `warehouse.level`, `warehouse.totalGoldDelivered`,
  `warehouse.totalOfflineGoldClaimed`. Returns `'equal'`, `'left-dominates'`,
  `'right-dominates'`, or `'fork'`. Deliberately excludes `gold`, every queue,
  `carriedMaterial`, every `*Progress` fraction, `roundRobinCursor`,
  `simulationTick`, and all timestamps — idle play alone moves those from the
  very first tick, so including any of them would report a fork on a device
  that had merely bought an upgrade. Pure, no network or renderer, beside
  `saveSchema.ts` and never in `src/core`. It also returns `'fork'` rather than
  throwing when the two floor arrays differ in length, so a caller that hands a
  `409` body straight in (as Step 19 will) cannot make it throw a raw
  `TypeError`.
- `resolveSaveConflict(local, remote)` — applies §7: `remote === null` (the
  account has no cloud save) keeps local; otherwise `equal` → `'same-progress'`,
  dominance → the dominating side, and neither-dominates → `'fork'` carrying
  both §7.3 candidates. Step 17 shipped a narrower "does each side have any
  progress at all" placeholder, deliberately; Step 18 replaces it, so a
  strict-superset save is now adopted silently instead of asking.
  **`gold` needs no special-casing because the vector completes its sources.**
  `gold = startingGold + totalGoldDelivered + totalOfflineGoldClaimed − spent`,
  and `spent` is a deterministic function of the levels and unlocks already in
  `M`, so equal `M` implies equal `gold` and a dominating side has earned at
  least as much cumulatively. A 2026-09-13 review found the earlier state — an
  offline reward moving `gold` while touching no vector field — let a
  strict-subset save be silently bankrupted by a dominating one; two heuristic
  fixes (a `gold`-size comparison, then a lifetime-cumulative bound) were both
  wrong (the first forked ordinary purchases and the new-device restore path,
  the second was dead after any spending because `gold` falls while the bound
  grows). The structural fix completed the vector by crediting
  `warehouse.totalOfflineGoldClaimed` in `claimOfflineIncome.ts` and adding it
  to `M`, so `resolveSaveConflict` carries no gold logic and needs no balance
  config at all.
- `describeSaveConflictCandidate(document, lastPlayedMs)` — §7.3's display
  fields: `gold` and `totalGoldDelivered` as `GameNumber` (formatted by the
  display layer through `formatAmount`, which is why this module stays free
  of `src/game`), `floorsOpen` (count of `isUnlocked`), and
  `deepestShaftLevel` (max `mineShaftLevel` across unlocked floors), plus
  the candidate document itself so a choice can be applied verbatim. The
  local candidate's `lastPlayedMs` is `savedAtTimestampMs`; the server
  candidate's is the upload's `receivedAt`.

`src/platform/web/cloudSaveReconcile.ts`'s `reconcileCloudSaveAtBoot` is the
boot-order half (§11): downloads via `downloadCloudSaveViaFetch`, reads the
local document via the injected repository (treating no local record at all
— a genuinely new device — as the same fresh baseline `createInitialGameState`
produces, not as "nothing to compare"), runs the downloaded document through
`validateSaveDocument` before using it at all — a 2026-09-12 review found the
original code cast `body.document` straight to an unvalidated document type with no
migration, harmless only by luck until a schema 2 exists to skip past — and
applies `resolveSaveConflict`. `'remote-dominates'` writes the cloud document
into local storage and reloads the page; `'local-dominates'` and
`'same-progress'` are no-ops (the local document already holds at least the
server's monotonic progress — adopting the remote over `'same-progress'` would
only discard local gold or queues for no progress gain). A `'fork'` writes
nothing at all and is returned as
`{ kind: 'deferred-conflict', local, remote }`, carrying both §7.3 candidates
so the save the player did not choose is retained for the session. §7's
requirement is absolute: no accepted branch may destroy progress the player was
not shown, and a fork is the only branch a silent resolution cannot cover.
`src/main.ts`'s `triggerCloudSaveReconcile` stores that outcome in
`pendingSaveConflict`, publishes a compact candidate summary (never two whole
documents) as `app.dataset.cloudSaveReconcile`, and opens the production
account modal's chooser. The remote candidate carries its server revision so
choosing the local branch can perform one compare-and-swap upload; choosing
the cloud branch stores that document and reloads. Logout signs out, clears
the lifecycle journal and IndexedDB active save, then reloads into a new guest.

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

### Client remote repository (Step 19)

The plan's own words — "IndexedDB stays the primary store and the cloud is a
replica. Network work belongs in `src/persistence` and `src/platform`;
`src/core` must not learn that a server exists" — split across three new
modules plus two small additions to existing ones.

`src/persistence/ReplicatingActiveSaveRepository.ts` implements
`ActiveSaveRepository` by composing the existing
`LifecycleSafeActiveSaveRepository` (Dexie plus the lifecycle journal) with a
`CloudSaveReplica`:

- `loadActiveSave` reads local only. §11 forbids a network call on the boot
  path, and the download half is the separate boot reconcile.
- `storeActiveSave` awaits `primary.storeActiveSave(document)` and only then
  calls `replica.enqueue(document)`, un-awaited. A failed local write still
  rejects, so `SavePersistenceCoordinator` reports its `save-failed`
  diagnostic exactly as before; the replica can never turn a successful local
  save into a failure.
- `forceCloudUpload(document?)` is the §9 forced-trigger entry point and uses
  the most recently stored document when none is passed.

`src/persistence/cloudSaveReplica.ts` is the pure policy half. Every
collaborator is injected — the upload call, `now`, and the timer functions —
so Node tests drive the cadence and backoff with fake timers, and the module
holds no `fetch`, no DOM type, and no storage:

- **§9 cadence**: at most one upload per 60 s; coalescing keeps only the
  newest queued document; `enqueue(..., { force: true })` bypasses the
  interval but not an in-flight upload.
- **§9 backoff**: a retryable failure schedules 1/2/4/8/16 s, at most five
  retries (six requests including the initial one), then stops cloud sync for
  the session. Retries never block a
  frame or a local save, and a failure that is terminal per §4
  (`forbidden`/`malformed_request`/`payload_too_large`/`schema_unsupported`)
  stops sync immediately, while `save_invalid`/`save_rejected` drop only that
  document and keep syncing — the dropped document is remembered by
  serialization, so the coordinator's next identical re-offer is not retried.
- **§7 on `409`**: the `409` body is validated first, so the pure predicate
  never indexes into an unvalidated document — exactly the caller Step 18's
  own comment said must exist. `resolveSaveConflict` then decides:
  `same-progress` adopts the server revision silently (the lost-response
  retry); `local-dominates` re-uploads against the server revision; the
  caller's `onRemoteDominates` adopts a dominating remote; and a `fork` is
  emitted with both §7.3 candidates so the caller can retain them. A
  conflict-resolution cap of five turns an adversarial ping-pong into a
  stopped session rather than a request flood.
- **Arming**: `arm(revision)` is idempotent and gates all uploads until the
  boot download settles. Without it, a returning player's first routine save
  carries a null `baseRevision` — "this client has never synced" — against a
  row the server already holds and earns a real, avoidable `409`.

`src/platform/web/cloudSaveUpload.ts` is the one network call,
`uploadCloudSaveViaFetch` (`PUT /v1/save`), mirroring
`downloadCloudSaveViaFetch`. It maps every §4 status to the typed
`CloudSaveUploadResult`, refreshes the session once on `unauthenticated` and
retries, and turns a rejected `fetch` into `retryable` rather than throwing.

`reconcileCloudSaveAtBoot` gained two things: `CloudSaveDownload` now carries
the server `revision`, and a new optional `onServerRevision` dep is called as
soon as the cloud document is in hand. `src/main.ts` uses it to arm the
replica with the real revision, then forces the §9 triggers — lifecycle flush
(via `bindSaveLifecycle`'s new best-effort `onForceSave`), claimed offline
reward, and once after boot reconcile when the outcome is `kept-local` or
`no-cloud-save`. A `fork` stops the replica rather than re-uploading a
document the policy just refused; a dominating remote is adopted through the
same unbind-and-clear journal store-and-reload path as the boot reconcile;
and an upload fork's candidates land in the same `pendingSaveConflict`
session hook Step 18 established.

The boundary is enforced, not just documented: `eslint.config.mjs` now bans
`fetch`, `XMLHttpRequest`, `WebSocket`, and `EventSource` inside
`src/core/**`, and `tests/unit/architecture.test.ts` probes all four.

A 2026-09-14 review fixed eleven issues here. **The upload `409` fork now calls
`stop()`**, exactly like the boot fork: the client holds the server's revision
after the conflict, so without stopping, one later routine save would be
accepted and silently replace the remote branch the player was never shown
(§7 preamble and §7.3). Terminal cloud failures also reach the player:
`describeCloudSaveNotice(code)` maps every §4 failure code to its exact copy
under a namespaced `cloud-sync-*` code, and `src/main.ts`'s replica `onEvent`
reports it through the existing `SaveDiagnosticBanner` on
`sync-stopped`/`document-dropped`; retryable failures still show nothing while
a retry is pending. A `save_invalid`/`save_rejected` save is remembered by the
*shape* of its authoritative state (stable across moving values, so the loop
does not survive a fresh timestamp) and is not retried by the routine cadence;
a **forced** trigger still bypasses that guard, and a successful one clears it,
so sync is genuinely live (`isStopped` stays false) and a transient
server-side rejection can recover without a reload (R1, pass 3). The
mid-session `remote-dominates` adopt sets `localSavesSuspended` and cancels the
coordinator's scheduled save before storing and reloading, and the
purchase/heartbeat/claim paths honour it. `local-dominates` preserves a newer
queued document; the retry budget is five retries after the initial request
(so the 16 s step is reached); an unparseable `receivedAt` on a `409` is a
terminal `malformed_request`. The one real network adapter sends
`application/json; charset=utf-8`. On the server, `save-sync` now refuses only
a schema version newer than its own and passes older ones to the shared
`migrateSaveDocument` instead of rejecting them.

### Adopting an existing local save (Step 20)

A player who has been playing the client-only build holds a version-1
`SaveDocument` in IndexedDB, and the milestone must adopt it as the account's
cloud save on first sign-in rather than let a fresh one replace it.

`src/platform/web/cloudSaveReconcile.ts`'s `adoptExistingLocalSave` is the
named operation. It reads whichever document the lifecycle-safe repository
would load, runs it through the shared `validateSaveDocument` — which migrates
version 1 to version 2, expanding a legacy four-floor payload and defaulting
`warehouse.totalOfflineGoldClaimed` to `"0"` — and hands the migrated document
to the Step 19 replica's `forceCloudUpload`. It never throws: a missing local
record resolves `no-local-save`, a corrupt or unreadable one `unreadable`, and a
forced-upload collaborator that breaks its non-throwing contract `upload-failed`
(distinct from `unreadable`, because the save read and migrated fine).

`src/main.ts`'s boot-reconcile trigger (`forceCloudUploadLatestLocalDocument`)
delegates to it on `no-cloud-save` and `kept-local`. `no-cloud-save` is the
first-sign-in path: the account has no cloud save, so the local save becomes
the cloud save. The adopted document is therefore the **migrated** version-2
document, not the original version-1 bytes — the plan's Step 18 interaction
note records that, and the tests compare against the migrated document rather
than pretending the v1 bytes come back. The upload path already carries the
server's migration too (Step 19's `save-sync` change), so a raw version-1
payload is never refused.

Evidence: unit tests for `adoptExistingLocalSave` (a progressed migrated upload,
a legacy four-floor save expanded to fifteen floors, no local save, corrupt
document, a rejecting repository, and a throwing `forceUpload` reported
`upload-failed`); a live integration suite that uploads a pre-milestone document
and asserts the downloaded document is byte-for-byte the migrated one, with the
counter the only difference; and a server-e2e spec that seeds a real version-1
IndexedDB save, boots the browser, and requires the cloud copy to be
byte-for-byte the adopted local document.

### Surviving local storage eviction (Step 21)

Script-writable storage can vanish — the seven-day iOS Safari sweep, a
user clear, or a storage-pressure quota eviction. The milestone's promise is
that a player does not silently lose everything to it.

**Detecting a returning player.** `src/platform/web/guestSession.ts`'s
`ensureGuestSession` now reports `isNewSession`: `false` when it reused a
session already in storage, `true` when it minted one this boot. A reused
session with no local save is a state a first-time player can never be in, so
it is the one detectable "this device's save was evicted" signal. It is exposed
in the DEV `data-guest-session` diagnostic (a boolean, never the token).

**Restore, or tell the truth.** `reconcileCloudSaveAtBoot` already restores a
cloud save over a fresh local baseline (`remote-dominates`, Steps 17/18); Step
21 adds no new restore path. What it adds is the honest case: the pure
`shouldExplainMissingLocalSave` (`src/platform/web/localSaveRestore.ts`) is
`true` only for a reused session + **no local record at all** (`'missing'`) + a
`no-cloud-save` outcome, and `src/main.ts` reports the `local-save-missing`
notice through the save banner. A corrupt-but-present save is `'unreadable'`,
not `'missing'`: it already produced the accurate `corrupt-save` /
`incompatible-save` warning, and the notice must never overwrite it. The
decision is a three-way join (local-save state, `isNewSession`, reconcile
outcome) whose last-arriving member reports, so `loadActiveGame` finishing after
the reconcile's round trip cannot strand it.

**Guest path only.** The reused-session signal exists only for the anonymous
guest path (`ensureGuestSession`); Telegram sign-in mints a session from signed
`initData` with no reused-session signal, so `sessionIsNew` stays unset there and
the notice cannot fire. A returning Telegram player is restored from the cloud
by the reconcile like any other sign-in. This is deliberate, not an omission:
there is no honest way to tell a new Telegram player from a returning one whose
device lost its save, so the game does not pretend there is.

**Restore integrity.** The same change moved `reconcileCloudSaveAtBoot`'s
`onServerRevision` call to fire only on `kept-local`/`same-progress`. Arming the
replica before an `adopted-remote` outcome would pump a pending local document
— including the fresh one an evicted device just started — against the server
revision, and the accepted upload would overwrite the cloud save the adopt is
restoring. `src/main.ts` now stops the replica on `adopted-remote` as well as
`deferred-conflict`.

**Reducing the chance of eviction.** `src/platform/web/persistentStorage.ts`'s
`requestPersistentStorage` calls `navigator.storage.persist()` once, early,
feature-detected and non-blocking, then re-reads `persisted()` and
`estimate()`. It never throws and never treats a grant as a guarantee. The
browser's real answer is published as the DEV `data-persistent-storage`
diagnostic.

**The measurement.** The seven-day deletion behaviour is measured, not assumed;
the `persist()` half is recorded in `techContext.md` with its date and
environment. The deletion half needs a real iOS device and a seven-day
wall-clock observation (finding F8), and is recorded there as outstanding rather
than asserted.

**Early first sync.** Step 19's forced upload after boot reconcile
(`no-cloud-save`/`kept-local`) already ensures a player who never returns has a
cloud copy to restore; Step 21 relies on it rather than adding a second cadence.

### The server clock is the only clock (Step 22)

Offline settlement moved server-side. `save-sync`'s `GET /v1/save` computes an
`offlineGrant` from the stored `received_at` to the function's own `now()` and
returns it alongside the document; the device clock is never an input, so a
client reporting hours ahead, hours behind, or moving backwards receives the
same grant for the same real absence, and never more than the two-hour cap
(F4's economy preserved by sharing `calculateOfflineGrant` with the client).

On the client, `downloadCloudSaveViaFetch` parses the grant into
`CloudSaveDownload.offlineGrant`, and `reconcileCloudSaveAtBoot` reports it
through `onOfflineGrant` only for the outcomes that keep the page running
(`kept-local`, `same-progress`) — an `adopted-remote` outcome reloads, and the
next boot's download returns the same grant because no upload advanced
`received_at`. `src/main.ts` credits the server's grant as the authoritative
offline reward. The client's own projection is credited alone only where no
server figure can exist — an unconfigured build, or an account with no cloud
save (`204`); a failed download and a failed sign-in against a configured
backend both credit nothing and settle on the next boot that reaches the server.
Exactly one reward is presented, once the driver exists, because the download
can finish before or after the IndexedDB load.

`src/platform/web/appliedOfflineGrant.ts` records the `receivedAt` of the last
credited grant in script-writable storage, so a reload between crediting a grant
and uploading the credited state cannot credit the same server receipt twice.
That double-credit window is the only one: once the upload advances
`received_at`, the next grant covers only the new interval.

**Open-tab/closed-tab asymmetry is preserved.** A backgrounded-but-alive tab is
still advanced by `catchUpSimulation` at full pipeline rate; only a closed
interval reaches the server grant, credited at the 0.5 efficiency. The grant is
bounded by the client's own projection (`min`), because `received_at` is the
last successful upload rather than the moment play stopped, so crediting it
unbounded would hand back a cadence window — or hours, when sync lagged — of
time the open tab already produced at full rate. **A null or zero projection is
a zero bound, not an absent one**: a zero projection means the local save is at
least as recent as the grant's receipt (the tab flushed before reloading), so
nothing may be credited. `min` is cheat-safe: a manipulated clock can only make
the projection larger (the server grant wins) or smaller (the player
under-credits themselves), never more than either source.

**The reward is decided once, and bounded.** `chooseOfflineReward`
(`src/platform/web/chooseOfflineReward.ts`) is pure and unit-tested; it picks
the server grant when one is positive, bounds it by the local projection, and
credits the local projection alone only where no server figure can exist. The
download carries a 10 s timeout, so a stalled socket cannot hold the reward
indefinitely: on expiry the reconcile resolves `error`, which is deliberately
*not* a local-projection case — the server figure exists and was merely not
reached, so nothing is credited this session and the interval settles on the
next boot that reaches the server. A failed sign-in against a configured
backend is the same case one step earlier and is likewise not a fallback.
Without those rules, dropping one request, or clearing the auth entry, would
hand the device-clock cheat back.

**The client E2E gate is backend-free by configuration.** `playwright.config.ts`
pins `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` blank for the dev server, so
that suite exercises the client-only projection deterministically — the
behaviour those specs were written to pin (Step 19's "passes offline,
unchanged"). The production smoke pins the save-sync surface to "no cloud save"
for the same reason. The server-verified path is covered by the server
integration and server-e2e suites.

### Upper-bound re-simulation (Step 23)

`src/core/anti-cheat/progressBound.ts`'s pure `evaluateProgressBound` decides
whether an uploaded document claims more than the last accepted one could have
produced over the server-measured elapsed time. `save-sync` calls it on every
non-first `PUT /v1/save`; a violation becomes `422 save_rejected` with
`detail: { counter, claimed, maximum }`, and the stored row and revision are
untouched (§10.3).

**The modelling rule, stated rather than implied (finding F3).** Between two
uploads the server does not know which upgrades the player bought or when, so it
cannot compute a tight bound. It uses the shared core's own rate and cost
functions on the **candidate's final configuration**:

- A cumulative counter may not exceed its previous value plus the candidate's
  own production rate held for the whole interval, times the tolerance, **plus
  whatever material was already in the pipeline when the interval opened**. A
  proportional rate term alone is near-zero over a short interval, while one
  completed extraction cycle and one drained queue are fixed amounts, so
  without the carried terms a warm mine that simply kept playing is rejected
  (review finding **F1**). The carried terms are each unlocked floor's in-flight
  cycle yield (valued at the candidate's level, the largest it can complete at)
  and, for `totalTransported`/`totalGoldDelivered`, the material already sitting
  in floor queues, the elevator's load, and the warehouse's input queue. The
  counters bounded are each unlocked floor's `totalExtracted` and
  `totalTransported` (transport further capped by the shared elevator's
  throughput), `warehouse.totalGoldDelivered`, and
  `warehouse.totalOfflineGoldClaimed` (which carries no in-flight material — an
  offline claim is produced by an absence).
- The total gold the upgrades and floor unlocks between the two documents
  required (`state.upgradeSpend`, computed with the core's own batch-cost
  functions) may not exceed the previous balance plus **one** maximum-earning
  term. The interval was either played (deliveries) or spent away (a capped
  offline claim), never both at full rate, so the delivery and offline
  allowances are not added together (review finding **F5**).

**No ticks are simulated.** The interval can exceed `MAX_CATCH_UP_MS` (two
hours), so an `O(elapsed)` walk would blow the §7.1 upload latency budget, while
the shared rate model gives the same (looser) upper bound in `O(floors)`.

**Two anchors, because §7 makes forks first-class (finding F2).** The tight
bound measures from the stored row's own receipt. A device that resolves a `409`
re-uploads *its own* branch seconds after the branch that became the stored row,
and that branch diverged from an older common ancestor — measuring its whole
divergence against a few seconds rejects a legitimate merge and pins the
account to the inferior branch. The row keeps one generation of rollback
(`previous_document_json`/`previous_received_at`), so when the tight bound fails
and an ancestor exists, `save-sync` retries against that ancestor over the full
interval between its receipt and now. A candidate is accepted if either anchor
allows it. The accepted cost is that a strict-superset claim gains the wider
ancestor window; that is the same accept-biased direction as the tolerance.

**The ancestor anchor is one generation deep — a stated known limit (N1).** The
row keeps exactly one generation of rollback, so a fork is accepted only when
its divergence point is the stored row or its immediate predecessor. §9 allows a
peer one new generation per 60 s, so a fork older than roughly two minutes
against an actively-syncing peer — a tablet left open while the player plays on
their phone offline, which then dominates on return — has both anchors too
recent and its honest branch is rejected (reproduced: the peer uploading at
−60 s and now while the other device was away three hours rejects
`state.warehouse.totalGoldDelivered` against both anchors). This is the residual
of the F2 fix, **not** a claim that the fork case is closed. The sound full fix
is to retain fork points (a history/`saves`-schema change) or to have the client
supply a verifiable fork revision — a design decision that overlaps Step 24, not
a patch. A server-side "accept any strict superset" exemption was considered and
rejected: supersets are exactly what an inflating cheat submits, so it would gut
the bound. Until the fix lands, the player's local save and play are intact;
only the cloud copy lags, and Step 21's eviction restore would return that
branch, which is why the limit is tracked as an open risk in `progress.md`.

**Never current `gold`, and the same exclusion §7 makes.** `gold` legitimately
falls when the player spends, so it is bounded only indirectly, through spend;
this is exactly the reason `compareProgress`'s progress vector `M` omits `gold`
(§7.1). The economy is not changed: this only decides whether to reject a
document the client already produced.

**The tolerance, and its size.** `PROGRESS_BOUND_TOLERANCE = 0.05` absorbs the
remaining differences between the client's fixed-step simulation and the
continuous rate — sub-tick remainders, fractional yields, and the rounding in
each `GameNumber` update — without letting a materially larger claim through.
The rate model already over-estimates by holding the final configuration for the
entire interval and the carried terms already settle all in-flight material; the
5% covers only the residual. `tests/unit/progress-bound.test.ts` pins it from
**both sides** (over an interval long enough that the rate term dominates the
fixed carried amount), so widening it silently fails. The direction is
deliberate: per the threat model's §1 ranking, a player's own progress outranks
leaderboard integrity, so the bound prefers accepting a slightly generous save to
rejecting an honest one.

**First uploads and unreadable rows are exempt.** `findProgressBoundViolation`
returns `null` (accept) when the account has no stored row: there is no last
accepted document to bound against, and it is how a brand-new account seeds its
cloud save and how Step 20 adopts a save the player earned before the account
existed. A stored row whose document cannot be deserialized skips the check, and
so does a stored `received_at` that cannot be parsed — an unreadable row is the
server's own state being unreadable, not evidence against the document, and must
not collapse to a zero-second bound that rejects every claim (review finding
**F4**). The server therefore never rejects an honest save because its own row is
unreadable.

Evidence: 9 core unit tests (`tests/unit/progress-bound.test.ts`) covering honest
accept (including a warm mine over a short interval — the F1 regression), each
inflated counter, and both sides of the tolerance; server unit tests in
`save-sync/index.test.ts` (including the F2 ancestor-anchor and F4 skip); a live
integration suite (`tests/server-integration/save-rejection.integration.test.ts`)
plus the conflict/collision suites, whose `409` re-upload now commits through the
ancestor anchor with no extra `ageStoredSave`. `saveAgeFixture.ts`'s
`ageStoredSave` is used only where the fixture's document is a *linear*
descendant that stands for offline play, never to fake a divergent branch into
the linear bound.

### Rejection handling (Step 24)

**What a rejected save does to the player.** Nothing is lost. The local save is
written first and independently of the network (Step 19), so a refused upload
never touches it; the session keeps running; and the refusal reaches the player
as one banner notice through `describeCloudSaveNotice`. A `save_rejected` is
terminal-but-keep-syncing (§4): the replica drops *that document*, records its
state shape so routine saves of the same shape are not retried, and keeps
syncing. The player's next real play changes the shape, and a forced lifecycle
trigger bypasses the suppression and clears it on success, so a false positive
recovers without a reload. The exact copy is
"Your progress could not be verified and was not uploaded. Your game on this
device is unchanged."

**One `save_audit` row per authenticated attempt.** The table was designed at
Step 3 and already exists; Step 24 is its writer. `handleSaveUpload` records via
the new `writeSaveAudit` dep (`writeSaveAuditViaServiceRole` — the second and
last service-role use in this function, because `save_audit` grants no client
role any access at all):

- `outcome` (`accepted`/`rejected`), `error_code` (present exactly when
  rejected), `base_revision` (what the client claimed), `resulting_revision`
  (present exactly when accepted), and `document_bytes`.
- `client_reported_at` — the document's own `savedAtTimestampMs`, recorded
  verbatim and **never trusted**, so a device-clock attack shows up as
  divergence from the server's `occurred_at`. It is bounded to the range a
  `timestamptz` column round-trips through `Date#toISOString` (years 0001–9999);
  a value past that — which JS formats in the extended-year form Postgres
  refuses — is recorded as `null` with the raw claim kept in
  `detail.clientReportedAtOutOfRangeMs`. Without that bound the insert would
  throw, the best-effort writer would swallow it, and the attempt would leave no
  row at all — the field meant to expose a clock attack would erase its own
  evidence (review finding **H1**).
- `detail` — the server-authored reason: a Step 23 bound violation's
  `{counter, claimed, maximum}`, a validation `reason`, a conflict's
  `serverRevision`, the size cap and the client's declared length for a
  `payload_too_large`, or a malformed-body reason. This is what makes a bug
  distinguishable from an attack after the fact.

Accepted attempts are recorded too, not only rejections — the table was designed
for both, and its partial index on rejections exists because rejections are the
rare minority Step 35 will watch. The write is **best-effort**: a failure is
logged and must never turn an accepted save into a rejected one or lose the
player's game. An unauthenticated request writes nothing, because
`save_audit.user_id` is `not null` and there is no resolved caller. An
**unexpected collaborator failure** — a database error in the `readCurrentSave`
or `writeSaveRow` call, the `request.text()` read of an aborted body, building a
`409` response from a corrupted stored row, or the non-`SaveDocumentError`
rethrow in validation — is caught after the caller resolves and recorded as a
`rejected`/`server_error` row before the `500`, so a repeated crash (or a
deliberate hunt for one) is visible rather than a silent 500 with no trace
(review findings **M1**, **L3**).

**No client-controlled field may reach a typed audit column unvalidated.** Two
did, and each aborted the insert (the best-effort writer then swallowed it, so
the attempt left no row): the client clock (fixed by bounding it, **H1**) and
`baseRevision` (fixed by validating it against §5, **H2**). `baseRevision` must
now be `null` or a positive safe integer — a fractional or out-of-int8 value is
recorded as `400 malformed_request` *before* `auditContext.baseRevision` is
assigned, so the rejection writes a clean row. That is also a §5 conformance fix
in its own right ("a monotonic integer… or null"). `writeSaveAuditViaServiceRole`
additionally coerces any non-safe-integer revision to `null` (`normalizeAuditRevision`)
and clamps `document_bytes`, so a future typed column added to this table cannot
reopen the hole a third time.

Evidence: 8 Deno unit tests in `save-sync/index.test.ts` (accepted row carrying
the client clock, bound-violation row, validation row, no row without a caller,
an out-of-range client clock still writing one row with the raw value in
`detail`, a throwing collaborator writing a `server_error` row, a non-integer
`baseRevision` refused with one `malformed_request` row, and the
`normalizeAuditRevision` coercion);
`tests/unit/server-stack.test.ts` pins the `admin.from('save_audit').insert(`
line alongside the `saves` writes;
`tests/server-integration/save-audit.integration.test.ts` (6 live tests —
accepted row, `save_rejected` row, `revision_conflict` row, an unrepresentable
client clock still writing the row, invalid `baseRevision` values each writing
their own row, and RLS proving the log is invisible and unwritable to any client
token); and `tests/server-e2e/save-rejection.spec.ts` proves the player-facing
half in a real browser against a stubbed `422 save_rejected`.

### Abuse limits (Step 25)

One shared limiter module — `supabase/functions/_shared/rateLimit.ts` — and the
three body- or identity-taking functions wired to it. Step 25's instruction is
to rate-limit **uploads, authentication, and recovery-code redemption per user
and per address**, cap document size **before parsing**, and prove no code path
lets a fingerprint select an account or authorize a write.

**The mechanism, and its honest scope.** `createFixedWindowRateLimiter` is a
fixed-window counter: one `(windowStartMs, count)` pair per key in a `Map`,
admitting up to `limit` attempts until `windowMs` elapses, then rolling. The
clock and the store are both injected, which is what lets
`_shared/rateLimit.test.ts` drive window rolls and prune pressure under
`deno test` with no permission flags, no Docker and no waiting. A fixed window
has a known boundary-burst weakness (up to 2×`limit` across a boundary) and it
is accepted deliberately: a sliding window needs one timestamp per attempt per
key, which is the unbounded, attacker-growable state the prune exists to bound.
`recovery-code`'s Step 14 limiter was sliding; the observable contract — 30
attempts a minute, then `429` — is unchanged and pinned from both sides.

**Durability is stated, not implied (design constraint 1).** The stores are
module-scoped in each function's `index.ts`, so they live for one worker's
lifetime. Edge workers are multi-instance and recycled: an attacker with
parallelism, or one who waits for a recycled worker, sees an effective ceiling
up to `workers × limit`, and this module does not claim otherwise. Threat model
§4.6 already accepts "a determined attacker with many addresses"; the real
backstop behind recovery-code redemption is the code's 128-bit entropy, and
behind an upload flood Step 23's progress bound plus the per-account row. What
this limiter buys is that the *cheap* abuses cost bounded work — and that
Step 24's L2 amplification (1 request → 1 service-role audit write) is bounded,
because a `429` is refused before any audit write exists on the path.

**The order every endpoint now refuses in (design constraint 2).** CORS
preflight (answered by the router, per F11) → **declared-size refusal** →
**rate-limit refusal** → **authentication** → body read → parse → validate →
Step 23 bound → write. A guard that runs after the work it exists to prevent is
not a guard, so each refusal sits above everything it is meant to spare. Two
consequences are new at Step 25 and worth naming: the per-address check runs
*before* authentication (a caller that never authenticates still costs work and
has no user id to bucket by), and the declared-size check now also precedes
authentication — so an oversized request writes no `save_audit` row either.

**The limits, each derived rather than chosen (design constraint 4).**

| Endpoint | Key | Limit | Derivation |
|---|---|---|---|
| `PUT /v1/save` | user | 60/min | §9's worst-case honest burst is 19 (3 forced triggers × the 6-request retry ladder, plus the routine upload); 60 is >3× headroom |
| `PUT /v1/save` | address | 600/min | 10 sessions at the full per-user budget; a shared NAT, and the local integration suite's one observed address, must never be what this refuses |
| `GET /v1/save` | user / address | 60 / 600/min | one boot download plus reloads; same address reasoning |
| `telegram-sign-in` | address | 60/min | one sign-in per cold start plus retries, against one service-role `generateLink` per accepted call; looser than GoTrue's own `sign_in_sign_ups = 30`/5 min so the tighter one always wins |
| `recovery-code /v1/redeem` | address | 30/min | Step 14's value, unchanged |
| `recovery-code /v1/generate` | user | 30/min | each generate rotates the account's only active code through the service role |
| guest sign-in (`ensureGuestSession`) | address | — | bounded only by GoTrue's `anonymous_users = 30/hour/IP`, reviewed and kept by Step 25 |

**The per-user half of recovery-code, and where it can run.** Redemption cannot
have one: the endpoint exists precisely because there is no caller identity
until the code has already been matched, and a post-match limit would run after
the compare-and-swap it exists to bound. Generation is authenticated, so that is
where the per-user limit lives.

**Pre-parse size cap.** `MAX_REQUEST_BODY_BYTES = 65_536` moved to
`_shared/http.ts` (from `save-sync`'s own constant, whose 64 KB is §3's) and is
now enforced by `telegram-sign-in` and `recovery-code` too, neither of which had
any cap. Each function checks a truthful `Content-Length` first and the bytes
actually received second, because a chunked body carries no header to check.
AC5's proof is behavioural, not a code reading: `readBody`/`parseBody` are
injected collaborators, and the tests assert the parse is never called for an
oversized body.

**No fingerprint signal is collected (design constraint, AC6/AC15).** Threat
model §7.2 records the default — audience Vietnam/SEA, Supabase region
Singapore, public website, so GDPR is assumed to apply — and Step 25 therefore
takes the plan's *alternative*: address and behavioural limits only. The
deliverable is the proof of absence, not a collector.
`tests/unit/server-fingerprint-absence.test.ts` scans every server source
(comments included; the generated bundle and test files excluded) for the
client-supplied characteristics that decision forbids reading — `User-Agent`,
`Sec-CH-UA-*`, `Accept-Language`, `X-Device-Id`, canvas/WebGL, screen
dimensions, timezone, `deviceMemory`, `hardwareConcurrency`, `navigator.*` — and
fails naming the file, line and signal. Its behavioural half in
`save-sync/index.test.ts` drives two requests that differ *only* in a full set of
those headers and asserts the resolved token, the resolved user id, the written
user id and the resulting revision are identical, for both the upload and
download routes. The scan was deliberately broken during development (a
`user-agent` read planted in `save-sync/index.ts`) and observed to go red before
being reverted.

**Address derivation is not client-supplied.** `extractCallerAddress` reads the
**last** hop of `X-Forwarded-For` — the one the platform gateway (Kong locally,
Supabase's edge network in production) appends and a client cannot forge —
never the first. Reading the first would let any caller mint unlimited fresh
buckets by prepending a random address per request, which is the attack a
per-address limit exists to blunt. A caller with no address at all is never
throttled rather than bucketed into one shared key, which would let a single
header-less caller deny every other.

**The `429` is §10.2's, unchanged (§4).** `rateLimitedResponse` emits code
`rate_limited`, a `Retry-After` header, and the same number in
`detail.retryAfterSeconds` — computed from the actual remaining window rather
than Step 14's fixed 60 — with no player-facing notice, because §4's "player
sees" column for this row is empty: it is self-healing.

**The client honours `Retry-After`, which it did not before Step 25.** Step 19's
replica already treated `rate_limited` as retryable, but it backed off on §9's
1/2/4/8/16 s ladder alone — so from attempt 1 it retried **one second** after the
server had asked for up to sixty, walking straight back into the window that was
still closed and burning the five-retry budget on requests the server was
already committed to refusing. `cloudSaveUpload.ts` now parses the header
(delta-seconds only; an HTTP-date, a zero, a negative, a fractional or a
non-numeric value is treated as absent) into `retryAfterMs`, and
`#scheduleRetry` waits `max(ladderStep, retryAfterMs)`. The header is a **floor,
never a shortcut**: it can lengthen §9's wait, never shorten it, so a server
answering a short `Retry-After` cannot make the client poll faster than the
protocol already permits. An unreadable header leaves the ladder in sole charge
and the failure stays retryable — a malformed header never turns a throttle into
a stopped sync.

Evidence: `_shared/rateLimit.test.ts` (9 Deno tests — admit-to-the-limit, a
counting-down `Retry-After` that never rounds to 0, admit-again-after-the-roll,
per-user/per-address key independence, `null` keys never throttled, prune
bounding a 200-key rotation, last-hop extraction, and the exact §10.2 body);
`save-sync/index.test.ts` (the §9 19-request honest burst admitted against the
real exported constants with the next request refused, the address limit
refusing before `resolveCaller` is reached, the per-user limit writing no
`save_audit` row, the warm-up probe consuming no bucket, the pre-parse
assertions, and the two fingerprint-behaviour tests);
`telegram-sign-in/index.test.ts` and `recovery-code/index.test.ts` (the same
pre-parse and `429` shapes, the per-user generate budget, and the Step 14 budget
plus reset-route clearing); `tests/unit/server-fingerprint-absence.test.ts`;
and `tests/server-integration/rate-limit.integration.test.ts` (a real flood
answered `429` with `Retry-After`, an honest client in the same run never
throttled, `413` for an oversized body, and `save_audit` not growing by one row
per refused request). `supabase/config.toml`'s `[auth.rate_limit]` was reviewed
and deliberately left unchanged, with the reasoning recorded there.

### Adversarial suite (Step 26)

Step 26 adds no production code. Its deliverable is a suite that proves the
guards Steps 15–25 built are load-bearing, in the shape `### Step 26` of
`memory-bank/server-milestone-plan.md` requires: every attack the threat model
names is refused by its **own named assertion**, and **removing that attack's
one server-side guard makes that assertion fail**.

**Nine attacks, at the lowest layer that still exercises the real guard.**
Constraint 4 splits "pure logic" from "needs the stack", so the suite is two
files per layer rather than one monster:

| # | Attack | Guard mutated | Where it is proven |
|---|---|---|---|
| 1 | Forged gold | Step 23 `evaluateProgressBound` | `save-sync/adversarial.test.ts` (pure) + `adversarial.integration.test.ts` (real stored row) |
| 2 | Replayed documents | §5 `baseRevision` concurrency, plus the Step 23 bound | same two files |
| 3 | Rolled-back concurrency tokens | the `409` path; Step 24's H2 `isValidBaseRevision` | same two files |
| 4 | Clock manipulation, both directions | Step 22's server-clock rule (`received_at` → `now()`); `readClientClock` recorded-never-trusted | same two files |
| 5 | Another user's id | caller identity from the verified JWT, never a request field | `adversarial.integration.test.ts` + attack 6's matrix |
| 6 | Direct PostgREST writes to every table | RLS + the column grant | `adversarial-rls.integration.test.ts` (real PostgREST, real `anon`/`authenticated` tokens) |
| 7 | Unverified Telegram payloads | `verifyTelegramInitData`'s HMAC + `timingSafeEqualHex` | `telegram-sign-in/adversarial.test.ts` + the wire form in `adversarial.integration.test.ts` |
| 8 | A stolen anonymous session | Step 14 recovery-code rotation | `adversarial.integration.test.ts` |
| 9 | Brute-forced recovery codes | Step 25's per-user/per-address limits, the peppered hash, the single-redemption predicate | `recovery-code/adversarial.test.ts` (injected clock) + `adversarial.integration.test.ts` (real table) |

`npm run test:server-unit` collects the three `adversarial.test.ts` files under
`supabase/functions/` with no permission flag and no Docker; the two
`tests/server-integration/adversarial*.integration.test.ts` files run inside
`npm run verify:server`.

**Attack 6's matrix is derived, not hand-listed.** `tests/server-integration/rlsMatrixFixture.ts`
reads `supabase/migrations/*.sql` and builds the seven tables × four verbs × two
client roles from the `create table` and `create policy` statements themselves,
so an eighth table is covered without anyone editing the suite — and its first
column is read from the same statement, so no probe column is hard-coded either.
Three further things are read from the same files rather than listed: each
table's `generated always as identity` columns, so the UPDATE probe never
assigns one (Postgres answers `428C9`/`400` to `set id = <n>`, which would look
like a refusal for a reason unrelated to RLS), whether a table's *table-level*
SELECT is revoked, and every policy's (role, verb, table) coverage.

The observable outcome is per-verb, per-role and per-grant, and all three were
**measured against the live stack on 2026-09-18** rather than assumed:

- a covered cell answers `200`, whether or not the policy's `USING` clause
  matches a row;
- an uncovered INSERT raises `42501` — the only verb whose default-deny raises
  rather than filters;
- an uncovered SELECT/UPDATE/DELETE is *filtered* (`200` / `[]`), the shape the
  pre-existing `profiles-rls` and `saves-rls` suites already pin;
- **the status of a `42501` refusal is role-dependent**: `401` for the `anon`
  role, `403` for `authenticated`. Asserting `403` for both was the first
  draft's bug, and it is why `refusedStatusFor(role)` exists;
- **`leaderboard_entries` is refused a fourth way.** Its table-level SELECT is
  revoked, so PostgREST cannot read back the `RETURNING` representation any
  mutation needs and every INSERT/UPDATE/DELETE there is answered `42501`
  *before* a policy is consulted. Derived from the `revoke select` statement,
  not special-cased.

`rlsCellExpectation` is the single place that mapping lives.

**The suite runs with `fileParallelism: false`.** The local stack is one
observed address, so every Edge Function limiter is shared by every integration
file: a flood in one file spends a bucket another file is measuring, and the
only way to empty it is the test-only reset route — which a *different* file
calling concurrently corrupts the measurement in the other direction. With the
adversarial suite's attack 8/9 needing real redemptions and
`recovery-code.integration.test.ts` measuring the same bucket, the parallel run
failed in both directions (the throttle test never saw its `429`; the sibling's
concurrency tests were answered `429` by the bucket the throttle test had just
filled). Serialising the files makes each one the only consumer of the shared
bucket for its duration, which is the assumption that file's own
`beforeAll`/`afterAll` reset discipline already makes. It costs nothing
measurable — the full integration suite runs in ~21 s either way, because the
parallel run was spending its time contending.

`rate-limit.integration.test.ts`'s flood was relaxed from "exactly one budget,
so the 61st request is refused" to "run until refused, bounded at three
budgets". That is not a weaker claim about the guard; it is the correct claim
about *this* mechanism. The limiter is an in-process `Map`, the local edge
runtime can serve one burst through more than one worker, and Step 25's own
honesty note (and `_shared/rateLimit.ts`) already records the ceiling as
`workers × limit` — so a burst split across two workers fills neither bucket,
and the 61st-request assertion fails for a reason no one controls. It was
observed once in three `verify:server` runs and never in isolation. The
assertions that remain are the ones the mechanism can keep: nothing inside one
budget is refused, the flood does reach a refusal within the bound, every
refusal carries `Retry-After` and §10.2's body, and `save_audit` grows by
exactly the admitted count.

**Attack 4's pure half had to be strengthened to be load-bearing at all.** Its
first draft uploaded a claim of `1e12` and asserted `422`; that passes with the
server-clock rule intact *or* broken, because a trillion gold is outside any
interval's allowance, so the test could not detect its own mutation (constraint
3's "a test that survives its mutation" case). It now derives the claim from
`evaluateProgressBound` itself (`maximumDeliveryFor`, two hours' production:
inside a hundred-hour allowance, outside a sixty-second one) and drives the
skew from `Date.now()` rather than a fixed symbolic timestamp, and it carries a
control that the same claim is *admitted* against a genuinely two-hour server
interval. Each direction names its own mutation, because a five-hour-early
clock cannot be exposed by the mutation that removes the server's `now()` as
the origin and vice versa.

**The `leaderboard_entries` column control is asserted separately, because the
row policy is not the control.** `leaderboard_entries_select_all` admits every
row, so `?select=user_id` (and `select=*`, which PostgREST expands to every
column) is refused by the *grant* with `42501` while a read naming only the
granted columns succeeds. That is Step 3's recorded rule, and Step 26 is where
it becomes a test rather than a comment.

**Attack 8's boundary is pinned honestly.** Rotation invalidates the prior
recovery **code**; it does **not** invalidate a stolen session **token**, which
stays valid until rotated, and nothing in this milestone rotates it. Finding
**F5** (an XSS flaw defeats the session boundary; the CSP/dependency-integrity
half is unaddressed) is explicitly out of Step 26's scope and no test implies
otherwise. What the test proves is the boundary that exists: a stolen code is
spent the moment the real player generates a fresh one.

**Attack 9's honest gap is stated too.** Redemption has **no per-user limit
before it resolves** and cannot have one — there is no caller identity until the
code has already been matched, and a post-match limit would run after the
compare-and-swap it exists to bound. The per-address limit is the meaningful
pre-resolution bound; the code's 128-bit entropy is the real backstop. A test
asserts exactly that (a `null` address key, no user key) rather than implying a
defence the milestone does not have.

**Flake discipline (constraint 6).** The local gateway makes the whole
integration suite one observed address (TASK-002's finding), so the flood loops
spend **one user's** bucket (`SAVE_UPLOAD_MAX_PER_USER + 1`) rather than
draining the shared per-address budget, and the recovery assertions clear the
gateway-shared bucket first through the Step 14 reset route, because a `429`
would short-circuit before the code is compared — the guard those tests exist to
prove. The warm-up probe is the refused `DELETE` on an unrouted path, which
returns from each router before any limiter runs, so warming spends no bucket.

**The per-attack mutation record.** Every one of the nine was performed on
2026-09-18 against a Docker-capable runner: the guard was disabled in the
working tree (or, for attack 6, in the live database), the named test was
observed **red**, the file/database was restored with `git checkout --` /
`supabase db reset`, and the same test was observed **green** again. Where the
guard exists at both layers, the layer tested is named — the pure-layer
mutations need no restart, and the live ones were followed by
`docker restart supabase_edge_runtime_cat-mine-idle` so the runtime actually
served the mutated source (without it the first attempt showed the mutation
having no effect at all, which is its own trap for anyone repeating this).

| # | Guard disabled | Test that went red by name |
|---|---|---|
| 1 | `findProgressBoundViolation`'s return, i.e. the whole Step 23 bound block in `handleSaveUpload` | `attack 1 (forged gold): an upload claiming more gold…` (pure **and** live; the honest-document control stayed green) |
| 2 | the `baseRevision !== storedRevision` branch | `attack 2 (replayed documents): re-uploading an already-accepted document…` and `…replaying against an account the server has no row for…` (pure) |
| 3 | `isValidBaseRevision` → `return true` (H2), and separately the `409` branch | `attack 3 …a fractional, out-of-int8, negative, or non-numeric baseRevision…` (H2 mutation) and `attack 3 …a baseRevision lower than the server's current revision…` (409 mutation) (pure) |
| 4 | the bound's elapsed origin: `nowMs - receivedAtMs` → `nowMs - savedAtTimestampMs` (behind), and → `savedAtTimestampMs - receivedAtMs` (ahead) | `attack 4 …hours behind cannot buy extra allowance…` and `attack 4 …hours ahead cannot buy extra allowance either` (pure, one mutation each), plus the two-hour control under each |
| 5 | the caller identity: `caller.userId` overwritten from the request body's `user_id` | `attack 5 (another user's id): a body claiming a different user_id neither selects that account nor writes to it…` (live) |
| 6 | `alter table public.save_audit disable row level security`, and separately `grant select on public.leaderboard_entries to anon, authenticated` | the four per-verb matrix tests plus `leaves save_audit and recovery_codes with no client access…` (RLS mutation); `withholds leaderboard_entries.user_id at the grant layer…` (grant mutation) (live PostgREST) |
| 7 | `timingSafeEqualHex(computed, hash)` → `timingSafeEqualHex(computed, computed)` | `attack 7 …tampered after signing…`, `…hash replaced with a well-formed but wrong digest…`, `…field appended after signing…`, `…empty hash field…`, `…signed under a different bot token…` (pure; the freshness and order controls correctly stayed green) |
| 8 | `rotate_recovery_code`'s revoke half removed, with `recovery_codes_one_active_per_user_idx` dropped so the mutated function can still insert | `attack 8 (a stolen anonymous session): regenerating a recovery code invalidates the prior one…` (live) |
| 9 | the `checkRedemptionRateLimit` refusal in `handleRedeem` | `attack 9 …a sustained brute-force flood from one address…`, `…the address budget rolls…`, `…one address exhausting its budget does not throttle a different address` (pure, injected clock) |

Two findings came out of performing it rather than claiming it, both fixed in
the suite rather than reported around: attack 4's pure half could not fail
(above), and the parallel integration run's shared-bucket interference
(above). No production behaviour changed. The one guard whose answer is "no
guard, by design" — attack 9's absent per-user redemption limit — is recorded
above and below rather than quietly given a test that would pass either way.

### Leaderboard storage (Step 27)

Step 27's own instructions: "Add the leaderboard table using the Step 3
magnitude-plus-exact representation, with the indexes its queries need. Decide
the metric, the reset period if any, and the tie-break." **No table, index, or
RLS change was needed.** `public.leaderboard_entries`, its rank index
(`leaderboard_entries_rank_idx`), and its RLS/grant matrix
(`leaderboard_entries_select_all` plus the column-level grant withholding
`user_id`) all shipped in Step 3/Step 5
(`20260908130000_create_platform_tables.sql`) — Step 3 built the table
metric-agnostic on purpose (see "What Step 3 does not design" below), so
Step 27's actual job was the three decisions themselves, not a schema change:

- **Metric: lifetime gold earned.** `state.warehouse.totalGoldDelivered +
  state.warehouse.totalOfflineGoldClaimed` (`calculateLifetimeGoldEarned`,
  `src/core/leaderboard/leaderboardMetric.ts`) — both monotonic, so the sum
  can only rise across a save's lifetime. Current spendable `gold` is
  deliberately **not** the metric: it falls every time a player buys an
  upgrade, which would rank a patient spender below someone who never
  invests.
- **Reset period: none.** One board, `board_key = 'lifetime-gold'`
  (`LIFETIME_GOLD_BOARD_KEY`), all-time. A future season is a new `board_key`
  value under `leaderboard_entries_board_key_format`, never a schema change —
  exactly the design Step 3 recorded.
- **Tie-break: earliest to reach the score.** Two equal scores rank by
  ascending `updated_at` — the player who got there first outranks one who
  only matched it later. `leaderboard_entries_rank_idx`'s trailing column
  already encoded this in Step 3; Step 27 confirms it rather than changing
  it.

`supabase/migrations/20260918100000_leaderboard_lifetime_gold_board.sql` pins
these three decisions as `comment on table`/`comment on column` statements —
a durable, queryable record alongside this document, not a structural change.

**The magnitude-plus-exact conversion.** `toLeaderboardMagnitude` (same
module) turns a `GameNumber` into the `metric_exact`/`metric_log10` pair: the
exact value is `GameNumber.serialize()`, unchanged; the sortable magnitude is
`Math.log10(mantissa) + exponent`, derived from the `GameNumber`'s own
mantissa/exponent pair (see "How a `GameNumber` is stored" below) rather than
from the value itself, so it stays exact for a value past `1e308` — which
cannot survive a round trip through a plain `double` at all. It throws on a
non-positive value, which the table's own
`leaderboard_entries_metric_log10_finite` constraint would refuse regardless.
This module only *represents* the metric; nothing here writes a row —
publishing an entry from a save that passed Step 23's bound is Step 28's job.

**Proof, against the real table.**
`tests/server-integration/leaderboard-storage.integration.test.ts`:

- Ten values spanning ordinary numbers through magnitudes past `1e308`
  (`1e1000` down to `0.01`) are inserted out of order and read back through the
  real ranking index (`order=metric_log10.desc,updated_at.asc`) in exactly the
  expected descending order, with `metric_exact` byte-identical to
  `GameNumber.serialize()` of the original value on every row.
- A tie at equal `metric_log10` ranks the earlier `updated_at` first.
- A focused RLS check for this table: an unauthenticated read of the allowed
  columns succeeds; a read of the withheld `user_id` column is refused
  `42501` even for the row's own owner (the control is the grant, not a row
  policy an owner could read as "except my own"); a direct `PATCH` from
  either client role is refused `42501` too — not the ordinary "filtered,
  `200` with `[]`" an uncovered non-INSERT cell gets elsewhere, because this
  table's table-level `SELECT` is *also* revoked, so `Prefer:
  return=representation`'s read-back cannot be built at all
  (`rlsMatrixFixture.ts`'s `rlsCellExpectation`, `tableSelectRevoked` branch —
  the exhaustive six-table matrix itself is Step 26's, not re-derived here).
- **Latency budget: the top-100 ranking query over 10,000 rows on one board —
  the "~10⁴ rows" scale this document's Indexes section already records for
  this schema — completes in under 300 ms, end-to-end through the real REST
  API (Kong → PostgREST → the indexed query), measured three times after one
  untimed warm-up request.** The 10,000 rows need 10,000 distinct
  `auth.users` rows to reference (`(board_key, user_id)` is the primary key),
  which `tests/server-integration/directSqlFixture.ts` seeds with one bulk
  `insert` run as the Postgres superuser directly against the local stack's
  own database container (`docker exec ... psql`, piped over stdin) —
  minting each one through GoTrue would have made this one assertion the
  slowest, flakiest thing `verify:server` runs. A JWT minted for one of those
  ids by `mintFixtureUserToken` authenticates against RLS exactly as a real
  GoTrue session would, because PostgREST trusts any validly-signed JWT's
  `sub` claim without consulting a live session.

### Leaderboard writes (Step 28)

Step 28's own instructions: "Publish an entry only from a save that passed
Step 23. A rejected or unvalidated save must never reach the board." Step 27
built the table and the pure metric/magnitude conversion and wrote nothing;
this step is the writer, and it lives on exactly one path —
`handleSaveUpload`'s accept branch in `supabase/functions/save-sync/index.ts`,
after the row is durably written and its `save_audit` row recorded, never on
any of the function's reject branches (`422 save_invalid`, `422
save_rejected`, `409 revision_conflict`, `413`/`429`, or a `500`). Every one
of those returns before the publish call, which is what "never reaches the
board" means concretely: there is no separate check to bypass, because the
call site itself is unreachable from a rejection.

**The write is a third, and last, service-role use in this function** —
`admin.from('leaderboard_entries').upsert(...)`, alongside `saves`' insert/update
compare-and-swap and `save_audit`'s append-only insert. Unlike the blind
`upsert` a 2026-09-12 review found and fixed for `saves`, this one is not a
regression of that finding: `saves`' problem was two concurrent uploads racing
over one shared monotonic counter, which a blind upsert lets both win. A
leaderboard publish has no shared counter to race — one caller publishing a
snapshot of their own metric — so a retried or repeated accept simply
overwrites with that caller's latest value, keyed on the table's own primary
key (`board_key`, `user_id`).

**What gets published.** `metric_exact`/`metric_log10` come from Step 27's own
pure functions (`calculateLifetimeGoldEarned`, `toLeaderboardMagnitude`) run
against the just-accepted document's deserialized state — not re-derived here.
`source_revision` is that same accepted write's resulting `saves.revision`,
never a client-supplied value. `display_name` is snapshotted from the caller's
`profiles.display_name` at publish time, read through the caller's own bearer
token (`profiles_select_own` already admits it, so no elevated privilege is
needed for that half) — nullable, matching the column's own contract for a
player who has never set one. `board_key` is always
`LIFETIME_GOLD_BOARD_KEY` ('lifetime-gold'); Step 28 populates no other board.

**Best-effort, like `save_audit`'s write (Step 24).** Computing the metric,
reading the display name, and the write itself all run inside one `try`/`catch`
(`publishLeaderboardEntry`) whose failure is logged and swallowed — it can
never turn the already-`200`-decided upload into anything else, and can never
lose the player's save. `toLeaderboardMagnitude` throws by design on a
zero-or-negative value (Step 27), which a brand-new account's first save
always is (no completed warehouse conversion or offline claim yet); this
best-effort catch is what turns that into "publishes nothing yet" rather than
a raised error on an otherwise-good first upload.

Evidence: `supabase/functions/save-sync/index.test.ts` (Deno unit tests, fakes
only) covers every branch with a faked `SaveSyncDeps` — an accepted save
publishes exactly once, keyed to the resulting revision, with the caller's
looked-up display name; a Step 23 bound violation, a revision conflict, and a
validation failure each publish nothing; a publish failure (either
collaborator throwing) still returns `200`; and a fresh, zero-lifetime-gold
account publishes nothing without raising. `tests/unit/server-stack.test.ts`
extends its existing `save-sync` service-role assertion with the new
`leaderboard_entries` upsert line, and confirms the `saves` compare-and-swap
still carries no `upsert` of its own — the Step 15 finding stays fixed even as
a different table's writer legitimately gains one.
`tests/server-integration/leaderboard-publish.integration.test.ts` proves the
same contract against the real Edge Function and the real table: an accepted
upload publishes one row with the correct metric, revision, and board key,
carrying the caller's own `profiles.display_name`; a save Step 23 rejects
leaves the prior accepted entry completely untouched (no row added, no field
changed); and a second accepted upload from the same user overwrites that one
row rather than duplicating it. The exhaustive, migration-derived RLS matrix in
`tests/server-integration/adversarial-rls.integration.test.ts` (Step 26's
attack 6) already covers `leaderboard_entries`' insert/update/delete cells for
both client roles — refused at the grant layer regardless of role, since the
table's table-level `SELECT` is revoked for anon/authenticated — so no
`leaderboard_entries`-specific write-refusal test is duplicated here; Step 28
only adds the service-role path the matrix already treats as the sole writer.

### Leaderboard display (Step 29)

Step 29 adds the read path and the first player-facing surface for the board
chosen in Step 27. `supabase/functions/leaderboard-read/index.ts` accepts public
`GET`/`HEAD` requests for `board_key = 'lifetime-gold'` and an optional bounded
`limit`; a public request returns only the ranked display projection. A request
with an `Authorization: Bearer` token resolves that caller through GoTrue and
adds their own rank/value projection when they have an entry. The response
never contains `leaderboard_entries.user_id`, which remains withheld by the
column grant and is used only inside the server boundary.

The function uses the service role only for read-side projection. The visible
rows are ordered by `metric_log10 desc, updated_at asc`, retaining the exact
`metric_exact` string. For an authenticated caller, the ranking rows are read in
1,000-row pages and rank is calculated in server code with the same ordering
predicate. This preserves correctness across the local Edge Runtime, where the
otherwise attractive PostgREST `count: 'exact', head: true` predicates returned
an incorrect count in live verification. The function has `verify_jwt = false`
because it performs its optional bearer validation itself, and it has no write
path; `save-sync` remains the sole publisher.

`src/platform/web/leaderboard.ts` is the browser boundary. It passes the
current session token when present, validates the response shape, and maps any
network, non-OK, or malformed response to a retryable offline state without
blocking the game. `src/ui/LeaderboardModal.ts` renders the accessible native
dialog opened by the Rewards bottom-navigation item. It formats each exact
`GameNumber` through the existing Phaser-free `formatAmount` authority, shows
the player's rank separately from the visible top rows, restores focus on close,
and leaves the underlying game playable when the endpoint is unavailable.

Evidence: the function unit suite has 7 tests; the live integration suite has
3 tests covering public exact values/no ids, an authenticated caller outside
the visible limit, and invalid-token rejection. `tests/unit/leaderboard-display.test.ts`
covers ordinary, abbreviated, and beyond-`Number.MAX_VALUE` magnitudes; the
focused layout smoke proves Rewards opens and closes the modal. No acceptance
gate is recorded until the user validates the player-facing flow.

### Entitlements (Step 31)

Step 31 uses the `entitlements` table and RLS policy already landed by Step 3;
no migration is needed. The one concrete entitlement in this milestone is
`cosmetic.supporter_badge`. Its writer is intentionally not an HTTP route:
only server-side code with the service role may insert, update, or revoke a
row, leaving a later payment milestone a sound place to add a grant source
without giving the client a self-serve purchase or grant path.

`entitlement-check` verifies the caller's bearer token with GoTrue and then
reads active rows through a Supabase client carrying that same token. The
query filters `revoked_at is null`, so a revoked grant cannot keep its effect;
RLS independently restricts the rows to the caller. The response exposes the
server-owned entitlement key, grant timestamp, source, and the derived
`effects.supporterBadge` flag. The effect is derived from the returned key on
the server, never from a client-supplied entitlement or request body. The
function handles browser CORS preflight and has `verify_jwt = false` only
because it performs the bearer check itself, matching `whoami-check` and the
other authenticated functions.

Evidence: `supabase/functions/entitlement-check/index.test.ts` covers token,
method, CORS, effect, and resolver-failure branches. The live
`tests/server-integration/entitlement-check.integration.test.ts` proves that a
client PostgREST insert is refused, a service-role grant becomes visible with
`supporterBadge: true`, and revocation removes the effect. The function does
not read the service-role key.

### Account audit log (Step 32)

Step 32 adds `public.account_audit` in
`supabase/migrations/20260919100000_account_audit_log.sql`. It is deliberately
separate from `save_audit`: `save_audit` is the high-volume request record for
save-sync, while this table is the sparse security timeline for identity
changes, recovery-code issuance and redemption, entitlement changes, and save
rejections. Every row has a database-owned `occurred_at` and an `actor_type`;
`user_id` identifies the affected account and is set to null when the account
is deleted, leaving Step 33 an explicit anonymization/retention task rather
than silently losing the audit timeline through a cascade. `detail` is a
server-authored JSON object capped at 4096 bytes and contains no recovery code,
identity payload, email, or access token.

The table has RLS enabled with no client policies. The service role may select
and insert but may not update or delete; the server-only
`record_account_audit_event` RPC accepts no caller timestamp and is executable
only by `service_role`. Database triggers record `identity_added` and
`identity_removed` from `auth.identities`, `recovery_code_issued` from
`recovery_codes`, `entitlement_granted`/`entitlement_revoked` from
`entitlements`, and `save_rejected` from `save_audit`. Redemption is appended
by `recovery-code` only after the external session mint succeeds, because its
claim may be reverted after a mint failure. If an account deletion cascades
through `auth.identities` after the parent row is gone, the identity-removal
event uses a null account link so the audit FK cannot block deletion.

Coverage: `tests/server-integration/account-audit.integration.test.ts` drives
all seven event types against the local stack, checks server timestamps and
actors, and checks that a client token sees no rows and cannot insert. The
migration-derived RLS matrix in
`tests/server-integration/adversarial-rls.integration.test.ts` also covers the
new table's select/insert/update/delete cells for both client roles.

### Guest linking and the identity collision (Step 13)

Three of the step's required flows fall out of what Steps 10/12/17 already
do: a fresh identity link keeps the same `auth.users` id (Steps 10/12), and
"no progress, never asked" plus the silent no-conflict cases are exactly
`resolveSaveConflict`'s existing behaviour (Steps 17/18). What Step 13 adds is
the missing piece — detecting and resolving the one collision Google's
`linkIdentity` can produce that `resolveSaveConflict` alone cannot get the
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

The production account popup now owns the normal login/logout entry point;
`main.ts`'s `DEV`-only `window.catMineIdleAccount` hook still carries
`beginGoogleAccountSwitch` for the rare post-redirect collision, alongside the
`data-google-identity-collision` diagnostic published by
`detectGoogleIdentityCollision`.

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

The animation fidelity policy is presentation-only: `N`/`R` candidates use
four frames in a `2x2` grid, while `SR`/`SSR`/`UR` candidates use eight frames
in a `4x2` grid. Both formats keep `128x128` cells, the same camera, body
proportions, feet anchor, and role silhouette. Mofy is the first applied SSR
example, with eight deliberate ledger-inspection, grip-adjustment, breathing,
and recovery poses at 110 ms per frame; this does not affect gameplay.

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

`createSaveDiagnosticBanner(parent)` renders one non-blocking DOM notice for every recoverable problem this milestone can surface. Four sources feed it, all shaped as `SaveDiagnosticNotice` (`{code, message}`):

- `loadActiveGame`'s `SaveRecoveryWarning` (`corrupt-save`, `incompatible-save`), passed as `onWarning`.
- `SavePersistenceCoordinator`'s `PersistenceDiagnostic` (`load-failed`, `save-failed`), passed as `onDiagnostic`.
- Server-milestone Step 19: terminal cloud-sync failures, `describeCloudSaveNotice`'s namespaced `cloud-sync-*` codes, from the replica's `onEvent` on `sync-stopped`/`document-dropped`. Retryable failures show nothing until retries are exhausted.
- Server-milestone Step 21: the `local-save-missing` notice, when a reused session has no local record at all and the account has no cloud save to restore.

The notice never takes focus and overlays only the non-interactive HUD strip, because the session always continues: a corrupt save has already been replaced and a failed write is still retried. A code that is already showing is ignored rather than re-rendered, since a broken storage backend reports a failed write on every debounce, and a dismissed code stays dismissed until a different problem occurs. A *different* code **replaces** the shown one — so the sources are ordered by what the player most needs to know, and Step 21's notice fires only when there is no local record at all, never when a corrupt-but-present save already produced the accurate `corrupt-save` warning. The notice is not withdrawn when a later write succeeds — the coordinator reports failures, not recoveries, and leaving a stale notice the player can dismiss is safer than silently retracting the news that progress may not be stored.

## Complete Database Schema

**Relational/server database schema — landed in the local Supabase stack.**
Server-milestone Step 3 designed the schema below on 2026-09-08; Step 4 stood up
the local Supabase stack; Step 5 landed it on 2026-09-08 as
`supabase/migrations/20260908130000_create_platform_tables.sql`, applied after
Step 4's bootstrap migration
(`supabase/migrations/20260908120000_bootstrap_platform_requirements.sql`, which
creates nothing — it only asserts the PostgreSQL 13+ premise this block relies on
for `gen_random_uuid()`). The original six tables and the Step 32
`account_audit` table, with the row-level-security policies in the matrix
below, exist in the local development database after `supabase db reset`;
**no deployed database contains them**, because no deployment exists yet. This
block and its twin in the other document are
byte-identical by construction and must be changed together, in the same change
as every future migration, exactly as `AGENTS.md` requires.

Full protocol context is in `memory-bank/server-save-sync-protocol.md`; the
threat model and recorded defaults it obeys are in
`memory-bank/server-threat-model.md`.

### How a `GameNumber` is stored

Three rules, and they differ by location.

1. **Inside a save document, nothing changes.** `GameNumber` values stay
   serialized decimal/scientific strings inside the document text, exactly as
   the version-2 save schema already defines them. The server neither reformats
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

-- -------------------------------------------------------- account_audit --
create table public.account_audit (
  id          bigint      generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type  text        not null,
  user_id     uuid            null references auth.users(id) on delete set null,
  actor_type  text        not null,
  detail      jsonb           null,
  constraint account_audit_event_type_known
    check (event_type in (
      'identity_added',
      'identity_removed',
      'recovery_code_issued',
      'recovery_code_redeemed',
      'entitlement_granted',
      'entitlement_revoked',
      'save_rejected'
    )),
  constraint account_audit_actor_type_known
    check (actor_type in ('user', 'server', 'auth')),
  constraint account_audit_detail_object
    check (detail is null or jsonb_typeof(detail) = 'object'),
  constraint account_audit_detail_size
    check (detail is null or octet_length(detail::text) <= 4096)
);

create index account_audit_user_time_idx
  on public.account_audit (user_id, occurred_at desc);

create index account_audit_event_time_idx
  on public.account_audit (event_type, occurred_at desc);

alter table public.account_audit enable row level security;

revoke insert, update, delete on public.account_audit from service_role;
grant select on public.account_audit to service_role;
grant insert (event_type, user_id, actor_type, detail)
  on public.account_audit to service_role;

create function public.record_account_audit_event(
  p_event_type text,
  p_user_id uuid,
  p_actor_type text,
  p_detail jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_audit (event_type, user_id, actor_type, detail)
  values (p_event_type, p_user_id, p_actor_type, p_detail);
end;
$$;

revoke execute on function public.record_account_audit_event(text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_account_audit_event(text, uuid, text, jsonb)
  to service_role;

create function public.audit_auth_identity_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_account_audit_event(
      'identity_added',
      new.user_id,
      'auth',
      jsonb_build_object('provider', new.provider)
    );
    return new;
  end if;

  perform public.record_account_audit_event(
    'identity_removed',
    case
      when exists (select 1 from auth.users where auth.users.id = old.user_id)
        then old.user_id
      else null
    end,
    'auth',
    jsonb_build_object('provider', old.provider)
  );
  return old;
end;
$$;

create trigger auth_identity_account_audit
  after insert or delete on auth.identities
  for each row execute function public.audit_auth_identity_change();

create function public.audit_recovery_code_issued() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_account_audit_event(
    'recovery_code_issued',
    new.user_id,
    'user',
    null
  );
  return new;
end;
$$;

create trigger recovery_code_issued_account_audit
  after insert on public.recovery_codes
  for each row execute function public.audit_recovery_code_issued();

create function public.audit_entitlement_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_account_audit_event(
      'entitlement_granted',
      new.user_id,
      'server',
      jsonb_build_object(
        'entitlementKey', new.entitlement_key,
        'source', new.source
      )
    );
    return new;
  end if;

  if old.revoked_at is null and new.revoked_at is not null then
    perform public.record_account_audit_event(
      'entitlement_revoked',
      new.user_id,
      'server',
      jsonb_build_object('entitlementKey', new.entitlement_key)
    );
  elsif old.revoked_at is not null and new.revoked_at is null then
    perform public.record_account_audit_event(
      'entitlement_granted',
      new.user_id,
      'server',
      jsonb_build_object(
        'entitlementKey', new.entitlement_key,
        'source', new.source
      )
    );
  end if;
  return new;
end;
$$;

create trigger entitlement_change_account_audit
  after insert or update of revoked_at on public.entitlements
  for each row execute function public.audit_entitlement_change();

create function public.audit_rejected_save() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.outcome = 'rejected' then
    perform public.record_account_audit_event(
      'save_rejected',
      new.user_id,
      'user',
      jsonb_build_object(
        'errorCode', new.error_code,
        'baseRevision', new.base_revision,
        'documentBytes', new.document_bytes
      )
    );
  end if;
  return new;
end;
$$;

create trigger rejected_save_account_audit
  after insert on public.save_audit
  for each row execute function public.audit_rejected_save();
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
| `saves` | `document_json` | text | no | — | ≤ 65536 bytes; exact serialized `SaveDocumentV2` |
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
| `account_audit` | `id` | bigint | no | identity | PK, generated always |
| `account_audit` | `occurred_at` | timestamptz | no | `now()` | database-owned event time |
| `account_audit` | `event_type` | text | no | — | one of the seven Step 32 event types |
| `account_audit` | `user_id` | uuid | yes | — | FK → `auth.users(id)` on delete set null; affected account |
| `account_audit` | `actor_type` | text | no | — | `user`, `server`, or `auth` |
| `account_audit` | `detail` | jsonb | yes | — | server-authored object, ≤ 4096 bytes; no credentials or identity payload |

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
| `account_audit_user_time_idx` | `account_audit` | `(user_id, occurred_at desc)` | Per-account investigation and deletion/anonymization work. |
| `account_audit_event_time_idx` | `account_audit` | `(event_type, occurred_at desc)` | Event-type investigation and future operational alerts. |

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
| `account_audit` | none | none | none | none |

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

Every table holds exactly one foreign key to `auth.users(id)`. The ordinary
account-owned tables use `on delete cascade`; `account_audit.user_id` uses
`on delete set null` so Step 33 can anonymize the affected-account link while
retaining a bounded operational record. There are no other relationships.

**Invariant for every future table:** it must carry a foreign key to
`auth.users(id)` and declare whether deletion cascades or anonymizes the link
in the same change. Step 33's test enumerates the tables, so one added without a
deletion path fails it.

Consequence recorded rather than discovered later: `save_audit` rows cascade
away with the account, so deleting an account also erases the evidence of abuse
from it. That is the right default while no money is at stake and GDPR is
assumed to apply, and it is a trade, not an oversight.

`account_audit` is the explicit exception: account deletion nulls `user_id`,
and Step 33 must scrub any remaining personal detail and enforce the recorded
life-of-account-plus-30-days retention period.

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

- The Step 32 account audit log was not designed in Step 3. Step 32 now defines
  it as a separate table; merging it with `save_audit` would put frequent save
  rows and rare identity events in one table with opposing access patterns.
- The leaderboard metric, reset period, and tie-break were left open here on
  purpose — decided in Step 27 (`## Server Stack Contract`'s "Leaderboard
  storage (Step 27)" section): lifetime gold earned, no reset (one board,
  `board_key = 'lifetime-gold'`), tie-break by ascending `updated_at`. No
  table, index, or RLS change was needed to decide them — a season or period
  is a `board_key` value, not a schema change, exactly as designed here.
- Rate-limit counters — Step 25, which may use platform facilities rather than
  tables.
- `offlineGrant` and anything Step 22 needs beyond `received_at`, which already
  anchors it.

**IndexedDB database:** `cat-mine-idle`, schema version `1`.

| Object store | Field | Type | Required / nullable | Key / constraint |
|---|---|---|---|---|
| `saves` | `id` | string | Required, non-null | Primary key via key path `id`; application writes only the literal `active`. |
| `saves` | `document` | structured-clone-compatible `SaveDocumentV2` object | Required, non-null | Must pass migration and validation before runtime deserialization. |

The store has no auto-increment key, secondary indexes, foreign keys, relationships, or additional records by design. `put({ id: 'active', document })` replaces the prior snapshot, enforcing one logical active save. Dexie database version 1 creates `saves` with schema string `id`; no IndexedDB structural migration exists. At the document layer, a legacy version-1 save (including the former four-floor prefix, expanded to fifteen floors before validation, with floors 5–15 initialized as locked defaults) is migrated to version 2 by defaulting `warehouse.totalOfflineGoldClaimed` to `"0"`; the IndexedDB database version remains `1`.

**Synchronous lifecycle journal:** localStorage key `cat-mine-idle:lifecycle-save-v1`.

| Key | Value | Lifetime / relationship |
|---|---|---|
| `cat-mine-idle:lifecycle-save-v1` | JSON string encoding one validated `SaveDocumentV2` | Written synchronously only at hidden/pagehide boundaries; considered only when newer than the valid IndexedDB record; removed after the same-or-newer document commits to IndexedDB. |

The journal introduces no new save schema version and is not a second progression store. Malformed or unsupported journal values are discarded and never override a valid IndexedDB snapshot.

## Closed incident reports

Four base-game defect reports (marketplace popup, navigation hit-target,
upgrade CTA press, marketplace hardening and close-race) previously appeared
verbatim in this file and six others. They are now in
`archive/incident-log.md`, one canonical copy.
