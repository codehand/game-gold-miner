# Cat Mine Idle

A web-first idle mining game in TypeScript, Phaser 4, and Vite. Cats work a
fifteen-floor mine; each floor extracts material into its own queue, one shared
elevator hauls it to the surface, and one shared warehouse converts it into
spendable gold. The player spends that gold on independent stage upgrades and
sequential floor unlocks, and receives a capped reward for time spent away.

The game runs in a mobile browser at a fixed 360×640 portrait logical viewport.
**The playable game stays fully playable offline** — no account or cloud save is
required on any path; it boots, plays, and saves entirely in IndexedDB even with
no network at all. A separate server milestone is under way in
`memory-bank/server-milestone-plan.md`; its local Supabase stack lives in
`supabase/`, holds all six designed tables with row-level security, and its
save-sync Edge Function currently serves nothing but a health check — nothing
in `src/` reads or writes any of those tables yet. The one exception, since
server-milestone Step 8, is a single non-blocking anonymous-auth call at boot
(`src/platform/web/guestSession.ts`) that gives a first-time player a real
session with no prompt and no wait; it is never awaited before the first
frame, and a failed or absent call leaves the game exactly as playable as
before this step. `.github/workflows/ci.yml` gates every push and pull
request, including a real Deno test harness for the Edge Functions.

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
| `npm run verify:server` | Server stack check: the stack starts, migrations apply from empty, health/portability/integration checks pass, and the guest-session browser suite passes. Requires Docker. |
| `npm run verify:all` | `verify` then `verify:server`, in sequence — what `.github/workflows/ci.yml` runs as two parallel jobs. |
| `npm run test:server-e2e` | Playwright Chromium suite (`tests/server-e2e/`) against a dev server on port 4176, proving real anonymous sign-in against the live local stack. Assumes it is already running. |

Each Playwright config starts its own server with `reuseExistingServer: false`,
so free ports 4173 (E2E), 4174 (performance), 4175 (production), and 4176
(server E2E) before running those suites. E2E reports land in
`playwright-report/`.

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
| `src/platform/web/` | Browser lifecycle save binding, the synchronous pagehide journal, and (since server-milestone Step 8) the Supabase client and anonymous guest-session bootstrap. |

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
mail 54324 — and do not collide with the client's 5173, 4173, 4174, 4175, or 4176.

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

The one save-sync endpoint that exists:

```bash
curl http://127.0.0.1:54321/functions/v1/save-sync/v1/health
# {"status":"ok","serverTime":"..."}
```

`src/core`, `src/config`, and `src/persistence/saveSchema.ts` run unmodified
inside a second, non-protocol Edge Function,
`supabase/functions/core-portability-check`, which reproduces a fixed
ten-minute simulation and returns it for comparison against
`tests/unit/server-core-portability.test.ts`'s pinned result. Deno does not
extension-complete a relative specifier the way the client's bundler does, so
the function imports a generated bundle rather than a raw relative import:

```bash
npm run build:server-core   # src/core + src/config + saveSchema.ts → one ES module
curl http://127.0.0.1:54321/functions/v1/core-portability-check
```

That bundle lives at `supabase/functions/_shared/generated/core-bundle.js`,
is git-ignored, and is rebuilt by `npm run verify:server` before the stack
starts — so it can never be checked against stale source.

