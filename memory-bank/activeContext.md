# Active Context

## Current Focus

**Production Telegram Mini App, 2026-10-06 — rollout in progress.** Vercel
serves `https://game-gold-miner-sepia.vercel.app/` from `master`. Supabase
project `ntzdbwuouugvadisazge` now has all 19 migrations and seven
player-facing Edge Functions. The exact Vercel origin is allowed by function
CORS. `TELEGRAM_BOT_TOKEN` and a generated recovery pepper are in Supabase
Secrets; public Auth signups are disabled against predictable Telegram
placeholder-email preemption. BotFather confirms the GAME menu URL is the
production Vercel URL. PR #14 is merged and production Ready; `/`,
`/health.html` and the vendored Telegram SDK return HTTP 200. The real iPhone
loads `/health.html` in Safari, but GAME still shows Telegram's native loading
placeholder. Supabase has no created Telegram user. A follow-up fix draws the
HTML loading shell and sends native `web_app_ready` before requesting the SDK,
so a stalled SDK request cannot hide the shell or hold the native placeholder.
The remaining gate is to deploy this fix and verify a real phone game launch,
session creation, and returning-player sign-in.

**Multi-mine Map, 2026-10-05 — complete and release-verified.** The V4
portfolio now provides six purchasable resource sites, one shared wallet, one
foreground mine, per-mine offline intervals, fixed-price progression,
mine-qualified cat assignments and mine-bound Boost. Gold, Amethyst, Ruby,
Sapphire, Emerald and Diamond each use their own palette, ore, structures,
cargo and upper/middle/deep floor family across all fifteen floors. Native
360×640 captures cover floors 1, 5, 10 and 15, default and purchased workers,
empty/full cargo, Map landmarks and offline-claim presentation.

Local and configured accounts use the same player rules. A configured player
can enter an owned mine while cloud sync is unavailable; the client records a
durable version-2 command journal, keeps the target mine active, and shows the
reward as pending. Reconnect submits the original server-time boundary, the
server validates and settles that exact interval once, and the accepted result
merges into newer local progress without double credit. V1–V3 saves migrate to
V4. `npm run verify` and `npm run verify:server` pass: 866 unit, 83 client E2E,
10 production smoke, 218 Deno, 146 live integration and 15 live server E2E
tests, plus lint, builds, secret scan and synchronized schema documentation.

**Mine-floor gold pile grounding, 2026-09-30 — fixed locally.** The shared
pile layout is 7 logical pixels lower so the visible ore (not its transparent
canvas) meets the floor line. Mining impacts follow the same anchor; miners,
excavator, economy and saves are unchanged. Unit, Boru 1/5-worker browser,
lint and build pass; scoop screenshot reviewed. Uncommitted.

**Boru feedback polish, 2026-09-30 — verified locally.** The catalog portrait
is a separate 128px derivative with 116x92 visible bounds, shared by Marketplace
and the assignment picker; the in-floor sheets keep their size. The scoop stop
is 16 logical pixels closer to the pile so the foreground gold hides the
lowered bucket. Card/candidate and scoop screenshots reviewed; focused unit,
client browser, live Buy/assign and lint/build checks passed. Uncommitted.

**Boru SSR Miner, 2026-09-30 — implemented and locally verified.**
Four eight-frame excavator sheets now follow extraction progress: empty travel,
scoop/lift, loaded return, deposit beside the white cat. Shared scale/track
anchor; one purchased instance per floor, default Mica unchanged. Local catalog
migration applied: 42,000 gold, stats 96/68/95/90. Live Buy -> assignment ->
reload passed; 805 unit tests, four focused browser tests and lint/build pass.
One/five-worker mobile screenshots reviewed. No save/schema structure or core
production changes. Catalog migration is local only; no production deployment.
Uncommitted; the compact five-machine crew can overlap on its shared lane.

**Surface cart cargo feedback, 2026-09-30 — fixed.** Each cart now latches a
pickup under the chute and retains it until the warehouse handoff, independent
of later tower-queue changes. Empty departures cannot fill in transit. Default,
Tobi and Rivet share the rule; formation spread fades at both physical stops.
790 unit tests, five focused client browser tests, the live Hauler assignment
test, lint/build and diff checks pass. Mobile before/after screenshots reviewed.
No economy/save/schema changes; dev server 5174 responds. Not yet committed.

**Rivet thruster feedback, 2026-09-30 — implemented.** Two cyan/white jets
with soft glow pulse beneath Rivet's coils, in both directions and all cargo
states. They track the cart without resizing or shaking the cat/vehicle and
clear on replacement/inactive slots. Mobile screenshot reviewed; 42 scoped
unit tests, live purchase/assignment/effect browser regression, lint/build and
diff checks pass. Presentation only, no new raster assets or saved state.
Dev server is running on port 5174.

