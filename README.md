# Cat Mine Idle

A web-first idle mining game in TypeScript, Phaser 4, and Vite. Cats work a
fifteen-floor mine; each floor extracts material into its own queue, one shared
elevator hauls it to the surface, and one shared warehouse converts it into
spendable gold. The player spends that gold on independent stage upgrades and
sequential floor unlocks, and receives a capped reward for time spent away.

The game runs in a mobile browser at a fixed 360×640 portrait logical viewport.
**The playable game is client-only** — no accounts, no cloud save, and no network
call on any path; it boots, plays, and saves entirely offline in IndexedDB. A
separate server milestone is under way in `memory-bank/server-milestone-plan.md`;
its local Supabase stack lives in `supabase/`, holds all six designed tables
with row-level security, and its one Edge Function currently serves nothing but
a health check. Nothing in `src/` talks to it. `.github/workflows/ci.yml` gates
every push and pull request.

## Requirements

- Node.js 22.18.0 and npm 10.9.3 (the versions this repository is verified on)
- A Chromium browser for the test suites; `npx playwright install chromium`
  provides one
- Google Chrome installed as a real channel, for the optional performance
  benchmark only
- macOS with Xcode, for the optional iOS Simulator preview only
- Docker, for the optional local Supabase stack only; the game itself needs none

## Install and run

```bash
npm install
npm run dev            # Vite dev server, http://127.0.0.1:5173
```

Open the printed URL. A first-time player starts with 100 gold and floor 1
already open; production runs automatically with no tapping required.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite development server with hot reload. |
| `npm run build` | `tsc` type-check, then the optimized Vite production build into `dist/`. |
| `npm run preview` | Serve an existing `dist/` build locally. |
| `npm run lint` | ESLint across the repository, including the architecture boundary rules. |
| `npm run test` | Vitest unit suite (`tests/unit/`, Node environment). |
| `npm run test:e2e` | Playwright Chromium browser suite (`tests/e2e/`) against a dev server on port 4173. |
| `npm run test:prod` | Builds `dist/`, serves it from `/` on port 4175, and runs the production smoke suite. |
| `npm run verify` | lint → unit → E2E → build → secret scan → production smoke, in that order. This is the full gate. |
| `npm run test:perf` | Optional ten-minute Chrome benchmark with Pixel 5 emulation and 4× CPU throttling; writes to `performance-results/`. |
| `npm run dev:sim` | Optional macOS iPhone Simulator preview stream (`sim:list` / `sim:stop` manage it). |
| `npm run scan:secrets` | Fails if a built `dist/` carries a service-role key or any other non-public secret. Runs inside `verify`. |
| `npm run supabase:start` | Start the local Supabase stack in Docker (`supabase:stop`, `supabase:reset`, `supabase:status` manage it). |
| `npm run verify:server` | Server stack check: the stack starts, migrations apply from empty, and the health check answers. Requires Docker. |
| `npm run verify:all` | `verify` then `verify:server`, in sequence — what `.github/workflows/ci.yml` runs as two parallel jobs. |

Each Playwright config starts its own server with `reuseExistingServer: false`,
so free ports 4173 (E2E), 4174 (performance), and 4175 (production) before
running those suites. E2E reports land in `playwright-report/`.

Focused runs:

```bash
npx vitest run tests/unit/upgrades.test.ts
npx vitest run -t 'round-robin'
npx playwright test tests/e2e/scaffold.spec.ts -g 'offline'
```

## Architecture

Layering is one-directional and enforced by scoped ESLint rules plus
`tests/unit/architecture.test.ts`, which runs ESLint programmatically against a
probe source so the boundary cannot rot silently.

```
src/game (Phaser scenes) + src/ui (DOM overlays)
        ↓ commands / snapshots
src/core (pure deterministic simulation)  ←  src/config (balance data)
        ↑ reads state, writes documents
src/persistence (save schema + IndexedDB)  →  src/platform/web (lifecycle adapters)
```

