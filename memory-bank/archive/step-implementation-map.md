# Archive — Step implementation map

Per-step implementation records for the server milestone: which step produced
which package, migration, Edge Function, and test command, plus the review
findings each step absorbed. Moved out of `progress.md`'s
`## Server Milestone Step Status` on 2026-09-14; that section keeps only the
live status table.

Not part of the contract. Open it when you need the provenance of one step.

## Server milestone — per-step records

- 2026-09-08 server-milestone Step 3: designed six tables — `profiles`, `saves`, `save_audit`, `recovery_codes`, `leaderboard_entries`, `entitlements` — and documented all 42 columns with every type, default, nullability, key, constraint, index, and relationship, plus the row-level-security matrix and the rule for storing a `GameNumber`. The same block is written byte-identically into both required files, which is what the step's test asks a reviewer to confirm. Nothing was created: no migration exists and no database holds it. Step 5 lands the migrations.

- 2026-09-08 Step 4 review fixes, four findings, each shipped with a regression.
  **F1 (high): `verify:server` failed its migration check in an ordinary
  terminal.** `supabase migration list --local` defaults to a text table and
  emits JSON only when the CLI auto-detects an agent, which is why it passed
  during implementation. The parse then found no `{`, `slice(-1)` returned the
  trailing newline so the `|| '{}'` fallback never fired, and a healthy stack was
  reported as `missing 20260908120000` with exit 1. The call now passes
  `--output-format json` explicitly, the shared `parseCliJson` helper returns
  `null` instead of slicing a payload it did not find, and an unreadable response
  is reported as its own failure — `Migration list is readable — could not parse
  the CLI response` — rather than as a missing migration, because conflating the
  two sends whoever hits it to debug the database instead of the parser. Proven
  by running the script against `--output-format text`: it now names the parse
  failure and passes again on `json`.

- **F2 (medium): a documented command silently ran seven checks instead of
  nine.** npm does not forward a bare flag, so `npm run verify:server
  --with-bundle-scan` reaches the script as an empty argv and skips the build and
  the secret scan. `memory-bank/server-milestone-plan.md` used that form;
  `activeContext.md` and `progress.md` already used the correct
  `-- --with-bundle-scan`. The plan now matches and states why the `--` is
  required.

- **F3 (low): the scanner could fail a build on a value that is public by
  design.** Every non-`VITE_` value in `.env.local` was forbidden, but the Edge
  Function reads `SUPABASE_ANON_KEY` unprefixed — so adding a server-side
  `SUPABASE_ANON_KEY` or a bare `SUPABASE_URL` beside its `VITE_` twin would fail
  the build on the exact anon key Step 8 ships on purpose. Now exempt, but
  matched by **twin name** — `X` against `VITE_X` with the same value — and not
  by published value, because exempting on value alone would let a real secret
  exempt itself by being mirrored under any unrelated `VITE_` name. Both halves
  are pinned: the twin case must pass, the mirrored-secret case must still fail.

- **F4 (low): silent degradation in the privileged-key probe.** The same
  unguarded `slice(indexOf('{'))` sat in `readLocalPrivilegedKeys`, whose failure
  mode was `catch → []` — turning the exact-value check into a no-op that still
  printed as though it had run. It now guards the slice and returns a warning the
  CLI prints, distinguishing "the stack is not running" (expected on CI and a
  fresh checkout) from "the stack answered and could not be read". A missing
  `.env.local` warns for the same reason.

- Step 4 review evidence: `tests/unit/bundle-secret-scan.test.ts` adds 10 tests
  against temporary fixtures outside the repository, importing the scanner
  through a new `scripts/scan-bundle-secrets.d.mts` so `tsc` type-checks the test
  while the script stays plain JavaScript with no build step. Three assertions in
  `tests/unit/server-stack.test.ts` pin the CLI flag, the distinct parse-failure
  report, and the `start === -1` guard. Mutation-proven: removing the twin
  exemption fails the twin test, loosening it to any published value fails the
  mirrored-secret test, and removing the missing-`.env.local` warning fails the
  coverage test. `npm run verify` passes end to end — lint, 364 unit tests (up
  from 351), 42 Chromium E2E, strict build, secret scan, 9 production smoke — and
  `npm run verify:server` passes all seven stack checks.

- One finding surfaced from inside the new tests rather than from review: the
  repository-wide credential scan in `tests/unit/server-stack.test.ts` rejected
  the new test file, because a fixture needs a literal `sb_secret_`-shaped string
  to exercise the pattern. The fixture now assembles that string at runtime. The
  guard behaved correctly on its own author's code, which is the evidence that it
  is not decorative.

- 2026-09-08 server-milestone Step 4: stood up the local Supabase stack. The
  Supabase CLI is an **exact** devDependency at 2.117.0 rather than a global
  install, so a clean checkout runs the same backend version; the entire stack
  runs offline in Docker. `supabase/config.toml` is committed with project id
  `cat-mine-idle` and the CLI's default ports — API 54321, database 54322,
  Studio 54323, mail 54324 — which do not collide with the client's 5173, 4173,
  4174, or 4175. `realtime`, `storage`, and `analytics` are disabled because no
  step in the milestone plan uses them and each is a container at start-up.

- Step 4 ships one Edge Function, `save-sync`, serving protocol §10.1
  `GET /v1/health` at `/functions/v1/save-sync/v1/health`. It hosts the whole
  save-sync contract behind one function versioned internally as `/v1/...`, so
  Steps 16 and 17 extend this router, envelope, and error vocabulary instead of
  opening a second contract. Failures use only §4 codes; that vocabulary has no
  `not_found` and no `method_not_allowed`, so an undefined route or method is
  answered `malformed_request` / 400 under the protocol's reading that a request
  outside the contract is a client bug.

- Three Step 4 decisions worth reviewing at the gate. **`verify_jwt = false`** is
  set for the whole function because §10.1 requires the health route to answer an
  unauthenticated caller and platform verification would reject it before the
  handler ran; the authenticated routes verify their own bearer token inside the
  handler from Step 16, and until then no route reads or writes data. **The
  health route never reads the service-role key** — it is the one route open to
  unauthenticated callers and that key bypasses row-level security — so it proves
  database reachability by round-tripping PostgREST with the anon key, and a unit
  assertion pins the key's absence from the file; Step 16 narrows the probe to
  `saves` once that table exists. **One bootstrap migration exists** although
  Step 5 owns migrations: `20260908120000_bootstrap_platform_requirements.sql`
  creates nothing, asserts the PostgreSQL 13+ premise the Step 3 schema relies on
  for `gen_random_uuid()` — resolving the function rather than trusting the
  version number — and gives Step 4's "applies migrations" check and Step 5's
  "a deliberately broken migration fails CI" check a real file instead of an
  empty directory. The six designed tables remain untouched.

- Step 4 made the secret boundary enforced rather than described. The `VITE_`
  prefix is the whole line between a public value and a credential, because Vite
  inlines exactly those variables into the browser bundle. `.env.example` is the
  committed template with placeholders only; `.env.local` holds real values and
  is git-ignored along with `.env`, every `.env.*` but the template, and the
  CLI's `.temp`/`.branches` state. `npm run scan:secrets` fails the build when
  `dist/` contains a JWT declaring `role=service_role`, an `sb_secret_*` key, an
  exact non-`VITE_` value from the environment or the running stack, or any
  server-only variable name; it runs inside `npm run verify` between `build` and
  `test:prod`. The anon/publishable key is deliberately not flagged: it is public
  by design and Step 8 ships it on purpose.

- Step 4 evidence, both halves of its test.
  `npm run verify:server -- --with-bundle-scan` passes all nine checks from a
  clean checkout (a copy with no `node_modules`, no `.env.local`, no `dist/`)
  against an empty Docker volume set after `supabase stop --no-backup`: Docker
  reachable, stack starts, migrations apply to an empty database, every committed
  migration recorded as applied, `GET /v1/health` answering 200 with no bearer
  token, `status: "ok"`, a server timestamp 9 ms from the local clock, the
  production build succeeding, and the build output holding no server secret.

- Step 4 mutation evidence, on both halves. A migration with an undefined
  function fails `supabase db reset` with exit code 1; raising the version guard
  to 990000 fails the reset with the guard's own message rather than silently
  passing. Stopping the `supabase_rest` container turns the health route into a
  503 `service_unavailable` and restarting it restores 200, which proves the
  probe is a real database round trip and not a self-report. Planting the local
  service-role JWT, the `sb_secret_*` key, or a reference to
  `RECOVERY_CODE_PEPPER` into a built `dist/` asset each fails the secret scan
  with a named finding. Among the static invariants, flipping `verify_jwt` to
  true, making the function read `SUPABASE_SERVICE_ROLE_KEY`, un-ignoring
  `.env.*`, un-ignoring `.env.example`, and removing both Supabase ignore sources
  each fail their own assertion; the ignore rules are asserted through
  `git check-ignore` rather than the text of `.gitignore`, because a
  commented-out rule still reads as present in the file.

- Step 4 regression evidence: `npm run verify` passes end to end — lint, 351 unit
  tests (up from 335; `tests/unit/server-stack.test.ts` adds 16), 42 Chromium
  E2E tests, the strict production build, the secret scan, and 9 production smoke
  tests. No client code changed, no gameplay changed, no balance value changed,
  and save-document and IndexedDB schema versions remain 1.

- Two Step 4 gaps are recorded rather than closed. `supabase/functions/**` is
  linted with Deno globals declared in `eslint.config.mjs` but sits outside
  `tsconfig.json`, because `Deno` has no type in the Node/DOM libraries the
  client compiles against; Step 7's Edge Function harness is where server-side
  type checking and unit testing belong, and until then the function's automated
  proof is the live health probe plus static source assertions. And the health
  probe reports PostgREST's reachability — a real database round trip, but not a
  query against a table the game owns, because no such table exists until Step 5.

- Step 3's `GameNumber` rule is three rules by location: values stay serialized strings inside the save document untouched; anywhere SQL must rank one, an `*_exact text` column carries the canonical form for display beside a `*_log10 double precision` column used only for `ORDER BY`, because a value past `1e308` cannot enter a double but its logarithm can; and `numeric` is rejected because round-tripping the canonical string through it is not guaranteed to reproduce the exact serialization display depends on, while comparison and index cost grow with digit count against values that grow without bound. Sorting on `log10` can tie when mantissas differ beyond double precision, so the ranking index carries a deterministic secondary column and the exact string is what is displayed either way.

