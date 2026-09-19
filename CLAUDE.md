# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Cat Mine Idle" — a web-first (browser + Telegram Mini App) idle mining game in TypeScript, Phaser 4, and Vite. Portrait 360×640 logical viewport.

**The playable game stays fully playable offline**: the save lives in IndexedDB,
and every floor, the elevator, and the warehouse run without any network call.
The one exception, since server-milestone Step 8, is `src/platform/web`'s single
non-blocking anonymous-auth call at boot (`ensureGuestSession`) — it is never
awaited before the first frame, and a failed or absent call leaves the game
exactly as playable as before this step.

A separate server milestone (`memory-bank/server-milestone-plan.md`) is
implemented locally through Step 37. Its local Supabase stack lives in
`supabase/` — committed
`config.toml`, forward-only migrations, save-sync/auth/leaderboard/entitlement/
deletion Edge Functions, and seven public application tables including the
append-only account audit. No production deployment exists. `.github/workflows/ci.yml`
gates every push and pull request with a `client` job (`npm run verify`) and a
`server` job (`npm run verify:server`).

`src/core`, `src/config`, and `src/persistence/saveSchema.ts` also run
unmodified inside a Deno Edge Function, `supabase/functions/core-portability-check`
— not part of the save-sync protocol, just proof this works. Deno does not
extension-complete a relative specifier the way the client's bundler does, so
the function imports a Vite-built bundle (`npm run build:server-core`, from the
zero-logic `supabase/functions/_shared/coreBundleEntry.ts`) rather than a raw
relative import; that bundle is git-ignored and rebuilt before every
`npm run verify:server` run.

Edge Functions have a real test harness: `npm run test:server-unit`
(`deno test supabase/functions`, via the `deno-bin` devDependency) unit-tests
pure handlers with zero permission flags — every function's
`Deno.serve(...)` is guarded by `if (import.meta.main)` so importing it for a
test never starts a live listener — and `npm run test:server-integration`
(Vitest, its own `vitest.server-integration.config.ts`) exercises the one
"trivial authenticated endpoint," `whoami-check`, against the real running
stack using a JWT minted by `tests/server-integration/authFixture.ts`.

Server-milestone Step 8 added the first `src/` code that talks to the network:
`src/platform/web/guestSession.ts`'s `ensureGuestSession` signs a first-time
player in anonymously through `@supabase/supabase-js` (now a `dependencies`
entry, not a `devDependency`), never awaited before boot and never throwing.
Proving "two browsers receive different identities" needs a real Supabase Auth
service, so `npm run test:server-e2e` (`playwright.server-e2e.config.ts`, port
4176, `tests/server-e2e/`) is a second, Docker-dependent Playwright suite kept
out of the Docker-free `npm run test:e2e`/`npm run verify`; it runs as part of
`npm run verify:server` instead.

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
npm run verify:server  # local stack: unit tests, starts, migrations, health, portability, integration tests (needs Docker)
npm run verify:all     # verify && verify:server, in sequence
npm run build:server-core       # bundle src/core+config+saveSchema.ts for the Deno Edge Function
npm run test:server-unit        # deno test supabase/functions — pure handlers, no Docker needed
npm run test:server-integration # vitest against the live stack — assumes it is already running
npm run test:server-e2e         # playwright (chromium) on :4176 against the live stack — assumes it is already running
npm run backup:restore          # real public-schema pg_dump/pg_restore scratch drill (needs Docker + stack)
npm run monitor:check -- --input tests/fixtures/monitoring-healthy.json
npm run load:server             # 20-player save-sync load and long-absence benchmark (needs Docker + stack)
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

Step 34–36 operational evidence lives in `ops/`: the backup policy explicitly
separates public application recovery from Auth/session/secrets recovery, the
monitoring evaluator alerts on health/error/save-rejection/auth-failure
thresholds, and the load script asserts upload, throughput, and long-absence
re-simulation budgets. These are local/release tools until a hosted project and
its credentials exist.

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

