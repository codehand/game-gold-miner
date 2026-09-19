# Progress

## Status Summary

**Base game: complete.** All 37 `implementation-plan.md` steps are implemented
and validated; the user validated Step 37 on 2026-09-08. No plan step remains
open.

**Server milestone implementation: complete through Step 37 (2026-09-19).** Steps 1–8
are validated.
Step 11 (Apple sign-in) is cut. Steps 9, 10, and 12–24 are implemented and await
user validation together. Steps 25, 26, and 27 are each implemented, validated,
and merged in turn. Step 28 (leaderboard writes) remains implemented and
awaiting user validation. Step 29 (leaderboard display) is implemented and
awaiting user validation. Step 30 is recorded as a documentation-only
deferral: the verified leaderboard is sufficient for the current social goal,
so no friend graph is needed. **Step 31 is implemented and awaiting user
validation; Step 32 is implemented and awaiting validation under the user's
explicit instruction to proceed. **Steps 33–37 have completed implementation
gates with recorded evidence; Step 37 is now closed.**
Phase 4 (Steps 22–26) is complete, validated by Step 26's own gate evidence
below.

Step 26's own gate evidence is complete on a Docker-capable runner as of
2026-09-18: `npm run verify` (682 unit, 52 e2e, build, secret scan, 10
production-smoke) and `npm run verify:server` (170 Deno unit tests, 16
integration files / 113 tests, 9 guest-session browser specs) both pass, and
**all nine attacks were mutation-proven individually** — guard disabled, that
attack's own test observed red, restored, observed green. The per-attack record
is in `architecture.md`'s Step 26 section and in the task hand-off comment.

**Step 27's own gate evidence, 2026-09-18.** No table, index, or RLS change —
`public.leaderboard_entries` already existed metric-agnostic from Step 3/5;
Step 27 decided the metric (lifetime gold earned), the board (one, all-time,
`lifetime-gold`), and the tie-break (ascending `updated_at`), pinned in
`supabase/migrations/20260918100000_leaderboard_lifetime_gold_board.sql` as
table/column comments. `npm run verify` (690 unit — 8 new — 52 e2e, build,
secret scan, 10 production-smoke) and `npm run verify:server` (170 Deno unit,
17 integration files / 119 tests — 6 new — 9 guest-session browser specs) both
pass. The new integration suite proves the step's own "Test" line against the
real table: ten values from ordinary numbers through `1e1000` sort correctly
through the real ranking index and display exactly; a tie ranks the earlier
`updated_at` first; and the top-100 ranking query over 10,000 rows on one
board — the "~10⁴ rows" scale already recorded for this schema — completes
under a stated 300 ms budget through the real REST API. Full detail in
`architecture.md`'s Step 27 section.

**Step 28 (leaderboard writes), implemented 2026-09-18.** No schema change:
publishing is one new service-role call inside `save-sync/index.ts`'s
existing accepted-upload path — `admin.from('leaderboard_entries').upsert(...)`,
keyed on the table's own `(board_key, user_id)` primary key, run only after a
document Step 23's bound, validation, and the revision compare-and-swap have
all already accepted (every reject branch returns before the call site).
Metric and revision come from Step 27's own pure functions and the write's
own resulting revision; `display_name` is read from the caller's own
`profiles.display_name` through their own token. The publish is best-effort,
the same shape Step 24 established for `save_audit`. `save-sync/index.test.ts`
covers every branch with fakes; `tests/server-integration/leaderboard-publish.integration.test.ts`
proves the same contract against the real Edge Function and table — one row
published per accepted upload, a rejected upload leaves the prior entry
untouched, a repeat accepted upload overwrites rather than duplicates.
`leaderboard_entries`'s write refusal for both client roles was already
exhaustively covered by Step 26's migration-derived RLS matrix, so it is not
re-proven. Full detail in `architecture.md`'s Step 28 section. **This
implementer's sandbox could not run `npm install`, so `npm run verify` /
`npm run verify:server` numbers are not recorded here — the validation gate's
own run captures that evidence.**

