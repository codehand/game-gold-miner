# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Cat Mine Idle" — a web-first (browser + Telegram Mini App) idle mining game in TypeScript, Phaser 4, and Vite. Portrait 360×640 logical viewport.

**The playable game is client-only**: nothing in `src/` makes a network call, and
the save lives in IndexedDB.

A separate server milestone (`memory-bank/server-milestone-plan.md`) is in
progress. Its local Supabase stack lives in `supabase/` — committed
`config.toml`, forward-only migrations, and one `save-sync` Edge Function that
currently serves only a health check. All six designed database tables exist in
the local development database, with row-level security matching the matrix
documented byte-identically in `memory-bank/architecture.md` and
`memory-bank/techContext.md`; no deployment exists, and nothing in `src/` reads
or writes any of it yet. `.github/workflows/ci.yml` gates every push and pull
request with a `client` job (`npm run verify`) and a `server` job
(`npm run verify:server`).

## Commands

```bash
npm run dev            # Vite dev server (default :5173)
npm run build          # tsc type-check, then vite build
npm run lint           # eslint .
npm run test           # vitest run (tests/unit/**/*.test.ts, node environment)
npm run test:e2e       # playwright (chromium) against a dev server on 127.0.0.1:4173
npm run test:prod      # build dist/, serve it from / on :4175, run the production smoke suite
npm run verify         # lint → test → test:e2e → build → scan:secrets → test:prod (the full gate)
npm run scan:secrets   # fail if dist/ carries a service-role key or other non-public secret
npm run supabase:start # local Supabase stack in Docker (supabase:stop / :reset / :status)
npm run verify:server  # local stack: starts, applies migrations from empty, health check (needs Docker)
npm run verify:all     # verify && verify:server, in sequence
npm run test:perf      # optional ten-minute Chrome benchmark (Pixel 5 emulation, 4x CPU throttle)
npm run dev:sim        # boot iPhone Simulator + Safari + serve-sim stream (macOS/Xcode)
npm run sim:list       # list active simulator streams
npm run sim:stop       # stop simulator streams
```

Single test / focused runs:

```bash
npx vitest run tests/unit/upgrades.test.ts
npx vitest run -t 'round-robin'          # by test-name substring
npx playwright test tests/e2e/scaffold.spec.ts -g 'offline'
```

Every Playwright config starts its own server (`reuseExistingServer: false`), so free ports 4173 (E2E), 4174 (performance), and 4175 (production) first. E2E reports land in `playwright-report/`; benchmark reports in `performance-results/`.

`README.md` is the human-facing entry point: install, commands, architecture summary, and scope.

## Architecture

Strict one-directional layering, enforced by lint rules and a regression test:

```
src/game (Phaser scenes) + src/ui (DOM overlays)
        ↓ commands / snapshots
src/core (pure deterministic simulation)  ←  src/config (balance data)
        ↑ reads state, writes documents
src/persistence (save schema + IndexedDB)  →  src/platform/web (lifecycle adapters)
```

- **`src/core/` is pure.** ESLint (`eslint.config.mjs`) bans `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`, imports of `phaser`, and imports of `persistence`/`platform` inside `src/core/**`. `tests/unit/architecture.test.ts` runs ESLint programmatically against a probe source to keep the boundary alive — if you change those rules, update that test.
- **Barrel exports.** Each layer re-exports its public surface from `index.ts` (`src/core/index.ts`, `src/config/index.ts`, `src/persistence/index.ts`, `src/ui/index.ts`). Tests and cross-layer code import from the barrel, not deep paths (the exception is `src/persistence/saveSchema.ts`, which imports core internals directly).
- **Time is always injected.** Nothing in `src/core/` reads the wall clock; `Date.now()` lives only in `src/main.ts`. State factories, offline income, and save documents all take an explicit `currentTimestampMs`.
- **State is immutable.** `GameState` and every sub-state are `readonly`; simulation and command functions return new objects. Commands (`purchase*`, `claimOfflineReward`, `purchaseFloorUnlock`) return a result object with an explicit failure reason and the *original* state for expected player-facing failures; invariant violations throw.

### Simulation model

