# Architecture

## Current Status

Steps 1 through 24 are complete. Step 25's responsive portrait layout — a fixed top HUD, a shared surface strip, and a camera-clipped scrollable mine area inside a safe-area-aware host — is implemented with passing automated checks and is awaiting user validation. Step 26 and all later work remain blocked. IndexedDB schema version 1 is unchanged and documented below; there is no relational or server database.

## Implemented Foundation

| Path | Responsibility |
|---|---|
| `index.html`, `src/main.ts`, `src/style.css` | Browser entry point, `viewport-fit=cover` opt-in, safe-area-inset host padding around the `#game-viewport` Phaser parent, Phaser game startup, and hot-reload cleanup. |
| `src/game/layout/mineLayout.ts`, `src/game/layout/palette.ts`, `src/game/layout/index.ts` | Pure Phaser-free portrait geometry and palette: logical viewport constants, HUD/surface/mine regions, scrollable mine content height, floor-slot regions, diagnostic region serialization, and the `#rrggbb` colors both the scene and the browser pixel probes read. |
| `package.json`, `package-lock.json`, `tsconfig.json` | Locked dependencies, strict compiler settings, and verified development/build/test scripts. |
| `eslint.config.mjs` | Flat lint configuration for TypeScript, configuration files, and the Node simulator script. |
| `vitest.config.ts`, `tests/unit/` | Node-based unit-test configuration and scaffold baseline coverage. |
| `playwright.config.ts`, `tests/e2e/` | Chromium E2E configuration, automatic Vite test server, and browser smoke coverage. |
| `tests/unit/architecture.test.ts` | Regression coverage proving the core and layout boundaries accept pure TypeScript and reject renderer, adapter, and browser dependencies. |
| `scripts/dev-simulator.mjs` | iPhone Simulator preview workflow retained from Step 2. |
| `src/game/scenes/BootScene.ts` | Single scene that builds the fixed HUD layer, the shared surface layer, and the mine content layer, clips the mine through a dedicated camera viewport, and records startup, renderer, and layout diagnostics on the game canvas. |
| `src/config/balance.ts`, `src/config/types.ts`, `src/config/validateBalance.ts` | Provisional four-floor/shared-stage data, its public types, and fail-fast startup validation. |
| `src/core/numbers/GameNumber.ts` | Immutable numeric boundary backed privately by break_infinity.js, with arithmetic, comparison, and string serialization. |
| `src/core/state/GameState.ts`, `src/core/state/createInitialGameState.ts` | Renderer-free authoritative state contracts and deterministic fresh-state construction from validated balance data plus an explicit timestamp. |
| `src/core/economy/calculateProductionRates.ts` | Pure theoretical floor throughput, aggregate unlocked extraction, shared-stage throughput, effective mine-rate, and bottleneck calculations. |
| `src/core/economy/simulateEconomyProgression.ts` | Deterministic automated balance-analysis policy, action trace, and ten-minute progression report. |
| `src/core/offline-income/calculateOfflineIncome.ts` | Pure elapsed/credited-time calculation, saved-rate reward calculation, future-clock handling, and immutable load-timestamp settlement. |
| `src/core/offline-income/claimOfflineIncome.ts` | Pure positive-pending-reward creation and exact-once claim-state transition that adds gold without changing unrelated authoritative state. |
| `src/core/progression/calculateLevelEffect.ts` | Shared level-growth and cumulative milestone-effect calculation used by state creation, simulation, rates, and upgrades. |
| `src/core/progression/unlocks.ts` | Immutable sequential floor-unlock command with explicit prerequisite, affordability, duplicate, and missing-floor outcomes. |
| `src/core/progression/upgrades.ts` | Pure next-upgrade pricing plus immutable mine-shaft, elevator, and warehouse purchase commands that apply level-derived yield/capacity effects with explicit results. |
| `src/core/simulation/advanceSimulation.ts` | Immutable elapsed-time advancement through bounded 100 ms fixed ticks, authoritative remainder carry, and config-driven mine-floor extraction. |
| `src/core/simulation/advanceElevator.ts` | Capacity-limited round-robin pickup, timed in-transit state, and delivery to the warehouse input queue. |
| `src/core/simulation/advanceWarehouse.ts` | Timed capacity-limited warehouse conversion from input material into spendable and cumulative delivered gold. |
| `src/persistence/saveSchema.ts`, `src/persistence/index.ts` | Version-1 plain-JSON save schema, serializer, strict validator, migration dispatcher, runtime deserializer, and persistence exports. |
| `src/persistence/ActiveSaveRepository.ts` | Storage-agnostic interface for loading and replacing the one active save document. |
| `src/persistence/DexieActiveSaveRepository.ts` | Dexie 4.4.5 adapter for the version-1 `cat-mine-idle` IndexedDB database and fixed `active` record. |
| `src/persistence/SavePersistenceCoordinator.ts` | Debounced writes, forced flushing, retry retention, and non-throwing load/save diagnostics. |
| `src/persistence/loadActiveGame.ts` | Valid-save restoration plus typed malformed/incompatible-save recovery into a fresh state with a safe diagnostic payload snapshot. |
| `src/platform/web/bindSaveLifecycle.ts` | Browser `visibilitychange` and `pagehide` binding that queues the current document and forces a flush when supported. |
| `src/ui/OfflineRewardModal.ts` | Accessible DOM modal for credited offline duration, raw `GameNumber` reward display, claim/save progress, and retryable persistence failure feedback. |