**Step 29 (leaderboard display), implemented 2026-09-19.** The new
`leaderboard-read` Edge Function serves the public top lifetime-gold rows and,
when a valid bearer token is supplied, the caller's own rank/value projection;
the response never exposes `leaderboard_entries.user_id`. The authenticated rank
uses paginated service-role reads and the established metric-desc/
`updated_at`-asc ordering, avoiding an Edge Runtime discrepancy observed with
PostgREST `count: 'exact', head: true` predicates. The client opens an accessible
leaderboard modal from the Rewards navigation item, formats exact
`GameNumber` values through the existing `formatAmount` authority, and shows a
retryable offline state when the endpoint is unavailable. **The Step 29
validation gate is open; Step 30 remains a documented deferral and Step 32 is
implemented under the user's explicit instruction, with its validation gate
open.**

Evidence for this implementation: `npx --no-install deno test
supabase/functions/leaderboard-read` (7 passing), the focused client unit run
(85 passing), `npm run build`, `npm run lint`, and the focused Rewards-tab
browser smoke all pass. The live `leaderboard-read` integration file passes
3/3 tests against the restarted local Supabase stack.

The playable game stays fully playable offline. The one network call on the boot
path is `ensureGuestSession`, never awaited before the first frame.

**2026-09-19 — asset catalog animation fidelity.** The approved presentation
policy now uses 4-frame `2x2` sheets for `N`/`R` and 8-frame `4x2` sheets for
`SR`/`SSR`/`UR`, with consistent 128×128 proportions and anchors. Mofy is the
first applied SSR asset: its second row deliberately continues the ledger
inspection, grip adjustment, breathing, and recovery motion instead of
duplicating row 1. The 8-frame sheet passed strict raster QC, while the
marketplace portrait remains a compatible single-frame extract. No runtime
resolver or gameplay behavior changed.

**2026-09-19 — player-facing account/settings feedback.** Added the HUD
settings button and accessible account modal with guest/Google identity,
version, login, logout-and-reset, and the cloud conflict policy's local-versus-
cloud chooser. Local choice uses the conflict's server revision for one
compare-and-swap upload; cloud choice adopts the remote document before reload.
`npm run build`, `npm run lint`, `npm run test -- --run` (690 tests), and live
in-app browser inspection pass.

**Step 30 (decide on friends), documentation-only deferral, 2026-09-19.** The
server milestone already provides asynchronous social competition through one
verified all-time leaderboard. A friend graph is not required by the
milestone's purpose or Definition of Done, so no friend table, relationship
API, UI, or moderation surface is being added. Revisit only when a concrete
product requirement defines discovery, privacy, blocking, and deletion
semantics. **The Step 30 validation gate remains open; Step 29 and Step 32
proceeded under the user's explicit instruction to continue. Step 32's own
validation gate is open.**

**Step 31 (entitlements), implemented 2026-09-19.** The existing
`entitlements` table and own-row/no-write RLS policy from Step 3 are reused;
there is no migration. `entitlement-check` verifies the caller's bearer token,
reads active `cosmetic.supporter_badge` rows through the caller-scoped client,
and returns `effects.supporterBadge`. Unit coverage has 8 tests; the live
integration coverage has 4 tests proving client INSERT refusal, server-role
grant visibility, and revocation. **The Step 31 validation gate is open.**

**Step 32 (account audit), implemented 2026-09-19.** The new
`public.account_audit` table is separate from high-volume `save_audit` and
accepts only the seven specified event types. Database-owned triggers cover
identity changes, recovery-code issuance, entitlement grants/revocations, and
save rejections; successful recovery redemption is appended by `recovery-code`
after external session minting through a service-only RPC. Client roles have no
RLS policies, service-role insert excludes the timestamp column, and ordinary
service-role update/delete are revoked. The integration test drives every event
type and the derived RLS matrix covers both client roles across all four verbs.
Available implementation checks pass: `supabase db reset`, `supabase db lint`,
the migration privilege probe, and SQL transaction probes for the trigger
events. The Deno/Vitest suites, lint, and build could not start in this
workspace because `deno`, `vitest`, `eslint`, and `tsc` are not installed;
therefore the validation gate remains open and no acceptance-gate entry has
been added. A review regression also proves account deletion survives the
cascaded identity-removal trigger, which records the event with a null link.

