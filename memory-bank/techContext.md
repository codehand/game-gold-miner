# Technical Context

## Current State

All 37 implementation-plan steps are complete and user-validated; the user validated Step 37 on 2026-09-08, closing the base-game milestone. Step 37 added `README.md`, corrected the documentation that still described a four-floor mine, and re-ran the mobile benchmark against the full fifteen-floor scene. The physical mid-range Android pass and a human 30-second-comprehension playtest remain the two recorded open caveats; neither blocks the milestone. Save document and IndexedDB schema versions remain 1; no relational/server database or physics system exists.

Implementation followed the ordered, test-gated sequence in `memory-bank/implementation-plan.md`. That plan defined 37 base-game steps and every one passed its stated validation. It is now a completed record rather than a queue of work; post-milestone scope needs its own ordered, test-gated plan.

## Approved Direction

Role-based cat art now has an approved asset-only catalog contract under
`art-source/cat-role-catalog/`. Asset metadata uses `rarityTier` with the fixed
codes `N`, `R`, `SR`, `SSR`, and `UR`; this is deliberately distinct from the
numeric gameplay `level`. The existing 2×2, four-frame Step 32A unloader sheet
remains the runtime default and the `unloader:N` baseline. No catalog resolver,
runtime import, gameplay attribute, balance value, persistence field, or schema
version change is authorized in this phase.

- TypeScript
- Phaser 4.2.1, pinned for reproducible 2D rendering and animation builds
- Vite for development and production builds
- IndexedDB with Dexie for local persistence
- `break_infinity.js` or an equivalent library behind `GameNumber`
- Vitest for unit tests
- Playwright for browser/E2E tests
- Telegram Mini Apps JavaScript API
- Capacitor 8 only if native packaging becomes necessary
- Optional Preact for complex DOM overlays; no React-rendered gameplay

## Implemented Toolchain

- Node.js 22.18.0 and npm 10.9.3 were used for Step 3 validation.
- TypeScript 6.0.3 is selected because the Step 2 TypeScript 7 scaffold version was outside the supported peer range of typescript-eslint 8.68.0.
- ESLint 10.9.1 uses a flat configuration with `@eslint/js` and `typescript-eslint` recommended correctness rules.
- Vitest 4.1.11 runs Node-based unit tests from `tests/unit/`.
- Dexie 4.4.5 implements the browser IndexedDB adapter; `fake-indexeddb` 6.2.5 provides deterministic close/reopen and failure-independent unit coverage without changing production runtime behavior.
- Playwright 1.62.1 runs Chromium E2E tests from `tests/e2e/` and starts a fixed-port Vite test server automatically.
- A separate Playwright performance project builds the optimized bundle with
  opt-in profiling diagnostics, launches installed Google Chrome with a Pixel 5
  profile and 4× CPU throttling, and writes its ten-minute report under
  `performance-results/`. Ordinary production builds tree-shake the profiling
  attributes.
- `tests/e2e/player-journey.spec.ts` uses Playwright's controlled clock, two newly created browser contexts, published screen-space control diagnostics, and the real Dexie repository. It deletes `cat-mine-idle` before each run, checks rendered progress after every press, waits for the final debounced save, leaves the running page before advancing the offline clock, and validates exact policy-derived documents before and after one claim.
- `tests/e2e/lifecycle-persistence.spec.ts` uses a mutable injected wall clock and real browser navigation. It pins exact hidden/visible equivalence against uninterrupted simulation and proves pagehide journal recovery, IndexedDB cleanup, offline settlement, claim, and reload are exact-once and error-free.
- A separate Playwright production project builds `dist/`, serves it through
  `vite preview` at the root base path, and runs `tests/production/production-smoke.spec.ts`
  against the served bundle. It routes `Date.now` through `window.name` in an
  init script, because the hashed production entry cannot be rewritten the way
  the dev-server suites rewrite `/src/main.ts`, and it seeds invalid save
  records during a navigation whose bundle is blocked so nothing boots to
  overwrite them.
- `src/ui/SaveDiagnosticBanner.ts` is the one visible surface for recoverable
  persistence problems. `src/main.ts` supplies it as `loadActiveGame`'s
  `onWarning` and the save coordinator's `onDiagnostic`; before Step 36 neither
  callback was passed, so save recovery and storage failures were silent in the
  shipped application.
- Supabase CLI 2.117.0 is an **exact** devDependency, so a clean checkout runs
  the same backend version rather than whatever is installed globally. The whole
  stack runs offline in Docker: `npm run supabase:start`, `npm run supabase:stop`,
  `npm run supabase:reset`, `npm run supabase:status`. Local ports are the CLI
  defaults — API 54321, database 54322, Studio 54323, mail 54324 — chosen to
  avoid the client's 5173, 4173, 4174, and 4175. `realtime`, `storage`, and
  `analytics` are disabled in `supabase/config.toml`; no milestone step uses
  them and each is a container at start-up.
- Supabase Edge Functions run on Deno inside the CLI's edge runtime, so no local
  Deno install is required to *serve* them. `supabase/functions/**` is linted
  with Deno globals declared in `eslint.config.mjs`, but is deliberately
  outside `tsconfig.json`: `Deno` has no type in the Node/DOM libraries the
  client compiles against. `deno-bin@2.1.4` (Step 7), an exact devDependency,
  gives `npm run test:server-unit` a real, separately-installed Deno CLI —
  pinned to the version the edge runtime itself reports being compatible
  with — for testing and type-checking, since the Supabase CLI's own `test`
  subcommand only wraps pgTAP, not Deno.
- Deno's edge runtime does not resolve an extension-less relative specifier the
  way `tsc`'s `"moduleResolution": "bundler"` does — pointing a function
  straight at `src/core/index.ts` fails to boot with `Module not found` on its
  own internal `from './economy/calculateProductionRates'`-style imports,
  reproduced identically via `supabase functions serve` and `supabase start`
  (`supabase-edge-runtime-1.74.3`, Deno v2.1.4). Neither a root nor a
  per-function `deno.json` with `"unstable": ["sloppy-imports"]` was honoured by
  this runtime. Recorded as finding F10 in `memory-bank/server-threat-model.md`
  §8 — discovered empirically while implementing Step 6, not assumed.
- `npm run build:server-core` (`vite.server-core.config.ts`, Vite library mode)
  is Step 6's fix for F10: it compiles
  `supabase/functions/_shared/coreBundleEntry.ts` — a zero-logic
  `export * from '../../../src/core'` (and its `src/config` and
  `src/persistence/saveSchema.ts` siblings) — into one dependency-free ES
  module at the git-ignored `supabase/functions/_shared/generated/core-bundle.js`,
  with every specifier already resolved, `break_infinity.js` included. That
  also resolves finding F2 (`break_infinity.js` into Deno was unproven): it
  imports cleanly once bundled, through the same resolution the client bundle
  already relies on, so no shim was needed. `scripts/verify-server-stack.mjs`
  rebuilds this bundle before every `supabase start`, so a function can never
  boot against a stale one.
- `supabase/functions/core-portability-check` is not part of the save-sync
  protocol. It imports the generated bundle and, on request, runs the fixed
  document at `tests/fixtures/ten-minute-core-fixture.json` through the real
  `migrateSaveDocument`, `validateSaveDocument`, `deserializeSaveDocument`, one
  explicit `advanceSimulation` tick, and `catchUpSimulation` for the rest of ten
  minutes, returning the resulting document.
  `tests/unit/server-core-portability.test.ts` runs the identical sequence
  against the unbundled source and pins the same result (gold `"100"` →
  `"3080"`); `npm run verify:server`'s "core portability check" fetches the
  live function and asserts byte-for-byte identity against that pinned
  document. Mutation-proven: doubling a floor's extraction yield in
  `src/core/simulation/advanceSimulation.ts` moved both the pinned client
  assertion and the live function's returned gold (to `6060`) together, before
  the edit was reverted. `eslint.config.mjs` extends `src/core/**/*.ts`'s
  purity rules with a `Deno` global ban and two import bans —
  `(^|/)supabase(/|$)` and (Step 7) `^@supabase/`, once that npm scope existed
  to ban — the dependency direction is `supabase/` on `src/core`, never the
  reverse — and `tests/unit/architecture.test.ts` probes both.
- `save-sync/index.ts` and `core-portability-check/index.ts` guard their
  trailing `Deno.serve(...)` with `if (import.meta.main)` (Step 7), so
  `index.test.ts` can import `resolveFunctionRoute`/`handleRequest` and
  `runTenMinuteReproduction` directly without also starting a second live
  listener; proven live rather than assumed safe, by curling both functions
  again after the change. Their duplicated `JSON_HEADERS`/`jsonResponse`/
  `errorResponse` moved to `supabase/functions/_shared/http.ts`, itself
  unit-tested (`http.test.ts`), so a third function never grows a third copy.