- Step 3's decisive finding: **`saves.document_json` is `text`, not `jsonb`.** Step 20's test requires a pre-milestone save to return from download byte-for-byte identical, and `jsonb` does not preserve key order, discards insignificant whitespace, and normalizes numeric literals. This was verified rather than assumed — the same document stored in both column types came back from `jsonb` with its keys reordered, which would have failed Step 20 after the schema was already live. The server parses the document to validate it and stores the original text unchanged; nothing in SQL queries inside it, so `jsonb` would have bought nothing.

- Four further Step 3 decisions. `saves` keeps one generation of rollback in `previous_revision`/`previous_document_json`/`previous_received_at`, constrained all-or-none and strictly older, because the threat model ranks a player's own progress above every other asset and a single row with no history offers no recovery from a wrongly accepted upload. `leaderboard_entries` carries its own `display_name` snapshot so publishing a public board does not require widening `profiles` beyond own-row access. `save_audit` records `client_reported_at` — never trusted as an input, but a clock attack becomes visible as divergence from the server's `occurred_at`. `recovery_codes.code_hash` is an HMAC-SHA-256 digest under a pepper held in Edge Function configuration and never stored in the database: a fast keyed digest is correct for a high-entropy machine-generated secret rather than a human password, the pepper's absence from the database means a leak alone does not permit offline enumeration, and the unique index on the digest is what lets redemption find the row without scanning.

- Step 3 recorded two consequences rather than leaving them to be discovered. Every table carries exactly one foreign key, to `auth.users(id)` with `on delete cascade`, which gives Step 33 a single deletion path and becomes an invariant every future table must satisfy or declare its own path in the same change. The cost of that uniformity is that `save_audit` rows cascade away with the account, so deleting an account also erases the evidence of abuse from it — the right default while no money is at stake and GDPR is assumed to apply, and a trade rather than an oversight.

- Step 3 evidence: the DDL was extracted programmatically from the documented block itself — not retyped — and executed against PostgreSQL 17 in a throwaway container with a stub `auth.users` table standing in for the Supabase-managed one. It applies cleanly, and 14 constraint-behaviour assertions pass: `metric_log10` refuses NaN and infinities while `1.2345e999` stores and sorts exactly, `save_audit` couples `error_code` and `resulting_revision` to `outcome` in both directions, the `previous_*` columns enforce all-or-none and strict ordering, only one active recovery code per user is possible and rotation frees the slot, a non-hex digest and an unknown entitlement key are refused, a document over 64 KB is refused, and deleting the `auth.users` row cascades every row in all six tables. This is a design check against stock PostgreSQL; it is not a Supabase project, which Step 4 creates.

- 2026-09-08 server-milestone Step 2: specified the client/server save-sync contract before either side exists. Two endpoints plus a health check, each with an example request and an example response for every success and every rejection; an eleven-code error vocabulary in which each code carries what the client does and the exact player-facing copy, so a reviewer can describe the whole failure surface without reading code. Most codes deliberately show the player nothing: the game never blocks on cloud sync, and `createSaveDiagnosticBanner` never withdraws a notice, so a retryable network failure must stay silent until retries are exhausted or a tunnel would pin a permanent banner to the screen. Cloud notices reuse that existing banner with `cloud-sync-*` codes rather than adding a surface.

- Step 2's five binding decisions. D1: the session credential lives in script-writable storage rather than a first-party HttpOnly cookie because no domain is registered — and its consequence is that the session and the local save fall under one seven-day iOS Safari deletion, making the Step 14 recovery code, not cloud save, the mechanism that makes Step 21's promise true. D2: a server-owned monotonic `revision`, whose stale-write rejection returns the server document so a conflict costs one round trip and a retried upload with a lost response resolves silently instead of becoming a false conflict. D3: the server's `receivedAt` anchors every elapsed-time calculation while the document's own timestamps are carried verbatim and never used as a server input, preserving finding F4. D4: divergent devices resolve by dominance over the monotonic progress vector, adopting a strict superset silently and asking the player only on a genuine fork, with `gold` and every queue, progress, and cursor value excluded because they legitimately fall — the same distinction Step 23 draws. D5: cloud upload runs at most once per 60 s with forced lifecycle, offline-claim, and boot-reconcile triggers, leaving the 500 ms local debounce untouched, which resolves finding F6.

- 2026-09-08 server-milestone Step 1: wrote the threat model over six attacker capabilities — local storage, the client bundle, the device clock, HTTP requests, the session credential, and unlimited anonymous identities — each with what it is worth, which step defends it, and what stays undefended. Ranked the protected assets so the Step 23 tolerance direction is derivable rather than arbitrary: a player's own progress outranks leaderboard integrity, so re-simulation must prefer accepting a generous save to rejecting an honest one. Recorded nine explicit non-defences, including that nothing before Step 22 defends the device clock, so Steps 15–21 store clock-derived income faithfully and must not be presented as anti-cheat. Recorded seven standing rules every later step must preserve.

- All eight kickoff questions were unanswered by the user and now carry conservative recorded defaults: prototype scale (10k accounts, 1k DAU, 20 uploads/s); Vietnam/SEA primary with GDPR assumed to apply, so Step 25 collects no fingerprint signal at all; Telegram stays at Step 12 and is cuttable; no real money in this milestone; no domain, no Supabase org, and no CI exist; the repository owner is sole operator at RPO 24 h; existing local saves must survive, making Step 20 mandatory; and the game is not knowingly offered under 16, with no email column in `profiles`. Three of these were settled by inspecting the repository — GitHub remote, no CI configuration, and no Content Security Policy in `index.html` — which is what removes the first-party-cookie option from Step 2.

- The same step audited all 37 plan steps for assumptions relied on but never recorded, and found nine. F1: Step 12 presumes a Telegram Mini App host that does not exist — `src/platform/` holds only `web/` and no file in `src/` mentions Telegram — so Step 12 gains a prerequisite. F2: Step 6's premise that `break_infinity.js` 2.2.0 imports into Deno is unproven, so Step 6 verifies it first and falls back to a shim, never a reimplementation. F3: Step 23's upper bound is loose by construction and must state its modelling rule. F4: Step 22 changes which clock is authoritative and must preserve the offline-income formula, cap, efficiency, and open-tab/closed-tab ratio exactly. F6: cloud upload cadence is distinct from the 500 ms `SavePersistenceCoordinator` debounce and is capped at one per 60 s plus lifecycle flushes, which sets the Step 25 limits and the Step 36 load profile. F7: Step 11 presumes an Apple Developer Program membership, a Services ID, and a verified domain that neither the plan nor the recorded budget contained, so Step 11 gains a prerequisite list, roughly USD 99/year, and a hard dependency on the domain question that Step 10 does not have. F8: Step 21's measurement of the seven-day storage cap needs a seven-day wall-clock observation on a real Safari profile, so it is planned as an observation started early and checked later rather than a step completed in one sitting. F9: Step 31 has no concrete entitlement to grant, and any economy-affecting one would become an unmodelled input to Step 23's bound, so its single entitlement is defined as cosmetic and economy-neutral. F5 is left open rather than defaulted: no step covers XSS or a Content Security Policy, while the session credential in script-writable storage is the sole proof of save ownership. Closing it adds a step, which is the user's decision at the Step 1 gate.

- The user validated Step 4 and authorized Step 5 on 2026-09-08.

- 2026-09-08 server-milestone Step 5: migrations and CI. `supabase/migrations/20260908130000_create_platform_tables.sql` lands the six Step 3 tables verbatim — the exact `create table`/index SQL already documented in `memory-bank/architecture.md` and `memory-bank/techContext.md` — and adds RLS: enabled on all six, with policies matching the Step 3 matrix exactly (`profiles`/`entitlements` select-own, `profiles` update-own, `saves` select-own with no insert/update/delete policy anywhere, `leaderboard_entries` select-all). `save_audit` and `recovery_codes` get RLS enabled and no policy at all, which is what denies every `anon`/`authenticated` access outright; the service role bypasses RLS and remains the only writer. `supabase/seed.sql`, empty since Step 4, now inserts one local-only fixture guest — an `auth.users` row and its `profiles` row — so a developer running `npm run supabase:start` sees a real row in Studio without the Step 8 sign-in flow existing yet. `saves`, `save_audit`, `leaderboard_entries`, and `entitlements` are deliberately left unseeded: a plausible fixture row for them needs code that does not exist before Steps 16, 26, and 31, and inventing one by hand risks the drift this milestone exists to prevent.

- Step 5 scope decision: all six tables land now, not one per the step that first names it (Step 9 for `profiles`, Step 15 for `saves`, Step 27 for `leaderboard_entries`, Step 31 for `entitlements`). This follows what `memory-bank/architecture.md`, `memory-bank/techContext.md`, and the Step 4 bootstrap migration's own comment already committed to before Step 5 began — "Step 5 lands these six tables as forward-only migrations" — rather than a fresh reading of Phase 2/3/5/6's per-step instructions in isolation. Under this reading, Steps 9, 15, 27, and 31 add the application logic around an already-existing table, not the `create table` statement itself.

- `.github/workflows/ci.yml` is the first CI this repository has had. A `client` job runs `npm run verify` (lint, unit, E2E, build, secret scan, production smoke); a `server` job runs `npm run verify:server` (stack start, migrations from empty, health check) on the same ubuntu-latest runner, which ships Docker preinstalled. Both jobs must pass; a broken migration fails the `server` job rather than being discovered on deploy. `package.json` gained `verify:all`, a sibling script running both locally in sequence, as the step's instructions asked for. `scripts/verify-server-stack.mjs` originally carried a hand-kept `EXPECTED_MIGRATIONS` list, extended to both migration files so the check actually covered the new one; the 2026-09-08 review replaced the list with a read of `supabase/migrations/`, because a hand-kept list is precisely what a future step forgets to extend.