**Purchased Hauler cart size, 2026-09-30 — fixed.** Tobi/Rivet vehicles now
use 64px boxes instead of 46px (+39%), with visible wheel/coil bottoms aligned
to the default ground line and Rivet's 4px hover retained. All cats remain
52px; default handcarts remain 46px. Empty/full swaps preserve scale and origin.
780 unit tests, live Hauler purchase/equip/reload/default-reset browser test
(including both cargo textures), lint and build pass. Presentation only;
no PNG, economy, persistence, or schema change.

**Hauler expansion, 2026-09-30 — implemented, scoped gates passed.**
Default surface crew keeps wooden handcarts; Tobi SR (18,000 gold) uses an
electric trolley and Rivet SSR (42,000) a wheel-free maglev. Every purchase is
one level-1 instance for one `hauler:1..5` slot. The role panel exposes active
Cart selectors, Change cat and Use default Hauler. Bonuses are averaged only
over active carts and compose once with warehouse-manager/overflow effects.
Separate right-facing walk sheets, portraits and empty/full carts passed
raster QC. Forward migration was applied locally without reset. Unit (779),
Deno (205), scoped live integration (4), client browser (12), Hauler live
browser (1), lint/build and schema-copy equality pass. Existing unrelated
repository-wide E2E/production failures remain open. No commit or production
deployment was requested; dev server is available on port 5173.

**Mine Overdrive, 2026-09-29 — implemented, scoped gates passed.**
The free Boost activates once per eight hours, runs all three production
stages x4 for five real-time minutes, and applies only the active overlap to
offline rewards. A dedicated modal and bottom-button countdown are wired.
The configured path uses a server-clock, atomic activation RPC and a
server-owned row; the client-only path uses localStorage. The 775-test unit
suite, 204 Deno tests, 134 live server-integration tests, eight focused client
browser tests, one configured-server browser test, lint and build pass. The
repository-wide E2E/production suites still have unrelated stale-layout and
scroll/Marketplace failures; these are not claimed as a passed release gate.

**Free Elevator Pip / purchased Mofy, 2026-09-28 — implemented.** Unassigned
`elevator:main` now shows the new silver-tabby Pip in both elevator positions.
Pip is a 2×2/four-frame, 128 px, 220 ms visual baseline with no owned instance
or bonus. Mofy's existing SSR Marketplace listing and 8-frame runtime art are
unchanged, but render only after an owned Mofy is assigned. The assignment
panel identifies Pip and explains how to replace him. Strict raster QC,
770 unit tests, 11 focused browser tests, lint, and build pass; no
schema/economy change.

**Default Mica and per-floor purchased Miner assignment, 2026-09-28 — implemented.**
Every unassigned mine floor now renders Mica's walk/strike art, including
newly unlocked floors; this baseline is presentation-only and creates no owned
cat, skill bonus, or save field. The assignment panel identifies Mica as the
default and offers owned, idle Miner instances for replacement. Forge remains
Marketplace-only at 36,000 gold per instance; the Buy success view permits
another purchase with a fresh idempotency key. A forward-only RPC migration
normalizes the nullable renter check and rejects reusing an Assigned cat in a
second slot with `cat_not_assignable` instead of a unique-constraint 500.

**Mica walk-direction feedback, 2026-09-28 — fixed.** His previous travel
frames faced nearly forward, so `flipX` could not visibly distinguish the
outbound and return routes even though the pure pose already set `facesLeft`
correctly. A new four-frame right-facing stepping sheet now serves runtime
travel; the leftward return mirrors that sheet, and mining keeps its separate
right-facing pickaxe action. The new art matches the shared strike foot line
and scale. Catalog portrait, route timing, economy, and save format are
unchanged. Directional browser states, pixel geometry, lint and build pass.
The full 768-test unit suite also passes.

**Mica in-world animation scale feedback, 2026-09-28 — fixed.** The approved
catalog idle art occupied 92–95 px of each 128 px cell while Mica's upright
strike frames occupied about 76 px, producing an obvious size jump at the
travel/mining transition. The runtime-only idle sheet is now reprocessed from
the original raw art at a shared 73–75 px body height and aligned to the same
visible foot line as the attack. Catalog portrait and preview remain unchanged;
no per-action Phaser scaling, core, or save change was needed. Pixel geometry
regression, assignment browser tests, lint, build, and 768 unit tests pass.