- `whoami-check` is Step 7's "trivial authenticated endpoint," not part of the
  save-sync protocol. `handleWhoAmI(request, resolveCaller)` takes caller
  resolution as an injected collaborator — `extractBearerToken` parses
  `Authorization: Bearer <token>`, `resolveCaller` either rejects it or
  returns `{ userId, displayName }` — so `index.test.ts` fakes every outcome
  (missing token, rejected token, resolved caller, wrong method) with zero
  `--allow-*` permission flags. The one real collaborator,
  `resolveCallerViaSupabaseAuth`, uses `@supabase/supabase-js` to call
  `auth.getUser(token)` against live GoTrue, then reads
  `profiles.display_name` for that same user id with a client scoped to the
  caller's own token, so row-level security applies exactly as it would for a
  real client. `verify_jwt = false` at the platform level — verification
  happens by hand inside the handler on purpose, since that is the pattern
  `save-sync`'s own authenticated routes need from Step 16.
  `@supabase/supabase-js`, exact-pinned at `2.116.0`, was a `devDependency`
  through Step 7 — nothing in `src/` imported it yet — and the Deno import in
  `whoami-check/index.ts` pins that identical exact version
  (`npm:@supabase/supabase-js@2.116.0`, not a floating `@2`), because a
  deployed function has no local `node_modules` to resolve a bare specifier
  against and would otherwise fetch whatever currently satisfies `@2` from the
  registry — a version the local unit tests never actually ran. A 2026-09-09
  review found this drift risk along with the dependency's misplacement (it
  was briefly in `dependencies`); `tests/unit/server-stack.test.ts` asserted
  both the placement and the version match, so they could not silently diverge.
  **Step 8 promoted it to `dependencies`** — `src/platform/web/supabaseClient.ts`
  is the first `src/` import — and the same two assertions in
  `tests/unit/server-stack.test.ts` were flipped to pin `dependencies` instead,
  so the placement stays intentional at every future step rather than drifting
  back silently.
- `tests/server-integration/authFixture.ts` is Step 7's fixed "fixture pattern
  for an authenticated caller": `mintFixtureUserToken()` signs an HS256 JWT
  (`sub`/`role: authenticated`/`aud: authenticated`/`exp`) for the seeded
  fixture guest with the Supabase CLI's fixed local `JWT_SECRET` — the same
  value on every local stack anyone runs, printed by `npx supabase status`,
  not a secret this repository protects. `tests/server-integration/whoami.integration.test.ts`
  uses it against the real running stack, in its own
  `vitest.server-integration.config.ts` (`tests/server-integration/**/*.test.ts`)
  deliberately excluded from `vitest.config.ts`'s `tests/unit/**` glob, so
  `npm test`/`npm run verify` — which must work with no Docker running — never
  picks it up.
- `npm run test:server-unit` (`deno test supabase/functions`) and
  `npm run test:server-integration` (the Vitest config above) are Step 7's two
  test categories. `scripts/verify-server-stack.mjs` runs the unit suite
  before the stack even starts — it needs no Docker, no database, and no
  permission flag — and the integration suite once the database is reset and
  the health/portability checks confirm the stack is live, so both "run in CI
  from a clean database" as the step's test requires. Its final pass/fail
  line, hardcoded as "Step 4 validation" since Step 4, now reads
  "npm run verify:server."
- A real bug, not an assumed one, surfaced while wiring the integration test:
  `supabase/seed.sql`'s fixture `auth.users` row left `confirmation_token`,
  `recovery_token`, `email_change_token_new`, and `email_change` NULL — columns
  with no default — and GoTrue's Go row scanner cannot read them as a nullable
  string, so any real `auth.getUser` call 500'd with a `Scan error` until the
  seed explicitly set those four columns to `''`, matching what GoTrue itself
  writes for a real sign-up. No step before Step 7 ever triggered this: Steps
  4 through 6 only ever handed PostgREST a hand-signed JWT directly, never
  asking GoTrue to load the user row.
- Server-milestone Step 8 flips `enable_anonymous_sign_ins` from `false` to
  `true` in `supabase/config.toml`; `[auth.rate_limit] anonymous_users = 30`
  (per IP per hour) was already configured and needed no change. This setting
  is read by the GoTrue container at boot, not by `supabase db reset` — a
  stack already running from before the edit still answered
  `anonymous_provider_disabled` until it was fully stopped and restarted, which
  a genuinely clean checkout (every CI run, and any `supabase start` after a
  `supabase stop`) never hits.
