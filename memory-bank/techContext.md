# Technical Context

## Current State

All 37 implementation-plan steps are complete and user-validated; the user validated Step 37 on 2026-09-08, closing the base-game milestone. Step 37 added `README.md`, corrected the documentation that still described a four-floor mine, and re-ran the mobile benchmark against the full fifteen-floor scene. The physical mid-range Android pass and a human 30-second-comprehension playtest remain the two recorded open caveats; neither blocks the milestone. Save document and IndexedDB schema versions remain 1; the local Supabase schema contains seven public tables.

Implementation followed the ordered, test-gated sequence in `memory-bank/implementation-plan.md`. That plan defined 37 base-game steps and every one passed its stated validation. It is now a completed record rather than a queue of work; post-milestone scope needs its own ordered, test-gated plan.

The post-milestone server milestone is in progress at the Step 34 implementation
gate. Steps 34–36 now have runnable local evidence: a custom-format public-schema
backup/restore drill, threshold-based health/error monitoring with a deliberate
failure test, and a real concurrent save-sync load benchmark. The leaderboard
display uses a read-only Edge Function boundary because
the browser may read public board columns but cannot select
`leaderboard_entries.user_id`; the UI formats the table's exact `GameNumber`
strings through the existing `formatAmount` authority and degrades to a
retryable offline state. Step 32 adds the server-only account audit timeline;
Step 33 now adds authenticated account deletion, audit anonymization, and a
30-day purge boundary. Step 31 and Step 32 remain implemented but await user
validation; Step 33's focused implementation gate is green. Step 37 still needs
the final server documentation/README close.

## Approved Direction

Role-based cat art now has an approved asset-only catalog contract under
`art-source/cat-role-catalog/`. Asset metadata uses `rarityTier` with the fixed
codes `N`, `R`, `SR`, `SSR`, and `UR`; this is deliberately distinct from the
numeric gameplay `level`. The existing 2×2, four-frame Step 32A unloader sheet
remains the runtime default and the `unloader:N` baseline. Asset presentation
uses 2×2/four-frame sheets for `N`/`R` and 4×2/eight-frame sheets for
`SR`/`SSR`/`UR`, with shared 128×128 cells and feet anchors. Mofy is the first
SSR 4×2 example at 8×110 ms; the extra poses are presentation-only. No catalog
resolver, runtime import, gameplay attribute, balance value, persistence field,
or schema version change is authorized in this phase.

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
- `entitlement-check` is the server-milestone Step 31 entitlement boundary.
  The `entitlements` table and its own-row SELECT/no-write RLS matrix already
  landed in Step 3, so Step 31 adds no migration. The function verifies the
  bearer token with GoTrue, reads only active rows through the caller-scoped
  Supabase client, and derives the server-owned
  `cosmetic.supporter_badge` → `effects.supporterBadge` flag. It never reads
  `SUPABASE_SERVICE_ROLE_KEY`; only server-side grant code may write the table.
  `index.test.ts` covers the pure handler and
  `tests/server-integration/entitlement-check.integration.test.ts` proves
  direct client INSERT refusal, server-role visibility, and revocation against
  the real local stack.
- `account_audit` is the server-milestone Step 32 boundary. The table and its
  no-client-policy RLS matrix are created by
  `20260919100000_account_audit_log.sql`; database triggers cover identity
  changes, recovery issuance, entitlement changes, and save rejection. The
  `recovery-code` function appends a redemption only after session minting
  succeeds through the service-only `record_account_audit_event` RPC. The
  account link is `on delete set null` for Step 33 anonymization, and the
  server-authored detail object never stores a code, identity payload, email,
  or access token. The identity-removal trigger uses a null link when
  `auth.users` deletion has already removed the parent, so it cannot block the
  cascade.
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
- A 2026-09-16 CI finding: `npm run verify:server` passes locally and failed on
  the GitHub Actions `server` job with undici's `TimeoutError: The operation
  was aborted due to timeout` (Chromium says "signal timed out", so the failing
  call was a Node-side `fetch`). Nothing is configured differently in CI — the
  asymmetry is the edge runtime's module cache. Four functions import
  `npm:@supabase/supabase-js@2.116.0`, and a runner resolves it from an empty
  cache on the first request to each function while a developer's container is
  warm from earlier runs; the runner also has 4 vCPU shared by the whole stack,
  16 Vitest files and 2 Playwright workers. Every timing-sensitive call carried
  a hard budget and no retry against that one slow first response.
  **The CI log then narrowed it further, and contradicted the cold-start
  hypothesis for the one test that actually failed.** The job's only red test
  was `recovery-code.integration.test.ts`'s throttle test, and it died on its
  *first* iteration — 20171 ms, one request spending the whole 20 s budget —
  after that same file had already served roughly ninety requests. A warm
  worker stalling is contention, not a cold start: 16 Vitest files run in
  parallel (Vitest's default `maxWorkers` is the CPU count) against one
  edge-runtime container on 4 vCPU shared with Postgres, GoTrue and Kong. The
  cold-start reading survives only for the `beforeAll(resetRateLimitBucket)`
  hook and the `hookTimeout` default below. Four fixes, recorded here because
  each one's reason is invisible from the code alone.
  **`scripts/warm-edge-functions.mjs`** warms every function once, with its own
  retry budget, before any suite runs, called by `scripts/verify-server-stack.mjs`
  between the portability check and `test:server-integration`; the function list
  is read from `supabase/functions/` (`_shared` excluded), so a seventh function
  extends the pass with no list to edit. Its probe is a refused `DELETE` on an
  unrouted path, **not** the CORS preflight F11 describes: the local Kong
  gateway answers `OPTIONS` itself (synthesised `Access-Control-Allow-Origin: *`,
  `Server: kong/2.8.1`, no function envelope, 0-4 ms), so a preflight proves the
  gateway is up and never boots a worker — F12's gateway finding, one step
  further — while a refusal from the router's default branch proves exactly what
  a warm-up needs and, for `recovery-code`, answers long before `handleRedeem`
  touches the shared rate-limit bucket. **`tests/server-e2e/cloudSaveFixture.ts`**
  replaces the two specs' bare `AbortSignal.timeout(5_000)` cloud-save reads,
  which were 4× tighter than every other budget here *and* called inside
  `expect.poll(..., { timeout: 20_000 })` — Playwright evaluates a poll's
  callback outside its own try/catch, so a thrown `TimeoutError` escaped the
  poll and failed the test instantly while its 20 s budget was untouched.
  **`vitest.server-integration.config.ts`** now sets `hookTimeout: 30_000`: it
  had only `testTimeout`, leaving Vitest's 10 s default below the 20 s the
  suite's own `fetch` calls declare — the same bug that file's own comment
  already records for `testTimeout` (2026-09-12) — and `recovery-code` was the
  one function no warm-up covered, so `beforeAll(resetRateLimitBucket)` was the
  run's first request to it: one shot, no retry. **`tests/server-integration/transientFetchFixture.ts`**
  is the fourth, and the one the CI log actually indicted: a burst attempt that
  tolerates a transient stall. `recovery-code.integration.test.ts`'s two burst
  loops exist to observe that repeated redemption attempts eventually answer
  `429`; they called `redeemCode` bare, so a stalled request threw out of the
  loop and killed the test on its first iteration. Each attempt now fails fast
  and retries once when **no** response arrived at all, keeping the 20 s
  per-attempt budget and the 45-attempt bound unchanged, and resolves `null`
  rather than throwing — `null` is skipped, never recorded as a status, so
  `sawRateLimited` can only ever be set by a real `429` (the distinction AC16
  protects). Each fix is covered by a unit test that drives its logic with an
  injected `fetch` (`tests/unit/edge-function-warmup.test.ts`,
  `tests/unit/server-e2e-fetch-budgets.test.ts`,
  `tests/unit/server-integration-fetch-retry.test.ts`), plus `server-stack.test.ts`
  assertions pinning the hook budget against the suite's declared per-request
  budgets, the warm-up's position in the run order, and source-level scans that
  a sub-10 s per-attempt budget cannot reappear under `tests/server-e2e/`, and
  neither burst loop can go back to a bare `redeemCode` call, without a retry
  loop around it. **The worker-restart question is unresolved, and is recorded
  as such rather than asserted either way:** the review asked whether the edge
  runtime evicted and restarted the worker mid-burst, which would also explain a
  bucket that silently resets. That is a CI-runner container's log, and this
  sandbox has no access to it; the local container had already been torn down by
  another `supabase stop` by the time it was asked, so no evidence either way
  exists here. The fix does not depend on the answer — a restarted worker only
  makes `sawRateLimited` slower to reach, never unreachable, inside the
  45-attempt bound. **The optional suite-wide parallelism cap was declined,
  deliberately.** `maxWorkers: 2`/`fileParallelism: false` was offered as a
  broader mitigation for the contention. Local timings (warm 10-core Mac,
  `supabase db reset` before each) are unusable as evidence: default parallel
  3.4 s, `maxWorkers=2` 23.0 s, `fileParallelism=false` 13.8 s — non-monotonic,
  because the capped runs were measuring a rate-limit window rather than worker
  contention, and this is the one machine that cannot reproduce a 4-vCPU
  runner's contention in the first place. Reshaping the suite on data that
  cannot see the effect would be tuning by guess — the thing design constraint
  2 of this task warns against — and the call-site retry plus the warm-up pass
  already cover the failure that was observed. If CI stalls recur despite both,
  the cap is the next lever, and should be adopted from runner evidence rather
  than from these numbers.
- Server-milestone Step 10 flips `enable_manual_linking` from `false` to
  `true` in `supabase/config.toml` and adds `[auth.external.google]`
  (`client_id = "env(GOOGLE_CLIENT_ID)"`, `secret = "env(GOOGLE_CLIENT_SECRET)"`).
  Manual linking is required: Supabase refuses `linkIdentity()` with "Manual
  linking is disabled" while it is `false`, and `linkIdentity()` — not
  `signInWithOAuth()` — is what keeps the same `auth.users` id when a guest
  session already exists, which is the step's core requirement.
  `src/platform/web/googleSignIn.ts`'s `beginGoogleSignIn` picks between the
  two based on whether `getSession()` already returns a session, mirroring
  `guestSession.ts`'s injected-collaborator, never-throws shape, faked by
  `tests/unit/google-sign-in.test.ts` rather than mocking the SDK;
  `signOutOfSession` wraps `signOut()` the same way. Linking an identity
  already claimed by a different account fails with "Identity is already
  linked to another user" — surfaced as a typed `error` result and
  deliberately left unresolved; that collision belongs to Step 13.
- `config.toml`'s `env(...)` substitution is read by the Supabase CLI itself
  and only auto-loads a file literally named `.env` at the project root, not
  `.env.local` — `supabase start`/`stop`/`reset` have no flag to point it
  elsewhere. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` therefore live in a
  second, separate git-ignored `.env` file (already covered by `.gitignore`'s
  existing `.env`/`.env.*` rules), documented in `.env.example` alongside the
  exact Google Cloud Console setup — a Web application OAuth client with
  `http://127.0.0.1:54321/auth/v1/callback` (the fixed local GoTrue callback)
  as its redirect URI, needing no domain.
- The production player-facing entry point is the settings control beside the
  HUD income value. It opens `src/ui/AccountSettingsModal.ts`, which shows
  account status/email/user id, app version, Google login for guests, and
  logout-and-reset for linked accounts. Auth effects remain injected from
  `src/main.ts`; the DEV-only `window.catMineIdleAccount` hook remains for
  guided verification and collision diagnostics. A real human completing
  Google's own consent screen is still the one thing nothing local can
  substitute for, so the same-user-id proof remains a guided manual check.