| Directory | Owns |
|---|---|
| `src/core/` | Authoritative state, fixed-step simulation, extraction/elevator/warehouse pipeline, rates, upgrades, milestones, unlocks, offline income. Pure and renderer-free. |
| `src/config/` | All balance data plus fail-fast startup validation. |
| `src/game/` | Phaser scene and entities, plus pure Phaser-free `layout/`, `view-model/`, and `runtime/` submodules. |
| `src/ui/` | The three DOM overlays: offline reward, mine-floor upgrade, save diagnostic. |
| `src/persistence/` | Save document schema, validation, migration, Dexie adapter, debounced coordinator, load/recovery boundary. |
| `src/platform/web/` | Browser lifecycle save binding and the synchronous pagehide journal. |

Four rules matter more than the rest:

- **`src/core/` is pure.** Lint bans `window`, `document`, `navigator`,
  `localStorage`, `sessionStorage`, `indexedDB`, importing `phaser`, and
  importing `persistence`/`platform` from inside it. The same purity is enforced
  for `src/game/layout/**`, `src/game/view-model/**`, and `src/game/runtime/**`.
- **Time is injected.** Nothing in `src/core/` reads the wall clock;
  `Date.now()` appears only in `src/main.ts`. State factories, offline income,
  and save documents all take an explicit `currentTimestampMs`.
- **State is immutable.** `GameState` and every sub-state are `readonly`.
  Commands return a new state, or an explicit failure result carrying the
  original state; only invariant violations throw.
- **Barrel exports.** Import from `src/core`, `src/config`, `src/persistence`,
  `src/ui` — not deep paths.

### Simulation

`advanceSimulation(state, elapsedMs)` advances in deterministic 100 ms fixed
ticks, carries the sub-tick remainder in authoritative state, and credits at
most 1,000 ms per call while still consuming the full wall-clock delta.
`catchUpSimulation` walks a longer gap — a hidden tab returns a whole absence as
one delta — in credited-size slices, bounded at two hours.

Within a tick: every unlocked floor extracts, then the shared elevator, then the
shared warehouse. Handoffs are therefore same-tick eligible. The elevator
departs when any unlocked floor holds material, stops at each unlocked floor
top-down, and descends past a floor only once that floor is drained and capacity
remains; travel slows with load, and delivery happens only at the surface.

The renderer pulls, the core never pushes: `MineSimulationDriver` holds
authoritative state and advances it from an injected clock each frame, so frame
rate and animation speed cannot influence gold.

### Numbers

Gold, material, yields, and costs cross the core as `GameNumber`
(`src/core/numbers/GameNumber.ts`), an immutable wrapper that keeps
`break_infinity.js` private and serializes to a decimal/scientific string.
Display formatting lives outside the arithmetic type, in
`src/game/view-model/formatAmount.ts`.

### Balance

`src/config/balance.ts` holds every economy value as data.
`validateBaseGameBalance` runs at startup and in unit tests, requiring exactly
fifteen sequentially numbered floors and milestones at levels 10/25/50/100
(×2/×2/×3/×4). Stage effects are always derived as
`baseValue × outputGrowthRate^(level - 1) × cumulativeMilestoneMultiplier`;
milestones are computed from the current level and never stored as grant flags,
so a reload cannot apply one twice.

### Persistence

`saveSchema.ts` defines the plain-JSON `SaveDocumentV1`
(`CURRENT_SAVE_SCHEMA_VERSION = 1`) and the pure
`migrateSaveDocument → validateSaveDocument → deserializeSaveDocument` chain,
independent of any storage adapter. `DexieActiveSaveRepository` keeps one fixed
record (`id: 'active'`) in the `cat-mine-idle` IndexedDB database.
`SavePersistenceCoordinator` debounces writes by 500 ms and turns failures into
diagnostics instead of exceptions. `loadActiveGame` orchestrates load →
recovery → capped offline settlement, persisting the consumed interval before
exposing a pending reward. A synchronous localStorage journal
(`cat-mine-idle:lifecycle-save-v1`) covers only the pagehide boundary, where an
IndexedDB transaction may not commit before teardown.

**Any change to the save shape must bump the schema version and add a migration
plus tests.**

## Local server stack (server milestone, in progress)

The playable game does not use this. It exists for the milestone in
`memory-bank/server-milestone-plan.md`, whose design documents are
`memory-bank/server-threat-model.md`, `memory-bank/server-save-sync-protocol.md`,
and the database schema recorded byte-identically in `memory-bank/architecture.md`
and `memory-bank/techContext.md`.

