# Architecture

## Current Status

Steps 1 through 30 are complete. Step 31's mine scrolling and one-thumb input — the mine area now scrolls under a drag or a wheel while the HUD and surface stay fixed, a gesture that became a scroll can no longer buy the button it ends on, and every control is a 44x44 logical touch target — are implemented with passing automated checks and are awaiting user validation. Step 32 and all later work remain blocked. IndexedDB schema version 1 is unchanged and documented below; there is no relational or server database.

## Implemented Foundation

| Path | Responsibility |
|---|---|
| `index.html`, `src/main.ts`, `src/style.css` | Browser entry point, `viewport-fit=cover` opt-in, safe-area-inset host padding around the `#game-viewport` Phaser parent, Phaser game startup, and hot-reload cleanup. |
| `src/game/layout/mineLayout.ts`, `src/game/layout/palette.ts`, `src/game/layout/index.ts` | Pure Phaser-free portrait geometry and palette: logical viewport constants, HUD/surface/mine regions, scrollable mine content height, floor-slot regions, diagnostic region serialization, and the `#rrggbb` colors both the scene and the browser pixel probes read. |
| `src/game/view-model/mineViewModel.ts`, `src/game/view-model/hudViewModel.ts`, `src/game/view-model/purchaseControl.ts`, `src/game/view-model/formatAmount.ts`, `src/game/view-model/stageAnimation.ts`, `src/game/view-model/index.ts` | Pure Phaser-free presentation logic. The snapshot view model derives per-floor heading, level, lock status, progress ratio and label, queued-amount label, discrete pile height and backlog state, plus each shared stage's level, capacity, held amount, queue blocks, running/backed-up status, and cycle progress, and carries the HUD model. The HUD module derives the English gold and income captions and their values from authoritative gold and the core's effective production rate. The purchase-control module derives each priced control's action caption, price, enabled state, command target, and stable key, plus the lifetime of a press result; it covers both stage upgrades and floor unlocks, and formats the requirement line a locked floor shows. The format module is the single abbreviated-amount formatter every displayed quantity goes through. The animation module holds the cosmetic clock maths — frame accumulation with a speed multiplier, miner swing, conveyor travel, and the progress-driven cycle marker. |
| `src/game/runtime/MineSimulationDriver.ts`, `src/game/runtime/index.ts` | Phaser-free live bridge between the core and the screen: holds authoritative state and the balance data prices and the HUD estimate are derived from, advances state to an injected wall clock on each pull, memoizes the derived snapshot, routes upgrade presses to the matching core command, and accepts state replaced by a command. |
| `src/game/entities/HudView.ts`, `src/game/entities/MineFloorView.ts`, `src/game/entities/SharedStageView.ts`, `src/game/entities/PurchaseControlView.ts`, `src/game/entities/index.ts` | Reusable Phaser views that build their own game objects once, rebind through `applySnapshot`, move decoration through `applyAnimation`, show press results through `applyUpgradeFeedback` and `applyUnlockFeedback`, and report what they actually display through `describeRenderedState`. `HudView` owns the fixed top bar: its background, divider, and four text objects. `PurchaseControlView` is the one pressable button, shared by the floor panels — where an upgrade and an unlock instance share one slot — and both shared stages. |
| `package.json`, `package-lock.json`, `tsconfig.json` | Locked dependencies, strict compiler settings, and verified development/build/test scripts. |
| `eslint.config.mjs` | Flat lint configuration for TypeScript, configuration files, and the Node simulator script. |
| `vitest.config.ts`, `tests/unit/` | Node-based unit-test configuration and scaffold baseline coverage. |
| `playwright.config.ts`, `tests/e2e/` | Chromium E2E configuration, automatic Vite test server, and browser smoke coverage. |
| `tests/unit/architecture.test.ts` | Regression coverage proving the core, layout, view-model, and simulation-driver boundaries accept pure TypeScript and reject renderer, adapter, and browser dependencies. |
| `scripts/dev-simulator.mjs` | iPhone Simulator preview workflow retained from Step 2. |
| `src/game/scenes/BootScene.ts` | Single scene that builds the fixed HUD layer, the shared surface layer with both stage views, and the mine content layer with four floor views; pulls the newest snapshot from its source on every frame, advances the separate cosmetic animation clock from the frame delta, clips the mine through a dedicated camera viewport, and records startup, renderer, layout, rendered-view, HUD, and animation diagnostics on the game canvas. |
| `src/config/balance.ts`, `src/config/types.ts`, `src/config/validateBalance.ts` | Provisional four-floor/shared-stage data, its public types, and fail-fast startup validation. |
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
| `src/game/` | Owns the Phaser game configuration, the pure portrait-layout geometry, the pure presentation view model and cosmetic animation maths, the live simulation driver, the reusable floor and shared-stage views, and the single scene that pulls snapshots into them; live HUD values, interactive controls, and scroll input remain deferred. |
| `src/ui/` | Owns the implemented offline-reward DOM modal; the mine HUD and later overlays remain deferred. |
| `src/persistence/` | Owns the save-document boundary, storage interface, Dexie active-save adapter, debounce/failure coordinator, runtime deserialization, and recovery-aware active-game loading. |
| `src/platform/web/` | Owns the implemented save lifecycle binding; broader browser lifecycle translation remains future work. |
| `public/assets/placeholder/` | Implemented tracked directory for future original placeholder assets. |
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

