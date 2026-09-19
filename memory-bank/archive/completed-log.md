# Archive — Completed work log

## 2026-09-19 — Server milestone Step 32: account audit log

Implemented the separate `public.account_audit` timeline. Database triggers
record identity additions/removals, recovery-code issuance, entitlement grants
and revocations, and rejected saves; the recovery-code function appends a
redemption only after session minting succeeds. The table accepts seven known
event types, owns its timestamp, uses `on delete set null` for the account link,
and denies client access. Service-role insert omits the timestamp column and
ordinary update/delete are revoked, while the server-only RPC is the function
boundary for redemption.

Added the real-stack account-audit integration test and extended the
migration-derived RLS matrix to all seven tables. Step 32 is implemented but
awaits its validation gate; it is intentionally absent from
`archive/acceptance-gates.md` until the user validates it. A review found that
the identity-removal trigger could block `auth.users` deletion after a cascade;
it now records the removal with a null account link, with a regression covering
the deletion path.

## 2026-09-19 — Account settings and save-conflict UI

Added the player-facing settings button and account modal. Guest players can
start Google linking; linked players can inspect identity/version and log out,
which clears the active local save before booting a fresh guest. Genuine cloud
forks now show local/cloud summaries and let the player choose; local choice
uploads against the retained server revision, while cloud choice adopts the
remote document. Verified with build, lint, 690 unit tests, and the live
in-app-browser smoke check.

Finished work from the base-game milestone (Steps 1–37, closed 2026-09-08) and
the server milestone through Step 22. Moved out of `progress.md` and
`activeContext.md` on 2026-09-14 because it is closed history, not live state.

`## Next Steps` and `## Step 32A` are preserved under their original headings
even though both had become logs of *completed* work rather than upcoming work —
that mislabelling is itself part of why the files grew.

Not part of the contract. Append newly finished work here; keep `progress.md`
to live phase status.

## Completed

- Fixed a 2026-09-14 review of **Step 24** (one HIGH, one MEDIUM, two LOW).
  **H1 (HIGH):** `readClientClock` converted the document's `savedAtTimestampMs`
  with `Date#toISOString`; for a year-10000+ value that emits the extended-year
  form (`+010000-...`) Postgres refuses, so the `save_audit` insert threw, the
  best-effort writer swallowed it, and the authenticated attempt left **no row**
  — an attacker probing the Step 23 bound with a far-future clock (or any of
  `schema_unsupported`/`save_invalid`/`revision_conflict`/`save_rejected`, since
  `clientReportedAt` is populated before those checks) erased their own trace.
  The instant is now bounded to the range a `timestamptz` round-trips through
  `Date#toISOString` (years 0001–9999); an out-of-range claim is recorded as a
  null instant with the raw value kept in `detail.clientReportedAtOutOfRangeMs`,
  so the row is written and the divergence still shows. **M1 (MEDIUM):** an
  unexpected collaborator failure — `readCurrentSave` or `writeSaveRow` throwing,
  or the non-`SaveDocumentError` rethrow in validation — propagated past every
  audit path to `Deno.serve`'s catch and returned a 500 with no row; it is now
  caught after the caller resolves and recorded as a `rejected`/`server_error`
  row before the 500, so a repeated crash is visible. **L1 (LOW):** the
  Content-Length rejection path now puts `declaredBytes` in `detail`, marking
  that its `document_bytes` is the client's own header rather than a measurement.
  **L2 (LOW):** every rejection costs a service-role round trip on the response
  path and a caller gets 1-request-to-1-audit-write amplification; that is
  recorded as a Step 25 carry-in rather than fixed here. A follow-up pass found
  **H2 (HIGH)** — the same defect class as H1, reached through `baseRevision`: a
  fractional (`1.5`) or out-of-int8 (`1e300`) value was written straight to the
  audit's `bigint` column, aborting the insert and leaving the attempt with no
  row, which silenced even M1's `server_error` row. `baseRevision` is now
  validated against §5 before `auditContext.baseRevision` is assigned (null or a
  positive safe integer; anything else is a recorded `400 malformed_request`),
  closing the protocol looseness and the audit hole together, and
  `writeSaveAuditViaServiceRole` coerces non-safe-integer revisions to null
  (`normalizeAuditRevision`) and clamps `document_bytes` so the next typed column
  cannot reopen it. **L3 (LOW)** — the remaining unaudited-500 paths
  (`request.text()` on an aborted body, and building a `409` from a stored row
  corrupted out-of-band) are now caught and recorded as `server_error` rows too.
  Re-verified: `npm run lint`, 637 unit tests, 112 Deno server unit tests, 91
  integration tests, 9 server-e2e tests, 52 Chromium E2E, build, secret scan, 10
  production smoke, and `npm run verify:server` all pass.

- Implemented server-milestone **Step 24, rejection handling**, on 2026-09-14,
  on the user's explicit instruction. The `save_audit` table was designed at
  Step 3 and already exists in the Step 5 migration with no RLS policy for any
  client role; Step 24 is its writer. `save-sync`'s `handleSaveUpload` now
  records exactly one row per authenticated `PUT /v1/save` attempt through a new
  `writeSaveAudit` dependency (`writeSaveAuditViaServiceRole`, the second and
  last service-role use in the function): `outcome`, `error_code`,
  `base_revision`, `resulting_revision`, `document_bytes`, `client_reported_at`
  (the document's own `savedAtTimestampMs`, recorded verbatim and never
  trusted), and a `detail` carrying the server-authored reason — a Step 23 bound
  violation's `{counter, claimed, maximum}`, a validation `reason`, a conflict's
  `serverRevision`, the size cap, or a malformed-body reason. Accepted attempts
  are recorded too, and the write is best-effort: a failure is logged and never
  turns an accepted save into a rejected one or loses the player's game.
  Unauthenticated requests write nothing (no resolved caller, and
  `save_audit.user_id` is `not null`). The player-facing half was already built
  by Step 19 and is now pinned end to end: a `save_rejected` is
  terminal-but-keep-syncing, so the replica drops that document, remembers its
  state shape (a forced trigger still retries and a success clears it, so a
  false positive recovers without a reload), keeps the local save, keeps the
  session playable, and shows the §4 notice `cloud-sync-save-rejected`. N1
  remains the known limit (an old honest fork can be refused); Step 24's no-loss
  guarantee is what makes it survivable. Evidence: 4 initial Deno unit tests
  (accepted row with the client clock, bound-violation row, validation row, and
  no row without a caller; the review entry above adds the H1 and M1 cases);
  `tests/unit/server-stack.test.ts` pins the
  `admin.from('save_audit').insert(` line; a new live integration suite
  `tests/server-integration/save-audit.integration.test.ts` (4 initial tests —
  accepted row, `save_rejected` row, `revision_conflict` row, and RLS proving the
  log is invisible and unwritable to a client token; the review entry above adds
  the unrepresentable-clock case); and a new server-e2e spec
  `tests/server-e2e/save-rejection.spec.ts` (a stubbed `422 save_rejected`
  leaves the session producing gold, the local save a valid schema-2 document,
  one comprehensible notice, and no uncaught error). After that review's
  additions the counts were 110 Deno server unit tests and 90 integration
  tests; the follow-up pass above raised them to the 112 and 91 re-verified
  there; `npm run lint`, 637 unit tests, 9 server-e2e tests,
  52 Chromium E2E, build, secret scan, 10 production smoke, and
  `npm run verify:server` all pass. Step 25 must not begin until the user
  validates Step 24.