- `src/platform/web/supabaseClient.ts`'s `createSupabaseClient()` reads
  `import.meta.env.VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and returns
  `null`, attempting no network call, when either is unset or blank — the
  contract that keeps a checkout with no `.env.local` exactly as playable as
  before this step. `src/platform/web/guestSession.ts`'s `ensureGuestSession`
  takes only the narrow `GuestAuthClient` slice of `SupabaseClient['auth']`
  it needs (`getSession`/`signInAnonymously`), mirroring the injected-collaborator
  pattern `whoami-check/index.ts`'s `ResolveCaller` already established: unit
  tests (`tests/unit/guest-session.test.ts`) fake that collaborator rather than
  mocking the SDK, and it never throws — every failure (no session, a rejected
  call, a disabled or unreachable auth service) resolves to a typed
  `sign-in-failed`/`unconfigured` result instead. `src/main.ts` constructs the
  client once and calls `ensureGuestSession` without awaiting it before
  `loadActiveGame`/`createGame`, publishing the resolved result as a
  `DEV`-only `app.dataset.guestSession` diagnostic — the same
  `import.meta.env.DEV` convention `BootScene` already uses for its own
  `canvas.dataset.*` diagnostics, stripped from production builds identically.
- Proving "two browsers receive different identities" needs a real GoTrue
  issuing real sessions — nothing fakeable locally proves that, so Step 8 adds
  a second, Docker-dependent Playwright suite: `playwright.server-e2e.config.ts`
  (port 4176, `testDir: tests/server-e2e`) and
  `tests/server-e2e/guest-session.spec.ts`. Kept out of
  `playwright.config.ts`/`tests/e2e/` deliberately, for the same reason
  `vitest.server-integration.config.ts` is kept out of `vitest.config.ts`:
  `npm test`/`npm run verify` must work with no Docker running. Three
  scenarios: a fresh browser boots playable and holds a real anonymous session
  (a UUID `user.id`, `isAnonymous: true`); with every `**/auth/v1/**` request
  aborted, the game still boots and a forced `visibilitychange` flush (the
  same mechanism `tests/e2e/lifecycle-persistence.spec.ts` already drives)
  still reaches IndexedDB, surviving a reload; and two fresh browser contexts
  receive distinct `user.id`s whose access tokens, sent directly from the Node
  test process (no CORS concern — the call never goes through a page) to the
  live `whoami-check` function, each answer only with their own id. `npm run
  test:server-e2e` runs this suite; `scripts/verify-server-stack.mjs` invokes
  it after `test:server-integration`, reading `API_URL`/`ANON_KEY` from a live
  `supabase status --output json` and passing them as `VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY` into the spawned dev-server process's environment —
  Vite gives `process.env` priority over `.env.local`, so CI needs no such file
  and a developer's own `.env.local` (already required for `npm run dev`) is
  untouched either way.
- A 2026-09-09 review of Step 8 found six issues fixed before the gate and two
  applied as cleanups. `.github/workflows/ci.yml`'s `server` job ran
  `npm run verify:server` with no Chromium installed, so its new browser
  suite would have died with "Executable doesn't exist" on the first real CI
  run — fixed with its own `npx playwright install --with-deps chromium` step
  (the `client` job already has one on its own runner), and the job's stale
  name/`timeout-minutes: 20` were corrected/bumped to 25. `playwright.server-e2e.config.ts`'s
  default `'html'` reporter opens a blocking `show-report` server on any local
  failure — fatal under `scripts/verify-server-stack.mjs`'s `spawnSync`
  invocation — and its default output folder collides with the main suite's
  report; switched to `'line'`, the same choice
  `playwright.production.config.ts`/`playwright.performance.config.ts` already
  make for the identical reason. `callWhoAmI`'s retry loop treated any
  response, including a transient cold-start error, as final, and its
  10-attempt budget could exceed the config's implicit 30 s test timeout — the
  same class of bug a Step 7 review already fixed once for a comparable
  warm-up loop; now retries on `!response.ok` too, at 6 attempts under an
  explicit 60 s `timeout` in the config. A static `@supabase/supabase-js`
  import cost +58 kB gzip on the single entry chunk every boot parses first —
  exactly what this step's "never delay the first frame" rule exists to
  prevent — so `createSupabaseClient` now `await import()`s the SDK only once
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are confirmed present, putting
  it in its own on-demand chunk (measured: the entry chunk returned to
  ~417.69 kB gzip from 472 kB, with the SDK itself in a separate 55.05 kB gzip
  chunk). The "documented commands" test in `tests/unit/server-stack.test.ts`
  was missing `test:server-e2e` — added, the same fix a Step 7 review already
  applied for its two Step 7 scripts. Cleanups: the dev-only
  `data-guest-session` diagnostic no longer carries the access token (dropped
  to `{status, user}`; the server-e2e suite now reads the token directly from
  the Supabase client's own `localStorage` entry, `sb-<host>-auth-token`,
  which needed no new surface), and the client promise is cached on
  `import.meta.hot.data` across HMR reloads rather than constructing a second
  GoTrue client every cycle — the cause of the SDK's own "Multiple
  GoTrueClient instances detected" console warning; `src/main.ts`'s dispose
  handler no longer stops auto-refresh on the (now-reused) client for the same
  reason.
- A follow-up review caught an eleventh Step 8 finding: the dynamic-import fix
  above made `createSupabaseClient` reject-capable (a flaky network, or a
  stale chunk hash after a redeploy), and `src/main.ts`'s promise chain had no
  `.catch` — `ensureGuestSession`'s own try/catch covers only its internal
  collaborator calls, not the client-construction promise one level above it
  in `main.ts`, so a rejection there reached an unhandled rejection, breaking
  `guestSession.ts`'s documented "this never throws" contract from one level
  up even though the game itself keeps playing. Fixed with one `.catch`
  folding any rejection into `sign-in-failed`. `tests/production/production-smoke.spec.ts`
  gained "continues playing when the lazily-loaded Supabase chunk fails to
  fetch," blocking the SDK's own chunk against the real built bundle and
  asserting no `pageerror` — mutation-proven: reverting the `.catch`
  reproduces the exact unhandled-rejection message as a `pageerror`. Neither
  `tests/e2e/` (no bundling, so no lazy chunk exists) nor
  `tests/server-e2e/`'s auth-only network block could have caught this. That
  spec locates the chunk by its *contents* (`GoTrueClient` present,
  entry-chunk marker absent), not by a `dist-*` glob: that name is one
  rolldown derives from the `dist/` directory inside `@supabase/supabase-js`,
  and a glob that stops matching aborts nothing while every assertion stays
  trivially true. It counts its aborts and asserts the count is non-zero for
  the same reason, and `test.skip`s with a stated reason when the build
  emitted no chunk at all — which is the CI case, since a build with neither
  `VITE_` variable set inlines both as `undefined` and lets the bundler
  eliminate the dynamic import. `tests/unit/server-stack.test.ts`'s
  static-source assertions on `src/main.ts` carry the CI gate instead.
- `scripts/scan-bundle-secrets.mjs` (`npm run scan:secrets`) fails the build when
  `dist/` contains a JWT declaring `role=service_role`, an `sb_secret_*` key, an
  exact non-`VITE_` value from `.env.local` or the running stack, or any
  server-only variable name from `.env.example`. It runs inside `npm run verify`
  between `build` and `test:prod`. The anon/publishable key is deliberately not
  flagged: it is public by design.
- `scripts/verify-server-stack.mjs` (`npm run verify:server`) is the Step 4
  validation, reused unchanged by Step 5's CI job: Docker reachable, stack
  starts, migrations apply to an empty database, every committed migration
  (read from `supabase/migrations/`, not listed by hand) is recorded as applied,
  and `GET /v1/health` answers 200 with a current server timestamp to a caller
  with no bearer token. `npm run verify:server -- --with-bundle-scan` adds the
  build and secret scan; **the `--` is required**, because npm does not forward a
  bare flag to the script and the two extra checks would be skipped in silence.
  `.github/workflows/ci.yml` runs it, without `--with-bundle-scan`, as the
  `server` job on every push and pull request, alongside a `client` job running
  `npm run verify`.
- Every Supabase CLI call that is parsed passes `--output-format json` (or
  `-o json`) explicitly. The CLI's default is a text table and it emits JSON on
  its own only when it auto-detects an agent, so relying on that detection makes
  a check pass under automation and fail in a human terminal. Payloads may also
  be preceded by progress notices and ANSI escapes on the same stream, so every
  parse locates `{` first and treats its absence as a reported parse failure —
  never as an empty result.
- `@fontsource/fredoka` 5.3.x self-hosts weights 600 and 700; startup waits for both browser fonts before creating Phaser canvas text.
- ESLint applies additional rules to `src/core/**/*.ts` that reject Phaser, persistence/platform imports, and browser globals; the Vitest suite probes these rules through the repository's real flat configuration.
- Phaser is configured without a physics property. Its E2E diagnostics identify the selected renderer and count boot-scene starts without making presentation state authoritative.
- `BootScene.preload` loads nine semantic 128×128 RGBA PNGs from `public/assets/placeholder/`. Their built-in-image-generation prompt and raw sheet, deterministic `generate2dsprite` outputs, and QC metadata live under `art-source/placeholder/`; the public art-direction brief and manifest record intended scale, visual roles, and original generated provenance. Generated sprites are presentation-only and never cross into core or save state.
- Balance data remains declarative finite JavaScript-number input; future authoritative state converts monetary and material values into `GameNumber`. Startup validation requires exactly fifteen sequential floors (`REQUIRED_MINE_FLOOR_COUNT`), unique identifiers, valid unlock chains, positive timing/yield/capacity values, upgrade growth above one, and the configured milestone schedule.
- `GameNumber` encapsulates break_infinity.js 2.2.0. It accepts finite numbers or numeric strings, returns new values for add/subtract/multiply, exposes comparisons, and serializes to a backend-neutral string; formatting is deliberately separate. It also exposes normalized `mantissa`/`exponent` parts as plain numbers, which display code needs to read a magnitude that `Number` cannot carry, without leaking the underlying library's type.
- Fresh authoritative state uses save version 1 and requires an explicit non-negative safe-integer timestamp. Gold, material queues/totals, carried material, and capacities are `GameNumber`; normalized progress and levels remain ordinary numbers.
- Foreground simulation advances in 100 ms fixed ticks, stores a monotonically increasing tick plus sub-tick remainder in authoritative state, and credits at most 1,000 ms per update. Valid elapsed time must be finite and non-negative; the full elapsed duration advances `lastUpdateTimestampMs` even when credited simulation time is capped.
- Each unlocked floor advances extraction from the base balance's cycle duration. Completed cycles add `baseYield × outputGrowthRate^(level - 1) × cumulativeMilestoneMultiplier` to local material and total-extracted `GameNumber` values, preserve normalized overflow progress, and do not alter spendable gold or downstream stage state.
- The shared elevator leaves the surface when any unlocked floor has material, stops at each unlocked floor from top to bottom, and loads only on arrival up to remaining `GameNumber` capacity. It continues deeper only after draining the current floor and while capacity remains; otherwise it returns before a new top-down trip. A pickup that fills the computed remainder snaps cargo to exact configured capacity so decimal round-off cannot create a false extra stop. One empty floor leg is half the configured 1,500 ms cycle; load scales travel time linearly up to 75% slower at full capacity, and ascent also scales by floor distance. Surface arrival alone transfers material into `warehouse.inputQueue`; neither pickup nor delivery changes gold.
- Elevator pickup clamps the accumulated per-floor `totalTransported` to `totalExtracted`. This corrects sub-nanounit arithmetic-history drift after many fractional trips while preserving the exact authoritative/save invariant and material movement.
- The warehouse advances only while input exists, retains material during its configured 1,200 ms progress, consumes at most authoritative capacity on completion, and adds the converted amount 1:1 to global gold and cumulative delivered gold. Excess input remains queued and empty queues reset progress.
- Each fixed tick advances every floor's extraction in configured order, then the shared elevator, then the shared warehouse. Newly extracted and delivered material can enter the following stage in the same tick; locked floors remain inert and no manager or player tap is required.
- Theoretical floor extraction rates use configured yield, current level growth, cumulative milestones, and cycle duration. The effective mine rate is the minimum of aggregate unlocked extraction and the current milestone-aware elevator/warehouse capacity per second; rates do not mutate or extend authoritative state.
- Upgrade prices use `baseCost × costGrowthRate^currentLevel` with `GameNumber` exponentiation and no rounding. Separate mine-shaft, elevator, and warehouse commands return discriminated success/failure results and preserve the original state on expected failures. Success deducts gold and increments the selected level; the shared level-effect calculation applies growth plus every reached milestone to shaft yield and shared-stage capacity. Milestone effects are derived from level, not stored as grant state, so reloads cannot apply them twice. Cycle durations, queues, carried material, totals, cursors, timestamps, and normalized progress remain unchanged.
- The floor-unlock command requires an existing locked target, an unlocked immediately previous floor at the configured shaft level, and sufficient `GameNumber` gold. Success deducts the configured cost once and initializes the target from balance data with its starting level and zero progress, queues, and totals. Expected failures preserve the original state object.
- The economy progression harness advances a fresh base-game state in one-second decisions for ten minutes. It unlocks an eligible next floor first, reserves gold when that unlock prerequisite is met, and otherwise selects the affordable upgrade with the largest hypothetical improvement to effective production per second. Deterministic ties favor the next unlock prerequisite and then configured order. Its report records exact action timing, target, cost, modeled improvement, final state, unlocked-floor count, highest level, and milestone status; it is analysis-only and does not automate player runtime.
- Save schema version 1 is a strict plain-JSON document with exactly `schemaVersion`, `savedAtTimestampMs`, `effectiveProductionRatePerSecond`, and `state`. `state` contains version/timing counters, serialized gold, exactly fifteen configured floor records, elevator state, and warehouse state. Every `GameNumber` is a finite decimal/scientific string. Validation rejects unknown properties, missing/unsupported versions, unsafe or inconsistent timestamps, invalid counters/progress, non-positive levels/capacities, unknown/reordered/missing floors, broken unlock order/gates, locked-floor production, negative quantities, transported totals above extracted totals, mismatched level-derived capacities, and active progress without corresponding material. Migration dispatch first expands a valid legacy four-floor prefix with locked defaults for floors 5–15; runtime deserialization follows strict validation before restored state can enter the game.
- `ActiveSaveRepository` keeps storage replaceable. `DexieActiveSaveRepository` stores only `{ id: 'active', document }`, and reopening the same database restores the full serialized snapshot. `SavePersistenceCoordinator` keeps only the newest pending document, debounces routine writes by 500 ms, retains a failed write for retry, resolves load/save failures without throwing into the session, and exposes stable diagnostic messages/callbacks. The web adapter forces the latest document on hidden visibility and page-hide events when those targets exist.
- `loadActiveGame` accepts only a completely deserialized valid save. Empty storage returns fresh state without warning. Failed migration or validation returns fresh state at the supplied timestamp plus either a `corrupt-save` or `incompatible-save` warning, including a detached copy of the invalid payload when structured cloning succeeds. Neither warning callbacks nor persistence diagnostic callbacks may escape into the load/save flow.
- Balance configuration includes `offlineIncome.capDurationMs = 7_200_000` and `offlineIncome.efficiency = 0.5`; startup validation requires a positive safe-integer cap and finite efficiency in `[0, 1]`.
- `calculateOfflineIncome` is pure core logic. It uses the loaded document's saved effective-rate snapshot, clamps elapsed time to the configured cap, applies efficiency through `GameNumber`, treats future timestamps as zero elapsed, preserves gold and production state, and replaces only the authoritative last-update timestamp. `loadActiveGame` force-flushes that settlement before returning a positive pending reward; repeated loads at the same time return zero, and failed settlement writes expose zero reward plus the existing save diagnostic.
- `createPendingOfflineReward` filters zero rewards out of presentation. `claimOfflineReward` consumes a positive pending value into a new state whose gold is increased by the exact `GameNumber` amount; no-pending calls return the original state. Browser orchestration hands that state to the simulation driver and guards the claim with a consumed-once flag, so a persistence retry saves the mine as it is at that moment without re-adding the reward; the DOM modal closes only after a forced save succeeds.
- `src/main.ts` composes balance validation, IndexedDB loading/recovery, simulation-driver construction with the injected `Date.now` clock, Phaser startup into the dedicated `#game-viewport` parent, lifecycle saves derived from the driver's current state, pending reward presentation, and claim persistence. The offline-reward modal and the scene-owned upgrade-detail popup are the two blocking DOM overlays; the latter serves mine floors, the elevator tower, and the warehouse.
- `src/game/runtime/MineSimulationDriver.ts` is the live bridge between the core and the screen. It holds authoritative state, and each frame the scene pulls `advance()`, which credits `now() - state.lastUpdateTimestampMs` through `catchUpSimulation` — sliced, because a hidden tab stops the render loop and returns the whole absence as one delta that a single bounded advance would consume unsimulated. `now` is injected, so `Date.now()` remains only in `src/main.ts`, a frozen clock pauses production while the renderer keeps running, and a backwards clock credits nothing. The derived snapshot is memoized and re-derived only when a fixed tick completed, so the frames that change no displayed value return the same object and the scene skips rebinding by identity; `replaceState` lets commands such as the offline claim hand new state back, and `purchaseUpgrade(target)` advances to the current time, dispatches to the matching core purchase command, reports `purchased` / `insufficient-funds` / `unavailable`, and calls the optional `onCommandApplied` hook only when authoritative state actually changed. `eslint.config.mjs` keeps `src/game/runtime/**` free of Phaser, DOM globals, and persistence/platform imports, and `tests/unit/architecture.test.ts` probes that rule.
- Shaft, elevator, and warehouse batch-cost functions price sequential x1/x5/MAX levels through one geometric-series `GameNumber` implementation; their MAX functions expand and binary-search the exact affordable bound. Each core batch command applies its quote atomically while preserving in-progress work and queued material. `MineSimulationDriver.purchaseUpgradeBatch` advances current time, routes the selected target, refreshes the snapshot, and invokes the persistence hook once; `purchaseMineShaftBatch` remains a compatibility wrapper.
- `src/ui/MineShaftUpgradeModal.ts` is an accessible responsive DOM dialog over the 360×640 canvas. It displays current level, output per cycle, cycle time, queued material, next output, and three ≥44 px CTAs. Opening the Level badge changes no state; enabled x1/x5/MAX buttons are derived from current gold, the dialog rebinds while open, Escape/backdrop/X close it, and `BootScene` disables Phaser scene input for its entire visible lifetime to prevent click-through.
- All three production stages have an authoritative indicator. Miner travel replaces the hidden per-floor extraction bar, while the elevator and warehouse retain a cycle bar plus track marker. The cabin follows a real sequential route through unlocked floors, stops at the semantic centre of each floor's gold container, and uses `Collecting` / `Returning` status; duplicate shaft number plaques are not rendered. Queued material renders wherever it accumulates, and the elevator never reports a backlog because a full car is one full trip.
- `src/game/view-model/stageAnimation.ts` holds the cosmetic clock and pure level-derived workforce rules. The 5,200 ms surface loop always sequences tower collection, eased outbound travel, warehouse stop, and mirrored empty return; tower queue state only enables the pour/filled-cart feedback and never parks a worker. Warehouse levels 10/20/.../100 reveal one assistant from a ten-sprite pool. Surface assistants retain independent phase-shifted X positions while sharing one cat/cart Y baseline, including empty-tower round trips. Every mine floor uses the same one-base-plus-one-per-50-level rule through level 200, with four pooled assistants on progress-driven phased patrols and shallow lanes. No workforce count adds save state or changes production; frame accumulation remains capped at 250 ms, multiplier-scaled, and wrapped at 7,488,000 ms.
- Miner route position no longer exposes the core's 100 ms fixed-step cadence. `interpolateNormalizedProgressForward` blends the currently rendered progress to each new authoritative target across one `SIMULATION_STEP_MS`, moves forward across a 1→0 wrap, clamps at completion, and is used only by `MineFloorView`; extraction output and timing remain core-owned.
- `BootScene` publishes `data-hud-view`, `data-floor-views`, `data-surface-views`, `data-purchase-controls`, `data-floor-upgrade-modal`, and `data-animation` at most every 100 ms rather than every frame, because displayed progress changes continuously and an unthrottled read-back would serialize the whole screen 60 times a second for diagnostics alone.
- The surface headhouse has matched filled and empty 512×512 textures. `BootScene` derives the visible hopper state from `warehouse.queueSteps`: positive input shows gold, while zero shows the empty steel bin, with the same 128×128 display bounds after every texture swap.
- The same `warehouse.queueSteps > 0` predicate exclusively drives surface cargo feedback: filled lead/assistant carts and the chute's gold-pour effect. Material still carried by the elevator cannot appear at the surface before authoritative delivery into `warehouse.inputQueue`; at zero queue every moving cart uses the empty texture and the pour is hidden, while all workers keep looping.
- `src/game/layout/` is pure Phaser-free geometry and palette data, so `tests/unit/layout.test.ts` and the Playwright layout spec both import the `src/game/layout` barrel without loading Phaser. `eslint.config.mjs` enforces that purity for `src/game/layout/**` (no `document`/`window`/`navigator`, no `phaser` import) and `tests/unit/architecture.test.ts` probes the rule. It exports the 360×640 constants, `calculateMineLayout`, `calculateMineContentHeight`, `calculateFloorSlotRegion`, `regionContainsPoint`, `assertTouchTargetRegion`, and `serializeRegion`, and rejects non-finite/non-positive dimensions, heights below 416 logical pixels, invalid floor counts, negative floor indexes, and interactive regions below 44×44.
- The portrait layout tiles `hud` (`0,0,360,52`), `surface` (`0,52,360,164`), and `mine` (`0,216,360,424`) with no gaps and no reserved bottom navigation. The initial five edge-to-edge 288×132 floor slots plus vertical content padding produce 680 logical pixels of mine content, so the mine area scrolls by 256; the content height expands at the 10-floor and 15-floor reveal gates. The elevator shaft is 64 px wide with a 62 px cabin, 50 px cargo cat, and no floor plaques; its 192×528 source artwork is a 64×1,980 `TileSprite` with tile scale `(1/3, 1)`, so it repeats at native vertical resolution instead of blurring through full-depth stretching. Adjusted shaft inset/gap/right inset preserve the floor width. `MIN_TOUCH_TARGET_PX` is 44 and `assertTouchTargetRegion` rejects anything smaller.
- `index.html` declares `viewport-fit=cover` and hosts the Phaser parent in `#game-viewport`; `#app` applies `env(safe-area-inset-*)` padding so the scale manager measures the safe box. `Phaser.Scale.FIT` with `CENTER_BOTH` preserves aspect ratio and letterboxes instead of cropping.
- Phaser 4 removed WebGL geometry masks (`setMask` logs a warning and does nothing), so the mine area is clipped by a dedicated camera viewport instead. The main camera ignores the mine content layer, the mine camera ignores the fixed HUD/surface layers, and the scroll gesture drives only that camera's `scrollY`. Phaser hit-tests through the same camera and honours both its scroll and each object's camera filter, so a scrolled control's pressable rectangle follows what is drawn without extra bookkeeping.
- Elevator route geometry stays in mine-world coordinates. Its surface endpoint is always `SURFACE_ELEVATOR_STOP_Y - SURFACE_HEIGHT`, and the fixed-layer cabin twin maps from that world Y without applying mine-camera `scrollY`; scrolling can clip/reveal the cabin but cannot shorten a deep return leg or move the tower entry point.
- `src/game/view-model/mineScroll.ts` is the pure scroll and gesture model: travel range clamped to `max(0, contentHeight - regionHeight)`, one-pixel-per-pixel drag from the press anchor, a wheel accepted only over the mine, and a 6-pixel `MINE_SCROLL_DRAG_THRESHOLD_PX` separating a tap from a scroll. Every transition returns its input unchanged by identity when nothing moved. `hasDragged` is set by any press that travels past the threshold — including one that began on a fixed layer and so scrolls nothing — survives the release that raised it, and is cleared only by the next pointer-down; `BootScene.#requestPurchase` returns early while it is set, because Phaser reports a control's press while the pointer is still coming up. `BootScene` binds scene-wide `POINTER_DOWN`/`POINTER_MOVE`/`POINTER_UP`/`POINTER_UP_OUTSIDE`/`POINTER_WHEEL` handlers rather than a draggable object, since the mine is dragged from anywhere over it, including its buttons.
- Fifteen floors remain authoritative at all times. `calculateVisibleMineFloorCount` reveals 1–5 initially, 1–10 once floor 5 opens, and 1–15 once floor 10 opens; hidden roots do not render, animate, expose controls, or extend the scroll range, and `resizeMineScrollContent` preserves/clamps scroll when a group appears.
- `#game-viewport canvas` sets `touch-action: none`, so a browser cannot claim a vertical gesture as a page pan before Phaser's non-passive touch listeners see it.
- `PublishedPurchaseControl` carries `isPressable` beside `screenBounds`: a floor control scrolled out of the mine viewport is clipped away and hit-tested by no camera, so its rectangle would otherwise invite a press that lands elsewhere.
- `src/game/layout/palette.ts` holds lowercase `#rrggbb` colors as the single source of truth; `toFillColor` derives the numeric fills Phaser needs and rejects any other format so scene colors and browser pixel probes cannot drift apart. The game config's `backgroundColor` also reads it and is only visible before the scene paints its regions; the letterbox around the fitted canvas is the `:root` background in `src/style.css`.
- `BootScene` publishes `data-layout-viewport`, `data-layout-hud`, `data-layout-surface`, `data-layout-mine`, `data-layout-mine-content-height`, `data-layout-bottom-navigation`, `data-hud-view`, `data-floor-views`, `data-surface-views`, `data-purchase-controls`, `data-animation`, and `data-mine-scroll` on the canvas alongside the existing boot/renderer diagnostics.
- `src/game/view-model/` is pure Phaser-free presentation logic, so `tests/unit/mine-view-model.test.ts` imports it in Node without a renderer. `eslint.config.mjs` enforces that purity for `src/game/view-model/**` (no `document`/`window`/`navigator`, no `phaser` import, no persistence/platform import) and `tests/unit/architecture.test.ts` probes the rule. `createMineViewModel(state, balance)` derives per-floor headings, `Lv N` labels, `Locked` status, normalized progress plus percentage labels, queued-amount labels, and four-step material-pile heights, plus the shared elevator/warehouse title, level, capacity, held amount, and cycle progress. It rejects progress outside `[0, 1)` and non-positive levels.
- `src/game/view-model/formatAmount.ts` is the single magnitude-tier authority: two decimal places for non-integer and abbreviated main-screen values, no suffix below 1,000, lowercase `k/m/b/t/qa/qi/sx/sp/oc/no/dc`, then `aa`, `ab`, ... from `10^36`. The DOM offline-reward formatter shares `describeAmountTier` and the same two-decimal ceiling. Main labels truncate rather than round so a balance never reads high, present-but-tiny amounts read `<0.01`, and `GameNumber` mantissa/exponent support magnitudes beyond `Number.MAX_VALUE`.
- `src/game/view-model/purchaseControl.ts` models every priced control. `PurchaseControlView` draws `floor-level` (open floor and both visible surface badges), `stacked` (unlock), or `inline` (hidden shared-stage read-back) layouts. All open-stage Level presses select the shared detail modal; its x1/x5/MAX actions use `MineSimulationDriver.purchaseUpgradeBatch`, exact core quotes, and one persistence callback. Elevator details expose cargo in transit; warehouse details expose authoritative `warehouse.inputQueue`. The surface badge regions are `(106,48,44,50)` for elevator and `(263,0,44,50)` for warehouse, relative to the surface container. Save-document and IndexedDB schemas remain version 1.
- `createFloorUnlockControlViewModel(availability)` builds a locked floor's control from `describeFloorUnlock` in `src/core/progression/unlocks.ts`, which shares one private predicate with `purchaseFloorUnlock`. The button carries the `Unlock` caption and the unlock price, and is enabled only from `canUnlock` — the prerequisite shaft level and the balance together — while `formatUnlockRequirement` produces the `Needs Floor 1 Lv 5` line drawn beside it, in `TEXT_WARNING` until the gate is passed and `TEXT_MUTED` after. `PurchaseTarget` gained `{ type: 'floor-unlock', floorId }` and `PurchaseOutcome` gained `unlocked` and `requirement-not-met` (`Unlocked!`, `Level too low`).
- `createHudViewModel(state, balance)` derives three icon-led HUD values: authoritative spendable gold, authoritative `warehouse.inputQueue` shown with the warehouse icon, and the core's effective production rate already capped at the slowest stage; duplicate captions remain empty. It is carried on `MineViewModel`, so `createMineViewModel(state, balance)` and `MineSimulationDriver` both take balance data. `HudView` builds its compact 52 px background, divider, icons, and text objects once and changes only through `applySnapshot`; `BootScene` publishes `data-hud-view` on the same 100 ms cadence as the other rendered-state diagnostics.
- `MineFloorView` and `SharedStageView` in `src/game/entities/` build their game objects once inside a supplied layout region, rebind only through `applySnapshot`, and expose `describeRenderedState` so browser tests read values back from the rendered objects. Locked floors switch to `LOCKED_PANEL_BACKGROUND` with a `Locked` badge, muted text, no placeholder miner, a requirement line, and an unlock control in place of the shaft-upgrade control. Both views compose the shared `PurchaseControlView` for their buttons and forward press results through `applyUpgradeFeedback`; `MineFloorView` holds a second instance in the same slot and forwards its results through `applyUnlockFeedback`. Exactly one of the two is ever visible, and Phaser skips invisible objects when hit-testing, so only the live one can take a press.
- `createGame(parent, viewModel)` constructs `BootScene` with the loaded snapshot. Open floors use 30×34 visible level chrome shifted 5 px right inside the 44×50 control at `(234,42)`; locked floors retain a 92×44 unlock control at `(186,50)`.