The browser creates a pending-reward view model only for a positive calculated reward. Its accessible modal displays credited duration and the exact serialized reward. `claimOfflineReward` adds that value once to a new authoritative state and consumes the pending value; a call with no pending value is an identity result. Browser orchestration applies that state to the simulation driver, force-persists it before dismissing the modal, and guards the claim with a consumed-once flag rather than a cached state candidate: production continues while the modal is open, so a retry after a failed write saves the mine as it is at that moment and still adds the reward exactly once. The version-1 save and IndexedDB schemas remain unchanged because only the post-claim authoritative gold snapshot is stored.

## Portrait Layout Contract

The logical viewport stays fixed at 360×640. `#app` absorbs `env(safe-area-inset-*)` as padding so the `#game-viewport` Phaser parent is already the safe box when the scale manager measures it; `index.html` opts in with `viewport-fit=cover`. The scale manager uses `FIT` with `CENTER_BOTH`, which preserves aspect ratio and letterboxes rather than cropping, so no required control can leave the host viewport at any size.

`calculateMineLayout(width, height)` is pure and Phaser-free. It tiles three full-width regions top to bottom with no gaps, overlaps, or reserved bottom navigation:

| Region | Logical rect (360×640) | Role |
|---|---|---|
| `hud` | `0,0,360,72` | Fixed top HUD; English `Gold` and `Income /s` labels. |
| `surface` | `0,72,360,164` | Shared elevator and warehouse panels. |
| `mine` | `0,236,360,404` | Clipped viewport the mine content scrolls behind; runs to the bottom edge. |

The layout rejects non-finite or non-positive dimensions and any height below `HUD_HEIGHT + SURFACE_HEIGHT + MINE_MIN_HEIGHT` (436). `calculateMineContentHeight()` returns 514 logical pixels for four floor slots — taller than the 404-pixel mine region — so the area must scroll by 110. `calculateFloorSlotRegion(index)` returns each slot relative to the content origin.

`MIN_TOUCH_TARGET_PX` is 44 and `assertTouchTargetRegion` rejects any smaller interactive region. The surface strip is sized around it: a stage panel is `SURFACE_HEIGHT` less its title row and bottom inset, and its last 44 pixels are the upgrade control. That is why the strip is 164 rather than the 140 it was through Step 30.

Clipping uses a dedicated Phaser camera whose viewport equals the mine region, because Phaser 4 removed WebGL geometry masks. The main camera ignores the mine content layer and the mine camera ignores the fixed layers, so the HUD and surface never scroll and the scroll gesture drives only the mine camera's `scrollY`. Both halves of that cross-ignore are covered by browser pixel probes, because dataset diagnostics report only intended geometry and stay green when the cameras are misconfigured. The scene publishes `data-layout-viewport`, `data-layout-hud`, `data-layout-surface`, `data-layout-mine`, `data-layout-mine-content-height`, and `data-layout-bottom-navigation` on the canvas for browser assertions. Floor slots are layout placeholders replaced by bound floor views in Step 26.

## Mine Scroll and Input Contract

The mine content is 110 logical pixels taller than the region it is drawn through, so the player reaches the lower floors by dragging or wheeling. `src/game/view-model/mineScroll.ts` decides all of that from pointer coordinates and the mine region alone; the scene only applies the resulting `scrollY` to the mine camera, which is also the camera Phaser hit-tests through, so a control's pressable rectangle follows the content it is drawn on without further bookkeeping.

`createMineScrollState({region, contentHeight})` caps travel at `max(0, contentHeight - region.height)`, so content that already fits cannot scroll into empty space. `beginMineScrollGesture` anchors a press, `dragMineScroll` moves the content one pixel per pixel of travel from that anchor, `endMineScrollGesture` releases it, and `scrollMineByWheel` adds a wheel delta. Both scrolling entry points clamp at `[0, maxScrollY]`, and every transition returns its input unchanged by identity when nothing moved, so a held finger that only wobbles costs no camera write.

