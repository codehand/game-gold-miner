# Progress

## Status Summary

**Production Telegram Mini App, 2026-10-06 — rollout in progress:** Vercel
hosts the game; Supabase production has 19 migrations, seven player-facing Edge
Functions, bot-token and recovery-pepper Secrets. Public Auth signup is off so
predictable Telegram placeholder emails cannot be claimed through `/signup`.
The existing Edge Function verifies signed `initData` before creating/reusing
the player's account. BotFather confirms GAME points at Vercel. macOS and
iPhone launches remained on Telegram's loading placeholder; the phone's direct
browser visit also stalled. PR #14 moves the official SDK snapshot onto the
game origin, calls `WebApp.ready()` after the initial loading shell appears,
and adds a static reachability page. Its 13 focused unit tests, build, lint, secret scan and 10
production smoke tests pass. The gate is a real phone launch and Supabase
account creation/reuse after this patch deploys; production CORS preflight and
malformed POST already behave as expected.

**Multi-mine Map, 2026-10-05 — complete and release-verified:** the six-site
catalog, V4 portfolio/migration, shared wallet, single foreground runtime,
fixed-price purchase chain, per-mine offline claim, positional Map and
mine-qualified roster are complete. Configured accounts use server time,
revision checks, idempotent receipts and a durable version-2 command journal.
If cloud sync is unavailable, entering an owned mine remains playable and its
claim stays pending; reconnect validates the saved `effectiveAtMs` boundary,
settles the interval once, and merges the result into newer local progress.

Gold, Amethyst, Ruby, Sapphire, Emerald and Diamond each have upper, middle and
deep floor treatments across all fifteen floors, with matching ore, surface,
structures, shaft, default and paid cargo, pour and impact effects. Boru's load
uses the selected resource; claim UI reuses the site's landmark and palette.
Reviewed native 360×640 captures cover floors 1, 5, 10 and 15 and the required
worker/cargo states. The asset manifest records source, normalization and
approval. `npm run verify` and `npm run verify:server` pass: 866 unit tests,
83 client E2E tests, 10 production smoke tests, 218 Deno tests, 146 live
integration tests and 15 live server E2E tests, plus lint, builds, secret scan
and synchronized schema documentation.

**Mine-floor gold pile grounding, 2026-09-30 — fixed:** moved the shared
pile/impact anchor 7 logical pixels down, aligning visible ore with the floor
line. Unit and Boru 1/5-worker browser checks, screenshot, lint/build pass;
no gameplay or save changes, uncommitted.

**Boru portrait/scoop feedback, 2026-09-30 — fixed:** enlarged separate
catalog portrait in Marketplace and Miner picker, with runtime art unchanged;
shifted scoop endpoint into the foreground gold pile. Focused visual, unit and
browser verification completed. No save/economy change; not committed.

**Boru SSR Miner, 2026-09-30:** approved calico/excavator integrated into
Marketplace and Miner assignment; catalog-only migration applied locally.
Four independent eight-frame sheets; 805 unit tests, lint/build, four focused
client browser tests and live purchase/equip/reload pass. One/five-worker mobile
views reviewed. Local migration only; no production deployment or commit.

**Surface cart cargo feedback, 2026-09-30 — fixed:** per-cart pickup memory
keeps gold visible until warehouse delivery; later tower refills cannot fill
departed carts. All cart variants pass the same empty/full lifecycle checks.
790 unit / 5 focused client browser / 1 live Hauler browser tests, lint/build
and diff checks pass. Presentation-only change, no new save fields.

**Rivet thrusters, 2026-09-30 — complete:** two softly animated cyan/white
jets follow the cart's coil outlets and mirror on return. Default/Tobi/inactive
slots show no jets. Mobile visual review, 42 scoped unit tests, live browser
regression (both cargo states/directions, lead/assistant, replacement),
lint/build and diff checks pass. No economy, save, or source-art changes.