- Fixed a 2026-09-14 review of **Step 23** (two HIGH, one MEDIUM, three LOW),
  all in the upload bound. **F1 (HIGH):** the bound had no term for material
  already in the pipeline at the interval's open, so a proportional rate term
  was near-zero over a short interval while a completed extraction cycle and a
  drained queue were fixed amounts; an honest warm mine that simply kept playing
  was rejected for intervals of 1–20 s (reproduced: `warm=300s n=1s` rejected
  `floors[floor-3].totalExtracted`), and those sub-minute intervals are the
  canonical §9 forced-upload cadence (a routine save, then a pagehide three
  seconds later). `evaluateProgressBound` now carries each floor's in-flight
  cycle yield (at the candidate's level), its `materialQueue`, the elevator's
  `carriedMaterial`, and the warehouse's `inputQueue`. **F2 (HIGH):** elapsed
  was measured only from the stored row, so a device that resolved a §7 `409`
  and re-uploaded its *own* branch seconds later had its whole divergence
  compared to those seconds and was rejected — the winning branch could never
  commit, pinning the account to the inferior branch. `save-sync` now retries
  the bound against the row's one-generation ancestor
  (`previous_document_json`/`previous_received_at`) over the full interval when
  the tight bound fails; `StoredSaveRow` and the `saves` read gained those two
  columns. **F3 (MEDIUM):** the tests began from a cold start (the only
  zero-in-flight state) and the fixtures aged rows to mask F1/F2; a warm-mine
  short-interval regression and a dominating-sibling ancestor-anchor regression
  were added, and `saveAgeFixture.ts`'s role narrowed with its comment corrected
  (its conflict-suite re-upload now commits through the ancestor anchor with no
  extra aging). **F4 (LOW):** an unparseable `received_at` produced
  `elapsedMs = 0` (the strictest bound) rather than skipping; it now returns
  `null`, matching the documented rule. **F5 (LOW):** the spend allowance summed
  the delivery and offline earning terms (2× the maximum obtainable); it now
  uses one earning term. **F6 (LOW):** `architecture.md`'s file-responsibility
  row now names the anti-cheat module. Re-verified end to end: `npm run lint`,
  637 unit tests, 104 Deno server unit tests, 85 integration tests, 8 server-e2e
  tests, 52 Chromium E2E, build, secret scan, 10 production smoke, and
  `npm run verify:server` all pass. Step 24 must not begin until the user
  validates Step 23. **A follow-up 2026-09-14 review left one MEDIUM open (N1),
  now recorded as a stated limit rather than a claim of closure:** the ancestor
  anchor is one generation deep, so a fork older than roughly two minutes
  against an actively-syncing peer (the tablet-open/phone-offline case) still has
  both anchors too recent and its honest dominating branch is rejected. The
  sound fix — retain fork points (a `saves` history/schema change) or accept a
  client-supplied verifiable fork revision — overlaps Step 24 and is not
  scheduled; a server-side "accept any strict superset" exemption was rejected
  because an inflating cheat submits supersets. Recorded in `architecture.md`'s
  Step 23 section and `progress.md`'s known risks. The same follow-up review
  found one LOW documentation issue (N2): `productContext.md` claimed a
  reconciled branch is always kept; it now states the N1 limit, matching the
  established Step 20/22 L5 standard for not overstating a behavioural change.

- Implemented server-milestone **Step 23, upper-bound re-simulation**, on
  2026-09-14, on the user's explicit instruction. New pure
  `evaluateProgressBound` (`src/core/anti-cheat/progressBound.ts`, exported from
  `src/core/index.ts` and therefore in the Step 6 server-core bundle) bounds an
  uploaded document against the last accepted one. It re-derives the maximum the
  mine could have produced over the server-measured elapsed time using the shared
  core's own rate and batch-cost functions **on the candidate's final
  configuration held for the whole interval** — a genuine upper bound because
  levels only rise, and a loose one because a player upgrades gradually. No ticks
  are simulated: the interval can exceed `MAX_CATCH_UP_MS` (two hours), so an
  `O(elapsed)` walk would blow the §7.1 upload latency budget, while the rate
  model gives the same (looser) bound in `O(floors)`. It bounds each unlocked
  floor's `totalExtracted`/`totalTransported` (transport capped by the shared
  elevator's throughput), `warehouse.totalGoldDelivered`,
  `warehouse.totalOfflineGoldClaimed`, and the total gold the levels and unlocks
  between the two documents required (`state.upgradeSpend`) — never current
  `gold`, which legitimately falls when the player spends, the same exclusion
  §7's progress vector makes. `PROGRESS_BOUND_TOLERANCE = 0.05` absorbs the
  residual between the client's fixed-step simulation and the continuous rate;
  `tests/unit/progress-bound.test.ts` (8 tests) pins it from **both sides** so
  widening it silently fails, and the direction is deliberately biased toward
  accepting a slightly generous save over rejecting an honest one (threat-model
  §1, finding F3). `save-sync`'s `handleSaveUpload` calls
  `findProgressBoundViolation` after the `baseRevision` concurrency check and
  before the write, returning `422 save_rejected` with
  `detail: { counter, claimed, maximum }`; the stored row and revision are
  unchanged. A **first upload is exempt** (no last accepted document to bound
  against — it is how a new account seeds its cloud save and how Step 20 adopts a
  pre-account save), and an unreadable stored row skips the check rather than
  rejecting, so the server never rejects an honest save over its own row.
  Evidence: 8 core unit tests, server unit tests in
  `supabase/functions/save-sync/index.test.ts`, a live integration suite
  (`tests/server-integration/save-rejection.integration.test.ts` — rejection plus
  honest-accept), and `tests/server-integration/saveAgeFixture.ts`'s
  `ageStoredSave` (service-role), which moves a stored row's `received_at` into
  the past so the conflict/collision suites' fictional offline progress
  represents a real interval. **A same-day review then fixed six issues (F1–F6;
  see the entry above) and raised these counts to 9 core unit tests and 104 Deno
  server unit tests.** The `profiles-rls`
  suite's profile-`created_at` assertion gained a `CLOCK_SKEW_TOLERANCE_MS` bound
  on both sides, because it compares the Postgres container's clock with the test
  process's. `npm run lint`, 637 unit tests, 104 Deno server unit tests, 85
  integration tests, 8 server-e2e tests, 52 Chromium E2E, build, secret scan, 10
  production smoke, and `npm run verify:server` all pass. Step 24 must not begin
  until the user validates Step 23.

- Fixed a follow-up 2026-09-15 review of Step 22 (two MEDIUM, one LOW).
  **H2-R:** `chooseOfflineReward`'s `min` bound engaged only on a *positive*
  local projection, but the exact H2 scenario — a tab that flushed at reload, or
  uploads that lagged — yields a **zero** projection (`createPendingOfflineReward`
  returns null for zero), so the full two-hour cap was credited unbounded on top
  of open-tab production; a null or zero projection is now treated as a zero
  closed interval and credits nothing. **H1-R:** `sign-in-failed` against a
  configured backend was folded into the same fallback as `unconfigured`,
  reopening the device-clock cheat by clearing the auth entry and blocking the
  network; the fallback now requires `unconfigured` (or `no-cloud-save`), with
  the recorded cost that a configured build whose sign-in keeps failing earns no
  offline reward until one lands. **L5:** `productContext.md` now describes the
  real behaviour (no reward that session on a failed download/sign-in, settled on
  the next launch that reaches the server) instead of claiming the player always
  sees it immediately. `npm run lint`, 628 unit tests, 100 Deno server unit
  tests, 83 integration tests, 8 server-e2e tests, 52 Chromium E2E, build,
  secret scan, 10 production smoke, and `npm run verify:server` all pass.

- Fixed the 2026-09-15 review of Step 22 (one HIGH, two MEDIUM, four LOW).
  **H1:** a failed download fell back to the client's own clock-derived
  projection, so an attacker could reopen the device-clock cheat by dropping one
  save-sync request and jumping the clock; the fallback is now allowed only
  where no server figure can exist (unconfigured, no session, or `no-cloud-save`
  `204`), and a failed download credits nothing and settles on the next boot
  that reaches the server. **H2:** the server grant includes the cadence window
  since the last upload, so it over-credited open-tab time the live tab already
  banked; `chooseOfflineReward` now credits `min(serverGrant, localProjection)`,
  restoring "only a closed interval reaches the grant" and staying cheat-safe (a
  manipulated clock can only reduce the credit). **M1:** the reward waited on an
  unbounded download; `downloadCloudSaveViaFetch` now carries a 10 s
  `AbortSignal.timeout`, and the architecture sentence that claimed the client
  does not wait was corrected. **L1:** the applied-receipt guard was burned when
  the grant arrived, before the player claimed; it is now marked only when the
  claim is persisted, so an unclaimed reward is not lost. **L2:** protocol §10.2
  now documents that a `200` can carry `offlineGrant: null`. **L3:** the
  server-e2e seed no longer races the app — the account is fresh and uploads
  nothing, and the seeded remote now strictly dominates. **L4:** the four
  ordering flags are now a pure, unit-tested `chooseOfflineReward`. `npm run
  lint`, 628 unit tests, 100 Deno server unit tests, 83 integration tests, 8
  server-e2e tests, 52 Chromium E2E, build, secret scan, 10 production smoke,
  and `npm run verify:server` all pass.

- Implemented server-milestone **Step 22, the server clock is the only clock**,
  on 2026-09-14, on the user's explicit instruction. New pure
  `calculateOfflineGrant` (`src/core/offline-income/calculateOfflineGrant.ts`)
  computes the reward from two opaque timestamps; `calculateOfflineIncome` (the
  client's projection) and `save-sync`'s `GET /v1/save` (the server's grant)
  both call it, so the 7,200,000 ms cap and 0.5 efficiency cannot drift — F4's
  "change which clock is authoritative and nothing else." The download response
  now carries `offlineGrant`, computed from the stored `received_at` to the
  server's `now()`; the device clock is never an input. `downloadCloudSaveViaFetch`
  parses it, `reconcileCloudSaveAtBoot` reports it through `onOfflineGrant` for
  the outcomes that keep the page running (`kept-local`/`same-progress`; an
  `adopted-remote` reload's next boot returns the same grant), and `src/main.ts`
  credits the server's figure, falling back to the client projection only when
  no grant arrives. `appliedOfflineGrant.ts` records the credited `receivedAt`
  so a reload between crediting and uploading cannot double-credit. The client
  E2E config pins the Supabase env blank so that suite stays the deterministic,
  backend-free client gate, and the production smoke pins the save-sync surface
  to "no cloud save" for the same reason. Evidence: core parity/cap/future
  tests; the server's own unit tests proving the document timestamps cannot move
  the grant; `tests/server-integration/offline-grant.integration.test.ts` (3 —
  honest, hours-ahead, and hours-behind clients get the same capped grant for
  the same receipt, and a 90-second absence credits ~90 s regardless of the
  document clock); and `tests/server-e2e/offline-grant.spec.ts` (the browser
  credits the server's 12.96m figure, not the client's zero projection).
  `npm run lint`, 620 unit tests, 100 Deno server unit tests, 83 integration
  tests, 8 server-e2e tests, 52 Chromium E2E, build, secret scan, 10 production
  smoke, and `npm run verify:server` all pass.

- Fixed the 2026-09-14 review of Step 21 (one MEDIUM, four LOW). **M1:** the
  missing-local-save decision keyed on `loadActiveGame`'s `source === 'fresh'`,
  which is also what a corrupt or incompatible local save returns — so a
  returning player whose save was found-but-unreadable was told it "could not
  be found", and because a differing banner code replaces the shown one, that
  false notice overwrote the accurate `corrupt-save`/`incompatible-save`
  warning. The decision now uses a three-way `LocalSaveState`
  (`saved`/`missing`/`unreadable`, from `source` plus `warning === null`) and
  only `missing` fires the notice; a new unit case pins the corrupt input, and a
  new server-e2e test injects an unreadable save under a reused session and
  asserts `corrupt-save` survives with no `local-save-missing`. **L2:** the
  Telegram `sessionIsNew = true` assignment was an inert no-op resting on a
  false premise (a returning Telegram player also presents signed `initData`);
  removed, with the notice documented as guest-path-only. **L3:**
  `architecture.md`'s Save Diagnostic Surface described only two of the four
  notice sources and not the replace-on-different-code behaviour; both fixed.
  **L4:** the shared-promise join could never settle if the font `await`
  rejected; replaced with a three-way mutable join that reports from whichever
  of the local load and the reconcile finishes last, with no permanently-pending
  await. **L5:** the no-cloud-copy e2e now stubs the whole save-sync surface
  (204 download, 200 upload), removing the client/server disagreement that
  could 409 into an adopt reload and clear the banner. `npm run lint`, 604 unit
  tests, 99 Deno server unit tests, 80 integration tests, 7 server-e2e tests,
  52 Chromium E2E, build, secret scan, 10 production smoke, and
  `npm run verify:server` all pass.

- Implemented server-milestone **Step 21, survive local storage eviction**, on
  2026-09-14, on the user's explicit instruction. `ensureGuestSession` now
  reports `isNewSession`, so a reused session with no local save is
  distinguishable from a genuinely new player; new pure
  `shouldExplainMissingLocalSave` (`src/platform/web/localSaveRestore.ts`) fires
  only for that state when the reconcile also finds no cloud save, and
  `src/main.ts` reports the honest `local-save-missing` notice through the save
  banner instead of letting the reset be silent. A cloud save is still restored
  by the existing Step 17/18 reconcile, unchanged. New
  `src/platform/web/persistentStorage.ts` requests `navigator.storage.persist()`
  once, early, feature-detected and non-blocking, and records the browser's real
  answer as a DEV `data-persistent-storage` diagnostic. The same change moved
  `reconcileCloudSaveAtBoot`'s `onServerRevision` to fire only on
  `kept-local`/`same-progress`, and `src/main.ts` now stops the replica on
  `adopted-remote` too, so a dominating remote is never preceded by arming the
  replica — which could pump a pending fresh document against the server
  revision and overwrite the cloud save the adopt restores. Evidence: unit tests
  for `isNewSession`, the restore predicate, and the persistence helper; two
  server-e2e specs (`tests/server-e2e/local-save-eviction.spec.ts`) proving
  restore-after-eviction and the honest notice; and a client-e2e measurement
  (`tests/e2e/persistent-storage.spec.ts`). **The iOS Safari seven-day deletion
  measurement is outstanding** — it needs a real device and a seven-day
  wall-clock observation (finding F8) — and is recorded as such in
  `techContext.md`; the `navigator.storage` half measured
  `{supported: true, persisted: false, quotaBytes: 9663676416, usageBytes: 0}`
  in headless Chromium on 2026-09-14. `npm run lint`, 603 unit tests, 99 Deno
  server unit tests, 80 integration tests, 6 server-e2e tests, 52 Chromium E2E,
  build, secret scan, and 10 production smoke all pass.

- Fixed the 2026-09-14 review of Step 20 (one MEDIUM, four LOW). **M1
  (MEDIUM):** the server-e2e spec's final byte-for-byte poll compared a moving
  local document against a cloud copy that §9's 60 s interval had pinned, so a
  heartbeat write could make it time out inside the CI gate. It now forces the
  lifecycle flush, captures the flushed local document once, and waits for the
  cloud to reach *that constant*, so no later write can race it. **L2:** a
  throwing `forceUpload` reported `unreadable` for a save that had read and
  migrated fine; `adoptExistingLocalSave` now catches it separately as
  `upload-failed`, and the dep's JSDoc no longer claims non-throwing. **L3:**
  the adoption result was discarded, so the one step-defining operation had no
  observable outcome; `src/main.ts` now publishes a DEV `localSaveAdoption`
  diagnostic like every other identity/sync operation. **L4:** the step's own
  tests seeded only fifteen-floor, zero-progress saves, leaving the legacy
  four-floor expansion and progress preservation unexercised; the unit fixture
  is now a progressed save and a new test expands a four-floor version-1
  document to fifteen. **L5:** `activeContext.md` implied Step 20 changed
  behaviour; it was trimmed to state accurately that Step 19 already wired the
  load/migrate/force-upload path and Step 20 extracts, types, observes, and
  evidences it. `npm run lint`, 588 unit tests, 99 Deno server unit tests, 80
  integration tests, 4 server-e2e tests, build, secret scan, 10 production
  smoke, and `npm run verify:server` all pass.

- Implemented server-milestone **Step 20, adopt existing local saves**, on
  2026-09-14, on the user's explicit instruction. A pre-milestone player holds
  a version-1 `SaveDocument` in IndexedDB; on first sign-in their account has
  no cloud save, so the boot reconcile's `204` (`no-cloud-save`) is the moment
  the local save must become the cloud save rather than be replaced by a fresh
  one. New `adoptExistingLocalSave` (`src/platform/web/cloudSaveReconcile.ts`)
  names that operation: it reads whichever document the lifecycle-safe
  repository would load, runs it through the shared `validateSaveDocument`
  (which migrates version 1 to version 2, expanding a legacy four-floor payload
  and defaulting `warehouse.totalOfflineGoldClaimed` to `"0"`), and hands the
  migrated document to the Step 19 replica's `forceCloudUpload`. It never
  throws: an absent local record resolves `no-local-save`, a corrupt one
  `unreadable`, and both skip the upload. `src/main.ts`'s boot-reconcile
  trigger now delegates to it on `no-cloud-save`/`kept-local`. The adopted
  document is the migrated version-2 document, not the original version-1
  bytes — the plan's Step 18 interaction note, honoured by the tests.
  Evidence: five unit tests for the helper (migrated upload, no-local-save,
  corrupt document, a rejecting repository, and a throwing `forceUpload`); a
  live integration suite (`tests/server-integration/adopt-existing-save.integration.test.ts`,
  3 tests) proving a pre-milestone save round-trips through `PUT`/`GET
  /v1/save` byte-for-byte, its progress surviving with only `schemaVersion` and
  the added counter differing, plus a raw version-1 upload the server itself
  migrates; and a server-e2e spec (`tests/server-e2e/adopt-local-save.spec.ts`)
  that seeds a real version-1 IndexedDB save before boot, signs in an anonymous
  guest, and requires the cloud copy to be byte-for-byte the adopted local
  document after a forced lifecycle flush. `npm run lint`, 587 unit tests, 99
  Deno server unit tests, 80 integration tests, 4 server-e2e tests, build,
  secret scan, and 10 production smoke all pass.

- Fixed a third 2026-09-14 review pass of Step 19 (one LOW residual, R1). The
  state-shape guard from the second pass suppressed every later save once the
  server rejected one — every valid save of the fixed fifteen-floor schema
  shares the same shape — while `isStopped` reported sync as live, so a
  transient rejection (a mid-rollout deploy, a config mismatch) killed cloud
  sync for the session with no recovery. A **forced** trigger (lifecycle flush,
  claimed reward, post-reconcile upload) now bypasses the guard, and a
  successful forced upload clears the suppression so the routine cadence
  resumes. Two regressions cover forced recovery and the resumed cadence;
  `npm run lint`, 582 unit tests, 99 Deno server unit tests, 51 Chromium E2E,
  build, secret scan, 10 production smoke, and `npm run verify:server` all
  pass.

- Fixed a second 2026-09-14 review pass of Step 19 (one CRITICAL, one MEDIUM
  residual). **CRITICAL (C1):** the upload-path `409` fork only recorded its
  two candidates and never stopped the replica, so the next routine save —
  carrying the server revision the client had just learned — was accepted and
  silently replaced the remote branch the player was never shown, violating
  protocol §7's preamble and §7.3. The fork branch now calls `stop()`, exactly
  as the boot fork and the malformed-`409` branch already did; a regression
  asserts `isStopped` and that a later forced save uploads nothing, and a
  `server-stack.test.ts` static assertion now requires the fork branch to stop
  rather than pinning the record-only behaviour. **MEDIUM (M3 residual):** the
  first fix keyed the dropped-document memory on `JSON.stringify(document)`,
  which includes the ever-moving `savedAtTimestampMs`, so the running game's
  next save still re-uploaded the same broken save once per cadence window. The
  memory is now `stateShapeSignature(document.state)` — sorted keys and value
  types, with array length — which is stable across idle play but changes if
  the state's structure does. Two regressions cover the fresh-timestamp case
  and a genuine structural change. `npm run lint`, 581 unit tests, 99 Deno
  server unit tests, 51 Chromium E2E, build, secret scan, 10 production smoke,
  and `npm run verify:server` all pass.

- Fixed the 2026-09-14 review of Step 19 (one HIGH, three MEDIUM, six LOW),
  each verified. **HIGH (H2):** §4's entire "Player sees" column was
  unimplemented — terminal cloud failures reached only a DEV diagnostic, so a
  production player whose sync permanently stopped was told nothing.
  `describeCloudSaveNotice(code)` now maps every §4 failure code to its exact
  copy under a namespaced `cloud-sync-*` code, and `src/main.ts`'s replica
  `onEvent` reports it through the existing `SaveDiagnosticBanner` on
  `sync-stopped`/`document-dropped`; retryable failures still surface nothing
  while a retry is pending. **MEDIUM (M3):** `save_invalid`/`save_rejected`
  now remember the rejected document's serialization and refuse to re-upload
  a byte-identical one, so the coordinator's next debounce no longer becomes
  one failed request per cadence window. **MEDIUM (M4):** the mid-session
  `remote-dominates` adopt now sets a `localSavesSuspended` flag and cancels
  the coordinator's scheduled save before storing and reloading, and the
  purchase/heartbeat/claim paths all honour it, closing the window in which a
  debounced flush could overwrite the adopted remote with the stale
  in-memory document. **MEDIUM (M5):** the version-2 save bump had left the
  protocol's §3/§10.2/§10.3 examples and the two schema-copy references at
  `SaveDocumentV1` / `schemaVersion: 1`; all updated to V2, including the
  `schema_unsupported` example and the `warehouse.totalOfflineGoldClaimed`
  field. **LOW (L6):** `local-dominates` no longer overwrites a newer queued
  document with the older one it just sent. **(L7):** the retry budget is now
  five retries after the initial attempt, so the 16 s step is reached, and
  §9 was amended to match (the 60 s cap applies only to a longer sequence).
  **(L8):** `#attempt` resets on the `local-dominates` re-upload, so attempts
  are scoped per trigger. **(L9):** the upload `Content-Type` now carries
  `; charset=utf-8`. **(L10):** a `409` whose `receivedAt` does not parse is a
  terminal `malformed_request` rather than `NaN` in the fork display.
  **(L11):** `save-sync` now refuses only a schema version *newer* than the
  server's and passes older ones to the shared `migrateSaveDocument`, matching
  §4's definition of `schema_unsupported` and no longer rejecting a
  Step 16/17-written v1 row. Evidence: 7 added client unit tests plus a new
  Deno server unit test; `npm run lint`, 578 unit tests, 99 Deno server unit
  tests, 51 Chromium E2E, build, secret scan, and 10 production smoke all
  pass.

- Implemented server-milestone **Step 19, client remote repository**, on
  2026-09-13, on the user's explicit instruction — §9's upload cadence and
  §7's `409` half that Step 18 deferred. Local storage stays primary; the
  cloud is a replica built from three new pieces plus two small
  additions:

  1. `src/persistence/ReplicatingActiveSaveRepository.ts` composes the
     existing `LifecycleSafeActiveSaveRepository` with the replica. Its
     `loadActiveSave` reads local only — §11 forbids a network call on the
     boot path — and its `storeActiveSave` awaits the local write *before*
     offering the same document to the replica, so a failed local write
     still rejects and `SavePersistenceCoordinator`'s `save-failed`
     diagnostic is unchanged. `forceCloudUpload` is the §9 forced-trigger
     entry point.
  2. `src/persistence/cloudSaveReplica.ts` is the pure policy half: §9's
     minimum 60 s interval with coalescing (only the newest document is
     ever sent), forced bypass, the 1/2/4/8/16 s bounded backoff (five
     retries after the initial request, then cloud sync stops for the
     session), and §7 applied to a
     `409` through the one `resolveSaveConflict` predicate — a dominating
     local re-uploads against the server revision, a dominating remote is
     handed to the caller to adopt, an equal pair adopts the revision
     silently (the lost-response retry), and a genuine fork is deferred
     with both candidates retained. It also validates the `409` document
     before the pure predicate reads it, which is exactly the caller Step
     18's own comment said must exist.
  3. `src/platform/web/cloudSaveUpload.ts` is the one network call
     (`PUT /v1/save`), mapping every §4 status to the typed result and
     refreshing the session once on `unauthenticated`.
  4. `reconcileCloudSaveAtBoot` gained `onServerRevision`, and
     `CloudSaveReplica` gained `arm(revision)`. Uploads are held until the
     boot download settles, so a returning player's first routine save
     updates revision N instead of carrying a null `baseRevision` against an
     existing row — an avoidable `409` this both fixes and proved: with a
     configured local stack the E2E suite went from two documented 409
     browser-console errors to fully green.
  5. `bindSaveLifecycle` gained a best-effort `onForceSave` callback, and
     `src/main.ts` wires the three §9 triggers (lifecycle flush, claimed
     offline reward, and once after boot reconcile when local dominates or
     the account has no cloud save), adopts a dominating remote through the
     same unbind-and-clear store-and-reload path as the boot reconcile, and
     retains an upload fork's two candidates in the existing
     `pendingSaveConflict` session hook.

  `src/core` is untouched and now has `fetch`/`XMLHttpRequest`/`WebSocket`/
  `EventSource` banned by `eslint.config.mjs` with its own
  `architecture.test.ts` probe, so the network boundary is enforced rather
  than documented. Evidence: `tests/unit/cloud-save-replica.test.ts` (20),
  `tests/unit/cloud-save-upload.test.ts` (18),
  `tests/unit/replicating-active-save-repository.test.ts` (7), two added
  `cloud-save-reconcile.test.ts` cases, the new architecture probe, and five
  static assertions in `server-stack.test.ts`. All verified: `npm run lint`,
  570 unit tests, 51 Chromium E2E (passing both with the configured local
  Supabase stack running and with `.env.local` removed entirely — the
  offline case the step's own test names), build, secret scan, and 10
  production smoke tests.

- Fixed the 2026-09-13 review of Step 18, including a HIGH finding whose first
  two fixes were themselves wrong and were replaced by a structural one.
  **HIGH — a silent `remote-dominates` adopt could destroy claimed offline
  gold.** The §7.1 progress vector excluded `gold` for good reason (a purchase
  must not false-fork), but `claimOfflineReward` credited a capped offline
  reward straight to `gold` and moved no vector field, so a strict-subset save
  could be silently bankrupted by a dominating one. Reproduced: a local save
  holding a fresh 1,000,000-gold offline claim against a remote one elevator
  level ahead with no gold resolved `remote-dominates`, and the boot reconcile
  stored the remote over it and reloaded with nothing shown. Two heuristic
  patches were then tried and rejected. A "discarded side holds more gold" fork
  comparison over-fired — spending is the core loop — and broke the new-device
  restore of a save spent below `startingGold` plus the solo post-purchase
  boot. A lifetime-cumulative bound (`gold > startingGold +
  totalGoldDelivered`) was dead in real play, because `gold` falls with
  spending while the bound only grows. **The structural fix completes the
  vector:** `claimOfflineReward` now credits a new monotonic
  `warehouse.totalOfflineGoldClaimed` alongside `gold`, that counter joins
  `M`, and `resolveSaveConflict` drops all `gold` special-casing and its
  `config` argument. Because `gold = startingGold + totalGoldDelivered +
  totalOfflineGoldClaimed − spent` and `spent` derives from the levels and
  unlocks already in `M`, equal `M` now implies equal `gold` and a dominating
  side has earned at least as much. The save-shape change bumps
  `CURRENT_SAVE_SCHEMA_VERSION` 1→2: `migrateSaveDocument` upgrades a version-1
  document by defaulting the counter to `"0"`, `isSupportedSaveSchemaVersion`
  keeps a version-1 document classified `corrupt-save` rather than
  `incompatible-save` when it fails for a non-version reason, and the
  ten-minute fixture plus both schema documents were updated. **MEDIUM —**
  `compareProgress` indexed the second document unchecked, so an unvalidated
  `409` body with a short floors array (exactly Step 19's shape) could throw a
  raw `TypeError`; it now returns `fork` when floor counts differ, with its
  comment narrowed to that malformation rather than claiming the function never
  throws. **LOW:** a stale `reconcileGuestUpgrade` reference in
  `supabase/functions/recovery-code/index.ts` updated; the `same-progress`
  comment no longer claims to adopt a revision no code adopts; and the chooser
  gap (a production fork is parked in `pendingSaveConflict`, reachable only
  through the DEV hook) is recorded as one explicit open gap in
  `activeContext.md`. All verified: `npm run lint`, `tsc --noEmit`, 518 unit
  tests, `npm run verify:server` (98 Deno unit, 77 integration, 3 server-e2e),
  build, secret scan, and 10 production smoke.

- Implemented **server-milestone Step 18, conflict resolution**, on
  2026-09-13 on the user's explicit instruction — the §7 dominance rule for
  divergent saves that Step 17 deliberately deferred. New pure
  `src/persistence/saveConflictPolicy.ts`, beside `saveSchema.ts` and free of
  both `src/platform` and `src/game`:

  1. `compareProgress(left, right)` — the §7.1 progress-vector comparison
     over per-floor `isUnlocked` (false < true), `mineShaftLevel`,
     `totalExtracted`, `totalTransported`; `elevator.level`;
     `warehouse.level`, `warehouse.totalGoldDelivered`,
     `warehouse.totalOfflineGoldClaimed` (added by the review fix below).
     Returns `equal`, `left-dominates`, `right-dominates`, or `fork`. Gold,
     every queue, `carriedMaterial`, every `*Progress` fraction,
     `roundRobinCursor`, `simulationTick`, and all timestamps are deliberately
     excluded — idle play alone moves them, so including any would report a
     fork on a device that had merely bought an upgrade.
  2. `resolveSaveConflict(local, remote)` — §7 applied: no cloud save keeps
     local; `equal` is `same-progress` ("adopt the server revision and
     continue"); a dominating side wins silently; only neither-dominates is a
     `fork`, carrying both candidates.
  3. `describeSaveConflictCandidate` — §7.3's display fields (`gold` and
     `totalGoldDelivered` as `GameNumber` for `formatAmount` at the display
     layer, `floorsOpen`, `deepestShaftLevel`, last-played) plus the document
     so a choice applies verbatim.

  This **replaced** Step 13/17's narrower `hasAnyProgress`/`reconcileGuestUpgrade`
  (`src/persistence/guestUpgradeReconciliation.ts`, deleted), which asked
  whenever both sides merely had progress; the completed policy resolves a
  strict-superset save silently. The boot reconcile
  (`src/platform/web/cloudSaveReconcile.ts`) and the future Step 19 upload
  `409` path now share the one predicate. `reconcileCloudSaveAtBoot` maps
  `same-progress` → a no-op (adopting remote would only discard local queues
  for no monotonic gain), `local-dominates` → `kept-local`,
  `remote-dominates` → store-and-reload, and `fork` → `deferred-conflict`
  carrying **both** candidates and writing neither save. `src/main.ts` retains
  it in `pendingSaveConflict` for the session (exposed via the DEV account
  hook, §7.3's "the save not chosen is not destroyed") and publishes a compact
  summary as `app.dataset.cloudSaveReconcile`. The protocol's §7 gained an
  explicit player-facing statement of the rule.

  Evidence: `tests/unit/save-conflict-policy.test.ts` (18 tests after the
  review fix below), three added `tests/unit/cloud-save-reconcile.test.ts`
  cases (same-progress, local-superset, fork retaining both candidates), the
  live `tests/server-integration/save-conflict-resolution.integration.test.ts`
  (7 tests — the step's own "two devices play the same account offline and both
  sync" through the real `PUT /v1/save` `409`, applied deterministically with no
  accepted branch losing progress the player was not shown), a rewritten Step 13
  collision fork fixture (a genuine elevator-vs-warehouse fork, since a one-axis
  superset now resolves silently), a `tests/unit/save-schema.test.ts` version
  1→2 migration test, and three static assertions in
  `tests/unit/server-stack.test.ts` pinning the single shared predicate, its
  purity, and the `pendingSaveConflict` retention. Not built: the production
  chooser UI (DEV-only, like Steps 8–17) and the upload `409` half (Step 19).
  All verified: `npm run verify:server` (98 Deno unit tests, 77 integration,
  3 server-e2e) and the full client gate (518 unit tests, 51 E2E — the
  pre-existing documented `player-journey.spec.ts` parallel-worker flake
  reconfirmed passing in isolation — build, secret scan, 10 production smoke)
  both pass end to end from a clean cycle.

- Fixed a follow-up pass on the 2026-09-13 review: one LOW residual, three
  consistency notes, and one optional hardening. **LOW, verified live:**
  the Step 17 unbind fix (below) removed the `pagehide` journal write but
  not a journal entry already sitting there — `storeActiveSave`'s own
  `clearThrough` only discards an entry at or below the adopted document's
  timestamp, and that document carries *another device's* clock, so a
  journal entry written earlier in the same session (backgrounding the tab
  during boot) can read as newer and survive, reverting the adopt on the
  next boot (not a loop — the boot after that clears it and the second
  adopt sticks). Restamping the adopted document to `Date.now()` was
  considered and rejected: `loadActiveGame` anchors offline-income
  settlement to `savedAtTimestampMs` directly, so restamping would
  silently zero the income a cloud-adopt is supposed to credit. Fixed with
  a new, unconditional `WebLifecycleSaveJournal.clear()` (kept separate
  from the routine flush's own conditional clear, which must not clobber a
  genuinely newer entry) wired through a new
  `CloudSaveReconcileDeps.clearLifecycleJournal`, called right before
  `reload()`; mutation-proven. **Consistency, all fixed:** a `main.ts`
  comment claimed a safety it didn't establish (corrected to name the real,
  improbable-not-impossible risk instead); `checkTestResetAuthorizationViaEnv`
  compared its token with `===` rather than this codebase's usual
  constant-time comparison (swapped for a new `timingSafeEqual`); and
  `revert_recovery_code_redemption`'s "silent no-op, not an error" framing
  was qualified — its check and its write aren't atomic with each other, so
  a genuine interleave can still raise the same `23505` the plain-`update`
  version did, which is exactly why `handleRedeem`'s try/catch around it
  has to stay. **Optional hardening, applied:** a new migration
  (`20260913090200_recovery_code_rpc_grants.sql`) revokes RPC `execute`
  from `public`/`anon`/`authenticated` and grants it to `service_role`
  only — belt-and-braces over RLS, which already made both RPCs inert for
  client roles. Non-trivial to get right live: Supabase's own bootstrap
  grants execute to each client role individually on function creation, not
  merely through `public`, and `service_role` isn't a superuser locally, so
  it needed its own explicit re-grant or the Edge Function's own RPC calls
  would have broken outright. A new live test proves the grant restriction
  directly through PostgREST; mutation-proven by manually re-granting and
  watching it fail. All re-verified: `npm run verify:server` (98 Deno unit
  tests, 70 integration tests, 3 server-e2e) and the full client gate (506
  unit tests, 51 E2E, build, secret scan, 10 production smoke) both
  re-pass end to end from a clean cycle.

- Fixed five more issues found by a 2026-09-13 follow-up review of Step 14
  (recovery code), plus a HIGH-severity Step 17 reload-race defect the same
  review surfaced. **Step 14:** the rotation migration's own comment
  overstated the guarantee ("Postgres serializes concurrent callers on
  `user_id`" — it doesn't; the real mechanism is
  `recovery_codes_one_active_per_user_idx` plus transactional atomicity) —
  corrected in the migration and the Memory Bank; the atomic-rotation fix
  had no committed behavioral test — added a forced insert-half collision
  test (proving the rollback directly) and a genuine concurrent-`generate`
  test (proving exactly one active, redeemable code survives either
  legitimate race outcome, asserted without depending on a specific
  flaky-under-real-timing status-code pair); the revert-on-failed-mint path
  could itself collide with the one-active-code index if a `generate`
  landed in the narrow window before it ran — fixed with a second RPC,
  `revert_recovery_code_redemption` (migration
  `20260913090100_recovery_code_revert_rpc.sql`), that no-ops instead of
  erroring when a fresher code already exists; the rate-limit sweep ran on
  every request (O(n) per request under the exact rotated-address attack it
  exists to bound) — fixed by gating it on map size; and, once the rate
  limiter reads the platform's own trusted address hop, the whole
  integration suite was found to share one real bucket with no way to reset
  it, failing unrelated tests on any re-run inside the 60-second window —
  fixed with a token-gated `POST /v1/test-only-reset-rate-limit` route
  (inert in any real deployment by default), proven by running the suite
  five consecutive times back to back with no stack restart between runs.
  **Step 17:** the adopt-and-reload path was an infinite reload loop
  (latent only because Step 19's own upload path is unbuilt) —
  `window.location.reload()` fires `pagehide` synchronously, and
  `bindSaveLifecycle`'s `forceSave` journaled the stale pre-adoption
  document under a fresher timestamp than the just-adopted remote one,
  which `LifecycleSafeActiveSaveRepository.loadActiveSave` then preferred
  on the next boot, silently reverting the adopt forever — fixed by
  unbinding the lifecycle hooks before reloading, mutation-proven with a
  static-source assertion. Also recorded F13's mandated re-derivation for
  the `recovery.invalid` placeholder-email namespace in
  `server-threat-model.md` (passes) and corrected
  `server-save-sync-protocol.md`'s stale CORS-header documentation. All
  re-verified: `npm run verify:server` (98 Deno unit tests, 69 integration
  tests, 3 server-e2e) and the full client gate (502 unit tests, 51 E2E,
  build, secret scan, 10 production smoke) both re-pass end to end from a
  clean cycle.

- Fixed five issues found by a 2026-09-12 review of Step 14 (recovery code).
  **HIGH:** a failed session mint after a successful redemption permanently
  burned the code (already marked redeemed, no session ever delivered) —
  fixed with a new `revertRecoveryCodeRedemption` collaborator that clears
  `redeemed_at` before answering `500`, mutation-proven live (forcing mint
  to fail with the revert removed left the row redeemed forever; restored,
  it came back to `null`). **Medium:** the CORS preflight allowed only
  `content-type`, refusing the `Authorization`-bearing cross-origin requests
  `recoveryCode.ts`/`cloudSaveReconcile.ts` actually send — fixed in the
  shared `_shared/http.ts` helper. **Medium:** the rate limiter's own doc
  comment misdescribed a missing address as "conservative" when it was a
  global denial, and its first-hop `X-Forwarded-For` read let an attacker
  rotate past it every request (exactly what the integration suite's own
  per-call random address exploited) — fixed to read the platform gateway's
  own trusted *last* hop, confirmed live that the local gateway supplies it
  unconditionally, and the threshold raised from 10 to 30/minute since a
  spoof-proof address makes a tighter limit pure friction, not security (the
  code's 128-bit entropy is the real backstop). **Medium:** the in-memory
  rate-limit map never dropped expired keys — fixed with a sweep on every
  check. **Medium:** rotating a code was two independent, non-transactional
  statements (revoke, then insert), so an insert failure after a successful
  revoke stranded a user with no active code — fixed with a single Postgres
  function, `rotate_recovery_code` (new migration
  `20260913090000_recovery_code_rotation_rpc.sql`), mutation-proven live via
  a forced insert-half collision (RPC version rolled back cleanly; the old
  two-statement sequence reproduced by hand left zero active codes). All
  five re-verified; `npm run verify:server` (94 Deno unit tests, 63
  integration tests, 3 server-e2e) and the full client gate (499 unit
  tests, 51 E2E, build, secret scan, 10 production smoke) both re-pass end
  to end from a clean cycle.

- Implemented server-milestone Step 14 (recovery code) on 2026-09-12,
  proceeding straight from Step 13 on the user's explicit instruction. New
  `supabase/functions/recovery-code` Edge Function (`POST /v1/generate`,
  `POST /v1/redeem`) on the unchanged Step 3/5 `recovery_codes` schema: a
  16-random-byte (128-bit) code, hex-grouped for display, canonicalized and
  HMAC-SHA-256-hashed under `RECOVERY_CODE_PEPPER` (relocated in
  `.env.example` to the `supabase/functions/.env` section it is actually
  read from, matching `TELEGRAM_BOT_TOKEN`). Both rotation and redemption
  are compare-and-swap from the start, applying the Step 16 review's
  concurrency lesson proactively — mutation-proven live (a temporarily
  reverted read-then-write let two concurrent redemptions of the same code
  both succeed in 2 of 3 runs; restored, 5 of 5 clean). Minting a session
  for a redeemed code's resolved `user_id` adapts `telegram-sign-in`'s
  `generateLink`/`verifyOtp` pattern for an id-keyed lookup, assigning a
  deterministic placeholder email only when a pure anonymous guest has none
  at all — confirmed live end to end, same `auth.users` id restored.
  Hashing lives only inside the real service-role collaborators, never in
  the pure handler, so the zero-permission-flag unit-test harness holds
  without `--allow-env`. Rate limiting ships as an explicit interim
  in-memory limiter, documented as Step 25's eventual replacement.
  `redeemRecoveryCode` on the client triggers the same
  `triggerCloudSaveReconcile()` every other sign-in path runs, so reusing
  the Step 13 collision flow needed no new merge logic. `npm run
  verify:server` (89 Deno unit tests, 63 integration tests, 3 server-e2e)
  and the full client gate (496 unit tests, 51 E2E, build, secret scan, 10
  production smoke) both pass end to end from a clean cycle.

- Closed a test-coverage gap in Step 16's Content-Length pre-check on
  2026-09-12, found by user review: the fix was correct, but the only unit
  test for the 413 cap builds its request with a plain string body, which
  never populates `Content-Length` — so it only ever exercised the
  post-read check, and deleting the pre-check left every existing test
  green. Closed with a unit test that declares `content-length: '70000'`
  over an actual 2-byte body; mutation-proven by disabling the pre-check
  and confirming the new test fails (`400`, not `413`), then restoring it.
  69 Deno unit tests and 52 integration tests now pass.

- Fixed a real flake in `npm run test:server-integration` on 2026-09-12,
  found by user review: `vitest.server-integration.config.ts` set no
  `testTimeout`, so Vitest's 5 s default silently overrode every test's own
  declared `AbortSignal.timeout(20_000)` fetch budget, killing the test at
  5 s first. Confirmed load-dependent (clean on a fresh stack, 10/10 across
  parallel and serial loops) rather than cold-boot, worsening as a
  long-running local stack accumulates rows and drifts toward
  `signInAnonymously()`'s 30/hour-per-IP rate limit — `verify:server`
  resets the database first so CI is insulated, a developer looping the
  suite on its own is not. Fixed with `testTimeout: 30_000`. Predates this
  session's other fixes.

- Fixed a **critical** concurrency bug in server-milestone Step 16 on
  2026-09-12, found by user review: the upload endpoint's read-check-write
  was three non-atomic steps, so two overlapping uploads could both pass
  the revision-conflict check and both write, silently discarding one and
  breaking the server's monotonic-revision guarantee (reproduced live).
  Fixed with a compare-and-swap (`insert` relying on the `user_id` primary
  key for a first write, an atomic `update ... where revision = ?` for a
  subsequent one), proven with two new live tests that fire genuinely
  concurrent uploads. The same review fixed a medium issue (the size cap
  didn't actually refuse cheaply until a `Content-Length` pre-check was
  added) and three minor ones (an unmigrated downloaded document, the boot
  reconcile bypassing the lifecycle-safe repository wrapper, an
  under-explained CORS allow-list comment). `npm run verify:server` (68
  Deno unit tests, 52 integration tests) and the full client gate (479 unit
  tests) both re-pass. See `memory-bank/activeContext.md` for full detail.

- Implemented server-milestone Steps 15, 16, 17, and 13 on 2026-09-12, in
  that order, in one session (see `memory-bank/activeContext.md` for the
  full per-step detail). The user chose to pull cloud save (Steps 15–17)
  forward rather than build Step 13's guest-linking collision against
  test-seeded data, since Step 13 needs "an account that already has a
  cloud save" and no cloud-save endpoint existed yet at that point in the
  plan. Step 15: the `saves` table/RLS were already complete from Step 5;
  added the required live-stack evidence
  (`tests/server-integration/saves-rls.integration.test.ts`) and a
  service-role test fixture that mints its key at run time rather than as a
  tracked-file literal. Step 16: `PUT /v1/save` in `save-sync/index.ts`,
  real validation via the shared core bundle, the `revision` optimistic-
  concurrency check, and the one-generation rollback shift, with 18 new
  unit tests and a 9-test live integration suite. Step 17: `GET /v1/save`
  plus a boot-time reconcile (`src/platform/web/cloudSaveReconcile.ts`,
  `src/persistence/guestUpgradeReconciliation.ts`'s new `hasAnyProgress`/
  `reconcileGuestUpgrade`) that only ever acts silently when one side has no
  progress at all, leaving a genuine fork completely untouched for Step 18;
  wiring it into `main.ts` surfaced and fixed a real regression in
  `production-smoke.spec.ts`'s "no request fails" assertion, plus a missing
  CORS allow-list entry for this repository's own Playwright preview
  origins. Step 13: Google collision detection/resolution
  (`detectGoogleIdentityCollision` via the SDK's own memoized
  `client.auth.initialize()`, `beginGoogleAccountSwitch`), needing almost no
  new merge logic since Steps 10/12/17 already cover identity preservation
  and reconciliation; a new live integration suite
  (`tests/server-integration/guest-upgrade-collision.integration.test.ts`)
  proves all three of the step's required flows end to end by composing the
  real Step 16/17 endpoints with the real `reconcileGuestUpgrade`. A real
  live Google round trip through the actual collision remains deliberately
  unattempted, for later guided verification the same way Steps 11/12's own
  external prerequisites were flagged rather than blocking. `npm run
  verify:server` (67 Deno unit tests, 50 integration tests, 3 server-e2e)
  and the full client gate (479 unit tests, 51 E2E, build, secret scan, 10
  production smoke) both pass end to end from a clean cycle. All four steps
  await user validation together; Step 14 must not begin before that.

- Fixed a **critical** vulnerability in server-milestone Step 12 on
  2026-09-12, found by user review, finding F13
  (`memory-bank/server-threat-model.md`): `telegram-sign-in` maps a
  Telegram user to `auth.users.email = telegram-<id>@telegram.invalid` and
  relies on `admin.generateLink` to find-or-create that row, but
  `[auth.email] enable_signup = true` (with `enable_confirmations = false`)
  meant anyone who knows a Telegram id (public, enumerable) could
  `POST /auth/v1/signup` with that exact email and a password of their own
  choosing before the real user ever signed in — `generateLink` would then
  hand the real user a session into the attacker's own, password-protected
  account. Reproduced live end to end by the reviewer against the running
  stack and independently reconfirmed by this agent before touching
  anything: attacker signup → 200; real Telegram sign-in for that id → the
  identical `auth.users` id; attacker password login afterward → still that
  id. Fixed with `[auth.email] enable_signup = false` in
  `supabase/config.toml` — nothing in this codebase calls
  `signUp`/`signInWithPassword`, and `admin.generateLink`/`auth.verifyOtp`
  are admin/OTP paths unaffected by the flag, confirmed live (the full
  server test suite and the Telegram sign-in flow both still pass with it
  set). `tests/server-integration/telegram-sign-in.integration.test.ts`
  gained a test reproducing the exact attack against the live stack
  (signup refused, legitimate sign-in still succeeds); a companion static
  assertion in `tests/unit/server-stack.test.ts` needed a fix of its own
  first — an initial lazy regex crossed past `[auth.email]` into the
  unrelated, already-`false` `[auth.sms] enable_signup` line further down
  `config.toml` and so passed vacuously against a mutated flag, caught by
  mutation-testing the test itself before trusting it (a new
  `extractTomlSection` helper scopes the match to one section correctly).
- Fixed three smaller issues in the same review pass. Medium:
  `scan-bundle-secrets.mjs` still missed `supabase/functions/.env` — the
  most sensitive of the three env files it covers, holding the HMAC key
  that signs every Telegram user's `initData` — fixed by merging it into
  the same exact-value check as `.env`/`.env.local`. Minor:
  `MintSessionResult`'s `error` variant carried a `reason` string nothing
  ever read, removed; `verifyTelegramInitData`'s freshness check compared
  `now - authDate` in one direction only, so a validly-signed but
  future-dated payload was never flagged stale, fixed with `Math.abs`
  (low severity — still needs the real bot token to exploit). Deliberately
  not changed: the reviewer's suggestion that a wrong method should answer
  `405`/`Allow` rather than `400 malformed_request` — `save-sync/index.ts`'s
  own header comment already made 400 the deliberate, documented choice for
  every function reusing the save-sync protocol's error vocabulary (which
  `server-save-sync-protocol.md` §1 says identity endpoints do too), so
  introducing `405` here would itself be the inconsistency.
- All four fixes mutation-proven. `npm run verify:server` (49 Deno unit
  tests, 21 integration tests, unchanged 3 server-e2e tests) and the full
  client gate (442 unit tests, 51 E2E, build, secret scan, 10 production
  smoke) both re-pass from another completely clean
  `supabase stop`/`start`/`db reset` cycle.

- Implemented server-milestone Step 12 on 2026-09-11: Telegram sign-in.
  `supabase/functions/telegram-sign-in/index.ts`'s `verifyTelegramInitData`
  implements Telegram's documented algorithm exactly (data-check-string
  excludes `hash`/`signature`, sorted `key=value` pairs joined by `\n`;
  `secret_key = HMAC_SHA256(key="WebAppData", data=botToken)`;
  `computed = hex(HMAC_SHA256(key=secret_key, data=dataCheckString))` must
  equal `hash`, constant-time compared; `auth_date` freshness defaults to
  86400 s, a documented convention rather than a Telegram mandate) entirely
  on `crypto.subtle`, so it runs unmodified on Deno. Session-minting uses
  the confirmed community pattern for a provider Supabase Auth has no
  first-class API for: `admin.generateLink({type:'magiclink', email})`
  (creates `auth.users` if absent) returns `properties.hashed_token`; the
  client calls `auth.verifyOtp({token_hash, type:'email'})` to complete a
  real, GoTrue-tracked session. No schema change — a Telegram user maps to
  the deterministic, RFC 2606-reserved placeholder email
  `telegram-<id>@telegram.invalid`, so `generateLink` finds-or-creates
  without a `profiles` column or migration, matching how Steps 8 and 10
  also shipped with none. (This mapping is only safe with
  `[auth.email] enable_signup = false` — see the critical fix recorded
  above.)
- `src/platform/telegram/telegramSignIn.ts`'s `readTelegramInitData()`
  reads `window.Telegram.WebApp.initData` (never `initDataUnsafe`,
  Telegram's own unverified client-side convenience parse) and resolves
  `null` for every player today, since no Telegram Web App `<script>` tag
  was added to `index.html` — the still-unbuilt Mini App host,
  `server-threat-model.md` finding F1, deliberately separate, later work.
  `src/main.ts` computes `readTelegramInitData()` once at boot, before
  either identity chain, and calls `signInWithTelegram` **instead of**
  `ensureGuestSession` when non-null — "Inside Telegram this replaces the
  guest path entirely," the step's own words, not a linking flow the way
  Google's is — so `supabaseClientPromise` now has three independent
  consumers, each carrying its own `.catch` from the start.
- This is the first function `src/` calls directly with `fetch()` —
  finding F11's trigger (`server-threat-model.md`), actually tripped by
  Step 12 rather than the guessed Step 16/17. `supabase/functions/_shared/http.ts`
  gained a shared CORS policy (`corsHeaders`/`corsPreflightResponse`,
  allow-listing the two known dev origins), recorded in
  `server-save-sync-protocol.md` §14. Proving it against the real stack
  surfaced finding F12: the local Kong gateway unconditionally overwrites
  every Edge Function's `Access-Control-Allow-Origin` with `*` when the
  request carries an `Origin` header, reproduced against `whoami-check`
  (which sets no CORS header of its own) and against a deliberately
  unlisted origin — correct and tested at the application layer, not what
  a real local browser actually observes; a real deployment's behaviour is
  unverified.
- Step 12 evidence: unlike Steps 10–11, this step needed no real external
  account, domain, or paid membership — Telegram's `initData` verification
  never contacts Telegram's own servers, so every one of the step's test
  assertions is provable with hand-signed fixture vectors. 48 Deno unit
  tests (`verifyTelegramInitData` against valid/tampered/stale/wrong-token/
  malformed vectors, `handleTelegramSignIn` against every response shape
  with faked collaborators, and a defensive scan proving no response can
  carry the bot token) plus 7 new integration tests against the real
  deployed function: a valid, fresh, hand-signed `initData` mints a session
  whose `verifyOtp()` exchange actually succeeds and whose email matches
  the deterministic placeholder; a second sign-in for the same Telegram
  user id resolves to the identical `auth.users` id; tampered, stale, and
  wrong-bot-token payloads each answer 401 with no `tokenHash` and no bot
  token anywhere in the response; the CORS preflight answers 204 with a
  header a real browser accepts. `npm run verify:server` passes end to end
  from a clean `supabase stop`/`start`/`db reset` (48 Deno tests, 3
  migrations, 20 integration tests, 3 server-e2e tests); the client gate
  passes unchanged (438 unit tests, 51 E2E, build, secret scan, 10
  production smoke). A real, in-Telegram live pass (a free bot via
  @BotFather plus a tunnel) remains optional, later, user-requested work —
  the Mini App host finding F1 still names as unbuilt.

- Cut server-milestone Step 11 (Apple sign-in) on 2026-09-11 rather than
  implementing it. Sign in with Apple on the web has no local-development
  path the way Google's does: it requires a paid Apple Developer Program
  membership, a Services ID, a verified real domain (Apple checks ownership
  by hosting a file on it), and a registered HTTPS return URL — Apple
  accepts no `localhost`/`127.0.0.1` redirect at all. Offered the choice
  between acquiring those, building the code/config to spec with live
  verification deferred indefinitely, or cutting the step outright, the user
  chose to cut it — exactly the contingency `server-threat-model.md`
  finding F7 already recorded: "F7 cut Apple sign-in — Removes Step 11
  whole, and USD 99/year from §7.1." No code, config, or test was written
  for this step. Updated in the same change: `server-milestone-plan.md`'s
  Recorded-decisions Identity row, its Step 11 status-table row (split out
  of the former "11–37 Not started" block), its Definition of Done (which no
  longer requires all 37 validations to pass, only every non-cut one, and
  drops Apple from the guest-upgrade claim), and `server-threat-model.md`'s
  F7 entry, its §7.1 budget line, its step-by-step trace row for Step 11,
  and its "how to change a default" table — each now marked exercised.
  Identity in this milestone is anonymous guest, Google, and Telegram; if
  the membership and domain are acquired later, Step 11 is implemented
  fresh against the pattern Step 10 already established, not resumed from
  partial work, since none exists. Work proceeds to Step 12 (Telegram
  sign-in) in the same session on the user's explicit instruction.

- Implemented server-milestone Step 10 on 2026-09-10: Google sign-in.
  `supabase/config.toml` flips `enable_manual_linking` to `true` and adds
  `[auth.external.google]` reading `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  through `env(...)` substitution — the Supabase CLI's own quirk of reading
  only a project-root `.env` file, never `.env.local`, now documented in
  `.env.example` and `README.md`. `src/platform/web/googleSignIn.ts`'s
  `beginGoogleSignIn` calls `linkIdentity({provider: 'google'})` when a
  session already exists — keeping the same `auth.users` id, the step's core
  requirement — and `signInWithOAuth({provider: 'google'})` only when none
  does; `signOutOfSession` wraps `signOut()`. Both mirror
  `guestSession.ts`'s injected-`GoogleAuthClient`, never-throws contract, and
  a rejected *pre-redirect* request (a misconfigured provider, rate
  limiting) resolves to a typed `error` result rather than throwing. Google's
  real "identity already linked to another user" conflict — Step 13's job —
  cannot surface this way: GoTrue only discovers it after the player picks an
  account on Google's own page and the browser returns with
  `error_code=identity_already_exists` on the return URL, a fresh page load
  nothing in `src/` reads yet.
- Step 10 evidence: `tests/unit/google-sign-in.test.ts` proves the
  link-vs-sign-in branch by which collaborator was and was not called and
  that every error path resolves rather than throws; two new
  `tests/unit/server-stack.test.ts` static assertions pin
  `enable_manual_linking = true` and the `[auth.external.google]` block, and
  its `.env.example` check gained the two new variable names. No production
  UI exists yet — `HudView.ts`'s fixed HUD already covers the 360×640 canvas
  edge-to-edge (gold left, warehouse queue centered, income right), so a
  `DEV`-only `window.catMineIdleAccount` hook in `src/main.ts` exposes
  `beginGoogleSignIn()`/`signOut()`, the same diagnostic pattern Step 8
  established, rather than risking a DOM overlay colliding with existing HUD
  content or a canvas click target; a real entry point is a later,
  Phaser-rendered polish step. `npm run verify` passes end to end: lint, 422
  unit tests, 51 Chromium E2E (one confirmed pre-existing parallel-worker
  flake in `player-journey.spec.ts`, passes in isolation), strict build,
  secret scan, 10 production smoke. Unlike Steps 8–9, this step's own test —
  same user id and progress preserved, sign-out/in returns the same account
  — needed a real human completing Google's actual consent screen, which no
  local stack or CI runner can substitute for; that guided manual
  verification, using a real Google Cloud OAuth client the user created and
  the `chrome-devtools` MCP tools, passed on 2026-09-10: a fresh anonymous
  session (`user.id = 1550ed44-853a-4859-aedf-4ecbed13f48f`) navigated to
  real `accounts.google.com`, the user completed Google's own login (never
  seen by the assistant), and returned holding the identical `user.id`,
  `isAnonymous` now `false`, exactly one `google` identity, and the same
  `profiles` row (`created_at === updated_at`, so the Step 9 trigger never
  fired a second time). Signing out and calling `beginGoogleSignIn()` again
  — the `signInWithOAuth` branch, with no consent screen reappearing —
  returned the identical account. Not part of `npm run verify:server`, since
  no CI runner can drive a real human through Google's consent screen.
- A 2026-09-10 review of Step 10 found and fixed four issues, all
  mutation-proven. The `DEV` account hook was a second, independent consumer
  of `supabaseClientPromise` with no `.catch` of its own — the guest-session
  chain's `.catch` settles only that chain's own derived promise — so a
  rejected client promise reached an unhandled rejection a second time,
  reintroducing the exact bug class a Step 8 review had already fixed once;
  fixed with its own `.catch(() => {})`. `scripts/scan-bundle-secrets.mjs`
  read only `.env.local`, so `GOOGLE_CLIENT_SECRET` — deliberately placed in
  the separate `.env` file — had no exact-value guard, only the weaker
  name-level one; fixed by merging `.env` into the same check, confirmed
  against a real build/scan ("5 exact server-only value(s)" checked, up from
  3, no leak). The claim that Google's "identity already linked to another
  user" surfaces as this module's typed `error` result was wrong; corrected,
  and then reproduced live rather than only reasoned about — reloading the
  already-linked session and calling `beginGoogleSignIn()` again produced no
  consent screen at all, only an immediate redirect back carrying
  `error_code=identity_already_exists`, with the account untouched. Four
  smaller cleanups: `describeError` deduplicated into
  `src/platform/web/describeError.ts`; `GoogleAuthClient`'s unread session
  `user` field narrowed to `unknown`; the `declare global` block moved out
  from between two import statements in `src/main.ts`; and
  `redirectTo: window.location.origin` added to both OAuth calls so the
  return trip lands back on the origin that actually started it. Full client
  gate (422 unit tests, 51 E2E, build, secret scan, 10 production smoke)
  passes after the fixes.
- A follow-up review found a fifth issue, inside the fourth fix's own test.
  `beginGoogleSignIn` built `{ provider: 'google', options: undefined }` — the
  `options` key present with an undefined value — while the accompanying
  test's title claimed the code omitted the key entirely, and its assertion
  (`toHaveBeenCalledExactlyOnceWith`) is itself undefined-tolerant, so it
  passed under either shape and proved neither; confirmed with a standalone
  Vitest probe before changing anything (a call of `{ provider: 'google' }`
  alone satisfies an expectation of `{ provider: 'google', options: undefined }`).
  Fixed on both sides: the credentials object now genuinely omits `options`
  when no `redirectTo` is given, and the test reads `Object.keys()` off the
  real mock call, which does distinguish "absent" from "present but
  undefined." Mutation-proven in both directions; the full gate (422 unit
  tests) is unchanged.

- Implemented server-milestone Step 9 on 2026-09-10: profiles and row-level
  security. `supabase/migrations/20260910090000_profiles_signup_trigger.sql`
  adds `public.handle_new_user()` and its `on_auth_user_created` trigger —
  `security definer` plus `set search_path = ''`, the same hardening pattern
  `public.set_updated_at()` already used — so a fresh `auth.users` row always
  gets a `profiles` row, without the client or any manual insert ever being
  the one that creates it; `profiles` itself and its own-row select/update
  policies already existed from Step 5, which had deliberately left this
  trigger as the one remaining piece. `supabase/seed.sql`'s fixture guest now
  gets its profile from the trigger, with its `display_name` set by a
  follow-up `update` rather than a manual insert that would now collide on
  the primary key. `memory-bank/architecture.md` and
  `memory-bank/techContext.md` gained the identical trigger DDL in the same
  change, confirmed byte-identical by direct diff.
- Step 9 evidence: `tests/server-integration/profiles-rls.integration.test.ts`
  signs in two independent real anonymous identities through live Supabase
  Auth and, with real bearer tokens against the live PostgREST endpoint,
  proves the trigger alone created each profile row and that user A cannot
  select, insert into (using B's real, FK-satisfying id, isolating the RLS
  denial from a foreign-key rejection), update, or delete user B's row.
  Mutation-proven live: dropping `on_auth_user_created` from the running
  database (migration file untouched) failed five of the seven new tests by
  name, and reapplying it via `supabase db reset` turned all thirteen
  integration tests (six existing `whoami-check` plus these seven) green
  again. `npm run verify:server` passes end to end from a clean
  `supabase stop`; the unaffected client gate (401 unit tests, lint, strict
  build) was re-run directly rather than assumed unchanged.

- Added the clickable bottom-navigation shell on 2026-09-09. It reserves a
  compact fixed `0,582,360,58` region and renders five cohesive code-native
  illustrations: treasure chest, storefront, bolt, cat-manager badge, and map.
  Standard controls are 48×44 while Boost is a raised 62×50; all controls meet
  the 44×44 logical-pixel touch minimum and animate on press. The complete
  visible tiles, including their chrome and icon drawings, render at 60% scale
  without shrinking those touch regions.
  Clicks intentionally have no destination or gameplay effect yet. The mine
  camera now ends at y=582, remains independently scrollable, and the responsive
  Playwright coverage verifies all five targets on the real canvas. The full
  client verification passes: lint, 401 unit tests, 43 Chromium E2E tests,
  strict build, secret scan, and 10 production smoke tests. No save, IndexedDB,
  relational schema, balance, or core-state change was made.

- Created **Aureon** (`surface-elevator-tower:UR`) on 2026-09-08 from the
  user-supplied Gemini tower reference. The candidate retains the symmetrical
  navy-steel and dominant gold structure, open cabin bay, suspended filled
  hopper, sun/moon ornament, attached purple crystals, wooden floor, and
  right-side tray/badge bracket while removing the detached pink glow and star
  artifact below the structure. Deterministic chroma-key processing emitted a
  512×512 transparent RGBA asset plus a 128×128 native-scale preview. Strict QC
  passes with zero empty, source/output edge-touch, or paste-clamped frames.
  The complete source/QC/provenance package is under
  `art-source/cat-role-catalog/surface-elevator-tower/ur/aureon/`; nothing was
  copied into `public/assets`, and runtime/gameplay/save/schema behavior is
  unchanged.

- Created **Elon** (`elevator-cargo-cat:SSR`) on 2026-09-08 as the third SSR
  elevator cargo-steward candidate without replacing Mofy or Win. The candidate
  retains silver-white tabby fur, icy luminous eyes, moon-phase trim, a long
  striped tail, and a cool-glowing celestial cargo cube; royal-violet cloth and
  an amethyst gem provide the SSR signal. Deterministic processing emitted four
  128×128 RGBA frames, a 256×256 transparent sheet, a 220 ms/frame GIF, and
  contact/native-scale shaft previews. Strict QC reports 4/4 valid frames, zero
  empty/edge-touch/clamped frames, body-scale CV `0.00239`, and anchor-Y
  deviation `0.01131`. The package remains asset-only under
  `art-source/cat-role-catalog/elevator-cargo-cat/ssr/elon/`; no runtime/schema
  change.

- Created **Win** (`elevator-cargo-cat:SSR`) on 2026-09-08 as the second SSR
  elevator cargo-steward candidate without replacing Mofy. The candidate
  retains golden-orange tabby fur, pale luminous eyes, cloud collar, lightning
  trim, long striped tail, and a locked cargo ledger; royal-violet cloth and an
  amethyst gem provide the SSR signal. Deterministic processing emitted four
  128×128 RGBA frames, a 256×256 transparent sheet, a 220 ms/frame GIF, and
  contact/native-scale shaft previews. Strict QC reports 4/4 valid frames, zero
  empty/edge-touch/clamped frames, body-scale CV `0.01761`, and anchor-Y
  deviation `0.01618`. The package remains asset-only under
  `art-source/cat-role-catalog/elevator-cargo-cat/ssr/win/`; no runtime/schema
  change.

- Created **Mofy** (`elevator-cargo-cat:SSR`) on 2026-09-08 as the first
  catalogued elevator cargo-steward variant. The candidate retains the user's
  calico markings, mint-green eyes, long tail, leaf-shaped cloak, and carved
  wooden flower ledger; royal-violet cloth and an amethyst neck gem provide the
  SSR signal. Deterministic processing emitted four 128×128 RGBA frames, a
  256×256 transparent sheet, a 220 ms/frame GIF, and contact/native-scale shaft
  previews. Strict QC reports 4/4 valid frames, zero empty/edge-touch/clamped
  frames, body-scale CV `0.01500`, and anchor-Y deviation `0.00727`. The package
  remains asset-only under
  `art-source/cat-role-catalog/elevator-cargo-cat/ssr/mofy/`; the existing
  elevator cat remains the `N` runtime fallback and no runtime/schema changed.

- Created **Nautilus** (`warehouse-manager:SSR`) on 2026-09-08 as the first SSR
  warehouse manager. The candidate retains charcoal-black fur, glowing aqua
  eyes, a wave-pattern cloak, and a golden shell-shaped inventory ledger;
  royal-violet/deep-amethyst cloth and an amethyst gem provide the SSR signal.
  Deterministic largest-component processing removed a detached motion mark
  and emitted four 128×128 RGBA frames, a 256×256 transparent sheet, a
  220 ms/frame GIF, and contact/native-scale context previews. Strict QC reports
  4/4 valid frames, zero empty/edge-touch/clamped frames, body-scale CV
  `0.01471`, and anchor-Y deviation `0.00081`. The package remains asset-only
  under `art-source/cat-role-catalog/warehouse-manager/ssr/nautilus/`; no
  runtime/schema change.

- Created **Gauge** (`warehouse-manager:SR`) on 2026-09-08 as the third SR
  warehouse manager without replacing Cipher or Baron. The candidate retains
  orange tabby fur, utility field coat, steel shoulder guard, and a mechanical
  gear-emblem inventory clipboard; sapphire-blue scarf and cyan highlights
  provide the SR signal. Deterministic largest-component processing removed
  detached motion marks and emitted four 128×128 RGBA frames, a 256×256
  transparent sheet, a 220 ms/frame GIF, and contact/native-scale context
  previews. Strict QC reports 4/4 valid frames, zero empty/edge-touch/clamped
  frames, body-scale CV `0.00492`, and anchor-Y deviation `0.02311`. The package
  remains asset-only under
  `art-source/cat-role-catalog/warehouse-manager/sr/gauge/`; no runtime/schema
  change.

- Created **Baron** (`warehouse-manager:SR`) on 2026-09-08 as a second SR
  warehouse manager without replacing Cipher. The candidate retains fluffy
  cream fur, pale-gold eyes, a plume-like tail, ivory-and-gold ceremonial armor,
  and an ornate physical inventory scroll; sapphire-blue cloth provides the SR
  signal. Deterministic processing emitted four 128×128 RGBA frames, a 256×256
  transparent sheet, a 220 ms/frame GIF, and contact/native-scale context
  previews. Strict QC reports 4/4 valid frames, zero empty/edge-touch/clamped
  frames, body-scale CV `0.00275`, and anchor-Y deviation `0.01537`. The package
  remains asset-only under
  `art-source/cat-role-catalog/warehouse-manager/sr/baron/`; no runtime/schema
  change.

- Created **Cipher** (`warehouse-manager:SR`) on 2026-09-08 and registered the
  code-facing `warehouseManager` as the catalog's second role, using canonical
  kebab-case metadata. The candidate retains charcoal-black fur, pale-gold eyes,
  futuristic armor, and a holographic inventory tablet; sapphire/electric blue
  and cyan provide the SR signal. Deterministic processing emitted four 128×128
  RGBA frames, a 256×256 transparent sheet, a 220 ms/frame GIF, and
  contact/native-scale context previews. Strict QC reports 4/4 valid frames,
  zero empty/edge-touch/clamped frames, body-scale CV `0.00744`, and anchor-Y
  deviation `0.01456`. The existing warehouse-manager sprite remains the `N`
  runtime fallback; no runtime/schema change.

- Created **Sovereign** (`unloader:SSR`) on 2026-09-08 as the third SSR
  unloader without replacing Aegis or Zenith. The candidate retains the
  long-haired lynx silhouette, cream mane, tufted ears, glowing pale-gold eyes,
  open receiving paws, and ornate attached treasure chest; royal-violet cloth
  and an amethyst belt gem provide the SSR signal. Deterministic processing
  emitted four 128×128 RGBA frames, a 256×256 transparent sheet, a 220 ms/frame
  GIF, and contact/native-scale context previews. Strict QC reports 4/4 valid
  frames, zero empty/edge-touch/clamped frames, body-scale CV `0.00736`, and
  anchor-Y deviation `0.00255`. The complete package remains asset-only under
  `art-source/cat-role-catalog/unloader/ssr/sovereign/`; no runtime/schema
  change.

- Created **Zenith** (`unloader:SSR`) on 2026-09-08 as a second SSR unloader,
  without replacing Aegis. The candidate retains the cream/dark Siamese
  identity, pale-gold eyes, celestial costume, compact gold balance scales, and
  open-paw receiving pose; deep-violet cloth and an amethyst forehead gem make
  purple the SSR signal. Deterministic processing emitted four 128×128 RGBA
  frames, a 256×256 transparent sheet, 220 ms/frame GIF, and contact/native-
  scale context previews. Strict QC reports 4/4 valid frames, zero empty/edge-
  touch/clamped frames, body-scale CV `0.00271`, and anchor-Y deviation
  `0.00070`. The catalog now supports multiple characters within one rarity via
  character-qualified IDs such as `unloader:SSR:zenith:idle`. The complete
  package remains asset-only under
  `art-source/cat-role-catalog/unloader/ssr/zenith/`; no runtime/schema change.

- Created **Aegis** (`unloader:SSR`) from the user's supplied reference on
  2026-09-08. The four-frame candidate retains the silver-gray tabby identity,
  pale-gold eyes, gold ceremonial armor, and open-paw attendant silhouette;
  deep-violet cloth/inlays plus an amethyst chest gem make purple the SSR signal
  without collapsing into Tally's gold-signalled UR palette. Deterministic
  processing emitted four 128×128 RGBA frames, a 256×256 transparent sheet, a
  220 ms/frame GIF, and contact/native-scale context previews. Strict QC reports
  4/4 valid frames, zero empty/edge-touch/clamped frames, body-scale CV
  `0.00204`, and anchor-Y deviation `0.00288`. The complete candidate and
  provenance remain under `art-source/cat-role-catalog/unloader/ssr/` awaiting
  user review; `src/`, `public/assets/`, gameplay, and schemas did not change.

- Created the first asset-only rarity candidate, **Tally** (`unloader:UR`), from the user's
  supplied reference on 2026-09-08. Built-in image generation produced the raw
  2×2 idle family; the deterministic sprite processor emitted four 128×128
  transparent frames, a 256×256 RGBA sheet, and a 220 ms/frame GIF. Strict QC
  reports 4/4 valid frames, zero empty/edge-touch/clamped frames, body-scale CV
  `0.00465`, and anchor-Y deviation `0.00609`; alpha and native-scale cave
  context checks pass. The candidate remains under
  `art-source/cat-role-catalog/unloader/ur/` awaiting user review, with prompt,
  source, reference, previews, metadata, and provenance retained. No file in
  `src/` or `public/assets/` changed and no gameplay/schema integration exists.

- Established the cat-role asset catalog contract on 2026-09-08. All roles use
  the fixed rarity order `N` (Bình thường, gray), `R` (Hiếm, green), `SR` (Siêu
  hiếm, blue), `SSR` (Siêu siêu hiếm, purple), and `UR` (Siêu cấp hiếm, gold).
  The existing Step 32A unloader is preserved as the runtime default and
  registered as the `unloader:N` baseline; the other unloader tiers await user
  references. `art-source/cat-role-catalog/art-direction-brief.md` defines the
  input contract, naming, technical frame, family invariants, QA, and explicit
  asset-only boundary, while `asset-manifest.json` records the taxonomy and
  variant status. No runtime code, gameplay attributes, balance, state,
  persistence, or schema changed.

- Step 37 was validated by the user on 2026-09-08. That validation closes the base-game milestone: all 37 plan steps now have recorded passing evidence and explicit user validation, and the plan's Definition of Done is met — the production bundle is playable in a mobile-sized browser, all fifteen floors run concurrently, progression is viable, saves and offline rewards are deterministic, no deferred feature leaked into scope, and the documentation reflects the delivered state.
- Step 37 implemented on 2026-09-08: the base-game closing review. It changed no runtime code, no balance value, and no schema version. It reviewed the delivered game against `memory-bank/implementation-plan.md` and the GDD acceptance criteria, recorded every deferred feature rather than implementing it, and brought the repository documentation in line with what actually ships.
- Step 37 documentation gap — the step's own gate requires that a new developer can install, run, test, and understand the base game from repository documentation alone, and the repository had no `README.md` at all. One was added covering requirements, install, every npm script with its port, the layering and its four load-bearing rules, the simulation and persistence contracts, the testing layout, a map of `memory-bank/`, delivered versus deferred scope, and style.
- Step 37 documentation corrections — six documents still described a mine that no longer exists. `AGENTS.md` opened with "this repository is currently in the design phase" and "no application scaffold or package scripts exist yet", and claimed no Git history existed to infer a commit convention from. `CLAUDE.md` described 4 floors, a round-robin elevator cursor, and `K/M/B/T` formatting, and omitted `test:prod`, `verify`, and `test:perf`. `architecture.md` listed four floor states, said "Floors 2–4 unlock", carried a stale `(124,58,44,50)` elevator badge region contradicting its own later section, and described a four-text-object HUD that has five text objects and three icons. `techContext.md` said startup validation requires exactly four sequential floors. `activeContext.md` listed four mine shafts as a current active decision. `systemPatterns.md` described the benchmark as holding an all-four-floor scene. All are corrected; dated historical entries were left as written, because they record what was true when written.
- Step 37 scope audit — no deferred feature leaked into `src/`. Authoritative state carries only gold, timing counters, fifteen floor records, elevator, and warehouse. There is no manager, boost, gift, shop, premium-currency, Telegram, or payment code; every `manager` identifier in the tree names the cosmetic warehouse supervisor sprite.
- Step 37 evidence gap closed rather than recorded — the Step 35 result on file measured the former four-floor mine, while the plan requires all fifteen floors active and the fixture had already been changed to seed fifteen. The ten-minute benchmark was re-run against the full mine and passes every budget: 60.00 FPS, 16.67 ms mean, 17.6 ms p95, 17.8 ms maximum, zero of 36,135 frames beyond the 18.34 ms threshold, +193,680 bytes post-GC heap growth at a +990 bytes/s slope, 665 Phaser objects and 371 DOM nodes exactly constant across all twenty samples, fifteen floors unlocked at boot and at end, and 83.5 ms scroll p95. Three figures moved materially from the four-floor run and are recorded rather than smoothed over: startup 819 → 1,177 ms, scroll p95 50.1 → 83.5 ms (the tightest remaining margin against its 100 ms budget), and the heap slope from −502 to +990 bytes/s, which oscillates rather than climbing and sits well inside the 2,048 bytes/s budget. This run presented at 60 Hz where the earlier one presented at 120 Hz, so mean frame time is the vsync interval and carries no headroom information; the meaningful result is that no frame missed its interval. `performance-results/step-35-report.md` was rewritten with the new figures and keeps the four-floor numbers for comparison.
- Step 37 prior-step evidence — all thirty-six prior steps carry recorded passing evidence in the step-status table below, and every one of Steps 3 through 36 records explicit user validation.

- 2026-09-08 HUD queue clarification completed: the centre HUD number is the amount already waiting inside `warehouse.inputQueue`, not elevator cargo; its icon is the warehouse texture. Focused verification passes with 9 unit tests and 2 Chromium E2E tests.
- 2026-09-08 empty tower-hopper feedback completed: a new transparent 512×512 empty-headhouse variant removes the baked gold only for a zero warehouse input queue; runtime texture switching restores the filled headhouse for any positive queue and reapplies the fixed display bounds. Asset provenance/QC is in the Step 32A manifest; 4 focused asset tests and 2 Chromium E2E tests pass.
- 2026-09-08 elevator floor-priority bug completed: loading now records whether the current floor was drained and whether pickup filled the exact remaining capacity. The route can descend only when the floor is empty and capacity remains; a full decimal load snaps to configured capacity instead of leaking a tiny false remainder. The new regression reproduces the former `50.004999999999995 < 50.005` branch, and 32 focused unit tests pass.
- 2026-09-08 surface-hauler alignment feedback completed: assistant cats and their paired carts keep distinct phase-shifted X positions but no longer use staggered Y lanes; every visible worker/cart now shares the lead route baseline. Thirty-one focused unit tests and one Chromium E2E regression pass.
- 2026-09-07 browser feedback implemented: the fixed HUD is 52 logical pixels high; its centre value is the authoritative `warehouse.inputQueue` and uses the warehouse icon; the configuration and authoritative state contain exactly fifteen floors; presentation reveals 1–5 initially, 1–10 after floor 5 opens, and 1–15 after floor 10 opens.
- The reveal transition resizes the scroll range without restarting the scene, and hidden floors publish no controls or diagnostics. Existing four-floor version-1 save documents migrate in memory to fifteen floors while save-document and IndexedDB versions remain 1.
- Aggregate revision evidence: 322 unit tests, 38 Chromium E2E tests (including explicit floor-5/floor-10 reveal gates and filled/empty tower states), all 9 production smoke tests, lint, strict build, and `git diff --check` pass. The live in-app browser reports one canvas, the HUD warehouse icon and authoritative queue, the empty tower texture at queue zero, identical lead/assistant cat and cart Y coordinates, and no console errors.

- Reference video reviewed and its visible gameplay elements documented.
- Simple GDD created in `memory-bank/game-design-document.md`.
- MVP scope and explicit exclusions defined.
- Technical stack and planned architecture documented in `memory-bank/tech-stack.md`.
- Repository contribution rules documented in `AGENTS.md`.
- Six core Memory Bank files initialized.
- Required pre-code document checks and database-schema documentation rules established.
- Detailed base-game implementation plan created with validation for every step.
- GDD, tech stack, and implementation plan moved into `memory-bank/`; related links and base-game decisions updated.
- Architecture documentation workflow added; the file began as an empty placeholder and is now maintained as the architecture map.
- Step 1 completed on 2026-08-27: all Memory Bank files and `AGENTS.md` were reviewed; the base-game boundary was confirmed; the repository was verified as documentation-only; no package manifest, source tree, database, migration, or schema was found.
- `memory-bank/architecture.md` populated with current document responsibilities, planned runtime-module ownership, dependency boundaries, data flow, and the explicit `none` database schema.
- Step 2 completed and validated on 2026-08-27: the Vite/TypeScript scaffold loads in a browser, Phaser 4.2.1 is locked, the production build passes, and simulator-preview scripts are available.
- Step 3 implemented on 2026-08-27: strict TypeScript, ESLint flat configuration, Vitest, Playwright Chromium testing, required package scripts, and generated-artifact ignores are present.
- Step 3 automated evidence: `npm run lint`, `npm run test`, `npm run test:e2e`, and `npm run build` pass; the development server responds successfully at its local URL and stops cleanly.
- Step 3 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 4.
- Step 4 implemented on 2026-08-27: all planned source-module entry points and placeholder asset storage exist, with no gameplay or Step 5 runtime code.
- Step 4 automated evidence: lint and strict build pass; the architecture regression test accepts pure core TypeScript and rejects Phaser, persistence/platform, and browser dependencies.
- Step 4 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 5.
- Step 5 implemented on 2026-08-27: one Phaser game boots one scene into a 360×640 canvas using automatic WebGL/Canvas selection, fit-and-center scaling, a neutral background, and no physics configuration.
- Step 5 automated evidence: lint, unit tests, strict production build, and the Chromium E2E test pass; the browser test confirms exactly one canvas and one scene start before and after reload with no console or page errors.
- Step 5 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 6.
- Step 6 implemented on 2026-08-27: typed provisional data now defines starting gold, four mine floors, sequential unlocks, one elevator, one warehouse, upgrade curves, and the shared milestone schedule.
- Step 6 automated evidence: startup validation succeeds and the unit suite rejects missing floors, duplicate identifiers, negative durations, non-positive yields, and invalid milestone ordering.
- Step 6 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 7.
- Step 7 implemented on 2026-08-27: `GameNumber` encapsulates break_infinity.js 2.2.0 behind immutable construction, arithmetic, comparison, and string-serialization APIs.
- Step 7 automated evidence: unit tests pass for ordinary values, values beyond JavaScript's safe-integer range, immutable add/subtract/multiply operations, comparisons, serialization/deserialization, JSON output, and invalid sources.
- Step 7 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 8.
- Step 8 implemented on 2026-08-27: authoritative state types and a deterministic factory now model save version, timestamp, gold, four floors, elevator, warehouse, progress, queues, capacities, and production totals.
- Step 8 automated evidence: fresh state has only floor one unlocked, all progress is normalized, all quantities initialize correctly through `GameNumber`, invalid timestamps fail, and JSON output contains only authoritative plain data.
- Step 8 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 9.
- Step 9 implemented on 2026-08-27: foreground time advances through immutable 100 ms fixed ticks, carries authoritative sub-tick remainder, caps credited simulation time at 1,000 ms per update, and consumes the full wall-clock delta.
- Step 9 automated evidence: one large update, ten regular updates, and irregular chunks produce identical state; partial time carries correctly, oversized and invalid deltas are handled as specified, and production values remain unchanged before extraction is implemented.
- Step 9 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 10.
- Step 10 implemented on 2026-08-27: unlocked floors advance extraction during fixed ticks, apply configured exponential level yield, enqueue output only at completed cycle boundaries, update total extracted, and retain overflow progress.
- Step 10 automated evidence: tests cover immediately before, exactly at, and beyond a cycle boundary; level-adjusted output; every configured floor; locked-floor inactivity; deterministic chunking; multiple cycles; and no direct spendable-gold increase.
- Step 10 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 11.
- Step 11 implemented on 2026-08-27: one shared elevator scans unlocked non-empty floors round-robin, picks up to its capacity, leaves excess queued, tracks in-transit material and progress, and delivers completed loads to the warehouse input queue.
- Step 11 automated evidence: tests cover empty idling, capacity limits, pre-completion isolation, locked/empty skipping, round-robin fairness, multiple cycles, no direct gold delivery, and exact material conservation across queues, transit, and warehouse input.
- Step 11 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 12.
- Step 12 implemented on 2026-08-27: the warehouse advances a timed conversion only with queued input, consumes at most capacity per completed cycle, and adds converted material 1:1 to spendable gold and total delivered gold.
- Step 12 automated evidence: tests cover idle behavior, progress before the boundary, capacity-limited and repeated completion, input immutability, deterministic chunking, and conservation across floor queues, elevator transit, warehouse input, and delivered gold.
- Step 12 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 13.
- Step 13 implemented on 2026-08-27: every unlocked floor advances automatically before the shared elevator and warehouse on each fixed tick, enabling same-tick handoffs while locked floors remain inert.
- Step 13 automated evidence: independently calculated floor outputs and progress match simulation results; same-tick handoffs, locked-floor inactivity, deterministic chunking, and full material conservation are covered.
- Step 13 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 14.
- Step 14 implemented on 2026-08-27: pure calculations expose theoretical extraction per second for every floor and derive effective mine production from the minimum of aggregate unlocked extraction, elevator capacity per second, and warehouse capacity per second.
- Step 14 automated evidence: tests cover current-level floor rates, locked-floor exclusion from aggregate extraction, extraction/transport/warehouse bottlenecks, correct effective rates, and no mutation of authoritative state.
- Step 14 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 15.
- Step 15 implemented on 2026-08-27: separate `GameNumber` prices and immutable purchase commands now support mine shafts, the elevator, and the warehouse, deducting the exact price and incrementing only the selected level.
- Step 15 automated evidence: tests cover exact starting and representative prices, exact-balance success, independent stage purchases, insufficient funds, locked/missing floors, invalid levels, original-state failures, and preservation of queues, progress, capacities, totals, and unrelated stages.
- Step 15 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 16.
- Step 16 implemented on 2026-08-28: mine-shaft upgrades immediately affect level-derived extraction yield, while elevator and warehouse purchases deterministically recalculate capacity from base capacity and the configured 1.12 growth rate without changing cycle durations.
- Step 16 automated evidence: fifty-six unit tests pass, including equal-duration production comparisons for all three stages, bottleneck-aware rate improvements, exact level-two target capacities, and preservation of queues, carried material, totals, cursors, timestamps, and normalized in-progress work.
- Step 16 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 17.
- Step 17 implemented on 2026-08-28: mine shafts, the elevator, and the warehouse now apply cumulative configured milestones at levels 10/25/50/100 through a shared level-effect calculation used by actual production, initial capacity, purchases, and rate estimates.
- Step 17 automated evidence: sixty-one unit tests pass, covering every multiplier threshold, all three production stages crossing level 10, milestone-aware rates and initial state, preservation of in-progress work, and reload-style proof that a reached milestone is not applied twice.
- Step 17 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 18.
- Step 18 implemented on 2026-08-28: one immutable command now unlocks floors 2–4 only when the configured immediately previous floor is unlocked at the required shaft level and the exact unlock cost is affordable, then initializes the target floor from configuration.
- Step 18 automated evidence: sixty-eight unit tests pass, covering unmet and locked prerequisites, insufficient funds, exact single deduction, configured initialization, duplicate and unknown requests, all three sequential unlocks, state preservation, and production from a newly opened floor.
- Step 18 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 19.
- Step 19 implemented on 2026-08-28: a pure deterministic economy harness advances a fresh session in one-second decisions, unlocks eligible floors, reserves unlock funds after prerequisites are met, and otherwise buys the affordable upgrade with the best modeled bottleneck improvement using deterministic progression-aware tie-breaking.
- Step 19 automated evidence: seventy-four unit tests pass. The ten-minute session deterministically opens floors 2, 3, and 4 at 45, 139, and 317 simulated seconds, reaches a level-10 milestone without runaway level-100 growth, keeps every balance and progress value finite and non-negative, retains a positive effective production rate, and records only positive-cost actions with non-negative modeled improvements. Focused tests also prove elevator-bottleneck selection, next-unlock tie-breaking, deterministic replay, and invalid-duration rejection. Lint and production build pass without changing the provisional balance.
- Step 19 was validated by the user through explicit authorization to proceed with Step 20.
- Step 20 implemented on 2026-08-28: version-1 save creation now serializes the complete authoritative state and effective production-rate snapshot into strict plain JSON; migration dispatch, config-aware validation, and runtime deserialization are defined before any storage adapter.
- Step 20 automated evidence: ninety-three unit tests pass. Nineteen save-schema tests cover valid creation and exact JSON/runtime round trips, current-version migration dispatch, missing/unsupported versions, malformed/non-string numeric values, unknown/reordered/missing floor identifiers, negative floor/elevator/warehouse queues, unsafe/inconsistent timestamps, invalid progress/counters/capacities, locked-floor production, broken unlock order/gates, and transient unknown properties. Lint and production build pass.
- Step 20 was validated by the user through explicit authorization to proceed with Step 21.
- Step 21 implemented: Dexie 4.4.5 now stores one active version-1 document behind a storage interface; routine writes debounce to the newest snapshot, supported web lifecycle events force a flush, and load/save failures resolve safely while exposing user-facing diagnostics and retaining failed writes for retry.
- Step 21 automated evidence: one hundred three unit tests pass. Ten new persistence/regression tests cover the IndexedDB schema constants, exact full-state restoration after database close/reopen, one-record replacement, empty loads, latest-only debouncing, hidden/page-hide forced saves and unbinding, non-throwing save failure plus retry, non-throwing load failure plus visible diagnostic, invalid debounce rejection, and canonical serialized capacity restoration at upgraded levels. Lint and production build pass.
- Step 21 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 22.
- Step 22 implemented on 2026-08-28: the active-game load boundary now fully restores valid saves, creates an ordinary fresh game for empty storage, and automatically replaces malformed or unsupported load candidates with a complete fresh runtime state plus a typed visible warning. Invalid payloads are detached for diagnostics when structured cloning is safe, no corrupt field is partially applied, and diagnostic listeners cannot crash recovery or leave persistence flushes permanently rejected.
- Step 22 automated evidence: one hundred ten unit tests pass. Seven new recovery/regression tests cover valid restoration, empty-save startup, malformed current-version recovery, unsupported-version recovery, safe and unsafe payload preservation, playable fresh-state invariants, throwing warning callbacks, and throwing persistence diagnostic callbacks with successful later retry. Lint and production build pass.
- Step 22 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 23.
- Step 23 implemented on 2026-08-28: offline income now uses the saved effective-production-rate snapshot, a validated two-hour cap, and 50% efficiency. Valid loads replace the authoritative timestamp with the injected current time and force-save that consumed interval before returning a positive pending reward; future clocks return zero and are corrected, repeated same-time reloads return zero, and failed settlement writes withhold the reward while preserving the running session and save diagnostic. Spendable gold remains unchanged for the Step 24 claim flow.
- Step 23 automated evidence: one hundred twenty unit tests pass. Ten new balance/offline/persistence tests cover exact provisional configuration, invalid caps and efficiencies, zero and normal absences, two-hour capping, future timestamps, very large saved rates, invalid inputs, immutable gold/state, load-time timestamp persistence, repeated reload protection, and reward withholding when settlement storage fails. Lint and production build pass.
- Step 23 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 24.
- Step 24 implemented on 2026-08-28: browser startup now loads the active IndexedDB save before Phaser boot, creates a pending view only for positive offline income, and displays credited time plus the exact reward in an accessible modal. Claiming adds the exact `GameNumber` amount through a pure command, consumes the pending value, and force-persists the claimed authoritative state before dismissal. One cached claim candidate makes save retries idempotent.
- Step 24 automated evidence: one hundred twenty-five unit tests and two Chromium E2E tests pass. New coverage verifies positive-only pending creation, exact large-number addition, consumed/no-op repeated claims, invalid pending values, credited-duration copy, fresh-player modal absence, returning-player modal contents, exact persisted gold, and no reward recreation after a controlled-clock reload. Lint and production build pass; `git diff --check` is clean.
- Step 24 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 25.
- Step 25 implemented on 2026-08-28: a pure Phaser-free layout module tiles the fixed 360×640 portrait viewport into a fixed top HUD, a shared elevator/warehouse surface strip, and a scrollable mine area that reaches the bottom edge with no bottom navigation reserved or rendered. `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on `#app` makes the `#game-viewport` Phaser parent the safe box, and `FIT` with `CENTER_BOTH` letterboxes instead of cropping. The mine is clipped by a dedicated camera viewport because Phaser 4 removed WebGL geometry masks, and its then-current 508-pixel placeholder content exceeded the 428-pixel region so the area had to scroll.
- Step 25 automated evidence: one hundred forty-four unit tests and six Chromium E2E tests pass. Sixteen layout/palette unit tests cover the documented region rectangles, gap-free tiling, the absent bottom-navigation strip, larger logical viewports, invalid and too-short dimensions, overflowing scroll content, sequential floor slots, invalid floor counts/indexes, and the diagnostic serialization format. Four Playwright viewport tests (narrow phone 320×568, tall phone 390×844, tablet portrait 768×1024, desktop 1280×800) assert the canvas fits both the viewport and the safe box, preserves its aspect ratio, keeps every region on screen in HUD → surface → mine order, pins the HUD to the top and the mine to the bottom edge, exposes no navigation element, and logs no console errors. Four pixel probes per viewport sample the real canvas and prove both camera ignore lists hold; they were validated by mutation, each of three broken-render mutations now failing with a named assertion. `eslint.config.mjs` enforces the `src/game/layout` purity claim and `tests/unit/architecture.test.ts` probes that rule. Lint and production build pass; `git diff --check` is clean.
- Step 25 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 26.
- Step 26 implemented on 2026-08-28: a pure `src/game/view-model` module derives every displayed floor number, mine-shaft level, lock state, extraction progress, queued-material amount, and pile height from a read-only `GameState`, and reusable `MineFloorView`/`SharedStageView` Phaser entities render it. Four floor views fill the scrollable mine slots with a floor badge, heading, level, placeholder miner, material pile, extraction progress bar, and a shaft-upgrade control; locked floors are drawn in their own colour with a `Locked` badge, no miner, and no upgrade control. The shared elevator and warehouse render in the surface strip with their own level, capacity, held amount, cycle-progress bar, and upgrade control. Controls are presentational only — Step 29 makes them interactive.
- Step 26 automated evidence: one hundred fifty-nine unit tests and seven Chromium E2E tests pass. Twelve view-model unit tests cover snapshot mirroring for all four floors, locked-floor status and hidden controls, both shared stages, a fresh game, non-mutation of the snapshot, rejected progress/level values, pile-height thresholds, and provisional amount formatting. The new browser test seeds a known version-1 save whose floors differ in lock state, level, progress, and queued material, then compares every displayed floor number, level, lock state, and progress value — plus both shared stages — against that core snapshot. Rendered values are read back from the view objects themselves rather than from the scene's intentions, and eight pixel probes prove the panels, locked colour, progress fills, and pile heights actually reach the framebuffer. Six mutations were verified to fail with named assertions: binding every floor view to floor one, drawing locked floors like unlocked ones, ignoring extraction progress in the bar, ignoring the queue in the pile, binding the elevator view to the warehouse, and building the floor views without drawing them. `eslint.config.mjs` enforces `src/game/view-model/**` purity and `tests/unit/architecture.test.ts` probes that rule. The Step 25 surface pixel probe moved to the strip above the new stage panels, which its own background still owns. A tenth mutation was added with the review fix below.
- Step 27 review fix — hidden-tab time loss: the driver passed the whole wall-clock gap to `advanceSimulation`, which credits at most `MAX_FOREGROUND_DELTA_MS` but consumes the entire delta. That bound is meant for one slow frame; a hidden tab stops the render loop altogether, so an absence arrived as a single delta and everything past its first second was consumed having never been simulated. Reproduced at sixty seconds: 380 gold when frames ran throughout against 100 — the starting balance — when the same minute arrived as one frame, with the timestamp advanced sixty seconds either way. Because that scenario involves no reload, offline income never saw the interval either. `src/core/simulation/catchUpSimulation.ts` now walks the gap in credited-size slices, which is exact rather than approximate because the sub-tick remainder is carried in authoritative state, and bounds the walk at `MAX_CATCH_UP_MS` (two hours, matching the offline-income horizon) at a measured worst case of roughly thirty milliseconds. Time past the bound is still consumed by `lastUpdateTimestampMs`. Eight new unit tests cover both the core walk and the driver; three mutations fail by name — the driver reverted to a single bounded advance, uncredited time dropped rather than consumed, and the walk left unbounded. - Step 27 review fix — per-frame waste: the driver re-derived its view model on every frame because `advanceSimulation` returns a new object even when no tick completed, which also meant `BootScene`'s identity check could never fire. It now re-derives only when `simulationTick` advanced — the exact condition, since nothing outside `advanceFixedStep` touches production state — while `replaceState` always re-derives, and the renderable guard moved behind the identity check it protects. Separately, the rendered-state read-back is now gated on `import.meta.env.DEV`: nothing in the game reads those attributes, and a shipped build was serializing the whole screen ten times a second. Playwright runs against the dev server, so browser tests are unaffected, and the production bundle no longer contains the dataset writes. Three more mutations fail by name: a driver that never memoizes, a driver that never re-derives, and a `replaceState` that reuses the snapshot. One hundred ninety-eight unit tests, twelve Chromium E2E tests, lint, strict production build, and `git diff --check` pass.
- Step 26 review fixes: the rendered-state diagnostic is republished on every `applySnapshot`, not only at boot, so a live snapshot that fails to reach the views cannot hide behind a frozen first-frame report; and a snapshot whose floor count does not match the views throws through the pure `assertRenderableMineViewModel` guard instead of being partially applied, while a snapshot arriving before `create` is retained and bound by `create`. Two unit tests cover the guard and one browser test drives a second snapshot through the public `applySnapshot` path; both fixes were mutation-verified. Two further cleanups landed with them: `MineFloorView` derives its progress-track width from the floor slot as `SharedStageView` already did rather than hardcoding it, guarded by a containment assertion per floor; and the browser test imports the views' own read-back types instead of restating them, so a renamed `describeRenderedState` field fails type-check. Two further cleanups followed: `MineFloorView` anchors its `Locked` badge and upgrade control once each instead of hand-synchronising three offsets, and the shared-stage read-back reports the bound `upgradeControlLabel` instead of an always-true visibility flag, while the floor pile expectation is derived through `calculateMaterialPileSteps` so balance tuning cannot fail the test opaquely. One hundred sixty-one unit tests and eight Chromium E2E tests pass.
- Step 26 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 27.
- Step 27 implemented on 2026-08-29: the mine is now live and each production stage is visualised separately. A Phaser-free `MineSimulationDriver` holds authoritative state and advances it to an injected wall clock every time the scene pulls, so `BootScene.update` renders what the core has already produced and never decides when a cycle completes. Extraction, transport, and warehouse each drive their own progress indicator — a per-floor bar, and a cycle bar plus a marker travelling its track for both shared stages — and queued material is rendered everywhere it accumulates as discrete blocks measured against the capacity of the stage that removes it. A full pile turns to the backlog colour and is named `Backed up`, while the elevator reports `Idle` or `In transit` because a full car is one full trip rather than a backlog. A separate cosmetic clock, scaled by a validated `animationSpeedMultiplier`, drives only the miners' picks and the shared-stage conveyors, which run only while a stage holds material.
- Step 27 automated evidence: one hundred eighty-seven unit tests and twelve Chromium E2E tests pass. Twenty-six new unit tests cover the cosmetic clock (speed scaling, freezing at zero, frame capping, invalid deltas, seamless wrapping, swing and conveyor bounds, and the progress-only cycle marker), the driver (clock-driven advance, frozen and backwards clocks, identical results at 200 ms and 20 ms frames, state replacement, snapshot mirroring, and identical gold at animation speeds 0, 1, and 25), and the new bottleneck view-model fields for floors, elevator, and warehouse. Three browser fixtures pause the core on an extraction-, transport-, and warehouse-limited save and assert that the corresponding queue and progress indicator are visible, backed by pixel probes for the backlog colour, the empty queue, and the cycle marker at the start and midpoint of its track. A fourth browser test runs the real driver twice over the same eight seconds of fake wall clock at animation speeds 1 and 20 and asserts byte-identical gold while the animation clock differs by more than tenfold. The extraction fixture also polls the rendered pick offset to show decoration still moving while the paused core's extraction bar does not.
- Step 27 review fixes and decisions: the public `applySnapshot` was removed in favour of the pull, since a pushed snapshot would be overwritten by the next frame; the offline-claim retry now uses a consumed-once flag instead of a cached state candidate, which would have discarded whatever was mined between a failed write and the retry; and rendered-state diagnostics moved to a 100 ms cadence because displayed progress changes every frame. `eslint.config.mjs` enforces `src/game/runtime/**` purity and `tests/unit/architecture.test.ts` probes that rule. Nine mutations were verified to fail with named assertions: a speed multiplier wired to nothing, a scene that never advances the core, a pile that ignores the backlog colour, shared-stage queue blocks that ignore the amount, a cycle marker parked at the start of its track, a conveyor that never stops, a cosmetic clock allowed to drive the authoritative progress bar, a diagnostic frozen at boot, and a floor pick that never moves. A latent pixel-probe race surfaced once the suite grew: the scene publishes its diagnostics inside `create`, before the first frame is presented, and a canvas that has not yet presented reads back as opaque black, so a probe taken immediately after the boot attribute could sample an empty buffer. Both browser specs now poll an always-painted HUD point before any probe; the full suite then passed five consecutive runs. A tenth mutation was added with the review fix below.
- Step 27 review fix — hidden-tab time loss: the driver passed the whole wall-clock gap to `advanceSimulation`, which credits at most `MAX_FOREGROUND_DELTA_MS` but consumes the entire delta. That bound is meant for one slow frame; a hidden tab stops the render loop altogether, so an absence arrived as a single delta and everything past its first second was consumed having never been simulated. Reproduced at sixty seconds: 380 gold when frames ran throughout against 100 — the starting balance — when the same minute arrived as one frame, with the timestamp advanced sixty seconds either way. Because that scenario involves no reload, offline income never saw the interval either. `src/core/simulation/catchUpSimulation.ts` now walks the gap in credited-size slices, which is exact rather than approximate because the sub-tick remainder is carried in authoritative state, and bounds the walk at `MAX_CATCH_UP_MS` (two hours, matching the offline-income horizon) at a measured worst case of roughly thirty milliseconds. Time past the bound is still consumed by `lastUpdateTimestampMs`. Eight new unit tests cover both the core walk and the driver; three mutations fail by name — the driver reverted to a single bounded advance, uncredited time dropped rather than consumed, and the walk left unbounded. - Step 27 review fix — per-frame waste: the driver re-derived its view model on every frame because `advanceSimulation` returns a new object even when no tick completed, which also meant `BootScene`'s identity check could never fire. It now re-derives only when `simulationTick` advanced — the exact condition, since nothing outside `advanceFixedStep` touches production state — while `replaceState` always re-derives, and the renderable guard moved behind the identity check it protects. Separately, the rendered-state read-back is now gated on `import.meta.env.DEV`: nothing in the game reads those attributes, and a shipped build was serializing the whole screen ten times a second. Playwright runs against the dev server, so browser tests are unaffected, and the production bundle no longer contains the dataset writes. Three more mutations fail by name: a driver that never memoizes, a driver that never re-derives, and a `replaceState` that reuses the snapshot. One hundred ninety-eight unit tests, twelve Chromium E2E tests, lint, strict production build, and `git diff --check` pass.

- Step 27 was validated by the user on 2026-08-29 through explicit authorization to proceed with Step 28.
- Step 28 implemented on 2026-08-29: the HUD is live. `createHudViewModel(state, balance)` derives the English `Gold` and `Income /s` captions and their values and rides on the same `MineViewModel` the mine views are bound from, so one snapshot drives the whole screen; `createMineViewModel` and `MineSimulationDriver` therefore take balance data. Income is the core's `effectiveProductionPerSecond`, already capped at the chain's slowest stage, so the figure is what the mine can deliver rather than what the shafts could dig. `HudView` builds its background, divider, and four text objects once and changes only through `applySnapshot`, and `BootScene` publishes `data-hud-view` on the existing 100 ms diagnostic cadence.
- Step 28 number formatting: `src/game/view-model/formatAmount.ts` is now the single formatter for every displayed amount, in the HUD and the mine views alike. It shows at most one decimal place and then no suffix below 1,000, `K`/`M`/`B`/`T`, and alphabetic suffixes counting `aa`, `ab`, ... `zz`, `aaa`, ... matching the game design document's `14.6aa` and `7.2ab`; past three letters — beyond 1e54000 — the serialized scientific form is shown instead of an unbounded run of letters. Two decisions are deliberate: digits are truncated rather than rounded, because a balance that reads higher than it is would promise an upgrade the player cannot afford, and a present-but-tiny amount reads `<0.1` rather than `0`. `GameNumber` gained normalized `mantissa`/`exponent` getters so the formatter reads magnitude directly; converting through `Number` would print the same thing for every value past 1e308.
- Step 28 automated evidence: two hundred seventeen unit tests and fourteen Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Twenty new unit tests cover the formatter (ordinary amounts, each named tier, the alphabetic run walked forty tiers deep without a repeat or a gap, magnitudes at 1e309/1e400/1e1000 and the scientific fallback past the run, truncation and the bound on how far it may overstate, one-decimal stability against floating-point scaling, the tiny-amount label, negative values, and monotonic labels across thirteen magnitudes) and the HUD model (captions, authoritative gold, an abbreviated 1.46e16 balance, income following extraction on a fresh mine, income following the elevator once four high-level shafts out-produce it, income rising when that stage is widened, the model matching the one carried on the mine snapshot, and no mutation of the state read). One browser test asserts the HUD's abbreviated gold and its income against the core's own rate calculation; a second boots the real driver one conversion cycle short of a delivery, runs two seconds of fake wall clock, and asserts the displayed gold equals the authoritative balance while the scene's display-object count is unchanged.
- Step 28 mutation verification: six mutations fail with named assertions — a HUD bound once at boot and never rebound (expected 220, received 100), a HUD never bound at all, a formatter that rounds instead of truncating, an alphabetic run starting one tier late, a formatter reading magnitude through `Number`, an income value taken from aggregate extraction instead of the bottleneck-capped rate, and a `HudView` that appends a new text object per rebind (display objects 159 against 140).
- Step 28 was validated by the user on 2026-08-29 through explicit authorization to proceed with Step 29.
- Step 28 review fixes: four review findings were corrected without changing behaviour. `TRUNCATION_TOLERANCE` in `formatAmount.ts` claimed a displayed amount can never read high, but the tolerance that keeps floating-point scaling from dropping a digit also lifts a value within `1e-9` of the next digit onto it, so `0.9999999999` reads `1`; the tolerance is now documented as the bound on that overstatement and a unit test pins both sides of it, making the claim checkable rather than asserted. `HudView` typed its text anchor as a bare `number` after the move out of `BootScene`, losing the old `'left' | 'right'` safety, and now uses a `HorizontalOrigin = 0 | 1` alias with named constants. `BootScene` published `data-hud-view` as `"null"` before the view existed, which would have surfaced in a browser test as a property access on `null` rather than a named diagnostic failure; the attribute is now written only once the view exists. `GameNumber`'s `mantissa`/`exponent` getters moved out of the middle of the arithmetic group to sit beside `serialize()`, and `exponent` gained its own doc.

- Step 29 implemented on 2026-08-29: the upgrade controls are live. Every unlocked mine shaft and both shared stages carry a button showing the next level's abbreviated price, drawn enabled only when the current balance covers it. `src/game/view-model/upgradeControl.ts` derives each control's caption, price, affordability, command target, and stable key, and every price comes from the same core cost function the purchase command charges — `calculateMineShaftUpgradeCost`, `calculateElevatorUpgradeCost`, `calculateWarehouseUpgradeCost` — so the figure shown and the figure deducted cannot drift. `createMineViewModel` therefore takes each floor's balance config and the spendable balance; a locked floor's control is `null` rather than a disabled button.
- Step 29 input and commands: `UpgradeControlView` is one reusable entity used by both the mine floors (`stacked` layout) and the shared stages (`inline`). Its background rectangle is its hit area, so the pressable region is exactly the drawn one and hiding it removes it from input — which is how locked floors have no reachable button. An unaffordable control still accepts a press and the core answers, because refusing in the view would substitute the renderer's guess for the core's decision and would leave a player who cannot pay with no feedback at all. `MineSimulationDriver.purchaseUpgrade(target)` advances to the current time first — the player spends the gold the mine has now, not what the last frame showed — dispatches to the matching core command, and returns `purchased`, `insufficient-funds`, or `unavailable`. A refusal leaves state and the memoized snapshot untouched, so the scene skips rebinding by identity.
- Step 29 feedback and persistence: the result appears on the pressed control for 1,200 ms — `Upgraded!` on green, `Need more gold` on red — expired by the pure `describeUpgradeFeedback` and timed on the Phaser scene clock rather than the cosmetic animation clock, so animation speed cannot change how long a message stays readable. `BootScene` rebinds and republishes diagnostics immediately on a press, since a purchase changes displayed values without any tick completing, and publishes `data-upgrade-controls` with each visible control's screen-space rectangle, converted through the camera that draws it. The driver gained an optional `onCommandApplied` hook, which `src/main.ts` uses to queue a debounced save: a purchase completes no tick, so a save that followed only ticks would lose it on the next reload.
- Step 29 automated evidence: two hundred thirty-two unit tests and eighteen Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Fifteen new unit tests cover control pricing against the core's own cost functions, an abbreviated price past the safe integer range, the affordability boundary at exactly the price, distinct keys and targets per control, one mine-shaft purchase deducting exactly the displayed price and leaving its neighbours alone, both shared stages bought through their own commands with widened capacity, a refusal changing nothing and reusing the same snapshot object, a locked floor reporting `unavailable`, a purchase charged against gold earned since the last rendered frame, the applied-command hook firing once and never on a refusal, and the feedback labels and their expiry, including a clock moved backwards. Three browser flows press real controls at published coordinates: an unaffordable press that spends nothing and reads `Need more gold` and leaves the price unchanged, one mine-shaft purchase with exactly one deduction, one level increase, an unchanged display-object count, and an updated button price, and the elevator and warehouse bought through their own commands without touching a shaft.
- Step 29 frame cost: the controls re-render on every frame because press feedback expires on the frame clock, so `UpgradeControlView` compares a text colour before writing it. `Text.setColor` repaints the caption's canvas and re-uploads its texture on every call, unlike `Text.setText`, which skips an unchanged value; writing it unconditionally repainted every visible caption sixty times a second to reproduce the pixels already on screen. A browser test counts repaints across idle frames and requires zero — restoring the unconditional write fails it with `a frame that changes nothing must repaint no text` at 176 repaints over 21 frames.
- Step 29 mutation verification: eight mutations fail with named assertions — affordability using strictly-greater instead of at-least, a purchase that skips advancing to the current time, feedback that never expires, a refused command reported as applied, the elevator control priced from the warehouse, a view that refuses an unaffordable press itself (`a refused press must say why`), every press routed to the mine shaft, floor control geometry that ignores the mine camera (`a completed purchase must confirm itself`), and a control bound once and never rebound (`the button price must follow the new level`).

- Step 30 implemented on 2026-08-30: floor unlock controls are live. Every locked floor now states the prerequisite shaft it waits on and what opening it costs, and opens in place when both are satisfied. `describeFloorUnlock(state, floorId, config)` in `src/core/progression/unlocks.ts` returns one locked floor's price, its requirement (prerequisite id, player-facing floor number, required level, and the level that shaft has now), `isRequirementMet`, `isAffordable`, and `canUnlock`, or `null` once the floor is open. `purchaseFloorUnlock` was refactored to read the same private `evaluateFloorUnlock` predicate, so the description a control renders and the command that charges gold cannot disagree; a unit test asserts that agreement — outcome, price, and named gate — across every combination of prerequisite level and balance.
- Step 30 generalization: the upgrade-control model became the purchase-control model, because an unlock is the same control to the player. `src/game/view-model/upgradeControl.ts` is now `purchaseControl.ts`; `UpgradeTarget`, `UpgradeOutcome`, `UpgradeControlViewModel`, `UpgradeFeedback`, and their factories are now `Purchase*`; `isAffordable` became `isEnabled`, because a control is now drawn enabled for two reasons rather than one; `UpgradeControlView` became `PurchaseControlView` with `isEnabledAppearance` in its read-back; `MineSimulationDriver.purchaseUpgrade` became `purchase`; and the canvas diagnostic became `data-purchase-controls`. `PurchaseTarget` gained `{ type: 'floor-unlock', floorId }` (key `floor-unlock:floor-2`), and `PurchaseOutcome` gained `unlocked` and `requirement-not-met`, labelled `Unlocked!` and `Level too low`.
- Step 30 presentation: `createFloorUnlockControlViewModel(availability)` sets the `Unlock` caption, the unlock price, and `isEnabled` from `canUnlock` alone, so gold never enables a button whose prerequisite is short. The requirement sits beside the button rather than on it — `formatUnlockRequirement` produces `Needs Floor 1 Lv 5`, drawn in `TEXT_WARNING` while unmet and `TEXT_MUTED` once satisfied — so a player who is only short of gold is not told to keep upgrading. `MineFloorView` holds two `PurchaseControlView` instances in one slot, of which exactly one is ever visible; Phaser skips invisible objects when hit-testing, so the two can never both take a press. `assertRenderableMineViewModel` now requires exactly one of the two controls per floor, and `createMineFloorViewModel` rejects an unlock description that disagrees with the floor's lock state.
- Step 30 commands and persistence: `MineSimulationDriver.purchase` routes a `floor-unlock` target to `purchaseFloorUnlock` and maps refusals through one `describeRefusal`, which names only `insufficient-funds` and `prerequisite-not-met`; every other core failure is a press that should not have been reachable and reads as `Unavailable` rather than as advice the player cannot use. A successful unlock fires the same `onCommandApplied` hook an upgrade does, so `src/main.ts` queues a save immediately — an unlock completes no simulation tick, and a save that followed only ticks would lose it. `BootScene` now expires its whole feedback map each frame instead of only the entries whose control is still live, because a successful unlock hides the control that was pressed and its result would otherwise stay in the map for the rest of the session.
- Step 30 automated evidence: two hundred forty-seven unit tests and nineteen Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Twenty-two new or rewritten unit tests cover the unlock description against the command it describes, a still-locked prerequisite reported as level zero, a met requirement separated from an affordable price, the unlock control priced from the core's own description, the enabled state across all four gate combinations, the requirement label on both sides of the gate, exactly one control and one key per floor, the control swapping to an upgrade once the floor opens, one unlock deducting exactly the displayed price and initializing the floor while its neighbours are untouched, a repeated unlock reported as unavailable without a second charge or a second applied-command call, both named refusals leaving state and the memoized snapshot untouched, and the two new feedback labels.
- Step 30 browser flow: one Playwright journey drives the whole step on a clock paused at the fixture's save timestamp. Floor 2 shows `Locked`, `Needs Floor 1 Lv 5`, and its price with the button disabled although the seeded balance already covers it; a premature press reads `Level too low` and leaves the floor closed; one floor-1 upgrade satisfies the gate, the refusal clears, and the button enables; the unlock press deducts about one whole price (production only adds gold, so a fall of that size is the deduction), and the floor opens in place — locked colour gone, `Locked` badge gone, miner working, unlock control replaced by the shaft upgrade — with `data-boot-scene-starts` still `1`, proving the scene did not restart. The opened floor reaches IndexedDB before the reload, and after the reload it is still open, still offers its shaft upgrade, and extracts material within ten simulated seconds.
- Step 30 browser-test finding: under a Playwright clock paused with `pauseAt`, the Phaser game loop does not step again after `create`, and a pointer event dispatched before it steps is never taken up — the first press of a run is simply lost. The spec grants one `runFor` once the scene exists, and every press afterwards advances the clock in slices until the control reports a result or disappears, rather than assuming a fixed settling time. A floor's pile is transient, so the production check samples every 250 simulated milliseconds rather than reading once and concluding the floor is idle.
- Step 30 mutation verification: seven mutations fail with named assertions — an unlock enabled by affordability alone (`level 4 with 5000 gold: expected true to be false`), a description drifting from the command by one level (four unrelated unlock tests break), locked floors given no unlock control (six assertions across the view-model and control tests), a prerequisite refusal reported as merely unavailable (`a premature unlock must say which gate refused it`), an unlock that skips the applied-command hook (`the open floor must reach the save before the reload`), a scene that does not rebind after a purchase (`one level bought`), and an unlock control bound once and never rebound (`a locked floor offers an unlock instead`).
- Step 30 was validated by the user on 2026-08-30 through explicit authorization to proceed with Step 31.
- Step 31 implemented on 2026-08-30: the mine scrolls under one thumb. A vertical drag or a wheel anywhere over the mine moves its camera through the 110 logical pixels its four floors overflow by, while the HUD and surface strip stay fixed. `src/game/view-model/mineScroll.ts` decides all of it from pointer coordinates and the mine region alone — travel clamped to `max(0, contentHeight - regionHeight)`, one pixel of content per pixel of thumb from the press anchor, a wheel accepted only over the mine — and every transition returns its input unchanged by identity when nothing moved, so a held finger costs no camera write. `BootScene` binds scene-wide `POINTER_DOWN`/`POINTER_MOVE`/`POINTER_UP`/`POINTER_UP_OUTSIDE`/`POINTER_WHEEL` handlers rather than a draggable object, because the mine is dragged from anywhere over it including its own buttons, and applies the result to the mine camera alone. Phaser hit-tests through that same camera and honours both its scroll and each object's camera filter, so the controls' pressable rectangles follow the scrolled content with no extra bookkeeping.
- Step 31 tap versus scroll: travel under `MINE_SCROLL_DRAG_THRESHOLD_PX` (6) scrolls nothing and suppresses nothing, because a thumb never lands perfectly still and a press that wobbles must both leave the screen where the player aimed and still buy what they aimed at; crossing the threshold scrolls the whole travel, including those six pixels, since that is below what the eye catches while losing one-to-one tracking is not. Every press is tracked, not only one that landed on the mine, because a gesture decides two separate things: whether the mine scrolls, which needs the press to have started over it, and whether the release is still a tap, which is about how far the pointer travelled wherever it began. `hasDragged` outlives the gesture that set it and is cleared only by the next pointer-down — Phaser reports a control's press while the pointer is still coming up — and `BootScene.#requestPurchase` returns early while it is set. A wheel never sets it: a notch of scroll followed by a click is two separate intentions.
- Step 31 touch targets: `MIN_TOUCH_TARGET_PX` (44) and `assertTouchTargetRegion` live in the pure layout module, and every `PurchaseControlView` asserts its own region at construction, so an undersized button throws on the frame it is built rather than surviving as an unattributable miss rate on a phone. Mine floor controls grew from 92×32 to 92×44, and the surface strip grew from 140 to 164 logical pixels so each stage panel can end in a 44-pixel control instead of the 20-pixel bar it had; the mine region moved to `0,236,360,404` and eight mine pixel probes in three existing browser specs moved down with it. `#game-viewport canvas` sets `touch-action: none`, because Phaser's non-passive touch listeners do call `preventDefault` but a browser that has already started panning cannot have the gesture taken back. `PublishedPurchaseControl` gained `isPressable`: a floor control scrolled out of the mine viewport is clipped away and hit-tested by no camera, so its published rectangle would otherwise invite a press that lands on whatever took its place.
- Step 31 automated evidence: two hundred seventy-three unit tests and twenty-six Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Twenty new unit tests cover the scroll range and its rejections, one-to-one dragging, clamping at both ends, the threshold in both directions, a pointer that wanders outside the mine mid-drag, a swipe that began on a fixed layer, a second finger that did not start the gesture, tap suppression surviving the release and clearing on the next press, suppression after a swipe that could not scroll, wheel clamping and region gating, and the read-back; six new layout tests cover region containment and the touch-target minimum.
- Step 31 browser flow: seven Playwright tests at a 390×844 phone viewport, on a clock pinned so no gold is produced and every observed change came from a gesture. A drag scrolls the mine to its clamped maximum and back to zero, with the HUD pixel unchanged, the bottom of the mine coming into view as a pixel change from panel to mine background, floor controls moving by exactly the scroll distance, and the shared stages not moving at all. A drag started on an affordable button scrolls the mine and leaves gold, levels, and even the control's own feedback untouched. A swipe from the surface strip that lifts on a floor's button buys nothing. A tap buys before scrolling, and after scrolling to the bottom a press buys from floor 4's control, which reported `isPressable: false` before the scroll and true after. A press that wobbles by less than the threshold still buys and scrolls nothing. The wheel is refused over the HUD and clamps at both ends over the mine. Every published control measures at least 44×44 and the canvas owns its touch gestures.
- Step 31 review finding: the first implementation tracked only presses that began over the mine, so a swipe starting on the surface strip and lifting on a floor's button still bought a level — an accidental purchase from a gesture, which is what the step forbids. Every press is now tracked, and whether it scrolls became a separate question from whether it stays a tap. A browser test drives that swipe.
- Step 31 test finding: the browser fixture routes `/src/main.ts` to its own module, which does not import `src/style.css` unless it says so, so a `touch-action` assertion read `auto` against a stylesheet that had never loaded. The fixture now imports the stylesheet, which also boots it closer to the real application.
- Step 31 mutation verification: nine mutations fail with named assertions — dropping the tap suppression (`a scroll must not spend gold`), publishing bounds that ignore the camera scroll (`a floor control moves with the content it is drawn on`, plus the reveal assertion), a zero drag threshold (`a wobbling tap must still buy one level` and two unit tests), a camera that never follows the scroll state (`the bottom of the mine must come into view`), a wheel that ignores the mine region (`a wheel over the HUD must not scroll the mine`), `isPressable` reduced to visibility (`the deepest floor starts below the mine viewport`), a 20-pixel shared-stage control (the boot-time touch-target assertion), removing `touch-action` (`the canvas must own its touch gestures`), and suppressing a tap only for gestures that began over the mine (`a swipe must not spend gold`).
- Step 31 was validated by the user through explicit authorization to proceed with Step 32.
- Step 32 implemented on 2026-08-30: an original clean-HD cartoon placeholder family now replaces the debug miner and material shapes and gives the HUD, elevator, warehouse, locked floors, queued material, and purchase controls their own matching visual symbols. The family contains nine semantic 128×128 RGBA PNGs generated through the repository's required asset skills and built-in image generation, then chroma-keyed and sliced deterministically. English labels, prices, progress, input regions, and feedback remain code-native.
- Step 32 asset governance: `public/assets/placeholder/art-direction-brief.md` locks the navy/steel-blue/teal/warm-gold visual system and native-scale constraints; `asset-manifest.json` records generation, roles, and the absence of third-party assets or external branding. Raw generation, prompt, processed transparent sheet, individual frames, GIF, and QC metadata are retained under `art-source/placeholder/`, outside the production public directory.
- Step 32 visual evidence: direct browser review passed at exact 360×640 scale and at a reduced 320×568 phone viewport. Miner, elevator, warehouse, gold, locked state, and upgrade state remain distinguishable, touch controls remain readable, and fresh boots report no browser warnings or errors. Backlogged gold/crates switch to a solid red silhouette while normal queues retain the illustrated artwork; the silhouette is a texture generated once from the source sprite at boot, because Phaser tints under WebGL only and the cue has to survive a Canvas fallback.
- Step 32 automated evidence: 277 unit tests and 26 Chromium E2E tests pass. Three new asset tests pin one runtime file per semantic texture, exact 128×128 RGBA PNG structure, generated provenance, and no third-party branding. Existing real-framebuffer probes were retargeted from debug blocks to generated gold silhouettes and still prove ordinary/empty/full/backlogged states. Lint, the strict production build, `git diff --check`, and raster alpha/size QA pass.
- Step 32A implemented on 2026-08-31 after user approval of `layout1.png`: the shaft narrowed to 48 px, floor slots expanded to 288×132, mine content became 572 px with 168 px travel, and pure semantic panel geometry now owns all approved positions. The first pack adds a cave floor background, separate empty gold container and gold pile, elevator shaft and cabin, and strict four-frame sheets for the walking miner, unloading attendant, and elevator cargo cat. The miner patrols right, flips, and returns left; the cabin follows authoritative elevator progress while character frames remain cosmetic.
- Step 32A asset evidence: all three accepted animation sheets have four valid frames with zero output-edge contact and zero paste clamp. Initial miner and unloader generations failed the feet-anchor threshold and were regenerated instead of relaxing QC. Prompts, raw sources, rejected passes, transparent sheets, frame exports, GIFs, pipeline metadata, and provenance are retained under `art-source/step-32a-asset-pack/` and `public/assets/step-32a/asset-manifest.json`.
- Step 32A automated evidence: 288 unit tests, 27 Chromium E2E tests, lint, and the strict production build pass. Browser probes derive from the semantic floor layout, validate both WebGL and Canvas backlog rendering, and cover the newly revealed floor-four control after camera settlement.
- Step 32A annotation revision on 2026-08-31: removed the visible per-floor extraction bar and duplicated `Floor N` title; miner position and facing now derive from authoritative extraction progress while sprite frames remain cosmetic. Its corridor reaches from the unloading cat to the gold pile before turning. Queued gold is rendered as coin icon plus abbreviated amount, the approved pile remains gold during backlog, is centred at x=232 under the timber support, and is raised clear of the floor seam. Open floors use a minimum thumb-safe 44×50 `Level N` control, and the cave ceiling/soil seam is cropped to half thickness from floor 2 downward while floor 1 and the surface keep the original depth. The revision passes 288 unit tests, 27 Chromium E2E tests, lint, and the production build and still awaits user validation.
- Step 32A second annotation pass: the offline reward now formats two useful decimals with a stable lowercase `k` tier (`287.533… → 287.53`, `1,213,120 → 1213.12k`) instead of exposing serialized decimal tails; a number-only badge restores floor identity without restoring the removed `Floor N` caption; queue coin and amount share one centred baseline; and a new layout1-referenced low irregular gold mound replaces the coarse first pile. Its 128×128 RGBA runtime output has valid alpha and strict QC reports zero empty frames, output-edge contacts, or paste clamps. The level control's visible chrome shrank from 44×50 to 30×34 (under half the prior area) while a transparent 44×50 hit region preserves touch safety; resolution-2 text keeps the tiny label sharp. The pass is covered by 290 unit and 27 Chromium E2E tests.
- Step 32A elevator annotation pass: removed the redundant numbered plaques from inside the shaft. The core now drives a physical route from the surface through every unlocked floor, loading only on arrival and continuing deeper while capacity remains, then returning when full or after the deepest stop. A full load makes a leg 75% slower than an empty load, ascent time scales with depth, and the cabin/cargo-cat sprites follow the authoritative route. `Collecting` and `Returning` replace the ambiguous transport status. Save version 1 remains compatible through a signed legacy cursor, with schema validation and a new returning-route regression. All 292 unit tests, 27 Chromium E2E tests, lint, production build, and direct browser inspection pass; Step 33 remains blocked pending user validation.
- Step 32A elevator alignment pass: the cabin now stops at the gold-container centre rather than the floor-slot centre, so its platform is horizontally level with the receiving cart. The existing 128 px cabin source is displayed at 46 px inside the 48 px shaft and the cargo cat at 32 px for a larger, sharper read. Number-only floor badges grow from 26×26/16 px text to 34×34/21 px text (about 30%) around the same centre; the compact `Level N` control is unchanged. Pure geometry and a new browser regression pin the stop and scaled objects, and direct browser inspection confirms no collisions. All 292 unit and 28 Chromium E2E tests pass; Step 33 remains blocked pending user validation.
- Step 32A floor-control sizing follow-up: the number-only floor badge is reduced to exactly 60% of the preceding 34×34 review size, producing 20.4×20.4 chrome and 12.6 px text around the same centre. The 30×34 visible `Level N` chrome shifts 5 px right while its 44×50 hit target stays fixed. Rendered diagnostics now expose both visual and hit bounds, and the browser regression pins the 12 px left inset and 30 px visual width. Direct canvas inspection, all 292 unit tests, all 28 Chromium E2E tests, lint, and the production build pass; Step 33 remains blocked pending user validation.
- Step 32A elevator/cart asset follow-up: generated and integrated a 256×256 cabin v2, a strict four-frame cargo-cat v2, and a 256×256 filled-cart state using the existing pack plus `layout1.png` as references. The shaft/cabin/cargo-cat display stack grows from 48/46/32 px to 64/62/50 px while the floor remains 288×132. Positive queue state swaps the receiving cart from empty to filled. Cabin position now remaps authoritative leg progress through smootherstep, producing zero visual velocity at each stop without changing production timing. The number-only badge is half the annotated 34 px size (17×17, 10.5 px text). All new assets have zero empty frames, output-edge contacts, and paste clamps; cargo body-scale CV is 0.0064 and anchor-Y standard deviation is 0.0251. Direct canvas inspection and sampled motion confirm the larger character, filled carts, exact stops, and slowdown; 294 unit tests, 28 Chromium E2E tests, lint, build, and diff checks pass. Step 33 remains blocked.
- Step 32A typography/character-scale follow-up: installed and self-hosted Fredoka 600/700, waits for both weights before Phaser starts, and applies SemiBold/Bold to every Phaser and DOM caption. Removed the duplicate `Gold` and `Income /s` HUD captions while preserving their icon-plus-value pairs. Miner and unloader display frames grow to 75 px so their approximately 59% occupied height matches the 50 px elevator cat's approximately 88% occupied height. Direct inspection at 434×934 confirms the new typeface, caption removal, and balanced cats; 296 unit tests, 28 Chromium E2E tests, lint, build, and diff checks pass. Step 33 remains blocked.
- Step 32A surface-tower follow-up: generated and integrated a compact 512×512 transparent elevator headhouse with a visible top gold hopper, segmented right-side discharge chute, and open cabin bay. The cabin route now ends at `(55, 118)` inside that bay rather than at the mine-camera boundary; a presentation-only fixed-layer twin fades across the seam while core timing, load behavior, and save schema version 1 remain unchanged. The headhouse replaces the legacy elevator card and receives its upgrade taps, eliminating the visual overlap. `formatAmount` now retains one decimal for whole abbreviated tiers (`2M → 2.0M`) everywhere. Asset strict QC reports zero empty frames, output-edge contacts, or paste clamps. Direct browser inspection, 296 unit tests, 29 Chromium E2E tests, lint, and build pass. Step 33 remains blocked pending validation.
- Step 32A floor-continuity follow-up: the approved far-right gold mound is now fixed 52×52 environmental art on every unlocked floor, independent of queue depletion, so it never hides, blinks, or changes scale. Queue state continues to drive the left receiving cart's empty/filled texture, amount label, and `materialPileSteps` diagnostic. Inter-floor slot gap changed from 8 px to zero; four floors now tile edge-to-edge inside 548 px of content with 144 px scroll travel. Direct canvas inspection, 296 unit tests, 29 Chromium E2E tests, lint, and build pass. Save/database schema version 1 is unchanged and Step 33 remains blocked.
- Step 32A warehouse/alignment follow-up: generated and integrated a 512×512 open warehouse depot plus a strict 2×2 supervisor-cat idle sheet. The legacy warehouse card is hidden, the building routes taps to the unchanged warehouse upgrade command, and the decorative supervisor adds no manager state. The asymmetric elevator headhouse's semantic bay centre is left of its full texture centre, so the surface cabin endpoint changes from `(55, 118)` to `(48, 118)`. Both generated assets pass strict QC with zero empty frames, output-edge contacts, or paste clamps; supervisor body-scale CV is 0.0087 and anchor-Y standard deviation is 0.0372. Direct canvas inspection, 298 unit tests, all 29 Chromium E2E tests, lint, build, and diff checks pass. Save/database schema version 1 is unchanged; Step 33 remains blocked.
- Step 32A straight-entry/layout follow-up: eliminated the remaining 12 px horizontal interpolation by making every cabin pose use the underground shaft centre `x=36`. The tower itself moves left so its open bay is centred on that axis, producing a straight vertical entry. Warehouse chrome shrinks from 164×158 to 140×140 and is flush with the right boundary; the supervisor shrinks from 64 to 56 px, moves with the depot, and is mirrored to face left. Regression diagnostics pin the shared axis, right-edge alignment, dimensions, and facing. Direct browser review, 298 unit tests, all 29 Chromium E2E tests, lint, and build pass. Save/database schema version 1 is unchanged; Step 33 remains blocked.
- Step 32A shared-stage level-control follow-up: generated elevator tower v2 with a steel-blue mounting bracket immediately right of the discharge tray, then added visible compact `Level N` upgrade badges at `(124,58,44,50)` for elevator and `(263,0,44,50)` for warehouse relative to the surface. Chrome remains 30×34 while each hit region is 44×50; both controls reuse the existing stage purchase, affordability, and feedback path. The warehouse badge sits above the roof and the elevator badge is right of and no lower than the tray. Strict asset QC, direct mobile-browser review, 299 unit tests, all 29 Chromium E2E tests, lint, build, and diff checks pass. Save/database schema version 1 is unchanged; Step 33 remains blocked.
- Step 32A surface-hauler follow-up: moved the elevator level region to `(106,53,44,50)`, so its existing 30×34 chrome hugs the discharge outlet and clears the tray bottom. Generated and integrated strict 2×2 sheets for an orange hard-hat worker cat and a four-phase vertical gold cascade. A pure `calculateSurfaceHaulerPose` loop keeps the cart empty under the chute when no shared stage holds material; otherwise it pours, switches to the filled-cart texture, eases toward the warehouse, unloads, and returns empty with the cat mirrored. The cart loop is presentation-only and leaves economy/save schema version 1 unchanged. Asset QC reports zero empty frames, output-edge contacts, or paste clamps; cat body-scale CV is 0.0088 and anchor-Y standard deviation is 0.0307. Direct browser inspection confirms the chute-to-cart stream and readable worker/cart composition. 304 unit tests, all 30 Chromium E2E tests, lint, build, and diff checks pass; Step 33 remains blocked.
- Step 32A surface landscape/cart-scale follow-up: `setTexture` restored each cart source's native dimensions, so swapping from the 128 px empty file to the 256 px filled file doubled the on-screen cart. `BootScene` now reapplies the invariant 46×46 display box after every swap and diagnostics/tests measure both states. The elevator badge rises 5 px to `(106,48,44,50)`. A new original blue-sky landscape with rounded clouds, distant teal mountains/pines, and green meadow is normalized to 720×328 and rendered at 360×164 behind all surface gameplay. Asset manifest/provenance and exact-size raster QA are updated. Direct browser review confirms fixed cart scale, raised badge, and readable foreground over the landscape. 304 unit tests, all 30 Chromium E2E tests, lint, build, and diff checks pass; save/database schema version 1 is unchanged and Step 33 remains blocked.
- Step 32A warehouse-hauler crew follow-up: the existing lead cat is joined by
  one pooled assistant every ten warehouse levels through level 100, so levels
  10, 20, and 100 show 2, 3, and 11 cats. Assistants reuse the generated sheet,
  vary frames, and occupy two mirrored staggered rows around the invariant-size
  cart. Pure unit coverage pins every threshold/cap and invalid input; browser
  coverage pins the level-20 count, distinct positions, and synchronized facing.
  All 307 unit tests and 31 Chromium E2E tests pass. Economy, throughput,
  save/database schema version 1, and Step 33 are unchanged.
- Step 32A independent-crew/lowercase-unit follow-up: every visible assistant
  now receives an evenly spaced offset in the 5.2-second surface route plus a
  shallow personal lane and independent sprite-frame timing. Idle assistants
  wait at separate points between chute and warehouse. Warehouse level-10 live
  diagnostics confirm the two cats occupy opposite route sides and facings
  instead of overlapping. All number surfaces now share lowercase named tiers
  `k/m/b/t/qa/qi/sx/sp/oc/no/dc`, then `aa` at `10^36`, `ab` at `10^39`, ...;
  offline rewards reuse the tier resolver with up to two decimals. Throughput,
  economy, save/database schema version 1, and Step 33 are unchanged. All 309
  unit tests and 31 Chromium E2E tests pass.
- Step 32A per-cat-cart/HUD-precision follow-up: every visible surface hauler
  now owns one pooled cart that follows the same independent route pose and
  retains the invariant 46×46 empty/filled display box. The HUD centre slot
  shows authoritative elevator-carried gold. The main shared formatter now
  retains two decimals (`3.40m`, `203.40`) while keeping lowercase tiers and
  truncation semantics. Economy, throughput, save document version 1,
  IndexedDB schema version 1, and Step 33 remain unchanged. Automated evidence:
  310 unit tests, 31 Chromium E2E tests, lint, and production build pass.
- Step 32A mine-floor miner crew follow-up: each unlocked floor now pools one
  base miner plus four assistants and reveals totals of 1/2/3/4/5 at shaft
  levels 1/50/100/150/200, capped at five above level 200. Assistants use
  independent progress-driven patrol phases, shallow lanes, facing, and frame
  offsets, and rendered diagnostics expose every active pose. The same pure
  threshold function applies to all floor instances. This remains cosmetic;
  extraction, throughput, economy, save document version 1, IndexedDB schema
  version 1, and Step 33 are unchanged. Automated evidence: 313 unit tests, 32
  Chromium E2E tests, lint, and production build pass.
- Step 32/32A was validated by the user on 2026-09-02 through explicit
  authorization to begin Step 33.
- Step 33 implemented on 2026-09-02: `tests/e2e/player-journey.spec.ts` runs a
  complete real-application journey twice in separate clean browser contexts.
  Each run advances a controlled wall clock through the deterministic economy
  policy, presses the actual published canvas controls, buys mine-shaft,
  elevator, and warehouse upgrades, opens floors 2 and 3, reaches a level-10
  milestone, persists and reloads the exact expected version-1 state, claims a
  one-hour offline reward, reloads again, and proves the same interval cannot be
  claimed twice. Both runs must produce identical expected pre-offline and
  post-claim documents with no console or page errors.
- Step 33 integration finding: at 361 simulated seconds, repeated fractional
  elevator pickups produced `11153.2583495261` transported against
  `11153.258349526` extracted. The mathematically impossible `1e-10` excess was
  arithmetic-history drift and made `createSaveDocument` reject a legitimate
  session. `advanceElevator` now clamps accumulated transport to its extracted
  upper bound. Seeded elevator fixtures now carry matching extraction totals,
  and a ten-minute progression regression proves every floor remains saveable.
- Step 33 automated evidence: 314 unit tests, 33 Chromium E2E tests, lint, the
  strict production build, and `git diff --check` pass. The focused player
  journey itself completes both clean-profile runs in approximately 52 seconds.
  Step 34 has not been touched.
- Step 34 implemented on 2026-09-02: lifecycle saves advance the driver to the
  event boundary before stamping the document, so an interval between the last
  rendered frame and `visibilitychange`/`pagehide` cannot be lost.
- Abrupt navigation exposed that browsers may tear down a document before its
  asynchronous IndexedDB transaction commits. A validated synchronous
  localStorage journal at `cat-mine-idle:lifecycle-save-v1` now protects only
  that boundary. The repository selects it only when it is a newer valid
  version-1 save and clears it after IndexedDB catches up.
- Step 34 controlled-clock browser coverage proves hidden/visible catch-up is
  byte-for-byte equal to uninterrupted foreground play, while a closed-page
  interval is settled at configured offline efficiency and cannot be claimed
  twice. Real abrupt navigation, reload, journal cleanup, and absence of console
  or page errors are covered.
- Step 34 automated evidence: 318 unit tests, 35 Chromium E2E tests, lint,
  strict production build, and `git diff --check` pass.
- Step 34 was validated by the user on 2026-09-03 through explicit
  authorization to proceed with Step 35.
- Step 35 implemented an optimized-build performance project and a ten-minute
  all-four-floor acceptance run in Google Chrome 151 using a Pixel 5 profile,
  Android 11 user agent, 393×727 viewport, DPR 2.75, and 4× CPU throttling.
  Normal production builds statically remove the benchmark-only object, floor,
  and scroll read-backs.
- A first Step 35 implementation published the scene-graph size once from
  `create` and read that same static attribute back after ten minutes,
  reporting "258, constant" as if it were a trend. The metric could not have
  detected growth. Fixed by republishing live object and unlocked-floor counts
  twice a second behind the profiling flag, sampling both with every heap
  sample, and asserting the sampled minimum equals the maximum.
- Step 35 automated evidence: 72,188 sampled frames measured 8.33 ms mean,
  9.2 ms p95, 9.3 ms p99, 16.0 ms maximum, and zero frames above 33.34 ms. The
  host presented at 120 Hz, so the raw 120.01 FPS figure is presentation
  cadence; the budget result is roughly two times headroom against the 16.67 ms
  60 FPS target. Post-GC live heap changed by 155,360 bytes over ten minutes
  with a -502 bytes/s post-warm-up slope. Phaser objects held at 258 across all
  twenty samples, unlocked floors at 4 at boot and at end, DOM nodes at 176,
  listeners stabilized at 160, and scroll response measured 50.1 ms p95 /
  52.5 ms maximum.
- Step 35 asset/startup evidence: boot completed in 819 ms; the optimized output
  measured 3,887,708 bytes total, 2,200,266 image bytes, 95,720 font bytes, and
  2,343,440 transferred resource bytes. The main JavaScript chunk is 1,557,900
  bytes raw (about 414 kB gzip), retained as a documented future startup budget
  concern because the measured startup and frame budgets pass.
- No physical Android/ADB target was available. The passing result is a
  repeatable Pixel 5 emulation benchmark in desktop Chrome and must not be
  represented as physical-device evidence. Existing repeated visual objects
  are pooled and the sampled object/heap measurements found no runtime
  bottleneck that justified a speculative rewrite. The remaining per-frame
  allocation is `catchUpSimulation` returning a new immutable state each frame,
  kept deliberately because the core's determinism rests on it.
- Step 35 regression evidence: 318 unit tests, 35 Chromium E2E tests, lint, the
  ordinary production build with profiling hooks absent, and `git diff
  --check` pass. Save document and IndexedDB schema versions remain 1.

- Step 35 was validated by the user on 2026-09-03 through explicit
  authorization to proceed with Step 36. The physical mid-range Android Chrome
  pass remains an open caveat rather than a blocking gate.
- Step 36 implemented on 2026-09-03: `vite.config.ts` declares the `/`
  deployment base path the runtime's absolute `/assets/...` texture requests
  depend on, and `playwright.production.config.ts` plus
  `tests/production/production-smoke.spec.ts` build `dist/`, serve it through
  `vite preview` at `127.0.0.1:4175`, and verify the served bundle instead of
  the development server.
- Step 36 coverage: every runtime texture path and both self-hosted Fredoka
  weights load successfully with no failed request and no 4xx/5xx response; a
  controlled 40-second session flushed at a `visibilitychange` boundary equals
  the document derived in the test process, a reload at the same instant
  re-settles that identical document, and a further 20 seconds continues from
  the deserialized saved state; corrupt and unsupported payloads each recover
  into a playable fresh game with a visible notice and no uncaught error; a
  browser whose `indexedDB.open` throws still boots, reports the failure, and
  keeps rendering; and canvas plus all four logical regions stay inside narrow
  phone, tall phone, tablet portrait, and desktop viewports.
- Step 36 also proves the artefact under test is the shipped one: every document
  entry resolves under `/assets/`, nothing is served from `/src/`, and the
  dev-only rendered-state read-backs and opt-in profiler attributes are absent.
  Because those diagnostics are stripped, actual rendering is proven by a pixel
  probe of the canvas backing store.
- Step 36 finding: Steps 21 and 22 required a visible diagnostic and a recorded
  save-recovery warning, and the core produced both, but `src/main.ts` never
  passed `loadActiveGame`'s `onWarning` or the save coordinator's
  `onDiagnostic`. A player whose local save was rejected silently restarted with
  no explanation, and every unit test stayed green because the capability itself
  was correct. Fixed with `src/ui/SaveDiagnosticBanner.ts`, one non-blocking
  dismissible notice shared by both callbacks and de-duplicated by code.
  Removing the wiring fails exactly the three new error-handling tests.
- Step 36 automated evidence: 318 unit tests, 35 Chromium E2E tests, all nine
  production smoke tests, lint, the strict production build, and
  `git diff --check` pass. `npm run verify` runs lint, unit, E2E, build, and the
  production smoke suite in the order Step 36 specifies. Save document and
  IndexedDB schema versions remain 1. Step 37 has not been touched.

## Recent Changes

- Implemented server-milestone Step 19 (client remote repository) on
  2026-09-13, on the user's explicit instruction — §9's upload cadence and
  §7's `409` half. See the dedicated Step 19 paragraph above for the full
  account. New: `src/persistence/ReplicatingActiveSaveRepository.ts`,
  `src/persistence/cloudSaveReplica.ts`,
  `src/platform/web/cloudSaveUpload.ts`, a best-effort `onForceSave` on
  `bindSaveLifecycle`, `onServerRevision` on `reconcileCloudSaveAtBoot`, and
  the `arm`/forced-trigger wiring in `src/main.ts`. `src/core` is now
  lint-banned from `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource` with an
  `architecture.test.ts` probe. All verified: lint, 570 unit tests, 51
  Chromium E2E (both with the configured stack and with `.env.local`
  removed), build, secret scan, 10 production smoke. Step 20 must not begin
  until the user validates Step 19's test.
- A follow-up pass on the same 2026-09-13 review found one LOW residual in
  the Step 17 reload fix, three consistency notes, and confirmed one
  optional hardening was correctly shaped — see the dedicated paragraph
  below and `architecture.md`'s Step 14 review entries for full detail. A
  third new migration (`20260913090200_recovery_code_rpc_grants.sql`)
  revokes `execute` on both recovery-code RPCs from `public`/`anon`/`authenticated`
  and grants it to `service_role` only — belt-and-braces over RLS, which
  already made them inert for the client roles. All re-verified: `npm run
  verify:server` (98 Deno unit tests, 70 integration tests, 3 server-e2e)
  and the full client gate (506 unit tests, 51 E2E, build, secret scan, 10
  production smoke) both re-pass end to end from a clean cycle.
- A 2026-09-13 follow-up review of Step 14 found and fixed five more issues,
  plus a HIGH-severity Step 17 reload race the same review surfaced while
  re-reading `cloudSaveReconcile.ts` — see the dedicated paragraphs below
  and `architecture.md`'s Step 14 review entries for full detail. A second
  new migration (`20260913090100_recovery_code_revert_rpc.sql`) adds
  `revert_recovery_code_redemption`. All re-verified, including the
  integration suite passing five consecutive runs back to back with no
  stack restart between them (the exact scenario the new finding named);
  `npm run verify:server` (98 Deno unit tests, 69 integration tests, 3
  server-e2e) and the full client gate (502 unit tests, 51 E2E, build,
  secret scan, 10 production smoke) both re-pass end to end from a clean
  cycle.
- A 2026-09-12 review of Step 14 found and fixed five issues (one HIGH — a
  failed session mint after a successful redemption permanently burned the
  code) — see the dedicated paragraph below and `architecture.md`'s Step 14
  review entry for all five, plus a new migration
  (`20260913090000_recovery_code_rotation_rpc.sql`) adding the
  `rotate_recovery_code` Postgres function. All five mutation-proven live;
  `npm run verify:server` (94 Deno unit tests, 63 integration tests, 3
  server-e2e) and the full client gate (499 unit tests, 51 E2E, build,
  secret scan, 10 production smoke) both re-pass end to end from a clean
  cycle.
- Implemented server-milestone Step 14 (recovery code) on 2026-09-12,
  proceeding straight from Step 13 on the user's explicit instruction. New
  `supabase/functions/recovery-code` Edge Function (`POST /v1/generate`,
  `POST /v1/redeem`) on the unchanged Step 3/5 `recovery_codes` schema:
  16-random-byte (128-bit) codes, hex-grouped for display, canonicalized
  and HMAC-SHA-256-hashed under `RECOVERY_CODE_PEPPER` (relocated in
  `.env.example` to the `supabase/functions/.env` section it is actually
  read from). Both rotation and redemption are compare-and-swap from the
  start — applying the Step 16 review's concurrency lesson proactively
  rather than shipping a read-then-write again — mutation-proven live (2 of
  3 runs let a double redemption through when temporarily reverted, 5 of 5
  clean restored). Minting a session for a redeemed code's resolved
  `user_id` needed a variant of `telegram-sign-in`'s
  `generateLink`/`verifyOtp` pattern: since `generateLink` finds-or-creates
  by *email*, a pure anonymous guest (no email at all) needs a deterministic
  placeholder assigned first, or the call would silently create a second,
  wrong account — confirmed live end to end for exactly that case, same
  `auth.users` id restored. Hashing was deliberately kept out of the pure
  handler (only the real service-role collaborators touch
  `RECOVERY_CODE_PEPPER`) so the unit-test harness's zero-permission-flag
  rule holds without `--allow-env`. Rate limiting ships as an explicit,
  documented interim in-memory limiter — Step 25 owns the persistent,
  cross-endpoint version. `redeemRecoveryCode` on the client triggers the
  same `triggerCloudSaveReconcile()` every other sign-in path already runs,
  so "reuse the Step 13 collision flow" needed no new merge logic at all.
  `npm run verify:server` (89 Deno unit tests, 63 integration tests, 3
  server-e2e) and the full client gate (496 unit tests, 51 E2E, build,
  secret scan, 10 production smoke) both pass end to end from a clean
  cycle.

- Closed a test-coverage gap in the Step 16 Content-Length pre-check on
  2026-09-12, found by user review: the fix itself (a `Content-Length`
  check ahead of `request.text()`) was correct, but nothing distinguished
  "refused before buffering" from "refused after buffering" — the only
  existing 413 unit test builds its request as `new Request(url, {method,
  body: string})`, which never populates `Content-Length` at all (verified:
  it reads `null`), so that test exercises only the post-read check; the 52
  integration tests pass a real `fetch()`, which does set the header, so
  they exercise the pre-check only incidentally, without ever pinning that
  it fires *before* the read. Deleting the four-line pre-check left all 68
  unit and 52 integration tests green — a real, silent coverage hole.
  Closed with a unit test that sets `content-length: '70000'` explicitly on
  a real 2-byte body (Deno's `Request`, unlike a browser's `fetch`, keeps a
  manually-set header rather than recomputing it) — only the pre-check can
  answer `413` to that request, since the actual body is nowhere near the
  cap. Mutation-proven: disabling the pre-check's condition made the new
  test fail (`400`, not `413`) with the fix in place elsewhere unchanged;
  restored, and the full suite (69 Deno unit tests, 52 integration tests, 3
  server-e2e) re-passes.

- Fixed a real flake in `npm run test:server-integration` on 2026-09-12,
  found by user review: `vitest.server-integration.config.ts` set no
  `testTimeout`, so Vitest's own 5 s default governed every test in the
  suite, while every test's own `fetch()` budgets `AbortSignal.timeout(20_000)`
  — a 20 s intent that was never reachable, since Vitest killed the test at
  5 s first, 4× tighter than the code's own declared budget. Confirmed
  load-dependent rather than a cold-boot problem: a freshly reset stack ran
  clean repeatedly (10/10 across parallel and serial loops, one cold request
  measured at 0.13 s), and it only failed once the local stack had
  accumulated state across many prior suite runs without a reset in between
  (306 `auth.users` rows, 168 `saves` rows at the time it was caught) —
  `verify:server` resets the database before this suite runs, so CI is
  insulated, but a developer looping `test:server-integration` on its own is
  not, and `signInAnonymously()`'s 30/hour-per-IP rate limit compounds it
  further the more such loops accumulate. Predates this session's fixes —
  the concurrency tests below didn't cause it — though they do add two more
  simultaneous requests to a single-worker edge runtime. Fixed with
  `testTimeout: 30_000`, giving headroom above the 20 s per-request budget
  rather than merely matching it. `npm run verify:server` (68 Deno unit
  tests, 52 integration tests, 3 server-e2e) re-passes from a clean cycle.

- Fixed a **critical** concurrency bug in Step 16 on 2026-09-12, found by
  user review: `writeSaveRowViaServiceRole`'s `upsert` made the
  read-check-write in `PUT /v1/save` three non-atomic steps, so two
  overlapping uploads sharing the same `baseRevision` could both pass the
  §5 conflict check and both write, one silently discarding the other and
  breaking the "one monotonic revision" guarantee — reproduced live (seed
  at revision 1, two concurrent `baseRevision: 1` uploads, both answered
  `200 {revision: 2}` where the second should have gotten `409`). Not yet
  player-reachable (Step 19's client upload cadence is unbuilt), but the
  endpoint was already live. Fixed with a compare-and-swap: a first write is
  a plain `insert` (a racing insert fails the `user_id` primary key,
  `23505`, rather than silently winning too); a subsequent write is an
  atomic `update ... where user_id = ? and revision = ?`, with `.select()`'s
  row count telling the caller whether it applied. `handleSaveUpload` turns
  a lost race into the same `409` a stale `baseRevision` gets. Two new live
  integration tests fire genuinely concurrent uploads and assert exactly one
  `200`/one `409` with the revision advancing exactly once. The same review
  found and fixed a medium issue (the 64 KB cap's "refuses cheaply" claim
  was false until a `Content-Length` pre-check was added ahead of the
  body read) and three minor ones (the downloaded cloud document was never
  migrated before use; the boot reconcile bypassed the lifecycle-safe
  repository wrapper, risking a silent revert from a mid-reconcile debounced
  flush; the CORS allow-list's test-origin comment didn't say to remove
  them later). `npm run verify:server` (68 Deno unit tests, 52 integration
  tests, 3 server-e2e) and the full client gate (479 unit tests, 51 E2E,
  build, secret scan, 10 production smoke) both re-pass from a clean cycle.

- Implemented server-milestone Steps 15, 16, 17, and 13 on 2026-09-12, in that
  order, in one session: the user chose to pull cloud save (Steps 15–17)
  forward rather than build Step 13's guest-linking collision against
  test-seeded data, since Step 13's own instructions describe resolving a
  collision against "an account that already has a cloud save" and no cloud
  save endpoint existed yet at that point in the plan. Step 15 found the
  `saves` table and its RLS already complete from the Step 5 migration and
  added the required evidence (`tests/server-integration/saves-rls.integration.test.ts`,
  10 assertions, plus a new `serviceRoleFixture.ts` that mints a service-role
  client at test run time rather than as a tracked-file literal). Step 16
  added `PUT /v1/save` to `supabase/functions/save-sync/index.ts` — real
  server-side validation via the shared core bundle, the `revision`
  concurrency check, and the one-generation rollback shift — with 18 new unit
  tests and a 9-test live integration suite; `save-sync` gained the
  service-role exception `tests/unit/server-stack.test.ts` had already
  anticipated by name. Step 17 added `GET /v1/save` plus
  `src/platform/web/cloudSaveReconcile.ts`'s boot-time reconcile, deliberately
  narrower than Step 18's own dominance rule — it only ever acts silently
  when one side has no progress at all (the new
  `hasAnyProgress`/`reconcileGuestUpgrade` in
  `src/persistence/guestUpgradeReconciliation.ts`), leaving a genuine fork
  completely untouched for Step 18 to resolve later. Wiring this into
  `main.ts` surfaced and fixed a real regression: `production-smoke.spec.ts`'s
  "no request fails" assertion tripped on the reconcile's own background
  fetch, both from a page-teardown race and from the fetch's origin not yet
  being CORS-allow-listed — fixed by adding this repository's own Playwright
  preview origins (`4173`/`4175`/`4176`) to `_shared/http.ts` and excluding
  that one documented, expected-to-be-cancelled request from the test.
  Step 13 itself needed almost no new merge logic — Steps 10/12 already
  preserve identity through linking, and Step 17's reconcile already covers
  the no-progress and no-conflict cases — only a way to detect the
  `identity_already_exists` collision (`detectGoogleIdentityCollision`, via
  the SDK's own memoized `client.auth.initialize()`) and resolve it
  (`beginGoogleAccountSwitch`, a fresh `signInWithOAuth` rather than
  `linkIdentity`, since GoTrue never reveals which account a colliding
  identity belongs to). A new live integration suite,
  `tests/server-integration/guest-upgrade-collision.integration.test.ts` (5
  tests), composes the real Step 16/17 endpoints with the real
  `reconcileGuestUpgrade` to prove all three of Step 13's required flows
  end to end. A real live Google round trip through the collision itself —
  needing the same guided `chrome-devtools` MCP verification Step 10 already
  required — was deliberately not attempted this session and remains for
  later, the same way Steps 11/12's own external prerequisites were flagged
  rather than blocking. `npm run verify:server` (67 Deno unit tests, 50
  integration tests, 3 server-e2e tests) and the full client gate (479 unit
  tests, 51 E2E, build, secret scan, 10 production smoke) both pass end to
  end from a clean cycle. All four steps await user validation together;
  Step 14 must not begin before that.

- Fixed a **critical** vulnerability in server-milestone Step 12 on
  2026-09-12, found by user review: `telegram-sign-in` maps a Telegram user
  to `auth.users.email = telegram-<id>@telegram.invalid` and relies on
  `admin.generateLink` to find-or-create that row, but
  `[auth.email] enable_signup = true` (with `enable_confirmations = false`)
  let anyone `POST /auth/v1/signup` with that exact, guessable-from-a-public-
  Telegram-id email and a password of their own choosing *before* the real
  user signed in — reproduced live end to end by the reviewer and
  independently reconfirmed (attacker signup → 200; real Telegram sign-in
  for that id → the identical `auth.users` id; attacker password login
  afterward → still that id). Fixed with `enable_signup = false`; nothing in
  this codebase uses `signUp`/`signInWithPassword`, and `admin.generateLink`/
  `verifyOtp` are unaffected (confirmed live). Three smaller issues fixed
  alongside it: `scan-bundle-secrets.mjs` still missed
  `supabase/functions/.env` (the most sensitive of the three env files —
  the Telegram HMAC key); `MintSessionResult`'s unread `reason` field was
  removed; `verifyTelegramInitData`'s freshness check gained `Math.abs` for
  future-dated payloads. A static-source regression test needed its own fix
  first (an initial lazy regex crossed into an unrelated section's
  same-named, already-`false` flag and passed vacuously against the
  mutation) — caught by mutation-testing the test itself. One reviewer
  suggestion (405 over 400 for a wrong method) was deliberately not
  applied, to preserve `save-sync/index.ts`'s own documented vocabulary
  choice. All mutation-proven; `npm run verify:server` (49 Deno, 21
  integration) and the client gate (442 unit tests) both re-pass from a
  clean cycle.

- Implemented server-milestone Step 12 on 2026-09-11: Telegram sign-in.
  `supabase/functions/telegram-sign-in/index.ts` verifies `initData` against
  `TELEGRAM_BOT_TOKEN` using Telegram's documented HMAC-SHA256 algorithm
  (entirely on `crypto.subtle`) and mints a session via
  `admin.generateLink({type:'magiclink', email: telegram-<id>@telegram.invalid})`
  → client `auth.verifyOtp({token_hash, type:'email'})` — no schema change,
  the deterministic placeholder email is enough. `src/platform/telegram/telegramSignIn.ts`
  reads `window.Telegram.WebApp.initData` (never `initDataUnsafe`), resolving
  `null` for every player today since no Mini App host exists yet (finding
  F1); `src/main.ts` uses it *instead of* the guest bootstrap when non-null —
  "replaces the guest path entirely." First function called directly by
  `fetch()` from `src/`, triggering finding F11 (a shared CORS policy added
  to `_shared/http.ts`, recorded in `server-save-sync-protocol.md` §14);
  proving it live found finding F12 — the local Kong gateway overwrites
  every function's `Access-Control-Allow-Origin` with `*` regardless.
  Unlike Steps 10–11, needed no real external account: `initData`
  verification is self-contained and never contacts Telegram, so 48 Deno
  unit tests plus 7 new integration tests (including a real working
  `verifyOtp()` session) against the live local stack fully prove the
  step's test with only hand-signed fixture vectors. `npm run verify:server`
  and the full client gate (438 unit tests, 51 E2E, build, secret scan, 10
  production smoke) both pass. Awaiting user validation before Step 13.

- Cut server-milestone Step 11 (Apple sign-in) on 2026-09-11. Unlike Google,
  Apple's web Sign in has no local-development path: it requires a paid
  Apple Developer Program membership, a Services ID, a verified real domain,
  and a deployed HTTPS return URL, and accepts no `localhost`/`127.0.0.1`
  redirect at all. Asked to choose between acquiring those, building to spec
  with verification deferred, or cutting the step, the user chose to cut it
  — the exact contingency `server-threat-model.md` finding F7 already
  recorded. No code, config, or test was written; `server-milestone-plan.md`,
  `server-threat-model.md`, this file, and `progress.md` are all updated in
  the same change (its Recorded-decisions table, Definition of Done, status
  table, §7.1 budget, and F7's own entry). Identity in this milestone is now
  anonymous guest, Google, and Telegram. Work proceeds to Step 12 (Telegram
  sign-in) in the same session on the user's explicit instruction.

- Implemented server-milestone Step 10 on 2026-09-10: Google sign-in.
  `supabase/config.toml` gained `enable_manual_linking = true` and
  `[auth.external.google]` (`env(GOOGLE_CLIENT_ID)`/`env(GOOGLE_CLIENT_SECRET)`).
  `src/platform/web/googleSignIn.ts`'s `beginGoogleSignIn` links Google to an
  existing session (keeping the same `auth.users` id) or signs in fresh when
  none exists; `signOutOfSession` wraps `signOut()`. Both never throw, mirror
  `guestSession.ts`'s pattern, and surface Google's "already linked to
  another user" as a typed error rather than attempting Step 13's collision
  resolution. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` live in a new,
  separate git-ignored project-root `.env` file — the Supabase CLI's
  `env(...)` substitution only auto-loads that exact filename, never
  `.env.local` — documented in `.env.example`/`README.md`. No production UI
  exists yet (the fixed HUD covers the canvas edge-to-edge); a `DEV`-only
  `window.catMineIdleAccount` hook exposes the flow for now. `npm run verify`
  passes end to end (414 unit tests including the new 11-test
  `google-sign-in.test.ts`, 51 E2E, build, secret scan, 10 production smoke).
  This step's own live-Google proof — no CI runner can drive a real human
  through Google's consent screen — was a guided manual verification with
  the user via the `chrome-devtools` MCP tools, and it passed: linking
  preserved the same `user.id` and `profiles` row (`isAnonymous` flipping to
  `false`, one `google` identity), and a sign-out followed by a fresh
  `beginGoogleSignIn()` (the `signInWithOAuth` branch, no consent screen
  reappearing) returned the identical account.

- Implemented server-milestone Step 9 on 2026-09-10: profiles and row-level
  security. `supabase/migrations/20260910090000_profiles_signup_trigger.sql`
  adds `public.handle_new_user()`/`on_auth_user_created` so a `profiles` row
  is always created by a sign-up trigger, never the client — the one gap the
  Step 5 migration's table and own-row policies had left open.
  `supabase/seed.sql`'s fixture guest now gets its profile from the trigger,
  with `display_name` set by an `update` afterward rather than a colliding
  manual insert. `memory-bank/architecture.md` and `memory-bank/techContext.md`
  gained the identical trigger DDL, confirmed byte-identical by direct diff.
  `tests/server-integration/profiles-rls.integration.test.ts` signs in two
  real anonymous identities through live Supabase Auth and proves, against the
  live PostgREST endpoint, that the trigger alone created each profile row and
  that user A cannot select, insert into, update, or delete user B's row for
  any of select/insert/update/delete — mutation-verified by dropping the
  trigger from the live database and watching five of the seven new tests
  fail by name, then reset to green. `npm run verify:server` passes end to
  end from a clean `supabase stop`; 401 client unit tests, lint, and the
  strict build were re-run directly and are unaffected.

- Added the post-milestone bottom-navigation shell on 2026-09-09 from the
  user-supplied reference. `BottomNavigationView` renders five code-native,
  icon-only controls — Rewards, Shop, raised Boost, Managers, and Map — in a
  compact 58 px region below the mine. The five illustrations were refined into
  a cohesive treasure chest, storefront, bolt, cat-manager badge, and folded
  map using the existing gold, white, navy, and teal palette. Standard buttons
  are 48×44 and Boost is 62×50, so every hit box remains at least 44×44 while
  the complete visible button chrome and icon render at 60% of their authored
  size while their invisible hit regions stay unchanged. Presses give immediate
  bounce feedback;
  activation publishes development diagnostics only and deliberately opens no
  screen or gameplay function. The mine camera is clipped to `0,216,360,366`,
  while the fixed region is `0,582,360,58`. The complete client gate passes: lint, 401 unit tests, all 43
  Chromium E2E tests, strict production build, secret scan, and all 10
  production-bundle smoke tests. Save/IndexedDB/server schemas and authoritative
  gameplay state are unchanged.

- Generated **Aureon** (`surfaceElevatorTower`, catalog role
  `surface-elevator-tower`, tier `UR`) on 2026-09-08 from the user-supplied
  Gemini tower reference. Aureon preserves the front-facing open headhouse,
  symmetrical navy-steel pillars, dominant polished-gold armor, suspended
  gold-filled hopper, wooden floor, sun/moon ornament, attached purple
  crystals, and right-side tray/badge bracket. The generated cleanup removes
  detached bottom glow/sparkle artifacts. Its 512×512 transparent candidate,
  128×128 native-scale preview, raw/reference files, prompt, QC metadata, and
  provenance live under
  `art-source/cat-role-catalog/surface-elevator-tower/ur/aureon/`. Strict QC
  passes with zero empty, source/output edge-touch, or paste-clamped frames.
  Aureon is not copied into `public/assets`; runtime, gameplay, saves, and
  schemas are unchanged.

- Generated **Elon** (`elevatorCargoCat`, catalog role `elevator-cargo-cat`,
  tier `SSR`) on 2026-09-08 as the third named SSR elevator cargo steward.
  Elon preserves the user's silver-white tabby identity, icy luminous eyes,
  long striped tail, moon-phase collar, and celestial cargo cube; royal-violet
  cloth and an amethyst neck gem carry SSR. The four-frame idle and complete
  source/QC/provenance package live under
  `art-source/cat-role-catalog/elevator-cargo-cat/ssr/elon/`. Strict QC passes
  with zero empty, source/output edge-touch, or paste-clamped frames, body-scale
  CV `0.00239`, and anchor-Y deviation `0.01131`. Elon remains an unintegrated
  candidate; runtime, gameplay, saves, and schemas are unchanged.

- Generated **Win** (`elevatorCargoCat`, catalog role `elevator-cargo-cat`,
  tier `SSR`) on 2026-09-08 as the second named SSR elevator cargo steward.
  Win preserves the user's golden-orange tabby identity, pale luminous eyes,
  cloud collar, lightning trim, long striped tail, and ornate locked cargo
  ledger; royal-violet cloth and an amethyst neck gem carry SSR. The four-frame
  idle and complete source/QC/provenance package live under
  `art-source/cat-role-catalog/elevator-cargo-cat/ssr/win/`. Strict QC passes
  with zero empty, source/output edge-touch, or paste-clamped frames, body-scale
  CV `0.01761`, and anchor-Y deviation `0.01618`. Win remains an unintegrated
  candidate; runtime, gameplay, saves, and schemas are unchanged.

- Generated **Mofy** (`elevatorCargoCat`, catalog role
  `elevator-cargo-cat`, tier `SSR`) on 2026-09-08. Mofy preserves the user's
  calico face and body markings, mint-green eyes, long tail, leaf-shaped cloak,
  and carved wooden flower ledger; royal-violet cloth and an amethyst neck gem
  carry SSR. The four-frame idle and complete source/QC/provenance package live
  under `art-source/cat-role-catalog/elevator-cargo-cat/ssr/mofy/`. Strict QC
  passes with zero empty, source/output edge-touch, or paste-clamped frames,
  body-scale CV `0.01500`, and anchor-Y deviation `0.00727`. A 50×50 logical
  pixel shaft preview confirms the compact cabin read. Mofy remains an
  unintegrated candidate; runtime, gameplay, saves, and schemas are unchanged.

- Generated **Nautilus** (`warehouseManager`, catalog role `warehouse-manager`,
  tier `SSR`) on 2026-09-08 as the first SSR warehouse supervisor. Nautilus
  preserves the user's charcoal-black cat, glowing aqua eyes, long thin tail,
  wave-pattern ceremonial cloak, and golden shell-shaped inventory ledger;
  royal-violet/deep-amethyst cloth and an amethyst neck gem carry SSR. The
  four-frame idle and complete source/QC/provenance package live under
  `art-source/cat-role-catalog/warehouse-manager/ssr/nautilus/`.
  Largest-component cleanup removed a detached motion mark. Strict QC passes
  with zero empty, edge-touch, or paste-clamped frames, body-scale CV `0.01471`,
  and anchor-Y deviation `0.00081`. Nautilus remains an unintegrated candidate;
  runtime, gameplay, saves, and schemas are unchanged.

- Generated **Gauge** (`warehouseManager`, catalog role `warehouse-manager`,
  tier `SR`) on 2026-09-08 as the third named SR warehouse supervisor. Gauge
  preserves the user's orange tabby identity, striped tail, utility-pocket
  field coat, steel shoulder guard, and gear-emblem inventory clipboard;
  sapphire-blue scarf and cyan highlights carry SR. The four-frame idle and
  complete source/QC/provenance package live under
  `art-source/cat-role-catalog/warehouse-manager/sr/gauge/`. Largest-component
  cleanup removed detached motion marks. Strict QC passes with zero empty,
  edge-touch, or paste-clamped frames, body-scale CV `0.00492`, and anchor-Y
  deviation `0.02311`. Gauge remains an unintegrated candidate; runtime,
  gameplay, saves, and schemas are unchanged.

- Generated **Baron** (`warehouseManager`, catalog role `warehouse-manager`,
  tier `SR`) on 2026-09-08 as the second named SR warehouse supervisor. Baron
  preserves the user's fluffy cream fur, pale-gold eyes, large plume tail,
  ivory-and-gold ceremonial armor, and ornate inventory scroll; sapphire-blue
  sash and cloth accents carry SR. The four-frame idle and complete source/QC/
  provenance package live under
  `art-source/cat-role-catalog/warehouse-manager/sr/baron/`. Strict QC passes
  with zero empty, edge-touch, or paste-clamped frames, body-scale CV `0.00275`,
  and anchor-Y deviation `0.01537`. Baron remains an unintegrated candidate;
  runtime, gameplay, saves, and schemas are unchanged.

- Generated **Cipher** (`warehouseManager`, catalog role `warehouse-manager`,
  tier `SR`) on 2026-09-08. Cipher preserves the user's sleek charcoal-black
  identity, pale-gold eyes, long tail, segmented futuristic armor, and
  holographic inventory tablet; sapphire/electric blue and cyan carry the SR
  color identity while gold remains secondary trim. The four-frame idle and
  full source/QC/provenance package live under
  `art-source/cat-role-catalog/warehouse-manager/sr/cipher/`. Strict QC passes
  with zero empty, edge-touch, or paste-clamped frames, body-scale CV `0.00744`,
  and anchor-Y deviation `0.01456`. The existing cosmetic warehouse manager
  stays the `N` runtime default; no gameplay, runtime, save, or schema change.

- Generated **Sovereign** (`unloader:SSR`) on 2026-09-08 as the third named SSR
  unloader. The candidate preserves the user's warm-tan long-haired lynx
  identity, cream mane, tall tufted ears, dark markings, glowing pale-gold eyes,
  open receiving paws, and ornate shoulder-mounted treasure chest. Royal-violet
  cloth and an amethyst belt gem carry SSR, with gold retained as a secondary
  material. The four-frame idle and full source/QC/provenance package live under
  `art-source/cat-role-catalog/unloader/ssr/sovereign/`. Strict QC passes with
  zero empty, edge-touch, or paste-clamped frames, body-scale CV `0.00736`, and
  anchor-Y deviation `0.00255`. Sovereign remains an unintegrated candidate;
  runtime, gameplay, saves, and schemas are unchanged.

- Generated **Zenith** (`unloader:SSR`) on 2026-09-08 as a second named
  character in the same role/rarity as Aegis. Zenith preserves the user's cream
  Siamese identity, dark ears/mask/paws/tail, pale-gold eyes, celestial
  clothing, open receiving paw, and compact gold balance scales; deep-violet
  cloth and an amethyst forehead gem carry SSR. The four-frame idle and full
  source/QC/provenance package live under
  `art-source/cat-role-catalog/unloader/ssr/zenith/`. Strict QC passes with zero
  empty, edge-touch, or paste-clamped frames, body-scale CV `0.00271`, and
  anchor-Y deviation `0.00070`. The catalog now explicitly permits multiple
  named characters per role/rarity and uses character-qualified asset IDs.
  Zenith remains an unintegrated candidate; runtime and game schemas are
  unchanged.

- Generated **Aegis** (`unloader:SSR`) on 2026-09-08 from the user-supplied
  silver-gray ceremonial cat reference. The candidate preserves gray tabby
  markings, white muzzle/belly/paws, pale-gold eyes, ornate gold armor, and an
  open-paw receiving pose, while deep-violet cloth/inlays and an amethyst chest
  gem provide the required SSR purple identity. The four-frame stationary idle,
  transparent sheet, raw/reference files, prompt, GIF, contact/context previews,
  QC metadata, and provenance are stored under
  `art-source/cat-role-catalog/unloader/ssr/`. Strict QC passes with zero empty,
  edge-touch, or paste-clamped frames, body-scale CV `0.00204`, and anchor-Y
  deviation `0.00288`. Status is `candidate-generated-awaiting-user-review`;
  runtime, gameplay, balance, state, saves, and schemas remain unchanged.

- Generated the first catalog variant, **Tally** (`unloader:UR`), on 2026-09-08 from the
  user-supplied dark rune-cat reference. The candidate preserves navy-black fur,
  amber eyes, ornate gold rune armor/cloak, and a compact teal-crystal pickaxe
  in a restrained four-frame stationary idle. The normalized 2×2 RGBA sheet,
  per-frame PNGs, GIF, contact sheet, game-context comparison, raw generation,
  prompt, reference copy, pipeline metadata, and provenance are stored under
  `art-source/cat-role-catalog/unloader/ur/`. Strict QC passes with zero empty,
  edge-touch, or paste-clamped frames, body-scale CV `0.00465`, and anchor-Y
  deviation `0.00609`. Status is `candidate-generated-awaiting-user-review`;
  it is not copied into runtime assets or connected to gameplay/state/save.

- Server-milestone Step 3 on 2026-09-08: designed the Postgres schema and wrote
  it byte-identically into `memory-bank/architecture.md` and
  `memory-bank/techContext.md`, replacing the "Relational/server database
  schema: none" statement in each. No migration and no database exist. The
  documented DDL was extracted from the document itself and executed against
  PostgreSQL 17 in a throwaway container with a stub `auth.users`; it applies
  cleanly and 14 constraint-behaviour assertions pass, including that deleting
  the `auth.users` row cascades every row in all six tables. That is a design
  check against stock PostgreSQL, not a Supabase project — Step 4 creates that.

- Server-milestone Step 2 on 2026-09-08: wrote the save-sync contract in
  `memory-bank/server-save-sync-protocol.md`. Documentation only; no code, no
  balance value, no schema version changed. Decisions D1–D5 above are binding on
  later steps, and the dominance conflict policy holds only while the progress
  vector stays monotonic, so a future prestige or reset mechanic must revise it
  in the same change.

- Recorded the user-approved cat-role asset taxonomy on 2026-09-08: every role
  has ordered rarity tiers `N` normal/gray, `R` rare/green, `SR` super
  rare/blue, `SSR` super-super rare/purple, and `UR` ultra rare/gold. The
  existing Step 32A `unloader` remains the runtime default and is registered as
  the `unloader:N` baseline. Added an asset-family brief and manifest under
  `art-source/cat-role-catalog/`. This is documentation and asset preproduction
  only; tier attributes, acquisition, runtime selection, authoritative state,
  balance, saves, and database schemas are unchanged. The next asset input is a
  user-supplied role name, rarity tier, and design reference image.

- Step 37 was validated by the user on 2026-09-08, closing the base-game milestone. All 37 plan steps are complete and the plan's Definition of Done is met.
- Step 37 implemented on 2026-09-08 as a review-and-documentation step with no runtime, balance, or schema change. It reviewed the delivered base game against `memory-bank/implementation-plan.md` and the GDD acceptance criteria, recorded every deferred feature instead of building it, added `README.md`, and corrected the repository documentation that still described a four-floor mine and a round-robin elevator.
- Step 37 documentation findings, all corrected in place: the repository had no `README.md` at all, so the step's own gate — a new developer working from repository documentation alone — could not have been met; `AGENTS.md` still opened with "this repository is currently in the design phase" and "no application scaffold or package scripts exist yet"; `CLAUDE.md` described 4 floors, a round-robin elevator cursor, and `K/M/B/T` formatting; `architecture.md` still said four floor states and "Floors 2–4 unlock"; `techContext.md` said startup validation requires exactly four floors; `activeContext.md` still listed four mine shafts as an active decision; and `systemPatterns.md` described the benchmark as holding an all-four-floor scene. Historical dated entries were left as written, because they record what was true at the time.
- Step 37 evidence gap closed rather than recorded: the Step 35 benchmark result on file measured the former four-floor maximum, while the plan requires all fifteen floors active and the fixture had already been changed to seed fifteen. The ten-minute benchmark was re-run against the full mine and passes every budget — 60.00 FPS, 17.6 ms p95, 17.8 ms maximum, zero of 36,135 frames over the 18.34 ms threshold, 665 Phaser objects and 371 DOM nodes constant, fifteen floors at boot and at end, 83.5 ms scroll p95. Startup rose to 1,177 ms, scroll p95 to 83.5 ms, and the heap slope to +990 bytes/s; all stay inside budget and all are recorded in `performance-results/step-35-report.md` rather than smoothed over. This run presented at 60 Hz, so its mean frame time is the vsync interval and says nothing about remaining headroom.
- Step 37 scope audit: no deferred feature has leaked into `src/`. Authoritative state carries only gold, timing counters, fifteen floor records, elevator, and warehouse; there is no manager, boost, gift, shop, premium-currency, Telegram, or payment code, and every `manager` identifier in the tree names the cosmetic warehouse supervisor sprite.

- Completed the 2026-09-08 HUD queue clarification: the centre slot now uses the warehouse icon, reads only authoritative `warehouse.inputQueue`, and exposes the unambiguous `warehouseQueueValueLabel` diagnostic. Nine focused unit assertions and two Chromium HUD regressions pass.
- Completed the 2026-09-08 tower-hopper feedback independently: `BootScene` swaps between filled and empty 512×512 headhouse textures from `warehouse.queueSteps`, so zero `warehouse.inputQueue` exposes an empty steel bin and any positive queue restores the gold pile. The generated edit is recorded in the asset manifest; four asset unit tests and two focused Chromium regressions pass.
- Completed the 2026-09-08 elevator priority bug independently: a cabin continues deeper only after the current floor queue is fully drained and capacity remains. Filling the computed remainder now snaps cargo to the authoritative capacity, preventing decimal round-off from making a full cabin appear fractionally under capacity. Thirty-two focused elevator/driver/time tests pass, including the `50.005` capacity regression.
- Completed the 2026-09-08 surface-crew alignment feedback independently: every assistant retains its phase-shifted horizontal route position and personal cart, but all cat and cart Y offsets are now zero so the full crew shares the lead baseline. Thirty-one animation unit tests and one focused Chromium crew regression pass.
- Completed aggregate verification on 2026-09-08: all 322 unit tests, 38 Chromium E2E tests, 9 production smoke tests, lint, strict build, and `git diff --check` pass. Direct inspection of `http://127.0.0.1:5174/` reports the warehouse icon/value, empty-hopper texture at queue zero, shared crew baselines, one canvas, and no console errors.
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
- Rebuilt `BootScene` around separate fixed and scrolling layers, English HUD/surface placeholders, and four placeholder floor slots whose then-current 508-pixel content exceeded the 428-pixel mine region.
- Replaced an initial geometry-mask attempt with a dedicated mine camera viewport after Phaser 4 warned that `setMask` does nothing in WebGL; the mine area is now genuinely clipped in both renderers.
- Added sixteen layout/palette unit tests and four Playwright viewport tests (320×568, 390×844, 768×1024, 1280×800).
- Review of the first Step 25 implementation found the browser suite could not detect a broken render: deleting either camera-ignore call left all four viewport tests green while the HUD was visibly destroyed. Added pixel probes that sample the real canvas, extracted the palette into a pure module so scene and test read one source of truth, replaced a hardcoded `428` with the published mine height, threaded `layout.width` into the floor slots, and put the `src/game/layout` purity claim behind a lint rule with an `architecture.test.ts` probe.
- Verified the new probes by mutation: removing either ignore call, or misplacing the mine camera viewport, now fails with a named assertion. A first attempt probing a floor panel missed one mutation because a later-drawn panel hid the duplicated layer; the probe moved to the mine gutter.
- One hundred forty-four unit tests, six Chromium E2E tests, lint, and production build pass.
- The user authorized Step 26 on 2026-08-28, which validated Step 25.
- Added `src/game/view-model/mineViewModel.ts`, a pure Phaser-free module that turns a read-only `GameState` into the exact strings, ratios, and pile heights the screen shows, so every displayed value is unit-testable in Node.
- Added reusable `MineFloorView` and `SharedStageView` entities in `src/game/entities/`. Each owns its game objects, changes only through `applySnapshot`, and reports what it actually shows through `describeRenderedState`.
- `BootScene` now takes the loaded snapshot at construction, builds four floor views into the scrollable mine slots and two stage views into the surface strip, and exposes `applySnapshot` for the live snapshots Step 27 will push.
- Locked floors are drawn in their own `#1a2333` panel colour with a `Locked` badge, muted text, no placeholder miner, and no upgrade control; unlocked floors keep the `#27364b` panel.
- The material queue is derived as a discrete four-step diagnostic measured against one elevator trip; the fixed far-right mound is environmental art and does not encode this value.
- Amount display is deliberately provisional (`formatAmount` rounds to one decimal and leaves very large values serialized); Step 28 replaces it with the shared abbreviated K/M/B/T formatter.
- The browser test seeds a known version-1 save whose four floors differ in lock state, level, progress, and queued material, then compares the rendered values read back from the view objects against that snapshot, backed by eight pixel probes.
- Six deliberate mutations were confirmed to fail with named assertions, including one where the views hold correct values but never reach the framebuffer — which only the pixel probes catch.
- The Step 25 surface pixel probe moved from `300,100` to `300,85` because the new stage panels now occupy the lower part of the surface strip; the probe again samples a point the surface background itself owns.
- Review of the first Step 26 implementation found two defects that only bite later. The rendered-state diagnostic was published once at the end of `create` and never again, so from Step 27 onward a live snapshot that never reached the views would still report a healthy first frame — defeating the read-back's whole purpose. `applySnapshot` also skipped a floor whose snapshot entry was missing, which would leave surplus views showing blank panels that look like real unlocked floors.
- Fixed both: `#publishViewDiagnostics` is now called on every rebind as well as at boot, a mismatched floor count throws through the pure `assertRenderableMineViewModel` guard, and a snapshot arriving before `create` is kept and bound by `create` rather than dropped.
- Both fixes were mutation-verified: freezing the diagnostic at boot fails the new rebind browser test with a named assertion, and disabling the guard fails its unit test.
- Two review cleanups followed: `MineFloorView` now derives its progress-track width from the floor slot exactly as `SharedStageView` does, instead of hardcoding `196` while its neighbouring label and upgrade control tracked `region.width`; and the browser test imports the views' own `RenderedFloorState`/`RenderedSharedStageState` types rather than restating them, so a renamed read-back field now fails type-check instead of silently reading `undefined`.
- Both cleanups were mutation-verified: an overflowing track fails the new containment assertion by name, and renaming a field on `describeRenderedState` fails `tsc`.
- Two more cleanups: `MineFloorView` derives its `Locked` badge and upgrade control from one anchor each instead of three hand-synchronised offsets, and the browser test stopped asserting a constant. `SharedStageView` never hides its upgrade control, so reporting its visibility was an assertion that could not fail; the read-back now reports the bound `upgradeControlLabel`, which does catch a broken binding.
- The floor pile expectation is derived through `calculateMaterialPileSteps` rather than hardcoded, so tuning the elevator capacity cannot fail the test with an opaque number, and a named guard keeps the empty-pile pixel probe meaningful if a tuning change ever fills the stack.
- Mutation-verified: dropping the shared-stage label binding and binding every floor view to floor one both fail by name. The badge-anchor extraction is a behaviour-preserving refactor with no new assertion; the existing pixel probes and read-back values are unchanged by it.
- One hundred sixty-one unit tests, eight Chromium E2E tests, lint, and the production build pass.
- The user authorized Step 27 on 2026-08-28, which validated Step 26.
- Added `src/game/runtime/MineSimulationDriver.ts`, the live bridge the mine screen pulls from. It holds authoritative state, advances it to an injected wall clock through `advanceSimulation`, memoizes the derived view model, and accepts state replaced by a command. `Date.now` is injected from `src/main.ts`, so the clock stays in one place and Node tests advance time exactly.
- Reversed the direction of the render loop from Step 26's push to a pull. `BootScene.update` asks the source for the newest snapshot every frame; the public `applySnapshot` is gone, because a pushed snapshot would be overwritten by the next frame anyway.
- Added `src/game/view-model/stageAnimation.ts`, the cosmetic clock: frame accumulation capped at 250 ms and scaled by a validated `animationSpeedMultiplier`, wrapping at a whole multiple of both the 800 ms miner swing and the 900 ms conveyor cycle, plus the progress-driven cycle-marker offset.
- Gave each production stage its own indicator and its own queued material. Floors gained a swinging pick and a `Backed up` label; both shared stages gained discrete queue blocks, an `Idle` / `In transit` / `Converting` / `Backed up` status, a marker travelling the cycle track, and conveyor dashes that run only while the stage holds material.
- A full queue still derives `isMaterialBackedUp` for stage diagnostics. The elevator deliberately never reports a backlog: a full car is one full trip, and transport pressure belongs to the floor queue/cart state rather than the fixed mound.
- Each pile measures against the capacity of whichever stage removes it — floor piles against the elevator, the warehouse queue against the warehouse — so the same amount reads differently in the two places, correctly.
- Reworked the offline-claim retry. It used to cache a post-claim state candidate; with the mine now producing while the modal is open, that candidate would discard whatever was mined between a failed write and the retry. A consumed-once flag replaces it, so the retry saves current state and still adds the reward exactly once.
- Browser diagnostics are now published on a 100 ms cadence rather than on every rebind, because displayed progress changes every frame and an unthrottled read-back would serialize the whole screen 60 times a second purely for tests.
- Playwright's clock turned out to give exactly the two controls Step 27's validation needs: `install` plus `setFixedTime` pins `Date.now` while rAF keeps running, which pauses the core and leaves the renderer live; `install` plus `pauseAt` then `runFor` advances both deterministically. The bottleneck fixtures use the first, the animation-speed trial the second.
- The animation-speed trial settles the core explicitly at the end of each run, so gold depends on total elapsed time rather than on where frames happened to land, and the two runs compare byte-identical serialized gold.
- Nine mutations were confirmed to fail with named assertions: a speed multiplier wired to nothing, a scene that never advances the core, a pile that ignores the backlog colour, shared-stage queue blocks that ignore the amount, a cycle marker parked at the start of its track, a conveyor that never stops, a cosmetic clock allowed to drive the authoritative progress bar, a diagnostic frozen at boot, and a floor pick that never moves.
- A latent pixel-probe race surfaced once a third probing spec joined the suite: diagnostics are published inside `create`, before the first frame is presented, and a canvas that has not presented reads back as opaque black — so under parallel load a probe could sample an empty buffer and fail on a correct render. Both browser specs now poll an always-painted HUD point before any probe, and the full suite passed five consecutive runs.
- Fixed a time-loss bug found while reviewing Step 27: the driver handed the whole wall-clock gap to `advanceSimulation`, which credits at most one second but consumes the entire delta. A hidden tab is not a slow frame — the browser stops the render loop, so the absence arrived as one delta and everything past its first second was consumed unsimulated. Reproduced at sixty seconds: 380 gold when frames ran throughout, 100 (the starting balance) when the same minute arrived as one frame. No reload happens in that scenario, so offline income never saw the interval either.
- Added `src/core/simulation/catchUpSimulation.ts`, which walks a gap in credited-size slices. Slicing is exact rather than approximate because `advanceSimulation` carries its sub-tick remainder in authoritative state, so a run of slices is indistinguishable from continuous time. The catch-up lives in the core, not the driver: how much wall-clock time is credited is simulation semantics, and the driver stays a thin bridge.
- Bounded catch-up at `MAX_CATCH_UP_MS` (two hours), because it runs inside the frame that discovers the gap. Measured worst case is roughly thirty milliseconds for the full seventy-two thousand ticks. The bound matches the horizon `offlineIncome.capDurationMs` already applies to away time, so leaving the tab open and closing it are capped alike, and time past the cap is still consumed by `lastUpdateTimestampMs` — a timestamp left behind real time would hand the same interval to offline income on the next load.
- Three mutations were confirmed to fail with named assertions: the driver reverted to a single bounded advance, catch-up dropping uncredited time instead of consuming it, and catch-up left unbounded.
- Fixed the two remaining review findings. The driver now re-derives its snapshot only when a fixed tick completed: a sixty-frame second completes ten ticks, so most frames left a state differing solely in timestamp and sub-tick remainder, and re-deriving rebuilt an identical view model while handing the scene a new object to rebind. The tick counter is the exact condition, not a heuristic, because `advanceSimulation` increments it once per tick and nothing else touches production state. `replaceState` still always re-derives, since a command changes displayed values without completing a tick.
- With that in place `BootScene.#bindSnapshot`'s identity check finally fires on most frames, so the renderable guard moved behind it. Every distinct snapshot is still checked once, on the frame it first arrives.
- Gated the rendered-state read-back behind `import.meta.env.DEV`. Nothing in the game reads those attributes, and a shipped build was serializing the whole screen ten times a second for an audience that does not exist. Playwright runs against the dev server, so browser tests are unaffected; the production bundle no longer contains the `floorViews` or `surfaceViews` dataset writes at all, though the unreferenced `describeRenderedState` bodies still ride along as dead code. The boot and layout diagnostics are untouched, as are the canvas accessibility attributes.
- Three more mutations fail by name: a driver that never memoizes, a driver that never re-derives, and a `replaceState` that reuses the snapshot.
- One hundred ninety-eight unit tests, twelve Chromium E2E tests, lint, strict production build, and `git diff --check` pass.

- Implemented Step 28 on 2026-08-29 after the user authorized it. The HUD is live: `createHudViewModel(state, balance)` derives the English `Gold` and `Income /s` captions and their values and rides on the same `MineViewModel` the mine views are bound from, so one snapshot drives the whole screen and `createMineViewModel` plus `MineSimulationDriver` now take balance data. Income is the core's `effectiveProductionPerSecond`, already capped at the chain's slowest stage. `HudView` builds its background, divider, and four text objects once and changes only through `applySnapshot`; `BootScene` publishes `data-hud-view` on the existing 100 ms cadence.
- `src/game/view-model/formatAmount.ts` replaced the provisional display helper and is now the single formatter for every displayed amount. At most one decimal place, then no suffix below 1,000, `K`/`M`/`B`/`T`, then alphabetic suffixes `aa`, `ab`, ... `zz`, `aaa`, ... matching the GDD's `14.6aa` and `7.2ab`; past three letters the serialized scientific form is shown. Digits truncate rather than round, and a present-but-tiny amount reads `<0.1`.
- `GameNumber` gained normalized `mantissa`/`exponent` getters. The formatter needs a magnitude, and reading one through `Number` prints the same thing for every value past 1e308; the two plain numbers give display code what it needs without leaking the numeric library's type.
- Step 28 evidence: two hundred seventeen unit tests, fourteen Chromium E2E tests, lint, the strict production build, and `git diff --check` pass. One browser test asserts the HUD's abbreviated gold and its income against the core's own rate calculation; a second boots the real driver one conversion cycle short of a delivery, runs two seconds of fake wall clock, and asserts the displayed gold equals the authoritative balance while the scene's display-object count is unchanged. Six mutations fail with named assertions: a HUD bound once at boot and never rebound, a HUD never bound at all, a formatter that rounds instead of truncating, an alphabetic run starting one tier late, a formatter reading magnitude through `Number`, an income value taken from aggregate extraction instead of the bottleneck-capped rate, and a `HudView` that appends a text object per rebind.
- Step 28 review fixes: four review findings were corrected without changing behaviour. `TRUNCATION_TOLERANCE` in `formatAmount.ts` claimed a displayed amount can never read high, but the tolerance that keeps floating-point scaling from dropping a digit also lifts a value within `1e-9` of the next digit onto it, so `0.9999999999` reads `1`; the tolerance is now documented as the bound on that overstatement and a unit test pins both sides of it, making the claim checkable rather than asserted. `HudView` typed its text anchor as a bare `number` after the move out of `BootScene`, losing the old `'left' | 'right'` safety, and now uses a `HorizontalOrigin = 0 | 1` alias with named constants. `BootScene` published `data-hud-view` as `"null"` before the view existed, which would have surfaced in a browser test as a property access on `null` rather than a named diagnostic failure; the attribute is now written only once the view exists. `GameNumber`'s `mantissa`/`exponent` getters moved out of the middle of the arithmetic group to sit beside `serialize()`, and `exponent` gained its own doc.

- Implemented Step 29 on 2026-08-29 after the user authorized it. Every unlocked mine shaft and both shared stages now carry a working upgrade control. `createUpgradeControlViewModel(target, cost, gold)` derives the `Upgrade` caption, the abbreviated price, `isAffordable`, the command target, and a stable key; a locked floor's `upgradeControl` is `null`. Each price comes from the same core function that charges it, so `createMineViewModel` now takes each floor's balance config and the spendable balance alongside the state it reads.
- `UpgradeControlView` is one reusable entity used by both the floor panels (`stacked` layout) and the shared-stage panels (`inline`). Its background rectangle carries the hit area, so the pressable region is exactly the drawn one and a hidden control is unreachable — which is how locked floors have no button. An unaffordable control is drawn disabled but still accepts a press, because refusing in the view would substitute the renderer's guess for the core's answer and leave the player with no feedback.
- `MineSimulationDriver.purchaseUpgrade(target)` is the scene's command sink. It advances to the current time first, dispatches to `purchaseMineShaftUpgrade` / `purchaseElevatorUpgrade` / `purchaseWarehouseUpgrade`, and returns `purchased`, `insufficient-funds`, or `unavailable`. A refusal leaves state and the memoized snapshot untouched; a purchase re-derives the snapshot and calls the new optional `onCommandApplied` hook, which `src/main.ts` uses to queue a debounced save so a purchase is not lost on the next reload.
- The result appears on the pressed control for 1,200 ms — `Upgraded!` on green, `Need more gold` on red — expired by the pure `describeUpgradeFeedback`, run on the Phaser scene clock rather than the cosmetic animation clock. `BootScene` rebinds and republishes diagnostics immediately on a press, since a purchase changes displayed values without any tick completing, and publishes `data-upgrade-controls` with each control's screen-space rectangle so a browser test can aim a real press at it.
- Step 29 evidence: two hundred thirty-two unit tests, eighteen Chromium E2E tests, lint, the strict production build, and `git diff --check` pass. Three browser flows press real controls at published coordinates: an unaffordable press that spends nothing and says `Need more gold`, one mine-shaft purchase with exactly one deduction, one level increase, an unchanged display-object count, and an updated button price, and the two shared stages bought through their own commands. Eight mutations fail with named assertions: affordability using strictly-greater instead of at-least, a purchase that skips advancing to the current time, feedback that never expires, a refused command reported as applied, a view that refuses an unaffordable press itself, every press routed to the mine shaft, floor control geometry that ignores the mine camera, and a control bound once and never rebound.

- Step 30 implemented on 2026-08-30: every locked floor now sells itself. `describeFloorUnlock(state, floorId, config)` in `src/core/progression/unlocks.ts` reports one locked floor's price, the prerequisite shaft it waits on (id, player-facing number, required level, current level), `isRequirementMet`, `isAffordable`, and `canUnlock`, or `null` once the floor is open. It and `purchaseFloorUnlock` now share one private predicate, so the description a control renders and the command that charges gold cannot disagree — a unit test asserts that agreement across every combination of prerequisite level and balance.
- Step 30 controls: the upgrade-control model generalized into `src/game/view-model/purchaseControl.ts`, because an unlock is the same control to the player — a labelled button with a price that either can or cannot be pressed to effect right now. `UpgradeTarget`/`UpgradeOutcome`/`UpgradeControlViewModel` became `PurchaseTarget`/`PurchaseOutcome`/`PurchaseControlViewModel`, `isAffordable` became `isEnabled` (a control is now drawn enabled for two reasons, not one), `UpgradeControlView` became `PurchaseControlView`, `MineSimulationDriver.purchaseUpgrade` became `purchase`, and the canvas diagnostic became `data-purchase-controls`. `PurchaseTarget` gained `{ type: 'floor-unlock', floorId }`; `PurchaseOutcome` gained `unlocked` and `requirement-not-met`, labelled `Unlocked!` and `Level too low`.
- Step 30 presentation: `MineFloorView` holds two `PurchaseControlView` instances in one slot — the shaft upgrade and the unlock — of which exactly one is ever visible, and Phaser skips invisible objects when hit-testing, so the two can never both take a press. The requirement is not on the button but beside it: `Needs Floor 1 Lv 5`, drawn in `TEXT_WARNING` while unmet and `TEXT_MUTED` once satisfied, so a player who is only short of gold is not told to keep upgrading. `assertRenderableMineViewModel` now requires exactly one of the two controls per floor, and `createMineFloorViewModel` rejects an unlock description that disagrees with the floor's lock state.
- Step 30 commands: `MineSimulationDriver.purchase` dispatches a `floor-unlock` target to `purchaseFloorUnlock` and maps refusals through one `describeRefusal` — only `insufficient-funds` and `prerequisite-not-met` are named, because every other core failure is a press that should not have been reachable and reads as advice the player cannot use. A successful unlock fires the same `onCommandApplied` hook, so `src/main.ts` persists the opened floor without waiting for a tick. `BootScene` now expires its whole feedback map each frame rather than only the entries whose control is still on screen, because a successful unlock hides the control that was pressed and its result would otherwise never be collected.
- Step 30 evidence: two hundred forty-seven unit tests, nineteen Chromium E2E tests, lint, the strict production build, and `git diff --check` pass. One browser flow drives the whole journey on a paused clock: floor 2 shows `Locked`, `Needs Floor 1 Lv 5`, and its price with the button disabled although the balance already covers it; a premature press reads `Level too low` and leaves the floor closed; one floor-1 upgrade satisfies the gate and the button enables; the unlock deducts about one price, opens the floor in place — locked colour gone, miner working, unlock control replaced by the shaft upgrade — with `data-boot-scene-starts` still `1`; the open floor reaches IndexedDB before a reload, and after the reload it is still open and extracts material.
- Step 30 mutation verification: seven mutations fail with named assertions — an unlock enabled by gold alone (`level 4 with 5000 gold`), a description drifting from the command it describes (four unrelated unlock tests break), locked floors carrying no unlock control (six assertions across two files), a prerequisite refusal reported as merely unavailable (`a premature unlock must say which gate refused it`), an unlock that skips the applied-command hook (`the open floor must reach the save before the reload`), a scene that does not rebind after a purchase (`one level bought`), and an unlock control bound once and never rebound (`a locked floor offers an unlock instead`).
- Step 30 browser-test finding: under a Playwright clock paused with `pauseAt`, the Phaser game loop does not step again after `create`, and a pointer event dispatched before it steps is never taken up. The spec grants one `runFor` after the scene exists, and every press then waits — advancing the clock in slices — until the control reports a result or disappears, rather than assuming a fixed settling time.

## Next Steps

The follow-up HUD clarification renames the centre field and rendered diagnostic to `warehouseQueueValueLabel` and replaces the elevator icon with the warehouse icon. The value remains sourced directly from authoritative `warehouse.inputQueue`; this is a semantic/UI correction only and does not change conversion timing, economy state, or save/database schema.

The 2026-09-07 browser-feedback revision is implemented: `HUD_HEIGHT` is 52, the centre HUD value reads `warehouse.inputQueue`, and balance/state/view construction now supports exactly fifteen floors. Floors 1–5 are visible initially; opening floor 5 expands the mine to floors 1–10, and opening floor 10 expands it to floors 1–15 without restarting the scene. The active scroll range resizes with each reveal while retaining the current scroll position. Save document and IndexedDB versions remain 1; legacy four-floor version-1 documents are expanded to the fifteen-floor shape before strict validation, preserving floors 1–4 and adding locked configured defaults. The game UI/UX skill guided the compact fixed-region and progressive-disclosure implementation without weakening safe-area scaling or touch targets. Automated evidence: 321 unit tests, 37 Chromium E2E tests, all nine production smoke tests, lint, build, and `git diff --check` pass; direct in-app browser inspection confirms the 52 px HUD, five initially visible floors, and no console errors.

Server-milestone Step 4 is implemented and awaiting validation. The whole backend
now runs offline in Docker: Supabase CLI 2.117.0 is an exact devDependency,
`supabase/config.toml` is committed with project id `cat-mine-idle` and default
ports that do not collide with 5173/4173/4174/4175, and `realtime`, `storage`,
and `analytics` are switched off because no milestone step uses them. One Edge
Function, `save-sync`, serves protocol §10.1 `GET /v1/health` at
`/functions/v1/save-sync/v1/health`; it is the router, error envelope, and
vocabulary Steps 16 and 17 must reuse rather than a second contract.

Three Step 4 judgment calls to review at the gate. First, `verify_jwt = false`
for the whole function, because §10.1 requires the health route to answer an
unauthenticated caller — the authenticated routes verify their own token in the
handler from Step 16, and until then no route touches data. Second, **one
bootstrap migration exists** even though Step 5 owns migrations: it creates
nothing, asserts the PostgreSQL 13+ premise the Step 3 schema relies on for
`gen_random_uuid()`, and gives Step 4's "applies migrations" check and Step 5's
"a broken migration fails CI" check a real file rather than an empty directory.
The six designed tables are untouched. Third, the health route proves database
reachability by round-tripping PostgREST with the **anon** key, never the
service-role key, because it is the one route open to unauthenticated callers
and that key bypasses row-level security; Step 16 narrows the probe to `saves`
once that table exists.

The secret boundary is now enforced rather than described. `.env.example` is the
committed template, `.env.local` holds real values and is ignored, and the
`VITE_` prefix is the whole line between a public value and a credential.
`npm run scan:secrets` fails the build if `dist/` carries a service-role JWT, an
`sb_secret_*` key, an exact non-`VITE_` environment value, or a server-only
variable name, and it runs inside `npm run verify` between `build` and
`test:prod`. `tests/unit/server-stack.test.ts` adds sixteen static invariants,
asserting the ignore rules through `git check-ignore` rather than the text of
`.gitignore` so a commented-out rule cannot pass.

Evidence: `npm run verify:server -- --with-bundle-scan` passes all nine checks
from a clean checkout against an empty Docker volume set, including migrations
applied from empty and an unauthenticated health check answering 200 within 9 ms
of the local clock. Both halves are mutation-proven: a broken migration fails
`supabase db reset` with exit 1, the version guard fires when its threshold is
raised, stopping the PostgREST container turns the health route into a 503
`service_unavailable`, and a planted service-role JWT, `sb_secret_*` key, or
server-only variable name each fails the bundle scan. `npm run verify` passes end
to end: lint, 351 unit tests, 42 Chromium E2E tests, the strict production build,
the secret scan, and 9 production smoke tests. No client code changed, no gameplay
changed, and save-document and IndexedDB schema versions remain 1.

A user review of Step 4 found four defects, all fixed with regressions. The
serious one: `npm run verify:server` reported a healthy stack as a missing
migration in any ordinary terminal, because `supabase migration list --local`
defaults to a text table and only emits JSON when the CLI auto-detects an agent —
which is why it passed during implementation and would have failed for a human.
It now requests JSON explicitly, guards the payload slice, and reports an
unreadable response as its own failure rather than as a missing migration. The
others: the plan document used `npm run verify:server --with-bundle-scan`, which
npm does not forward, so the documented nine-check command silently ran seven;
the secret scanner would have failed a build on an anon key present under both
its prefixed and unprefixed names, now exempted by twin name rather than by value
so a mirrored secret cannot exempt itself; and the privileged-key probe degraded
silently to checking nothing, now warned about and distinguished from a stack
that is simply not running. Unit coverage is 364, up from 351.

Two gaps are recorded rather than closed. `supabase/functions/**` is linted with
Deno globals declared but is outside `tsconfig.json`, because `Deno` has no type
in the Node/DOM libraries the client compiles against — Step 7's Edge Function
harness closes this, and until then the function's only automated proof is the
live health probe plus static source assertions. And the health probe reports
PostgREST's reachability, which is a real database round trip but not a query
against a table the game owns.

The user validated Step 4 and authorized Step 5 on 2026-09-08.

Server-milestone Step 5 is implemented on 2026-09-08: migrations and CI.
`supabase/migrations/20260908130000_create_platform_tables.sql` lands the six
Step 3 tables verbatim — the exact `create table`/index SQL documented in
`memory-bank/architecture.md` and `memory-bank/techContext.md` — plus RLS
enabled on all six with exactly the policies the Step 3 matrix names:
`profiles` and `entitlements` select-own, `profiles` update-own, `saves`
select-own with no insert/update/delete policy anywhere, and
`leaderboard_entries` select-all. `save_audit` and `recovery_codes` get RLS
enabled and no policy at all, which denies every access to `anon` and
`authenticated` outright. `supabase/seed.sql` gained one fixture guest —
an `auth.users` row plus its `profiles` row, both local-only — so
`supabase db reset` leaves something to inspect in Studio without the Step 8
sign-in flow existing yet; `saves`, `save_audit`, `leaderboard_entries`, and
`entitlements` stay unseeded because a realistic fixture row for them needs
code that does not exist before Steps 16, 26, and 31.

Step 5 evidence went beyond re-running Step 4's script. Against the real local
stack, a JWT minted for the seeded fixture user (`role: authenticated`,
`sub` set to its id) can `select` its own `profiles` row (200, one row) and its
own — empty — `saves` row-set (200, `[]`); a direct `insert` into `saves` with
that same token is refused (403, PostgREST `42501`, "new row violates
row-level security policy"); and `save_audit` returns `[]` under RLS with no
policy at all rather than an error. `EXPECTED_MIGRATIONS` in
`scripts/verify-server-stack.mjs` now lists both migration files, so
`npm run verify:server` actually checks the new one landed rather than only the
bootstrap file. Step 5's own "a deliberately broken migration fails CI" claim
was mutation-proven directly: a temporary migration with a typo'd foreign-key
column made `supabase db reset` exit 1, and removing it restored exit 0 and a
clean `npm run verify:server` pass — the identical mechanism
`.github/workflows/ci.yml`'s new `server` job runs, though no GitHub Actions run
has actually executed, since this checkout was never pushed. That workflow adds
a `client` job (`npm run verify`) alongside it, and `package.json` gained a
`verify:all` sibling script that runs both locally in sequence. `npm run lint`
and `npm run test` (364 unit tests) were re-run and pass unchanged; no client
source file changed, and no gameplay, save-document, or IndexedDB schema
version changed.

One scope decision worth reviewing at the gate: Step 5 lands all six tables
now, rather than one per the step that first names it (Step 9 for `profiles`,
Step 15 for `saves`, Step 27 for `leaderboard_entries`, Step 31 for
`entitlements`). This follows what `memory-bank/architecture.md`,
`memory-bank/techContext.md`, and the Step 4 bootstrap migration's own comment
already committed to before this step began — "Step 5 lands these six tables
as forward-only migrations" — rather than a re-reading of Phase 2/3/5/6's
per-step instructions in isolation. Under this reading, Steps 9, 15, 27, and 31
add the application logic around an already-existing table (the sign-up
trigger, the upload function, the ranking query, the grant check), not the
`create table` statement itself.

A code review of the Step 4/5 working tree on 2026-09-08 found ten issues and
all ten were fixed in place, before the gate rather than after it. Three changed
behaviour that a gate would otherwise have certified as working:

1. `parseEnvFile` in `scripts/scan-bundle-secrets.mjs` took everything after the
   first `=` as the value, so a `.env.local` line carrying a trailing
   `# comment` produced a forbidden value that could never occur in a bundle.
   The exact-value check — one of the scan's three legs — silently became a
   no-op for that variable while still printing as having run. It now reads
   dotenv's quoting rules and strips an `export ` prefix, and the fix is
   mutation-proven: the regression test fails against the old parser.
2. `public.set_updated_at()` was created without `set search_path = ''`
   (Supabase's `function_search_path_mutable` lint). Migrations are
   forward-only and this is the trigger every future `updated_at` column
   attaches to, so it was pinned at creation; the body now calls
   `pg_catalog.now()`, and the trigger was verified still firing against the
   local stack.
3. `leaderboard_entries_select_all` admits every row, and PostgREST lets the
   caller choose its own column list — so `?select=user_id` enumerated the
   `auth.users` id of every published player with no authentication. `user_id`
   is now withheld by column-level grant. Verified live: anon reads
   `board_key,display_name,metric_exact` (200) and is refused `select=user_id`
   and `select=*` alike (`42501`). The RLS matrix in `architecture.md` and
   `techContext.md` moved with it, and both copies remain byte-identical.

The remaining seven were smaller but the same shape — a check that reports
success without having checked. `EXPECTED_MIGRATIONS` is gone from
`scripts/verify-server-stack.mjs`, replaced by a read of `supabase/migrations/`
plus a guard against an empty list, so a future migration cannot be silently
skipped by an unedited constant; the bundle scan now names the `.env.local`
values it skipped as too short or placeholder and refuses to print a pass over
an empty `dist/`; the save-sync health route answers a missing environment
variable with `server_error` rather than `service_unavailable`, which would
otherwise have every client retry forever against a healthy database, and
`errorResponse` can now set the `Retry-After` the protocol's §4 tells clients to
wait for; `.github/workflows/ci.yml` declares `permissions: contents: read` and
per-job `timeout-minutes`; and the repository-wide credential scan in
`tests/unit/server-stack.test.ts` skips binary extensions — it was reading 363
untracked images, mostly `art-source/`, on every `npm run test` — and now
reports an unreadable file as an offender rather than skipping it silently.
That test went from roughly 2 s to 36 ms.

Each fix ships with a regression test. After them: `npm run lint` clean,
376 unit tests pass, `npm run verify` passes end to end, and
`npm run verify:server` passes with both migrations applying to an empty
database.

The user validated Step 5 and authorized Step 6 on 2026-09-08.

Server-milestone Step 6 is implemented on 2026-09-08: `src/core`, `src/config`,
and the save-document boundary run on Deno without forking them. The blocker
was not the anticipated one. Finding F2 asked whether `break_infinity.js`
imports into Deno; the real obstacle, discovered empirically rather than
assumed, is finding F10 — Deno's edge runtime does not add a `.ts` extension to
an extension-less relative specifier, so pointing a function straight at
`src/core/index.ts` failed to boot on that file's own internal
`from './economy/calculateProductionRates'`-style imports. Reproduced
identically through `supabase functions serve` and the real `supabase start`
edge runtime (`supabase-edge-runtime-1.74.3`, Deno v2.1.4); a `deno.json` with
`"unstable": ["sloppy-imports"]`, tried at the project root and inside the
function's own directory, was not honoured by either.

The fix is a generated bundle, not an import map. `supabase/functions/_shared/coreBundleEntry.ts`
contains no logic — `export * from '../../../src/core'` and its `src/config`
and `src/persistence/saveSchema.ts` siblings, nothing else — so it cannot fork
the behavior it names. `npm run build:server-core` (`vite.server-core.config.ts`,
Vite library mode) compiles it into the git-ignored
`supabase/functions/_shared/generated/core-bundle.js`: one dependency-free ES
module with every specifier already resolved, `break_infinity.js` included,
through the same resolution the client bundle already relies on. That resolved
F2 as a side effect: it imports cleanly once bundled, no shim needed.
`scripts/verify-server-stack.mjs` rebuilds this bundle before every
`supabase start`, so it can never be tested stale.

`supabase/functions/core-portability-check` — deliberately not part of the
save-sync protocol, since it reads and writes no data and exists only to prove
this step — imports that bundle and runs the fixed document at
`tests/fixtures/ten-minute-core-fixture.json` through the real
`migrateSaveDocument` → `validateSaveDocument` → `deserializeSaveDocument` → one
explicit `advanceSimulation` tick → `catchUpSimulation` for the rest of ten
minutes → `createSaveDocument`. `tests/unit/server-core-portability.test.ts`
runs the identical sequence against the unbundled source and pins the result:
gold `"100"` → `"3080"`. `npm run verify:server` fetches the live function and
asserts byte-for-byte identity against that pinned document.

Mutation-proven directly, not only asserted: `calculateExtractionYield` in
`src/core/simulation/advanceSimulation.ts` was temporarily doubled. The client
test failed immediately; rebuilding the bundle and re-fetching the live
function showed the identical doubled numbers (gold `"6060"`,
`totalGoldDelivered` `"5960"`) in the same run, before the edit was reverted and
both sides matched the original fixture again. `eslint.config.mjs` extends
`src/core/**/*.ts`'s purity rules with a `Deno` global ban and a
`(^|/)supabase(/|$)` import ban — the dependency direction is `supabase/` on
`src/core`, never the reverse — and `tests/unit/architecture.test.ts` gained a
probe for both. `npm run lint` and `npm run test` (378 unit tests, up from 364)
pass; no gameplay, save-document, or IndexedDB schema version changed.

A 2026-09-09 review found six defects, all fixed with direct verification
rather than only reasoned about. The bundle config was missing
`publicDir: false`, so Vite's default copied ~2.9 MB of game art into
`supabase/functions/` on every build (measured 3.0 MB before, 80 KB/one file
after). The `src/core` import ban covered `supabase/` but not the
`@supabase/*` npm scope Step 7 adds. `scripts/verify-server-stack.mjs`
compared serialized JSON text while the unit test used `toEqual`, so a
harmless key-order difference would fail one and not the other; both now
compare structurally, with a live reorder-the-fixture test proving the script
still passes with an "identical values, differing key order" detail rather
than a false failure. A non-200 response from the portability check was
retried up to twenty times though it can only mean a deterministic failure;
timed live against an injected throw, it now reports in 30 ms instead of a
multi-second loop. `vite.server-core.config.ts` was outside `tsconfig.json`'s
`include`. The CI job name/comment no longer described the job after this
step extended it. `npm run lint`, 378 unit tests, and `npm run verify:server`
(including the still-80-KB bundle) all pass after the fixes.

The user validated Step 6 and authorized Step 7 on 2026-09-09.

Server-milestone Step 7 is implemented on 2026-09-09: the Edge Function test
harness, closing Phase 1. `deno-bin@2.1.4` is a new exact devDependency — a
real, pinned Deno CLI matching the edge runtime's own reported "compatible
with Deno v2.1.4" — since the Supabase CLI's own `test` subcommand only wraps
pgTAP, not Deno. `npm run test:server-unit` (`deno test supabase/functions`)
runs 19 tests across three files, each importing its handler directly rather
than making an HTTP request, and every one passes with zero `--allow-*`
permission flags — proof of purity by construction, since Deno's sandbox
would refuse real network or env access without an explicit grant.

`whoami-check` is Step 7's "trivial authenticated endpoint," not part of the
save-sync protocol. `handleWhoAmI` takes caller resolution as an injected
`ResolveCaller` collaborator rather than calling Supabase Auth itself, so its
unit tests fake every response the route can give; the one real
collaborator, `resolveCallerViaSupabaseAuth` (new `@supabase/supabase-js`
client dependency), verifies the bearer token against GoTrue and reads the
caller's own `profiles.display_name` under row-level security — the
authenticate-then-read-under-RLS shape every real route from Step 9 onward
needs. `tests/server-integration/authFixture.ts` mints an HS256 JWT for the
seeded fixture guest, signed with the Supabase CLI's fixed local
`JWT_SECRET` — "the fixture pattern for an authenticated caller" the step
asks for, replacing the ad hoc inline script Step 5's evidence-gathering used.
`tests/server-integration/whoami.integration.test.ts` exercises the real
collaborator against the live stack from its own `vitest.server-integration.config.ts`,
deliberately excluded from `vitest.config.ts`'s glob so `npm test` never needs
Docker.

`save-sync/index.ts` and `core-portability-check/index.ts` both gained an
`import.meta.main` guard around `Deno.serve(...)`, so importing them for unit
tests does not also start a live listener — proven live: after the change,
both functions still answered real requests exactly as before. Their
duplicated response envelope moved to the new
`supabase/functions/_shared/http.ts`, itself unit-tested.
`scripts/verify-server-stack.mjs` runs the unit suite before the stack even
starts and the integration suite once the database is reset, both from a
clean `supabase db reset` — satisfying the step's "both run in CI from a
clean database" test. Its final pass/fail line, hardcoded as "Step 4
validation" since Step 4, now reads "npm run verify:server," since it has
covered four steps for a while.

A real bug surfaced live while wiring the integration test, not assumed
away: `auth.getUser` against the seeded fixture guest 500'd with
`"Scan error on column ... confirmation_token: converting NULL to string is
unsupported"` — `supabase/seed.sql` had never set `confirmation_token`,
`recovery_token`, `email_change_token_new`, or `email_change`, columns with no
default that GoTrue's Go row scanner cannot read as NULL. No step before this
one ever triggered it, since Steps 4 through 6 only ever handed PostgREST a
hand-signed JWT directly, never asking GoTrue to load the user row. Fixed by
seeding those four columns as `''`, matching a real sign-up; verified with a
direct `curl` to `/auth/v1/user` before (500) and after (200) the fix.

Step 7 evidence: `npm run verify:server` passes 13 checks end to end from a
completely clean `supabase stop`/`start`/`db reset` cycle, and
`--with-bundle-scan` additionally passes the build and secret scan. The full
client gate was re-run given the scope of change: lint clean, 378 unit tests
(one static-source test needed updating to read the file its assertion moved
to), all 42 Chromium E2E tests, strict build, secret scan, and all 9
production smoke tests pass.

The user validated Step 7 and authorized Step 8 on 2026-09-09.

Server-milestone Step 8 is implemented on 2026-09-09: the anonymous guest
session, opening Phase 2 (Identity). `enable_anonymous_sign_ins` flips to
`true` in `supabase/config.toml` — the existing `anonymous_users = 30`/hour
rate limit already covered this path. `@supabase/supabase-js` moves from
`devDependencies` to `dependencies`, exact-pinned at the same `2.116.0`
`whoami-check`'s Deno import already used, because `src/platform/web/supabaseClient.ts`
is the first `src/` code to import it: `createSupabaseClient()` reads
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and returns `null`, attempting no
network call, when either is unset — a checkout with no `.env.local` stays
exactly as playable as before this step.

`src/platform/web/guestSession.ts`'s `ensureGuestSession` mirrors the injected-collaborator
pattern `whoami-check`'s `ResolveCaller` already established: it takes only
the narrow `GuestAuthClient` slice of `SupabaseClient['auth']` it needs
(`getSession`/`signInAnonymously`), so `tests/unit/guest-session.test.ts` fakes
that collaborator instead of mocking the SDK. It never throws — reusing an
existing session, signing in fresh, a rejected call, and a disabled or
unreachable auth service all resolve to a typed result
(`signed-in`/`sign-in-failed`/`unconfigured`) rather than rejecting.
`src/main.ts` constructs the client once and calls `ensureGuestSession`
without awaiting it before `loadActiveGame`/`createGame` — identity
resolution must never delay the first frame, the same "boot from local,
reconcile after" principle Step 17 will apply to save reconciliation, landing
one step early for identity itself — and publishes the resolved result as a
`DEV`-only `app.dataset.guestSession` diagnostic, the same
`import.meta.env.DEV` convention `BootScene` already uses, stripped from
production identically.

Proving "two browsers receive different identities" needs a real GoTrue
issuing real sessions, so Step 8 adds a second, Docker-dependent Playwright
suite kept out of the Docker-free `npm run test:e2e`: `playwright.server-e2e.config.ts`
(port 4176) and `tests/server-e2e/guest-session.spec.ts`. Three scenarios: a
fresh browser boots playable and holds a real anonymous session (a UUID
`user.id`, `isAnonymous: true`); every `**/auth/v1/**` request aborted still
boots the game, and forcing the same `visibilitychange` flush
`tests/e2e/lifecycle-persistence.spec.ts` already drives still reaches
IndexedDB across a reload; two fresh browser contexts receive distinct
`user.id`s whose access tokens, sent directly from the Node test process (no
CORS concern), each answer only for themselves through the live
`whoami-check` function. `scripts/verify-server-stack.mjs` now runs
`npm run test:server-e2e` after `test:server-integration`, reading
`API_URL`/`ANON_KEY` from a live `supabase status --output json` into the
spawned dev server's environment — no `.env.local` needed in CI, and a
developer's own file is untouched.

One empirical finding, not assumed: `enable_anonymous_sign_ins` is read by the
GoTrue container at boot, not by `supabase db reset` — a stack already
running from before the config edit still answered
`anonymous_provider_disabled` (verified directly via `curl` against
`/auth/v1/signup`) until fully stopped and restarted. A genuinely clean
checkout never hits this, since every CI run and any `supabase start` after a
`supabase stop` starts the container fresh.

`CLAUDE.md` and `README.md` both asserted "nothing in `src/` makes a network
call" — now false, corrected in the same change to name the one non-blocking
call this step adds and confirm the game stays exactly as playable without it.

Step 8 evidence (pre-review): `npm run verify:server` passed end to end from a
completely clean `supabase stop`/`start`/`db reset` cycle, including all three
new `test:server-e2e` scenarios. The full client gate was re-run: lint clean,
396 unit tests, all 42 Chromium E2E tests, strict build, secret scan
(confirming `VITE_SUPABASE_ANON_KEY` is the only Supabase-related value in
`dist/`, no service-role key), and all 9 production smoke tests passed.

A 2026-09-09 review of the Step 8 working tree found ten issues. Six fixed
before the gate: `.github/workflows/ci.yml`'s `server` job had no Chromium
installed at all for the new browser suite `verify:server` now runs (fixed
with its own `npx playwright install --with-deps chromium` step, and its
stale name/comment and 20-minute timeout corrected/bumped to 25); `playwright.server-e2e.config.ts`'s
default `'html'` reporter would hang `scripts/verify-server-stack.mjs`'s
`spawnSync` on any local failure and collide with the main suite's report
folder (switched to `'line'`, matching why the production/performance configs
already avoid `'html'`); `callWhoAmI`'s retry loop broke on any response
including a transient cold-start error and its 10-attempt budget could exceed
the config's implicit 30 s test timeout — the same class of bug a Step 7
review already fixed once for a comparable warm-up loop (now retries on
`!response.ok` too, at 6 attempts under an explicit 60 s test timeout); a
static `@supabase/supabase-js` import cost +58 kB gzip on the single entry
chunk that every boot parses first, which is exactly what this step's "never
delay the first frame" rule exists to prevent (`createSupabaseClient` now
dynamically imports the SDK only once the env vars are confirmed present,
putting it in its own on-demand chunk); and the "documented commands" test
was missing `test:server-e2e`. Two more applied as cleanups: the dev-only
diagnostic dropped its published access token (the server-e2e suite now
reads it from the Supabase client's own `localStorage` entry instead), and
the client promise is now cached on `import.meta.hot.data` so HMR reuses one
GoTrue instance instead of leaking a new one every reload (previously the
cause of the SDK's own "Multiple GoTrueClient instances detected" console
warning). Two `ensureGuestSession` unit tests were added ahead of Step 9's
identity linking (reusing a linked non-anonymous session; defaulting
`isAnonymous` to `false` when the field is absent). One pasted CI failure —
`tests/e2e/production-stages.spec.ts`'s animation-speed test closing its page
mid-`page.clock.runFor` — was checked and confirmed unrelated: nothing in
this step touches that file, it passed in every local run during this step,
and the same file already has one earlier, separately-fixed CI-only flake in
the same cosmetic-animation-clock family. Verified after these fixes: lint
clean, 398 unit tests, all 42 Chromium E2E tests, strict build, secret scan,
9 production smoke tests, and `npm run verify:server` (including the fixed
`test:server-e2e`) all pass.

A follow-up review caught an eleventh finding on top of those ten: fix 4
above (the dynamic import) made `createSupabaseClient` return a promise that
can reject — a flaky network fetching the lazy chunk, or a stale chunk hash
after a redeploy — and `src/main.ts`'s `void`-ed promise chain had no
`.catch` around it. `ensureGuestSession`'s own try/catch covers only the
collaborator calls made *inside* it, not the client-construction promise one
level above it in `main.ts`, so the rejection skipped straight past
`.then((client) => ensureGuestSession(...))` to an unhandled rejection —
breaking `guestSession.ts`'s own documented "this never throws" contract from
one level up, even though the game itself keeps playing (Phaser boots
independently of this chain). Neither existing suite could catch it: the
Docker-free `tests/e2e/` dev server never bundles, so there is no lazy chunk
to fail, and `tests/server-e2e/`'s network-blocking test only targets
`**/auth/v1/**`. Fixed with one `.catch` folding any rejection into
`sign-in-failed` (not `unconfigured`, reserved for "no Supabase project
configured"). A new production-smoke test blocks the SDK's own lazy chunk
(`**/assets/dist-*.js`, confirmed stable across two separate builds) against
the real optimized bundle and asserts the HUD still renders with no
`pageerror` — mutation-proven directly: reverting the `.catch` reproduces the
exact unhandled-rejection message as a `pageerror`, restoring it passes
again. Verified: lint clean, 398 unit tests, 42 Chromium E2E tests, strict
build, secret scan, 10 production smoke tests (up from 9), and
`npm run verify:server` all pass.

A third review pass caught a twelfth finding, in the eleventh's own fix: the
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

The base-game 37-step plan is finished. The server milestone is at its Step 8 gate, inside Phase 2 (Identity): Steps 1 through 7 are validated, Step 8 is implemented and awaiting validation, and Step 9 — profiles and row-level security — may not begin until the user validates it. F5 — whether to add an XSS/CSP step — is still open and was not answered at the Step 1 gate; Step 2's D1 makes it slightly more pressing now that the session credential actually exists in script-writable storage rather than only being planned there. Every other open item carries a recorded default or resolution that can be reviewed at documented cost.

1. Two workstreams are authorized, and only these two. The **server milestone**
   is at its Step 8 gate — implemented, awaiting validation, Step 9 blocked
   (`memory-bank/server-milestone-plan.md`). The **cat-role asset catalog** is
   authorized as asset preproduction only, under `art-source/`, with no runtime
   loader entry, gameplay attribute, or schema change. Everything else —
   manager gameplay, boost gameplay, gift drops, audio, Telegram integration,
   deployment — still
   needs explicit user authorization and its own ordered, test-gated plan before
   code is written. The deferred list in `memory-bank/progress.md` is a record of
   what was excluded, not a backlog to start from.
2. Two verification items survive the milestone and remain open: a physical
   mid-range Android Chrome pass, and a human playtest of the GDD's
   30-second-comprehension criterion. Neither is automatable; both were recorded
   rather than closed.
3. Playtest the provisional balance curve, especially the generated floor 5–15
   depth curve, which no human has played through. Every balance value in
   `src/config/balance.ts` remains provisional until it does.
4. Scroll response is the tightest performance margin at fifteen floors — 81.9 ms
   p95 against a 100 ms budget, per the current `performance-results/step-35-latest.json`
   — and is the first thing to re-measure if the mine
   grows or the scene graph gets heavier.
- Reviewed the Step 31 branch: lint, type-check, 274 unit tests, and 26 browser tests pass; three follow-ups were applied in place rather than deferred.
- Confirmed as deliberate that a backgrounded tab is credited at full pipeline rate while a closed one is credited through the 50% offline efficiency, so the same two-hour absence is worth about twice as much with the tab left open. Documented the asymmetry on `MAX_CATCH_UP_MS` and pinned the ratio in `tests/unit/simulation-time.test.ts`, verified by mutation to fail if either side changes.
- Extracted the `Text.setColor` repaint guard into a shared `setTextColor` helper and applied it to the mine-floor and shared-stage views, which were repainting fourteen captions per simulation tick to produce the colours already on screen.
- Recorded the measured worst-case catch-up cost — 72,000 ticks in roughly 50 ms with four floors open on a development machine — on `MAX_CATCH_UP_MS`, so a future change to the cap can weigh the resume hitch it buys.
- The analytic `calculateMineProductionRates` estimate remains route-agnostic. The live sequential elevator includes distance and weight, so deep-floor catch-up can fall below the saved offline-rate estimate; the simulation-time regression now checks broad safety bounds instead of the obsolete single-leg 2× ratio.

## Step 32A — approved layout and first animation asset pack

- Implemented the approved `art-source/spritecook-review/layout-proposal/layout1.png`
  composition inside Step 32. The shaft is 48 px wide, each floor is 288×132,
  mine content was initially 572 px tall with 168 px maximum scroll; HUD, surface, and
  mine viewport geometry remain unchanged.
- Added pure `mineFloorPanel.ts` geometry for the timer/title area, receiving
  container, unloading cat, miner patrol corridor, gold pile, far-right level
  control, and extraction track. Renderer and browser probes share this contract.
- Added the first generated pack under `public/assets/step-32a/`: cave background,
  gold container, gold pile, shaft frame, cabin, 4-frame miner walk, 4-frame
  unloader idle, and 4-frame cargo-cat idle. Sources, rejected first passes,
  prompts, deterministic outputs, GIFs, QC, and provenance remain under
  `art-source/step-32a-asset-pack/` and the public pack manifest.
- The miner walks right through its floor corridor, flips horizontally, and
  returns left on a 3.2-second cosmetic loop. The unloading cat stays at the
  floor head beside its own empty container. The cabin follows authoritative
  elevator progress while its cargo cat animates only cosmetically.
- Strict QC reports zero empty frames, output-edge contacts, and paste clamps.
  The first miner/unloader sheets failed the feet-anchor gate and were regenerated;
  accepted anchor-Y standard deviations are 0.0449, 0.0424, and 0.0299.
- Gameplay state, text, controls, and purchase behavior remain code-native. The
  pack is awaiting user visual validation and is not yet marked final production art.
- Applied the six Step 32A annotation fixes on 2026-08-31: floor extraction bars
  and duplicate `Floor N` headings are hidden; miner travel now follows
  authoritative extraction progress while walk frames stay cosmetic; queued
  gold reads as coin icon plus amount; the gold pile stays gold and is centred
  under the timber support; open-floor controls use a compact 44×50 `Level N`
  badge; and floors two onward crop the ceiling seam to half thickness while
  floor one and the surface remain unchanged. All 288 unit and 27 Chromium E2E
  tests, lint, and the production build pass. Step 33 remains blocked.
- Follow-up annotations further reduced the level control to its minimum
  thumb-safe footprint, raised the gold pile clear of the floor seam, and
  extended miner travel from the unloading cat to the pile before turning.
- A second annotation pass gives the offline-reward modal a two-decimal,
  stable-`k` formatter (`1213.12k`), restores a number-only floor badge without restoring
  `Floor N`, aligns the queue coin and amount on one baseline, and replaces the
  coarse pile with a new layout1-referenced 128×128 RGBA sprite. The visible
  level badge is now 30×34 with resolution-2 text inside an unchanged 44×50
  hit target. The revised pile passed strict sprite QC and native-scale browser
  inspection. All 290 unit and 27 Chromium E2E tests pass; Step 33 remains
  blocked pending user validation.
- The latest elevator annotations remove duplicate floor-number plaques from
  the shaft and replace instant round-robin pickup with a physical route. The
  cabin starts at the surface, stops at each unlocked floor in order, loads its
  remaining capacity on arrival, continues downward while room remains, then
  returns when full or after the deepest floor. Load increases leg duration up
  to 75% at full capacity; the cabin and cargo cat follow the same authoritative
  direction, floor, and progress. Save format version 1 is retained by encoding
  descent with non-negative legacy `roundRobinCursor` values and ascent with
  negative values. All 292 unit tests, 27 Chromium E2E tests, lint, and the
  production build pass. Step 33 remains blocked pending user validation.
- The latest visual alignment pass moves every cabin stop from the generic
  floor-slot centre to the semantic centre of that floor's gold container. The
  shaft remains 48 px wide while the cabin grows from 36 to 46 px and its cargo
  cat from 25 to 32 px, using the existing 128 px sources at a sharper readable
  scale. The number-only floor badge grows about 30%, from 26×26 with 16 px text
  to 34×34 with 21 px text, while its centre remains fixed and the separate
  `Level N` control remains unchanged. Unit geometry pins these values and
  direct browser inspection confirms the cabin/cart alignment without overlap.
  All 292 unit tests and 28 Chromium E2E tests pass with lint and production
  build. Step 33 remains blocked pending user validation.
- The latest annotation follow-up scales the number-only floor badge to exactly
  60% of its prior reviewed size: 20.4×20.4 with 12.6 px text, centred on the
  same anchor. The 30×34 visible `Level N` chrome moves 5 px right inside its
  unchanged 44×50 hit target, preserving touch safety. The browser view, all
  292 unit tests, all 28 Chromium E2E tests, lint, and the production build
  pass. Step 33 remains blocked pending user validation.
- The newest elevator/cart review adds three generated runtime assets: a
  256×256 cabin v2 with a wider interior, a larger four-frame cargo-cat v2,
  and a 256×256 gold-filled cart state. The shaft grows to 64 px, the cabin to
  62 px, and the cargo cat to 50 px while the approved floor stays 288×132.
  A pure smootherstep mapping eases the cabin into and out of every stop without
  changing authoritative route timing or production. Any positive floor queue
  switches its receiving cart from empty to filled. The number-only floor badge
  is now half of the annotated 34 px size (17×17 with 10.5 px text). Strict
  asset QC, direct browser inspection, 294 unit tests, 28 Chromium E2E tests,
  lint, and the production build pass. Step 33 remains blocked.
- The newest typography/character-scale review self-hosts Fredoka 600 and 700,
  waits for both weights before constructing the Phaser canvas, and uses only
  SemiBold/Bold game text. The redundant `Gold` and `Income /s` captions are
  empty while their icons and live values remain. Both floor-character sprite
  frames now draw at 75 px; their roughly 59% occupied frame height matches the
  50 px elevator cat's roughly 88% occupied height. Direct review at 434×934,
  296 unit tests, 28 Chromium E2E tests, lint, and build pass. Step 33 remains
  blocked.
- The surface-elevator review adds a generated 512×512 transparent headhouse
  with a visible gold hopper and a segmented right-side discharge chute. The
  cabin route now continues above the mine boundary to a fixed stop at
  `(55, 118)` inside the tower bay. A presentation-only fixed-layer twin fades
  across the camera seam; authoritative timing, load behavior, and save schema
  remain unchanged. The legacy elevator card and `Surface operations` caption
  are no longer drawn over the tower; tapping the tower retains the elevator
  upgrade action. Abbreviated whole tiers now keep one decimal (`2.0M`) across
  HUD, floor, stage, and price labels. All 296 unit tests and 29 Chromium E2E
  tests pass with lint and build. Step 33 remains blocked.
- The latest floor-continuity review decouples the far-right gold mound from
  queue fullness: every unlocked floor always draws the approved mound at a
  fixed 52×52 display size, while only the left receiving cart swaps between
  empty and filled states. `materialPileSteps` remains an authoritative
  diagnostic and no longer scales or hides the environmental art. Floor-slot
  gap is now zero, so four 288×132 slots plus 10 px top/bottom padding produce
  548 px of mine content and 144 px maximum scroll. Direct canvas inspection,
  296 unit tests, 29 Chromium E2E tests, lint, and build pass. Step 33 remains
  blocked.
- The latest surface-warehouse review replaces the remaining warehouse card
  with an original 512×512 open loading depot and a strict four-frame warehouse
  supervisor idle sheet. The building is the warehouse upgrade target; its
  hidden `SharedStageView` remains the authoritative read-back/purchase model.
  The supervisor is presentation-only and does not introduce the deferred
  gameplay Manager system. Because the elevator tower includes a right-side
  chute, its semantic cabin bay is left of the texture's full-image centre; the
  surface stop moves from `(55, 118)` to `(48, 118)` to align with that bay.
  Direct canvas inspection, 298 unit tests, all 29 Chromium E2E tests, lint,
  build, and diff checks pass.
- The newest alignment review removes the final diagonal surface movement.
  Cabin X is now the shared shaft axis `36` for every underground and surface
  pose; the tower moves 12 px left so its bay, rather than its asymmetric
  texture centre, sits on that same axis. The warehouse display shrinks from
  164×158 to 140×140, is flush with the right edge at x=360, and its 56 px
  supervisor is mirrored to look left toward the production flow. Direct
  browser review, 298 unit tests, all 29 Chromium E2E tests, lint, and build
  pass. Save/database schema version 1 is unchanged.
- The shared-stage upgrade affordance review adds explicit compact `Level N`
  badges to both surface assets. Warehouse chrome is centred above the roof;
  elevator chrome sits immediately right of the discharge tray, level with or
  slightly above it. Each keeps 30×34 visible chrome inside a 44×50 touch
  region and routes through the existing elevator/warehouse purchase command.
  Elevator tower v2 adds a steel-blue mounting bracket for that badge without
  baking functional text into the raster. Direct mobile-browser review, strict
  asset QC, 299 unit tests, all 29 Chromium E2E tests, lint, and build pass.
  Save/database schema version 1 remains unchanged.
- The surface-delivery annotation follow-up moves the elevator level hit region
  from `(124,58,44,50)` to `(106,53,44,50)`, placing its 30×34 visible chrome
  immediately beside the discharge outlet and slightly above the tray bottom.
  Two new strict four-frame sheets add a right-facing worker cat and a vertical
  gold-pour effect. A presentation-only 5.2-second loop parks an empty cart at
  x=112 beneath the chute, shows the pour only while shared-stage material is
  available, eases the filled cart toward the warehouse at x=220, unloads, and
  returns empty with the cat mirrored. The loop reads snapshot state but never
  writes production, gold, save data, or schema. Direct browser review, 304
  unit tests, the targeted Chromium regression, lint, build, and diff checks
  pass; all 30 Chromium E2E tests pass.
- The latest surface polish locks both empty and filled delivery-cart textures
  to the same 46×46 display box after every runtime texture swap, fixing the
  128 px empty source and 256 px filled source from visibly changing scale.
  The elevator badge moves another 5 px up to `(106,48,44,50)`. A new original
  720×328 blue-sky landscape plate renders at 360×164 behind the tower,
  delivery route, and warehouse while the existing ground strip stays in
  front. Native browser review confirms the empty/filled cart size, sky
  composition, and raised badge. The landscape passes exact-size raster QA;
  304 unit tests, all 30 Chromium E2E tests, lint, build, and diff checks pass.
  Save/database schema version 1 remains unchanged and Step 33 stays blocked.
- The latest warehouse-hauler crew pass keeps one lead cat at every level and
  reveals one pooled assistant at warehouse levels `10/20/.../100`, producing
  2/3/.../11 visible cats. Ten assistants reuse the current strict hauler sheet,
  vary their cosmetic frames, and follow the same cart in two shallow mirrored
  rows so they do not stack exactly. Count and formation remain pure view-model
  logic; throughput, economy, authoritative/save state, IndexedDB schema
  version 1, and the Step 33 gate are unchanged. All 307 unit tests and 31
  Chromium E2E tests pass.
- The latest motion/notation pass replaces the assistant formation's copied
  lead transform with evenly phase-shifted route poses. At Warehouse level 10,
  live canvas diagnostics show the lead at x≈85 facing right while its assistant
  is near x≈256 facing left, with separate frames and a 10 px lane offset. The
  shared amount-tier resolver now uses lowercase `k/m/b/t/qa/qi/sx/sp/oc/no/dc`
  and starts `aa` at `10^36`; the offline reward overlay shares the same tiers
  while retaining its two-decimal precision. Economy, save schema version 1,
  and Step 33 remain unchanged. All 309 unit tests and 31 Chromium E2E tests
  pass.
- The latest HUD/crew annotation pass gives every visible surface transport
  cat its own pooled 46×46 cart bound to that cat's independent route pose.
  The centre HUD slot now shows authoritative `elevator.carriedMaterial` with
  an elevator icon, while the shared formatter retains two decimal places on
  main-screen non-integer and abbreviated values (`3.40m`, `203.40`). Core
  throughput, economy, save document version 1, IndexedDB schema version 1,
  and the Step 33 gate remain unchanged.
- The latest mine-floor crew annotation pass gives every unlocked floor one
  base miner and adds one pooled assistant at levels 50/100/150/200, producing
  1/2/3/4/5 visible miners and holding five above level 200. Assistants share
  authoritative extraction progress but use separate patrol phases, shallow
  lanes, facings, and cosmetic frames. The rule is identical for all four
  floor views and remains presentation-only: extraction throughput, economy,
  save document version 1, IndexedDB schema version 1, and the Step 33 gate are
  unchanged. All 313 unit tests and 32 Chromium E2E tests pass with lint and
  production build.
- The user validated Step 32/32A and authorized Step 33 on 2026-09-02.
- Step 33 added `tests/e2e/player-journey.spec.ts`, which runs the same real-UI
  journey twice in separate clean browser contexts. Each run earns gold through
  controlled wall-clock progression, buys mine-shaft/elevator/warehouse levels,
  opens floors 2 and 3, reaches a level-10 milestone, persists the newest state,
  reloads, claims a one-hour offline reward, reloads again, and proves the
  interval cannot be claimed twice. Both runs must match the policy-derived
  version-1 documents exactly and emit no console or page errors.
- Step 33 exposed a long-run precision defect: repeated fractional elevator
  pickups could accumulate `totalTransported` one final digit above
  `totalExtracted` (about `1e-10` after six minutes), causing a legitimate save
  to fail validation. Elevator pickup now clamps the accumulated transport total
  to its authoritative extracted upper bound, and a ten-minute regression keeps
  the full economy progression saveable.
- Step 33 automated evidence: 314 unit tests, 33 Chromium E2E tests, lint,
  production build, and `git diff --check` pass. Step 34 remains untouched.
- The user authorized Step 34 on 2026-09-02 and explicitly required work to
  stop before Step 35.
- Step 34 now advances authoritative state to the lifecycle event's injected
  wall-clock boundary before creating the hidden/pagehide document. This closes
  a gap where `savedAtTimestampMs` could consume the final foreground interval
  without simulating it or leaving it eligible for offline income.
- Added a validated synchronous lifecycle journal at localStorage key
  `cat-mine-idle:lifecycle-save-v1`. IndexedDB remains authoritative; the
  journal only protects a pagehide write from document teardown, is selected
  only when it is a newer valid version-1 document, and is cleared after the
  same-or-newer snapshot reaches IndexedDB.
- Added `tests/e2e/lifecycle-persistence.spec.ts`: one controlled-clock scenario
  proves hidden/visible play matches an uninterrupted 50-second session exactly;
  another performs real abrupt navigation, recovers the journal, settles the
  30-second offline interval before presenting it, claims once, and reloads
  without duplication or browser errors.
- Step 34 automated evidence: 318 unit tests, 35 Chromium E2E tests, lint,
  strict production build, and `git diff --check` pass. Save document and
  IndexedDB schema versions remain 1.
- The user validated Step 34 and authorized Step 35 on 2026-09-03, explicitly
  requiring work to stop before Step 36.
- Step 35 adds an optimized-build Google Chrome benchmark using a Pixel 5
  profile, Android 11 user agent, 393×727 viewport, DPR 2.75, and 4× CPU
  throttling. Benchmark-only object/floor/input diagnostics are statically
  removed from ordinary production builds.
- A first Step 35 implementation published the scene-graph size once from
  `create` and read it back after ten minutes, reporting it as constant. That
  was a boot-time value re-read from a static attribute, not a trend, so the
  object-count metric could not have detected growth at all. The scene now
  republishes its live object count and unlocked-floor count twice a second
  behind the profiling flag, the benchmark samples both alongside every heap
  sample, and it asserts the sampled minimum equals the maximum.
- The benchmark now also asserts four unlocked floors before sampling and again
  at the end. A seeded save that failed validation would recover into a fresh
  single-floor state, and every budget would otherwise pass while profiling the
  wrong mine.
- The required ten-minute all-four-floor run passed with 8.33 ms mean, 9.2 ms
  p95, 9.3 ms p99, and 16.0 ms maximum frame time across 72,188 frames, with no
  frame above 33.34 ms. The host presented at 120 Hz, so the sampler's raw
  120.01 FPS figure reports presentation cadence, not a game ceiling; the
  meaningful result is roughly two times headroom against the 16.67 ms budget
  the 60 FPS target implies. An earlier run of the same benchmark at 60 Hz
  measured 16.67 ms mean / 17.8 ms maximum, the same conclusion.
- Post-GC live heap changed by 155,360 bytes with a -502 bytes/s post-warm-up
  slope. Phaser objects held at 258 across all twenty samples, unlocked floors
  at 4, DOM nodes at 176, listeners at 160, and scroll response measured
  50.1 ms p95 / 52.5 ms maximum.
- The optimized output measured 3,887,708 bytes total, including 2,200,266
  image bytes and 95,720 font bytes; first-load resource transfer accounting
  was 2,343,440 bytes. Startup reached the booted scene in 819 ms. The main JS
  chunk remains 1,557,900 bytes raw (about 414 kB gzip) and is recorded as a
  future startup/code-splitting observation rather than an active frame-time
  bottleneck.
- No Android/ADB target was connected, so this is reproducible Pixel 5
  emulation in desktop Chrome, not physical mid-range Android evidence. The
  physical-device pass remains the user-validation caveat. Repeated miners,
  haulers, carts, and effects were already pooled and the sampled object count
  never moved, so no speculative runtime rewrite was justified by the profile.
  The one per-frame allocation left by design is `catchUpSimulation` returning
  a new immutable state each frame; the negative heap slope shows the collector
  absorbs it, and removing it would cost the core its determinism.
- Step 35 verification also passes 318 unit tests, all 35 Chromium E2E tests,
  lint, the ordinary production build with profiler hooks absent, and
  `git diff --check`. Save document and IndexedDB schema versions remain 1.

- The user validated Step 35 and authorized Step 36 on 2026-09-03, explicitly
  requiring work to stop before Step 37. The outstanding physical mid-range
  Android pass stays recorded as a caveat rather than a blocking gate.
- Step 36 adds `vite.config.ts`, which declares the `/` deployment base path.
  Vite already defaulted to it, but the runtime requests every texture through
  absolute `/assets/...` paths that no bundler rewrites, so a prefixed base
  would emit the bundle under the prefix while the loader kept asking the root.
  The base is a deployment contract and is now written down and asserted.
- Added `playwright.production.config.ts` and
  `tests/production/production-smoke.spec.ts`: nine tests that build `dist/`,
  serve it through `vite preview` at `127.0.0.1:4175`, and verify the served
  bundle rather than the development server.
- The smoke suite pins all four Step 36 concerns. Asset loading: every path in
  `PLACEHOLDER_ASSETS` and `PLACEHOLDER_ANIMATION_ASSETS` plus both self-hosted
  Fredoka weights return success, no request fails, and no response is 4xx/5xx.
  Save behavior: a controlled 40-second session flushed at a `visibilitychange`
  boundary must equal the document derived in the test process, a reload at the
  same instant must re-settle that identical document, and a further 20 seconds
  must continue from the deserialized saved state. Error handling: corrupt and
  unsupported payloads each recover into a playable fresh game with a visible
  notice and no uncaught error, and a browser whose `indexedDB.open` throws
  still boots and keeps rendering. Responsive layout: canvas and all three
  logical regions stay inside four representative viewports.
- The suite also proves it is testing the shipped artefact: every document
  entry resolves under `/assets/`, nothing is served from `/src/`, and the
  dev-only rendered-state read-backs and opt-in profiler attributes are absent.
  Because those diagnostics are stripped, the production evidence for actual
  rendering is a pixel probe of the canvas backing store rather than a dataset
  attribute.
- Two production-only test techniques were needed. The hashed entry cannot be
  rewritten the way the dev-server suites fulfil `/src/main.ts`, so the injected
  clock is installed through an init script that routes `Date.now` via
  `window.name`. And an invalid save is seeded during a navigation whose bundle
  is blocked, because a page that boots flushes a valid document over the
  fixture at its next lifecycle boundary before the recovery path can see it.
- Step 36 exposed a real gap rather than only confirming the build. Steps 21
  and 22 required a visible diagnostic and a recorded warning, the core produced
  both, and every unit test passed — but `src/main.ts` never passed
  `loadActiveGame`'s `onWarning` or the coordinator's `onDiagnostic`, so a
  player whose save was rejected silently restarted with no explanation. Added
  `src/ui/SaveDiagnosticBanner.ts`, a non-blocking dismissible notice shared by
  both callbacks, de-duplicated by code because a broken storage backend reports
  a failed write on every debounce. Removing the wiring fails exactly the three
  new error-handling tests, which was verified by mutation.
- Added `npm run test:prod` and `npm run verify`; the latter runs lint, unit
  tests, E2E tests, the production build, and the production smoke suite in the
  order Step 36 specifies.
- Step 36 automated evidence: 318 unit tests, 35 Chromium E2E tests, all nine
  production smoke tests, lint, the strict production build, and
  `git diff --check` pass. Save document and IndexedDB schema versions remain 1.

The newest tower-empty feedback is complete and recorded immediately: every surface delivery visual now reads only `warehouse.inputQueue` through `warehouse.queueSteps > 0`. Elevator cargo can no longer make the chute pour, a cart fill, or a hauler carry gold before the cabin actually delivers to the tower. A browser regression holds elevator cargo in transit while forcing the tower queue to zero and proves both sampled poses keep the empty tower/cart textures and hide the pour; the two focused surface-cart browser tests pass. Save document and IndexedDB schema versions remain 1.

The mine-floor popup feedback is also complete and recorded immediately. A Level badge now opens an accessible DOM detail dialog without purchasing; it shows current level, output/cycle, cycle time, waiting gold, next output, and x1/x5/MAX CTAs derived from exact core batch quotes. Batch purchases are atomic, preserve production state, persist once, and rebind the open dialog immediately. Phaser input is disabled while the popup is visible after regression testing exposed a close-button gesture reaching the warehouse underneath. Final evidence: lint, 327 unit tests, all 40 Chromium E2E flows, the strict production build, all nine optimized-bundle smoke tests, and `git diff --check` pass. Direct in-app browser review at `http://localhost:5174/` confirms the responsive popup, correct four attributes, x1/x5/MAX prices, an x5 transition from Level 1 to Level 6, an unchanged warehouse level (no click-through), and no console errors. Save document and IndexedDB schemas remain version 1; no database fields changed.

The elevator-tower Level feedback is complete and recorded immediately. Its badge/building now opens the same blocking detail dialog without spending gold, showing current tower level, capacity, cycle time, cargo in transit, and next capacity. Exact geometric x1/x5/MAX quotes feed one atomic shared-stage batch command; successful batches retain route progress, cargo, and round-robin cursor and persist once. Focused core and view-model regressions pass. Save document and IndexedDB schemas remain version 1; no database fields changed.

The warehouse Level feedback is now complete and recorded separately. Its badge/building opens the shared dialog with authoritative level, capacity per conversion cycle, 1.2 s cycle time, `warehouse.inputQueue` as Gold queued, and next capacity. Its x1/x5/MAX choices use the same exact core batch path and preserve input queue, conversion progress, and delivered totals. Focused shared-stage core/view-model tests pass. Save document and IndexedDB schemas remain version 1; no database fields changed.

Final shared-popup validation passes: lint, strict build, 332 unit tests, all 41 Chromium E2E flows, nine optimized-bundle smoke tests, and `git diff --check`. Direct in-app review confirms elevator x1 Level 78→79, warehouse x5 Level 44→49, live attribute/price refresh, disabled unaffordable actions, and no browser errors. The game-ui-ux guidance kept one responsive modal and explicit background-input ownership; Phaser guidance kept all economy decisions in the deterministic core rather than scene callbacks.

The first follow-up review finding is complete and recorded immediately: `calculateMaxAffordableMineShaftUpgradeQuantity` once again validates that the floor state and balance config IDs match before using the shared MAX search. A focused regression proves mismatched floor/config input throws rather than silently quoting another floor's costs. Save and database schemas remain version 1.

The second follow-up review finding is complete and recorded immediately: the shared popup entry point now rejects any pointer release whose gesture crossed the existing drag threshold. This covers mine floors, the elevator tower, and the warehouse uniformly. A Chromium regression drags within the elevator Level hit area, exceeds the threshold, and proves the modal stays hidden while the mine remains unscrolled. Save and database schemas remain version 1.

The third review finding is complete and recorded immediately: `techContext.md` now reports the current 332-unit/41-E2E baseline and explicitly includes shared-stage batch quotes and shared popup drag rejection instead of the stale 327-unit floor-only wording.

The empty-tower hauler-loop feedback is complete and recorded immediately. The lead worker and every level-derived assistant now run the same phase-shifted 5.2-second collection, outbound, warehouse-stop, and return route even when `warehouse.inputQueue` is zero. Queue state controls only cargo feedback: an empty tower keeps every cart empty and suppresses the gold pour throughout the moving loop. Focused animation unit tests and the empty-tower Chromium regression pass. This remains presentation-only; economy, save document, and database schemas stay version 1.

Final review evidence for this feedback passes: lint, strict production build, 332 unit tests, 41 Chromium E2E flows, nine optimized-bundle smoke tests, and `git diff --check`. The controlled empty-queue browser fixture proves both worker and cart change X while every cart remains empty and the pour stays hidden. The live in-app tab also shows synchronized cat/cart travel after hot reload with zero console errors. The game-feel guidance kept this continuous eased motion cosmetic and isolated from authoritative throughput.

The blurred elevator-shaft connector feedback is complete and recorded immediately. The 192×528 shaft artwork is no longer stretched vertically to the 1,980-pixel fifteen-floor depth. `BootScene` now renders it as a 64×1,980 `TileSprite`, scales only X by exactly one third, keeps Y at native scale 1, and repeats the 528-pixel artwork. A browser regression reads those rendered tile dimensions back, and direct in-app inspection confirms the rails and braces remain crisp. This is presentation-only; authoritative state and both schema versions remain unchanged.

Final shaft-fix validation passes: lint, strict build, 332 unit tests, all 41 Chromium E2E flows, nine production-bundle smoke tests, and clean diff whitespace. The in-app tab remains open on the hot-reloaded build and its development read-back reports `width=64`, `height=1980`, `tileScaleX=1/3`, `tileScaleY=1`, `tileHeight=528`.

The many-floor miner-stutter feedback is complete and recorded immediately. Profiling evidence still shows the fifteen-floor scene holding 60 FPS; inspection found visual quantization instead: authoritative extraction advances in 100 ms fixed steps, so miner X previously snapped at roughly 10 Hz. Each `MineFloorView` now interpolates forward from its currently rendered progress to the newest authoritative target across exactly one simulation step, including a smooth normalized wrap, then stops at the target if the core stops. Unit regressions cover mid-step, completion, overshoot, wrap, and invalid input; the focused floor-render browser fixture passes. Economy and schema versions remain unchanged.

The scrolled deep-elevator route feedback is complete and recorded immediately. The surface stop was incorrectly converted with `scrollY`, so scrolling deeper moved the elevator's physical world endpoint and shortened an ascending trip. `BootScene` now keeps the top-of-shaft world coordinate fixed at `SURFACE_ELEVATOR_STOP_Y - SURFACE_HEIGHT`; the fixed surface twin maps directly from that same world route without subtracting camera scroll. A browser regression starts a loaded return from floor 11, scrolls the mine, and proves both route coordinates stay unchanged. Camera position now affects only visibility, never elevator travel. Core route, economy, saves, and schema versions remain unchanged.

Final validation for the miner/elevator feedback passes: lint, strict build, 335 unit tests, all 42 Chromium E2E flows, nine production-bundle smoke tests, and `git diff --check`. The repeated ten-minute all-floor benchmark reports 60.000 FPS, 17.6 ms p95, 17.8 ms max, zero over-budget frames, 665 constant Phaser objects, +229,928 live-heap bytes with a 188 B/s trend, and 81.9 ms scroll p95. Direct in-app review at `scrollY=560` shows the fixed world route/surface twin with no console errors or warnings.


## Step 30–32 implementation records (were filed under `Active Decisions`)

- Review of the Step 30 implementation found no defect, but one untested path: the shaft-upgrade control on a floor that was just opened occupies the exact rectangle the unlock control had, and nothing pressed it. Sharing one slot rests on Phaser skipping invisible objects when hit-testing, so the behaviour was pinned by a test rather than left to that mechanism: the browser test now asserts the two controls report the same screen rectangle, that the opened shaft is affordable, and that a press there buys a shaft level.
- Mutation-verified: offsetting the unlock control out of the shared slot fails the new bounds assertion by name, and routing an upgrade press to the unlock handler fails with the press never reaching the scene.
- Three review cleanups with no behaviour change. `createPurchaseControlViewModel` became `createUpgradeControlViewModel`, because the generically named factory only ever produced the `Upgrade` caption while its sibling was specific. `RenderedFloorState.isUnlockRequirementUnmet` became `isUnlockRequirementMet`, so the read-back and the view model state the flag in one sense; the two browser assertions that read it prove the met and unmet colours still differ. The feedback-map expiry comment no longer implies an unbounded map: it is keyed by control and bounded either way, and the reason to expire it directly is that collection should not depend on what is currently on screen.
- Mutation-verified: inverting the requirement colour fails the polarity assertion by name.
- Added a pure mine scroll and gesture model (`src/game/view-model/mineScroll.ts`): travel clamped to the content that does not fit, one-pixel-per-pixel dragging from the press anchor, wheel scrolling accepted only over the mine, and a six-pixel threshold separating a tap from a scroll.
- `BootScene` binds scene-wide pointer and wheel handlers rather than a draggable object, because the mine is dragged from anywhere over it including its own buttons, and applies the resulting `scrollY` to the mine camera alone. Phaser hit-tests through that same camera and honours both its scroll and each object's camera filter, so the controls' pressable rectangles follow the scrolled content with no extra bookkeeping.
- The surface strip grew from 140 to 164 logical pixels so each stage panel can end in a 44-pixel upgrade control; mine floor controls grew from 92×32 to 92×44. `MIN_TOUCH_TARGET_PX` and `assertTouchTargetRegion` live in the pure layout module and every `PurchaseControlView` asserts its own region at construction, so an undersized button throws on the frame it is built. Eight mine pixel probes in three existing browser specs moved down by the 24 pixels the strip gained.
- `#game-viewport canvas` sets `touch-action: none`: Phaser's touch listeners are non-passive and do call `preventDefault`, but a browser that has already started panning the page cannot have the gesture taken back.
- `PublishedPurchaseControl` gained `isPressable`. A floor control scrolled out of the mine viewport is clipped away and hit-tested by no camera, so its published rectangle would otherwise invite a press that lands on whatever took its place.
- Step 31 automated evidence: two hundred seventy-three unit tests and twenty-six Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Twenty new unit tests cover the scroll range and its rejections, one-to-one dragging, clamping at both ends, the threshold in both directions, a pointer that wanders outside the mine mid-drag, a swipe that began on a fixed layer, a second finger that did not start the gesture, tap suppression surviving the release and clearing on the next press, suppression after a swipe that could not scroll, wheel clamping and region gating, and the read-back. Six new layout tests cover region containment and the touch-target minimum.
- Step 31 browser flow: seven Playwright tests at a 390×844 phone viewport, on a clock pinned so no gold is produced and every observed change came from a gesture. A drag scrolls the mine to its clamped maximum and back to zero; the HUD pixel is unchanged, the bottom of the mine comes into view as a pixel change from panel to mine background, floor controls move by exactly the scroll distance and the shared stages do not move at all. A drag started on an affordable button scrolls the mine and leaves gold, levels, and even the control's own feedback untouched. A swipe from the surface strip that lifts on a floor's button buys nothing. A tap buys before scrolling, and after scrolling to the bottom a press buys from floor 4's control, which reported `isPressable: false` before the scroll and true after. A press that wobbles by less than the threshold still buys and scrolls nothing. The wheel is refused over the HUD and clamps at both ends over the mine. Every published control measures at least 44×44 and the canvas owns its touch gestures.
- Step 31 mutation verification: nine mutations fail with named assertions — dropping the tap suppression (`a scroll must not spend gold`), publishing bounds that ignore the camera scroll (`a floor control moves with the content it is drawn on`, plus the reveal assertion), a zero drag threshold (`a wobbling tap must still buy one level` and two unit tests), a camera that never follows the scroll state (`the bottom of the mine must come into view`), a wheel that ignores the mine region (`a wheel over the HUD must not scroll the mine`), `isPressable` reduced to visibility (`the deepest floor starts below the mine viewport`), a 20-pixel shared-stage control (the boot-time touch-target assertion), removing `touch-action` (`the canvas must own its touch gestures`), and suppressing a tap only for gestures that began over the mine (`a swipe must not spend gold`).
- Review of the first Step 31 implementation found one defect: only a press that began over the mine was tracked, so a swipe that started on the surface strip and lifted on a floor's button still bought a level — an accidental purchase from a gesture, which is exactly what the step forbids. Every press is now tracked; whether it scrolls and whether it stays a tap became two separate questions. A browser test drives that swipe, and the mutation above pins it.
- A Step 31 test defect worth recording: the browser fixture routes `/src/main.ts` to its own module, which does not import `src/style.css` unless it says so. A `touch-action` assertion therefore read `auto` against a stylesheet that had never loaded. The fixture now imports the stylesheet, which also boots it closer to the real application.
- Step 32 implemented an original clean-HD cartoon placeholder family through the `create-game-assets`, `generate2dsprite`, and built-in image-generation workflows. Nine generated 128×128 RGBA sprites distinguish the cat miner, elevator, warehouse, gold pile, padlock, upgrade arrow, gold coin, mine cart, and ore crate; their prompt, raw source, processed sheet, QC metadata, art-direction brief, and provenance manifest are retained in the repository.
- `BootScene.preload` now loads the semantic placeholder manifest before any view is constructed. `HudView`, `MineFloorView`, `SharedStageView`, and `PurchaseControlView` use the generated family while English labels, values, progress bars, touch hit areas, affordability, and feedback remain code-native.
- The palette now matches the generated navy/steel-blue/teal/warm-gold family. Ordinary queued gold retains its illustrated sprite, while a backed-up pile or crate swaps to a red silhouette generated once at boot from the same artwork; generated art remains cosmetic and never enters authoritative state.
- Step 32 visual review passed at an exact 360×640 viewport and a reduced 320×568 phone viewport with all required objects distinguishable and no browser warnings or errors. Strict sprite QC reports 128×128 RGBA output with usable alpha; two visually complete source-cell contacts were explicitly accepted while output-edge contact and paste clamping remain absent.
- Step 32 automated evidence: 278 unit tests and 27 Chromium E2E tests pass, including provenance/dimension checks for every runtime asset and real framebuffer probes updated to prove generated gold and backlog silhouettes render under both the WebGL and the Canvas renderer. Lint, strict production build, and asset alpha/size reporting pass.
- A code review of the Step 32 change corrected six defects before the gate: the backlog cue was a WebGL-only fill tint and vanished on a Canvas fallback, so it is now a boot-generated recoloured texture; `describeRenderedState` had started echoing cached snapshot fields, so pile size and backlog state are measured back off the drawn sprite again; the stacked purchase control overlapped its icon with its action label; `PurchaseControlView.#render` called the unguarded `setTexture` every frame; a second finger stole a live scroll gesture and froze the mine mid-drag; and foreground progress was persisted only by a purchase or a lifecycle flush, so a 30-second save heartbeat now covers a webview killed without `pagehide`.