Telling a tap from a scroll is the awkward part, and it is decided in that pure model rather than in Phaser:

- Travel under `MINE_SCROLL_DRAG_THRESHOLD_PX` (6) scrolls nothing and suppresses nothing, because a thumb never lands perfectly still and a press that wobbles must still buy what it aimed at. Crossing the threshold scrolls the whole travel including those first pixels — six pixels is below what the eye catches, while losing one-to-one tracking is not.
- Every press is tracked, not only one that landed on the mine, because a gesture decides two separate things: whether the mine scrolls, which needs the press to have started over it, and whether the release is still a tap, which is about how far the pointer travelled wherever it began. A swipe from the surface strip that lifts on a floor's button is not a tap on that button.
- `hasDragged` outlives the gesture that set it and is cleared only by the next pointer-down. Phaser reports a control's press while the pointer is still coming up, so the flag has to survive that release; `BootScene.#requestPurchase` returns early while it is set. A wheel never sets it, because a notch of scroll followed by a click is two separate intentions.

The wheel is ignored unless the pointer is over the mine, so the fixed layers cannot scroll it. Wheel deltas arrive in host pixels rather than logical ones, which differ by the fitted canvas scale; for a wheel that is not worth carrying the scale factor into a pure module. `#game-viewport canvas` sets `touch-action: none` so the browser cannot claim a vertical gesture as a page pan before Phaser sees it.

`PublishedPurchaseControl` carries `isPressable` beside its screen rectangle: a floor control scrolled out of the mine viewport is clipped away and hit-tested by no camera, so the rectangle outlives the control behind it. `describeMineScroll` is published as `data-mine-scroll` on the same 100 ms cadence as the other read-backs.

## Mine View Contract

Presentation is a two-layer read of authoritative state. `createMineViewModel(state, balance)` is pure and Phaser-free: it derives each floor's `Floor N` heading, `Lv N` level label, `Locked` status or `null`, normalized extraction progress plus its percentage label, queued-amount label, and discrete material-pile height, and the shared elevator/warehouse title, level, capacity, held amount, cycle progress, and control labels. It rejects progress outside `[0, 1)` and non-positive levels, and never mutates the state it reads.

`MineFloorView` and `SharedStageView` build their game objects once inside a supplied `LayoutRegion` and change only through `applySnapshot`. A floor shows its number badge, heading, mine-shaft level, placeholder miner, material pile, extraction progress bar with percentage, and one priced control. Locked floors use the `LOCKED_PANEL_BACKGROUND` panel with a `Locked` badge, muted text, no miner, the requirement they are waiting on, and an unlock control in place of the shaft-upgrade control. The elevator and warehouse render side by side in the surface strip with their own level, capacity, held amount, cycle-progress bar, and upgrade control. Both kinds of control are interactive, described under the Purchase Control Contract and the Floor Unlock Contract below.

The material pile is four discrete steps measured against one elevator trip — a positive queue shows one block and each of the 25%, 50%, and 75% capacity thresholds adds another — so a full pile is the visible signal that the shared elevator is the bottleneck.

`describeRenderedState` reads values back from the view's own game objects, and `BootScene` publishes them as `data-floor-views` and `data-surface-views`. Browser tests therefore compare rendered output rather than the scene's intentions, and pixel probes still guard the case where correct values never reach the framebuffer.

`BootScene` receives its snapshot source through its constructor, so the mine boots already bound rather than showing placeholder values first.

## Live Production Stage Contract

The screen pulls; the core never pushes. `MineSimulationDriver` holds authoritative state, and each rendered frame `BootScene.update` asks it to advance. The driver credits `now() - state.lastUpdateTimestampMs` through `catchUpSimulation`, where `now` is injected so `Date.now()` stays in `src/main.ts`. That delta is not always a frame: the browser stops the render loop for a hidden tab, so it is routinely a whole absence, and `advanceSimulation`'s per-call `MAX_FOREGROUND_DELTA_MS` bound — which exists so one slow frame cannot pay out a burst — would consume the rest unsimulated. `catchUpSimulation` walks the gap in credited-size slices instead, exactly rather than approximately, because the sub-tick remainder is carried in authoritative state. The walk is bounded at `MAX_CATCH_UP_MS` (two hours, matching the offline-income horizon) so resuming cannot freeze the tab; time past the bound is still consumed by `lastUpdateTimestampMs`, since a timestamp left behind real time would hand the same interval to offline income on the next load. Nothing about the frame — its rate, its delta, its animation speed — enters that calculation, so equal wall-clock time produces equal state at any frame rate, and a frozen clock is a paused mine that still renders. A clock that moves backwards credits nothing and leaves the authoritative timestamp ahead until real time catches up. The driver memoizes its derived snapshot and re-derives it only when a fixed tick completed. A sixty-frame second completes ten ticks, so most frames leave a state differing solely in timestamp and sub-tick remainder; those hand back the same object and the scene skips rebinding by identity, with its renderable guard ordered behind that check. `replaceState` always re-derives, because a command changes displayed values without completing a tick. The rendered-state read-back that browser tests assert against is gated on `import.meta.env.DEV`, so a shipped build neither runs nor contains it. Commands replace state through `replaceState`, which the offline-reward claim uses before the next frame continues from it.