**Purchased Hauler cart size, 2026-09-30 — fixed:** Tobi/Rivet carts enlarged
to 64px with corrected ground anchors; cats stay 52px, default carts 46px,
and Rivet keeps its hover. Empty/full and default-reset sizing are covered by
the live browser regression. 780 unit tests, scoped live browser, lint/build
pass; no gameplay or schema change.

**Hauler expansion, 2026-09-30 — complete:** Tobi SR/electric trolley and
Rivet SSR/maglev are purchasable and individually assignable to active carts;
default reset preserves ownership, reload preserves assignments, and one cat
cannot occupy two carts. Crew remains capped at five; each cat contributes
only its own share of hauling bonus. Original assets and provenance retained.
779 unit / 205 Deno / 4 scoped integration / 12 client browser / 1 live Hauler
browser tests, lint/build and synchronized DB schema checks pass. Migration
applied only to local Supabase without reset. Wider pre-existing E2E and
production-smoke failures remain separate open gates.

**Mine Overdrive, 2026-09-29 — implemented:** x4 mining/elevator/warehouse
for five real-time minutes, one free activation per eight hours, with exact
offline overlap and no wallet multiplication. Boost status/activation is
server-owned when configured and locally cached otherwise. Unit (775), Deno
(204), server integration (134), focused client browser (8), configured-server
browser (1), lint and build pass. The whole client E2E suite still reports
seven failures outside Boost (mine scroll, animation, Marketplace and related
fixtures); production smoke has stale 58px-navigation expectations and other
failures. Those broader suite gates remain open and are not attributed to Boost.

**Free Elevator Pip / purchased Mofy, 2026-09-28 — implemented:** Pip replaces
the former unassigned Mofy visual in the surface and moving cabin. Mofy still
costs Marketplace gold and appears only when an owned instance is assigned to
`elevator:main`; an idle owned Mofy does not alter the default. Original 2×2
Pip art, prompt, provenance and strict raster QC are recorded in the asset
catalog. 770 unit tests, 11 focused browser tests, lint, and build pass; no save, schema, or
production-formula change.

**Default Mica / purchased Miner ownership, 2026-09-28 — implemented:**
unassigned floors show Mica with base production but no owned instance;
Marketplace can repeatedly buy Forge, one server-owned instance per charge,
and the assignment picker uses only idle owned cats. The RPC now returns a
business rejection if one instance is submitted for a second floor. Focused
unit, client browser, live server integration, lint and build gates pass.

**Mica travel direction feedback, 2026-09-28 — fixed:** new right-facing
four-frame walk art replaces the nearly front-facing in-world travel sheet;
the existing `facesLeft` pose flips it for the leftward return. The separate
mining attack and Marketplace portrait are unchanged. Strict raster QC,
native-scale screenshots of outbound/strike/return, seven focused browser
tests, 768 full unit tests, lint, and build pass. No gameplay or save change.

**Mica animation scale feedback, 2026-09-28 — fixed:** the runtime-only idle
sheet now matches the upright mining sheet in apparent size and foot baseline;
the Marketplace catalog art is unchanged. The new sprite-pixel regression,
six focused browser tests, 768 unit tests, lint, build, and native-scale
attack/travel screenshot review pass. No simulation or save schema change.

**Mica miner-animation assignment feedback, 2026-09-28 — implemented:**
Mica no longer renders the generic fallback after same-role assignment. His
own four-frame idle/travel sheet and new four-frame strike sheet use the same
75 px runtime contract as Forge; the gold-impact effect is shared. Asset QC,
native-scale browser review, 768 unit tests, lint, build, and 12 focused
browser tests pass. No simulation or save schema change.

**Forge mining-action feedback, 2026-09-28 — implemented:** the miner now
travels from the white unloader to the gold pile, stops for a dedicated
four-frame pickaxe swing and separate four-frame gold impact, then returns to
deliver. All visible Forge miners use the same action with staggered core
delivery phases. Sprite processing strict QC, the full 766-test unit suite,
lint, build and eight focused browser tests (including strike/return) pass;
economy and save state remain unchanged.

