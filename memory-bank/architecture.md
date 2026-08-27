# Architecture

## Current Status

Steps 1 through 5 are complete. Step 6's typed balance configuration and startup validation are implemented with passing automated checks and are awaiting user validation. There is no game simulation, large-number abstraction, database, migration, or persistence schema.

## Implemented Foundation

| Path | Responsibility |
|---|---|
| `index.html`, `src/main.ts`, `src/style.css` | Browser entry point, Phaser game startup, hot-reload cleanup, and full-viewport canvas host styling. |
| `package.json`, `package-lock.json`, `tsconfig.json` | Locked dependencies, strict compiler settings, and verified development/build/test scripts. |
| `eslint.config.mjs` | Flat lint configuration for TypeScript, configuration files, and the Node simulator script. |
| `vitest.config.ts`, `tests/unit/` | Node-based unit-test configuration and scaffold baseline coverage. |
| `playwright.config.ts`, `tests/e2e/` | Chromium E2E configuration, automatic Vite test server, and browser smoke coverage. |
| `tests/unit/architecture.test.ts` | Regression coverage proving the core boundary accepts pure TypeScript and rejects renderer, adapter, and browser dependencies. |
| `scripts/dev-simulator.mjs` | iPhone Simulator preview workflow retained from Step 2. |
| `src/game/scenes/BootScene.ts` | Single neutral boot scene that records startup and renderer diagnostics on the game canvas for browser validation. |
| `src/config/balance.ts`, `src/config/types.ts`, `src/config/validateBalance.ts` | Provisional four-floor/shared-stage data, its public types, and fail-fast startup validation. |

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
| `src/core/` | Implemented empty boundary for future pure deterministic game state, simulation, economy, progression, upgrades, and offline-income calculations. |
| `src/config/` | Owns typed data-driven starting values, unlocks, stage timing/capacity, upgrade curves, milestones, and validation. |
| `src/game/` | Owns the Phaser game configuration and boot scene; future scenes, game objects, animation, input, camera, and rendering remain deferred. |
| `src/ui/` | Implemented empty boundary for future HUD and overlays. |
| `src/persistence/` | Implemented empty boundary for future save validation, migration, serialization, and IndexedDB/Dexie adapters. |
| `src/platform/web/` | Implemented empty boundary for the future browser lifecycle adapter. |
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

## Planned Data Flow

Load and validate save → migrate if required → calculate capped offline reward → initialize pure core state → advance deterministic simulation → publish read-only snapshot → render Phaser/UI → translate player input into core commands → persist debounced authoritative snapshots.

The production pipeline is four independent mine shafts → one shared round-robin elevator → one shared warehouse → spendable gold.

## Provisional Balance Snapshot

| Stage | Starting values | Upgrade values | Unlock |
|---|---|---|---|
| Floor 1 | Level 1, yield 10 / 2,000 ms, unlocked | Base cost 25, cost x1.15, yield x1.10 | None |
| Floor 2 | Level 1, yield 30 / 2,500 ms, locked | Base cost 75, cost x1.15, yield x1.10 | 250 gold; Floor 1 level 5 |
| Floor 3 | Level 1, yield 90 / 3,000 ms, locked | Base cost 225, cost x1.15, yield x1.10 | 1,500 gold; Floor 2 level 5 |
| Floor 4 | Level 1, yield 270 / 3,500 ms, locked | Base cost 675, cost x1.15, yield x1.10 | 7,500 gold; Floor 3 level 7 |
| Elevator | Level 1, capacity 50 / 1,500 ms | Base cost 100, cost x1.15, capacity x1.12 | Shared and always available |
| Warehouse | Level 1, capacity 60 / 1,200 ms | Base cost 120, cost x1.15, capacity x1.12 | Shared and always available |

Starting gold is 100. Every upgradeable stage uses milestones at levels 10/25/50/100 with x2/x2/x3/x4 multipliers. These values are hypotheses until the Step 19 deterministic economy simulation and later playtesting validate them.

## Complete Database Schema

**Current schema: none.** The base game is client-only and has no relational or server database. IndexedDB is planned for local save persistence but has not been implemented, so no object-store schema exists yet. When any database or IndexedDB schema is introduced, document every store/table, field/column, type, default, nullable rule, key, constraint, index, relationship, and migration here and in `memory-bank/techContext.md` in the same change.
