# Base Game Implementation Plan

## Purpose

This plan gives AI developers an ordered, testable path from the current documentation-only repository to a playable base game. Its recorded base-game decisions are authoritative for this milestone. Complete steps in order, and do not start a step while its dependencies or validation checks are failing.

The base game includes an English-language portrait mine, four floors, the extraction → shared elevator → shared warehouse production chain, gold, three independently upgradeable production stages, milestone multipliers, sequential floor unlocks, local saves, and capped offline income. Production runs automatically without managers. Use original placeholder assets.

Managers, boosts, gift drops, premium currency, shops, tasks, social systems, Telegram integration, backend services, payments, ads, blockchain, final art, and production audio are explicitly deferred.

## Phase 1 — Establish the Project

### Step 1: Confirm scope and repository state

**Instructions:** Read `AGENTS.md` and every file in `memory-bank/`, including `memory-bank/game-design-document.md` and `memory-bank/tech-stack.md`. Record any contradiction as a documentation issue before implementation. Confirm that no database is required for the base game.

**Test:** Verify that the implementation checklist contains only the base-game systems listed above and that `memory-bank/techContext.md` still reports no database schema.

### Step 2: Scaffold the web application

**Instructions:** Create a Vite TypeScript application at the repository root. Add Phaser 4.2.1 and use npm with a committed lockfile. Preserve all existing Markdown documents.

**Test:** Run the development command and confirm a browser can load the application without runtime or console errors.

### Step 3: Add quality tooling

**Instructions:** Configure strict TypeScript checking, ESLint, Vitest, and Playwright. Add scripts named `dev`, `build`, `lint`, `test`, and `test:e2e`. Make the production build run type checking before bundling.

**Test:** Run every script. Confirm lint, type checking, unit tests, E2E tests, and the production build all exit successfully from a clean checkout.

### Step 4: Create the planned module boundaries

**Instructions:** Establish `src/core/`, `src/config/`, `src/game/`, `src/ui/`, `src/persistence/`, and `src/platform/web/`. Add `public/assets/placeholder/` and test directories. Prevent `src/core/` from importing Phaser, DOM, or persistence modules.

**Test:** Add an architecture check or lint rule that fails when a core module imports Phaser or browser-specific code; confirm the initial structure passes it.

### Step 5: Create a minimal Phaser boot scene

**Instructions:** Initialize one Phaser game and one boot scene. Use automatic WebGL/Canvas selection, a 360×640 logical viewport, and a neutral placeholder background. Avoid physics.

**Test:** Confirm exactly one canvas appears, the boot scene starts once, and the application produces no duplicate-game or renderer errors after a development reload.

## Phase 2 — Build the Deterministic Game Core

### Step 6: Define base-game balance configuration

**Instructions:** Create data-driven configuration for four floors plus the shared elevator and warehouse. Choose and document provisional starting gold, unlock costs and requirements, starting levels, yields, durations, capacities, upgrade base costs, and growth rates. Apply milestones to every upgradeable stage at levels 10/25/50/100 with multipliers x2/x2/x3/x4. Tune values toward unlocking at least three floors and reaching one milestone within ten minutes of real gameplay.

**Test:** Validate the configuration at startup and in a unit test. Reject missing floors, duplicate floor identifiers, negative durations, non-positive yields, and invalid milestone ordering.

### Step 7: Introduce the large-number boundary

**Instructions:** Define one `GameNumber` abstraction for gold, yields, and costs. Keep formatting separate from arithmetic so the underlying numeric library can be replaced later.

**Test:** Verify addition, subtraction, multiplication, comparison, serialization, and deserialization at ordinary values and values beyond JavaScript's safe integer range.

### Step 8: Define authoritative game state

**Instructions:** Model the global gold balance, last update timestamp, save version, four floor states, one shared elevator state, and one shared warehouse state. Each floor tracks lock status, mine-shaft level, extraction progress, local material queue, and production totals. The elevator tracks level, capacity, round-robin cursor, transit progress, and carried material. The warehouse tracks level, capacity, input queue, and conversion progress. Exclude animation-only state.