- Step 5 evidence went beyond re-running Step 4's script. `npm run verify:server` passes against the real local stack: two migrations recorded as applied, health check green. Direct PostgREST calls with a JWT minted for the seeded fixture user (`role: authenticated`, `sub` set to its id, signed with the local JWT secret) prove the RLS policies behave as designed rather than merely as written: `select` on `profiles` returns exactly its own row (200, one row); `select` on `saves` returns an empty set (200, `[]` — the row does not exist, and RLS would filter it either way); a direct `insert` into `saves` with that token is refused (403, PostgREST error `42501`, "new row violates row-level security policy for table \"saves\""), which is the anchor the Step 15 and Step 26 tests will extend; and `select` on `save_audit` returns `[]` under a table with no policy at all, rather than an error, which is PostgREST's normal behaviour for a fully row-filtered table. Step 5's own test — "a deliberately broken migration fails CI" — was mutation-proven directly rather than only asserted: a temporary third migration referencing a foreign-key column that does not exist made `supabase db reset` exit 1; removing it restored exit 0 and a clean `npm run verify:server` pass. This is the identical mechanism the new `server` CI job runs, though no actual GitHub Actions run has executed, since this checkout has never been pushed. `npm run lint` and `npm run test` (364 unit tests) were re-run and pass unchanged. No client source file changed, and no gameplay, save-document, or IndexedDB schema version changed.

- 2026-09-08 review of the Step 4/5 working tree: ten findings, all fixed in place before the gate, each with a regression test. Three were checks that reported success without having checked. (1) `parseEnvFile` in `scripts/scan-bundle-secrets.mjs` read everything after the first `=` as the value, so a `.env.local` line with a trailing `# comment` yielded a forbidden value that cannot occur in any bundle — the exact-value leg of the secret scan silently no-opped for that variable while printing as having run. It now follows dotenv's quoting rules and strips an `export ` prefix; mutation-proven, the new test fails against the old parser. (2) `public.set_updated_at()` lacked `set search_path = ''` (Supabase's `function_search_path_mutable` lint); since migrations are forward-only and every future `updated_at` column attaches to this trigger, it was pinned at creation, with `pg_catalog.now()` in the body, and verified still firing against the local stack. (3) `leaderboard_entries_select_all` admits every row and PostgREST lets the caller pick its columns, so `?select=user_id` enumerated the `auth.users` id of every published player unauthenticated; `user_id` is now withheld by column-level grant, verified live (anon reads `board_key,display_name,metric_exact` at 200, and is refused both `select=user_id` and `select=*` with `42501`). The RLS matrix in `architecture.md` and `techContext.md` moved in the same change and both copies remain byte-identical. The other seven: the migration list is read from disk with a guard against an empty list; the bundle scan names the `.env.local` values it skipped as too short or placeholder, and refuses to print a pass over an empty `dist/`; the save-sync health route answers a missing environment variable with `server_error` rather than `service_unavailable` (which would have every client retry forever against a healthy database), and `errorResponse` can set the `Retry-After` §4 tells clients to wait for; `.github/workflows/ci.yml` declares `permissions: contents: read` and per-job `timeout-minutes`; and the repository-wide credential scan in `tests/unit/server-stack.test.ts` skips binary extensions — it had been reading 363 untracked images, mostly `art-source/`, on every `npm run test` — and now reports an unreadable file as an offender instead of skipping it silently, taking that test from roughly 2 s to 36 ms. After the fixes: lint clean, 376 unit tests pass, `npm run verify` passes end to end, `npm run verify:server` passes with both migrations applying to an empty database. No client source file, gameplay value, save-document shape, or schema version changed.

- The user validated Step 5 and authorized Step 6 on 2026-09-08.

- 2026-09-08 server-milestone Step 6: made `src/core`, `src/config`, and the save-document boundary (`src/persistence/saveSchema.ts`) runnable on Deno without forking them. The obstacle turned out not to be `break_infinity.js` (finding F2) but something more basic, discovered empirically rather than assumed: Deno's edge runtime does not add a `.ts` extension to an extension-less relative specifier, so pointing an Edge Function straight at `src/core/index.ts` failed to boot on its own internal imports — reproduced identically via `supabase functions serve` and the real `supabase start` runtime (`supabase-edge-runtime-1.74.3`, Deno v2.1.4). A root and a per-function `deno.json` with `"unstable": ["sloppy-imports"]` were both tried and neither was honoured by this runtime. Recorded as finding F10 in `memory-bank/server-threat-model.md` §8, a gap no audit of stated assumptions could have found because nothing stated it.

- The fix is a generated bundle, not an import map. `supabase/functions/_shared/coreBundleEntry.ts` is a zero-logic file — `export * from '../../../src/core'` and its `src/config`/`saveSchema.ts` siblings, nothing else — so it cannot fork the behavior it names. `npm run build:server-core` (`vite.server-core.config.ts`, Vite library mode, `rollupOptions.external: []`) compiles it into `supabase/functions/_shared/generated/core-bundle.js`: one dependency-free ES module with every specifier already resolved, including `break_infinity.js` inlined by the same resolution the client bundle already relies on. That resolved F2 as a side effect — it imports cleanly once bundled, no shim needed. The bundle is git-ignored and `scripts/verify-server-stack.mjs` rebuilds it before every `supabase start`, so it can never be stale when tested.

- `supabase/functions/core-portability-check` is deliberately not part of the save-sync protocol — it reads and writes no data and exists only to prove this step. It imports the generated bundle and, on request, runs the fixed document at `tests/fixtures/ten-minute-core-fixture.json` (a real `SaveDocumentV1`, generated once from `createInitialGameState`/`createSaveDocument` and then pinned) through `migrateSaveDocument` → `validateSaveDocument` → `deserializeSaveDocument` → one explicit `advanceSimulation` tick → `catchUpSimulation` for the remaining 599,900 ms → `createSaveDocument`, returning the result. `tests/unit/server-core-portability.test.ts` runs the identical sequence against the unbundled source client code always imports and pins the same result: starting gold `"100"` becomes `"3080"`, `totalExtracted` `"3000"`, `totalGoldDelivered` `"2980"`, warehouse `inputQueue` `"10"` mid-cycle. `verify_jwt = false` for this function, the same reasoning as the health route.

- Step 6 evidence: `npm run verify:server` now rebuilds the bundle, starts the stack, and fetches the live function, asserting its response is structurally identical to the pinned fixture (matching the same `toEqual` semantics the unit test uses, rather than raw JSON-text equality — see the review fix below) — passing on a fresh `supabase db reset`. Mutation-proven directly: `calculateExtractionYield` in `src/core/simulation/advanceSimulation.ts` was temporarily changed to double its result. The client test failed immediately (`totalGoldDelivered` "2980" → "5960" in the diff); rebuilding the bundle and re-fetching the live function showed the identical doubled numbers (gold `"6060"`, `totalGoldDelivered` `"5960"`) — the same one-line source change moved both sides together, in the same run, before the edit was reverted and both returned to matching the original pinned fixture. `eslint.config.mjs` extends `src/core/**/*.ts`'s existing purity rules with a `no-restricted-globals` entry banning the `Deno` global and a `no-restricted-imports` pattern banning any specifier matching `(^|/)supabase(/|$)` — this boundary runs one direction only, `supabase/` depending on `src/core`, never the reverse. `tests/unit/architecture.test.ts` gained a probe asserting both fire together on a `Deno.serve(...)` call importing from `supabase/functions/save-sync`. `npm run lint` and `npm run test` (378 unit tests, up from 364) pass; no client source file outside `eslint.config.mjs`/`tests/unit/architecture.test.ts` changed, and no gameplay, save-document, or IndexedDB schema version changed.