**Mica miner-animation assignment feedback, 2026-09-28 — implemented.**
Changing a floor from Forge to the orange Mica previously resolved no local
runtime sheet and fell back to the generic Step 32A miner; only Forge's asset
ID enabled the strike action. Mica's approved four-frame idle sheet now has a
runtime copy, a separate generated four-frame pickaxe sheet, and a role-matched
registry entry. Both integrated miners select their own attack art by asset ID
while sharing the gold-impact sprite and progress-driven route. Assignment
authority, economy, and save format are unchanged.

**Forge mining-action feedback, 2026-09-28 — implemented.** Forge's floor route
now leaves the white unloader, reaches the gold pile, holds position for a
four-pose pickaxe strike and a separate four-frame ore-impact effect, then
returns to the unloader. One progress-driven lap still ends at each core
delivery milestone; assistants keep their workforce-derived phase offsets.
New attack and impact sheets are separate from Forge's idle sheet, with raw
sources, reproducible processing and provenance retained under `art-source/`.
The presentation adds no save fields or production changes.

**Bottom menu redesign, 2026-09-27 — implemented.** Browser feedback found the
former purple/gold shared strip mismatched the mine and requested independent
icons. Five transparent 96×96 PNGs now load as separate Phaser textures and
display at 42×42. `BottomNavigationView` draws the HUD-navy backdrop,
slate-steel tiles, gold divider, labels and press feedback in code, with five
64×64 hit regions in the unchanged 360×80 safe area. Map remains future
behavior; the later Mine Overdrive work now gives Boost gameplay and a
server-owned activation row.

**Mine-floor workforce cap/productivity feedback, 2026-09-27 — implemented.**
The mine-floor rule now keeps `rawCount = 1 + floor(mineShaftLevel / 50)`,
caps the visible crew at five, and converts overflow into
`productivityMultiplier = rawCount / visibleCount`. Extraction delivery keeps
five visible milestones, while the multiplier raises floor output above level
200. Production rates and anti-cheat in-flight allowances use the same helper;
no saved field or schema change was needed.

**Fixed chute pour origin feedback, 2026-09-27 — implemented.**
The per-cart gold-pour pool now keeps every effect at the single fixed chute
mouth (`SURFACE_GOLD_POUR_X`, `SURFACE_GOLD_POUR_Y`). Each cart still controls
whether its matching effect is visible and which frame it shows, but carts no
longer move the falling-gold origin horizontally.

**Per-cart gold-pour feedback, 2026-09-27 — implemented.**
The surface loop previously rendered one fixed gold-pour sprite for the lead
cart; assistant poses calculated the same loading event but had no effect
instance. `BootScene` now pools one gold-pour sprite per visible cart, positions
each at its own cart beneath the chute, and binds visibility/frame to that
cart's loading pose. Empty queues still suppress every pour. Unit and focused
production-stage browser coverage pass.

**Surface hauler cap/productivity feedback, 2026-09-27 — implemented.**
The shared core helper keeps `rawCount = 1 + floor(min(warehouseLevel, 100) / 10)`,
caps the visible crew at five, and derives `productivityMultiplier =
rawCount / visibleCount`. It is `1x` through raw count five and reaches `2.2x`
at raw count eleven. `BootScene` renders `visibleCount`; `advanceSimulation`
and `calculateMineProductionRates` apply the same multiplier at the existing
`warehouse.inputQueue` handoff, so foreground, offline, HUD, and anti-cheat
rate calculations stay aligned. No save-state queue or schema field was added.
Targeted tests, full unit tests, lint, build, and production-stage browser
coverage are the validation gate; the detailed settled decision is recorded in
`archive/decision-log.md`.

**OAuth fallback-port feedback, 2026-09-27.** Running Vite on `localhost:5174`
because the default `:5173` was occupied exposed a configuration gap: the
client passed the correct `window.location.origin`, but local Supabase Auth
only allow-listed `:5173`, so it rejected `:5174` and fell back to the LAN
`site_url` at `192.168.1.203:5173`. Auth redirect allow-lists, Edge Function
CORS, and loopback-to-LAN API rewriting now cover both Vite dev ports `5173`
and `5174`; the LAN `site_url` remains the safe fallback for omitted or
invalid redirects. No save, economy, or database schema contract changed.

**Mine miner delivery cadence feedback, 2026-09-26.** Browser review found that
multiple mine miners were drawn on staggered Y lanes and the floor queue only
increased once after a full multi-miner cycle. The shared core worker rule now
derives the same one-plus-one-per-50-level count used by the renderer, adds an
equal `cycleYield / workerCount` chunk at each delivery milestone, and preserves
the full-cycle total. `MineFloorView` phase-shifts every miner on one horizontal
baseline so each arrival lines up with one queue update. The save schema and
elevator/warehouse ownership of spendable gold remain unchanged.