**Test:** Create a fresh state from configuration and assert that only floor one is unlocked, all progress values are valid, and serialized state contains no renderer objects or functions.

### Step 9: Implement fixed-step simulation time

**Instructions:** Advance the core simulation from elapsed milliseconds rather than rendered frames. Bound unusually large foreground deltas; offline time will be handled separately. Make equal elapsed time produce equal results regardless of update chunk size.

**Test:** Simulate the same duration using one large update and many small updates. Assert identical floor queues, completed cycles, and gold totals.

### Step 10: Implement extraction

**Instructions:** Make each unlocked floor complete extraction cycles according to its configured duration and level-adjusted yield. Completed output must enter the floor's material queue and must not directly increase spendable gold.

**Test:** Advance one floor to immediately before, exactly at, and beyond one cycle boundary. Confirm output is created only at the boundary and overflow time carries into the next cycle.

### Step 11: Implement the shared elevator

**Instructions:** Move material from floor queues to the warehouse queue through one timed shared elevator. Select floors round-robin from top to bottom, skip empty or locked floors, idle when no material exists, and respect elevator capacity.

**Test:** Verify an empty elevator produces nothing, limited capacity leaves excess material behind, round-robin selection prevents a busy floor from starving others, and multiple cycles preserve total material without duplication or loss.

### Step 12: Implement warehouse conversion

**Instructions:** Process the warehouse queue through a timed collection stage. Add gold to the spendable balance only after warehouse completion.

**Test:** Trace a known quantity through all three stages and assert conservation: extracted material equals queued material plus in-transit material plus delivered gold.

### Step 13: Run four floors concurrently

**Instructions:** Update every unlocked floor during each simulation step, then update the shared elevator and shared warehouse. Locked floors must remain inert. All production runs automatically without a Manager or player tap.

**Test:** Simulate floors with different durations and compare results against independently calculated expectations. Assert locked floors have zero progress and zero output.

### Step 14: Calculate production rates

**Instructions:** Expose theoretical extraction per second for each floor and effective production per second for the whole mine. The mine estimate must account for the aggregate shaft output and the shared elevator and warehouse capacities, using the slowest effective stage.

**Test:** Create extraction-, transport-, and warehouse-bottleneck scenarios and confirm the displayed estimate follows the correct bottleneck in each case.

## Phase 3 — Progression and Economy

### Step 15: Implement upgrade costs for all three stages

**Instructions:** Calculate separate next-upgrade prices for each mine shaft, the shared elevator, and the shared warehouse from their base cost, growth rate, and current level. Route purchases through distinct core commands that check funds and return clear success or failure results.

**Test:** Verify exact cost at representative levels, successful deduction with sufficient gold, and no state mutation when gold is insufficient.

### Step 16: Apply stage-specific upgrade effects

**Instructions:** Make mine-shaft upgrades improve extraction yield, elevator upgrades improve capacity and/or cycle time, and warehouse upgrades improve capacity and/or conversion time. Preserve every queue and preserve the percentage completion of valid in-progress work during an upgrade.

**Test:** Compare production over equal durations before and after upgrading each stage. Confirm the intended bottleneck improves, no queued material disappears, and in-progress work retains the same completion percentage.

### Step 17: Add milestone multipliers

**Instructions:** Apply the configured stage-specific multipliers when a mine shaft, elevator, or warehouse reaches a milestone. Ensure each milestone activates once and its effect is visible in both actual production and rate estimates.

**Test:** Upgrade across a milestone boundary and assert the expected multiplier. Reload the same state and confirm the multiplier is not granted twice.

### Step 18: Implement sequential floor unlocks

**Instructions:** Allow the next floor to unlock only when the previous mine shaft reaches its configured level requirement and the player can pay the unlock cost. Initialize the new floor from configuration.

**Test:** Cover failure for unmet prerequisites, failure for insufficient gold, successful unlock with one deduction, and rejection of a repeated unlock request.

### Step 19: Add an economy progression simulation

