# Active Context

## Current Focus

**Asset catalog update, 2026-09-19.** The SR+ animation policy is now applied
to Mofy (`elevator-cargo-cat:SSR`): an exact 4×2 sheet with eight 128×128
frames at 110 ms each. The processed sheet passed strict raster QC with zero
empty, edge-touch, or clamped frames; body-scale CV is 0.01158 and anchor-Y
standard deviation is 0.00076. This remains asset-only and is not runtime
integrated. `public/assets/marketplace/mofy.png` stays a single extracted idle
frame for the existing portrait consumer.

**Marketplace asset implementation, Phase 0 complete 2026-09-19.** The role
taxonomy gate is now recorded in
`art-source/cat-role-catalog/marketplace-role-matrix.json`: v1 contains
Elevator, Warehouse, and a dedicated Miner family; Unloader remains a separate
future role. The matrix pins the four v1 attributes, role weights, runtime
display sizes, and the 2×2/4-frame versus 4×2/8-frame animation policy. Phase 0
verification passed the focused role-matrix suite (6 tests), all 702 unit
tests, lint, build, and the three Marketplace browser tests. Phase 1 completed
2026-09-19: four canonical preview portraits now have stable allowlisted asset
IDs and `128×128` RGBA public paths; its registry suite (4 tests), full unit
suite (706 tests), lint, build, Marketplace E2E (3 tests), asset reports, and
contact-sheet/native-scale review all passed. Phase 2 completed 2026-09-19:
the SVG icon family and manifest now cover three roles, four attributes, three
skills, and six color-independent lifecycle states. Its registry suite (4
tests), full unit suite (710 tests), lint, build, Marketplace E2E (3 tests),
icon-render E2E (1 test), and native 24/32px screenshot review all passed.
Phase 3 completed 2026-09-19: the preview catalog now has nine stable
allowlisted portraits across Elevator (Mofy, Elon, Win), Warehouse (Baron,
Cipher, Gauge, Nautilus), and the new dedicated Miner family (Mica N and Forge
SSR). Mica and Forge were generated as original 2×2/4-frame candidates,
processed to exact 128×128 RGBA frames, and passed strict raster QC with zero
empty, edge-touch, or clamped frames. The registry and manifest now carry role,
rarity, provenance, and preview-only metadata; runtime integration remains
false. The catalog contact sheet was reviewed at native scale, the asset report
passed for all nine public portraits, and the full 710-test unit suite passed.
Phase 4 completed 2026-09-19: all approved v1 premium rows now have exact
4×2/8-frame 128×128 families at 110 ms (Mofy, Win, Elon, Baron, Cipher, Gauge,
Nautilus, and Forge). The seven missing families were deterministic
ping-pong reconstructions from QC-passed 4-frame candidates; every strict
processor run has zero empty, edge-touch, and clamped frames. Mica remains the
deliberate N baseline on 2×2/4. Phase 5 completed 2026-09-19: Marketplace
cards/details now use the allowlisted asset registry, the nine canonical
portraits, role/attribute/skill/state icons, preview stat fixtures, and a safe
placeholder fallback. Browser flows pass at 390×844 and 320×568, including a
failed-image fallback. Premium sheets remain source-only and are not decoded at
modal open.
Phase 6 completed 2026-09-19: a UI-only lifecycle contract now maps Idle,
Assigned, Listed, Rented, Expired, and Locked to approved state icons,
descriptions, and non-conflicting CTA permissions. The Listed card/detail path
uses this contract; it never writes ownership, save, or transaction state.
State contract tests, 715 full unit tests, lint, build, and six browser tests
pass. Phase 7 runtime integration is optional and requires explicit approval.

**Server milestone, at the Step 29 validation gate — Step 29 (leaderboard
display) was implemented on 2026-09-19 and is awaiting user validation. Step 31
is also implemented but remains unvalidated; Step 32 has not started and must
remain blocked.**

Step 29 adds the public `leaderboard-read` Edge Function and the Rewards-tab
leaderboard modal. Public requests receive the top lifetime-gold rows; an
optional valid bearer token also receives the caller's own rank without any
`user_id` leaving the server. Because the local Edge Runtime produced incorrect
results for `count: 'exact', head: true` rank predicates, the authenticated
rank path now reads the indexed ranking rows in pages and applies the same
metric-desc/updated-at-asc ordering in server code. The client preserves exact
`GameNumber` strings for `formatAmount` and falls back to an offline state with
retry when the read is unavailable.

**Proof.** The function has 7 Deno unit tests; the live integration suite has
3 passing tests for public exact values, authenticated rank outside the visible
limit, and invalid-token rejection. Client unit tests cover all magnitude tiers,
`npm run build` and `npm run lint` pass, and the focused browser smoke confirms
the Rewards tab opens and closes the modal. The modal remains a validation-gate
change; no acceptance-gate archive entry has been added.

Step 31 reuses the `entitlements` table and RLS already landed in Step 3; no
migration was needed. The server-owned key is `cosmetic.supporter_badge`.
`entitlement-check` verifies the bearer token, reads only active own rows
through the caller-scoped Supabase client, and returns the derived
`effects.supporterBadge` flag. It never reads the service-role key, and there
is no client-accessible grant route. Its validation gate remains open.