**Bottom menu redesign, 2026-09-27 — implemented:** replaced the mismatched
purple/gold shared strip with five separate transparent 96×96 icon PNGs and
code-drawn HUD-navy/slate-steel menu chrome. The fixed region remains 360×80;
every tile has its own 64×64 hit target, label and press feedback. Raw art,
prompts, manifest and reproducible normalizer are retained under
`art-source/navigation-icons-v2/`. Raster QC, the navigation asset test, full
unit suite (764/764), lint, build, seven focused mouse/touch/layout browser
tests and native-size visual review pass. The two unused legacy public menu
images were removed; historical sources remain in `art-source/` and Git.

**Mine-floor workforce cap/productivity feedback, 2026-09-27 — implemented:**
mine levels continue increasing the raw workforce by one per 50 levels, but
only five miner sprites are rendered. Above raw count five, the shared
`rawCount / visibleCount` multiplier increases extraction throughput while
preserving the visible five-delivery cadence. Production rates and progress
bounds use the same productivity rule. Focused extraction, production-rate,
progress-bound, stage-animation, and mine-view tests pass; full unit suite
(765/765), mine-view E2E (5/5), production-stage E2E (13/13), lint, build, and
whitespace checks pass. No save schema or extra queue was added.

**Fixed chute pour origin feedback, 2026-09-27 — implemented:** per-cart pour
events remain independent, but every visible effect is now rendered at the
single chute-mouth coordinate. Regression coverage pins both X/Y coordinates.

**Per-cart gold-pour feedback, 2026-09-27 — implemented:** the surface scene
now pools one matching gold-pour animation for the lead and every visible
hauler. Each effect follows its own cart and uses that cart's loading pose;
queue-empty state hides all effects. Unit suite (762/762), production-stage E2E
(13/13), lint, and build pass.

**Surface hauler cap/productivity feedback, 2026-09-27 — implemented:** the
raw progression remains `1 + floor(min(warehouseLevel, 100) / 10)`, while the
visible crew is capped at five. Overflow is represented by the shared core
multiplier `rawCount / visibleCount`, reaching `2.2x` at raw count eleven.
Simulation applies it at the existing `warehouse.inputQueue` handoff, and the
production-rate helper uses the same value for HUD, offline, and anti-cheat
bounds. No save-state queue or schema field changed. Targeted tests, full unit
tests, lint, build, and production-stage browser coverage passed.

**OAuth fallback-port feedback, 2026-09-27:** fixed the redirect-domain change
when Vite falls back from `5173` to `5174`. The app already passed the active
origin to OAuth; local Supabase Auth rejected that origin because only `5173`
was allow-listed and then used the LAN `site_url` fallback at
`192.168.1.203:5173`. Auth redirects, shared Edge Function CORS, and LAN API
host rewriting now cover both dev ports, with regression tests added. Focused
unit/config tests (103 Vitest, 13 Deno), lint, build, local Supabase restart,
and a live Auth authorize probe all pass; the probe returned `302` while
preserving `redirect_to=http://localhost:5174/`. No save or schema change.

**Mine miner delivery cadence feedback, 2026-09-26:** fixed mine-floor crews
appearing on separate Y lanes and delayed queue updates. The core now shares a
derived worker-count rule with the renderer and adds one equal yield chunk for
each miner delivery milestone; all miners use one horizontal baseline. Focused
extraction and animation tests pass; full unit (757/757), lint, production
build, and mine/production E2E (17/17) verification pass. No save schema or
spendable-gold pipeline change.