## Current File Responsibilities

| File | Purpose |
|---|---|
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
| `src/game/` | Owns the Phaser game configuration, the pure portrait-layout geometry, and the single scene that renders the HUD, surface, and camera-clipped mine regions; floor views, production visuals, input, and animation remain deferred. |
| `src/ui/` | Owns the implemented offline-reward DOM modal; the mine HUD and later overlays remain deferred. |
| `src/persistence/` | Owns the save-document boundary, storage interface, Dexie active-save adapter, debounce/failure coordinator, runtime deserialization, and recovery-aware active-game loading. |
| `src/platform/web/` | Owns the implemented save lifecycle binding; broader browser lifecycle translation remains future work. |
| `public/assets/placeholder/` | Implemented tracked directory for future original placeholder assets. |
| `tests/unit/` | Deterministic core, economy, save, migration, and offline-income tests. |
| `tests/e2e/` | Browser-level player journeys, responsive layout, persistence, and production-bundle smoke tests. |

## Dependency Boundaries

- `src/core/` must not import Phaser, DOM/browser APIs, persistence implementations, or platform adapters; scoped ESLint rules enforce this for direct, subpath, and type-only imports plus restricted browser globals.
- `src/config/` is declarative input to the core and must not contain renderer behavior.
- `src/game/` and `src/ui/` may read core snapshots and issue commands; they must not become authoritative stores.
- `src/persistence/` serializes authoritative state but must not own economy or simulation rules.
- `src/platform/` translates host lifecycle events and must not contain game balance logic.
- Presentation animation timing must never determine production output.
- Runtime gold, material, yield, and cost values must cross the core through `GameNumber`; persistence uses its serialized string form and UI formatting remains a separate concern.

## Planned Data Flow

Load active payload → migrate and validate → restore valid state or warn and create a fully fresh state → calculate capped offline reward from the saved rate → persist the consumed timestamp interval → expose a positive pending reward in the modal → claim into an immutable authoritative candidate → force-persist the candidate → dismiss the modal → advance deterministic simulation → publish read-only snapshot → render Phaser/UI → translate player input into core commands → persist debounced authoritative snapshots.

The production pipeline is four independent mine shafts → one shared round-robin elevator → one shared warehouse → spendable gold.

## Authoritative State Model

| State | Authoritative fields |
|---|---|
| Global | `saveVersion`, `lastUpdateTimestampMs`, `simulationTick`, `simulationRemainderMs`, `gold`, four floor states, elevator state, warehouse state |
| Floor | Identifier/number, unlock status, mine-shaft level, normalized extraction progress, local material queue, total extracted, total transported |
| Elevator | Level, `GameNumber` capacity, round-robin cursor, normalized transit progress, carried material |
| Warehouse | Level, `GameNumber` capacity, input queue, normalized conversion progress, total delivered gold |

Fresh state uses version `1`, receives its timestamp from the caller, initializes the simulation tick and remainder to zero, and serializes `GameNumber` values as strings. Renderer, scene, canvas, sprite, texture, tween, animation, and function state are excluded.

## Simulation Timing Contract

Foreground simulation uses a 100 ms fixed tick. Each update credits at most 1,000 ms to the fixed-step accumulator, carries any sub-tick remainder in authoritative state, and advances the wall-clock timestamp by the full valid elapsed duration. Equal credited elapsed time produces identical tick, remainder, queue, total, and gold state regardless of chunking.

Within each fixed tick, all floors advance extraction in configured order, then the shared elevator advances, then the shared warehouse advances. This makes newly extracted material eligible for elevator pickup and newly delivered material eligible for warehouse progress in the same tick. All stages run automatically without a manager or player tap; locked floors remain completely inert.

## Extraction Contract