**Previously, Step 30 (decide on friends) was handled as a documentation-only
deferral on 2026-09-19.** The verified all-time leaderboard is enough for the
current asynchronous social goal; a friend graph remains deferred until a
product requirement defines discovery, privacy, moderation, and deletion.

Step 28's own instructions: "Publish an entry only from a save that passed
Step 23. A rejected or unvalidated save must never reach the board." The
write lives on exactly one path — `handleSaveUpload`'s accept branch in
`supabase/functions/save-sync/index.ts`, after the row and its `save_audit`
row are both already recorded; every reject branch (`save_invalid`,
`save_rejected`, `revision_conflict`, size/rate refusals, `server_error`)
returns before that call site, which is what "never reaches the board" means
concretely — there is no separate check to bypass. Metric and magnitude come
from Step 27's own pure functions
(`calculateLifetimeGoldEarned`, `toLeaderboardMagnitude`) run against the
just-accepted document; `source_revision` is that same write's own resulting
`saves.revision`, never client-supplied; `display_name` is read from the
caller's own `profiles.display_name` through their own bearer token
(`profiles_select_own` already admits it). The write is a third,
best-effort service-role use in this function —
`admin.from('leaderboard_entries').upsert(...)`, keyed on the table's own
primary key (`board_key`, `user_id`) — best-effort exactly like Step 24's
`save_audit` write, so a publish failure (computing the metric, reading the
display name, or the write itself) is logged and swallowed and can never turn
an accepted upload into a rejected one or lose the player's save. A
zero-or-negative lifetime-gold-earned total — a brand-new account's first
save — makes `toLeaderboardMagnitude` throw by design (Step 27); the same
catch turns that into "publishes nothing yet" rather than an error on an
otherwise-good upload.

**Proof.** `supabase/functions/save-sync/index.test.ts` (fakes, no live
database) covers every branch: an accepted save publishes exactly once, keyed
to the resulting revision, carrying the caller's looked-up display name; a
Step 23 bound violation, a revision conflict, and a validation failure each
publish nothing; a publish-side failure still returns `200`; a fresh,
zero-lifetime-gold account publishes nothing without raising.
`tests/unit/server-stack.test.ts` extends its existing `save-sync`
service-role assertion with the new `leaderboard_entries` upsert line, and
keeps pinning that `saves`' own compare-and-swap still carries no `upsert` of
its own — the Step 15 finding stays fixed even as a different table's writer
legitimately gains one.
`tests/server-integration/leaderboard-publish.integration.test.ts` proves the
same contract against the real Edge Function and the real table: an accepted
upload publishes one row with the correct metric, revision, and board key,
carrying the caller's own `profiles.display_name`; a save Step 23 rejects
leaves the prior accepted entry completely untouched; and a second accepted
upload from the same user overwrites that one row rather than duplicating it.
`leaderboard_entries`' insert/update/delete refusal for both client roles was
already exhaustively covered by Step 26's migration-derived RLS matrix
(`adversarial-rls.integration.test.ts`), so it is not re-proven here. See
`architecture.md`'s Step 28 section for the full design reasoning.

**Local build/test verification for this step is pending the validation
gate's own run** — the implementing sandbox for this step could not run
`npm install` (a hard sandbox restriction, not a project issue), so
`npm run verify` / `npm run verify:server` numbers for Step 28 are not
recorded here; they will be captured when this gate is actually validated.

**Player-facing account/settings feedback (2026-09-19).** The top HUD now
has a settings button. Its accessible modal shows guest or Google-linked
identity details, app version, and the appropriate Google login or logout/reset
action. Genuine local/cloud forks open the same modal with both save summaries;
the selected branch is persisted safely before reload, while the replica stays
stopped until the choice is complete. Local verification passes build, lint,
690 unit tests, and the in-app browser smoke check.

**Previously, at the Step 27 validation gate — Step 27 (leaderboard storage)
implemented 2026-09-18, validated and merged; Step 28 was released against
it.**

Step 27's own instructions: "Add the leaderboard table using the Step 3
magnitude-plus-exact representation, with the indexes its queries need.
Decide the metric, the reset period if any, and the tie-break." **No table,
index, or RLS change was needed** — `public.leaderboard_entries`, its rank
index, and its RLS/grant matrix all shipped in Step 3/5, built
metric-agnostic on purpose. Step 27's actual job was the three decisions:
metric = lifetime gold earned (`totalGoldDelivered +
totalOfflineGoldClaimed`, never current spendable `gold`); board = one,
all-time, `board_key = 'lifetime-gold'`; tie-break = ascending `updated_at`
(earliest to reach the score ranks first). `src/core/leaderboard/
leaderboardMetric.ts` adds the pure decision plus the
`toLeaderboardMagnitude` conversion (`log10(mantissa) + exponent`, exact past
`1e308`); `supabase/migrations/20260918100000_leaderboard_lifetime_gold_board.sql`
pins the three decisions as table/column comments, a durable record rather
than a structural change.