**LAN OAuth/account feedback, 2026-09-25:** fixed the stale account-modal
loading state and silent Google callback error. `readGoogleIdentityReturnError`
captures Supabase query/hash errors, `identity_already_exists` becomes
informational guest guidance and immediately starts normal Google account
sign-in rather than requiring a second click; generic auth inspection failures
become a visible retry state, and async
identity updates repaint an already-open modal. Local Supabase redirect and
shared Edge Function CORS config now allow the active
`192.168.1.203:5173` origin plus the `192.168.*.*:5173` LAN glob for
`vite --host 0.0.0.0`; Auth also uses the LAN address as its local fallback so
provider returns cannot strand a remote device at `127.0.0.1`. Browser API
calls map the local loopback Supabase URL to the LAN page host for
another-device testing. Focused auth/server-stack tests, full lint, production
build, and the shared HTTP Deno tests pass. No save, economy, renderer, or
database schema contract changed.

**Elevator cabin alignment feedback, 2026-09-21:** after the initial 62×75
and 62×80 size corrections, the moving and surface elevator cabin remains
62×80 pixels while preserving the 64-pixel shaft width. The elevator cargo cat
remains on the shared 75-pixel runtime display box, with its center anchored
5 pixels above the cabin center so the visible feet stand on the upper edge of
the lower frame.
Added layout and production-stage regression coverage; focused layout tests
(30/30), production/runtime browser tests (13/13), the full unit suite
(745/745), lint, and build pass. This is presentation-only and does not change
save, economy, network, or schema contracts.

**UI feedback polish, 2026-09-21:** the Marketplace Buy confirmation for a
`Listed` catalog item uses `Buy listed cat` and `Back to cats` on one row at the
supported portrait widths. Collection shows an explicit unavailable/retry state
when hydration fails instead of reporting `0 owned cats`; the owned-count
summary remains reserved for a successful roster projection. Focused
Marketplace Playwright (6/6), Collection Playwright (4/4), lint, and build
pass. This is presentation-only and does not change save, network, or schema
contracts.

**Marketplace trading:** live seeded-catalog Buy plus player-to-player Sell,
Rent, and My listings are complete under
`memory-bank/marketplace-purchase-and-cat-assignment-implementation-plan-v1.md`
and `memory-bank/marketplace-trading-implementation-plan-v1.md`. The server
owns listing, sale, rental, cancellation, wallet, idempotency, expiry, and
role-compatible renter assignment state. The client renders live projections,
publishes/cancels listings, confirms sale/rental commands, adopts roster and
wallet/save revisions, and persists the result through the existing local/cloud
CAS path. Rent, Sell, and My listings are no longer preview-only.

**Cat collection and role assignment implementation:** the ordered phase/gate
plan is in
`memory-bank/cat-collection-and-role-assignment-implementation-plan-v1-draft.md`.
Phases 0–9 passed on 2026-09-19/20. The pure core domain, V3 save/migration,
server ownership/purchase/assignment API, fourteen-table RLS coverage, typed web
adapter, active-save hydration, non-blocking boot hydration, and responsive
Collection list/detail UI, assigned-cat replacement flow, runtime role-slot
binding, simulation production effects, and the conflict/offline/recovery/
release audit are complete. The full feature acceptance gate passed, including
manual browser review and the sync-banner click-through regression fix.

**Cat collection and role assignment:** the draft product contract was added
on 2026-09-19 in
`memory-bank/cat-collection-and-role-assignment-spec-v1-draft.md`. It covers
purchase-to-collection, owned-cat detail, same-role replacement in mine slots,
production modifiers, and reload/re-login persistence. Phases 0–9 now implement
the V3 projection, server ownership/assignment path, hydration, Collection UI,
expected-revision assignment adapter, runtime slot binding, and role-based
production modifiers. The seeded Buy handoff and live trading surfaces now call
the ownership and marketplace APIs; the collection, assignment, sale, rental,
and listing features are authoritative and complete.

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