## Complete Save Document Schema

| Path | Type and constraint |
|---|---|
| `schemaVersion` | Integer exactly `1`. |
| `savedAtTimestampMs` | Non-negative safe integer, at least `state.lastUpdateTimestampMs`. |
| `effectiveProductionRatePerSecond` | Non-negative finite numeric string. |
| `state.saveVersion` | Integer exactly `1`. |
| `state.lastUpdateTimestampMs` | Non-negative safe integer. |
| `state.simulationTick` | Non-negative safe integer. |
| `state.simulationRemainderMs` | Finite number in `[0, 100)`. |
| `state.gold` | Non-negative finite numeric string. |
| `state.floors` | Exactly fifteen configured, ordered floor objects. A legacy four-floor version-1 prefix is expanded to locked defaults for floors 5–15 before validation. |
| `state.floors[].id`, `floorNumber` | Exact configured identifier and sequential integer. |
| `state.floors[].isUnlocked`, `mineShaftLevel` | Boolean plus positive safe integer; floor one stays open and deeper unlocks are sequential/gated. |
| `state.floors[].extractionProgress` | Finite number in `[0, 1)`; zero while locked. |
| `state.floors[].materialQueue`, `totalExtracted`, `totalTransported` | Non-negative finite numeric strings; locked values are zero and transported cannot exceed extracted. |
| `state.elevator.level`, `capacity` | Positive safe integer plus positive finite numeric string matching the configured level effect. |
| `state.elevator.roundRobinCursor`, `transitProgress`, `carriedMaterial` | Signed route cursor integer in `[-15, 15)` (non-negative downward target, negative upward origin), progress in `[0, 1)`, non-negative finite numeric string; empty travel may retain positive progress. |
| `state.warehouse.level`, `capacity` | Positive safe integer plus positive finite numeric string matching the configured level effect. |
| `state.warehouse.inputQueue`, `conversionProgress`, `totalGoldDelivered` | Non-negative finite numeric strings around progress in `[0, 1)`; empty input requires zero progress. |

