# Active Context

## Current Focus

Implementation Plan Step 25 is implemented and its automated validation passes. The project is paused at the required stop gate while the user validates the responsive portrait layout; Step 26 must not begin without explicit authorization.

## Recent Changes

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
- Rebuilt `BootScene` around separate fixed and scrolling layers, English HUD/surface placeholders, and four placeholder floor slots whose combined 514-pixel content exceeds the 428-pixel mine region.
- Replaced an initial geometry-mask attempt with a dedicated mine camera viewport after Phaser 4 warned that `setMask` does nothing in WebGL; the mine area is now genuinely clipped in both renderers.
- Added sixteen layout/palette unit tests and four Playwright viewport tests (320×568, 390×844, 768×1024, 1280×800).
- Review of the first Step 25 implementation found the browser suite could not detect a broken render: deleting either camera-ignore call left all four viewport tests green while the HUD was visibly destroyed. Added pixel probes that sample the real canvas, extracted the palette into a pure module so scene and test read one source of truth, replaced a hardcoded `428` with the published mine height, threaded `layout.width` into the floor slots, and put the `src/game/layout` purity claim behind a lint rule with an `architecture.test.ts` probe.
- Verified the new probes by mutation: removing either ignore call, or misplacing the mine camera viewport, now fails with a named assertion. A first attempt probing a floor panel missed one mutation because a later-drawn panel hid the duplicated layer; the probe moved to the mine gutter.
- One hundred forty-four unit tests, six Chromium E2E tests, lint, and production build pass.

## Active Decisions

- Target browser and Telegram Mini App first.
- Keep core simulation deterministic and independent of Phaser.
- Use original branding and assets rather than copying the reference game's protected content.
- Keep MVP client-only and exclude monetization, blockchain, and social systems.
- Treat balance values in the GDD as starting hypotheses requiring playtests.
- Use English UI at a 360×640 logical resolution with no deferred bottom navigation.
- Run production automatically through four mine shafts, one shared round-robin elevator, and one shared warehouse.
- Upgrade mine shafts, elevator, and warehouse independently while preserving progress percentage.
- Use saved-rate offline rewards, K/M/B/T number formatting, Phaser 4.2.1, and a mid-range Android Chrome performance baseline.
- Start with 100 gold; provisional floor unlock costs are 250, 1,500, and 7,500, gated by prior-floor levels 5, 5, and 7.
- Use a 1.15 upgrade-cost growth rate, 1.10 mine-yield growth, and 1.12 shared-stage capacity growth until the Step 19 economy simulation and playtesting refine them.
- Represent runtime gold, material quantities, yields, and costs through `GameNumber`; keep abbreviated display formatting outside the arithmetic abstraction.
- Store only authoritative production data in core state; renderer, scene, animation, sprite, tween, and texture objects never enter serialized state.
- Advance foreground simulation in deterministic 100 ms ticks, carry sub-tick remainder in authoritative state, and credit at most 1,000 ms of simulation per update while consuming the full wall-clock delta.
- Calculate mine-shaft yield as base yield multiplied by the configured output-growth rate for each level above one and every cumulative milestone multiplier reached at the current level.
- Deposit completed extraction only into the producing floor's material queue and total-extracted counter; spendable gold changes only after later transport and warehouse stages.
- Treat `roundRobinCursor` as the next floor index to scan; wrap top-to-bottom, advance it after a successful pickup, and leave it unchanged while idle.
- Remove material from a floor and increment its transported total at elevator pickup; deliver carried material only when transit completes, adding it to `warehouse.inputQueue` without changing gold.
- During every fixed tick, advance every unlocked floor's extraction first, then the shared elevator, then the shared warehouse; newly produced and delivered material is eligible for the next stage in that same tick.
- Convert warehouse material to gold at a 1:1 ratio only on a completed configured cycle; leave excess input queued for later cycles and reset progress when no input remains.
- Keep locked floors fully inert while all unlocked production stages run automatically without managers or player taps.
- Treat production rates as derived read-only values: expose every floor's theoretical rate, sum only unlocked floors for the mine estimate, and cap that estimate at the slower shared-stage throughput.
- Calculate an upgrade's next price from the stage's current level without rounding; expected player-action failures return the original state, while invalid/non-incrementable levels are invariant errors.
- Recalculate each stage effect as `baseValue × outputGrowthRate^(level - 1) × cumulativeMilestoneMultiplier`; shared-stage cycle durations remain fixed.
- Derive milestone effects from the current level rather than storing grant state, so each threshold activates once and reloads cannot apply it twice.
- Unlock floors 2–4 only in sequence after the immediately previous unlocked mine shaft reaches levels 5, 5, and 7 respectively and the configured 250/1,500/7,500 gold cost can be paid.
- Initialize a successfully opened floor at its configured starting level with zero progress, queues, and totals; preserve unrelated floors, shared stages, and simulation metadata.
- Bulk purchases and UI controls remain deferred.
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

## Next Steps

1. Wait for the user to validate the Step 25 layout results.
2. Begin Step 26 only after explicit user authorization.
3. Keep all later steps blocked behind their preceding validation gates.
4. Defer managers, boosts, gift drops, and other expanded features until the base-game milestone passes.

## Open Questions

- Validation and refinement of the provisional balance curve through Step 19 and playtesting.
- Final art-production workflow and original visual identity.
- Target Telegram launch requirements beyond the prototype.
