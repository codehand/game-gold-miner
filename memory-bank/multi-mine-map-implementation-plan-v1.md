# Multi-mine Map implementation plan v1

**Status:** complete, updated 2026-10-05. Product rules and asset
scope come from `multi-mine-map-design-draft.md` and the user's two confirmed
decisions: one shared wallet; inactive owned mines accrue claimable offline
rewards while another mine is played. This plan does not waive any current
offline-first, cloud-save, Marketplace, Collection, or anti-cheat contract.

## Target behavior and non-negotiable invariants

1. Gold Mine is the migrated starter mine. The Map has six authored locations:
   Gold, Amethyst, Ruby, Sapphire, Emerald, Diamond. Each has 15 independent
   floors and independent production/upgrades, and a complete site art family.
2. There is exactly one account wallet and one foreground mine. Foreground
   deliveries and a claim add to that wallet; inactive mines never add live
   wallet gold or appear in the HUD's live rate.
3. Each inactive owned, previously visited mine may accrue one capped offline
   interval. A claim pays a specific mine/interval once, including retries,
   reload, network failure and two-device races. Purchased but never visited
   mines start with no accrued reward.
4. Foreground-to-background, background-to-foreground and mine-to-mine
   boundaries have no elapsed-time overlap or gap. Hidden-tab time is offline,
   not also simulated at full foreground rate. Two-hour cap, 50% efficiency and
   server-clock authority apply to the correct per-mine interval.
5. Mine purchase uses a fixed authored price from the shared wallet, checks
   previous-site ownership/progress, and is atomic/idempotent. Marketplace
   uses that same wallet. A cat instance occupies at most one mine-qualified
   slot in the whole account. A Boost activation affects its bound mine only.
6. A v3 save upgrades to one portfolio without losing Gold Mine progress,
   wallet, cat ownership/assignments, boost eligibility or cloud revision.
   Failed migration and save conflicts preserve recoverable data.
7. Only the active mine's art family is resident/rendered. Every floor in a
   site uses its resource's shape/material palette, with three depth bands.
   The mine, transport, surface and UI agree on the resource identity.

## Phase 1 — Catalog, economy blockout, and core portfolio

**Input:** current `GameState`, `BaseGameBalanceConfig`, pure fixed-step
simulation, offline grant, and the six-site design draft.

1. Add a typed, stable site catalog in `src/config/` with ids, names, resource
   value, fixed unlock price, prerequisite and visual keys. Gold Mine is first
   and free. Keep the values provisional until the progression simulator runs.
2. Add a pure `PortfolioState` in `src/core/` with account wallet, active mine
   id, owned-site records, independent production states, inactive snapshot
   rates, interval ids/cursors and per-mine monotonic counters. Never persist
   a second copy of wallet gold in inactive mines.
3. Add pure purchase, leave, enter/claim, and resume commands with explicit
   refusal reasons, immutable state and injected time. Reuse the current
   `GameState` simulation through a selected-mine adapter while migrating
   ownership of gold outward. Keep resource conversion and rates consistent.
4. Simulate representative fresh and high-progress portfolios, including
   rotations through all owned mines; set prices against time-to-next-site and
   payback, rather than deriving dynamic prices from the live wallet.

**Gate:** deterministic unit tests prove one wallet, one active mine, no live
inactive ticks, correct site gates/prices, exact rate conversion, zero reward
before first visit, cap/efficiency, claim idempotency, and no overlap at every
switch or visibility boundary. Existing single-mine core tests still pass.

## Phase 2 — Portfolio save, migration, and local lifecycle

1. Introduce save schema v4 with strict validation of site keys, one active
   mine, account wallet, per-mine production and offline intervals, roster and
   monotonic claim counters. Keep the old version dispatcher and add a pure
   v3→v4 migration; never rewrite the only old copy before a valid v4 write.
2. Update IndexedDB, the lifecycle journal, load recovery, local/cloud
   repository, save diagnostics and backup path to store the portfolio as one
   atomic document. All foreground commands force a durable save before their
   UI reports success.
3. Migrate unqualified cat slot keys to Gold Mine, including the local roster
   projection; reject duplicate use of one cat across any sites.
4. On page hide close the active interval; on resume offer its offline grant
   before foreground simulation catches up. A failed local write keeps the
   interval pending and the wallet unchanged.

**Gate:** v1/v2/v3 fixtures reach valid v4, preserving every old Gold Mine
field and owned cat. Save/reload, hidden-tab resume, write failure, corrupt
candidate and newer-version refusal are tested. IndexedDB and localStorage
journal schema documentation remains byte-identical in `architecture.md` and
`techContext.md` where required.

## Phase 3 — Server authority and account integrations

1. Extend save-sync validation and anti-cheat re-simulation to portfolio v4:
   server time anchors each mine interval, delivered/claimed lifetime counters
   are monotonic, only one mine can be foreground for an account, and claim
   ids cannot pay twice. Preserve the v3 migration path until old clients are
   no longer supported. Adapt conflict dominance to per-mine progress without
   adding divergent wallets or claim totals together.
2. Add atomic, revision-checked purchase, switch and claim operations with
   idempotency keys and account ownership checks. Provide the corresponding
   local-first client adapters and an honest pending state when configured
   accounts are offline. Never let a failed server response burn a claim.