**Instructions:** Create a deterministic automated playthrough that purchases the currently affordable upgrade with the best modeled bottleneck improvement, then unlocks a floor when its requirements are met. Use it to expose stalls or runaway growth in provisional balance values.

**Test:** Run a ten-minute simulated session. Confirm at least three floors unlock, one milestone is reached, all balances remain finite and non-negative, and progress never becomes impossible.

## Phase 4 — Persistence and Offline Progress

### Step 20: Define the versioned save format

**Instructions:** Create a save document containing schema version, timestamp, effective production-rate snapshot, authoritative global state, floor states, shared elevator state, and shared warehouse state. Define validation rules and a migration entry point before storing any saves.

**Test:** Validate a correct save and reject missing versions, invalid numeric values, unknown required identifiers, negative queues, and timestamps in an unacceptable range.

### Step 21: Add IndexedDB persistence

**Instructions:** Store one active local save through a persistence interface backed by Dexie. Keep the core unaware of IndexedDB. Debounce routine writes and force a save on lifecycle events when supported.

**Test:** Save, reload the page, and confirm gold, levels, unlocks, queues, and timestamps restore exactly. Simulate a storage failure and verify the running session continues with a visible diagnostic rather than crashing.

### Step 22: Handle corrupt or incompatible saves

**Instructions:** If validation or migration fails, preserve the invalid payload for diagnostics where safe, record a visible warning, and automatically start a fresh game. Do not partially apply corrupt data or block the player with a reset confirmation.

**Test:** Load malformed JSON-equivalent data and unsupported versions. Confirm the game reaches a playable fresh state and records a recoverable error without an uncaught exception.

### Step 23: Calculate capped offline income

**Instructions:** On save, record the current effective production-rate snapshot. On load, calculate elapsed absence from the saved timestamp, clamp it to the configured two-hour cap, and award the saved rate multiplied by credited time and the provisional 50% efficiency. Treat future timestamps or negative elapsed time as zero reward and replace them with the current timestamp.

**Test:** Cover zero time, normal absence, absence beyond the cap, future timestamps, and repeated reloads. Confirm rewards are non-negative, capped, and never awarded twice for the same interval.

### Step 24: Present and claim offline rewards

**Instructions:** Hold calculated offline gold as a pending reward until the player claims it. Show elapsed credited time and reward amount in a simple modal, then persist the claimed state.

**Test:** Confirm the modal appears only for a positive reward, claiming adds the exact amount once, closing/reopening cannot duplicate it, and a fresh player sees no modal.

## Phase 5 — Render the Base Game

### Step 25: Establish responsive portrait layout

**Instructions:** Build an English-language 360×640 layout with a fixed top HUD, surface elevator/warehouse area, and scrollable mine area. Do not reserve or render bottom navigation for deferred features. Respect safe-area insets and scale without cropping critical controls.

**Test:** Use Playwright viewport checks for representative narrow phone, tall phone, tablet portrait, and desktop sizes. Assert the canvas fits, HUD remains visible, and no required control is outside the viewport.

### Step 26: Render four mine floors

**Instructions:** Create a reusable floor view bound to read-only core snapshots. Display floor number, mine-shaft level, placeholder miner, material pile, extraction progress, and shaft-upgrade control. Show locked floors distinctly. Render the shared elevator and warehouse with their own level, queue/progress, and upgrade controls in the surface/shaft area.

**Test:** Load a known fixture and compare all four displayed floor numbers, levels, lock states, and progress values with the core snapshot.

### Step 27: Visualize the three production stages

**Instructions:** Map extraction, transport, and warehouse progress to separate animations or progress indicators. Render queued material so a bottleneck becomes visually obvious. Presentation must not decide when production completes.

**Test:** Pause the core on controlled bottleneck fixtures and confirm the corresponding queue and progress indicator are visible. Verify changing animation speed cannot change gold output.

### Step 28: Connect the HUD

**Instructions:** Display spendable gold and estimated mine income per second using English labels. Format values as K/M/B/T before continuing with alphabetic suffixes for larger magnitudes. Update the HUD from snapshots/events without recreating text objects every frame.