```bash
cp .env.example .env.local     # fill from `npx supabase status` after starting
npm run supabase:start         # whole backend, in Docker, offline
npm run verify:server          # stack, migrations, health
npm run supabase:stop
```

Ports are the Supabase CLI defaults — API 54321, database 54322, Studio 54323,
mail 54324 — and do not collide with the client's 5173, 4173, 4174, or 4175.

`supabase/migrations/` holds two forward-only migrations: a bootstrap file that
creates nothing (it only asserts the PostgreSQL 13+ premise the schema relies on
for `gen_random_uuid()`), and one that lands all six designed tables —
`profiles`, `saves`, `save_audit`, `recovery_codes`, `leaderboard_entries`,
`entitlements` — with row-level security enabled and exactly the policies
`memory-bank/architecture.md`'s RLS matrix names. `supabase/seed.sql` inserts
one local-only fixture guest (`auth.users` row plus its `profiles` row) after
every `supabase db reset`, never applied to a deployed database.
`.github/workflows/ci.yml` runs `npm run verify` and `npm run verify:server` as
two required jobs on every push and pull request.

The one endpoint that exists:

```bash
curl http://127.0.0.1:54321/functions/v1/save-sync/v1/health
# {"status":"ok","serverTime":"..."}
```

**Secrets.** `.env.local` is git-ignored; `.env.example` is the committed
template. The `VITE_` prefix is the boundary: Vite inlines exactly those
variables into the browser bundle, so a service-role key, a recovery-code pepper,
or a bot token must never carry one. `npm run scan:secrets` fails the build if a
privileged credential reaches `dist/`, and it runs inside `npm run verify`.

## Testing

- Unit tests are `tests/unit/*.test.ts` (Vitest, Node environment,
  `fake-indexeddb` for storage).
- Browser flows are `tests/e2e/*.spec.ts` (Playwright Chromium). They assert
  rendered output through canvas dataset diagnostics and real pixel probes, and
  drive real presses at published control rectangles.
- `tests/production/production-smoke.spec.ts` verifies the shipped bundle: the
  dev-only diagnostics are stripped from it, so it leans on pixel probes,
  IndexedDB contents, and the DOM instead.
- Bug fixes ship with a regression test.

## Documentation

`memory-bank/` is the source of truth and is expected to stay current with the
code:

| File | Contents |
|---|---|
| `projectbrief.md` | Highest-level goal, requirements, exclusions. |
| `game-design-document.md` | Product mechanics, loop, UI direction, MVP scope, acceptance criteria. |
| `tech-stack.md` | Technology choices and rationale. |
| `implementation-plan.md` | The ordered 37-step delivery sequence and each step's validation gate. |
| `architecture.md` | File/module responsibilities, dependency rules, every runtime contract, complete database schema. |
| `techContext.md` | Verified repository state, pinned versions, verified commands, constraints. |
| `productContext.md` | Motivation, target player, intended experience, delivery boundary. |
| `systemPatterns.md` | The architectural patterns and hard-won rules behind the code. |
| `activeContext.md` | Current focus, active decisions, next steps, open questions. |
| `progress.md` | Completed work, step status, acceptance results, risks. |

`AGENTS.md` holds the contributor rules — including the requirement to read the
Memory Bank before planning or editing, and to update it in the same change as
any major feature.

## Scope

Delivered in this base-game milestone: fifteen sequential floors revealed in
groups of five, the extraction → elevator → warehouse chain running
automatically, gold, three independently upgradeable stage types with milestone
multipliers, sequential floor unlocks, batch (x1/x5/MAX) shaft upgrades, local
saves, capped offline income, and original placeholder art.

Deliberately **not** in this milestone: managers and automation gameplay,
boosts, gift drops, audio, premium currency, shops, tasks, social systems,
Telegram integration, backend services, payments, ads, blockchain, and final
production art. See `memory-bank/progress.md` for the recorded deferral list.

## Style

Two-space indent, semicolons, single quotes, trailing commas. `PascalCase`
classes and scenes, `camelCase` functions and variables, `UPPER_SNAKE_CASE`
module constants, kebab-case asset filenames. TypeScript is strict with
`noUnusedLocals` and `noUnusedParameters`; avoid `any`. Private class fields use
`#`. Commits follow Conventional Commits (`feat:`, `fix:`).