**Proof, against the real table
(`tests/server-integration/leaderboard-storage.integration.test.ts`).** Ten
values spanning ordinary numbers through `1e1000` sort correctly through the
real ranking index and display exactly; a tie at equal `metric_log10` ranks
the earlier `updated_at` first; a focused RLS check (the exhaustive matrix
stays Step 26's); and the stated latency budget — top-100 of 10,000 rows on
one board, the "~10⁴ rows" scale already recorded for this schema, under
300 ms through the real REST API. The 10,000 rows needed 10,000 distinct
`auth.users` rows to reference (`(board_key, user_id)` is the primary key);
`tests/server-integration/directSqlFixture.ts` seeds them with one bulk
superuser `insert` via `docker exec ... psql` rather than 10,000 real GoTrue
sign-ins, which would have made this the slowest, flakiest thing
`verify:server` runs. See `architecture.md`'s Step 27 section for the full
design reasoning.

**Gate evidence, all green on a Docker-capable runner (2026-09-18).**
`npm run lint`, `npm run test` (**690** unit tests, 8 new), `npm run build`,
`npm run test:e2e` (52), `npm run test:prod` (10), `npm run test:server-unit`
(170 Deno unit tests, unchanged — no server-side code touched) and `npm run
verify:server` (**17** integration files / **119** tests, 6 new, plus the 9
guest-session browser specs) all exit 0.

**Previously, at the Step 26 validation gate — Step 26 (adversarial
suite) implemented 2026-09-17, validated and merged; Step 27 was released
against it. Phase 4, "Server-verified progress", is complete.**

Step 26 adds no production code. It is the nine-attack adversarial suite
(`current: forge gold / replay / rollback / clock / another user's id /
PostgREST / Telegram / stolen session / recovery brute force`), each attack
refused by its own named assertion and each proven **load-bearing by mutation**
— the per-attack record is the hand-off comment on `TASK-004`. The layout puts
each attack at the lowest layer that still exercises the real guard: the pure
guards run under `deno test` with no Docker
(`supabase/functions/{save-sync,telegram-sign-in,recovery-code}/adversarial.test.ts`),
and the forms that need the real stack (the stored `saves` row, the real clock,
real PostgREST with real client tokens, the real `recovery_codes` table) run
inside `npm run verify:server`
(`tests/server-integration/adversarial.integration.test.ts` and
`adversarial-rls.integration.test.ts`). Attack 6's matrix is **derived** from
`supabase/migrations/*.sql`, not hand-listed, so a seventh table cannot slip
through uncovered. See `architecture.md`'s Step 26 section for the attacks ×
guards table and for the two honest gaps Step 26 records rather than papers
over: redemption has no per-user limit before it resolves, and attack 8's
rotation boundary does not cover a stolen session token (F5 stays out of scope).

**Gate evidence, all green on a Docker-capable runner (2026-09-18).**
`npm run lint`, `npm run test` (682 unit tests, the recorded count), `npm run
build`, `npm run test:e2e` (52), `npm run test:prod` (10), `npm run
test:server-unit` (**170** Deno unit tests, up from 112 at Step 25) and `npm
run verify:server` (16 integration files / 113 tests, plus the 9 guest-session
browser specs) all exit 0. The first self-check run on this branch was red on
six Deno tests, four RLS cells and one cross-suite `429` interference; those
are fixed — see `architecture.md`'s Step 26 section for what each fix was and
for the per-attack mutation record.

**Previously, at the Step 25 validation gate — Step 25 implemented
2026-09-17, awaiting user validation; Step 26 is blocked until the user
validates it.**

Step 25 (abuse limits) was implemented on 2026-09-17, on the user's explicit
instruction to proceed past the Step 24 gate: uploads, downloads, Telegram
sign-ins and recovery-code redemption are now throttled per user **and** per
address by one shared limiter
(`supabase/functions/_shared/rateLimit.ts`, injected clock and store), every
body-taking function caps document size **before** parsing, and a
proof-of-absence test asserts no server code path derives identity or
save-write authority from a client-supplied device or browser characteristic.
It also closes Step 24's L2: a `429` is refused before any `save_audit` row
exists on the path, so a flood cannot grow the table per refused request. The
limits are derived from protocol §9's worst-case honest cadence and set several
times looser, and a `429` is self-healing with no player-facing notice.

Step 24 (rejection handling) was implemented on 2026-09-14: a rejected save
leaves the local save intact and the session playable, surfaces a
comprehensible notice, and writes one `save_audit` row per authenticated
`PUT /v1/save` attempt.

Steps 9, 10, and 12–25 are implemented but unvalidated as one batch, because the
user directed work past several gates rather than pausing at each. Step 11
(Apple sign-in) is cut.

What Step 25 added, in one line each:

- `_shared/rateLimit.ts` — the one fixed-window limiter: `createFixedWindowRateLimiter`
  with an injected clock and store, `extractCallerAddress` (the gateway-appended
  **last** `X-Forwarded-For` hop, never a client-supplied one), per-user and
  per-address key builders, `rateLimitedResponse` (§10.2's `429` exactly), and
  the prune past a size threshold that bounds the map.
- `_shared/http.ts` — `MAX_REQUEST_BODY_BYTES = 65_536` now lives here rather
  than privately in `save-sync`, and `discardRequestBody` drains a bounded
  prefix of a body already refused by its declared size, so the client can
  actually read the `413` instead of hanging on a response the gateway has not
  relayed. The bytes are never buffered or parsed.
- `save-sync` — `PUT` and `GET` each gain a per-address check (before
  authentication) and a per-user check; `telegram-sign-in` gains a per-address
  limit; `recovery-code` keeps its Step 14 per-address budget and gains a
  per-user one on **generate** (redemption cannot have one — there is no caller
  identity until the code has already matched).
- `supabase/config.toml` — `[auth.rate_limit]` reviewed and deliberately left
  unchanged; `anonymous_users` (30/hour/IP) is the only bound on guest-account
  minting, which never passes through an Edge Function.
- `tests/unit/server-fingerprint-absence.test.ts` — the proof of absence, with
  its own anti-vacuity self-check.
- `src/platform/web/cloudSaveUpload.ts` + `src/persistence/cloudSaveReplica.ts`
  — the Step 19 replica honoured `rate_limited` with §9's ladder alone, so its
  first retry came 1 s after a refusal that asked for up to 60 and re-entered
  the closed window. The transport now parses `Retry-After` into `retryAfterMs`
  and `#scheduleRetry` waits `max(ladderStep, retryAfterMs)` — a floor, never a
  shortcut, and a malformed header leaves the ladder in charge.

What Step 19 added, in one line each:

- `ReplicatingActiveSaveRepository` — composes the local Dexie/lifecycle
  repository with the cloud replica; `loadActiveSave` reads local only (§11
  forbids a network call on the boot path), and the local write is awaited
  before the document is offered to the replica.
- `cloudSaveReplica.ts` — the pure policy half: §9's 60 s minimum interval with
  coalescing, forced bypass, 1/2/4/8/16 s bounded backoff, and §7 applied to a
  `409` through the one `resolveSaveConflict` predicate.
- `cloudSaveUpload.ts` — the single `PUT /v1/save` network call.
- `reconcileCloudSaveAtBoot` gained `onServerRevision`; uploads are held until
  the boot download settles, so a returning player's first routine save updates
  revision N instead of carrying a null `baseRevision`.

`src/core` stays pure: `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource` are now
banned there by `eslint.config.mjs` with its own `architecture.test.ts` probe, so
the network boundary is enforced rather than documented.

Three 2026-09-14 review passes of Step 19 found and fixed: **C1 (CRITICAL,
pass 2)** — the upload `409` fork did not stop the replica, so the next routine
save was accepted against the server's revision and silently replaced the
branch the player was never shown; the fork branch now calls `stop()`, exactly
as the boot fork does. **H2 (HIGH, pass 1)** — §4's player-facing copy was only
a DEV diagnostic; `describeCloudSaveNotice` now maps every failure code to its
namespaced `cloud-sync-*` banner notice. **M3 (MEDIUM, passes 1 and 2)** — a
`save_invalid`/`save_rejected` save is remembered by the *shape* of its
authoritative state; routine saves of that shape are not retried, while a
forced trigger still is and clears the suppression on success, so a transient
server rejection can recover without killing sync. **R1 (LOW, pass 3)** was
that a shape key alone left sync dead-but-reported-live; the forced-trigger
recovery path is the fix. **M4** — local saves are suspended while a
mid-session remote is adopted and reloaded. **M5** — the protocol and both
schema copies now describe the V2 wire format. **L6–L10** — `local-dominates`
preserves a newer queued document, the retry budget is five retries (so the
16 s step is reached), `#attempt` resets per trigger, the upload sends
`charset=utf-8`, and an unparseable `receivedAt` is rejected. **L11** —
`save-sync` now migrates an older schema instead of refusing it, matching §4's
`schema_unsupported` direction.

**Step 20 (adopt existing local saves).** A pre-milestone player holds a
version-1 `SaveDocument` in IndexedDB. On first sign-in their account has no
cloud save, so the reconcile sees `204` (`no-cloud-save`). Step 20's delivery is
the extraction of that adoption into the named, typed, tested
`adoptExistingLocalSave` (`src/platform/web/cloudSaveReconcile.ts`), which reads
the local document, runs it through the shared `validateSaveDocument` — migrating
version 1 to version 2 and expanding a legacy four-floor payload, defaulting
`warehouse.totalOfflineGoldClaimed` to `"0"` — and hands the migrated document to
the Step 19 replica's `forceCloudUpload`. `src/main.ts`'s boot-reconcile trigger
now delegates to it and publishes a DEV `localSaveAdoption` diagnostic. The
underlying behaviour (load local, migrate, force-upload on `no-cloud-save`) was
already wired in Step 19; Step 20 makes it explicit, observable, and evidenced,
never throwing (`no-local-save`, `unreadable`, `upload-failed`). Evidence: six
unit tests including a progressed fixture and a legacy four-floor expansion, a
live integration suite
(`tests/server-integration/adopt-existing-save.integration.test.ts`) proving the
migrated document is stored and returned **byte-for-byte**, and a server-e2e
spec (`tests/server-e2e/adopt-local-save.spec.ts`) that seeds a real version-1
IndexedDB save in a browser and proves the cloud copy is byte-for-byte the
adopted local document.

The narrative account of every earlier phase is in
`archive/phase-narrative.md`; finished work is in `archive/completed-log.md`.

**Step 21 (survive local storage eviction).** `ensureGuestSession` now reports
`isNewSession`, so a reused guest session with no local record is
distinguishable from a genuinely new player. New pure
`shouldExplainMissingLocalSave` (`src/platform/web/localSaveRestore.ts`) fires
only for that exact state — reused session, `'missing'` local state (no record
at all), and a `no-cloud-save` reconcile outcome — and `src/main.ts` reports the
honest `local-save-missing` notice through the save banner rather than letting
the reset happen silently; a cloud save is restored by the existing Step 17/18
reconcile, untouched. A corrupt-but-present save is `'unreadable'`, not
`'missing'`, so its accurate `corrupt-save` warning is never overwritten by a
false "not found". The decision is a three-way join (local state, `isNewSession`,
reconcile outcome) with no permanent pending await, and it is **guest-path
only**: Telegram has no reused-session signal, so `sessionIsNew` stays unset
there. New `persistentStorage.ts` requests `navigator.storage.persist()` once,
early, and records the browser's real answer as a DEV `persistentStorage`
diagnostic. Step 21 also moved `reconcileCloudSaveAtBoot`'s `onServerRevision`
to fire only for `kept-local`/`same-progress`, so a dominating remote is never
preceded by arming the replica — otherwise a pending fresh document could upload
against the server revision and overwrite the very cloud save the adopt
restores. Evidence: unit tests for `isNewSession`, the restore predicate, and
the persistence helper; three server-e2e specs proving restore-after-eviction,
the honest notice, and corrupt-save preservation; and a client-e2e measurement
of `navigator.storage`. The iOS Safari seven-day deletion measurement is
**outstanding** — it needs a real device and a seven-day observation (finding
F8) — and is recorded as such in `techContext.md`.

**Step 22 (the server clock is the only clock).** Offline-income settlement
moved to the server. New pure `calculateOfflineGrant` (`src/core/offline-income/`)
computes the reward from two opaque timestamps; `calculateOfflineIncome` (the
client's projection) and `save-sync`'s `GET /v1/save` (the server's grant) both
call it, so the formula, the 7,200,000 ms cap, and the 0.5 efficiency cannot
drift — F4's requirement that Step 22 change *which clock is authoritative* and
nothing else. The download response carries `offlineGrant`, computed from the
stored `received_at` to the server's `now()`; the device clock is never an
input. The credited reward comes from the pure, unit-tested `chooseOfflineReward`
(`src/platform/web/chooseOfflineReward.ts`): the server grant is the ceiling,
bounded by the client projection (`min`) so only a closed interval is credited —
and a null or zero projection is treated as a **zero** bound, not an absent one,
which is what stops a tab-flush-at-reload from crediting the cap on top of
open-tab production. The projection is credited alone only where no server
figure can exist (unconfigured, or `no-cloud-save`); a failed download and a
failed sign-in against a configured backend both credit nothing and settle on
the next boot that reaches the server. The download carries a 10 s timeout. The
applied-receipt guard is marked only when the claim is persisted. Evidence: core
parity/cap/future tests; `chooseOfflineReward` unit tests; the server's own unit
tests proving the document timestamps cannot move the grant; a live integration
suite
(`tests/server-integration/offline-grant.integration.test.ts`) proving an
honest, hours-ahead, and hours-behind client get the same capped grant for the
same receipt; and a server-e2e spec (`tests/server-e2e/offline-grant.spec.ts`)
proving the browser credits the server's figure. The client E2E config pins the
Supabase env blank, so that suite stays the deterministic, backend-free client
gate while the server path is covered by the server suites.

**Step 23 (upper-bound re-simulation).** New pure
`evaluateProgressBound` (`src/core/anti-cheat/progressBound.ts`) bounds an
uploaded document against the last accepted one. It re-derives the maximum the
mine could have produced over the server-measured elapsed time using the shared
core's own rate and cost functions **on the candidate's final configuration**,
and never simulates ticks — the interval can exceed the two-hour catch-up cap, so
an `O(elapsed)` walk would blow the §7.1 upload latency budget, while the rate
model gives the same (looser) bound in `O(floors)`. It bounds the **monotonic
cumulative counters** — each floor's `totalExtracted`/`totalTransported`,
`warehouse.totalGoldDelivered`, `warehouse.totalOfflineGoldClaimed` — plus the
total gold the levels and unlocks between the two documents required
(`state.upgradeSpend`), never current `gold`, which legitimately falls when the
player spends; this is the same exclusion §7's progress vector makes. Each
counter also carries the material already in the pipeline at the interval's open
(a floor's in-flight cycle, its queue, the elevator's load, the warehouse's input
queue), because a proportional rate term is near-zero over a short interval while
one completed cycle is a fixed amount — without the carried terms a warm mine
that simply kept playing is rejected (**F1**). The spend allowance uses **one**
earning term, not the delivery and offline allowances summed, since the interval
was either played or spent away (**F5**). `PROGRESS_BOUND_TOLERANCE = 0.05`
absorbs the remaining fixed-step-vs-continuous-rate difference;
`tests/unit/progress-bound.test.ts` pins it from both sides (over an interval
long enough that the rate term dominates the carried amount) so widening it
silently fails. The direction is deliberate per the threat model's §1 ranking:
reject a slightly generous save before rejecting an honest one (finding F3).
`save-sync`'s `handleSaveUpload` runs the check after the `baseRevision`
concurrency check and before the write, returning `422 save_rejected` with
`detail: { counter, claimed, maximum }`; the stored row and revision are
unchanged. **A first upload (`current === null`) is deliberately exempt** — there
is no last accepted document to bound against, and it is how a brand-new account
seeds its cloud save and how Step 20 adopts a save earned before the account
existed; a stored row whose document or `received_at` cannot be read also skips
the check rather than collapsing to the strictest bound (**F4**), so the server
never rejects an honest save because its own row is unreadable. **Two anchors,
because §7 makes forks first-class (F2):** the tight bound measures from the
stored row, but a device that resolved a `409` re-uploads a branch that diverged
from the row's one-generation ancestor, so when the tight bound fails and an
ancestor exists the check is retried against it over the full interval. Evidence:
9 core unit tests (warm short intervals, each inflated counter, tolerance pinned
both sides), server unit tests in `save-sync/index.test.ts` (the F2 ancestor
anchor and F4 skip), a live integration suite
(`tests/server-integration/save-rejection.integration.test.ts`), and the
conflict/collision suites, whose re-upload now commits through the ancestor
anchor with no extra aging. See `memory-bank/architecture.md`'s Step 23 section
for the full modelling rule.

**Step 23's integration fixtures.** `tests/server-integration/saveAgeFixture.ts`'s
`ageStoredSave` moves a stored row's `received_at` into the past through the
service-role client, so a fixture document that represents *linear offline play*
is within the interval it stands for. It is deliberately not used to fake a
divergent branch into the linear bound: the conflict suite's `409` re-upload now
needs no aging because the row's `previous_*` ancestor is the anchor. The
`profiles-rls` suite's profile-`created_at` assertion also gained a
`CLOCK_SKEW_TOLERANCE_MS` bound on both sides, because it compares the Postgres
container's clock with the test process's.

**A 2026-09-14 review of Step 23 found and fixed six issues**, all on the bound:
**F1 (HIGH)** — no term for material already in the pipeline, so an honest warm
mine was rejected over short intervals (the pagehide/offline-claim forced
uploads §9 specifies); the carried terms above fix it. **F2 (HIGH)** — elapsed
was measured only from the stored row, so a §7 conflict resolution could never be
uploaded (the winning branch's whole divergence was compared to a few seconds);
the ancestor anchor fixes it. **F3 (MEDIUM)** — the tests began from a cold start
(the only zero-in-flight state) and the fixtures aged rows to mask F1/F2; new
warm-interval and ancestor-anchor regressions were added and the fixtures' role
narrowed. **F4 (LOW)** — an unparseable `received_at` produced a zero-second
bound instead of skipping. **F5 (LOW)** — the spend allowance summed two earning
terms, doubling it. **F6 (LOW)** — `architecture.md`'s file-responsibility row
now names the anti-cheat module.

**N1 (MEDIUM, open) is the residual of F2.** The ancestor anchor is one
generation deep, so a fork older than roughly two minutes against an
actively-syncing peer is still rejected — the exact "tablet open while the phone
plays offline" case. It is recorded as a **stated limit** in `architecture.md`'s
Step 23 section and as an open risk in `progress.md`, not presented as closed.
The sound full fix (retain fork points, or a verifiable fork revision) was not
taken up by Step 24 and is not scheduled; a server-side "accept any strict
superset" exemption is unsound (cheats submit supersets) and was rejected.

**Step 24 (rejection handling).** The `save_audit` table was designed at Step 3
and already exists (`supabase/migrations/20260908130000_create_platform_tables.sql`),
with no RLS policy for any client role and a partial index on rejections; Step 24
is its writer. `save-sync`'s `handleSaveUpload` now records **exactly one row per
authenticated attempt** through a new `writeSaveAudit` dep
(`writeSaveAuditViaServiceRole`, the second and last service-role use in this
function): `outcome`, `error_code`, the client's claimed `base_revision`, the
server's `resulting_revision`, `document_bytes`, and `client_reported_at` — the
client's own `savedAtTimestampMs`, recorded verbatim and never trusted, so a
device-clock attack is visible as divergence from the server's `occurred_at`.
`detail` carries the server-authored reason (a Step 23 bound violation's
`{counter, claimed, maximum}`, a validation `reason`, a conflict's
`serverRevision`, a size cap, a malformed-body reason). The write is
**best-effort**: a failure is logged and never turns an accepted save into a
rejected one or loses the player's game. Unauthenticated requests write nothing
(there is no `user_id`); the `save_audit.user_id` foreign key is `not null`.
Accepted attempts are recorded too, not just rejections — the table was designed
for both, and the partial rejection index exists because rejections are the rare
minority that Step 35 will watch.

The player-facing half was already built by Step 19 and is now pinned end to
end: a `save_rejected` is terminal-but-keep-syncing, so the replica drops that
document, remembers its state shape so routine saves of it are not retried,
keeps the local save (which is written first and independently), keeps the
session playable, and reports the §4 notice
`cloud-sync-save-rejected` — "Your progress could not be verified and was not
uploaded. Your game on this device is unchanged." — through the save banner. A
forced trigger bypasses the shape suppression and a success clears it, so a
false positive recovers without a reload. N1 remains the known limit (an old
honest fork can be refused), and Step 24's no-loss guarantee is what makes that
limit survivable: the player keeps playing and keeps their local save either way.

Evidence: 8 new Deno unit tests (accepted row + client clock, bound-violation
row, validation row, no row without a caller, an out-of-range client clock still
writing one row, a throwing collaborator writing a `server_error` row, a
non-integer `baseRevision` refused with one `malformed_request` row, and the
`normalizeAuditRevision` coercion); `server-stack.test.ts` pins the
`save_audit` insert; `tests/server-integration/save-audit.integration.test.ts`
(6 live tests: accepted row, bound rejection row, conflict row, an
unrepresentable client clock still writing its row, invalid `baseRevision`
values each writing their own row, and RLS proving the log is invisible and
unwritable to a client token); and
`tests/server-e2e/save-rejection.spec.ts` (a stubbed `422 save_rejected` leaves
the session producing gold, the local save intact, one comprehensible notice,
and no uncaught error).

**A 2026-09-14 review of Step 24 found and fixed two issues** (one HIGH).
**H1 (HIGH):** `readClientClock` converts the document's `savedAtTimestampMs`
with `Date#toISOString`, which for a year-10000+ value emits the extended-year
form Postgres refuses — the insert threw, the best-effort writer swallowed it,
and the attempt left no row at all, so an attacker probing the Step 23 bound
with a far-future clock erased their own trace. The instant is now bounded to the
`timestamptz` round-trippable range (years 0001–9999); an out-of-range claim is
recorded as a null instant with the raw value in
`detail.clientReportedAtOutOfRangeMs`, so the row still exists and still shows
the divergence. **M1 (MEDIUM):** an unexpected collaborator failure
(`readCurrentSave`/`writeSaveRow` throwing, or the non-`SaveDocumentError`
rethrow in validation) escaped as an unaudited 500; it is now caught after the
caller resolves and recorded as a `rejected`/`server_error` row before the 500.
**L1 (LOW)** added `declaredBytes` to the Content-Length rejection's `detail`, so
the one attacker-declared field is marked as declared. **L2 (LOW, carried to
Step 25):** every rejection costs a service-role round trip on the response path,
and a caller gets 1-request-to-1-audit-write amplification; Step 25's abuse
limits should bound that.

**A follow-up 2026-09-14 pass found H2 (HIGH) and L3 (LOW).** **H2:** the same
defect class as H1, reached through `baseRevision` — a client-controlled number
written straight into the audit's `bigint` column. A fractional (`1.5`) or
out-of-int8 (`1e300`) value aborted the insert and the attempt left no row,
silencing even M1's `server_error` row. `baseRevision` is now validated against
§5 (`null` or a positive safe integer; anything else is a recorded
`400 malformed_request`) *before* `auditContext.baseRevision` is assigned, which
also closes the §5 conformance gap; `writeSaveAuditViaServiceRole` additionally
coerces non-safe-integer revisions to `null` (`normalizeAuditRevision`) and
clamps `document_bytes`, so the next typed column cannot reopen the hole.
**L3:** the two remaining unaudited-500 paths (`request.text()` on an aborted
body, and building a `409` from an out-of-band-corrupted stored row) are now
caught and recorded too. Counts rose to 112 Deno unit and 91 integration tests.

**A 2026-09-16 CI hardening pass (not a milestone step).** The `server` job's
`npm run verify:server` failed on work that passes locally, with undici's
`TimeoutError: The operation was aborted due to timeout`. The cause was
cold-start speed rather than configuration: four functions import
`npm:@supabase/supabase-js@2.116.0`, a runner resolves it from an empty module
cache on each function's first request, and four timing-sensitive calls
carried a hard budget with no retry against that one slow response. The CI log
then indicted exactly one of them and contradicted the cold-start hypothesis for
it: the job's only red test was `recovery-code.integration.test.ts`'s throttle
test, which died on its first iteration — 20171 ms, one request spending the
whole 20 s budget — after that file had already served roughly ninety requests.
A warm worker stalling is contention (16 parallel Vitest files against one edge
runtime on 4 vCPU), not a cold start; the cold-start reading survives only for
the rate-limit reset hook and the `hookTimeout` default.
`scripts/warm-edge-functions.mjs` now warms every function once — its list read
from `supabase/functions/`, `_shared` excluded — before any suite runs, so the
class is removed in one place instead of patched caller by caller. Its probe is
a refused `DELETE` on an unrouted path, not the CORS preflight F11 describes:
the local Kong gateway answers `OPTIONS` itself and never boots a worker. The
two server-e2e cloud-save reads now share
`tests/server-e2e/cloudSaveFixture.ts`'s retrying, null-returning helper rather
than a bare 5 s timeout inside a 20 s `expect.poll` (Playwright evaluates a
poll's callback outside its own try/catch, so a thrown `TimeoutError` killed
the test while its budget was untouched), and
`vitest.server-integration.config.ts` sets `hookTimeout` above the 20 s its own
requests declare, and `tests/server-integration/transientFetchFixture.ts` gives
the two burst loops an attempt that tolerates a transient stall — retrying once
when nothing answered at all, and treating a never-answered attempt as `null`
rather than a status, so `sawRateLimited` can only ever be set by a real `429`.
**The Step 24 gate is unchanged: this pass touches no `src/`,
protocol, schema, migration or `supabase/config.toml` file, and Step 25 still
begins only on the user's validation of Step 24.** Evidence: 659 unit tests,
112 Deno unit tests, 9 server-e2e specs, and a full `npm run verify:server`
run — recorded in `techContext.md`.

## Active Decisions

Decisions that still constrain code not yet written. Settled base-game decisions
— already enforced by shipped code and restated as contracts in
`architecture.md` and `systemPatterns.md` — are in `archive/decision-log.md`.

- Target browser and Telegram Mini App first.
- Keep core simulation deterministic and independent of Phaser.
- Use original branding and assets rather than copying the reference game's protected content.
- Treat balance values in the GDD as starting hypotheses requiring playtests.
- Use English UI at a 360×640 logical resolution with no deferred bottom navigation.
- Run production automatically through fifteen mine shafts, one shared sequential-stop elevator, and one shared warehouse.
- Upgrade mine shafts, elevator, and warehouse independently while preserving progress percentage.
- Use saved-rate offline rewards, lowercase `k/m/b/t/qa/qi/sx/sp/oc/no/dc`
  tiers followed by `aa` from `10^36`, Phaser 4.2.1, and a mid-range Android
  Chrome performance baseline.
- Start with 100 gold; provisional floor unlock costs are 250, 1,500, and 7,500, gated by prior-floor levels 5, 5, and 7.
- Use a 1.15 upgrade-cost growth rate, 1.10 mine-yield growth, and 1.12 shared-stage capacity growth until the Step 19 economy simulation and playtesting refine them.
- Represent runtime gold, material quantities, yields, and costs through `GameNumber`; keep abbreviated display formatting outside the arithmetic abstraction.
- Store only authoritative production data in core state; renderer, scene, animation, sprite, tween, and texture objects never enter serialized state.
- **The game stays fully playable offline.** The base game is client-only; the
  server milestone adds accounts and cloud save *beside* it, never in front of
  it. Local storage stays primary, the cloud is a replica, and no network call
  blocks the boot path. Monetization, blockchain, and social systems remain
  unbuilt — Phases 5 and 6 of the server plan are groundwork only.
  *(Corrected 2026-09-14: this decision previously read "Keep MVP client-only and
  exclude monetization, blockchain, and social systems," which the server
  milestone had already superseded.)*
- Marketplace v1 keeps `Miner` as a dedicated extraction role and keeps
  `Unloader` separate as a floor-head receiving role. The asset family
  `miner` is therefore a future production input for Marketplace v1; existing
  `unloader` candidates must not be silently repurposed.

## Next Steps

1. **Marketplace asset Phase 1:** build the canonical asset registry and
   normalize the current Marketplace portraits. Do not begin Phase 2 until its
   asset/QC/UI regression gate passes.
2. **Wait for the user to validate Step 31.** This is the current gate; Step 32
   must not start before it. The entitlement table is already in the schema,
   and the function is the only new server surface for this step.
3. Resolve the earlier Step 28/Step 29 validation status before advancing the
   milestone's implementation sequence. **Step 24's L2 is closed by Step 25:** a `429` is
   refused before any
   `save_audit` row exists on the path, and an oversized body writes none
   either, so the 1-request-to-1-audit-write amplification no longer grows the
   table per refused request. Step 26 pins both under attack
   (`attack 9 / AC9` in `adversarial.integration.test.ts`).
4. Validate the new account/settings and conflict chooser flow with a real
   Google OAuth return and a two-device fork fixture. The local UI and choice
   handlers are implemented; live identity redirects remain environment work.
5. The Step 23 N1 limit (a fork older than ~2 minutes against an actively-syncing
   peer is refused) needs a real fix — retain fork points, or accept a
   verifiable fork revision. Not scheduled.
6. Non-blocking carry-overs from the base-game milestone: a physical mid-range
   Android Chrome pass, and a human playtest of the 30-second-comprehension
   criterion.

## Open Questions

- Validation and refinement of the provisional balance curve through playtesting.
- Whether `calculateMineProductionRates` should model sequential route distance
  and load-sensitive leg timing, or whether the estimate stays a route-agnostic
  upper bound used by the HUD and offline snapshot.
- Final art-production workflow and original visual identity.
- Target Telegram launch requirements beyond the prototype.
