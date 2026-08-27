# Active Context

## Current Focus

Implementation Plan Step 12 is implemented and its automated validation passes. The project is paused at the required stop gate while the user validates warehouse conversion; Step 13 must not begin without explicit authorization.

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
- Calculate mine-shaft yield as base yield multiplied by the configured output-growth rate for each level above one; milestone multipliers remain deferred to Step 17.
- Deposit completed extraction only into the producing floor's material queue and total-extracted counter; spendable gold changes only after later transport and warehouse stages.
- Treat `roundRobinCursor` as the next floor index to scan; wrap top-to-bottom, advance it after a successful pickup, and leave it unchanged while idle.
- Remove material from a floor and increment its transported total at elevator pickup; deliver carried material only when transit completes, adding it to `warehouse.inputQueue` without changing gold.
- During the staged Step 11 integration, advance the elevator before extraction so new output remains queued until the next fixed tick; Step 13 owns the final all-stage update ordering.
- Convert warehouse material to gold at a 1:1 ratio only on a completed configured cycle; leave excess input queued for later cycles and reset progress when no input remains.
- During the staged Step 12 integration, advance warehouse conversion before elevator transport and extraction so newly delivered input begins conversion on the following fixed tick; Step 13 owns the final all-stage update ordering.

## Next Steps

1. Wait for the user to validate the Step 12 test results.
2. Begin Step 13 only after explicit user authorization.
3. Keep all later steps blocked behind their preceding validation gates.
4. Defer managers, boosts, gift drops, and other expanded features until the base-game milestone passes.

## Open Questions

- Validation and refinement of the provisional balance curve through Step 19 and playtesting.
- Final art-production workflow and original visual identity.
- Target Telegram launch requirements beyond the prototype.