- Two Step 6 judgment calls worth reviewing at the gate. First, the six-table migration lands application logic incrementally in later steps but the raw schema all at once in Step 5 (recorded at that step's gate); Step 6 follows the same "land the mechanism, not per-consumer" instinct by bundling all three portability targets (`src/core`, `src/config`, `saveSchema.ts`) through one shared entry file rather than three separate ones, since they already import each other and a single self-contained bundle avoids triplicating `break_infinity.js`. Second, `core-portability-check` was kept as its own function rather than added to `save-sync`, because the save-sync router's own rule — Steps 16/17 extend it rather than opening a second contract — is scoped to the save-sync *protocol* specifically; this function serves no protocol request a client would ever make, and mixing a permanent engineering-verification route into the player-facing router's error vocabulary seemed like the wrong coupling.

- 2026-09-09 review of the Step 6 working tree: six defects, all fixed in place before the gate, each verified directly rather than only reasoned about. (1) `vite.server-core.config.ts` had no `publicDir: false`, so Vite's default behavior copied the ~2.9 MB of game art under `public/assets/` into `supabase/functions/_shared/generated/` on every build; measured 3.0 MB across 36 files before the fix and 80 KB in one file after. (2) The `no-restricted-imports` pattern added for `src/core/**` matched the `supabase/` directory but not the `@supabase/*` npm scope Step 7 adds as a dependency (`@supabase/supabase-js`), which would have imported clean; a second pattern (`^@supabase/`) closes it, and `tests/unit/architecture.test.ts`'s Step 6 probe now includes a `createClient` import from `@supabase/supabase-js` alongside the existing `Deno.serve` case. (3) `scripts/verify-server-stack.mjs` compared `JSON.stringify(...)` text on both documents while `tests/unit/server-core-portability.test.ts` used `toEqual`, so a harmless key-order difference would fail the script while the unit test stayed green; the script now does a structural `deepEqual` for pass/fail and demotes the stringify comparison to an informational "identical values, differing key order" detail on a pass — reproduced live by reordering `expectedOutputDocument.state`'s keys in a scratch copy of the fixture and confirming the check still passes with that exact message, then restoring the original file byte-for-byte. The same fallback previously named three unrelated top-level fields at once when `find` returned `undefined`; it now names them by their actual location. (4) `checkCorePortability` retried any non-200 response through the full 20-attempt loop, but unlike the health route's transient `service_unavailable`, a response from this function (even an error one) means the worker booted and answered — retrying it cannot fix a deterministic bug. It now retries only when the fetch itself never got a response; timed live against an injected deterministic throw, restarting the edge-runtime container to force the reload: failure now reports in 30 ms instead of the prior worst-case multi-second loop. (5) `vite.server-core.config.ts` was outside `tsconfig.json`'s `include`, so it was linted but never type-checked; added, and `npx tsc --noEmit` stays clean. (6) `.github/workflows/ci.yml`'s `server` job name and its `timeout-minutes: 20` comment still described only the Step 4/5 health check; both now name the portability check this step added. After the fixes: lint clean, 378 unit tests pass, `npm run verify:server` passes all checks including the rebuilt 80 KB bundle, and `git diff --check` is clean.

- The user validated Step 6 and authorized Step 7 on 2026-09-09.

- 2026-09-09 server-milestone Step 7: established the Edge Function test harness. `deno-bin@2.1.4` is a new exact devDependency — a real, pinned Deno CLI (matching the edge runtime's own reported "compatible with Deno v2.1.4"), rather than relying on the Supabase CLI, which has no `deno test`-equivalent subcommand (`supabase test` only wraps pgTAP). `npm run test:server-unit` (`deno test supabase/functions`) discovers and runs three files — `_shared/http.test.ts`, `save-sync/index.test.ts`, `whoami-check/index.test.ts` — 19 tests total, each importing its handler directly rather than making an HTTP request, and every one passes with zero `--allow-*` permission flags: proof of purity by construction, since Deno's sandbox would refuse a real network or env access without an explicit grant.

- `whoami-check` is Step 7's "trivial authenticated endpoint," not part of the save-sync protocol. `handleWhoAmI` takes caller resolution as an injected `ResolveCaller` collaborator instead of calling Supabase Auth itself, so its unit tests exercise every response the route can give — missing token, rejected token, resolved caller, non-GET method — with a fake. The one real collaborator, `resolveCallerViaSupabaseAuth`, uses the new `@supabase/supabase-js` client dependency to verify the bearer token against GoTrue's `/auth/v1/user` and then read the caller's own `profiles.display_name` under row-level security — the exact shape (authenticate, then read/write as that user under RLS) every real authenticated route from Step 9 onward will need. `verify_jwt = false` at the platform level, same reasoning as `save-sync`'s health route: verification happens by hand inside the handler on purpose, since that manual pattern is what `save-sync`'s own authenticated routes need from Step 16.

- "Fix the fixture pattern for an authenticated caller" is `tests/server-integration/authFixture.ts`: it mints an HS256 JWT — `sub`, `role: authenticated`, `aud: authenticated`, an expiry — for the seeded fixture guest (`11111111-1111-1111-1111-111111111111`), signed with the Supabase CLI's fixed local `JWT_SECRET` (the same value on every local stack anyone runs, printed by `npx supabase status`, not a secret this repository protects). This formalizes what Step 5's evidence-gathering did ad hoc with an inline Node script. `tests/server-integration/whoami.integration.test.ts` uses it against the real running stack: 200 with the seeded guest's actual `displayName` for a valid token, 401 for no header, a syntactically invalid token, a token signed with the wrong secret, and an expired token, and 400 for a non-GET method. It lives in its own `vitest.server-integration.config.ts` (`tests/server-integration/**/*.test.ts`), deliberately excluded from `vitest.config.ts`'s `tests/unit/**` glob so `npm test`/`npm run verify` — which must work with no Docker running — never picks it up by accident.

- `save-sync/index.ts` and `core-portability-check/index.ts` both gained an `import.meta.main` guard around their `Deno.serve(...)` call: `resolveFunctionRoute`/`handleRequest` are now unit-tested by importing the module directly, and without the guard that import would also start a live HTTP listener. Proven live rather than assumed safe: after adding the guard, `npm run build:server-core` plus a forced edge-runtime container restart showed both functions still answering real requests exactly as before. Their duplicated response-envelope code (`JSON_HEADERS`, `jsonResponse`, `errorResponse`, `ErrorOptions`) moved to the new `supabase/functions/_shared/http.ts`, itself unit-tested, so a third function never has a third copy to drift from the other two.

- `scripts/verify-server-stack.mjs` runs `npm run test:server-unit` immediately after the bundle build, before `supabase start` — it needs no live stack, so it runs first and fails fast — and `npm run test:server-integration` after the database reset and the health/portability checks confirm the stack is live, satisfying the step's test that both categories "run in CI from a clean database." The script's final pass/fail line, previously hardcoded as "Step 4 validation," now reads "npm run verify:server," since it has covered Steps 4 through 7 for a while and will keep growing.

- A real bug surfaced live while wiring the integration test, not assumed away: `GET /auth/v1/user` against the seeded fixture guest's token returned `500 {"code":"unexpected_failure", ...}`. `docker logs supabase_auth_...` named it exactly: `"Unhandled server error: sql: Scan error on column index 3, name \"confirmation_token\": converting NULL to string is unsupported"`. `supabase/seed.sql`'s `insert into auth.users` had never set `confirmation_token`, `recovery_token`, `email_change_token_new`, or `email_change` — columns with no default, left NULL — and GoTrue's Go row scanner reads them as plain strings, not nullable ones. No step before this one ever triggered it: Steps 4 through 6 only ever handed PostgREST a hand-signed JWT directly, which never asks GoTrue to load the user row. Fixed by seeding those four columns as `''`, matching what GoTrue itself writes for a real sign-up; verified with a direct `curl` to `/auth/v1/user` before (500) and after (200, the real user object) the fix, then confirmed through the full integration suite.

- Step 7 evidence: `npm run verify:server` passes 13 checks end to end from a completely clean `supabase stop`/`start`/`db reset` cycle — Docker, the bundle build, 19 Deno unit tests, stack start, both migrations, health, core portability, and 6 integration tests — and `--with-bundle-scan` additionally passes the production build and secret scan. The full client gate was re-run given the scope of change (`import.meta.main` guard, new dependencies, a static-source test touching the refactored file): lint clean, 378 unit tests (one, `tests/unit/server-stack.test.ts`'s Retry-After assertion, needed updating to read `_shared/http.ts` since that literal moved out of `save-sync/index.ts`), all 42 Chromium E2E tests, strict build, secret scan, and all 9 production smoke tests pass. No client gameplay, save-document, or IndexedDB schema version changed.

- 2026-09-09 review of the Step 7 working tree: five findings, four fixed in place before the gate, one recorded rather than fixed. (1) `@supabase/supabase-js` sat in `dependencies` although `src/` imports it zero times — grepped to confirm; the only other hit is a string literal in the `tests/unit/architecture.test.ts` lint probe — so it moved to `devDependencies`, pinned exact (`2.116.0`, matching the other CLI-version-sensitive devDependencies) rather than left as `^2.116.0`. More seriously, `whoami-check/index.ts`'s Deno import used a floating `npm:@supabase/supabase-js@2`: locally `deno test`/`supabase start` resolve that from this repository's own `node_modules` (Deno's byonm mode, since a `package.json` exists at the workspace root) and land on whatever is installed, but a function deployed without that `node_modules` context would let Deno fetch "latest matching `2`" from the npm registry instead — a version the local unit tests never ran against. Pinned the Deno specifier to the exact installed version instead of documenting the gap, and added `tests/unit/server-stack.test.ts` assertions that both the dependency's location (`devDependencies`, not `dependencies`) and its exact version match the Deno specifier, so the two cannot drift apart silently again. (2) The static invariants in `tests/unit/server-stack.test.ts` covered only `save-sync`'s source — `whoami-check` had no "never reads the service-role key" assertion and no `config.toml` `verify_jwt` assertion. Both are now `it.each` loops over every directory `readdirSync('supabase/functions')` finds (excluding `_shared/`), the same fix the Step 4 review applied to `EXPECTED_MIGRATIONS`: a function added later without deliberate consideration fails the loop rather than going unchecked. The "documented commands" test also gained `test:server-unit`/`test:server-integration`, missing since Step 7 added them. (3) `tests/server-integration/whoami.integration.test.ts`'s `beforeAll` warm-up declared 20 attempts at 1 s apart but each attempt's own timeout was 20 s (`callWhoAmI`'s constant, reused by mistake) against a 30 s hook budget — arithmetically only ~1.5 attempts could ever run before Vitest killed the hook itself, and the loop swallowed every failure silently. Given its own short timeout constant (2 s) and a hook budget sized to the loop's actual worst case (20 × (2 s + 1 s) = 60 s, plus headroom = 70 s), plus a `console.warn` if every attempt is exhausted so a real persistent failure is not mistaken for one of the tests' own. (4) No Edge Function handles CORS or `OPTIONS` yet — recorded as finding F11 in `memory-bank/server-threat-model.md` §8 rather than fixed now, since nothing calls a function directly from a browser yet (Step 8's sign-in goes through the Auth client SDK, not a function in this repository); the finding assigns the obligation to whichever step first adds that call. (5, unaddressed by design) `art-source/cat-role-catalog/surface-elevator-tower/` (13 files, 11 MB, untracked) sits in the same working tree as this milestone's changes but belongs to the concurrently authorized asset-catalog work, not the server milestone; it is excluded from every commit made for this work, as it has been throughout. Verified after the first four fixes: lint clean, 386 unit tests (up from 378), `npm run verify:server` passes all 13 checks including the pinned-version assertions, and the full 42-test E2E suite passes.

- 2026-09-09 a follow-up review caught a sixth finding the pass above missed entirely — not recorded as one of "five findings," not fixed, not noted as deferred: `resolveCallerViaSupabaseAuth` answered a missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` by returning `null`, which `handleWhoAmI` reads as "this token is invalid" and answers `401 unauthenticated`. That is the highest-severity kind of gap this review style exists to catch, because it inverts `save-sync`'s own already-established rule in `probeDatabase`/`handleHealth` — "does not answer a configuration mistake with a retryable code," itself protected by a dedicated unit test — for the newer function that explicitly documents itself as the pattern later authenticated routes should copy. A deployment missing its environment would tell every caller, valid token or not, that their credential was bad; a client that treats 401 as "sign out and re-authenticate," the ordinary reading of that code, would sign every user out in a loop against a database that was never broken. No test exercised this path, because the local edge runtime always injects the environment variables. Fixed by making the resolver throw instead of returning `null`: `handleWhoAmI` does not catch it, so the error propagates to the `Deno.serve` wrapper's existing catch, which already converts any propagated error to `500 server_error` — no change to `handleWhoAmI` itself was needed. Two tests now guard the two halves of this: `whoami-check/index.test.ts` asserts a thrown resolver error rejects `handleWhoAmI`'s promise rather than resolving to 401, and `tests/unit/server-stack.test.ts` gained a static-source assertion, mirroring `save-sync`'s own, that the missing-config branch throws rather than returning `null` — mutation-proven directly: reverting the fix to `return null` failed the new static assertion while every pure-handler unit test still passed unaffected, which is exactly why the static check exists — the fake-resolver unit tests can prove `handleWhoAmI`'s contract but can never see which code path the *real* resolver takes. Also fixed in the same pass: the version-pin comment in `whoami-check/index.ts` still said to keep the two versions identical "by hand," which by then was stale — the comment now points at the test that enforces it. Verified: 20 Deno unit tests, 387 client unit tests, all 13 `npm run verify:server` checks (confirming the real resolver still answers 200 against the live stack, where the environment is genuinely configured), lint, and `git diff --check` all pass.

- 2026-09-09 first real GitHub Actions run (`.github/workflows/ci.yml`, added at Step 5) surfaced a genuine E2E flake unrelated to the server milestone: `tests/e2e/production-stages.spec.ts`'s "keeps surface carts empty when the tower queue is empty" failed once on the shared runner with `cartX` unchanged after a fixed 1,500 ms `page.waitForTimeout`, while every sibling assertion on the same cosmetic surface-hauler clock elsewhere in that file already polls with `expect.poll(..., { timeout: 6_500 })` instead of sampling once after a flat delay. The animation clock accumulates from zero at boot rather than from wall-clock time, so a frozen read only happens when the browser drops real frames for the whole sampled window — plausible on a slower/contended shared runner, not reproduced across several local repeats. Fixed by switching this one assertion to the same `expect.poll` idiom and timeout budget the rest of the file already uses, rather than touching any game logic; the now-redundant direct re-check of `cartX` after the poll was removed. Verified: 3 repeated local runs pass, the full 42-test E2E suite passes, and lint/unit tests are unaffected. No gameplay, save-document, or schema change; unrelated to Steps 1-7 of the server milestone.

- The user validated Step 7 and authorized Step 8 on 2026-09-09.

- 2026-09-09 server-milestone Step 8: the anonymous guest session, opening
  Phase 2 (Identity). `enable_anonymous_sign_ins` flips to `true` in
  `supabase/config.toml` (`anonymous_users = 30`/hour was already configured).
  `@supabase/supabase-js` moves from `devDependencies` to `dependencies`,
  exact-pinned at the same `2.116.0` `whoami-check`'s Deno import already
  used, because `src/platform/web/supabaseClient.ts` is the first `src/`
  import of it: `createSupabaseClient()` returns `null`, attempting no network
  call, when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` is unset — a
  checkout with no `.env.local` stays exactly as playable as before.
- `src/platform/web/guestSession.ts`'s `ensureGuestSession` mirrors the
  injected-collaborator pattern `whoami-check`'s `ResolveCaller` established:
  a narrow `GuestAuthClient` slice of `SupabaseClient['auth']`
  (`getSession`/`signInAnonymously`), faked by
  `tests/unit/guest-session.test.ts` rather than mocking the SDK. It never
  throws — reusing a session, signing in fresh, a rejected call, and a
  disabled/unreachable auth service all resolve to a typed
  `signed-in`/`sign-in-failed`/`unconfigured` result. `src/main.ts` constructs
  the client once and calls it without awaiting before
  `loadActiveGame`/`createGame`, publishing the result as a `DEV`-only
  `app.dataset.guestSession` diagnostic, the same convention `BootScene`
  already uses.
- Proving "two browsers receive different identities" needs a real GoTrue, so
  Step 8 adds a second, Docker-dependent Playwright suite kept out of the
  Docker-free `npm run test:e2e`: `playwright.server-e2e.config.ts` (port
  4176) and `tests/server-e2e/guest-session.spec.ts`. Three scenarios: a fresh
  browser boots playable holding a real anonymous session; every
  `**/auth/v1/**` request aborted still boots the game and a forced
  `visibilitychange` flush (the same mechanism
  `tests/e2e/lifecycle-persistence.spec.ts` already drives) still reaches
  IndexedDB across a reload; two fresh browser contexts receive distinct
  `user.id`s whose access tokens each answer only for themselves through the
  live `whoami-check` function, called directly from the Node test process
  (no CORS concern). `scripts/verify-server-stack.mjs` runs
  `npm run test:server-e2e` after `test:server-integration`, feeding it
  `API_URL`/`ANON_KEY` read from a live `supabase status --output json` —
  CI needs no `.env.local`, and a developer's own file is untouched.
- One empirical finding, not assumed: `enable_anonymous_sign_ins` is read by
  the GoTrue container at boot, not by `supabase db reset` — a stack already
  running from before the config edit still answered
  `anonymous_provider_disabled` (confirmed directly with `curl` against
  `/auth/v1/signup`) until fully stopped and restarted. A genuinely clean
  checkout never hits this.
- `CLAUDE.md` and `README.md` both asserted "nothing in `src/` makes a network
  call" — corrected in the same change to name the one non-blocking call this
  step adds and confirm the game stays exactly as playable without it.
- Step 8 evidence: `npm run verify:server` passes end to end from a
  completely clean `supabase stop`/`start`/`db reset` cycle, including all
  three new `test:server-e2e` scenarios. The full client gate was re-run:
  lint clean, 398 unit tests, all 42 Chromium E2E tests, strict build, secret
  scan (confirming `VITE_SUPABASE_ANON_KEY` is the only Supabase-related
  value in `dist/`, no service-role key), and all 9 production smoke tests
  pass.

- 2026-09-09 review of the Step 8 working tree: ten findings, six fixed in
  place before the gate, three fixed as valuable cleanups, one confirmed
  unrelated. (1) `.github/workflows/ci.yml`'s `server` job ran `npm ci` then
  straight into `npm run verify:server`, which now runs a real Chromium
  suite — the job had no browser installed at all and would have died with
  "Executable doesn't exist" on its first CI run. Added
  `npx playwright install --with-deps chromium` between them, matching the
  `client` job's own step; bumped `timeout-minutes` from 20 to 25 for the
  added suite; corrected the job's name/comment, which still described only
  Steps 4–7 (the same staleness a Step 6 review already found and fixed
  once). (2) `playwright.server-e2e.config.ts` used the default `'html'`
  reporter, which on a local failure opens a blocking `show-report` server on
  `:9323` — fatal under `scripts/verify-server-stack.mjs`'s `spawnSync`
  invocation, which would hang rather than report `FAIL`, and whose default
  `playwright-report/` output would also collide with the main E2E suite's
  report. Switched to `'line'`, the same choice
  `playwright.production.config.ts`/`playwright.performance.config.ts` already
  made for the identical reason. (3) `callWhoAmI`'s retry loop broke on any
  response at all, including a transient non-200 cold-start error, so it
  would not actually retry the case it exists for; and its 10-attempt budget
  (up to 30 s) could exceed the config's implicit 30 s default test timeout
  once a page boot and session round trip were added on top — the same
  margin bug a Step 7 review already fixed once for the comparable
  integration-suite warm-up loop. Now retries on `!response.ok` too, at 6
  attempts (18 s worst case) under an explicit 60 s per-test `timeout` in
  the config. (4) A static `@supabase/supabase-js` import added +58 kB gzip
  to the single entry chunk (measured: 1.78 MB raw / 472 kB gzip against a
  1.56 MB / 414 kB Step 35 baseline) — sitting in front of every boot's
  parse/eval cost, configured or not, which is exactly what this step's own
  "must never delay the first frame" rule was written to prevent.
  `createSupabaseClient` now dynamically imports the SDK only once
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are confirmed present; measured
  after the fix, the main chunk is back to 1,570,900 bytes raw / 417.69 kB
  gzip (a few kB, not 58) and the SDK ships in its own 214.56 kB raw /
  55.05 kB gzip chunk fetched only on demand. (5) The "documented commands"
  test in `tests/unit/server-stack.test.ts` listed every server script README
  and CLAUDE.md name except the new `test:server-e2e` — added, the same fix a
  Step 7 review already applied for `test:server-unit`/`test:server-integration`.
  (6, cleanup) The dev-only `data-guest-session` diagnostic published a live
  access token into the DOM; dropped from the published shape (`{status,
  user}` only) since the server-e2e suite that needed a token to call
  `whoami-check` now reads it directly from the Supabase client's own
  `localStorage` entry (`sb-<host>-auth-token`), which existed already and
  needed no new surface. (7, cleanup) Every HMR reload constructed a second
  Supabase/GoTrue client alongside the first one, which is what the SDK's own
  "Multiple GoTrueClient instances detected" console warning was reporting;
  the client promise is now cached on `import.meta.hot.data` and reused
  across reloads, and the dispose handler no longer stops its auto-refresh
  timer, since doing so would have left the *reused* instance unable to
  refresh afterward. (8, cleanup) Added two `ensureGuestSession` unit tests
  ahead of Step 9's identity linking: reusing an existing linked
  (`is_anonymous: false`) session without treating it as a fresh guest, and
  defaulting `isAnonymous` to `false` when a session omits the field
  entirely. (9) Confirmed unrelated to this step: a pasted CI log showed
  `tests/e2e/production-stages.spec.ts`'s "cannot change gold output by
  changing the animation speed" failing on a GitHub Actions runner with
  `page.evaluate: Target page, context or browser has been closed" after
  `page.clock.runFor` — that test does not touch anything Step 8 changed, it
  passed in every local run of the full 42-test suite during this step
  (including after every fix above), and this file already has one prior,
  separately-fixed CI-only flake in the same cosmetic-animation-clock family
  (recorded above, 2026-09-09). Recorded here rather than investigated
  further, since it is out of this step's scope. Verified after fixes 1–8:
  lint clean, 398 unit tests, all 42 Chromium E2E tests, strict build, secret
  scan, 9 production smoke tests, and `npm run verify:server` (all checks,
  including the reorganized `test:server-e2e`) pass.

- 2026-09-09 a follow-up review caught an eleventh finding: fix 4 above
  (dynamic import) made `createSupabaseClient` return a promise that can
  reject — a flaky network fetching the lazy chunk, or a stale chunk hash
  after a redeploy — and `src/main.ts`'s `void`-ed promise chain had no
  `.catch` around it. `ensureGuestSession`'s own try/catch covers only the
  collaborator calls made *inside* it, not the client-construction promise
  one level above it in `main.ts`, so the rejection skipped straight past
  `.then((client) => ensureGuestSession(...))` to an unhandled rejection —
  breaking `guestSession.ts`'s own documented "this never throws" contract
  from one level up, even though the game itself keeps playing (Phaser boots
  independently of this chain). Neither existing suite could have caught it:
  the Docker-free `tests/e2e/` dev server never bundles, so there is no lazy
  chunk to fail, and `tests/server-e2e/`'s network-blocking test only targets
  `**/auth/v1/**`. Fixed with one `.catch` between the two `.then`s, folding
  any rejection into `sign-in-failed` (not `unconfigured`, which stays
  reserved for "no Supabase project configured at all"). A new production
  smoke test, `tests/production/production-smoke.spec.ts`'s "continues
  playing when the lazily-loaded Supabase chunk fails to fetch," blocks
  `**/assets/dist-*.js` (the SDK's own chunk; confirmed stable across two
  separate builds) against the real optimized bundle and asserts both that
  the HUD still renders and that no `pageerror` fires — mutation-proven
  directly: reverting the `.catch` fix reproduces the exact unhandled
  rejection message
  ("Failed to fetch dynamically imported module: .../assets/dist-*.js") as a
  `pageerror`, restoring it passes again. Verified: lint clean, 398 unit
  tests, 42 Chromium E2E tests, strict build, secret scan, 10 production
  smoke tests (up from 9), and `npm run verify:server` all pass.

- 2026-09-09 a third review pass caught a twelfth finding, in the eleventh's own fix: the
  new production-smoke test was a false green on CI, the one place it gates.
  `createSupabaseClient` checks `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
  *before* its dynamic `import()`, and Vite inlines both at build time, so a
  build with neither set makes the guard constantly true and the bundler
  eliminates the import entirely — no lazy chunk is emitted at all. CI has no
  `.env.local`, so `page.route('**/assets/dist-*.js', abort)` matched nothing,
  aborted nothing, and left every assertion trivially true. Reproduced
  directly, three ways: a build without the two variables emits only
  `index-*.js` and the CSS (no `dist-*.js`); with the `.catch` deliberately
  removed, the test still passed in 4.3 s against that build; with the same
  mutation against a configured build, it failed as intended. The chunk's
  absence is correct behaviour, not a defect — an unconfigured build *should*
  ship no SDK — so the test simply cannot be meaningful there, and the fix
  splits the concern rather than forcing a chunk into existence. One rejected
  approach is recorded because it looked obvious and was wrong: giving
  `playwright.production.config.ts` placeholder `VITE_` values so the chunk
  always builds broke 8 unrelated specs, because the resulting sign-in attempt
  surfaces as a real failed request (`net::ERR_UNSAFE_PORT` for the first
  placeholder tried; any unreachable host gives `ERR_CONNECTION_REFUSED`
  instead) in the specs that assert no request fails and no browser error
  fires. Any placeholder producing real network traffic has that problem, so
  the config was left untouched. Fixed in two parts instead. (a)
  `tests/production/production-smoke.spec.ts` now identifies the SDK chunk by
  its *contents* (`GoTrueClient` present, entry-chunk marker absent) rather
  than by a `dist-*` glob — that name is one rolldown derives from the `dist/`
  directory inside `@supabase/supabase-js`, so an SDK layout change or bundler
  rename would have silently unhooked the route even on a configured build —
  counts the aborts it performs and asserts the count is non-zero, and
  `test.skip`s with a stated reason when the build emitted no chunk, so an
  unconfigured build reports a visible skip rather than a false pass or a false
  failure. (b) `tests/unit/server-stack.test.ts` gained
  `describe('the guest-session bootstrap in src/main.ts')` — three
  static-source assertions (the chain is `void`-ed and never awaited before
  boot, a `.catch` sits between its two `.then`s, and the published diagnostic
  goes through `toPublicGuestSessionDiagnostic` rather than stringifying the
  raw result with its token) — carrying the gate that actually runs on every
  CI push, with no Docker and no `.env.local`. This is the same
  static-assertion-beside-behavioural-test pattern a Step 7 review already
  established for `resolveCallerViaSupabaseAuth`, and for the same reason:
  `src/main.ts` is a module of top-level side effects no unit test can import.
  Mutation-proven across all four combinations — with the `.catch` removed the
  unit gate fails (CI condition, no Docker or env needed) and the production
  spec fails against a configured build; with it restored the production spec
  passes and reports a real aborted chunk request, and the full production
  suite in the CI condition is 9 passed with 1 visible skip, the 8 specs the
  rejected placeholder approach had broken all healthy again. Verified: lint
  clean, 401 unit tests (up from 398), 42 Chromium E2E tests, strict build,
  secret scan, 10 production smoke tests, `npm run verify` exits 0.


## Full server-milestone step table, with evidence

`progress.md` keeps a compact Step/Status version of this table. The
evidence column below is the provenance.

## Server Milestone Step Status

| Step | Status | Evidence |
|---|---|---|
| 1 — Record scope, threat model, and open questions | Validated by the user on 2026-09-08 | `memory-bank/server-threat-model.md`. Documentation only: no code, no balance value, no schema version changed. |
| 2 — Design the save-sync protocol | Validated by the user on 2026-09-08 | `memory-bank/server-save-sync-protocol.md`. Documentation only: no code, no balance value, no schema version changed. |
| 3 — Design the database schema | Validated by the user on 2026-09-08 | The complete Postgres schema now appears byte-identically in `memory-bank/architecture.md` and `memory-bank/techContext.md`, replacing the "Relational/server database schema: none" statement in each. Documentation only: no migration, no database, no client schema version changed. |
| 4 — Stand up the Supabase project and local stack | Validated by the user on 2026-09-08 | Supabase CLI 2.117.0 pinned exactly; `supabase/config.toml`, one bootstrap migration, `save-sync` Edge Function serving protocol §10.1, `.env.example`, `npm run verify:server`, `npm run scan:secrets`, and 19 static invariants in `tests/unit/server-stack.test.ts` plus 10 scanner regressions in `tests/unit/bundle-secret-scan.test.ts`. All nine checks pass from a clean checkout against an empty Docker volume set; four defects found in user review are fixed with regressions. No client code, gameplay, balance value, or schema version changed. |
| 5 — Add migrations and CI | Validated by the user on 2026-09-08 | `supabase/migrations/20260908130000_create_platform_tables.sql` lands all six Step 3 tables plus RLS matching the Step 3 matrix exactly; `supabase/seed.sql` gains one local-only fixture guest; `.github/workflows/ci.yml` adds `client` and `server` jobs; `package.json` gains `verify:all`. `npm run verify:server` passes with the expected migration list read from disk. No client code, gameplay, balance value, or schema version changed. Further hardening before the Step 6 gate: `search_path = ''` pinned on the shared trigger function, `leaderboard_entries` closed a `?select=user_id` enumeration path with column-level grants, and `EXPECTED_MIGRATIONS` was replaced by a directory read. |
| 6 — Make the core simulation runnable on the server | Validated by the user on 2026-09-09 | `supabase/functions/core-portability-check` imports `npm run build:server-core`'s generated bundle of `src/core`, `src/config`, and `src/persistence/saveSchema.ts` and reproduces a fixed ten-minute run on the real local edge runtime — gold `"100"` → `"3080"` — byte-for-byte identical to `tests/unit/server-core-portability.test.ts`'s pinned result for the unbundled source. `eslint.config.mjs` bans the `Deno` global and `(^|/)supabase(/|$)` imports inside `src/core/**`; `tests/unit/architecture.test.ts` probes both. Mutation-proven: doubling a floor's yield moved the pinned client assertion and the live function's gold (to `6060`) together before the edit was reverted. Resolved finding F2 (`break_infinity.js`/Deno, unproven) and discovered a new one, F10 (Deno does not extension-complete a relative specifier — a bundle, not an import map, is what makes `src/core` portable here), both recorded in `memory-bank/server-threat-model.md` §8. No client code, gameplay, balance value, or schema version changed. A 2026-09-09 review found and fixed six defects before the gate: a missing `publicDir: false` was copying 2.9 MB of game art into `supabase/functions/` on every build; the new import ban missed the `@supabase/*` npm scope; the verification script's JSON-text comparison could disagree with the unit test's structural one; a non-200 portability response was retried 20 times though it can only be deterministic; `vite.server-core.config.ts` was untyped-checked; and the CI job name was stale. |
| 7 — Add the Edge Function test harness | Validated by the user on 2026-09-09 | `deno-bin@2.1.4` (pinned to the edge runtime's own reported Deno compatibility version) gives `npm run test:server-unit` a real `deno test` runner: 19 tests across `_shared/http.test.ts`, `save-sync/index.test.ts`, and the new `whoami-check/index.test.ts`, every one importing its handler directly and running with zero `--allow-*` flags. `whoami-check` — Step 7's "trivial authenticated endpoint" — splits `handleWhoAmI` (pure HTTP logic over an injected `ResolveCaller`) from `resolveCallerViaSupabaseAuth` (the one real collaborator, using the new `@supabase/supabase-js` client dependency), so the unit suite fakes the former and `tests/server-integration/whoami.integration.test.ts` — a separate Vitest suite in `vitest.server-integration.config.ts`, excluded from `npm test`'s glob — exercises the latter against the live stack. `tests/server-integration/authFixture.ts` mints an HS256 JWT for the seeded fixture guest, fixing "the fixture pattern for an authenticated caller." `save-sync` and `core-portability-check` gained an `import.meta.main` guard around `Deno.serve` (proven live: both still serve after the change) and their duplicated response envelope moved to `supabase/functions/_shared/http.ts`. `scripts/verify-server-stack.mjs` runs the unit suite before the stack starts and the integration suite once the database is reset — both from a clean `supabase db reset`. A real bug surfaced live rather than being assumed away: the seeded `auth.users` row left four GoTrue token columns NULL, which GoTrue's own row scanner cannot read as a string, so any real `auth.getUser` call 500'd — never triggered by Steps 4-6, which only ever handed PostgREST a hand-signed JWT directly. Fixed by seeding those columns as `''`. A first review pass fixed four smaller findings and missed a sixth, more serious one: `resolveCallerViaSupabaseAuth` answered a missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` with the same `401 unauthenticated` a genuinely bad token gets, inverting `save-sync`'s own established "does not answer a configuration mistake with a retryable code" rule — a client treating 401 as "sign out and re-authenticate" would sign every user out in a loop against a deployment that was simply misconfigured. A follow-up review caught it; fixed by making the resolver throw so the existing `Deno.serve` catch turns it into `500 server_error` instead, guarded by a new pure-handler propagation test plus a static-source assertion mirroring `save-sync`'s, both mutation-proven. |
| 8 — Anonymous guest session | Implemented on 2026-09-09, awaiting user validation | `enable_anonymous_sign_ins = true` in `supabase/config.toml`; `@supabase/supabase-js` promoted to `dependencies` (exact `2.116.0`, matching the Deno-side pin) as `src/platform/web/supabaseClient.ts` becomes the first `src/` import of it — dynamically, so the SDK ships in its own on-demand chunk rather than the entry chunk every boot parses first (a 2026-09-09 review measured +58 kB gzip from a static import and required the fix). `createSupabaseClient()` resolves `null`, attempting no network call and downloading nothing, when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` is unset. `src/platform/web/guestSession.ts`'s `ensureGuestSession` takes an injected `GuestAuthClient` (mirroring `whoami-check`'s `ResolveCaller`), never throws, and resolves `signed-in`/`sign-in-failed`/`unconfigured`; `src/main.ts` calls it without awaiting before boot and publishes `{status, user}` — no access token — as a `DEV`-only diagnostic, and caches the client promise on `import.meta.hot.data` so HMR reuses one GoTrue instance rather than leaking a new one every reload. A new Docker-dependent Playwright suite (`playwright.server-e2e.config.ts`, port 4176, `line` reporter, `tests/server-e2e/guest-session.spec.ts`) proves what nothing fakeable locally can: a fresh browser holds a real anonymous session; a blocked auth service never delays boot and local saves still persist through a forced lifecycle flush; two browser contexts get distinct identities whose access tokens — read from the Supabase client's own `localStorage` entry, not the DOM — each authenticate as themselves only against the live `whoami-check` function. `scripts/verify-server-stack.mjs` runs this suite after `test:server-integration`, feeding it `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from a live `supabase status --output json`; `.github/workflows/ci.yml`'s `server` job gained its own `npx playwright install --with-deps chromium` step. `tests/unit/server-stack.test.ts`'s two `@supabase/supabase-js` pin assertions flipped from `devDependencies` to `dependencies`, and its documented-commands list gained `test:server-e2e`. `CLAUDE.md`/`README.md` corrected: "nothing in `src/` makes a network call" no longer holds. A 2026-09-09 review found ten issues, fixed the first six before the gate (the CI job's missing browser install, the E2E config's blocking `'html'` reporter, `callWhoAmI`'s retry-math/error-handling bug, the static-import bundle regression, the missing `test:server-e2e` test-list entry, and the CI job's stale name), applied two more as cleanups (dropping the DOM access token, the HMR client cache), added two `ensureGuestSession` unit tests ahead of Step 9, and confirmed one pasted CI failure (`production-stages.spec.ts`'s animation-speed test) as a pre-existing, unrelated flake. `npm run verify:server` (all checks, including the fixed suite) and the full client gate (398 unit tests, 42 E2E, build, secret scan, 9 production smoke) pass after the fixes. A follow-up review caught an eleventh finding: the dynamic-import fix made `createSupabaseClient` reject-capable (a flaky network or a stale chunk hash after redeploy), and `src/main.ts`'s promise chain had no `.catch`, so a rejection reached an unhandled rejection past `ensureGuestSession`'s own try/catch, which only covers its internal collaborator calls. Fixed with one `.catch` folding any rejection into `sign-in-failed`; a new production-smoke test blocks the SDK's own lazy chunk (`**/assets/dist-*.js`) against the real built bundle and asserts no `pageerror`, mutation-proven against the pre-fix code. Final: 401 unit tests, 42 E2E, 10 production smoke, `npm run verify` exits 0, `npm run verify:server` all pass. A third review pass caught a twelfth finding in the eleventh's own fix: that production-smoke test was a false green on CI, because a build without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` inlines both as `undefined`, makes `createSupabaseClient`'s guard constantly true, and lets the bundler eliminate the dynamic import — so no lazy chunk is emitted and the `dist-*` route matched nothing (reproduced: with the `.catch` removed it still passed in 4.3 s against such a build). The spec now identifies the chunk by contents rather than by a fragile rolldown-derived name, counts its aborts and asserts the count is non-zero, and `test.skip`s visibly when the build emitted no chunk; `tests/unit/server-stack.test.ts` gained three static-source assertions on `src/main.ts`'s bootstrap that carry the gate on every CI push with no Docker. Mutation-proven in all four combinations. |
| 9 — Identity: profiles and row-level security | Implemented on 2026-09-10, awaiting user validation | `handle_new_user()`/`on_auth_user_created` trigger creates every `profiles` row on sign-up (`security definer`, `search_path = ''`); `profiles-rls.integration.test.ts` proves user A cannot select/insert/update/delete user B's row, mutation-verified by dropping the trigger live. See `## Status Summary` above and `activeContext.md` for full detail. |
| 10 — Google sign-in | Implemented on 2026-09-10, guided live-Google verification passed the same day, awaiting user validation | `linkIdentity`/`signInWithOAuth` via `beginGoogleSignIn`, keeping the guest's `auth.users` id through linking. A real human completed Google's own consent screen via the `chrome-devtools` MCP tools; a same-day and a follow-up review fixed five issues total (an unhandled-rejection reintroduction, a bundle-secret-scan gap, a wrong claim about the identity-collision surface corrected after live reproduction, and a test/code mismatch on an `options: undefined` credentials shape). See `## Completed` and `activeContext.md` for full detail. |
| 11 — Apple sign-in | Cut on 2026-09-11 | Needs a paid Apple Developer Program membership, a verified real domain, and a deployed HTTPS return URL, none of which `localhost` substitutes for; the user chose to cut the step rather than acquire them (threat-model finding F7's own contingency). No code, config, or test exists for it. |
| 12 — Telegram sign-in | Implemented and fully verified on 2026-09-11, including a live integration proof; a 2026-09-12 review found and fixed one critical pre-account-takeover vulnerability (finding F13) plus three smaller issues, awaiting user validation | Self-contained HMAC-SHA-256 `initData` verification needs no real Telegram account to prove. Critical fix: `[auth.email] enable_signup = false`, closing a window where an attacker could pre-register a Telegram user's deterministic placeholder email before the real user ever signed in. See `## Completed` and `activeContext.md` for full detail. |
| 13 — Guest linking (including the collision) | Implemented on 2026-09-12, awaiting user validation | `detectGoogleIdentityCollision`/`beginGoogleAccountSwitch`, composing Steps 16/17's real endpoints with the save-conflict predicate (Step 18's `resolveSaveConflict`, the completed §7 policy); needed almost no new merge logic since those two steps already cover identity preservation and reconciliation. Built together with Steps 15–17 below in the same session, since its own instructions presuppose cloud save already exists. |
| 14 — Recovery code | Implemented on 2026-09-12, awaiting user validation; a 2026-09-12 review found and fixed five issues (one HIGH), a 2026-09-13 review found and fixed five more, and a follow-up pass on that review fixed three consistency notes plus applied one optional grant-layer hardening, all re-verified (a HIGH-severity issue and a LOW residual the 2026-09-13 review and its follow-up found were in Step 17, not Step 14 — see that row) | New `recovery-code` Edge Function on the unchanged Step 3/5 schema: compare-and-swap rotation/redemption from the start, an id-keyed session-minting adaptation of `telegram-sign-in`'s pattern, and an interim rate limiter later hardened to read the platform gateway's own trusted address hop. See `## Completed`, `architecture.md`'s Step 14 review entries, and `server-milestone-plan.md` for full detail. |
| 15 — `saves` table evidence | Implemented on 2026-09-12, awaiting user validation | The table and its one `saves_select_own` policy already existed from Step 5; this step adds the missing live proof that no client write succeeds. |
| 16 — `PUT /v1/save` | Implemented on 2026-09-12, awaiting user validation; a 2026-09-12 review found and fixed one critical concurrency bug plus smaller issues, re-verified | Real validation, server-owned monotonic `revision`, one-generation rollback. The original blind `upsert` let two concurrent uploads both win, silently discarding one — fixed with a compare-and-swap (`insert` on a first write, conditional `update` on a subsequent one), mutation-proven with genuinely concurrent `Promise.all` uploads. |
| 17 — `GET /v1/save` and boot-time reconcile | Implemented on 2026-09-12, awaiting user validation; a 2026-09-13 review found and fixed a HIGH-severity reload race, and a follow-up pass found and fixed one LOW residual in that fix, both re-verified | `reconcileCloudSaveAtBoot` adopts a remote save silently only when local holds no progress at all, leaving a genuine fork for Step 18. The reload this triggered on adoption fired `pagehide` before the new page loaded, and the lifecycle journal's own "prefer whichever save is chronologically newer" rule then reverted the adopt with a stale in-memory document — an infinite reload loop, latent only because Step 19's upload path is unbuilt. Fixed by unbinding the lifecycle hooks before reloading, so nothing journals a stale document during that specific reload at all. **LOW residual:** unbinding stops a *new* journal write but not one already sitting there from earlier in the same session (backgrounding the tab during boot), which could still win once and revert the adopt (not loop — the next boot clears it). Fixed with a new unconditional `WebLifecycleSaveJournal.clear()`, called right before reload, kept separate from the routine flush's own conditional clear. |
| 18 — Conflict resolution | Implemented on 2026-09-13, awaiting user validation | `src/persistence/saveConflictPolicy.ts` (`compareProgress`/`resolveSaveConflict`/`describeSaveConflictCandidate`) implements §7's dominance rule and §7.3's display fields, replacing Step 17's narrower `hasAnyProgress`/`reconcileGuestUpgrade`; the boot reconcile applies the full policy and retains both candidates on a genuine fork. New `tests/server-integration/save-conflict-resolution.integration.test.ts` (4 tests) proves the step's own two-device test through the real `409`. See `## Completed` and `activeContext.md` for full detail. |
| 19 — Client remote repository | Implemented on 2026-09-13, awaiting user validation; a 2026-09-14 review found and fixed one HIGH, three MEDIUM, and six LOW issues, all re-verified | `ReplicatingActiveSaveRepository` composes the Dexie/lifecycle-safe local repository with the pure `CloudSaveReplica` (§9 cadence/coalescing/backoff and §7's `409` handling via `resolveSaveConflict`) and the one `fetch` in `cloudSaveUpload.ts`; `reconcileCloudSaveAtBoot`'s new `onServerRevision` arms the replica with the server's revision before its first upload, and `src/main.ts` wires the three §9 forced triggers and retains an upload fork's candidates in `pendingSaveConflict`. `src/core` is lint-banned from `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource` with an `architecture.test.ts` probe. 45 new unit tests; 51 Chromium E2E pass both configured and with `.env.local` removed. The 2026-09-14 review: H2 — §4's player-facing copy is now surfaced through the banner (`describeCloudSaveNotice`); M3 — a rejected document is remembered and not re-uploaded; M4 — local saves are suspended while a mid-session remote is adopted; M5 — the protocol and schema-copy documents now describe the V2 wire format; L6–L10 — coalescing preserved on `local-dominates`, five retries so the 16 s step is reached, per-trigger attempt reset, `charset=utf-8`, and a parsed `receivedAt`; L11 — `save-sync` migrates an older schema instead of refusing it. A second 2026-09-14 pass found **C1** (the upload fork must stop the replica, or a later save replaces the unshown remote branch) and the **M3 residual** (the dropped-document key must be the state's shape, not the moving document), both fixed. A third pass found **R1 (LOW residual)**: that shape key alone suppressed every later valid save while `isStopped` reported live, so a forced trigger now bypasses it and a successful upload clears it. See `## Completed` above for full detail. |
| 20 — Adopt existing local saves | Implemented on 2026-09-14, awaiting user validation; a 2026-09-14 review found one MEDIUM and four LOW issues, all fixed | `adoptExistingLocalSave` (`src/platform/web/cloudSaveReconcile.ts`) migrates a pre-milestone version-1 local document through the shared `validateSaveDocument` and force-uploads it on first sign-in (`no-cloud-save`); `main.ts`'s boot-reconcile trigger delegates to it and publishes a DEV `localSaveAdoption` diagnostic. Evidence: 6 unit tests (progressed migration, legacy four-floor expansion, no-local-save, unreadable, rejecting repository, `upload-failed`), `tests/server-integration/adopt-existing-save.integration.test.ts` (3 — byte-for-byte `PUT`/`GET`, progress preserved with only `schemaVersion` and the added counter differing, server migrates a raw v1 upload), and `tests/server-e2e/adopt-local-save.spec.ts` (seeds a real v1 IndexedDB save and proves the cloud copy is byte-for-byte the captured flushed local document). Review fixes: M1 — the flaky final poll now compares against a captured constant; L2 — `upload-failed` is distinct from `unreadable`; L3 — DEV diagnostic added; L4 — progressed fixture plus a legacy four-floor test; L5 — `activeContext.md` no longer overstates the behavioural change. See `## Completed` above for full detail. |
| 21 — Survive local storage eviction | Implemented on 2026-09-14, awaiting user validation; the iOS Safari seven-day deletion measurement is outstanding (finding F8); a 2026-09-14 review found one MEDIUM and four LOW issues, all fixed | `ensureGuestSession` gained `isNewSession`; pure `shouldExplainMissingLocalSave` over a three-way `LocalSaveState` (`saved`/`missing`/`unreadable`) + the `local-save-missing` banner notice (guest-path-only); `requestPersistentStorage` + DEV `data-persistent-storage`; `onServerRevision` moved to `kept-local`/`same-progress` and the replica stopped on `adopted-remote`. Evidence: unit tests (`guest-session`, `local-save-restore`, `persistent-storage`), three server-e2e specs (`local-save-eviction.spec.ts` — restore, honest notice, corrupt-save preserved), and a client-e2e measurement (`persistent-storage.spec.ts`). The `persist()` half measured `{supported:true,persisted:false,quotaBytes:9663676416,usageBytes:0}` in headless Chromium on 2026-09-14; the seven-day deletion half needs a real device. Review fixes: M1 — the notice distinguishes missing from unreadable and never overwrites `corrupt-save`; L2 — the inert Telegram assignment removed and the notice documented guest-path-only; L3 — the Save Diagnostic Surface documents all four sources; L4 — the join can no longer hang; L5 — the e2e stubs both save-sync methods. See `## Completed` above for full detail. |
| 22 — The server clock is the only clock | Implemented on 2026-09-14, awaiting user validation; a 2026-09-15 review found one HIGH, two MEDIUM, and four LOW issues, all fixed | Pure `calculateOfflineGrant` shared by the client projection and `save-sync`'s `GET /v1/save`; the download carries `offlineGrant` from the stored `received_at` to the server's `now()`; the pure `chooseOfflineReward` credits the server grant bounded by the local projection (`min`) and falls back to the projection only where no server figure can exist (a failed download credits nothing); the download has a 10 s timeout; the applied receipt is marked on claim. Evidence: core parity/cap/future tests, `chooseOfflineReward` unit tests, server unit tests proving the document clock cannot move the grant, `tests/server-integration/offline-grant.integration.test.ts` (3), and `tests/server-e2e/offline-grant.spec.ts`. The client E2E config pins the Supabase env blank. A follow-up 2026-09-15 review fixed H2-R (a null/zero projection is a zero bound, not an absent one), H1-R (`sign-in-failed` is not a fallback; only `unconfigured`/`no-cloud-save` are), and L5 (`productContext` states the deferred-reward behaviour). See `## Completed` above for full detail. |
| 23 — Upper-bound re-simulation | Implemented on 2026-09-14, awaiting user validation; a same-day review found and fixed six issues (two HIGH) and left one MEDIUM open (N1) recorded as a stated limit, re-verified | Pure `evaluateProgressBound` (`src/core/anti-cheat/progressBound.ts`, exported from `src/core/index.ts` and bundled into the Step 6 server-core bundle) bounds an uploaded document against the last accepted one using the shared core's rate and batch-cost functions on the candidate's final configuration held for the whole interval — `O(floors)`, no ticks simulated, since the interval can exceed `MAX_CATCH_UP_MS` and an `O(elapsed)` walk would blow the §7.1 latency budget. It bounds each unlocked floor's `totalExtracted`/`totalTransported` (transport capped by the shared elevator's throughput), `warehouse.totalGoldDelivered`, `warehouse.totalOfflineGoldClaimed`, and `state.upgradeSpend` — never current `gold`, the same exclusion §7's progress vector makes. `PROGRESS_BOUND_TOLERANCE = 0.05` is pinned from both sides by `tests/unit/progress-bound.test.ts` (9 tests), so widening it silently fails; the direction is biased toward acceptance per threat model §1/F3. `save-sync`'s `handleSaveUpload` calls `findProgressBoundViolation` after the `baseRevision` check and before the write, returning `422 save_rejected` with `detail: { counter, claimed, maximum }` and leaving the row and revision unchanged; a first upload is exempt and an unreadable stored row skips the check rather than rejecting. Review fixes: **F1 (HIGH)** — each counter now carries the material already in the pipeline (in-flight cycle, floor queue, elevator load, warehouse input), so a warm mine over a short interval is accepted; **F2 (HIGH)** — when the tight bound (from the stored row) fails and the row's one-generation ancestor exists, the check is retried against that ancestor, so a §7 `409` re-upload of a branch that diverged from it commits (`StoredSaveRow` gained `previous_document_json`/`previous_received_at`); **F3** — warm-interval and ancestor-anchor regressions added, `saveAgeFixture.ts`'s role narrowed; **F4** — an unparseable `received_at` now skips instead of imposing the strictest bound; **F5** — the spend allowance is one earning term, not two; **F6** — `architecture.md`'s file-responsibility row names the module. Evidence: 9 core unit tests, server unit tests in `supabase/functions/save-sync/index.test.ts`, `tests/server-integration/save-rejection.integration.test.ts` (live rejection + honest-accept), and the conflict/collision suites' `409` re-upload committing through the ancestor anchor with no extra aging. All gates pass: `verify` (unit 637, E2E 52, build, production smoke), `verify:server` (server unit 104, integration 85, server-e2e 8). |
| 24 — Rejection handling | Implemented on 2026-09-14, awaiting user validation; a 2026-09-14 review found and fixed four issues (two HIGH, one MEDIUM, one LOW), re-verified | `save-sync`'s `handleSaveUpload` writes exactly one append-only `save_audit` row per authenticated `PUT /v1/save` attempt through the new `writeSaveAudit` dep (`writeSaveAuditViaServiceRole`; `save_audit` grants no client role any access, so this is the function's second and last service-role use). The row carries `outcome` (`accepted`/`rejected`), `error_code` (present exactly when rejected), the client's claimed `base_revision`, the server's `resulting_revision` (present exactly when accepted), `document_bytes`, `client_reported_at` (the document's own `savedAtTimestampMs`, recorded and never trusted), and a `detail` with the server-authored reason (a Step 23 bound violation's `{counter, claimed, maximum}`, a validation `reason`, a conflict's `serverRevision`, the size cap, or a malformed-body reason). Accepted attempts are recorded too; the write is best-effort (logged, never fatal); unauthenticated requests write nothing. The player-facing half was already built by Step 19 and is now pinned: a `save_rejected` is terminal-but-keep-syncing, so the replica drops that document (shape-suppressed; a forced trigger retries and a success clears it), keeps the local save and the session playable, and shows the `cloud-sync-save-rejected` notice. Review fixes: **H1 (HIGH)** — the client instant is bounded to the `timestamptz` round-trippable range (years 0001–9999) with the raw out-of-range value kept in `detail.clientReportedAtOutOfRangeMs`; previously a year-10000+ value formatted to an extended-year ISO string Postgres refuses, aborting the insert and erasing the attempt's row; **M1 (MEDIUM)** — an unexpected collaborator failure (`readCurrentSave`/`writeSaveRow` throwing, the `request.text()` read, building a `409` from a corrupted row, or the non-`SaveDocumentError` rethrow) is caught and recorded as a `rejected`/`server_error` row before the 500; **H2 (HIGH)** — `baseRevision` is validated against §5 (null or a positive safe integer; anything else is a recorded `400 malformed_request`) before it reaches the audit's `bigint` column, and `writeSaveAuditViaServiceRole` coerces non-safe-integer revisions to null and clamps `document_bytes`; **L1 (LOW)** — the Content-Length path marks its `document_bytes` as `declaredBytes`; **L2 (LOW)** — the per-rejection service-role round trip is carried into Step 25. Evidence: 6 Deno unit tests; `tests/unit/server-stack.test.ts` pins `admin.from('save_audit').insert(`; `tests/server-integration/save-audit.integration.test.ts` (5 live tests including RLS invisibility/unwritability and an unrepresentable client clock still writing its row); `tests/server-e2e/save-rejection.spec.ts` (stubbed `422 save_rejected` → local save intact, production continues, one notice, no uncaught error). All gates pass: `verify` (unit 637, E2E 52, build, production smoke), `verify:server` (server unit 112, integration 91, server-e2e 9). |
| 25–37 | Not started | Blocked by the Step 24 validation gate. |