## Code navigation (codebase-memory graph)

This repo is indexed in `codebase-memory-mcp` under the project name
**`Users-mofy-apps-codex-game-demo`** — pass that exact string as `project` to
every `mcp__codebase-memory-mcp__*` call. The index auto-refreshes in the
background; re-run `index_repository` only after a large external change (branch
switch with heavy churn, bulk generated files).

**Use the graph before grep for anything structural.** It answers in one call
what would otherwise cost a dozen file reads:

- `search_graph(query: 'offline income settle')` — find symbols by
  natural-language/BM25 (camelCase is split, so `claimOfflineReward` matches
  "claim offline reward"). `name_pattern` for regex, `semantic_query: [...]` to
  bridge vocabulary.
- `trace_path(function_name: '...', direction: 'inbound')` — callers / impact
  radius before changing a signature. `direction: 'outbound'` for dependencies.
- `get_code_snippet(qualified_name: '...')` — exact source of one symbol, after
  `search_graph` gives you the qualified name.
- `get_architecture(aspects: ['layers','boundaries','clusters'])` — orientation,
  and a fast sanity check that the one-directional layering above still holds.
- `detect_changes(base_branch: 'master')` — blast radius of the working diff;
  run it before `npm run verify` on a wide refactor.
- `query_graph` — Cypher for multi-hop questions and the complexity properties
  (`transitive_loop_depth`, `linear_scan_in_loop`) when hunting hot paths in
  `advanceSimulation`.

**Still use grep/Read for**: string literals, `src/config/balance.ts` numbers,
SQL migrations, `supabase/config.toml`, Markdown, and any final verification —
graph coverage is best-effort, not proof. Call `check_index_coverage` for files
you cite, and note that five `supabase/migrations/*.sql` files are
`parse_partial` (SQL parsing gaps) — read those directly.

The graph indexes **code**; it does not replace `memory-bank/`. Intent, step
gates, and design decisions still come from `memory-bank/INDEX.md` and the
documents it points at, under the section-reading rules below.

For a broad sweep you do not want in your own context, delegate to the
`codebase-memory` subagent (or `codebase-memory-scout` for a quick provisional
lookup, `codebase-memory-auditor` for a bounded full-graph audit).

## Working rules from AGENTS.md

Read `AGENTS.md` — its rules are binding. The key ones:

- **`memory-bank/INDEX.md` first.** It maps every document to its sections; open only the files and sections the task needs — never the whole Memory Bank (~126k tokens live). `activeContext.md` and `progress.md` are short and always worth reading. `architecture.md` and `techContext.md` must be read by section (`grep -n '^## \|^### '`, then `sed -n`); a `PreToolUse` hook blocks whole-file reads over 20,000 bytes. Do not read `memory-bank/archive/` by default — it is closed history, not contract. `game-design-document.md`, `tech-stack.md`, and `implementation-plan.md` remain the sources of truth for scope.
- **Update the Memory Bank in the same change** as any major feature or milestone (at minimum `architecture.md`, `techContext.md`, `productContext.md`, `activeContext.md`, `progress.md`).
- **Step gates.** `memory-bank/implementation-plan.md` is a 37-step ordered sequence. Each step ends at a stop gate: implement, run its validation, then wait for explicit user authorization before starting the next step. `activeContext.md` records the current step and gate state.
- Bug fixes ship with a regression test. Unit tests are `tests/unit/*.test.ts` (Vitest, node env, `fake-indexeddb` for storage); browser flows are `tests/e2e/*.spec.ts` (Playwright).
- Conventional Commits (`feat:`, `fix:`).

## Style

Two-space indent, semicolons, single quotes, trailing commas. `PascalCase` classes/scenes, `camelCase` functions/variables, `UPPER_SNAKE_CASE` module constants, kebab-case asset filenames. TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`; avoid `any`. Private class fields use `#` (see `GameNumber`, `SavePersistenceCoordinator`).