Every unlocked floor advances extraction on each fixed tick using its configured cycle duration. A completed cycle yields `baseYield × outputGrowthRate^(mineShaftLevel - 1) × cumulativeMilestoneMultiplier`. Completed output is added immutably to that floor's `materialQueue` and `totalExtracted`, while normalized overflow progress carries into the next cycle. Locked floors remain inert, and extraction never changes global gold, elevator state, warehouse state, or transport totals.

## Elevator Transport Contract

When idle, the shared elevator scans from `roundRobinCursor` through the ordered floor list with wraparound, skipping locked or empty floors. A successful pickup removes the lesser of the selected queue and elevator capacity, adds that amount to the floor's `totalTransported`, stores it in `carriedMaterial`, and advances the cursor to the following floor. The configured 1,500 ms transit must complete before the load enters `warehouse.inputQueue`; excess remains at the floor, and elevator operations never change gold directly.

## Warehouse Conversion Contract

The warehouse idles with no input. While input exists, it advances normalized conversion progress using the configured 1,200 ms cycle. Material remains in `inputQueue` until the cycle boundary; completion consumes the lesser of input and warehouse capacity, adds that amount 1:1 to global `gold` and `totalGoldDelivered`, and leaves excess for later cycles. Progress resets when the queue empties. For a state with no seeded material, conservation is `totalExtracted = floor queues + elevator carried material + warehouse input + totalGoldDelivered`.

## Production Rate Contract

Production rates are pure derived values and are not stored in authoritative state. Each floor's theoretical extraction per second includes level growth and the cumulative milestone multiplier, including a theoretical value for locked floors. Aggregate mine extraction sums only unlocked floors. Elevator and warehouse throughput use their milestone-aware authoritative capacity multiplied by `1,000 / cycleDurationMs`; effective mine production is the minimum of aggregate extraction and those two shared-stage rates. The result also identifies the limiting stage, with deterministic extraction → elevator → warehouse precedence for exact ties.

## Upgrade Purchase Contract

The next price for every upgradeable stage is `baseCost × costGrowthRate^currentLevel`, calculated without rounding through `GameNumber`. Mine-shaft, elevator, and warehouse purchases are distinct immutable commands. A successful command deducts exactly one price and increments only the selected level. Mine-shaft output is derived from the new level; elevator and warehouse capacity is recalculated with level growth and cumulative milestones without changing cycle duration. Queues, normalized progress, carried material, totals, cursors, timestamps, and unrelated stages remain unchanged. Insufficient funds, a missing floor, or a locked floor returns an explicit failure with the original state object. Invalid or non-incrementable levels are invariant errors.

## Milestone Contract

Milestones are cumulative pure functions of the current stage level. Reaching levels 10/25/50/100 multiplies the stage effect by x2/x2/x3/x4 respectively, producing cumulative multipliers x2/x4/x12/x48. No milestone-award flag or mutable bonus is stored, so reconstructing the same authoritative state cannot grant a multiplier twice. The same calculation drives fresh shared-stage capacity, purchases, actual extraction, and production-rate estimates.

## Floor Unlock Contract

Floors 2–4 unlock only through an immutable purchase command. The target must exist and still be locked; its configured immediately previous floor must already be unlocked and meet the required shaft level before affordability is checked. Success deducts the configured cost exactly once and replaces the locked target with a configured starting floor marked unlocked, resetting its level, progress, queues, and totals while preserving every unrelated state field. Repeated, premature, unaffordable, and unknown requests return explicit failures with the original state object.

## Economy Progression Simulation Contract

The pure Step 19 balance harness starts from fresh authoritative state and advances production in deterministic one-second decisions for a default ten-minute session. An eligible affordable next floor unlock takes priority; once a prerequisite is reached but its unlock is not yet affordable, the policy preserves gold until it can pay the cost. Otherwise it evaluates every currently affordable stage upgrade by recalculating effective production per second after the hypothetical purchase and selects the greatest improvement. Exact ties prefer the shaft needed for the next unlock, then configured floor/elevator/warehouse order. The report returns the final state and an immutable action trace with elapsed time, target, exact cost, and modeled rate improvement. This harness does not run in the player-facing update loop.

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
| `state.floors` | array | Exactly four entries in configured order with the exact configured identifiers and floor numbers. |
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
| `state.elevator.roundRobinCursor` | integer | In `[0, 4)`. |
| `state.elevator.transitProgress` | number | Finite value in `[0, 1)`; zero when carried material is zero. |
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