**Step 33 (account and data deletion), implemented 2026-09-19.** The
forward-only migration 20260919110000_account_deletion.sql adds the 30-day
anonymized_at/retention_until invariant and indexed purge boundary. The
authenticated account-delete Edge Function ignores body account ids and calls
the service-only transactional delete_account(uuid) RPC. It scrubs audit
detail and links, then deletes auth.users; existing cascades remove profiles,
saves, save audits, recovery codes, leaderboard entries, and entitlements. A
parent auth.users before-delete trigger also handles direct Auth-admin deletion
ordering safely, and purge_expired_account_audit is service-only.

The exhaustive integration test enumerates all seven public application tables,
seeds every account-owned path, invokes deletion with a malicious body id, and
proves the correct Auth row and all ordinary rows are gone while anonymized
audit rows remain for exactly 30 days. The six-test Edge Function unit suite,
database reset, focused four-test integration suite, client RPC refusal, and
schema invariant probe pass. Step 33's implementation gate is closed.

**Step 37 close evidence (2026-09-19).** The client gate passes with lint, 700
unit tests, 52 Chromium E2E tests, production build, secret scan, and 10
production smoke tests. The server gate passes with 198 Deno unit tests, 21
integration files / 134 tests, and 9 server-E2E tests. The database schema
blocks in `architecture.md` and `techContext.md` remain identical; `git
diff --check` passes; and README/CLAUDE document local client/server startup,
operations drills, and the explicit absence of production deployment. The
final navigation E2E regression for the Leaderboard modal passes for both
mouse and touch. The Step 36 client performance benchmark also passes its full
600,000 ms Pixel 5/Chrome 4×-CPU run: 16.7 ms frame p95, 695 constant Phaser
objects, 399 constant DOM nodes, 317,376 bytes live-heap growth, -385
bytes/second sustained heap slope, and 73.7 ms input p95.

Full history is archived, not deleted:

- Finished work → `archive/completed-log.md`
- Passed gates and deferred features → `archive/acceptance-gates.md`
- Per-step packages, tests, and review findings → `archive/step-implementation-map.md`
- The prose account of how each phase unfolded → `archive/phase-narrative.md`