`advanceSimulation(state, elapsedMs)` (`src/core/simulation/advanceSimulation.ts`) advances in deterministic 100 ms fixed ticks (`SIMULATION_STEP_MS`), carries `simulationRemainderMs` in authoritative state, and credits at most `MAX_FOREGROUND_DELTA_MS` (1,000 ms) per update while still consuming the full wall-clock delta in `lastUpdateTimestampMs`. Each tick runs, in order: every unlocked floor's extraction → shared elevator → shared warehouse, so handoffs are same-tick eligible.

Pipeline: 15 mine floors extract into per-floor `materialQueue` → one shared elevator runs a sequential top-down route, loading only on arrival at each unlocked floor and descending deeper only once the current floor is drained and capacity remains → one warehouse converts input 1:1 into `gold` on completed cycles. `roundRobinCursor` keeps its legacy name for save compatibility but now encodes the route: non-negative `i` means descending toward floor index `i`, negative `-(i + 1)` means returning from that floor. Leg duration scales with carried load, and delivery into `warehouse.inputQueue` happens only on surface arrival.

### Numbers

All gold, material, yields, and costs go through `GameNumber` (`src/core/numbers/GameNumber.ts`), an immutable wrapper that keeps `break_infinity.js` private and serializes to a decimal/scientific string. Never leak `Decimal` across the boundary; keep display formatting outside the arithmetic type — `src/game/view-model/formatAmount.ts` is the one formatter, using lowercase `k/m/b/t/qa/qi/sx/sp/oc/no/dc` and then `aa` from `10^36`.

### Balance config

`src/config/balance.ts` holds all economy values as data; `validateBaseGameBalance` runs at startup (`src/main.ts`) and in unit tests, and hard-requires exactly 15 sequentially numbered floors (`REQUIRED_MINE_FLOOR_COUNT`) and milestones at levels 10/25/50/100 (×2/×2/×3/×4). Stage effects are always derived: `baseValue × outputGrowthRate^(level-1) × cumulativeMilestoneMultiplier` (`calculateLevelEffect`). Milestones are computed from the current level — never stored as grant flags — so reloads cannot double-apply them.

### Persistence

`saveSchema.ts` defines the plain-JSON `SaveDocumentV1` (`CURRENT_SAVE_SCHEMA_VERSION = 1`) and the pure `migrateSaveDocument → validateSaveDocument → deserializeSaveDocument` chain, independent of any storage adapter. `DexieActiveSaveRepository` stores one fixed record (`id: 'active'`) in IndexedDB; `SavePersistenceCoordinator` debounces writes (500 ms), coalesces flushes, and converts failures into diagnostics instead of throwing. `loadActiveGame` orchestrates load → recovery (corrupt vs. incompatible warning + fresh state) → capped offline income settlement, persisting the consumed interval *before* exposing a pending reward. `bindSaveLifecycle` (platform layer) force-flushes on `pagehide` and `visibilitychange`.

Any change to the save shape must bump the schema version and add a migration plus tests.

## Working rules from AGENTS.md

Read `AGENTS.md` — its rules are binding. The key ones:

- **Memory Bank first.** Read every Markdown file in `memory-bank/` before planning or editing. `game-design-document.md`, `tech-stack.md`, and `implementation-plan.md` are the sources of truth for scope; `architecture.md`, `techContext.md`, `productContext.md`, `activeContext.md`, `progress.md`, and `systemPatterns.md` are living context.
- **Update the Memory Bank in the same change** as any major feature or milestone (at minimum `architecture.md`, `techContext.md`, `productContext.md`, `activeContext.md`, `progress.md`).
- **Step gates.** `memory-bank/implementation-plan.md` is a 37-step ordered sequence. Each step ends at a stop gate: implement, run its validation, then wait for explicit user authorization before starting the next step. `activeContext.md` records the current step and gate state.
- Bug fixes ship with a regression test. Unit tests are `tests/unit/*.test.ts` (Vitest, node env, `fake-indexeddb` for storage); browser flows are `tests/e2e/*.spec.ts` (Playwright).
- Conventional Commits (`feat:`, `fix:`).

## Style

Two-space indent, semicolons, single quotes, trailing commas. `PascalCase` classes/scenes, `camelCase` functions/variables, `UPPER_SNAKE_CASE` module constants, kebab-case asset filenames. TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`; avoid `any`. Private class fields use `#` (see `GameNumber`, `SavePersistenceCoordinator`).