Production-only services, when justified, are Node.js/Fastify, PostgreSQL, and optional Redis. The MVP should remain client-only.

## Complete Database Schema

**Relational/server database schema — landed in the local Supabase stack.**
Server-milestone Step 3 designed the schema below on 2026-09-08; Step 4 stood up
the local Supabase stack; Step 5 landed it on 2026-09-08 as
`supabase/migrations/20260908130000_create_platform_tables.sql`, applied after
Step 4's bootstrap migration
(`supabase/migrations/20260908120000_bootstrap_platform_requirements.sql`, which
creates nothing — it only asserts the PostgreSQL 13+ premise this block relies on
for `gen_random_uuid()`). All six tables and the row-level-security policies in
the matrix below exist in the local development database after
`supabase db reset`; **no deployed database contains them**, because no
deployment exists yet. This block and its twin in the other document are
byte-identical by construction and must be changed together, in the same change
as every future migration, exactly as `AGENTS.md` requires.

Full protocol context is in `memory-bank/server-save-sync-protocol.md`; the
threat model and recorded defaults it obeys are in
`memory-bank/server-threat-model.md`.

### How a `GameNumber` is stored

Three rules, and they differ by location.

1. **Inside a save document, nothing changes.** `GameNumber` values stay
   serialized decimal/scientific strings inside the document text, exactly as
   the version-1 save schema already defines them. The server neither reformats
   nor re-serializes them.
2. **Anywhere SQL must sort or rank a `GameNumber`, store two columns.**
   `*_exact text` holds the canonical serialized form and is the only value ever
   displayed; `*_log10 double precision` holds its base-10 magnitude and is used
   only for `ORDER BY`. A value past `1e308` cannot enter a `double precision`
   column, but its logarithm can, which is what makes the pair work.