Each of the three stages has its own indicator, all fed from authoritative progress: a per-floor extraction bar, and, for the shared elevator and warehouse, a cycle bar plus a marker travelling its track through `calculateCycleMarkerOffsetPx`. Queued material is rendered wherever it can accumulate — the per-floor pile, the elevator's carried load, and the warehouse input queue — each as discrete blocks measured against the capacity of the stage that removes it. A full pile is the backlog signal: it switches to `MATERIAL_BACKLOG_FILL`, a floor adds a `Backed up` label, and the warehouse reports `Backed up` instead of `Converting`. The elevator is never backed up by construction, because a full car is one full trip; transport pressure appears as full floor piles instead.

Decoration is a separate clock. `BootScene` accumulates `advanceAnimationTimeMs(frameDelta × animationSpeedMultiplier)` and drives only the miners' picks and the shared-stage conveyor dashes, which run only while a stage holds material. The multiplier is validated as finite and non-negative and reaches nothing else, so scaling or freezing animation cannot change extraction, transport, conversion, or gold. Rendered values and the animation clock are republished to the canvas as `data-floor-views`, `data-surface-views`, and `data-animation` on a 100 ms cadence rather than every frame, because displayed progress changes continuously and an unthrottled read-back would serialize the whole screen 60 times a second for diagnostics alone.

## HUD Contract

The fixed top bar shows the two numbers the screen is about. `createHudViewModel(state, balance)` derives the English `Gold` and `Income /s` captions and both values; it is carried on the same `MineViewModel` the mine views are bound from, so one snapshot drives the whole screen. Gold is the authoritative balance. Income is `calculateMineProductionRates(...).effectiveProductionPerSecond` — the rate already capped at the chain's slowest stage — so the HUD estimates what the mine can deliver rather than what the shafts could extract if transport and conversion were free. Balance data therefore reaches the view model, and `MineSimulationDriver` takes it alongside state.

`formatAmount` is the one formatter every displayed amount goes through, in the HUD and in the mine views alike. It shows at most one decimal place followed by the suffix for the value's magnitude: no suffix below 1,000, then `K`, `M`, `B`, `T`, then alphabetic suffixes counting `aa`, `ab`, ... `zz`, `aaa`, ... as the game design document specifies. Past three letters — beyond 1e54000, which no reachable balance approaches — the serialized scientific form is shown instead of an unbounded run of letters. Digits are truncated rather than rounded, because a balance that reads higher than it is would promise an upgrade the player cannot afford; a value that is present but smaller than the displayed precision reads `<0.1` rather than `0`. Values are read through `GameNumber`'s normalized `mantissa` and `exponent` rather than converted to a `number`, so magnitudes past `Number.MAX_VALUE` format like any other instead of collapsing to `Infinity`.

`HudView` builds its background, divider, and four text objects once and changes only through `applySnapshot`, so a value that moves ten times a second costs a string assignment rather than a rebuilt display list. `describeRenderedState` reads the four strings back from those objects and `BootScene` publishes them as `data-hud-view` on the same 100 ms cadence as the other rendered-state diagnostics.

## Purchase Control Contract

Every purchase on the screen is the same control: a labelled button with a price that either can or cannot be pressed to effect right now. `createUpgradeControlViewModel(target, cost, gold)` is pure and derives the `Upgrade` action caption, the abbreviated price, an `isEnabled` flag from `gold >= cost`, the `PurchaseTarget` naming the command to send, and a stable `key`. Each price comes from the same core function that charges it — `calculateMineShaftUpgradeCost`, `calculateElevatorUpgradeCost`, `calculateWarehouseUpgradeCost` — so the figure on the button and the figure deducted cannot drift. `createMineViewModel` therefore takes each floor's own balance config plus the spendable balance.