**LAN OAuth/account feedback, 2026-09-25.** Browser review found that a
Google return containing `identity_already_exists` could leave the account
modal on `Loading`, while the callback URL could fall back from a `192.168.x.x`
origin to `127.0.0.1`. The client now parses query/hash OAuth errors before
clearing them, shows collision or account-check copy, re-renders an open modal
when async identity state settles, and offers retry after an inspection error.
The already-linked collision is informational and keeps the guest's primary
flow on the normal `signInWithOAuth` account-login path automatically, so the
player does not need a second manual click; only an unexpected handoff or
account inspection failure uses the red error treatment.
Supabase local Auth allows the exact active origin `http://192.168.1.203:5173`
and the `http://192.168.*.*:5173` glob, while OAuth calls keep passing the
exact `window.location.origin`; the Auth `site_url` fallback is also the LAN
origin so an SDK/provider fallback cannot strand a remote device at
`127.0.0.1`. Local browser API calls rewrite a loopback `VITE_SUPABASE_URL` to
the same `192.168.x.x` host when the page is served on LAN; the shared Edge
Function CORS policy allows only that private-LAN origin on port 5173. This is
an auth/UI/configuration fix only; save, economy, renderer state, and database
schema are unchanged.

**Elevator cabin alignment feedback, 2026-09-21.** Browser review found that
the moving elevator cat's feet extended below the cabin's lower frame. The fix
keeps the 64-pixel shaft and 62-pixel cabin width unchanged, uses an 80-pixel
cabin height, and anchors the elevator cat 5 pixels above the cabin center
while keeping the shared 75-pixel runtime display box used by surface and floor
roles. Layout and production-stage regressions cover the size and anchor
contract; this remains presentation-only
with no save, economy, network, or schema change.

**Marketplace trading, 2026-09-20.** The follow-up purchase plan and the new
`marketplace-trading-implementation-plan-v1.md` are complete. Buy remains
server-authoritative for seeded contracts; player-owned cats can now be listed
for fixed-price sale or hourly rental, browsed in live Sell/Rent surfaces,
cancelled from My listings, purchased by another account, and rented for 1–24
hours. Wallet/save revisions, caller-scoped Collection projections, idempotency,
lazy expiry, renter assignment, and reload-safe local/cloud reconciliation are
implemented. The Marketplace no longer exposes Rent, Sell, or My listings as
preview-only UI. A 2026-09-21 browser feedback pass fixed the remaining Buy
confirmation CTA wrapping, changed Listed catalog actions to
`Buy listed cat` / `Back to cats`, and made Collection's load failure visually
distinct from a valid zero-cat projection; focused browser, lint, and build
gates pass.

**Cat collection and role assignment implementation, 2026-09-20.** Phases 0–9
are complete and the full feature acceptance gate passed. The pure domain, V3
local save/migration, server ownership and assignment API, RLS/integration
gates, typed web adapter, active-save hydration, non-blocking boot hydration,
responsive Collection list/detail UI, authoritative assigned-cat replacement,
runtime role-slot binding, production modifiers, and conflict/offline/recovery
audit are implemented. The authoritative server projection is data-only;
renderer assets remain outside save state. Manual browser review also closed the
sync-banner click-through issue by guarding Phaser's window-level mouse input.

**Cat collection and role assignment draft, 2026-09-19.** The new
`cat-collection-and-role-assignment-spec-v1-draft.md` defines the post-purchase
collection/detail journey, role-compatible mine replacement, authoritative
assignment, role-based production effects, and reload/re-login persistence.
The implementation plan and Phase 0–9 gate results are recorded in
`cat-collection-and-role-assignment-implementation-plan-v1-draft.md`. The
the seeded Buy path now consumes the same server ownership API; the Collection UI now
consumes the typed account projection, while replacement mutations remain in the
server-authoritative path and role effects flow through the deterministic core.