3. **`numeric` is deliberately not used.** It could hold these magnitudes, but
   round-tripping the canonical string through `numeric` is not guaranteed to
   reproduce the exact serialization display depends on, and comparison and
   index cost grow with digit count while idle-game values grow without bound.
   The `exact` + `log10` pair keeps display exact and sort cost constant.

Sorting on `log10` orders distinct magnitudes correctly. Two values whose
mantissas differ beyond double precision can tie; the ranking index carries a
deterministic secondary column so that tie resolves stably, and the exact string
is what the player is shown either way.

### Storage of the save document — `text`, not `jsonb`

`saves.document_json` is `text` holding the exact serialized document. It is
**not** `jsonb`, and this is a correctness requirement rather than a preference:
`jsonb` does not preserve key order, discards insignificant whitespace, and
normalizes numeric literals, whereas Step 20's test requires a pre-milestone
save to come back from download **byte-for-byte** identical. The server parses
the document to validate it and stores the original text unchanged. Nothing in
SQL ever queries inside the document — re-simulation parses it in the Edge
Function, and leaderboard values are projected into their own table — so `jsonb`
would buy nothing and cost the round-trip guarantee.

`save_audit.detail` is `jsonb` because it is server-authored, never returned to
a client, and never round-tripped.

### Tables

Schema `public`. `gen_random_uuid()` is built into PostgreSQL 13+, which
Supabase provides; no extension is required.

```sql
-- Shared trigger: maintains updated_at on rows that carry it.
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles --
create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  display_name text            null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 24)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- saves --
create table public.saves (
  user_id                uuid        primary key references auth.users(id) on delete cascade,
  revision               bigint      not null,
  schema_version         integer     not null,
  document_json          text        not null,
  received_at            timestamptz not null default now(),
  previous_revision      bigint          null,
  previous_document_json text            null,
  previous_received_at   timestamptz     null,
  created_at             timestamptz not null default now(),
  constraint saves_revision_positive
    check (revision > 0),
  constraint saves_schema_version_positive
    check (schema_version > 0),
  constraint saves_document_size
    check (octet_length(document_json) <= 65536),
  constraint saves_previous_all_or_none
    check (num_nulls(previous_revision, previous_document_json, previous_received_at) in (0, 3)),
  constraint saves_previous_revision_older
    check (previous_revision is null or previous_revision < revision),
  constraint saves_previous_document_size
    check (previous_document_json is null or octet_length(previous_document_json) <= 65536)
);

-- ---------------------------------------------------------------- save_audit --
create table public.save_audit (
  id                 bigint      generated always as identity primary key,
  user_id            uuid        not null references auth.users(id) on delete cascade,
  occurred_at        timestamptz not null default now(),
  outcome            text        not null,
  error_code         text            null,
  base_revision      bigint          null,
  resulting_revision bigint          null,
  document_bytes     integer     not null,
  client_reported_at timestamptz     null,
  detail             jsonb           null,
  constraint save_audit_outcome_known
    check (outcome in ('accepted', 'rejected')),
  constraint save_audit_error_code_matches_outcome
    check ((outcome = 'accepted') = (error_code is null)),
  constraint save_audit_resulting_revision_matches_outcome
    check ((outcome = 'accepted') = (resulting_revision is not null)),
  constraint save_audit_document_bytes_non_negative
    check (document_bytes >= 0),
  constraint save_audit_detail_size
    check (detail is null or octet_length(detail::text) <= 4096)
);

create index save_audit_user_time_idx
  on public.save_audit (user_id, occurred_at desc);

create index save_audit_rejected_time_idx
  on public.save_audit (occurred_at desc)
  where outcome = 'rejected';

-- ----------------------------------------------------------- recovery_codes --
create table public.recovery_codes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  code_hash   text        not null,
  created_at  timestamptz not null default now(),
  redeemed_at timestamptz     null,
  revoked_at  timestamptz     null,
  constraint recovery_codes_hash_format
    check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint recovery_codes_single_terminal_state
    check (redeemed_at is null or revoked_at is null)
);

create unique index recovery_codes_hash_key
  on public.recovery_codes (code_hash);

create unique index recovery_codes_one_active_per_user_idx
  on public.recovery_codes (user_id)
  where redeemed_at is null and revoked_at is null;

-- ------------------------------------------------------ leaderboard_entries --
create table public.leaderboard_entries (
  board_key       text             not null,
  user_id         uuid             not null references auth.users(id) on delete cascade,
  display_name    text                 null,
  metric_exact    text             not null,
  metric_log10    double precision not null,
  source_revision bigint           not null,
  updated_at      timestamptz      not null default now(),
  primary key (board_key, user_id),
  constraint leaderboard_entries_board_key_format
    check (board_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  constraint leaderboard_entries_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 24),
  constraint leaderboard_entries_metric_exact_length
    check (char_length(metric_exact) between 1 and 64),
  constraint leaderboard_entries_metric_log10_finite
    check (metric_log10 <> 'NaN'::double precision
           and metric_log10 > '-Infinity'::double precision
           and metric_log10 < 'Infinity'::double precision),
  constraint leaderboard_entries_source_revision_positive
    check (source_revision > 0)
);

create index leaderboard_entries_rank_idx
  on public.leaderboard_entries (board_key, metric_log10 desc, updated_at asc);

create trigger leaderboard_entries_set_updated_at
  before update on public.leaderboard_entries
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ entitlements --
create table public.entitlements (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  entitlement_key text        not null,
  granted_at      timestamptz not null default now(),
  granted_by      text        not null,
  source          text            null,
  revoked_at      timestamptz     null,
  primary key (user_id, entitlement_key),
  constraint entitlements_key_known
    check (entitlement_key in ('cosmetic.supporter_badge')),
  constraint entitlements_granted_by_length
    check (char_length(granted_by) between 1 and 64)
);
```

### Column reference

| Table | Column | Type | Null | Default | Key / constraint |
|---|---|---|---|---|---|
| `profiles` | `id` | uuid | no | — | PK; FK → `auth.users(id)` on delete cascade |
| `profiles` | `display_name` | text | yes | — | 1–24 characters when present; player-supplied, untrusted on render |
| `profiles` | `created_at` | timestamptz | no | `now()` | — |
| `profiles` | `updated_at` | timestamptz | no | `now()` | maintained by `profiles_set_updated_at` |
| `saves` | `user_id` | uuid | no | — | PK; FK → `auth.users(id)` on delete cascade; one row per user |
| `saves` | `revision` | bigint | no | — | `> 0`; monotonic, `+1` per accepted upload; the D2 concurrency token |
| `saves` | `schema_version` | integer | no | — | `> 0`; denormalized from the document for migration sweeps |
| `saves` | `document_json` | text | no | — | ≤ 65536 bytes; exact serialized `SaveDocumentV1` |
| `saves` | `received_at` | timestamptz | no | `now()` | server clock; the D3 anchor for every elapsed-time calculation |
| `saves` | `previous_revision` | bigint | yes | — | `< revision`; null-together with the other two `previous_*` columns |
| `saves` | `previous_document_json` | text | yes | — | ≤ 65536 bytes; one generation of rollback |
| `saves` | `previous_received_at` | timestamptz | yes | — | — |
| `saves` | `created_at` | timestamptz | no | `now()` | — |
| `save_audit` | `id` | bigint | no | identity | PK, generated always |
| `save_audit` | `user_id` | uuid | no | — | FK → `auth.users(id)` on delete cascade |
| `save_audit` | `occurred_at` | timestamptz | no | `now()` | server clock |
| `save_audit` | `outcome` | text | no | — | `accepted` or `rejected` |
| `save_audit` | `error_code` | text | yes | — | present exactly when rejected; a code from the protocol vocabulary |
| `save_audit` | `base_revision` | bigint | yes | — | what the client claimed to be building on |
| `save_audit` | `resulting_revision` | bigint | yes | — | present exactly when accepted |
| `save_audit` | `document_bytes` | integer | no | — | `>= 0`; body size, for abuse analysis |
| `save_audit` | `client_reported_at` | timestamptz | yes | — | the client's own claimed time, recorded and never trusted; a clock attack is visible as divergence from `occurred_at` |
| `save_audit` | `detail` | jsonb | yes | — | ≤ 4096 bytes; server-authored reason |
| `recovery_codes` | `id` | uuid | no | `gen_random_uuid()` | PK |
| `recovery_codes` | `user_id` | uuid | no | — | FK → `auth.users(id)` on delete cascade |
| `recovery_codes` | `code_hash` | text | no | — | unique; 64 lowercase hex characters |
| `recovery_codes` | `created_at` | timestamptz | no | `now()` | — |
| `recovery_codes` | `redeemed_at` | timestamptz | yes | — | mutually exclusive with `revoked_at` |
| `recovery_codes` | `revoked_at` | timestamptz | yes | — | set when a replacement code is issued |
| `leaderboard_entries` | `board_key` | text | no | — | PK part 1; `^[a-z0-9][a-z0-9._-]{0,63}$` |
| `leaderboard_entries` | `user_id` | uuid | no | — | PK part 2; FK → `auth.users(id)` on delete cascade |
| `leaderboard_entries` | `display_name` | text | yes | — | 1–24 characters; snapshot taken at publish time |
| `leaderboard_entries` | `metric_exact` | text | no | — | 1–64 characters; serialized `GameNumber`, the only displayed value |
| `leaderboard_entries` | `metric_log10` | double precision | no | — | finite, not NaN; sort key only, never displayed |
| `leaderboard_entries` | `source_revision` | bigint | no | — | `> 0`; the `saves.revision` this entry derives from |
| `leaderboard_entries` | `updated_at` | timestamptz | no | `now()` | maintained by `leaderboard_entries_set_updated_at`; the ranking tie-break |
| `entitlements` | `user_id` | uuid | no | — | PK part 1; FK → `auth.users(id)` on delete cascade |
| `entitlements` | `entitlement_key` | text | no | — | PK part 2; must be a known key |
| `entitlements` | `granted_at` | timestamptz | no | `now()` | — |
| `entitlements` | `granted_by` | text | no | — | 1–64 characters; no client path grants |
| `entitlements` | `source` | text | yes | — | why it was granted |
| `entitlements` | `revoked_at` | timestamptz | yes | — | — |