3. Route Marketplace purchase/sell/rent and Collection assignment through the
   account wallet and mine-qualified slot keys. Update server catalog/slot
   validation and any affected migration in the same change.
4. Bind Mine Overdrive activation to the selected mine, retain its account-wide
   cooldown, and apply the overlap to that mine only. Update leaderboard
   lifetime gold to sum each mine's deliveries and claims once.

**Gate:** Deno and live local-Supabase integration cover replayed purchases,
claims and switches; two-device stale revisions; clock manipulation; old save
uploads; shared wallet reconciliation; cross-mine duplicate cat assignment;
Boost on an inactive mine; and leaderboard monotonicity. Database migrations
are forward-only, with the complete schema copied identically into both
required Memory Bank files.

**Completed checkpoint (2026-10-05):** configured boot uses the V4 reconcile and
serialized command queue; Collection and Marketplace adopt the authoritative
shared wallet and mine-qualified roster; Boost activation is an atomic
mine-bound V4 command with one account cooldown. Deno, live integration and
server browser tests cover replay, concurrency, stale revisions, V1–V3 migration,
shared-wallet cat trades, cross-mine assignments, returning-account missing
saves and local fallback when cloud boot is unavailable. Genuine local/cloud
forks preserve both V4 documents and open the existing progress chooser.
Offline configured entry freezes a V4 `pendingClaim`, writes a version-2
transaction journal with the exact source document and entry boundary, keeps
the new mine playable, and replays/settles the server grant once after reconnect
or reload without replacing newer local live progress.

## Phase 4 — Map, mine handoff, and responsive UI

1. Make the existing Map nav item open a real overlay with an authored six-node
path, site names/icons, ownership and reward status, a wallet header, site
detail, fixed price/gate explanation and purchase CTA. Use text and shape as
well as color for status; keep touch targets at least 44 logical pixels.
2. Entering an owned mine offers the exact pending reward; claim once and
   switch, or enter with an explicit server-pending reward when disconnected.
   Restore scene input/focus and mine scroll position on close/switch.
3. Bind `BootScene` and the HUD to the selected mine snapshot, site name,
   resource icon and art key. Rebuild only the selected mine's scene/runtime;
   inactive mines remain data-only. Keep the 360x640 reference layout usable
   in taller and wider 9:16 windows.

**Gate:** browser tests and visual review cover buying, insufficient gold,
locked prerequisites, enter/claim, repeated taps, switching back, reload,
offline-pending, keyboard/touch navigation and small portrait viewports.

## Phase 5 — New site art and native-scale review

**Checkpoint (2026-10-03): complete.** The manifest and browser diagnostics
cover every non-Gold family. Native 360×640 captures were reviewed for upper,
middle and deep positions in all five new sites; Boru uses resource overlays,
and claim UI reuses site identity art.

1. Approve one representative floor plus surface composition for each resource
   at native display scale. Gold reuses its current approved family; the five
   new sites get distinct rock silhouettes, vein/ore shapes, palettes and
   surface landmarks. Record source/provenance and design constraints.
2. Produce the matched family per new site: three depth bands of cutaway wall,
   ground, shaft/structural props; ore vein and persistent pile; impact chips;
   full cargo in cart/cabin/hopper/warehouse; surface entrance, tower,
   warehouse and backdrop; Map landmark, icon, thumbnail and claim accent.
   Audit baked-in gold on miner/excavator sheets and make it swappable.
3. Normalize dimensions, pivots, alpha, seams, frame counts and texture memory;
   bind asset keys through a site registry. Load only the active site family.

**Gate:** asset manifest and contact sheets show all six sites. In-game native
scale screenshots/motion checks cover floors 1, 5, 10 and 15, default and
purchased miners, empty/full cargo, surface-to-shaft alignment, no floating
pile, readable controls and no gold cargo in non-gold mines.

## Phase 6 — Release audit and documentation

**Checkpoint (2026-10-05): complete.** Feature, aggregate client/server,
production, documentation and archive gates passed.

**Recorded evidence:** `npm run verify` passed lint, 866 unit tests, 83 client
E2E tests, build, bundle-secret scan and 10 production smoke tests.
`npm run verify:server` passed the server-core build, 218 Deno tests, local
Supabase migrations and health checks, 146 live integration tests and 15 live
server E2E tests. Native 360×640 captures reviewed all five non-Gold sites at
the upper, middle and deep bands; Gold remains the established reference site.

1. Run focused unit, browser, Deno, server-integration, lint and build gates;
   then the repository-wide `npm run verify` and server verification. Diagnose
   any pre-existing failures separately from new regressions.
2. Review the full six-site player journey and migration from a real v3 save.
   Check local-only, signed-in, disconnected, reload, hidden tab and two-device
   scenarios, including claim retry after a failed write.
3. Update `architecture.md`, `techContext.md`, `productContext.md`,
   `activeContext.md`, `progress.md`, INDEX and affected specs together. Copy
   the complete database schema into both required files byte-identically.
   Archive completed work, gates, settled decisions and closed risks with
   reasons. Record commands that actually ran and any remaining limitation.

**Done only when:** every target behavior and gate above has direct current
evidence from code, schema, tests and rendered gameplay. A completed plan or a
working Map overlay by itself is not the completed feature.