**Test:** Feed representative values from zero through very large magnitudes and verify stable formatting. Complete a warehouse cycle and confirm the HUD matches authoritative gold.

### Step 29: Connect upgrade controls

**Instructions:** Show separate English upgrade controls and next costs for each mine shaft, the shared elevator, and the shared warehouse. Enable a control only when affordable, send the matching upgrade command, and provide immediate feedback for success or insufficient funds.

**Test:** Use an E2E flow to attempt an unaffordable upgrade, grant sufficient gold through a fixture, perform one upgrade, and verify one cost deduction, one level increase, and an updated button price.

### Step 30: Connect floor unlock controls

**Instructions:** Show each locked floor's requirement and price. On successful unlock, transition the floor to its active appearance without restarting the scene.

**Test:** In an E2E flow, verify premature unlock is blocked, satisfy the prerequisite, unlock the floor, reload, and confirm it remains unlocked and produces material.

### Step 31: Add mine scrolling and one-thumb input

**Instructions:** Allow vertical drag/wheel scrolling through the mine while keeping the top HUD fixed. Prevent an upgrade button tap from also initiating a drag. Ensure interactive targets are mobile-sized.

**Test:** Drag from top to bottom at a phone viewport, activate controls before and after scrolling, and verify no accidental purchase occurs during a scroll gesture.

### Step 32: Add original placeholder presentation

**Instructions:** Replace debug rectangles with simple original placeholder sprites, colors, and English labels that communicate miner, elevator, warehouse, gold, locked state, and upgrade state. Do not copy reference assets or branding. Audio remains deferred for this milestone.

**Test:** Perform a visual review at 100% and reduced mobile scale. Confirm every gameplay object remains distinguishable and no third-party protected asset is included in `public/assets/`.

## Phase 6 — Integration and Base-Game Exit Criteria

### Step 33: Add the complete player-journey E2E test

**Instructions:** Automate a fresh session through earning gold, upgrading a mine shaft, upgrading the elevator and warehouse, unlocking additional floors, reaching a milestone, saving, reloading, and claiming an offline reward through a controlled clock.

**Test:** Run the journey from a cleared browser profile twice. Both runs must produce the same expected state and no console errors.

### Step 34: Verify persistence across lifecycle events

**Instructions:** Exercise page reload, background/foreground transitions where testable, and abrupt navigation. Ensure elapsed foreground time and offline time are not double-counted.

**Test:** Compare the final state from uninterrupted play with an equivalent session containing reloads and lifecycle transitions. Totals must agree within the documented simulation tolerance.

### Step 35: Profile mobile performance

**Instructions:** Measure frame rate, frame time, memory trend, object counts, asset size, and startup time with all four floors active. Use a representative mid-range Android device running Chrome as the base-game benchmark; Telegram WebView verification belongs to the later integration milestone. Remove avoidable per-frame allocations and pool repeated visual effects.

**Test:** Run a ten-minute representative session. Confirm the game targets 60 FPS, has no sustained memory growth, and retains responsive input; document device/browser and measured results.

### Step 36: Validate production build behavior

**Instructions:** Build and serve the production output from the root public base path `/`. Verify asset loading, save behavior, error handling, and responsive layout outside the development server.

**Test:** Run lint, unit tests, E2E tests, and the production build in sequence, then execute the smoke test against the served production bundle. All checks must pass.

### Step 37: Close the base-game milestone

**Instructions:** Review the base game against this plan and the relevant GDD acceptance criteria. Record deferred features instead of implementing them. Update all Memory Bank files, with special attention to `techContext.md`, `productContext.md`, `activeContext.md`, and `progress.md`.

**Test:** Confirm every prior step has recorded passing evidence, the Memory Bank matches the implemented repository, and a new developer can install, run, test, and understand the base game using repository documentation alone.

## Definition of Done

The base game is complete only when all 37 step validations pass, the production bundle is playable in a mobile-sized browser, four floors run concurrently, progression is viable, saves and offline rewards are deterministic, no deferred feature has leaked into scope, and all project documentation reflects the delivered state.