### Indexes, and the ones deliberately absent

| Index | Table | Definition | Why |
|---|---|---|---|
| PK | `profiles` | `(id)` | Only access path is by user. |
| PK | `saves` | `(user_id)` | Only access path is by user. **No secondary index exists**: at the recorded scale of ~10⁴ rows every read and write is by primary key, so another index would cost writes and buy nothing. |
| `save_audit_user_time_idx` | `save_audit` | `(user_id, occurred_at desc)` | Per-user history when investigating one account. |
| `save_audit_rejected_time_idx` | `save_audit` | `(occurred_at desc) where outcome = 'rejected'` | Partial, because Step 35's alert watches the rejection rate and rejections are the rare minority. |
| `recovery_codes_hash_key` | `recovery_codes` | unique `(code_hash)` | Redemption looks a code up directly instead of scanning. |
| `recovery_codes_one_active_per_user_idx` | `recovery_codes` | unique `(user_id) where redeemed_at is null and revoked_at is null` | Enforces at most one live code per user in the database rather than in application logic. |
| `leaderboard_entries_rank_idx` | `leaderboard_entries` | `(board_key, metric_log10 desc, updated_at asc)` | The ranking query. The trailing column is the tie-break; Step 27 may choose a different one, which is an index change, not a table change. |
| PK | `leaderboard_entries` | `(board_key, user_id)` | One entry per user per board. |
| PK | `entitlements` | `(user_id, entitlement_key)` | Covers lookup by user as a prefix, so **no separate per-user index exists**. |

### Row-level security

RLS is **enabled on every table**. Anything not listed is denied. The service
role used by Edge Functions bypasses RLS and is the only writer anywhere in this
schema.

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | own row | none — created by the Step 9 sign-up trigger | own row | none |
| `saves` | own row | **none** | **none** | **none** |
| `save_audit` | none | none | none | none |
| `recovery_codes` | none | none | none | none |
| `leaderboard_entries` | all rows, every column but `user_id` | none | none | none |
| `entitlements` | own row | none | none | none |

`saves` denying every client write is the rule the whole anti-cheat design rests
on: row-level security cannot re-simulate a save, so it cannot judge one, and a
client that could reach `saves` through PostgREST would make Phase 4 decoration.
Step 15 establishes it and Step 26 attacks it.

`leaderboard_entries` is world-readable by design — that is what a leaderboard
is. It carries its own `display_name` snapshot precisely so that publishing a
board does **not** require widening `profiles` beyond own-row access.

Its `user_id` is withheld at the **grant** level rather than the policy level,
because a row policy alone does not constrain which columns a caller asks for:
against a world-readable table, `?select=user_id` would enumerate the
`auth.users` id of every player who has ever published to a board, with no
authentication at all. Grants and row-level security are independent and both
must permit a read, so `revoke select … ; grant select (board_key,
display_name, metric_exact, metric_log10, source_revision, updated_at)` keeps
the board public without publishing ids. Two consequences for Step 27, recorded
rather than discovered and verified against the local stack: a client cannot
select, filter, or sort by `user_id`, so "where do I rank" is answered by the
Edge Function rather than by a direct query here; and `select=*` is refused
outright (`42501`), because PostgREST expands it to every column including the
withheld one, so a board query must name its columns.

### Relationships and deletion

Every table holds exactly one foreign key, to `auth.users(id)`, with
`on delete cascade`. There are no other relationships. That gives Step 33 a
single deletion path: removing the `auth.users` row removes every row this
schema holds for that person.

**Invariant for every future table:** it must carry a cascading foreign key to
`auth.users(id)`, or declare its own explicit deletion path in the same change.
Step 33's test enumerates the tables, so one added without a deletion path fails
it.

Consequence recorded rather than discovered later: `save_audit` rows cascade
away with the account, so deleting an account also erases the evidence of abuse
from it. That is the right default while no money is at stake and GDPR is
assumed to apply, and it is a trade, not an oversight.

### Recovery-code hashing

`code_hash` holds an HMAC-SHA-256 digest, hex-encoded, of the recovery code
under a pepper held in Edge Function configuration and **never** stored in the
database. Plaintext codes are never stored, logged, or returned after issuance.

A fast keyed digest is correct here rather than a slow password hash: the code
is a high-entropy machine-generated secret, not a human-chosen password, so
there is no small candidate space to make expensive. Keeping the pepper outside
the database means a database leak alone does not permit offline enumeration,
and the unique index on the digest is what lets redemption find the row without
scanning. Step 14 fixes the code's own format and entropy.

There is deliberately **no per-code failed-attempt counter**: a wrong code
usually matches no row at all, so counting per code would miss the attack.
Throttling belongs per caller and per address, in Step 25.

### What Step 3 does not design

- The Step 32 account audit log covering identity changes, recovery issuance and
  redemption, and entitlement grants. It is a separate table designed in its own
  step; merging it with `save_audit` would put frequent save rows and rare
  identity events in one table with opposing access patterns.
- The leaderboard metric, reset period, and tie-break — Step 27. The schema is
  metric-agnostic on purpose: a season or period is a `board_key` value, not a
  schema change.
- Rate-limit counters — Step 25, which may use platform facilities rather than
  tables.
- `offlineGrant` and anything Step 22 needs beyond `received_at`, which already
  anchors it.

**IndexedDB schema:** database `cat-mine-idle`, version `1`.

| Store | Field | Type | Nullability/default | Key, index, relationship |
|---|---|---|---|---|
| `saves` | `id` | string | Required; no default | Primary key/key path; fixed application value `active`; not auto-incremented. |
| `saves` | `document` | `SaveDocumentV1` structured object | Required; no default | No index; validated/migrated application payload. |

There are no secondary indexes, foreign keys, relationships, or other object stores. One logical record is maintained by `put` at the fixed key. Dexie version 1 creates the store with schema `id`; no IndexedDB structural migration exists. The save-document boundary performs a same-version four-floor-to-fifteen-floor expansion before strict validation, so existing prototype progress remains readable without changing either version number.

**Lifecycle journal:** localStorage key `cat-mine-idle:lifecycle-save-v1` stores at most one JSON-encoded, validated `SaveDocumentV1`. It is a synchronous pagehide recovery record, not an authoritative second save. A newer valid journal wins during load and is deleted after the same-or-newer snapshot commits to IndexedDB; malformed values are discarded.

If a database is introduced, replace this statement with the complete authoritative schema: every table, column, data type, default, nullable rule, primary/foreign key, unique/check constraint, index, and relationship. Update this section in the same change as each migration; do not leave schema details only in migration files.

## Verified Commands