- `tests/unit/server-stack.test.ts` gained two static-source assertions
  pinning `enable_manual_linking = true` and the `[auth.external.google]`
  block, plus `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in the "declares the
  server-only names" `.env.example` check — no Docker needed for any of them.
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
- Save schema version 2 is a strict plain-JSON document with exactly `schemaVersion`, `savedAtTimestampMs`, `effectiveProductionRatePerSecond`, and `state`. `state` contains version/timing counters, serialized gold, exactly fifteen configured floor records, elevator state, and warehouse state (including `totalOfflineGoldClaimed`, added in version 2). Every `GameNumber` is a finite decimal/scientific string. Validation rejects unknown properties, missing/unsupported versions, unsafe or inconsistent timestamps, invalid counters/progress, non-positive levels/capacities, unknown/reordered/missing floors, broken unlock order/gates, locked-floor production, negative quantities, transported totals above extracted totals, mismatched level-derived capacities, and active progress without corresponding material. Migration dispatch upgrades a version-1 document to version 2 by defaulting `totalOfflineGoldClaimed` to `"0"`, then expands a valid legacy four-floor prefix with locked defaults for floors 5–15; runtime deserialization follows strict validation before restored state can enter the game.
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
- `src/game/layout/` is pure Phaser-free geometry and palette data, so `tests/unit/layout.test.ts` and the Playwright layout spec both import the `src/game/layout` barrel without loading Phaser. `eslint.config.mjs` enforces that purity for `src/game/layout/**` (no `document`/`window`/`navigator`, no `phaser` import) and `tests/unit/architecture.test.ts` probes the rule. It exports the 360×640 constants, `calculateMineLayout`, `calculateMineContentHeight`, `calculateFloorSlotRegion`, `regionContainsPoint`, `assertTouchTargetRegion`, and `serializeRegion`, and rejects non-finite/non-positive dimensions, heights below 488 logical pixels, invalid floor counts, negative floor indexes, and interactive regions below 44×44.
- The portrait layout tiles `hud` (`0,0,360,52`), `surface` (`0,52,360,164`), `mine` (`0,216,360,366`), and fixed `bottomNavigation` (`0,582,360,58`) with no gaps. The five code-native navigation illustrations are a treasure chest, storefront, bolt, cat-manager badge, and folded map. Each complete visible control uses a child container at scale `0.6`, while the interactive parent remains 48×44 for standard controls and 62×50 for the wider, raised Boost. Every hit region is therefore at least 44×44, and presses animate the visual child without shrinking input coverage or issuing a core command. The initial five edge-to-edge 288×132 floor slots plus vertical content padding produce 680 logical pixels of mine content, so the mine area scrolls by 314; the content height expands at the 10-floor and 15-floor reveal gates. The elevator shaft is 64 px wide with a 62 px cabin, 50 px cargo cat, and no floor plaques; its 192×528 source artwork is a 64×1,980 `TileSprite` with tile scale `(1/3, 1)`, so it repeats at native vertical resolution instead of blurring through full-depth stretching. Adjusted shaft inset/gap/right inset preserve the floor width. `MIN_TOUCH_TARGET_PX` is 44 and `assertTouchTargetRegion` rejects anything smaller.
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
| `schemaVersion` | Integer exactly `2`. A version-`1` document is upgraded by the migration dispatcher, which defaults `state.warehouse.totalOfflineGoldClaimed` to `"0"`. |
| `savedAtTimestampMs` | Non-negative safe integer, at least `state.lastUpdateTimestampMs`. |
| `effectiveProductionRatePerSecond` | Non-negative finite numeric string. |
| `state.saveVersion` | Integer exactly `1`. |
| `state.lastUpdateTimestampMs` | Non-negative safe integer. |
| `state.simulationTick` | Non-negative safe integer. |
| `state.simulationRemainderMs` | Finite number in `[0, 100)`. |
| `state.gold` | Non-negative finite numeric string. |
| `state.floors` | Exactly fifteen configured, ordered floor objects. A legacy four-floor prefix (arriving as version 1 or 2) is expanded to locked defaults for floors 5–15 before validation. |
| `state.floors[].id`, `floorNumber` | Exact configured identifier and sequential integer. |
| `state.floors[].isUnlocked`, `mineShaftLevel` | Boolean plus positive safe integer; floor one stays open and deeper unlocks are sequential/gated. |
| `state.floors[].extractionProgress` | Finite number in `[0, 1)`; zero while locked. |
| `state.floors[].materialQueue`, `totalExtracted`, `totalTransported` | Non-negative finite numeric strings; locked values are zero and transported cannot exceed extracted. |
| `state.elevator.level`, `capacity` | Positive safe integer plus positive finite numeric string matching the configured level effect. |
| `state.elevator.roundRobinCursor`, `transitProgress`, `carriedMaterial` | Signed route cursor integer in `[-15, 15)` (non-negative downward target, negative upward origin), progress in `[0, 1)`, non-negative finite numeric string; empty travel may retain positive progress. |
| `state.warehouse.level`, `capacity` | Positive safe integer plus positive finite numeric string matching the configured level effect. |
| `state.warehouse.inputQueue`, `conversionProgress`, `totalGoldDelivered` | Non-negative finite numeric strings around progress in `[0, 1)`; empty input requires zero progress. |
| `state.warehouse.totalOfflineGoldClaimed` | Non-negative finite numeric string; lifetime `claimOfflineReward` grants. Monotonic and in the save-conflict progress vector; absent in version 1, defaulted to `"0"` on migration. |

Production-only services, when justified, are Node.js/Fastify, PostgreSQL, and optional Redis. The MVP should remain client-only.

## Complete Database Schema

**Relational/server database schema — landed in the local Supabase stack.**
Server-milestone Step 3 designed the schema below on 2026-09-08; Step 4 stood up
the local Supabase stack; Step 5 landed it on 2026-09-08 as
`supabase/migrations/20260908130000_create_platform_tables.sql`, applied after
Step 4's bootstrap migration
(`supabase/migrations/20260908120000_bootstrap_platform_requirements.sql`, which
creates nothing — it only asserts the PostgreSQL 13+ premise this block relies on
for `gen_random_uuid()`). The original six tables, the Step 32
`account_audit` table, and Step 33's anonymization/retention columns and
deletion functions, with the row-level-security policies in the matrix
below, exist in the local development database after `supabase db reset`;
**no deployed database contains them**, because no deployment exists yet. This
block and its twin in the other document are
byte-identical by construction and must be changed together, in the same change
as every future migration, exactly as `AGENTS.md` requires.

Full protocol context is in `memory-bank/server-save-sync-protocol.md`; the
threat model and recorded defaults it obeys are in
`memory-bank/server-threat-model.md`.

### How a `GameNumber` is stored

Three rules, and they differ by location.

1. **Inside a save document, nothing changes.** `GameNumber` values stay
   serialized decimal/scientific strings inside the document text, exactly as
   the version-2 save schema already defines them. The server neither reformats
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

-- Server-milestone Step 9: creates the row `profiles` has no insert policy
-- for. `security definer` lets it run as the function's owner (`postgres`,
-- which owns `profiles` and so bypasses its RLS) rather than as
-- `supabase_auth_admin`, the role that actually performs the `auth.users`
-- insert and holds no privilege on `public.profiles` at all.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

-- Server-milestone Step 14 review finding (2026-09-12): rotating a code was
-- a revoke `update` followed by a separate `insert` — two independent,
-- non-transactional PostgREST requests. An insert failure after a
-- successful revoke stranded a user with no active code. Wrapping both
-- statements in one `plpgsql` function makes them one transaction.
--
-- This does not mean Postgres serializes two concurrent `generate` calls
-- for the same user into a well-ordered queue (a 2026-09-13 correction —
-- the migration's own comment originally overstated this): both
-- transactions' revokes can still clear the same predicate before either
-- commits, and both then race their own insert. `recovery_codes_one_active_per_user_idx`
-- is what makes that race safe — the loser's insert raises `23505`, and
-- because the revoke and insert share one transaction, that failure rolls
-- the loser's revoke back too.
create function public.rotate_recovery_code(p_user_id uuid, p_code_hash text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.recovery_codes
  set revoked_at = now()
  where user_id = p_user_id
    and redeemed_at is null
    and revoked_at is null;

  insert into public.recovery_codes (user_id, code_hash) values (p_user_id, p_code_hash);
end;
$$;

-- Server-milestone Step 14 review finding (2026-09-13): a `generate` landing
-- in the narrow window between a failed session mint and
-- `revertRecoveryCodeRedemption` running could leave the account holding a
-- fresh active code by the time the revert executes — a plain `update`
-- would then try to revive the just-spent code as a *second* active row,
-- colliding with `recovery_codes_one_active_per_user_idx`. This function
-- checks for that fresher code first and no-ops instead of raising an
-- avoidable constraint violation in the common case — though the check and
-- the write are not atomic with each other, so a `generate` committing in
-- the narrow gap between them can still make the `update` itself raise the
-- identical `23505`; `handleRedeem`'s own try/catch around this call stays
-- for exactly that reason, and the outcome is safe either way.
create function public.revert_recovery_code_redemption(p_code_hash text) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.recovery_codes where code_hash = p_code_hash;

  if v_user_id is null then
    return;
  end if;

  update public.recovery_codes
  set redeemed_at = null
  where code_hash = p_code_hash
    and revoked_at is null
    and not exists (
      select 1
      from public.recovery_codes existing
      where existing.user_id = v_user_id
        and existing.redeemed_at is null
        and existing.revoked_at is null
    );
end;
$$;

-- Server-milestone Step 14 review finding (2026-09-13, optional hardening):
-- both RPCs above are `security invoker` with Postgres's default execute
-- grant to `public`. `recovery_codes` RLS (no policy at all) already makes
-- them inert for `anon`/`authenticated`; this closes it at the grant layer
-- too. `revoke ... from public` alone is not enough — Supabase's own
-- bootstrap grants execute to `anon`/`authenticated`/`service_role`
-- individually when a function is created, not merely through `public` —
-- and `service_role` is not a superuser locally, so it needs its own
-- explicit re-grant.
revoke execute on function public.rotate_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.rotate_recovery_code(uuid, text) to service_role;

revoke execute on function public.revert_recovery_code_redemption(text) from public, anon, authenticated;
grant execute on function public.revert_recovery_code_redemption(text) to service_role;

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

-- -------------------------------------------------------- account_audit --
create table public.account_audit (
  id          bigint      generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type  text        not null,
  user_id     uuid            null references auth.users(id) on delete set null,
  actor_type  text        not null,
  anonymized_at timestamptz null,
  retention_until timestamptz null,
  detail      jsonb           null,
  constraint account_audit_event_type_known
    check (event_type in (
      'identity_added',
      'identity_removed',
      'recovery_code_issued',
      'recovery_code_redeemed',
      'entitlement_granted',
      'entitlement_revoked',
      'save_rejected'
    )),
  constraint account_audit_actor_type_known
    check (actor_type in ('user', 'server', 'auth')),
  constraint account_audit_anonymization_pair
    check (
      (user_id is not null and anonymized_at is null and retention_until is null)
      or (
        user_id is null
        and anonymized_at is not null
        and retention_until is not null
        and retention_until >= anonymized_at
      )
    ),
  constraint account_audit_detail_object
    check (detail is null or jsonb_typeof(detail) = 'object'),
  constraint account_audit_detail_size
    check (detail is null or octet_length(detail::text) <= 4096)
);

create index account_audit_user_time_idx
  on public.account_audit (user_id, occurred_at desc);

create index account_audit_event_time_idx
  on public.account_audit (event_type, occurred_at desc);

create index account_audit_retention_idx
  on public.account_audit (retention_until)
  where user_id is null;

alter table public.account_audit enable row level security;

revoke insert, update, delete on public.account_audit from service_role;
grant select on public.account_audit to service_role;
grant insert (event_type, user_id, actor_type, detail)
  on public.account_audit to service_role;

create function public.record_account_audit_event(
  p_event_type text,
  p_user_id uuid,
  p_actor_type text,
  p_detail jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_audit (event_type, user_id, actor_type, detail)
  values (p_event_type, p_user_id, p_actor_type, p_detail);
end;
$$;

revoke execute on function public.record_account_audit_event(text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_account_audit_event(text, uuid, text, jsonb)
  to service_role;

create function public.audit_auth_identity_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_account_audit_event(
      'identity_added',
      new.user_id,
      'auth',
      jsonb_build_object('provider', new.provider)
    );
    return new;
  end if;

  perform public.record_account_audit_event(
    'identity_removed',
    case
      when exists (select 1 from auth.users where auth.users.id = old.user_id)
        then old.user_id
      else null
    end,
    'auth',
    jsonb_build_object('provider', old.provider)
  );
  return old;
end;
$$;

create trigger auth_identity_account_audit
  after insert or delete on auth.identities
  for each row execute function public.audit_auth_identity_change();
create function public.anonymize_account_audit_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deletion_at timestamptz := pg_catalog.clock_timestamp();
begin
  update public.account_audit
  set user_id = null,
      anonymized_at = deletion_at,
      retention_until = deletion_at + interval '30 days',
      detail = null
  where user_id = old.id;
  return old;
end;
$$;

create trigger auth_user_account_audit_anonymization
  before delete on auth.users
  for each row execute function public.anonymize_account_audit_before_user_delete();

create function public.audit_recovery_code_issued() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_account_audit_event(
    'recovery_code_issued',
    new.user_id,
    'user',
    null
  );
  return new;
end;
$$;

create trigger recovery_code_issued_account_audit
  after insert on public.recovery_codes
  for each row execute function public.audit_recovery_code_issued();

create function public.audit_entitlement_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_account_audit_event(
      'entitlement_granted',
      new.user_id,
      'server',
      jsonb_build_object(
        'entitlementKey', new.entitlement_key,
        'source', new.source
      )
    );
    return new;
  end if;

  if old.revoked_at is null and new.revoked_at is not null then
    perform public.record_account_audit_event(
      'entitlement_revoked',
      new.user_id,
      'server',
      jsonb_build_object('entitlementKey', new.entitlement_key)
    );
  elsif old.revoked_at is not null and new.revoked_at is null then
    perform public.record_account_audit_event(
      'entitlement_granted',
      new.user_id,
      'server',
      jsonb_build_object(
        'entitlementKey', new.entitlement_key,
        'source', new.source
      )
    );
  end if;
  return new;
end;
$$;

create trigger entitlement_change_account_audit
  after insert or update of revoked_at on public.entitlements
  for each row execute function public.audit_entitlement_change();

create function public.audit_rejected_save() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.outcome = 'rejected' then
    perform public.record_account_audit_event(
      'save_rejected',
      new.user_id,
      'user',
      jsonb_build_object(
        'errorCode', new.error_code,
        'baseRevision', new.base_revision,
        'documentBytes', new.document_bytes
      )
    );
  end if;
  return new;
end;
$$;

create trigger rejected_save_account_audit
  after insert on public.save_audit
  for each row execute function public.audit_rejected_save();
create function public.delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deletion_at timestamptz := pg_catalog.clock_timestamp();
begin
  if p_user_id is null then
    raise exception 'account deletion requires a user id';
  end if;
  update public.account_audit
  set user_id = null,
      anonymized_at = deletion_at,
      retention_until = deletion_at + interval '30 days',
      detail = null
  where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke execute on function public.delete_account(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

create function public.purge_expired_account_audit(
  p_before timestamptz default pg_catalog.clock_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
begin
  delete from public.account_audit
  where user_id is null
    and retention_until is not null
    and retention_until <= p_before;
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke execute on function public.purge_expired_account_audit(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_expired_account_audit(timestamptz)
  to service_role;
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
| `saves` | `document_json` | text | no | — | ≤ 65536 bytes; exact serialized `SaveDocumentV2` |
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
| `account_audit` | `id` | bigint | no | identity | PK, generated always |
| `account_audit` | `occurred_at` | timestamptz | no | `now()` | database-owned event time |
| `account_audit` | `event_type` | text | no | — | one of the seven Step 32 event types |
| `account_audit` | `user_id` | uuid | yes | — | FK → `auth.users(id)` on delete set null; affected account |
| `account_audit` | `actor_type` | text | no | — | `user`, `server`, or `auth` |
| `account_audit` | `anonymized_at` | timestamptz | yes | — | set at deletion; paired with `retention_until` |
| `account_audit` | `retention_until` | timestamptz | yes | — | exactly 30 days after anonymization; purge boundary |
| `account_audit` | `detail` | jsonb | yes | — | server-authored object, ≤ 4096 bytes; no credentials or identity payload |

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
| `account_audit_user_time_idx` | `account_audit` | `(user_id, occurred_at desc)` | Per-account investigation and deletion/anonymization work. |
| `account_audit_event_time_idx` | `account_audit` | `(event_type, occurred_at desc)` | Event-type investigation and future operational alerts. |
| `account_audit_retention_idx` | `account_audit` | `(retention_until) where user_id is null` | Efficient scheduled purge after the 30-day retention window. |

### Row-level security

RLS is **enabled on every table**. Anything not listed is denied. The service
role used by Edge Functions bypasses RLS and is the only writer anywhere in this
schema.

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | own row | none — created by the `on_auth_user_created` sign-up trigger (Step 9) | own row | none |
| `saves` | own row | **none** | **none** | **none** |
| `save_audit` | none | none | none | none |
| `recovery_codes` | none | none | none | none |
| `leaderboard_entries` | all rows, every column but `user_id` | none | none | none |
| `entitlements` | own row | none | none | none |
| `account_audit` | none | none | none | none |

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

Every table holds exactly one foreign key to `auth.users(id)`. The ordinary
account-owned tables use `on delete cascade`; `account_audit.user_id` uses
`on delete set null` so Step 33 can anonymize the affected-account link while
retaining a bounded operational record. There are no other relationships.

**Invariant for every future table:** it must carry a foreign key to
`auth.users(id)` and declare whether deletion cascades or anonymizes the link
in the same change. Step 33's test enumerates the tables, so one added without a
deletion path fails it.

Consequence recorded rather than discovered later: `save_audit` rows cascade
away with the account, so deleting an account also erases the evidence of abuse
from it. That is the right default while no money is at stake and GDPR is
assumed to apply, and it is a trade, not an oversight.

`account_audit` is the explicit exception: account deletion nulls `user_id`,
scrubs `detail`, records `anonymized_at`, and retains the row until
`retention_until`, exactly 30 days later. The `delete_account(uuid)` and
`purge_expired_account_audit(timestamptz)` functions are executable only by
`service_role`; a `before delete` trigger on `auth.users` also protects
operator/admin deletion paths that bypass the Edge Function.

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

- The Step 32 account audit log was not designed in Step 3. Step 32 now defines
  it as a separate table; merging it with `save_audit` would put frequent save
  rows and rare identity events in one table with opposing access patterns.
- Step 33 deletion/anonymization and the 30-day retention purge were not
  designed in Step 3. The forward-only
  `20260919110000_account_deletion.sql` migration adds them without editing
  the already-applied Step 32 migration.
- The leaderboard metric, reset period, and tie-break were left open here on
  purpose — decided in Step 27 (`## Server Stack Contract`'s "Leaderboard
  storage (Step 27)" section): lifetime gold earned, no reset (one board,
  `board_key = 'lifetime-gold'`), tie-break by ascending `updated_at`. No
  table, index, or RLS change was needed to decide them — a season or period
  is a `board_key` value, not a schema change, exactly as designed here.
- Rate-limit counters — Step 25, which may use platform facilities rather than
  tables.
- `offlineGrant` and anything Step 22 needs beyond `received_at`, which already
  anchors it.

**IndexedDB database:** `cat-mine-idle`, schema version `1`.

| Object store | Field | Type | Required / nullable | Key / constraint |
|---|---|---|---|---|
| `saves` | `id` | string | Required, non-null | Primary key via key path `id`; application writes only the literal `active`. |
| `saves` | `document` | structured-clone-compatible `SaveDocumentV2` object | Required, non-null | Must pass migration and validation before runtime deserialization. |

The store has no auto-increment key, secondary indexes, foreign keys, relationships, or additional records by design. `put({ id: 'active', document })` replaces the prior snapshot, enforcing one logical active save. Dexie database version 1 creates `saves` with schema string `id`; no IndexedDB structural migration exists. At the document layer, a legacy version-1 save (including the former four-floor prefix, expanded to fifteen floors before validation, with floors 5–15 initialized as locked defaults) is migrated to version 2 by defaulting `warehouse.totalOfflineGoldClaimed` to `"0"`; the IndexedDB database version remains `1`.

**Synchronous lifecycle journal:** localStorage key `cat-mine-idle:lifecycle-save-v1`.

| Key | Value | Lifetime / relationship |
|---|---|---|
| `cat-mine-idle:lifecycle-save-v1` | JSON string encoding one validated `SaveDocumentV2` | Written synchronously only at hidden/pagehide boundaries; considered only when newer than the valid IndexedDB record; removed after the same-or-newer document commits to IndexedDB. |

The journal introduces no new save schema version and is not a second progression store. Malformed or unsupported journal values are discarded and never override a valid IndexedDB snapshot.

## Verified Commands

- `npm run backup:restore`: passed 2026-09-19; real custom dump 35,888 bytes,
  seven public tables and matching row counts, 60 ms backup, 105 ms restore,
  2,833 ms total including scratch-container startup.
- `npm run monitor:check -- --input tests/fixtures/monitoring-healthy.json`:
  passed; the deliberately failed fixture exits `2` with health, error-rate,
  save-rejection-rate, and auth-failure alerts.
- `npm run load:server`: passed 2026-09-19 at 20 concurrent players × 3
  rounds: 60 uploads, p95 238 ms, 48.48 uploads/second, and 49 ms for the
  7,200,000 ms long-absence re-simulation; budgets are asserted by the script.

- `npm run dev`: verified by starting Vite at `127.0.0.1:5173`, receiving the application HTML over HTTP, and terminating the server cleanly.
- `npm run build` (`tsc --noEmit` plus Vite production build)
- `npm run test`: 670 tests pass, including the fifteen-floor configuration, legacy four-floor save expansion, progressive visibility, scroll resizing, unavailable-journal fallback, lifecycle recovery, exact shaft/elevator/warehouse x1/x5/MAX batch quoting, fixed-step miner-progress interpolation, the ten-minute fractional-transport save-invariant regression, the core/Deno architecture-boundary probe and the pinned ten-minute core-portability fixture (Step 6), and — Step 7 — `tests/unit/server-stack.test.ts`'s Retry-After assertion updated to read the response envelope from its new home in `_shared/http.ts`, its "never reads the service-role key" and `config.toml` `verify_jwt` checks generalized to `it.each` loops over every directory under `supabase/functions/` rather than hardcoding `save-sync` (a 2026-09-09 review finding). Step 8 added `tests/unit/guest-session.test.ts` (`createSupabaseClient`'s null-when-unconfigured behavior; `ensureGuestSession` reusing a session including a linked non-anonymous one, defaulting `isAnonymous` to `false` when absent, signing in fresh, and never throwing on a fake `GuestAuthClient`'s rejection) and flipped `tests/unit/server-stack.test.ts`'s two `@supabase/supabase-js` pin assertions from `devDependencies` to `dependencies`, plus added `test:server-e2e` to its documented-commands list (a 2026-09-09 Step 8 review finding). A third Step 8 review pass added `describe('the guest-session bootstrap in src/main.ts')` — three static-source assertions (the chain is never awaited before boot, a `.catch` sits between its two `.then`s, and the DEV diagnostic is published through `toPublicGuestSessionDiagnostic` rather than stringifying the raw result with its access token). They are static because `src/main.ts` is a module of top-level side effects no unit test can import, and because the only behavioural test of that contract — the production-smoke lazy-chunk spec — can run solely against a build with Supabase configuration inlined, which CI has not; the same static-beside-behavioural pattern a Step 7 review established for `resolveCallerViaSupabaseAuth`. Step 10 added `tests/unit/google-sign-in.test.ts` (`beginGoogleSignIn` links to an existing session and starts a fresh OAuth sign-in when there is none, both branches confirmed by which collaborator was and was not called and by the `redirectTo` option passed through; a failure of the pre-redirect "issue an authorize URL" request — e.g. rate limiting, not Google's real identity-collision, which cannot surface through this promise at all — resolves typed rather than throwing; `signOutOfSession` mirrors the same never-throws contract) and `tests/unit/server-stack.test.ts` static assertions pinning `enable_manual_linking = true`, the `[auth.external.google]` block, and (added in the 2026-09-10 review below) that the `DEV` account hook carries its own `.catch` and passes `window.location.origin` as `redirectTo`. A 2026-09-10 review of Step 10 found and fixed four issues: the account hook's `.catch` was missing (a second independent consumer of `supabaseClientPromise` reintroducing Step 8's own already-fixed unhandled-rejection class, DEV-only); `scan-bundle-secrets.mjs` never read the new `.env` file, so `GOOGLE_CLIENT_SECRET` had no exact-value guard, only the weaker name-level one — fixed by merging `.env` into the same check as `.env.local`, with `tests/unit/bundle-secret-scan.test.ts` gaining a dedicated `.env` describe block; the claim that Google's "identity already linked to another user" surfaces as this module's typed `error` result was wrong and is corrected throughout the Memory Bank — that conflict is discoverable only after the OAuth redirect returns, as `error_code=identity_already_exists` on the return URL, empirically confirmed during the review's own second live pass; and `describeError` was deduplicated into `src/platform/web/describeError.ts`, `GoogleAuthClient`'s unread session-user field was narrowed to `unknown`, the `declare global` block moved out from between two import statements, and `redirectTo: window.location.origin` was added so the OAuth return trip lands back on whichever origin actually started it rather than always `site_url` (`describeError` at the time lived at `src/platform/web/describeError.ts`; Step 12 moved it to `src/platform/describeError.ts`, see below). All four mutation-proven; the full client gate (422 unit tests, 51 E2E, build, secret scan, 10 production smoke) passes after the fixes. A follow-up review found a fifth issue inside the fourth fix's own test: the code built `{ provider: 'google', options: undefined }` while the test's title claimed the key was omitted entirely, and `toHaveBeenCalledExactlyOnceWith` is itself undefined-tolerant, so it passed under either shape — confirmed with a standalone Vitest probe first. Fixed both sides: the credentials object now genuinely omits `options` when no `redirectTo` is given, and the test reads `Object.keys()` off the real mock call to distinguish "absent" from "present but undefined"; mutation-proven in both directions. Steps 15–17 and 13 (2026-09-12) added 37 tests: `tests/unit/guest-upgrade-reconciliation.test.ts` (12 — `hasAnyProgress` true/false across every progress-vector field and false across every excluded transient one, `reconcileGuestUpgrade`'s four decision branches); `tests/unit/cloud-save-reconcile.test.ts` (11 — `reconcileCloudSaveAtBoot` against a faked repository/download/reload for every outcome including a device with no local record at all, and `downloadCloudSaveViaFetch` against a stubbed `fetch` for 204/200/non-ok); 10 more in `tests/unit/google-sign-in.test.ts` for `detectGoogleIdentityCollision`/`beginGoogleAccountSwitch`; and new `describe` blocks in `tests/unit/server-stack.test.ts` (the `save-sync` service-role exception, the Step 17 reconcile-trigger wiring in both boot chains, the Step 13 DEV-hook additions). Step 14 (2026-09-12) added 17 more: `tests/unit/recovery-code.test.ts` (13 — `generateRecoveryCode`/`redeemRecoveryCode` against a stubbed `fetch` and a faked auth collaborator, covering unconfigured/no-session/success/non-ok/rate-limited/invalid-code/verifyOtp-failure/rejected-collaborator for each) and more in `tests/unit/server-stack.test.ts` (the `recovery-code` service-role exception, the `RECOVERY_CODE_PEPPER` name check, and the DEV-hook wiring including that `redeemRecoveryCode` only calls `triggerCloudSaveReconcile()` when redemption actually succeeded). A same-day review of Step 14 added 3 more `tests/unit/server-stack.test.ts` assertions: rotation goes through the `rotate_recovery_code` RPC rather than a separate `.insert()`, with the migration's own DDL checked too; `revertRecoveryCodeRedemption`/`redeemed_at: null` appear in the function's source; and the rate limiter's `'unknown'` fallback bucket is gone in favor of `address: string | null`. A 2026-09-13 follow-up review added 3 more: the revert now goes through `revert_recovery_code_redemption` rather than a plain `.update()`, with that migration's own DDL checked too; the rate-limit sweep is gated by `RATE_LIMIT_PRUNE_SIZE_THRESHOLD` rather than running on every request; and the test-only rate-limit reset route is gated by `RECOVERY_CODE_TEST_RESET_TOKEN`, which `.env.example` documents. The same review added a `tests/unit/server-stack.test.ts` static assertion pinning that `main.ts`'s `reload` callback calls `unbindSaveLifecycle?.()` before `window.location.reload()` — mutation-proven (reverting the call fails the assertion by name) — the fix for a HIGH-severity Step 17 reload race (see `activeContext.md`). A follow-up pass on the same review added 4 more: `tests/unit/lifecycle-journal.test.ts` gained `WebLifecycleSaveJournal.clear()`'s two tests (unconditional discard, unlike `clearThrough` against an older timestamp; a no-op rather than a throw when storage is unavailable), and `tests/unit/cloud-save-reconcile.test.ts` gained two more proving `clearLifecycleJournal` is called exactly on an adopt outcome and never on any other — the fix for a LOW residual in the Step 17 reload fix (the unbind alone does not clear a journal entry already written earlier in the same session). A new `server-stack.test.ts` assertion also pins the optional grant-layer hardening (`20260913090200_recovery_code_rpc_grants.sql`). Step 18 (2026-09-13) replaced `tests/unit/guest-upgrade-reconciliation.test.ts` with `tests/unit/save-conflict-policy.test.ts` (18 tests after the same-day review below: `compareProgress` equal/dominance/fork plus every excluded transient field, `describeSaveConflictCandidate`'s §7.3 fields, `resolveSaveConflict`'s `same-progress`/dominance/`fork` branches, the malformed-floor-count guard, and offline-counter cases), added three `tests/unit/cloud-save-reconcile.test.ts` cases (same-progress, a local strict superset, and a fork retaining both candidates), a `tests/unit/save-schema.test.ts` version 1→2 migration test, and three `server-stack.test.ts` static assertions pinning the single shared predicate, its purity, and `main.ts`'s `pendingSaveConflict` retention. A same-day 2026-09-13 user review found five issues and the HIGH one took three attempts: a silent adopt could destroy a fresh capped offline reward (`claimOfflineReward` credited `gold` without moving any vector field). Two heuristic fixes were rejected (a `gold`-size comparison over-fired on purchases and broke the new-device restore; a lifetime-cumulative bound was dead after any spending because `gold` falls while the bound grows), and the structural fix completed the vector — `claimOfflineReward` now credits the new monotonic `warehouse.totalOfflineGoldClaimed`, which joins `M`, so `CURRENT_SAVE_SCHEMA_VERSION` bumps 1→2 with a migration defaulting it to `"0"`, and `resolveSaveConflict` carries no `gold` logic. Also fixed a MEDIUM unchecked floor-index that could throw on an unvalidated `409` body (now a `fork` guard) and three LOW items. Step 19 (2026-09-13) added the client remote repository: `tests/unit/cloud-save-replica.test.ts` (20 — §9 cadence and coalescing, forced bypass, bounded backoff and exhaustion, every §7 conflict branch including an unvalidated `409` body, and §11 arming so no upload runs before the boot download settles), `tests/unit/cloud-save-upload.test.ts` (18 — every §4 status mapped to the typed result, the `unauthenticated` refresh-once rule, and a dropped connection resolving retryable rather than throwing), `tests/unit/replicating-active-save-repository.test.ts` (7 — local-only load, local-write-first ordering, a failed local write still rejecting, and forced-trigger behavior), two added `tests/unit/cloud-save-reconcile.test.ts` cases for the new `onServerRevision` dep, five static assertions in `tests/unit/server-stack.test.ts`, and a core-network probe in `tests/unit/architecture.test.ts` banning `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource` from `src/core`. The 2026-09-16 cold-start fix added 35 more, all driving their target's logic with an injected `fetch` and no Docker: `tests/unit/edge-function-warmup.test.ts` (16 — the read-from-disk function list including a temp-tree "seventh function", retry-on-rejection, stop-at-first-response for any status, the attempt budget, and that the probe is a body-less, credential-less refusal with no `authorization` header); `tests/unit/server-e2e-fetch-budgets.test.ts` (8 — `readCloudSave`'s null-not-throw contract, its retry, its final-non-200 rule, an injected attempt budget and bearer header, plus the standing scan that no sub-10 s per-attempt budget under `tests/server-e2e/` lacks a retry loop); and `tests/unit/server-integration-fetch-retry.test.ts` (11 — `fetchToleratingStall`'s 429-on-retry, null-when-every-attempt-stalls, real-response-is-final, injected budget and per-attempt-signal cases, plus a source scan proving neither `recovery-code` burst loop can return to a bare `redeemCode`, that a never-answered attempt is skipped before it can be recorded, and that the 45-attempt bound is intact). Four new static assertions joined `tests/unit/server-stack.test.ts` (the `hookTimeout` floor, the warm-up's run-order position, the read-from-disk list, and `recovery-code`'s warm-up preceding its rate-limit reset).
- Server-milestone Step 11 (Apple sign-in) was cut on 2026-09-11 rather than
  implemented: it needs a paid Apple Developer Program membership, a
  verified real domain, and a deployed HTTPS return URL, none of which
  exist, and Apple accepts no `localhost` redirect at all — no local-dev
  escape hatch the way Google has. Offered the choice between acquiring
  those, building to spec with live verification deferred, or cutting the
  step outright, the user chose to cut it, exercising the contingency
  `server-threat-model.md` finding F7 already recorded. No code, config, or
  test exists for it.
- Server-milestone Step 12 (Telegram sign-in), implemented 2026-09-11.
  Unlike Steps 10–11, `initData` verification is self-contained
  HMAC-SHA256 that never contacts Telegram, so the step's full test —
  valid `initData` mints a session; tampered/stale/wrong-bot-token payloads
  are each rejected with none issued; the bot token never leaks — is
  provable against the real local stack with hand-signed fixture vectors,
  no real bot or Mini App host needed. `supabase/functions/telegram-sign-in/index.ts`'s
  `verifyTelegramInitData` matches Telegram's documented algorithm exactly
  (data-check-string excludes `hash`/`signature`, sorted `key=value` pairs
  joined by `\n`; `secret_key = HMAC_SHA256(key="WebAppData", data=botToken)`;
  `computed = hex(HMAC_SHA256(key=secret_key, data=dataCheckString))` must
  equal `hash`, constant-time compared; `auth_date` freshness defaults to
  86400 s, a documented convention, not a Telegram mandate), entirely on
  `crypto.subtle` so it runs unmodified on Deno. Session-minting uses the
  confirmed community pattern for a provider Supabase Auth has no
  first-class API for: `admin.generateLink({ type: 'magiclink', email })`
  (creates `auth.users` if absent) returns `properties.hashed_token`; the
  client calls `auth.verifyOtp({ token_hash, type: 'email' })` to complete a
  real, GoTrue-tracked session. No schema change: a Telegram user maps to
  the deterministic, RFC 2606-reserved placeholder email
  `telegram-<id>@telegram.invalid`, so `generateLink` finds-or-creates
  without a `profiles` column or migration — identity linking stays in
  `auth.users`, matching Steps 8 and 10. **This is only safe with
  `[auth.email] enable_signup = false`** (`supabase/config.toml`) — see
  finding F13 (`server-threat-model.md`) below: with public signup open, an
  attacker who knows a Telegram id can claim that placeholder email by
  password before the real user ever signs in, and `generateLink` would
  then hand the real user a session into the attacker's account.
- This is the first function `src/` calls directly with `fetch()` — finding
  F11's trigger (`server-threat-model.md`), actually tripped by Step 12, not
  Step 16/17 as F11 had guessed. `supabase/functions/_shared/http.ts` grew
  `corsHeaders`/`corsPreflightResponse` (allow-listing
  `http://127.0.0.1:5173`/`http://localhost:5173`, matching
  `additional_redirect_urls`) and `jsonResponse`/`errorResponse` grew an
  optional `origin` parameter; `memory-bank/server-save-sync-protocol.md`
  §14 records the policy per F11's own instruction. Proving it against the
  real stack surfaced finding F12: the local Kong gateway unconditionally
  overwrites every Edge Function's `Access-Control-Allow-Origin` with `*`
  when the request carries an `Origin` header — reproduced against
  `whoami-check`, which sets no CORS header of its own, and against a
  deliberately unlisted origin — so the origin restriction is correct and
  tested at the application layer but is not what a real browser calling
  the live *local* stack observes today; whether a real deployment's
  gateway behaves the same way is unverified.
- `src/platform/telegram/telegramSignIn.ts`: `readTelegramInitData()` reads
  `window.Telegram.WebApp.initData` (never `initDataUnsafe`), resolving
  `null` for every player today since no Telegram Web App `<script>` tag
  was added to `index.html` — that is the still-unbuilt Mini App host
  (finding F1), deliberately separate, later work. `signInWithTelegram`
  POSTs the raw `initData` and completes `verifyOtp` on success; same
  never-throws, typed-result shape as the other identity modules.
  `src/main.ts` computes `readTelegramInitData()` once at boot, before
  either identity chain: non-null calls `signInWithTelegram` **instead of**
  `ensureGuestSession` — "replaces the guest path entirely," not a linking
  flow — so `supabaseClientPromise` now has three independent consumers
  (Telegram, guest, the Step 10 DEV hook), and the Telegram chain carries
  its own `.catch` from the start, the lesson Step 10's own review already
  taught. `describeError` moved from `src/platform/web/` to
  `src/platform/describeError.ts`, shared by `web/` and the new
  `telegram/` sibling.
- `tests/unit/server-stack.test.ts`'s `extractMainBlock` helper replaced
  order-dependent `void supabaseClientPromise` occurrence-counting (broken
  by inserting a third consumer before the existing two) with anchor-string
  extraction, and gained a dedicated Telegram-bootstrap describe block plus
  a positive assertion that `telegram-sign-in` — and only it — reads
  `SUPABASE_SERVICE_ROLE_KEY`, the first function that legitimately needs
  it (`admin.generateLink`), exempted from the "never reads the
  service-role key" blanket check that file's own prior comment already
  anticipated a future function would need. `tests/server-integration/telegramInitDataFixture.ts`
  independently re-implements the signing algorithm with `node:crypto`
  (not Web Crypto) — a real, deployed function accepting a vector signed
  this way proves two independent implementations of the same published
  algorithm agree, not that one merely matches itself, the same principle
  `authFixture.ts` already established.
- A 2026-09-12 review found and fixed one critical issue and three smaller
  ones. **Critical, finding F13:** the placeholder-email mechanism above
  was pre-account-stealable — `[auth.email]` had `enable_signup = true`
  with `enable_confirmations = false`, so an attacker who knows a Telegram
  id could `POST /auth/v1/signup` with that exact `telegram-<id>@telegram.invalid`
  and a password of their own choosing before the real user ever signed in,
  and `generateLink` would then hand the real user a session into the
  attacker's account. Reproduced live end to end (attacker signup → 200;
  Telegram sign-in for the same id → the identical `auth.users` id;
  attacker password login afterward → still that id), independently
  confirmed, then fixed with `enable_signup = false` — nothing in this
  codebase calls `signUp`/`signInWithPassword`, and `admin.generateLink`/
  `verifyOtp` are admin/OTP paths this flag does not gate (confirmed live:
  the full server suite and the Telegram flow both still pass with it set).
  `tests/server-integration/telegram-sign-in.integration.test.ts` gained a
  test reproducing the exact attack attempt against the live stack; a
  static assertion in `tests/unit/server-stack.test.ts` needed its own
  fix first — an initial version's lazy regex crossed past `[auth.email]`
  into the unrelated, already-`false` `[auth.sms] enable_signup` further
  down the same file and so passed vacuously against a mutated flag, caught
  by mutation-testing the test itself before trusting it. **Medium:**
  `scan-bundle-secrets.mjs` still missed `supabase/functions/.env` — the
  most sensitive of the three env files it now covers, since
  `TELEGRAM_BOT_TOKEN` is the HMAC key signing every Telegram user's
  `initData` — fixed by merging it into the same exact-value check as
  `.env`/`.env.local`. **Minor:** `MintSessionResult`'s unread `reason`
  field was removed (nothing ever read it), and `verifyTelegramInitData`'s
  freshness check gained `Math.abs` so a future-dated (not just past-dated)
  payload is also caught. **Deliberately not changed:** the reviewer's note
  that a wrong method should answer `405`/`Allow` rather than `400
  malformed_request` — `save-sync/index.ts`'s own header comment already
  made 400 the deliberate, documented choice for exactly this case across
  every function reusing the save-sync protocol's vocabulary, which
  `server-save-sync-protocol.md` §1 says identity endpoints do too;
  introducing `405` here would be the actual inconsistency. All fixes
  mutation-proven.
- `npm run test:server-unit` (`deno test supabase/functions`): 100 tests pass across `_shared/http.test.ts` (including the CORS helpers, and — a 2026-09-12 Step 14 review finding — `corsPreflightResponse`'s `access-control-allow-headers` now asserted as `content-type, authorization`), `save-sync/index.test.ts` (health/routing plus, from Steps 16–17, `handleSaveUpload`/`handleSaveDownload` against an injected `SaveSyncDeps` covering every 401/413/400/422/409/200/204 branch — including, from a 2026-09-12 review, `writeSaveRow` resolving `false` to model a lost compare-and-swap race, which `handleSaveUpload` must turn into a re-read `409` rather than the `200` a blind write would have returned, and a dedicated `Content-Length`-declares-70000-over-a-2-byte-body case pinning that the size cap's pre-check — not only its post-read check — can independently answer `413` — 26 tests in the file total), `telegram-sign-in/index.test.ts` (Step 12 — `verifyTelegramInitData` against hand-signed valid/tampered/stale/future-dated/wrong-bot-token/malformed vectors, `handleTelegramSignIn` against every response shape with faked collaborators, and a defensive scan proving no response can carry the bot token), `whoami-check/index.test.ts` (Step 7), and `recovery-code/index.test.ts` (Step 14, 29 tests — `handleGenerate`/`handleRedeem` against an injected `RecoveryCodeDeps`: the code format and its canonicalization, the rate-limit check firing before the body is even read, malformed/wrong/already-redeemed codes all answering the identical generic `recovery_code_invalid`, the lost-compare-and-swap-race path answering the same code rather than a 500, a defensive scan proving no response can carry `RECOVERY_CODE_PEPPER`, and — the 2026-09-12 review's five fixes — that a failed mint triggers `revertRecoveryCodeRedemption` with the same canonical code (and that a 500 still answers even when the revert itself throws, and that a successful mint never reverts anything), and that `handleRedeem` passes `null` to `checkRedemptionRateLimit` when no `X-Forwarded-For` is sent but the *last* comma-separated hop when one is — plus, from the 2026-09-13 follow-up review, the new `POST /v1/test-only-reset-rate-limit` route answering the identical `malformed_request`/"Unknown route" shape an actually-unknown route gets when unauthorized, receiving `null` when no token header is sent, and clearing rate-limit state and answering `200` once authorized), every one with zero `--allow-*` permission flags. Needs no Docker and no database. A 2026-09-14 Step 19 review added one more: an older version-1 document is migrated and accepted rather than refused as `schema_unsupported`.
- `npm run test:server-integration` (`vitest run --config vitest.server-integration.config.ts`): 83 tests pass against the live local stack — 6 for `whoami-check` (Step 7: the seeded fixture guest's real `profiles.display_name` for a valid token, and 401 for no header / a syntactically invalid token / a wrong-secret-signed token / an expired token, plus 400 for a non-GET method), 7 for `profiles-rls` (Step 9), 8 for `telegram-sign-in` (Step 12, 7 original + the F13 regression test), 10 for `saves-rls` (Step 15 — select/insert/update/delete/upsert against real anonymous identities, one row seeded via a service-role client that mints its key at run time via `supabase status --output json`, never as a tracked-file literal), 11 for `save-upload` (Step 16 — first upload at revision 1, a second accepted upload advancing to revision 2, a stale-`baseRevision` upload refused `409` with the server's real document attached, malformed/oversized/unsupported-schema-version rejections, that the same token still cannot `PATCH saves` directly through PostgREST after a successful upload, and — a 2026-09-12 review finding proven live rather than only reasoned about — two genuinely concurrent `Promise.all`-issued uploads, both racing the same first write and both racing the same subsequent revision, each resolving to exactly one `200`/one `409` with the revision advancing exactly once, never twice and never zero), 5 for `save-download` (Step 17 — 204 for no cloud save, the step's own "new device restores it" test, the latest revision after a second upload, and cross-user isolation), 5 for `guest-upgrade-collision` (Step 13 — all three required flows, composing the real Step 16/17 endpoints with the real `resolveSaveConflict`; Step 18 rewrote its fork fixture to a genuine elevator-vs-warehouse fork since a one-axis superset now resolves silently), 7 for `save-conflict-resolution` (Step 18 — the step's own two-device test: a real `409` is resolved by §7 deterministically, a strict-superset save is adopted or re-uploaded without loss, equal progress adopts the server revision, a genuine fork destroys neither save, and a same-day-review regression proves an offline-gold claim on the behind device forces a fork instead of a silent adopt), and 18 for `recovery-code` (Step 14 — the full round trip restoring the identical `user.id` including the no-email pure-anonymous case, a code accepted with or without its display dashes, the stored row holding only a 64-character hex digest, a code redeeming exactly once, regeneration invalidating the prior code, wrong/malformed codes refused, direct PostgREST access still denied, the concurrent-redemption race resolving to exactly one winner, and throttling after enough repeated attempts — a 2026-09-12 review finding, confirmed live: the local gateway (Kong) always supplies its own trusted `X-Forwarded-For` hop whether or not the client sends one, so every request in this file shares one real address bucket rather than the file's old per-call synthetic addresses, and the throttle test loops with a generous bound instead of asserting an exact attempt count for that reason — plus, from a 2026-09-13 follow-up review: the test-reset route's own auth behavior and that it actually clears a throttled bucket; a genuine concurrent `generate`/`generate` race proving exactly one active, redeemable code survives either legitimate outcome; a forced insert-half `code_hash` collision proving `rotate_recovery_code` rolls its revoke back; and both branches of `revert_recovery_code_redemption` — clearing `redeemed_at` when the code is the account's only row, and safely no-opping once a fresher code has already taken over; and, from an optional-hardening pass the same day, that neither RPC is callable through PostgREST's `/rest/v1/rpc/...` endpoint by an authenticated non-service-role caller, `403` rather than an RLS-empty result). A `beforeAll`/`afterAll` around the whole `recovery-code` file now resets the shared rate-limit bucket via that same test-reset route, confirmed by running the file five consecutive times with no stack restart between runs. Assumes `supabase start` and `supabase db reset` already ran, with `supabase/functions/.env` setting `TELEGRAM_BOT_TOKEN`/`RECOVERY_CODE_PEPPER`/`RECOVERY_CODE_TEST_RESET_TOKEN` to the fixture values `tests/server-integration/telegramInitDataFixture.ts`/the local dev pepper/`tests/server-integration/recovery-code.integration.test.ts`'s own fixture constant sign, hash, and match with respectively. Step 20 added 3 more for `adopt-existing-save` (a pre-milestone version-1 document is stored and returned byte-for-byte, its progress survives with the added counter as the only difference, and the server itself migrates a raw version-1 upload).
- `npm run test:server-e2e` (`playwright.server-e2e.config.ts`, port 4176): 8 Chromium tests pass against the live local stack (Steps 8, 20, 21, and 22) — a fresh browser boots playable and holds a real anonymous session with a UUID `user.id`; every `**/auth/v1/**` request aborted still boots the game and a forced `visibilitychange` flush still reaches IndexedDB across a reload; two fresh browser contexts receive distinct `user.id`s whose access tokens each answer only for themselves through the live `whoami-check` function. Assumes `supabase start` and `supabase db reset` already ran and needs `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` pointed at that stack.
- `npm run test:e2e`: all 52 Chromium tests pass, including the fixed five-icon bottom navigation and every click target, explicit 5→10→15 reveal gates, all three stage-detail/batch-upgrade paths, drag rejection at the shared popup boundary, camera-invariant deep elevator return, the Step 33 journey, and Step 34 hidden/visible and abrupt-navigation scenarios. Step 19's test — "the full existing client E2E suite passes offline, unchanged" — was run both ways on 2026-09-13: fully green with the configured local Supabase stack running *and* with `.env.local` removed entirely, so the cloud replica is provably a no-op with no backend. The configured run also caught and fixed a real "Illegal invocation" defect: the replica stored the browser's `setTimeout`/`clearTimeout` detached, so the first scheduled cadence call threw; they are now bound to `globalThis`. Producing a false `409` on a returning player's first save was likewise caught here and fixed with §11 arming.
- `npm run test:perf`: the repeated ten-minute benchmark passes with all fifteen floors unlocked — 60.000 FPS, 16.67 ms mean, 17.6 ms p95, 17.8 ms maximum, zero of 36,139 frames beyond the 18.34 ms threshold, +229,928 bytes post-GC live-heap growth at +188 B/s, 665 Phaser objects and 371 DOM nodes constant across twenty samples, and 81.9 ms scroll p95 against a 100 ms budget. It presented at 60 Hz, so mean frame time equals the vsync interval and carries no headroom information. This is Pixel 5 emulation under 4× CPU throttling in desktop Chrome and is not physical Android-device evidence.
- Server-milestone Step 31 adds 8 Deno unit tests and 4 live integration tests
  for `entitlement-check`: a client cannot insert an entitlement, a
  service-role grant is visible as `effects.supporterBadge`, and revocation
  removes the effect. The live run requires the local Supabase stack and
  passed after restarting it with the new function loaded.
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
  `core-portability-check` reproduction (Step 6), the 2026-09-16 warm-up pass
  that pays every function's first-request cold start before anything with a
  budget of its own runs, `npm run test:server-integration`
  (Step 7), and `npm run test:server-e2e` (Step 8), which the script feeds
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` read from a live
  `supabase status --output json`. `--with-bundle-scan` additionally passes
  the production build and secret scan. Requires Docker. Its final pass/fail
  line reads "npm run verify:server" rather than the Step-4-era "Step 4
  validation." Re-verified 2026-09-11 after Step 12 (Telegram sign-in) with
  the same clean-cycle discipline — 48 Deno unit tests, three committed
  migrations, 20 integration tests (7 of them new, against the real deployed
  `telegram-sign-in` function), and the unchanged 3-test `test:server-e2e`
  suite all pass; the client gate (438 unit tests, 51 E2E, build, secret
  scan, 10 production smoke) re-run alongside it. Re-verified again
  2026-09-12 after the critical F13 fix (`[auth.email] enable_signup = false`)
  and its three smaller companions, from another completely clean
  `supabase stop`/`start`/`db reset` cycle: 49 Deno unit tests, 21
  integration tests (the new F13 attack-reproduction test included), and
  the unchanged `test:server-e2e` suite all pass; the client gate (442 unit
  tests, 51 E2E, build, secret scan, 10 production smoke) re-run alongside
  it.
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
- `npm run test:adversarial`: Step 26's suite alone, in one command (AC6).
  `test:adversarial:unit` is `deno test --filter "attack" supabase/functions`
  (no Docker, no permission flag) and `test:adversarial:integration` is
  `vitest run --config vitest.server-integration.config.ts adversarial`
  (the live stack, the same `verify:server` preconditions). Every test in the
  suite begins `attack <n> (<attack name>)` precisely so this filter selects
  all nine attacks and nothing else.
- `tests/unit/bundle-secret-scan.test.ts` covers the scanner directly against
  temporary fixtures outside the repository, importing it through
  `scripts/scan-bundle-secrets.d.mts` so `tsc` type-checks the test while the
  script stays plain JavaScript that `package.json` runs with no build step.

- Step 29's focused verification is `npx --no-install deno test
  supabase/functions/leaderboard-read` (7 tests), `npm run test -- --run
  tests/unit/leaderboard-display.test.ts tests/unit/server-stack.test.ts` (85
  tests), `npm run build`, `npm run lint`, the focused Rewards-tab Playwright
  smoke, and `npm run test:server-integration -- leaderboard-read.integration.test.ts`
  (3 live tests). The authenticated rank test runs against the local Edge
  Runtime after a restart/warm-up and proves a caller outside the visible top
  limit receives the correct rank.

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

Server-milestone Step 19 implemented the client half of that contract. The
active-save repository is now a composition of three modules:
`ReplicatingActiveSaveRepository` (local primary, cloud replica),
`cloudSaveReplica` (pure §9 cadence, backoff, and §7 `409` policy), and
`cloudSaveUpload` (the one `PUT /v1/save` `fetch`). Its timing constants live
in `src/persistence/cloudSaveReplica.ts`: `CLOUD_UPLOAD_MIN_INTERVAL_MS =
60_000` (the local `DEFAULT_SAVE_DEBOUNCE_MS = 500` is untouched),
`CLOUD_UPLOAD_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000]`,
`CLOUD_UPLOAD_MAX_RETRIES = 5` (five retries after the initial request, so the
16 s step is reached), and
`CLOUD_UPLOAD_MAX_CONFLICT_RESOLUTIONS = 5`. Uploads are held until
`CloudSaveReplica.arm(revision)` is called from the boot reconcile's new
`onServerRevision` hook, so the first upload of a returning player updates the
revision the server already holds instead of earning a false `409`. The
replica's `setTimeout`/`clearTimeout` are bound to `globalThis`, because the
browser throws "Illegal invocation" on a detached timer call — a real defect
the configured E2E run caught. `src/core` is enforced, not merely described,
as server-free: `eslint.config.mjs` bans `fetch`, `XMLHttpRequest`,
`WebSocket`, and `EventSource` under `src/core/**`, with a matching
`tests/unit/architecture.test.ts` probe.

A 2026-09-14 review added: an upload `409` fork now calls `stop()` (the client
holds the server revision, so a later save would otherwise replace the unshown
remote branch); `describeCloudSaveNotice` maps each §4 failure code to its
namespaced `cloud-sync-*` banner copy (reported from `src/main.ts`'s replica
`onEvent` on `sync-stopped`/`document-dropped`); a rejected
`save_invalid`/`save_rejected` save is remembered by the structural shape of
its state (`stateShapeSignature`) and not retried by the routine cadence, so
the loop survives neither an identical resend nor a fresh timestamp; a forced
trigger bypasses that guard and a successful upload clears it, so sync stays
genuinely live and a transient rejection can recover (R1, pass 3); local saves
are suspended
(`localSavesSuspended` + `cancelScheduledSave`) while a mid-session remote is
adopted and reloaded; the `local-dominates` re-upload preserves a newer queued
document; `#attempt` resets per trigger; the upload `Content-Type` is
`application/json; charset=utf-8`; and an unparseable `receivedAt` on a `409`
is a terminal `malformed_request`. `save-sync` now rejects only a schema
version newer than the server's, migrating older ones through the shared
chain.

Server-milestone Step 20 added `adoptExistingLocalSave` in
`src/platform/web/cloudSaveReconcile.ts`: it reads the local document, runs it
through `validateSaveDocument` (which migrates version 1 to version 2 via
`migrateSaveDocument`, expanding a legacy four-floor payload and defaulting
`warehouse.totalOfflineGoldClaimed` to `"0"`), and calls the Step 19 replica's
`forceCloudUpload`. `src/main.ts`'s boot-reconcile trigger uses it on
`no-cloud-save`/`kept-local`, so a pre-milestone player's version-1 IndexedDB
save becomes the account's cloud save on first sign-in, and publishes a DEV
`localSaveAdoption` diagnostic. It never throws, with three distinct non-upload
outcomes: absent → `no-local-save`, unreadable/corrupt → `unreadable`, and a
throwing `forceUpload` → `upload-failed`. The server-e2e spec seeds a
version-1 `SaveDocument` in IndexedDB to prove the browser path (comparing the
cloud copy against the captured flushed local document, so a later heartbeat
write cannot make the assertion race §9's cadence); the integration suite proves
the server stores and returns the migrated document byte-for-byte.

A 2026-09-14 review of Step 20 fixed: the flaky final e2e poll (M1, now compares
against a captured constant); the `upload-failed` conflation (L2); the missing
DEV adoption diagnostic (L3); the legacy four-floor evidence gap and a
zero-progress unit fixture (L4); and an overstated `activeContext.md` claim that
Step 20 changed behaviour rather than extracting and evidencing Step 19's (L5).

Server-milestone Step 21 added: `isNewSession` on `ensureGuestSession` (reused
vs minted, the only "this device's save was evicted" signal); the pure
`shouldExplainMissingLocalSave` and `local-save-missing` notice
(`src/platform/web/localSaveRestore.ts`, reported by `src/main.ts`); the
`requestPersistentStorage` helper (`src/platform/web/persistentStorage.ts`,
DEV `data-persistent-storage`); and the `onServerRevision` move in
`reconcileCloudSaveAtBoot` so a dominating remote is never preceded by arming
the replica (which could overwrite the cloud save being restored).

**Step 21 measurement — `navigator.storage` (measured 2026-09-14).** Recorded,
not assumed. Environment: Playwright-bundled headless Chromium (desktop
emulation), development server, no user engagement. Result from the DEV
`data-persistent-storage` diagnostic, captured by
`tests/e2e/persistent-storage.spec.ts`:
`{"supported":true,"persisted":false,"quotaBytes":9663676416,"usageBytes":0}` —
so `persist()` is present but **denied** (no engagement signal), the origin
quota is about 9 GiB, and usage is effectively zero. A denied `persist()` is the
expected headless result and is not evidence about a real browser profile where
the site has engagement.

**Step 21 measurement — iOS Safari seven-day deletion: OUTSTANDING.** The
specification says Safari removes script-writable storage after seven days
without first-party interaction, and it is unknown here whether a granted
`navigator.storage.persist()` exempts the data. This cannot be measured from
this repository's environment: it needs a real iOS device and a seven-day
wall-clock observation (threat-model finding F8; moving the device date forward
is not a validated shortcut). The observation is to be started when a deployed
HTTPS origin exists, checking at day 7+ whether the IndexedDB save and the
Supabase session survive, whether `persisted()` reports a grant, and whether a
grant changed the outcome. The measurement date and result must be recorded here
when it completes; no result is claimed until then.

A 2026-09-14 review of Step 21 fixed: **M1** — `loadResult.source === 'fresh'`
conflates "no record" with "corrupt record", so a returning player's corrupt
save was misreported as missing and the false notice replaced the accurate
`corrupt-save` warning; the decision now keys on a three-way `LocalSaveState`
(`saved`/`missing`/`unreadable`) and only `missing` fires the notice. **L2** —
the Telegram `sessionIsNew = true` assignment was inert and rested on a false
premise; it is removed and the notice is documented as guest-path-only.
**L3** — `architecture.md`'s Save Diagnostic Surface now documents all four
notice sources and the replace-on-different-code behaviour. **L4** — the
shared-promise join could never settle if the font await rejected; it is now a
three-way mutable join with no permanent pending await. **L5** — the
no-cloud-copy e2e stubs the whole save-sync surface, so a forced upload cannot
409 into an adopt reload that clears the banner.

Server-milestone Step 22 moved offline settlement to the server. New pure
`calculateOfflineGrant` (`src/core/offline-income/calculateOfflineGrant.ts`)
computes the reward from two opaque timestamps; `calculateOfflineIncome` (the
client projection) and `save-sync`'s `GET /v1/save` both call it, so the
7,200,000 ms cap and 0.5 efficiency cannot drift (F4). The download response
carries `offlineGrant` computed from the stored `received_at` to the server's
`Date.now()`. The client parses it in `downloadCloudSaveViaFetch`, receives it
via `reconcileCloudSaveAtBoot`'s `onOfflineGrant` for `kept-local`/
`same-progress`, and credits it as the authoritative reward. `playwright.config.ts`
pins the client E2E dev server's Supabase env blank so that suite stays
backend-free and deterministic; the production smoke pins the save-sync surface
to "no cloud save" for the same reason. `calculateOfflineGrant` was added to the
Step 6 server-core bundle, so the server runs the identical formula.

A 2026-09-15 review of Step 22 fixed: **H1** — a failed download fell back to the
client's clock-derived projection, reopening the device-clock cheat (an attacker
drops one request and jumps the clock); the fallback is now allowed only where
no server figure can exist (unconfigured, no session, or `no-cloud-save`), and a
failed download credits nothing, settling on the next boot that reaches the
server. **H2** — the server grant includes the cadence window since the last
upload, so it over-credited open-tab time; `chooseOfflineReward` now credits
`min(serverGrant, localProjection)`, which preserves "only a closed interval"
and is cheat-safe (a manipulated clock can only reduce the credit). **M1** — the
reward waited on an unbounded download; `downloadCloudSaveViaFetch` now carries
a 10 s `AbortSignal.timeout`. **L1** — the applied-receipt guard was burned when
the grant arrived; it is now marked only when the claim is persisted. **L2** —
protocol §10.2 documents a `200` carrying `offlineGrant: null`. **L3** — the
server-e2e seed no longer races the app (the account is fresh and uploads
nothing). **L4** — the four ordering flags are now the pure, unit-tested
`chooseOfflineReward`.

A follow-up 2026-09-15 review fixed three more: **H2-R** — the `min` bound only
engaged on a *positive* projection, but the exact H2 scenario (a tab flushed at
reload, or lagging uploads) produces a zero projection, so the cap was credited
unbounded; a null or zero projection is now treated as a zero closed interval
and credits nothing. **H1-R** — `sign-in-failed` against a configured backend
was passed as a fallback alongside `unconfigured`, reopening the clock cheat by
clearing the auth entry and blocking the network; the fallback now requires
`unconfigured` (or `no-cloud-save`), and the recorded cost is that a configured
build whose sign-in keeps failing earns no offline reward until a sign-in lands.
**L5** — `productContext.md` now states the "no reward this session, settled
next boot" behaviour instead of claiming the player always sees the reward
immediately.

Server-milestone Step 23 added the upload upper bound. New pure
`evaluateProgressBound` (`src/core/anti-cheat/progressBound.ts`, exported from
`src/core/index.ts` and therefore in the Step 6 server-core bundle) bounds an
uploaded document against the last accepted one: each unlocked floor's
`totalExtracted`/`totalTransported` (transport capped by the shared elevator's
throughput), `warehouse.totalGoldDelivered`, `warehouse.totalOfflineGoldClaimed`,
and the total upgrade/unlock spend (`state.upgradeSpend`). It uses the shared
core's `calculateMineProductionRates` and batch-cost functions on the candidate's
final configuration held for the whole interval in `O(floors)` — no ticks
simulated, since the interval can exceed `MAX_CATCH_UP_MS` and an `O(elapsed)`
walk would blow the §7.1 latency budget. Each counter also carries the material
in the pipeline at the interval's open (in-flight cycle, floor queue, elevator
load, warehouse input) so a warm mine over a short interval is accepted (F1); the
spend allowance is one earning term, not two (F5). `PROGRESS_BOUND_TOLERANCE = 0.05`
absorbs the fixed-step-vs-continuous-rate remainder and is pinned from both sides
by `tests/unit/progress-bound.test.ts` (9 tests). `save-sync`'s
`handleSaveUpload` runs `findProgressBoundViolation` after the `baseRevision`
check and before the write, returning `422 save_rejected` with
`detail: { counter, claimed, maximum }` and leaving the row and revision
unchanged; a first upload is exempt and a stored row whose document or
`received_at` is unreadable skips the check rather than rejecting (F4). When the
tight bound fails and the row's one-generation ancestor exists, the check is
retried against that ancestor over the full interval, so a §7 `409` re-upload of
a branch that diverged from it commits (F2). The client already handles
`save_rejected` (Step 19): `describeCloudSaveNotice` maps it to the
`cloud-sync-*` banner and the document is dropped by shape.
`supabase/functions/save-sync/index.test.ts` gained the server unit tests,
including the F2 ancestor anchor and F4 skip, and
`tests/server-integration/save-rejection.integration.test.ts` proves the live
rejection plus honest-accept. `tests/server-integration/saveAgeFixture.ts`
ages a stored row's `received_at` through the service-role client for a fixture
document that stands for linear offline play (never to fake a divergent branch
into the linear bound). The `profiles-rls` suite's profile-`created_at`
assertion gained a `CLOCK_SKEW_TOLERANCE_MS` bound on both sides, because it
compares the Postgres container's clock with the test process's.

A 2026-09-14 review of Step 23 fixed: **F1 (HIGH)** — a warm mine was rejected
over short intervals (no term for in-flight material); **F2 (HIGH)** — a §7
conflict resolution could never be uploaded (elapsed measured only from the
stored row); **F3 (MEDIUM)** — the tests began cold and the fixtures masked
F1/F2; new warm-interval and ancestor-anchor regressions were added; **F4
(LOW)** — an unparseable `received_at` collapsed to a zero-second bound; **F5
(LOW)** — the spend allowance summed two earning terms; **F6 (LOW)** —
`architecture.md`'s file-responsibility row now names the module. **N1 (MEDIUM)
remains open and is a stated limit:** the ancestor anchor is one generation
deep, so a fork older than ~2 minutes against an actively-syncing peer is still
rejected; the sound fix (retain fork points) was not taken up by Step 24 and is
not scheduled. See `architecture.md`'s Step 23 section and `progress.md`'s known
risks.

Server-milestone Step 24 (rejection handling). The `save_audit` table already
exists in the Step 5 migration with no RLS policy for any client role; Step 24 is
its writer. `save-sync`'s `handleSaveUpload` records one row per authenticated
`PUT /v1/save` attempt through the new `writeSaveAudit` dep
(`writeSaveAuditViaServiceRole`, the second and last service-role use in the
function): `outcome`, `error_code`, `base_revision`, `resulting_revision`,
`document_bytes`, `client_reported_at` (the document's own `savedAtTimestampMs`,
recorded and never trusted), and a `detail` with the server-authored reason (a
Step 23 bound violation's `{counter, claimed, maximum}`, a validation `reason`, a
conflict's `serverRevision`, and so on). Accepted attempts are recorded too; the
write is best-effort (logged, never fatal); an unauthenticated request writes
nothing. The `server-stack.test.ts` service-role pin now also asserts
`admin.from('save_audit').insert(`. Evidence: 8 new Deno unit tests,
`tests/server-integration/save-audit.integration.test.ts` (6 live tests including
RLS invisibility/unwritability to a client token and an unrepresentable client
clock still writing its row), and `tests/server-e2e/save-rejection.spec.ts`
proving the player keeps their local save, keeps playing, and sees the
`cloud-sync-save-rejected` notice.

A 2026-09-14 review of Step 24 fixed: **H1 (HIGH)** — `readClientClock` now
bounds `savedAtTimestampMs` to the range a `timestamptz` round-trips through
`Date#toISOString` (years 0001–9999) and records the raw out-of-range value in
`detail.clientReportedAtOutOfRangeMs`; previously a year-10000+ value formatted
as an extended-year string Postgres refused, so the insert threw, the
best-effort writer swallowed it, and the attempt left no row — erasing the
evidence of the clock attack the column exists to expose. **M1 (MEDIUM)** — an
unexpected collaborator failure (`readCurrentSave`/`writeSaveRow` throwing, or
the non-`SaveDocumentError` rethrow in validation) is now caught and recorded as
a `rejected`/`server_error` row before the 500, so a repeated crash is visible
instead of a silent unaudited 500. **L1 (LOW)** — the Content-Length rejection
path adds `declaredBytes` to `detail`, marking that `document_bytes` there is
the client's own header, not a measurement. **L2 (LOW)** — every rejection costs
a service-role round trip on the response path; bounding that is Step 25's job
and is carried there. A follow-up pass found **H2 (HIGH)**: `baseRevision` was
written to the audit's `bigint` column unvalidated, so a fractional (`1.5`) or
out-of-int8 (`1e300`) value aborted the insert and the attempt left no row —
including M1's own `server_error` row. It is now validated against §5 before
`auditContext.baseRevision` is assigned (null or a positive safe integer;
anything else is a recorded `400 malformed_request`), and
`writeSaveAuditViaServiceRole` coerces non-safe-integer revisions to null and
clamps `document_bytes` defensively. **L3 (LOW)** — `request.text()` on an
aborted body and building a `409` from a corrupted stored row are now also
caught and recorded as `server_error` rows. Evidence rose to 112 Deno server
unit tests and 91 integration tests.

Server-milestone Step 25 (abuse limits). One shared limiter,
`supabase/functions/_shared/rateLimit.ts`: a fixed-window counter with an
**injected clock and injected store**, so `_shared/rateLimit.test.ts` drives
window rolls, `Retry-After` countdown and prune pressure under
`deno test supabase/functions` with no `--allow-*` flag, no Docker and no
waiting. `recovery-code`'s Step 14 per-address limiter was folded into it with
its behaviour and its `TEST_RESET_RATE_LIMIT_ROUTE` intact, and the same module
now backs `save-sync` (`PUT`/`GET` per user and per address) and
`telegram-sign-in` (per address). Limits, each derived rather than chosen:
60 uploads/min/user and 600/min/address, 60 downloads/min/user and
600/min/address, 60 sign-ins/min/address, 30 redemptions/min/address (Step 14's
value) and 30 generations/min/user (the per-user half — redemption cannot have
one, because there is no caller identity until the code has already matched).

`MAX_REQUEST_BODY_BYTES = 65_536` moved from `save-sync`'s private constant to
`_shared/http.ts` and is now enforced by `telegram-sign-in` and `recovery-code`
too, neither of which had any cap; each function checks a truthful
`Content-Length` first and the received byte length second, because a chunked
body carries no header to check.

Two findings from building it. **The declared-size refusal now drains a bounded
prefix of the body before answering** (`discardRequestBody`, 1 MiB): answering a
`413` without reading left the client waiting on a response Kong had not yet
relayed, observed as a 20 s `TimeoutError` the moment the refusal moved above
authentication. The bytes are never buffered into a string and never parsed, so
AC5's "refused before it is parsed" stays meaningful. **The refusal order is
CORS preflight → declared size → rate limit → authentication → body read →
parse → validate → Step 23 bound → write**, which is what bounds Step 24's L2
(1 authenticated request → 1 service-role `save_audit` write): a `429` is
refused before any audit write exists on the path, and an oversized body now
writes none either. `supabase/config.toml`'s `[auth.rate_limit]` was reviewed
and deliberately **left unchanged** — its `anonymous_users` (30/hour/IP) is the
only bound on `ensureGuestSession`'s direct `signInAnonymously`, which never
passes through an Edge Function, and each committed value is already at or below
the corresponding in-code limit. No fingerprint-derived signal is collected at
all (threat model §7.2's GDPR default), and the enforcement is
`tests/unit/server-fingerprint-absence.test.ts`, deliberately broken once during
development (a planted `user-agent` read in `save-sync/index.ts`) and observed
to fail naming the file, line and signal. Evidence rose to 682 Vitest unit
tests, 138 Deno unit tests, and one new live suite,
`tests/server-integration/rate-limit.integration.test.ts`.

The one client change Step 25 needed: `rate_limited` was already retryable in
Step 19's replica, but it backed off on §9's 1/2/4/8/16 s ladder alone — so its
first retry came one second after a refusal asking for up to sixty, straight
back into the closed window. `cloudSaveUpload.ts` parses `Retry-After`
(delta-seconds only) into `retryAfterMs`; `#scheduleRetry` waits
`max(ladderStep, retryAfterMs)`, a floor and never a shortcut, and an absent or
malformed header leaves the ladder in sole charge rather than turning the
throttle into a stopped sync.

**Step 25's rework also repaired a pre-existing client-E2E flake.**
`tests/e2e/player-journey.spec.ts` aimed every press at coordinates read from
`BootScene`'s rendered-state read-back, which is republished at most once every
`VIEW_DIAGNOSTIC_INTERVAL_MS` (100 ms) while the mine camera is moved the instant
a wheel is applied. A snapshot read just after a scroll could therefore still
describe where the control *was*: the press landed on empty space, the upgrade
modal never opened, and the journey failed with a message that said nothing about
the cause. Reproduced at `f573d5d` and — this is the point — identically with the
Step 25 `src/` change reverted in place, so it is not a Step 25 defect. Two more
harness bugs sat behind it: the scroll step wheeled a whole viewport height,
overshooting a control that was only just out of view, and it awaited
`expect.poll(isPressable)`, which a *stale* republish satisfied before the scroll
had landed. `readSettledPurchaseControl` now reads until two consecutive
snapshots agree on placement (`screenBounds` + `isPressable`), the scroll travels
exactly the distance needed to centre the control, and a press is re-established
and re-aimed up to `PRESS_ATTEMPTS` times. A press also now pins the opened
modal's own `target` from `data-floor-upgrade-modal` instead of mere visibility,
so a mis-aimed press can never buy from a floor the journey did not mean to open
— the assertion is strictly stronger than the one it replaced. Verified 3/3 in
isolation and 2/2 full-suite `npm run test:e2e`, where the spec had failed before
and continues to fail on pristine `origin/master`.

`production-stages.spec.ts:368` ("the filled cart eases from the chute toward the
warehouse") is a **separate, pre-existing, load-dependent flake** and is *not*
fixed here: the cart eases correctly (112 → 128.03) but the poll demands
> 132 within a fixed 6.5 s real-time budget. It fails on pristine
`origin/master` in this sandbox too (2/2 full-suite runs) and was already
recorded by the first Step 25 iteration as flaking with a varying failing test
(`368`/`449`/`449`); it passed in the reviewing human's own run. Re-tuning that
budget is explicitly out of scope for this task (AC18, "Re-tuning unrelated test
budgets").

Server-milestone Step 26 (adversarial suite). No production code changed. Five
new test files, laid out by the layer the guard actually lives at: three
`adversarial.test.ts` files under `supabase/functions/` (collected by
`npm run test:server-unit`, no permission flag, no Docker) and two
`tests/server-integration/adversarial*.integration.test.ts` files (inside
`npm run verify:server`). `tests/server-integration/rlsMatrixFixture.ts` derives
attack 6's matrix — tables, per-table probe column, and each cell's expected
outcome — from `supabase/migrations/*.sql` rather than listing them, the same
read-from-disk rule `readExpectedMigrations` and the warm-up list follow.

**Building and running the suite.** The iteration that first wrote the suite
had **no Docker** and a `node_modules` whose native binaries were macOS
Mach-O, so none of the build-and-run gates could be executed there. The
2026-09-18 iteration ran on a Docker-capable runner and executed every one of
them; the first run was **red**, and the failures are recorded here because
they are what the gates were for:

| Gate | Outcome (2026-09-18) |
|---|---|
| `npm run lint` (AC1) | **exit 0** |
| `npm run test` (AC2) | **exit 0** — 52 files, 682 tests, the recorded count |
| `npm run test:server-unit` (AC3) | **exit 0** — **170** tests (this was 163 passed / 6 failed before the fixes below) |
| `npm run build` (AC4) | **exit 0** — `tsc --noEmit`, then `vite build` |
| `npm run verify:server` (AC5) | **exit 0** — Docker present; stack start, 6 migrations applied, health, ten-minute core portability byte-for-byte, warm-up, 16 integration files / 113 tests, 9 guest-session browser specs |

Four defects in the suite itself were found and fixed by running it, none of
them a defect in production code:

- **Attack 9's pure half could not pass as written.** `drivenHandler().redeem`
  spread `unusedCollaborators()`, whose `redeemRecoveryCode` throws; a
  well-formed wrong code reaches that collaborator, so the flood rejected on
  its first iteration and never reached the `429` branch it asserts. It now
  resolves `{ status: 'invalid' }` — the answer a wrong code actually gets —
  and the malformed-code test learned that an empty `code` is `400
  malformed_request` while a non-canonical one is `401 recovery_code_invalid`.
- **Attack 4's behind-direction unit test never reached the bound**: a document
  whose `savedAtTimestampMs` precedes its own `state.lastUpdateTimestampMs` is
  `422 save_invalid` before the clock rule is consulted. Both the document's
  timestamps and its claim now come from the bound itself (see
  `architecture.md`'s Step 26 section).
- **Four RLS cells asserted a status the stack does not return** — see the
  same section for the role split and the `leaderboard_entries` grant-layer
  refusal.
- **One cross-suite flake**, in a file this branch never edited:
  `rate-limit.integration.test.ts`'s flood assertions raced the limiter's
  fixed window, the shared bucket and the per-worker limiter's own ceiling.
  The integration config now runs with `fileParallelism: false` (which costs
  nothing: ~21 s either way); the post-flood assertions state the L2 invariant
  (one audit row per *admitted* request) instead of assuming the window has
  not rolled; and the flood runs until refused, bounded at three budgets,
  instead of pinning "the 61st request is refused" — which the per-worker
  `Map` cannot promise when the edge runtime splits a burst across workers.
  See `architecture.md`'s Step 26 section for the full reasoning.

Server-milestone Step 27 (leaderboard storage). No table, index, or RLS
change: `public.leaderboard_entries` already existed, metric-agnostic by
design, from Step 3/5. `src/core/leaderboard/leaderboardMetric.ts` adds the
decision — lifetime gold earned (`totalGoldDelivered +
totalOfflineGoldClaimed`), one all-time board (`LIFETIME_GOLD_BOARD_KEY =
'lifetime-gold'`), tie-break by ascending `updated_at` — plus the pure
`toLeaderboardMagnitude` conversion (`log10(mantissa) + exponent`, exact past
`1e308`) that the `metric_exact`/`metric_log10` pair requires.
`supabase/migrations/20260918100000_leaderboard_lifetime_gold_board.sql` pins
the three decisions as `comment on table`/`comment on column`, applied and
verified against `supabase db reset` from empty.

`tests/server-integration/leaderboard-storage.integration.test.ts` proves the
step's own "Test" line against the real table: ten values from ordinary
numbers through `1e1000` sort correctly through the real ranking index and
display exactly (`metric_exact` byte-identical to `GameNumber.serialize()`);
a tie at equal `metric_log10` ranks the earlier `updated_at` first; a focused
RLS check (the exhaustive matrix stays Step 26's); and a stated latency
budget — the top-100 ranking query over 10,000 rows on one board (the "~10⁴
rows" scale already recorded for this schema) completes under 300 ms through
the real REST API. The 10,000 rows need 10,000 distinct `auth.users` rows to
reference (`(board_key, user_id)` is the primary key); minting them through
GoTrue would have made this the slowest, flakiest thing `verify:server` runs,
so `tests/server-integration/directSqlFixture.ts` seeds them with one bulk
`insert` run as the Postgres superuser via `docker exec ... psql`, piped over
stdin — test setup only, the same convention `serviceRoleFixture.ts`
establishes for the write path PostgREST itself cannot reach. `npm run test`
(8 new: `tests/unit/leaderboard-metric.test.ts`), `npm run test:server-unit`
(unchanged, no server-side code touched), and `npm run verify:server`
(17 integration files / 119 tests, 6 of them new) all pass. See
`architecture.md`'s Step 27 section for the full design reasoning.

Server-milestone Step 28 (leaderboard writes). No schema change: publishing is
one new service-role call inside `save-sync/index.ts`'s existing accepted-upload
path, `admin.from('leaderboard_entries').upsert(...)`, run only after the row
is durably written and only ever from a document Step 23's bound, validation,
and the revision compare-and-swap have all already accepted — every reject
branch returns before the call site. Metric and revision come from Step 27's
own pure functions and the write's own resulting revision, never re-derived or
client-supplied; `display_name` is read from the caller's own
`profiles.display_name` through their own token. The publish is best-effort,
the same shape Step 24 established for `save_audit`: a failure anywhere in it
is logged and swallowed, never turning an accepted upload into a rejected one.
`supabase/functions/save-sync/index.test.ts` covers every branch (publish on
accept, no publish on any reject path, publish-failure resilience, a fresh
zero-gold account publishing nothing) with fakes; `tests/unit/server-stack.test.ts`
extends its `save-sync` service-role assertion with the new upsert line and
keeps pinning that `saves`' own compare-and-swap still carries no `upsert` of
its own; `tests/server-integration/leaderboard-publish.integration.test.ts`
proves the same contract against the real Edge Function and table — one row
published per accepted upload, a rejected upload leaves the prior entry
untouched, and a repeat accepted upload overwrites rather than duplicates.
`leaderboard_entries`' insert/update/delete refusal for both client roles was
already exhaustively covered by Step 26's migration-derived RLS matrix
(`adversarial-rls.integration.test.ts`), so it is not re-proven here. See
`architecture.md`'s Step 28 section for the full design reasoning.

## Closed incident reports

Four base-game defect reports (marketplace popup, navigation hit-target,
upgrade CTA press, marketplace hardening and close-race) previously appeared
verbatim in this file and six others. They are now in
`archive/incident-log.md`, one canonical copy.