**Marketplace runtime presentation, 2026-09-19.** Phase 7 is complete after
explicit approval. Mofy (`elevator-cargo-cat:SSR`), Baron
(`warehouse-manager:SR`), and Forge (`miner:SSR`) now use their approved exact
4×2 sheets with eight 128×128 frames at 110 ms in the elevator, warehouse, and
mine-floor presentation slots. Runtime copies are local and stable; missing
runtime copies fall back to the bundled 4-frame placeholder, so offline boot
remains playable. The integration is presentation-only: no role, sprite,
texture, frame, or animation state enters save data or simulation formulas.
`public/assets/marketplace/mofy.png` remains the single extracted portrait
frame for the Marketplace card/detail consumer.

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
pass. Phase 7 runtime integration completed after explicit approval. The
selected Mofy, Baron, and Forge IDs resolve through local runtime sheets and
role-slot diagnostics; the unloader remains future-only and other catalog
variants remain preview-only. Fallback, identity, scale, offline boot, and
no-save/no-simulation coupling are covered by tests. Phase 8 release audit
completed 2026-09-19 for the catalog/UI/runtime scope: all nine public
portraits resolve through registry, manifest, source, and provenance; the
16-icon family is complete; selected runtime paths are audited; and full
Playwright E2E passes 56/56.

**Server milestone implementation close, 2026-09-19.** Steps 33–37 are
implemented and their local gates are green: account/data deletion, backup and
restore, monitoring, load/performance, and the final documentation audit. The
repository does not claim a hosted production deployment or production
credentials. Earlier server steps that were explicitly implemented-but-awaiting
user validation remain labeled below; that is a validation status, not an open
implementation task.

**Step 34 evidence (2026-09-19).** `npm run backup:restore` performed a real
custom-format `pg_dump --schema=public` from `supabase_db_cat-mine-idle`,
restored it with `pg_restore` into a fresh `postgres:17-alpine` container, and
matched all seven public table names and row counts. The dump was 35,888 bytes;
backup took 60 ms, restore 105 ms, and total drill time was 2,833 ms including
scratch startup. Only the public application schema was restored: Auth
internals, sessions, identities, runtime caches, and secrets are explicitly
separate recovery domains in `ops/backup-policy.md`.

**Step 35 evidence (2026-09-19).** `scripts/monitoring-check.mjs` checks the
save-sync health endpoint and evaluates server-error, save-rejection, and
auth-failure rates after a 20-event minimum. Thresholds are 5%, 10%, and 25%;
the healthy fixture exits 0 and the deliberately failed fixture exits 2 with
all four alerts. Production log/SQL adapter hand-off is documented, while no
production deployment or credentials are claimed.

**Step 36 evidence (2026-09-19).** `npm run load:server` created real anonymous
GoTrue identities and drove 20 concurrent players through 60 accepted uploads:
min/p50/p95/max latency 104/135/238/241 ms, throughput 48.48 uploads/second,
and 49 ms for the 7,200,000 ms maximum long-absence re-simulation. The script
asserts p95 ≤ 500 ms, throughput ≥ 20 uploads/second, and re-simulation ≤ 250
ms; sync remains outside the client Phaser frame loop.

The same Step 36 gate's client benchmark also passed with `npm run test:perf`:
the full 600,000 ms Pixel 5/Chrome 4×-CPU run held 15 unlocked floors, 695
Phaser objects, 399 DOM nodes, 16.7 ms frame p95, 317,376 bytes live-heap
growth, -385 bytes/second sustained slope, and 73.7 ms scroll-input p95. The
budget assertions passed, including the two-vsync stall rate.

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

Step 32 adds the separate append-only `account_audit` timeline. Database
triggers record identity changes, recovery-code issuance, entitlement grants
and revocations, and rejected saves; `recovery-code` records redemption only
after session minting succeeds through a service-only RPC. Client roles have no
policies, the service role cannot update or delete rows, and the account link is
`on delete set null` for Step 33's anonymization work. The implementation gate
is open; no acceptance-gate entry has been added. A review regression also
proves that an identity-removal trigger during `auth.users` deletion preserves
the event with a null link instead of aborting account deletion.

**Step 33 adds authenticated account/data deletion (2026-09-19).** The
account-delete Edge Function authenticates the bearer token and ignores any
body-supplied id; its service-only delete_account(uuid) RPC anonymizes every
account audit row, clears personal detail, retains it for exactly 30 days, and
deletes auth.users so the ordinary six application tables cascade away. A
parent auth.users before-delete trigger also protects direct Auth-admin
deletions from the FK set-null ordering edge case. The integration test
enumerates all seven public application tables, seeds every path, deletes the
real test account, and verifies no ordinary row or personal audit field
remains. purge_expired_account_audit is service-only. Unit (6), focused
integration (4), migration reset, and schema invariant checks pass.

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
`supabase/migrations/*.sql`, not hand-listed, so an eighth table cannot slip
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
2. No server implementation step remains open after the Step 37 close. The
   remaining work is user validation of the earlier gates explicitly marked as
   awaiting validation in `progress.md`.
3. **Step 24's L2 is closed by Step 25:** a `429` is
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