- `npm run dev`: verified by starting Vite at `127.0.0.1:5173`, receiving the application HTML over HTTP, and terminating the server cleanly.
- `npm run build` (`tsc --noEmit` plus Vite production build)
- `npm run test`: 401 tests pass, including the fifteen-floor configuration, legacy four-floor save expansion, progressive visibility, scroll resizing, unavailable-journal fallback, lifecycle recovery, exact shaft/elevator/warehouse x1/x5/MAX batch quoting, fixed-step miner-progress interpolation, the ten-minute fractional-transport save-invariant regression, the core/Deno architecture-boundary probe and the pinned ten-minute core-portability fixture (Step 6), and — Step 7 — `tests/unit/server-stack.test.ts`'s Retry-After assertion updated to read the response envelope from its new home in `_shared/http.ts`, its "never reads the service-role key" and `config.toml` `verify_jwt` checks generalized to `it.each` loops over every directory under `supabase/functions/` rather than hardcoding `save-sync` (a 2026-09-09 review finding). Step 8 added `tests/unit/guest-session.test.ts` (`createSupabaseClient`'s null-when-unconfigured behavior; `ensureGuestSession` reusing a session including a linked non-anonymous one, defaulting `isAnonymous` to `false` when absent, signing in fresh, and never throwing on a fake `GuestAuthClient`'s rejection) and flipped `tests/unit/server-stack.test.ts`'s two `@supabase/supabase-js` pin assertions from `devDependencies` to `dependencies`, plus added `test:server-e2e` to its documented-commands list (a 2026-09-09 Step 8 review finding). A third Step 8 review pass added `describe('the guest-session bootstrap in src/main.ts')` — three static-source assertions (the chain is never awaited before boot, a `.catch` sits between its two `.then`s, and the DEV diagnostic is published through `toPublicGuestSessionDiagnostic` rather than stringifying the raw result with its access token). They are static because `src/main.ts` is a module of top-level side effects no unit test can import, and because the only behavioural test of that contract — the production-smoke lazy-chunk spec — can run solely against a build with Supabase configuration inlined, which CI has not; the same static-beside-behavioural pattern a Step 7 review established for `resolveCallerViaSupabaseAuth`.
- `npm run test:server-unit` (`deno test supabase/functions`): 19 tests pass across `_shared/http.test.ts`, `save-sync/index.test.ts`, and `whoami-check/index.test.ts` (Step 7), every one with zero `--allow-*` permission flags. Needs no Docker and no database.
- `npm run test:server-integration` (`vitest run --config vitest.server-integration.config.ts`): 6 tests pass against the live local stack (Step 7) — the seeded fixture guest's real `profiles.display_name` for a valid token, and 401 for no header / a syntactically invalid token / a wrong-secret-signed token / an expired token, plus 400 for a non-GET method. Assumes `supabase start` and `supabase db reset` already ran.
- `npm run test:server-e2e` (`playwright.server-e2e.config.ts`, port 4176): 3 Chromium tests pass against the live local stack (Step 8) — a fresh browser boots playable and holds a real anonymous session with a UUID `user.id`; every `**/auth/v1/**` request aborted still boots the game and a forced `visibilitychange` flush still reaches IndexedDB across a reload; two fresh browser contexts receive distinct `user.id`s whose access tokens each answer only for themselves through the live `whoami-check` function. Assumes `supabase start` and `supabase db reset` already ran and needs `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` pointed at that stack.
- `npm run test:e2e`: all 42 Chromium tests pass, including explicit 5→10→15 reveal gates, all three stage-detail/batch-upgrade paths, drag rejection at the shared popup boundary, camera-invariant deep elevator return, the Step 33 journey, and Step 34 hidden/visible and abrupt-navigation scenarios.
- `npm run test:perf`: the repeated ten-minute benchmark passes with all fifteen floors unlocked — 60.000 FPS, 16.67 ms mean, 17.6 ms p95, 17.8 ms maximum, zero of 36,139 frames beyond the 18.34 ms threshold, +229,928 bytes post-GC live-heap growth at +188 B/s, 665 Phaser objects and 371 DOM nodes constant across twenty samples, and 81.9 ms scroll p95 against a 100 ms budget. It presented at 60 Hz, so mean frame time equals the vsync interval and carries no headroom information. This is Pixel 5 emulation under 4× CPU throttling in desktop Chrome and is not physical Android-device evidence.
- `npm run lint`: the repository passes the ESLint flat configuration.
- `npm run test:prod`: builds the optimized bundle, serves it with `vite preview`
  from the root base path at `127.0.0.1:4175`, and passes all nine production
  smoke tests covering runtime-asset loading, bundle identity, canvas pixel
  output, exact save/restore across a reload, corrupt/unsupported/unavailable
  storage handling, and the four representative viewports.
- `npm run verify`: runs lint, unit tests, E2E tests, the production build, the
  build-output secret scan, and the production smoke suite in that order. This is
  the Step 36 validation sequence with server-milestone Step 4's secret scan
  inserted after the build.
- `npm run verify:server`: verified on 2026-09-09 from a completely clean
  `supabase stop`/`start`/`db reset` cycle — Docker reachable, the
  server-core bundle rebuilds, `npm run test:server-unit` (Step 7), the stack
  starts, both committed migrations apply from empty, an unauthenticated
  `GET /v1/health` returning 200, a byte-for-byte-identical
  `core-portability-check` reproduction (Step 6), `npm run test:server-integration`
  (Step 7), and `npm run test:server-e2e` (Step 8), which the script feeds
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` read from a live
  `supabase status --output json`. `--with-bundle-scan` additionally passes
  the production build and secret scan. Requires Docker. Its final pass/fail
  line reads "npm run verify:server" rather than the Step-4-era "Step 4
  validation."
- `npm run verify:all`: `verify` then `verify:server` in sequence, added at Step
  5 as the sibling command its own test named; `.github/workflows/ci.yml` runs
  the same two checks as separate CI jobs rather than one sequential command, so
  either failing fails the workflow independently.
- `npm run scan:secrets`: verified against a real `dist/`; mutation-proven by
  planting a service-role JWT, an `sb_secret_*` key, and a server-only variable
  name, each of which fails the scan. It exempts a non-`VITE_` value only when
  its `VITE_` twin name carries the same value, so a server-side
  `SUPABASE_ANON_KEY` beside `VITE_SUPABASE_ANON_KEY` does not fail the build
  while a secret mirrored under an unrelated `VITE_` name still does. Reduced
  coverage — no `.env.local`, or a running stack whose status could not be
  parsed — is printed as a warning rather than passing in silence.
- `tests/unit/bundle-secret-scan.test.ts` covers the scanner directly against
  temporary fixtures outside the repository, importing it through
  `scripts/scan-bundle-secrets.d.mts` so `tsc` type-checks the test while the
  script stays plain JavaScript that `package.json` runs with no build step.

## Conventions

Use two-space indentation, semicolons, single quotes, explicit exports, and minimal unchecked `any`. Use `PascalCase` for classes/scenes/components, `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for global constants, and kebab-case for assets.

## Constraints and Security

Use English UI, a 360×640 logical viewport, root deployment base path `/`
declared in `vite.config.ts` because runtime textures are requested through
absolute `/assets/...` paths no bundler rewrites, and lowercase `k/m/b/t/qa/qi/sx/sp/oc/no/dc` large-number suffixes before the alphabetic run beginning at `aa = 10^36`. Optimize for quick startup and 60 FPS on a representative mid-range Android device running Chrome. Telegram WebView testing is deferred to its integration milestone. Offline rewards use the saved production-rate snapshot, a two-hour cap, and 50% efficiency; future timestamps award zero. Store secrets only in ignored `.env.local` files with safe `.env.example` placeholders. Never trust Telegram `initDataUnsafe`; production identity must be derived from server-validated `initData`.

Server-milestone Step 1 recorded the following about the repository as it stands
on 2026-09-08, because later steps depend on it. The git remote is
`https://github.com/codehand/game-gold-miner.git`. **There is no CI configuration of
any kind** — no `.github/workflows`, so the server plan's Step 5 creates it from
nothing, with GitHub Actions as the recorded default. **`index.html` sets no
Content Security Policy**, and no plan step adds one; this is recorded as an
accepted known gap (finding F5) rather than an oversight, and it matters because
the planned guest session credential would live in script-writable storage. **No
domain is registered**, so the first-party HttpOnly cookie option — the only
storage exempt from Safari's seven-day script-writable-storage deletion — is not
available and the save-sync protocol may not assume it. **`break_infinity.js`
2.2.0 declares `main: dist/break_infinity.common.js` and
`module: dist/break_infinity.esm.js` with no `type` field**; it is the single
external dependency of `src/core`, imported only by
`src/core/numbers/GameNumber.ts`, and whether it imports cleanly into a Deno Edge
Function is unproven and must be verified before any other server work depends on
it. Full reasoning is in `memory-bank/server-threat-model.md`.

Server-milestone Step 4 stood up the local Supabase stack on 2026-09-08 and
fixed the repository's secret boundary. **The `VITE_` prefix is that boundary**:
Vite inlines `VITE_`-prefixed variables into the browser bundle, so a privileged
credential must never carry one. `.env.example` is the committed template and
holds placeholders only; `.env.local` holds real values and is git-ignored, as
are `.env`, every `.env.*` but the template, and the Supabase CLI's `.temp` and
`.branches` state. `SUPABASE_SERVICE_ROLE_KEY`, `RECOVERY_CODE_PEPPER`, and
`TELEGRAM_BOT_TOKEN` are declared server-only; `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are the only public pair. `npm run scan:secrets`
enforces this against the built bundle inside `npm run verify`, and
`tests/unit/server-stack.test.ts` enforces the repository-side invariants —
including that no tracked or untracked-but-unignored file holds a service-role
JWT or an `sb_secret_*` key, asserted through `git check-ignore` rather than the
text of `.gitignore` so a commented-out rule cannot pass.

The `save-sync` Edge Function sets `verify_jwt = false` at the platform level
because protocol §10.1 requires `GET /v1/health` to answer an unauthenticated
caller; its authenticated routes verify their own bearer token in the handler
from Step 16. The health route never reads the service-role key — it is the one
unauthenticated route, and that key bypasses row-level security — and a unit
assertion pins the absence. It proves database reachability through a PostgREST
round trip, verified by stopping the PostgREST container and observing a 503
`service_unavailable` from the same route.

Server-milestone Step 2 fixed the save-sync contract in
`memory-bank/server-save-sync-protocol.md`; no code implemented it at the time.
The decisions with technical consequences: the session credential lives in the
Supabase client's default **script-writable storage, not a first-party HttpOnly
cookie**, because no domain is registered — which means the session token and
the local save fall under iOS Safari's same seven-day deletion, so for an
unlinked guest the Step 14 recovery code, not cloud save, is what survives it.
Step 8 landed the credential itself (`createSupabaseClient`'s default storage,
unchanged from this decision) after confirming no domain had since been
registered — the trigger this decision's own §8 named for revisiting it before
Step 8 shipped.
Concurrency uses a server-owned monotonic `revision` rather than an ETag. Cloud
upload runs at most once per 60 seconds with forced lifecycle/claim/boot
triggers, leaving `DEFAULT_SAVE_DEBOUNCE_MS = 500` untouched for local writes.
Request bodies are capped at 64 KB before parsing, against a real fifteen-floor
save of roughly 3–4 KB. Cloud failures reuse `createSaveDiagnosticBanner` with
`cloud-sync-*` codes, and only terminal failures reach it — the banner never
withdraws a notice, so a retryable network error must show nothing while a retry
is still pending.