**Edge Function tests.** `npm run test:server-unit` (`deno-bin@2.1.4`, an
exact devDependency) runs `deno test supabase/functions`: every function's
handler is unit-tested by importing it directly, with zero `--allow-*`
permission flags, because `Deno.serve(...)` is guarded by
`if (import.meta.main)` and every real network/database call is an injected,
fakeable collaborator. `npm run test:server-integration`
(`vitest.server-integration.config.ts`, kept out of `npm test`'s glob) hits
the real running stack instead — `supabase/functions/whoami-check` verifies a
bearer token against Supabase Auth and returns the caller's own `profiles`
row under row-level security, and `tests/server-integration/authFixture.ts`
mints that bearer token for the seeded fixture guest:

```bash
npm run test:server-unit                              # no Docker needed
npm run supabase:start && npm run supabase:reset
npm run test:server-integration                       # needs the live stack
curl http://127.0.0.1:54321/functions/v1/whoami-check  # 401, no token
```

**Guest identity.** Server-milestone Step 8 enables anonymous sign-in
(`enable_anonymous_sign_ins` in `supabase/config.toml`) and adds the first
`src/` code that talks to the network: `ensureGuestSession` in
`src/platform/web/guestSession.ts` gives a first-time player a real `auth.users`
row from the first frame, never awaited before boot and never throwing.
Proving that two browsers receive two different identities needs a real
Supabase Auth service, so `npm run test:server-e2e`
(`playwright.server-e2e.config.ts`, port 4176) is a second Playwright suite,
kept out of the Docker-free `npm run test:e2e` and run as part of
`npm run verify:server` instead:

```bash
npm run supabase:start && npm run supabase:reset
npm run test:server-e2e   # needs the live stack; a fresh anonymous session per browser
```

**Google sign-in.** Server-milestone Step 10 lets a signed-in guest attach a
Google identity to the account they already have — `linkIdentity` when a
session exists, `signInWithOAuth` when none does — rather than minting a
second `auth.users` row; `src/platform/web/googleSignIn.ts` mirrors
`guestSession.ts`'s injected-collaborator, never-throws shape. It requires a
real Google Cloud OAuth Client ID/Secret; no domain is needed, since Google
permits `http://127.0.0.1:54321/auth/v1/callback` as a redirect URI in
development. Unlike `enable_anonymous_sign_ins`, `supabase/config.toml`'s
`[auth.external.google]` block reads `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
through `env(...)` substitution, which the Supabase CLI only auto-loads from a
project-root **`.env`** file — a second, separate git-ignored file from
`.env.local` — see `.env.example` for the exact Cloud Console setup. There is
no production UI for this yet (`HudView.ts`'s fixed HUD already covers the
canvas edge-to-edge, and a real entry point belongs with a later
Phaser-rendered control); in development, `window.catMineIdleAccount`
exposes `beginGoogleSignIn()`/`signOut()` for manual and scripted use. A real
human completing Google's own consent screen is the one thing nothing local
can substitute for, so this step's "same user id, same account after
sign-out/in" proof is a guided manual verification, not part of
`npm run verify:server`.

**Apple sign-in (Step 11) is cut.** Unlike Google, Sign in with Apple on the
web needs a paid Apple Developer Program membership, a verified real domain,
and a deployed HTTPS return URL, with no `localhost` redirect option at all.
None of that exists, and the user chose not to acquire it — no code, config,
or test exists for this step. Identity in this milestone is anonymous guest,
Google, and Telegram.

**Telegram sign-in.** Server-milestone Step 12, and unlike Steps 10–11, it
needs no real external account, domain, or paid membership to satisfy its own
test: a Telegram Mini App's `initData` is HMAC-SHA256-signed, and verifying
it never contacts Telegram's servers at all. `supabase/functions/telegram-sign-in/index.ts`'s
`verifyTelegramInitData` implements Telegram's documented algorithm exactly,
entirely on `crypto.subtle`; on success it mints a real session via the
confirmed community pattern for a provider Supabase Auth has no first-class
API for — `admin.generateLink({type: 'magiclink', email})` returns a
`hashed_token`, and the client completes `auth.verifyOtp({token_hash,
type: 'email'})`. No schema change: a Telegram user maps to the deterministic
placeholder email `telegram-<id>@telegram.invalid` (RFC 2606's reserved
`.invalid` TLD), so `generateLink` finds-or-creates the same `auth.users` row
every time. **This mapping is only safe with `[auth.email] enable_signup =
false`** (`supabase/config.toml`) — with public signup open, an attacker who
knows a Telegram id could otherwise claim that placeholder email by
password before the real user ever signs in; see finding F13 in
`memory-bank/server-threat-model.md` for the full reproduction. `src/platform/telegram/telegramSignIn.ts`'s
`readTelegramInitData()` reads `window.Telegram.WebApp.initData` (never
`initDataUnsafe`) and resolves `null` for every player today — no Telegram
Web App `<script>` tag was added to `index.html`, since that is the still-
unbuilt Mini App host, a separate and later piece of work; when it does exist,
`src/main.ts` calls `signInWithTelegram` **instead of** the guest bootstrap,
"replacing the guest path entirely" rather than linking to it. This is the
first function called directly from the browser with `fetch()`, so
`supabase/functions/_shared/http.ts` gained a shared CORS policy — and
proving it against the real stack found that the local Kong gateway
unconditionally overwrites every function's `Access-Control-Allow-Origin`
with `*` regardless, documented in `memory-bank/server-threat-model.md`
finding F12. `TELEGRAM_BOT_TOKEN` lives in a **third**, separate git-ignored
env file, `supabase/functions/.env` — auto-loaded by `supabase start`,
distinct from both the project-root `.env` and `.env.local` — see
`.env.example`. Because verification is self-contained, this step's full test
(valid `initData` mints a session; tampered/stale/wrong-bot-token payloads
are each rejected with none issued; the token never leaks) is proven with
hand-signed fixture vectors against the real local stack in
`npm run test:server-integration`, with no live Telegram account needed.

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
- Edge Function unit tests are `supabase/functions/**/*.test.ts` (`deno test`,
  no Docker); integration tests are `tests/server-integration/*.test.ts`
  (Vitest, against the live stack); guest-identity browser tests are
  `tests/server-e2e/*.spec.ts` (Playwright, against the live stack).
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