`PurchaseControlView` is one reusable entity used by both the floor panels (`stacked`: action over price) and the shared-stage panels (`inline`: action left, price right). Its background rectangle carries the hit area, so the pressable region is exactly the drawn one and hiding the control removes it from input. A disabled control is drawn in `CONTROL_DISABLED_BACKGROUND` with disabled text, but it still accepts a press: refusing in the view would replace the core's answer with the renderer's guess and would leave the player with no feedback at all.

A press goes to `MineSimulationDriver.purchase(target)`, the scene's `MineCommandSink`. The driver advances to the current time first, because the player spends the gold the mine has now rather than the gold the last rendered frame showed, then dispatches to the matching core command and returns `purchased`, `unlocked`, `insufficient-funds`, `requirement-not-met`, or `unavailable`. Only the two refusals a player can act on are named; every other core failure reads as unavailable rather than as advice the player cannot use. A refusal leaves authoritative state and the memoized snapshot untouched, so the scene skips rebinding by identity; a purchase replaces state, re-derives the snapshot, and invokes the optional `onCommandApplied` hook. `src/main.ts` uses that hook to queue a debounced save, because a purchase changes state without any simulation tick completing and would otherwise be lost on the next reload.

The result is shown on the pressed control for `PURCHASE_FEEDBACK_DURATION_MS` (1,200 ms): `Upgraded!` or `Unlocked!` on green, `Need more gold`, `Level too low`, or `Unavailable` on red, in place of the action and price. `describePurchaseFeedback(feedback, nowMs)` is pure and expires the message, and the scene runs it on the Phaser scene clock rather than the cosmetic animation clock, so how long a message stays readable cannot change with animation speed. The scene expires its whole feedback map each frame rather than only the entries whose control is still on screen: the map is keyed by control and so is bounded either way, but a successful unlock hides the control that was pressed, and collecting through live controls alone would leave that result in place until the control came back. `BootScene` rebinds the snapshot and republishes diagnostics immediately on a press instead of waiting for the next tick. Because that expiry runs on the frame clock, every control re-renders on every frame, so the render path must cost nothing when nothing changed: text colours are compared before they are written, since `Text.setColor` — unlike `Text.setText` — repaints the caption's canvas and re-uploads its texture on every call. A browser test counts repaints across idle frames and requires zero.

`BootScene` publishes `data-purchase-controls`: every visible control's key, rendered labels, enabled appearance, live feedback, and its pressable rectangle in screen coordinates. Floor controls are drawn through the mine camera, so their world rectangle is offset by that camera's viewport and scroll, while the surface stages are drawn by the main camera where world and screen coincide. This is what lets a browser test aim a real press at a real control instead of assuming a coordinate.

## Floor Unlock Contract

A floor offers exactly one purchase: an open floor sells its shaft upgrade, and a locked floor sells itself. `describeFloorUnlock(state, floorId, config)` returns one locked floor's price, the prerequisite shaft it waits on (id, player-facing number, required level, and where that shaft stands now), `isRequirementMet`, `isAffordable`, and `canUnlock`, or `null` once the floor is open. It and `purchaseFloorUnlock` share one private predicate, so a floor can never look unlockable to the player while the command refuses it, or the reverse; a unit test asserts that agreement across every combination of prerequisite level and balance.

`createFloorUnlockControlViewModel(availability)` turns that description into the same `PurchaseControlViewModel` an upgrade uses, with the `Unlock` caption and `isEnabled` set from `canUnlock` — so gold alone never enables the button while the prerequisite is short. The requirement itself is not on the button but beside it: `formatUnlockRequirement` produces `Needs Floor 1 Lv 5`, drawn in `TEXT_WARNING` while unmet and `TEXT_MUTED` once satisfied, so a player who is only short of gold is not told to keep upgrading.

`MineFloorView` holds two `PurchaseControlView` instances in one slot, of which exactly one is ever visible; Phaser skips invisible objects when hit-testing, so the two can never both take a press, and a browser test pins that behaviour rather than the mechanism: it asserts the two controls report the same screen rectangle and that a press there, once the floor is open, buys a shaft level. `assertRenderableMineViewModel` enforces that a floor carries exactly one of the two controls, and `createMineFloorViewModel` rejects an unlock description that disagrees with the floor's lock state, because either would render a button that buys the wrong thing.

A successful unlock is applied in place: `purchaseFloorUnlock` initializes the floor from balance data, the driver re-derives the snapshot, and the scene rebinds on the same press — the panel loses its locked colour and `Locked` badge, gains its miner and shaft-upgrade control, and the unlock control disappears, all without the scene restarting. That visible change is the confirmation; the `Unlocked!` message is on a control that the same frame removes.

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