**2026-09-16 — server-gate CI hardening (not a milestone step).** The GitHub
Actions `server` job failed with undici's `TimeoutError: The operation was
aborted due to timeout` on work that passes locally: every function's first
request boots a worker against an empty Deno/npm module cache on a 4-vCPU
runner, while a developer's container is warm from earlier runs, and four
timing-sensitive calls carried a hard budget with no retry against that one
slow response. Fixed by warming every Edge Function once before any suite runs
(`scripts/warm-edge-functions.mjs`, called from `scripts/verify-server-stack.mjs`),
by replacing the two server-e2e cloud-save reads' bare 5 s timeout with a
retrying shared helper (`tests/server-e2e/cloudSaveFixture.ts`), by setting the
integration suite's `hookTimeout` above the 20 s per-request budget its own
`fetch` calls declare, and by giving `recovery-code`'s two burst loops an
attempt that tolerates a transient stall
(`tests/server-integration/transientFetchFixture.ts`). That last one is the call
the CI log actually indicted: the job's only red test died on its first
iteration after ninety-odd successful requests, so the cause was contention
(16 parallel Vitest files against one edge runtime on 4 vCPU), not a cold
start — the cold-start reading holds only for the rate-limit reset hook and the
`hookTimeout` default. No step's state changed and the Step 24 gate is
untouched; the details are in `techContext.md`'s 2026-09-16 finding.

## Phase Status

| | |
|---|---|
| Current milestone | Server milestone (`server-milestone-plan.md`, 37 steps) |
| Current gate | No server implementation gate is open; Steps 33–37 are closed with local evidence. |
| Blocked on the gate | Nothing in Steps 33–37; earlier implemented-but-awaiting-user-validation gates remain explicitly recorded. |
| Last user-validated step | Step 8 (2026-09-10); implementation evidence continues through Step 37. |
| Client gate | `npm run verify` passes end to end |
| Server gate | `npm run verify:server` passes end to end |

Work proceeded past several gates on the user's explicit instruction rather than
pausing at each one; Steps 9, 10, and 12–24 therefore sit
implemented-but-unvalidated as one batch.

## Server Milestone Step Status

Compact status only. Per-step evidence, packages, and review findings are in
`archive/step-implementation-map.md`.

| Step | Status |
|---|---|
| 1 — Record scope, threat model, and open questions | Validated 2026-09-08 |
| 2 — Design the save-sync protocol | Validated 2026-09-08 |
| 3 — Design the database schema | Validated 2026-09-08 |
| 4 — Stand up the Supabase project and local stack | Validated 2026-09-08 |
| 5 — Add migrations and CI | Validated 2026-09-08 |
| 6 — Make the core simulation runnable on the server | Validated 2026-09-09 |
| 7 — Add the Edge Function test harness | Validated 2026-09-09 |
| 8 — Anonymous guest session | Validated 2026-09-10 |
| 9 — Identity: profiles and row-level security | Implemented 2026-09-10, awaiting validation |
| 10 — Google sign-in | Implemented 2026-09-10, live-verified same day, awaiting validation |
| 11 — Apple sign-in | **Cut 2026-09-11** — prerequisites not acquired (finding F7's recorded contingency) |
| 12 — Telegram sign-in | Implemented 2026-09-11, live-verified; critical fix 2026-09-12 (F13); awaiting validation |
| 13 — Guest linking, including the collision | Implemented 2026-09-12, awaiting validation |
| 14 — Recovery code | Implemented 2026-09-12; three review rounds absorbed; awaiting validation |
| 15 — `saves` table evidence | Implemented 2026-09-12, awaiting validation |
| 16 — `PUT /v1/save` | Implemented 2026-09-12; critical concurrency fix same day; awaiting validation |
| 17 — `GET /v1/save` and boot-time reconcile | Implemented 2026-09-12; HIGH reload race fixed 2026-09-13; awaiting validation |
| 18 — Conflict resolution | Implemented 2026-09-13, awaiting validation |
| 19 — Client remote repository | Implemented 2026-09-13, awaiting validation |
| 20 — Adopt existing local saves | Implemented 2026-09-14, awaiting validation |
| 21 — Survive local storage eviction | Implemented 2026-09-14, awaiting validation; the iOS Safari seven-day measurement is outstanding |
| 22 — The server clock is the only clock | Implemented 2026-09-14, awaiting validation |
| 23 — Upper-bound re-simulation | Implemented 2026-09-14; six review fixes absorbed; awaiting validation |
| 24 — Rejection handling | Implemented 2026-09-14; review fixes absorbed (H1/H2 HIGH, M1, L1–L3); awaiting validation |
| 25 — Abuse limits | Implemented 2026-09-17; validated and merged — Step 26 released against it |
| 26 — Adversarial suite | Implemented 2026-09-17; validated and merged — Step 27 released against it |
| 27 — Leaderboard storage | Implemented 2026-09-18; validated and merged — Step 28 released against it |
| 28 — Leaderboard writes | Implemented 2026-09-18; awaiting validation |
| 29 — Leaderboard display | Implemented 2026-09-19; awaiting user validation |
| 30 — Decide on friends | Deferred 2026-09-19; decision recorded |
| 31 — Entitlements | Implemented 2026-09-19; awaiting validation |
| 32 — Audit log | Implemented 2026-09-19; awaiting validation |
| 33 — Account and data deletion | Implementation gate passed 2026-09-19; details are in `archive/step-implementation-map.md`. |
| 34 — Backup and restore | Implementation gate passed 2026-09-19; details are in `archive/step-implementation-map.md`. |
| 35 — Monitoring | Implementation gate passed 2026-09-19; details are in `archive/step-implementation-map.md`. |
| 36 — Load and performance | Implementation gate passed 2026-09-19; details are in `archive/step-implementation-map.md`. |
| 37 — Close the milestone | Complete 2026-09-19; full verification, schema identity, deferred scope, and documentation evidence are archived. |

## Known Risks

Open risks only. Risks closed by shipped code are in `archive/risks-resolved.md`
with the reason each one closed.

- **The provisional balance curve is unvalidated.** The reference clip is too
  short to establish exact formulas or all features, and the GDD's values remain
  starting hypotheses. Needs playtesting, not code.
- **Offline-reward clock manipulation is closed; upper-bound validation is
  implemented, pending validation.** Step 22 moved settlement to the server: the
  credited reward is the server's `offlineGrant`, computed from the stored
  `received_at` to the server's own `now()`, so a manipulated client clock cannot
  move it. Step 23 now bounds what *any* document may claim: on upload the server
  re-derives the maximum the mine could have produced from the last accepted save
  over the server-measured elapsed time (plus material already in the pipeline)
  and rejects a document claiming more (`422 save_rejected`), bounding the
  monotonic cumulative counters and upgrade spend, never current `gold`. A branch
  that resolved a save conflict is measured from the row's one-generation
  ancestor, so a chosen branch still commits. Step 24 now handles what a rejected
  save does to the player — local save intact, session playable, a comprehensible
  notice, one `save_audit` row per attempt. Step 25 now bounds the remaining
  cost: its rate limits refuse before any audit write exists on the path, and an
  oversized body writes none either, so Step 24's L2 amplification
  (1 authenticated request → 1 service-role `save_audit` write) no longer grows
  the table per refused request. Step 26 now attacks each of those guards by
  name and proves by mutation that removing one makes its own test fail, so the
  guards are known load-bearing rather than assumed to be. See
  `archive/risks-resolved.md` for the closed half.
- **The Step 23 fork anchor is one generation deep (N1, known limit).** A save
  that resolved a `409` is measured from the row's immediate predecessor, so a
  fork older than roughly two minutes against an actively-syncing peer (a tablet
  left open while the player plays on their phone offline, then returns and
  dominates) is still rejected — both anchors are too recent. The player's local
  save is intact and play continues; only the cloud copy lags, and Step 21's
  eviction restore would return that inferior branch. The sound fix is to retain
  fork points (a `saves` history/schema change) or accept a client-supplied
  verifiable fork revision. Step 24 handled rejection handling without taking
  this on, so the design decision is still open. A
  server-side "accept any strict superset" exemption was rejected because an
  inflating cheat submits exactly supersets, so it would gut the bound. Recorded
  in `architecture.md`'s Step 23 section; not yet scheduled.
- **iOS Safari deletes all script-writable storage after seven days without
  interaction.** A lapsed player loses the entire local save today. Step 21 now
  detects the partial case (save gone, session still present), restores from the
  cloud when a cloud copy exists, shows an honest notice when it does not, asks
  for persistent storage, and syncs early enough that a lapsed player has a
  cloud copy to restore. What remains open is the **measurement**: the real
  seven-day iOS Safari behaviour (and whether a granted `persist()` exempts the
  data) needs a real device and a seven-day wall-clock observation — finding F8.
  The `persist()` half is measured (see `techContext.md`); the deletion half is
  outstanding. An unlinked guest whose session and save are swept in the same
  event still needs the Step 14 recovery code.
  Recorded in `server-milestone-plan.md` as a base-game defect that the server
  milestone reduces but does not eliminate.
- **Visual fidelity must not rely on copied art, audio, branding, or UI assets.**
  Standing rule for all future art work.
- **Two verification items carried past the base-game milestone**, both
  non-blocking: a physical mid-range Android Chrome pass (only Pixel 5 emulation
  has been run), and a human playtest of the 30-second-comprehension criterion.