The browser creates a pending-reward view model only for a positive calculated reward. Its accessible modal displays credited duration and the exact serialized reward. `claimOfflineReward` adds that value once to a new authoritative state and consumes the pending value; a call with no pending value is an identity result. Browser orchestration caches one claim candidate, force-persists it before dismissing the modal, and reuses that candidate after a failed write so retry cannot add gold twice. The version-1 save and IndexedDB schemas remain unchanged because only the post-claim authoritative gold snapshot is stored.

## Portrait Layout Contract

The logical viewport stays fixed at 360×640. `#app` absorbs `env(safe-area-inset-*)` as padding so the `#game-viewport` Phaser parent is already the safe box when the scale manager measures it; `index.html` opts in with `viewport-fit=cover`. The scale manager uses `FIT` with `CENTER_BOTH`, which preserves aspect ratio and letterboxes rather than cropping, so no required control can leave the host viewport at any size.

`calculateMineLayout(width, height)` is pure and Phaser-free. It tiles three full-width regions top to bottom with no gaps, overlaps, or reserved bottom navigation:

| Region | Logical rect (360×640) | Role |
|---|---|---|
| `hud` | `0,0,360,72` | Fixed top HUD; English `Gold` and `Income /s` labels. |
| `surface` | `0,72,360,140` | Shared elevator and warehouse panels. |
| `mine` | `0,212,360,428` | Clipped viewport the mine content scrolls behind; runs to the bottom edge. |

The layout rejects non-finite or non-positive dimensions and any height below `HUD_HEIGHT + SURFACE_HEIGHT + MINE_MIN_HEIGHT` (412). `calculateMineContentHeight()` returns 514 logical pixels for four floor slots — taller than the 428-pixel mine region — so the area must scroll. `calculateFloorSlotRegion(index)` returns each slot relative to the content origin.

Clipping uses a dedicated Phaser camera whose viewport equals the mine region, because Phaser 4 removed WebGL geometry masks. The main camera ignores the mine content layer and the mine camera ignores the fixed layers, so the HUD and surface never scroll and Step 31 only needs to drive the mine camera's `scrollY`. Both halves of that cross-ignore are covered by browser pixel probes, because dataset diagnostics report only intended geometry and stay green when the cameras are misconfigured. The scene publishes `data-layout-viewport`, `data-layout-hud`, `data-layout-surface`, `data-layout-mine`, `data-layout-mine-content-height`, and `data-layout-bottom-navigation` on the canvas for browser assertions. Floor slots are layout placeholders replaced by bound floor views in Step 26.

## Provisional Balance Snapshot

| Stage | Starting values | Upgrade values | Unlock |
|---|---|---|---|
| Floor 1 | Level 1, yield 10 / 2,000 ms, unlocked | Base cost 25, cost x1.15, yield x1.10 | None |
| Floor 2 | Level 1, yield 30 / 2,500 ms, locked | Base cost 75, cost x1.15, yield x1.10 | 250 gold; Floor 1 level 5 |
| Floor 3 | Level 1, yield 90 / 3,000 ms, locked | Base cost 225, cost x1.15, yield x1.10 | 1,500 gold; Floor 2 level 5 |
| Floor 4 | Level 1, yield 270 / 3,500 ms, locked | Base cost 675, cost x1.15, yield x1.10 | 7,500 gold; Floor 3 level 7 |
| Elevator | Level 1, capacity 50 / 1,500 ms | Base cost 100, cost x1.15, capacity x1.12 | Shared and always available |
| Warehouse | Level 1, capacity 60 / 1,200 ms | Base cost 120, cost x1.15, capacity x1.12 | Shared and always available |

Starting gold is 100. Every upgradeable stage uses milestones at levels 10/25/50/100 with x2/x2/x3/x4 multipliers. The Step 19 deterministic simulation validates that these values meet the automated ten-minute progression targets without tuning; they remain provisional until player-facing playtesting.

## Complete Database Schema

**Relational/server database schema: none.** The base game remains client-only.

**IndexedDB database:** `cat-mine-idle`, schema version `1`.

| Object store | Field | Type | Required / nullable | Key / constraint |
|---|---|---|---|---|
| `saves` | `id` | string | Required, non-null | Primary key via key path `id`; application writes only the literal `active`. |
| `saves` | `document` | structured-clone-compatible `SaveDocumentV1` object | Required, non-null | Must pass version-1 migration and validation before runtime deserialization. |

The store has no auto-increment key, secondary indexes, foreign keys, relationships, or additional records by design. `put({ id: 'active', document })` replaces the prior snapshot, enforcing one logical active save. Dexie database version 1 creates `saves` with schema string `id`; no prior IndexedDB version or data migration exists.