**Marketplace asset implementation.** Phase 0 completed 2026-09-19: the
approved role matrix keeps Elevator, Warehouse, and Miner as Marketplace v1
roles, keeps Unloader future-only, and pins the four v1 attribute keys, role
weights, runtime display sizes, and 2×2/4-frame versus 4×2/8-frame animation
contracts. The focused role-matrix suite (6 tests), full unit suite (702
tests), lint, build, and Marketplace E2E (3 tests) passed. Phase 1 completed
2026-09-19: four canonical preview portraits now have stable allowlisted asset
IDs and `128×128` RGBA public paths. Its registry suite (4 tests), full unit
suite (706 tests), lint, build, Marketplace E2E (3 tests), asset reports, and
contact-sheet/native-scale review passed. Phase 2 — Marketplace presentation
icon family — completed 2026-09-19 with three role icons, four attribute icons,
three skill icons, and six color-independent lifecycle icons. Its registry
suite (4 tests), full unit suite (710 tests), lint, build, Marketplace E2E (3
tests), icon-render E2E (1 test), and native 24/32px screenshot review passed.
Phase 3 — listing portrait catalog expansion — completed 2026-09-19. The
canonical preview registry now exposes nine stable IDs: three Elevator
portraits, four Warehouse portraits, and two dedicated Miner portraits (Mica
N and Forge SSR). Mica and Forge were generated as original 2×2/4-frame sheets
and passed strict raster QC; all nine public portraits pass the 128×128 RGBA
asset report. The catalog contact sheet was reviewed at native scale, and the
browser catalog smoke confirms every canonical portrait loads at 128×128.
Focused registry/role/icon tests pass (14), the full unit suite passes (710),
lint and build pass, and the Marketplace/icon/catalog E2E smoke passes (5).
Phase 4 — premium 8-frame animation families — completed 2026-09-19. All eight
approved premium rows (Mofy, Win, Elon, Baron, Cipher, Gauge, Nautilus, Forge)
now have exact 4×2/8-frame 128×128 families at 110 ms. Seven were deterministic
ping-pong reconstructions from QC-passed 4-frame candidates; Mofy was preserved
as the authored 8-frame reference. Every strict processor run has zero empty,
edge-touch, or clamped frames; the eight-sheet 512×256 RGBA asset report and
manifest test pass. Mica remains the separate N 2×2/4 baseline, Unloader stays
future-only, and no runtime integration or transaction behavior changed.
Phase 5 — Marketplace registry/UI application — completed 2026-09-19.
`MarketplaceModal` now resolves every portrait through the local allowlisted
asset registry, presents role/rarity/4-stat/role-fit/skill/availability data
with the Phase 2 icon family, and falls back to the safe placeholder when a
portrait is missing or fails to load. The 390×844 and 320×568 Marketplace
flows, detail stat/skill assertions, catalog HTTP checks, and failure fallback
browser test pass; cards do not decode premium sheets at open. This phase was
presentation-only; the later Marketplace trading phase now supplies the
authoritative ownership and transaction path.
Phase 6 — listing and transaction state presentation — completed 2026-09-19.
Added the UI-only state contract for Idle, Assigned, Listed, Rented, Expired,
and Locked, with approved icons, explanations, and explicit non-conflicting
assign/list/rent permissions. Marketplace Listed cards/details consume it;
authoritative ownership and transaction behavior remain untouched. State tests,
715 unit tests, lint, build, and six browser tests pass. Phase 7 — in-world
runtime integration — completed 2026-09-19 after explicit approval: Mofy,
Baron, and Forge are applied to the elevator, warehouse, and miner slots
through stable runtime sheets; missing sheets fall back to bundled placeholders;
the unloader remains future-only; and runtime state remains presentation-only.
Phase 7 validation passes 720 unit tests, lint, build, the focused runtime
browser test, and full Playwright E2E at 56/56. Phase 8 release audit completed
2026-09-19 for the catalog/UI/runtime scope: all nine public portraits resolve
through registry, manifest, source, and provenance; the 16-icon family is
complete; selected runtime paths are audited; and unselected variants remain
catalog-only. Release-audit tests pass.

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
