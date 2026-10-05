# Archive — Passed acceptance gates

Every base-game implementation step (1–37) with its recorded passing evidence,
the features deliberately deferred at the Step 37 close, and the acceptance
results reviewed at that close. All 37 steps are Complete and user-validated;
the milestone closed on 2026-09-08.

Not part of the contract. Append passed gates here as they close.

## Default Mica and per-floor purchased Miner — 2026-09-28

- **Presentation gate — Passed:** empty miner slots show Mica and base
  production; purchased Forge retains his own assigned attack art.
- **Purchase gate — Passed:** repeated Forge purchases yield distinct owned
  instances with separate 36,000-gold charges; the Buy detail permits repeat.
- **Assignment gate — Passed:** a second-floor assignment of one already
  Assigned Forge returns 409 `cat_not_assignable` after the RPC migration.
- **Regression gate — Passed:** 769 unit tests, focused client browser tests,
  live server integration and purchase E2E, lint, build, and diff check.

## Independent bottom-menu assets — 2026-09-27

| Gate | Result | Evidence |
|---|---|---|
| Asset separation | Pass | Five unique 96×96 RGBA PNG paths and Phaser texture keys; no full strip or icon sheet loaded. PNG header/alpha QC and the asset-registry unit test pass. |
| Visual fit | Pass | Native 360×640 screenshot shows the five independent icons, short labels, restrained steel-blue tiles, and gold divider matching the HUD and mine palette. |
| Interaction | Pass | Five 64×64 targets preserve order and callbacks; focused browser layout and mouse/touch hit tests pass 7/7. |
| Regression | Pass | Client unit suite 764/764, lint, build and `git diff --check` pass; no save, economy, network or schema change. |

## Mine miner delivery cadence — 2026-09-26

- **Simulation gate — Passed:** a level-50 two-miner fixture adds one equal
  chunk at the halfway delivery and reaches the original full cycle total at
  the second delivery; the spendable-gold pipeline remains downstream.
- **Presentation gate — Passed:** all visible mine miners report the same Y
  baseline, while phase-shifted patrol offsets remain distinct and aligned with
  the delivery milestones.
- **Regression gate — Passed:** focused extraction and stage-animation tests
  pass; the mine-floor browser read-back now asserts the shared horizontal line.

## Reference-driven bottom menu artwork — 2026-09-21

- **Visual asset gate — Passed:** the generated reference-shaped strip has a
  continuous navy/gold shell, five ordered tiles, a raised active Boost tile,
  no typography, and a transparent magenta-removed surround.
- **Runtime gate — Passed:** `BootScene` loads one menu image and
  `BottomNavigationView` preserves the existing five independent hit regions,
  callbacks, and diagnostic key order.
- **Verification gate — Passed:** the navigation asset contract test, lint,
  build, and touch navigation slice pass. The mouse navigation slice still
  exposes a Collection-close timing race at its 17th click; it is isolated
  from the menu asset and is recorded as an open test risk rather than claimed
  green.
- **Acceptance boundary:** presentation-only; no save, economy, network, or
  database contract changed.

## Reference-driven bottom menu aspect-ratio fix — 2026-09-21

- **Layout gate — Passed:** the alpha-cropped 2,167×455 runtime image fits
  uniformly at roughly 356×75 inside the fixed 360×80 navigation region; the
  five tiles and raised Boost ornament are fully visible in the in-app browser
  with balanced proportions and no overflow or clipping. The navigation-color
  underlay removes the exposed dark mine seam around the transparent artwork.
- **Interaction gate — Passed:** the five independent hit regions remain
  unchanged, and the focused touch navigation slice passes.
- **Verification gate — Passed:** `tests/unit/navigation-assets.test.ts`,
  `tests/unit/layout.test.ts`, `npm run lint`, `npm run build`,
  `git diff --check`, and the focused touch Playwright slice pass. The known
  mouse Collection-close timing race remains isolated from this asset/layout
  fix.

## Reference-driven bottom menu raster sharpness fix — 2026-09-21

- **Rendering gate — Passed:** the 712×150 high-quality runtime resample draws
  at an exact 0.5 scale; in-app browser inspection shows sharper menu borders
  and icon details without changing the logical layout or global renderer.
- **Regression gate — Passed:** focused navigation asset/layout unit tests,
  lint, build, touch navigation E2E, and `git diff --check` pass.

## Bottom-navigation sprite sheet — 2026-09-21

- **Asset gate — Passed:** one transparent 1,280×256 runtime sheet contains
  exactly five non-empty 256×256 frames in the required menu order; processed
  output subjects do not touch cell edges.
- **Runtime gate — Passed:** `BootScene` loads the sheet before the menu is
  created, and `BottomNavigationView` preserves the existing five keys,
  hitboxes, press animation, and callbacks while rendering frames 0–4.
- **Verification gate — Passed:** the navigation asset unit test, `npm run
  lint`, and `npm run build` pass. The touch navigation E2E remains green; the
  existing mouse slice retains its known Collection-close timing flake and is
  not used as the asset gate.
- **Acceptance boundary:** presentation-only; no save, economy, network, or
  database contract changed.

## Listed Marketplace CTA feedback — 2026-09-21

- **Lifecycle-specific CTA gate — Passed:** a `Listed` catalog item no longer
  renders `Confirm purchase` or `Cancel`; it renders `Buy listed cat` and
  `Back to cats` in the same responsive row.
- **Transaction gate — Passed:** the new primary CTA still invokes the existing
  authoritative purchase callback and reaches the existing Collection success
  state.
- **Focused evidence — Passed:** Marketplace trading browser slice 6/6,
  `npm run lint`, `npm run build`, and `git diff --check` pass.
- **Acceptance boundary:** presentation and copy only; no save, network,
  database, or gameplay contract changed.

## Marketplace and Collection feedback polish — 2026-09-21

- **CTA layout regression — Passed:** the Buy confirmation keeps the primary
  and cancel actions on the same row after the confirmation state rerenders;
  the browser assertion checks equal vertical position and ordering.
- **Collection state regression — Passed:** an `error` status renders
  unavailable/retry copy and no owned-count summary, while the existing ready
  empty state remains covered by the Collection flow.
- **Focused evidence — Passed:** the Marketplace purchase and Collection
  browser specs pass 4/4, plus `npm run lint` and `npm run build`.
- **Acceptance boundary:** presentation-only; no save, network, database, or
  gameplay contract changed.

## Cat collection Phase 9 — 2026-09-20

- **Full feature acceptance — Passed:** client unit 64 files / 739 tests,
  lint, production build, secret scan, diff check, full client browser 60/60,
  and production smoke 10/10 passed. `npm run verify:server` passed migration
  reset, core portability, Edge Function warm-up, 195 Deno unit tests, 21
  integration files / 132 tests, and 11 server browser tests.
- **Manual release audit — Passed:** the browser showed the ready empty
  Collection (`0 owned cats · Collection #0`), the role-specific Miner slot
  panel with no compatible candidates, and a playable mine after dismissing a
  sync diagnostic. The Dismiss click-through into Account & Settings was fixed
  by guarding Phaser's window-level pointer/mouse input and covered by a
  production smoke assertion.
- **Acceptance boundary:** Collection, detail, authoritative compatible
  replacement, runtime role binding, production effects, persistence, and
  recovery are implemented. Marketplace preview cards remain non-owned until a
  future purchase handoff calls the ownership API.

## Cat collection and role assignment gates — 2026-09-19

- **Phase 0 contract lock — Passed:** the spec and ordered implementation plan
  freeze the three v1 roles, data-only save boundary, server authority,
  expected-revision assignment, and post-confirmation production semantics.
- **Phase 1 pure domain — Passed:** role score/effect v1, lifecycle and slot
  validation, atomic replacement, filtering, and comparison are covered by the
  focused domain suite; 6/6 tests and build passed.
- **Phase 2 V3 save/migration — Passed:** V1/V2 migration, cat projection
  validation, renderer-data rejection, round-trip, full unit suite (728),
  lint, build, and server-core bundle build passed.
- **Phase 3 server authority — Passed:** local Supabase reset applied the new
  migration; focused cat API integration passed; the eleven-table RLS matrix
  passed; full server integration passed 21 files / 132 tests.
- **Phase 4 client hydration — Passed:** typed collection adapter, auth refresh,
  defensive projection validation, active-save roster restoration, and
  non-blocking hydration passed focused tests; build and lint passed. UI
  clear-on-account-switch and replacement interaction remain open in Phases
  5–6.
- **Phase 5 Collection UI — Passed:** the read-only Collection modal consumes
  the V3 roster and covers empty/owned list states, portrait fallback, search,
  role filtering, detail attributes/effect/assignment context, focus/close
  behavior, and no-overflow responsive layout at 390×844 and 320×568. The new
  browser spec passes 2/2; the full Chromium suite passes 58/58, the full unit
  suite passes 64 files / 734 tests, and lint/build are green. Replacement
  mutation remains intentionally deferred to Phase 6.
- **Phase 6 assignment flow — Passed:** slot-specific current-cat panels,
  exact-role candidate filtering, comparison, pending-state protection,
  expected-revision minimal commands, rejection preservation, and authoritative
  success projection are covered. Offline browser tests pass at 390×844 and
  320×568; server-backed fixture tests pass at both viewports and assert the
  exact three-field payload. The adapter path duplication found by the gate was
  fixed before acceptance; runtime asset/economy changes remain Phases 7–8.

## Cat collection Phases 7–8 — 2026-09-20

- **Phase 7 runtime role-slot binding — Passed:** the resolver follows
  `slot → instance → asset → runtime sheet`, preserves the existing semantic
  presentation contract, keeps missing assets playable with diagnostics, and
  proves assignment/reload identity in browser fixtures. Focused runtime E2E
  passes 3/3 and server-backed assignment/reload passes 2/2.
- **Phase 8 simulation production effects — Passed:** pure roster-derived
  modifiers affect only the assigned miner/elevator/warehouse metric at fixed
  simulation boundaries; save-rate, offline, and server progress-bound paths
  use the same inputs. Full unit passes 64 files / 739 tests, server unit 195,
  server integration 21 files / 132, and lint/build/focused browser gates pass.

## Marketplace asset gates — 2026-09-19

- **Phase 7 runtime integration — Passed:** Explicit approval was recorded;
  Mofy, Baron, and Forge render in the elevator, warehouse, and miner slots;
  fallback assets preserve offline boot; runtime state remains presentation-only;
  720 unit tests, lint, build, focused runtime E2E, and full 56/56 Playwright
  E2E passed.
- **Phase 8 catalog/UI/runtime release audit — Passed:** Nine portrait IDs,
  sixteen icons, manifest/source/provenance links, and the three selected
  runtime sheets resolve uniquely; six unselected variants remain catalog-only;
  release-audit tests and native mobile review passed.

## Server milestone Steps 33–37 — implementation close 2026-09-19

Steps 33–36 have recorded green implementation gates: exhaustive account/data
deletion with 30-day audit anonymization, a real seven-table backup/restore
drill, deliberate monitoring failure alerts, and a real 20-player save-sync
load run with latency/throughput/re-simulation budgets. Step 37 closes the
documentation audit: `npm run verify` passes with 700 unit tests, 52 E2E tests,
build, secret scan, and 10 production smoke tests; `npm run verify:server`
passes with 198 Deno unit tests, 21 integration files / 134 tests, and 9
server-E2E tests. Both database-schema copies remain identical, and local
documentation explicitly states that no hosted production deployment or
credentials exist. The full 600,000 ms client performance benchmark also
passes at 16.7 ms frame p95 with constant 695 Phaser objects and 399 DOM
nodes. Earlier user-validation gates remain separately labeled.

## Server milestone Steps 34–36 — implementation gates passed 2026-09-19

Step 34 `npm run backup:restore` ran a real custom-format public-schema dump
and restore into a fresh `postgres:17-alpine` container. All seven public table
names and row counts matched. The dump was 35,888 bytes; backup took 60 ms,
restore 105 ms, and the full drill took 2,833 ms including scratch startup.
The evidence records public schema recovery and explicitly excludes Auth
internals, sessions, identities, runtime caches, and secrets.

Step 35's healthy monitoring fixture exited 0. Its deliberately failed fixture
exited 2 and raised health, server-error-rate, save-rejection-rate, and
auth-failure-rate alerts. Step 36's real local load drill used 20 concurrent
anonymous players and 3 rounds each: 60 uploads, p95 238 ms, 48.48 uploads per
second, and 49 ms for the maximum 7,200,000 ms re-simulation. The benchmark
asserted p95 ≤ 500 ms, throughput ≥ 20 uploads/second, and re-simulation ≤ 250
ms. These are implementation-gate results; earlier server user-validation
gates remain recorded separately.

## Server milestone Step 33 — implementation gate passed 2026-09-19

The local Supabase database reset applied the new forward-only deletion
migration. account-delete/index.test.ts passed 6/6. The focused
account-audit.integration.test.ts passed 4/4 against the real Edge Runtime
and database, including enumeration of all seven public application tables,
seeding every account-owned table, malicious body-id isolation, complete Auth
and ordinary-row deletion, anonymized audit retention, and direct Auth-cascade
regression. A client token could not invoke the deletion RPC. The schema
invariant probe found zero null-linked audit rows without retention metadata.
This closes the Step 33 implementation gate; user validation of earlier open
server gates remains separate.

## Implementation Step Status

| Step | Status | Evidence |
|---|---|---|
| 1 — Scope and repository state | Complete | Documentation reviewed; scope consistent; repository and database checks passed. |
| 2 — Scaffold the web application | Complete | Vite/TypeScript scaffold and Phaser 4.2.1 are locked; browser load and production build pass. |
| 3 — Add quality tooling | Complete | User validated the passing Step 3 checks and authorized Step 4. |
| 4 — Create planned module boundaries | Complete | User validated the passing Step 4 checks and authorized Step 5. |
| 5 — Create a minimal Phaser boot scene | Complete | User validated the passing Step 5 checks and authorized Step 6. |
| 6 — Define base-game balance configuration | Complete | User validated the passing Step 6 checks and authorized Step 7. |
| 7 — Introduce the large-number boundary | Complete | User validated the passing Step 7 checks and authorized Step 8. |
| 8 — Define authoritative game state | Complete | User validated the passing Step 8 checks and authorized Step 9. |
| 9 — Implement fixed-step simulation time | Complete | User validated the passing Step 9 checks and authorized Step 10. |
| 10 — Implement extraction | Complete | User validated the passing Step 10 checks and authorized Step 11. |
| 11 — Implement the shared elevator | Complete | User validated the passing Step 11 checks and authorized Step 12. |
| 12 — Implement warehouse conversion | Complete | User validated the passing Step 12 checks and authorized Step 13. |
| 13 — Run unlocked floors concurrently | Complete | User validated the passing Step 13 checks and authorized Step 14. |
| 14 — Add production-rate calculations | Complete | User validated the passing Step 14 checks and authorized Step 15. |
| 15 — Implement upgrade costs for all three stages | Complete | User validated the passing Step 15 checks and authorized Step 16. |
| 16 — Apply stage-specific upgrade effects | Complete | User validated the passing Step 16 checks and authorized Step 17. |
| 17 — Add milestone multipliers | Complete | User validated the passing Step 17 checks and authorized Step 18. |
| 18 — Implement sequential floor unlocks | Complete | User validated the passing Step 18 checks and authorized Step 19. |
| 19 — Add an economy progression simulation | Complete | User validated the passing Step 19 checks and authorized Step 20. |
| 20 — Define the versioned save format | Complete | User validated the passing Step 20 checks and authorized Step 21. |
| 21 — Add IndexedDB persistence | Complete | User validated the passing Step 21 checks and authorized Step 22. |
| 22 — Handle corrupt or incompatible saves | Complete | User validated the passing Step 22 checks and authorized Step 23. |
| 23 — Calculate capped offline income | Complete | User validated the passing Step 23 checks and authorized Step 24. |
| 24 — Present and claim offline rewards | Complete | User validated the passing Step 24 checks and authorized Step 25. |
| 25 — Establish responsive portrait layout | Complete | User validated the passing Step 25 checks and authorized Step 26. |
| 26 — Render the mine floors | Complete | User validated the passing Step 26 checks and authorized Step 27. |
| 27 — Visualize the three production stages | Complete | User validated the passing Step 27 checks and authorized Step 28. |
| 28 — Connect the HUD | Complete | User validated the passing Step 28 checks and authorized Step 29. |
| 29 — Connect upgrade controls | Complete | User validated the passing Step 29 checks and authorized Step 30. |
| 30 — Connect floor unlock controls | Complete | User validated the passing Step 30 checks and authorized Step 31. |
| 31 — Add mine scrolling and one-thumb input | Complete | User validated Step 31 and authorized Step 32. |
| 32 — Add original placeholder presentation | Complete | User validated Step 32/32A and authorized Step 33. |
| 33 — Add the complete player-journey E2E test | Complete | User authorized Step 34 after the deterministic two-profile journey passed. |
| 34 — Verify persistence across lifecycle events | Complete | User authorized Step 35 after event-boundary catch-up, hidden/visible equivalence, abrupt-navigation recovery, and exact-once offline settlement passed. |
| 35 — Profile mobile performance | Complete | User authorized Step 36 after the ten-minute Pixel 5/4× CPU Chrome emulation passed its frame, memory, sampled scene-graph, four-floor, startup, asset, and responsive-input assertions; physical Android evidence remains an open caveat. |
| 36 — Validate production build behavior | Complete | User authorized Step 37 on 2026-09-08. Lint, unit, E2E, and the production build pass in sequence, then nine smoke tests pass against the built bundle served from the root base path, covering asset loading, bundle identity, canvas rendering, exact save/restore, corrupt/unsupported/unavailable storage recovery, and four viewports. |
| 37 — Close the base-game milestone | Complete | User validated Step 37 on 2026-09-08, closing the base-game milestone. Every prior step carries recorded passing evidence; `npm run verify` passes end to end (lint, 327 unit, 40 Chromium E2E, strict build, 9 production smoke); the fifteen-floor benchmark was re-run to replace four-floor evidence; `README.md` added; documentation corrected to the delivered fifteen-floor mine and sequential elevator; deferred features recorded rather than built. |

- 2026-09-08 tower-empty surface-delivery correction: `BootScene` now passes one queue predicate, `warehouse.queueSteps > 0`, to the lead and every assistant surface-hauler pose. Elevator cargo in transit no longer triggers a filled cart or gold cascade before reaching `warehouse.inputQueue`; a zero tower queue shows the empty tower and empty carts throughout the loop. The new browser regression holds 50 material in the active elevator while forcing warehouse input to zero and samples two animation poses; it and the existing positive-queue cart/pour test pass. Memory Bank was updated immediately after this feedback item. Save/database schema version 1 is unchanged.

- 2026-09-08 mine-floor detail/batch-upgrade feedback: the compact floor Level badge is selection-only and opens `MineShaftUpgradeModal`; it no longer buys on tap. The responsive accessible dialog shows level, output per cycle, cycle time, waiting material, and next output, with x1, x5, and exact MAX affordable CTAs. Core geometric batch quoting and atomic purchasing share one cost calculation, preserve floor progress/queues/totals, and persist once. The open modal refreshes after purchase and disables Phaser input for its full lifetime; this fixes the click-through found when a close gesture also upgraded the warehouse underneath. Unit regressions cover x5 cost/purchase, exact MAX bounds, modal attributes/options, and one persistence hook; browser regressions cover no-spend open, disabled unaffordable choices, exact x1 and MAX deductions, live rebinding, scroll/journey compatibility, and the background-input boundary. Final evidence is lint, 327 unit tests, all 40 Chromium E2E tests, strict build, nine production smoke tests, and clean diff whitespace. Direct browser-app inspection confirms Level 1 → Level 6 through x5 while warehouse stays Level 1 and no console error appears. Memory Bank was updated immediately after completion; save/database schema version 1 is unchanged.

- 2026-09-08 elevator-tower detail/batch-upgrade feedback: tapping the tower Level badge or building now opens the existing accessible blocking detail popup and spends nothing. It reports the authoritative level, capacity, 1.5 s cycle, current carried material, and next capacity, with exact x1/x5/MAX affordable choices. Shared geometric batch quoting/purchasing raises the final capacity atomically while preserving transit progress, cargo, and route cursor. Focused core and view-model tests pass; Memory Bank was updated immediately before work moved to the warehouse feedback. Save/database schema version 1 is unchanged.

- 2026-09-08 warehouse detail/batch-upgrade feedback: tapping the warehouse Level badge or building now opens the shared popup without purchasing. It reports level, capacity per cycle, 1.2 s cycle, authoritative `warehouse.inputQueue` as Gold queued, and next capacity, with exact x1/x5/MAX choices. Atomic batch purchase preserves input queue, conversion progress, and cumulative delivery state while updating final capacity and persisting once. Focused shared-stage core/view-model tests pass; Memory Bank was updated immediately on completion. Save/database schema version 1 is unchanged.

- Final shared-popup evidence: lint, strict build, 332 unit tests, all 41 Chromium E2E tests, nine production-bundle smoke tests, and clean diff whitespace pass. The shared-stage browser regression proves opening spends nothing, elevator x1 and warehouse x5 deduct exact costs, attributes refresh in place, and no other stage changes. Direct in-app inspection confirms responsive tower/warehouse dialogs and zero console errors.

- 2026-09-08 shared-MAX validation review fix: the mine-shaft MAX wrapper now preserves the public cost API's floor/config identity invariant before entering the generic affordability search. A regression passes a floor with another floor's config and requires the same descriptive mismatch error as single/batch quotes. Memory Bank was updated immediately after the focused test passed; schema version 1 is unchanged.

- 2026-09-08 shared-popup gesture review fix: `BootScene.#openUpgradeModal` now shares the scroll model's `hasDragged` guard across floor, elevator, and warehouse selections. A focused browser regression starts and ends inside the elevator's 44×50 Level target while moving beyond the tap threshold; the modal remains hidden and no mine scroll occurs. Memory Bank was updated immediately after the test passed; schema version 1 is unchanged.

- 2026-09-08 Memory Bank verification-count review fix: `techContext.md` now records the current 332 unit tests and 41 Chromium E2E tests, including all-stage batch upgrades and popup drag rejection, replacing its stale 327/40 floor-only summary. This documentation-only finding was recorded immediately.

- 2026-09-08 empty-tower hauler-loop feedback: `calculateSurfaceHaulerPose` no longer parks the lead worker when tower gold is absent, and `calculateSurfaceHaulerAssistantPose` no longer parks assistants at fixed waiting points. Every active cat keeps its independently phase-shifted tower→warehouse→tower round trip; `warehouse.inputQueue` still exclusively gates filled-cart textures and the pour effect. Focused unit coverage proves empty outbound/return poses for the lead and independent empty routes for assistants; the browser regression proves the empty cart and worker both change X while the tower remains empty and the pour stays hidden. Memory Bank was updated immediately; economy and schema version 1 are unchanged.
- 2026-09-08 final empty-tower review: lint, strict build, 332 unit tests, all 41 Chromium E2E tests, nine production smoke tests, and clean diff whitespace pass. Direct inspection of the hot-reloaded in-app tab confirms synchronized cat/cart movement and zero console errors; the deterministic empty-queue fixture supplies the authoritative zero-queue visual proof.
- 2026-09-08 blurred shaft-connector feedback: replaced one vertically stretched 192×528 shaft image with a 64×1,980 tiled shaft. Horizontal texture scale remains the intended `64 / 192`; vertical tile scale is fixed at `1`, repeating every 528 pixels instead of interpolating the source across fifteen floors. The focused Chromium read-back regression passes and direct in-app inspection confirms crisp rails/braces. Memory Bank was updated immediately after this isolated fix; simulation, saves, and database schema version 1 are unchanged.
- 2026-09-08 final shaft-fix evidence: lint, strict build, 332 unit tests, all 41 Chromium E2E flows, nine production smoke tests, and `git diff --check` pass. The live in-app diagnostic confirms the exact 64×1,980 tile contract with `(1/3, 1)` scale and no asset-load or console error.
- 2026-09-08 many-floor miner-stutter feedback: the measured fifteen-floor benchmark remains 60 FPS, while code inspection identified a 10 Hz presentation snap caused by binding miner X directly to 100 ms fixed-step extraction snapshots. `MineFloorView` now interpolates its currently rendered normalized progress forward to each authoritative target over one `SIMULATION_STEP_MS`, handles cycle wrap without reversing, and settles exactly at the target when no newer core snapshot arrives. Three focused unit regressions and the known-snapshot floor browser fixture pass. Memory Bank was updated immediately after this fix; production state, output, saves, and database schema version 1 are unchanged.
- 2026-09-08 scrolled deep-elevator feedback: removed `scrollY` from both the top-of-shaft world endpoint and its surface-layer mapping. Before the fix, scrolling deeper physically moved that endpoint down the mine, so a cabin returning from an offscreen floor skipped the intervening world distance and appeared to slide through the tower. A focused Chromium regression returns from floor 11, scrolls the mine, and proves underground plus surface-twin route coordinates remain invariant. Memory Bank was updated immediately after the isolated fix; the authoritative sequential route and schema version 1 are unchanged.
- 2026-09-08 final miner/elevator evidence: lint, strict build, 335 unit tests, all 42 Chromium E2E tests, nine production smoke tests, and clean diff whitespace pass. The repeated ten-minute Pixel 5/4×-CPU benchmark with all fifteen floors active holds 60.000 FPS, 17.6 ms p95, 17.8 ms max, zero over-budget frames, constant 665 Phaser objects, and 81.9 ms scroll p95. Direct in-app review at `scrollY=560` reports no console errors or warnings.

## Deferred Features — recorded at the Step 37 close, not implemented

Step 37 records these instead of building them. Each was excluded deliberately
by the base-game boundary in `memory-bank/implementation-plan.md`, and a
codebase audit confirms none of them leaked into `src/`: authoritative state
carries only gold, timing counters, fifteen floor records, elevator, and
warehouse, and no manager, boost, gift, shop, premium-currency, Telegram, or
payment code exists. The only `manager` identifiers in the tree name the
cosmetic warehouse supervisor sprite.

**Deferred gameplay systems**

- Managers and manager-driven automation, including the manager slot, rarity,
  and bonuses described in the GDD. Base-game production already runs
  automatically, so no manager is required to play.
- The temporary x4 boost and the auto/infinity indicator.
- Random gift drops on the surface.
- Manager Token and Boost Ticket currencies; gold remains the only resource.
- Deeper-floor resource variety (coal, ruby, gems) and multiple mine types.
- More than fifteen floors.

**Deferred presentation and platform work**

- Audio: background music and all SFX.
- Final production art, sprite atlases, and visual polish; the shipped family is
  original placeholder art with recorded provenance.
- The screens and gameplay behind the new bottom navigation (Rewards, Shop,
  Boost, Managers, Map). The clickable icon shell is implemented; destinations
  remain deliberately unimplemented.
- Telegram Mini App integration and WebView verification.
- Capacitor native packaging.
- Backend services, accounts, cloud save, leaderboards, referrals, monetization,
  ads, blockchain/NFT/Play-to-Earn.
- A deployment pipeline.

**Open verification items carried past the milestone**

- Physical mid-range Android Chrome verification. The benchmark is repeatable
  Pixel 5 emulation in desktop Chrome and must not be represented as
  physical-device evidence.
- A human playtest of the GDD's 30-second-comprehension criterion. It is a
  subjective judgement no automated suite can make.
- Playtest validation of the provisional balance curve, especially the generated
  floor 5–15 depth curve, which no human has played through.
- The main JavaScript chunk measures about 1.56 MB raw / 414 kB gzip (Step 35),
  recorded as a future startup-budget concern rather than a current failure.
  Server-milestone Step 8 added `@supabase/supabase-js` as a client
  dependency; a 2026-09-09 review measured a static import at +58 kB gzip on
  this same chunk and required the SDK to be dynamically imported instead
  (`src/platform/web/supabaseClient.ts`), so the built main chunk is
  essentially unchanged (1,570,900 bytes raw / 417.69 kB gzip) and the SDK
  ships in its own on-demand chunk (214.56 kB raw / 55.05 kB gzip) fetched
  only once `createSupabaseClient` actually runs.

## Acceptance Results — reviewed at the Step 37 close

### GDD section 10 prototype criteria

| Criterion | Result | Evidence |
|---|---|---|
| The player understands how gold is earned and spent within 30 seconds, without a long tutorial | **Not verified** | Subjective; no automated suite can judge it. The supporting structure exists — each stage has its own indicator, queued material renders wherever it accumulates, and the HUD is three icon-led numbers — but the criterion needs a human playtest and is carried forward as an open item. |
| All floors run concurrently at 60 FPS on the target device | **Pass, with a caveat** | The ten-minute benchmark with all fifteen floors unlocked measured 60.00 FPS, 17.6 ms p95, 17.8 ms maximum, and zero frames beyond the 18.34 ms threshold across 36,135 samples. `tests/unit/concurrent-production.test.ts` proves every unlocked floor advances from its own configured duration in the same tick. Caveat: Pixel 5 emulation under 4× CPU throttling in desktop Chrome, not a physical Android device. |
| Balance and progress restore exactly after closing and reopening | **Pass** | Step 34 pins hidden/visible catch-up as byte-for-byte equal to uninterrupted play, plus pagehide journal recovery and abrupt navigation. The production smoke suite repeats the check against the served bundle: a 40-second session flushed at a `visibilitychange` boundary equals the document derived independently in the test process, and a reload continues from the deserialized state. |
| Offline reward never exceeds the configured limit | **Pass** | `offlineIncome.capDurationMs` is 7,200,000 and `efficiency` is 0.5, both validated at startup. `tests/unit/offline-income.test.ts` covers zero elapsed time, a normal absence, capping at two hours, future timestamps awarding zero, very large saved rates, and invalid inputs. Step 33 and Step 34 prove the same interval cannot be claimed twice. |
| After ten minutes the player has opened at least three floors and hit at least one multiplier milestone | **Pass** | The deterministic Step 19 harness opens floors 2, 3, and 4 at 45 s, 175 s, and 508 s and reaches a level-10 milestone within the ten-minute session — four floors against the required three. Step 33 drives the same trace through real canvas presses in the browser twice. |
| No progression stall where costs outrun income | **Pass** | The same harness asserts a positive effective production rate at the end, finite non-negative balances throughout, and only positive-cost actions with non-negative modeled improvement. It is deterministic and replays identically. |

### Plan Definition of Done

| Requirement | Result |
|---|---|
| All 37 step validations pass | Steps 1–36 complete with recorded evidence and explicit user validation; Step 37 awaits this gate. |
| The production bundle is playable in a mobile-sized browser | Pass — nine production smoke tests against the served `dist/` at base path `/`, including pixel probes of the real canvas and four viewports. |
| All fifteen floors can run concurrently | Pass — unit-proven per-tick, and held active for the full ten-minute benchmark. |
| Progression is viable | Pass — see the ten-minute harness above. |
| Saves and offline rewards are deterministic | Pass — Steps 20–24 and 33–34, re-proven against the shipped bundle in Step 36. |
| No deferred feature has leaked into scope | Pass — audited at the Step 37 close; authoritative state and `src/` contain no manager, boost, gift, shop, premium-currency, Telegram, or payment code. |
| All project documentation reflects the delivered state | Pass — `README.md` added; eight stale-documentation defects corrected across `AGENTS.md`, `CLAUDE.md`, the GDD, and four Memory Bank files. |

### Aggregate verification, 2026-09-09

Current aggregate verification passes end to end: lint, 401 unit tests, 43 Chromium E2E tests,
the strict production build, secret scan, and 10 production smoke tests.
`npm run test:perf` passes every budget with fifteen floors active. Save-document
and IndexedDB schema versions remain 1.


## Gate recorded under `Active Decisions`

- The user validated Step 30 and authorized Step 31 on 2026-08-30.

## Marketplace purchase handoff — 2026-09-20

| Gate | Result | Evidence |
|---|---|---|
| Server purchase authority | Pass | Live cat-collection integration covers exact seeded price, wallet deduction, ownership/Idle projection, revision metadata, replay safety, unknown asset, insufficient funds, and missing wallet. |
| Client reconciliation | Pass | Focused client tests cover purchase metadata parsing, auth refresh, malformed responses, and `CloudSaveReplica.acceptExternalRevision`. |
| Buy UI | Pass | Marketplace browser test covers detail → confirm → callback → success; full client E2E is 61/61. |
| Collection and assignment | Pass | Live server browser E2E is 12/12 and covers two real purchases, Collection/assignment, same-role replacement, production binding, and reload persistence. |
| Release regression | Pass | Lint, 740 unit tests, build, secret scan, 61 client E2E, 10 production smoke, 195 server-unit, 132 server-integration, 12 server-E2E, and `git diff --check` pass. |
| Deferred boundary | Pass | Rent, Sell, and My listings stay preview-only and do not create ownership or transaction state. |

## Marketplace trading — 2026-09-20

| Gate | Result | Evidence |
|---|---|---|
| Listing authority | Pass | Migration and RPCs enforce owner-only listing creation/cancellation, active-listing uniqueness, positive integer pricing, legal status transitions, and exact-role assignment eligibility. |
| Sale flow | Pass | Live server integration creates a sale listing, transfers ownership, deducts the buyer wallet, returns save revision metadata, and proves idempotent replay does not double-charge. |
| Rental flow | Pass | Live server integration rents for two hours, deducts the exact hourly total, exposes the cat to the renter, and settles expiry back to the owner after the expiry timestamp. |
| API and adapter | Pass | Edge-function route tests and marketplace adapter unit tests cover listing query/mutation forwarding, auth refresh, malformed responses, and invalid duration handling. |
| Marketplace UI | Pass | Responsive browser tests cover Buy, Rent duration/total, Sell publication, My listings, cancellation controls, live callbacks, and mobile layouts at 390×844 and 320×568. |
| Security boundary | Pass | Supabase reset, server-unit tests, targeted integration tests, and adversarial RLS tests pass with marketplace tables service-role-only. |
| Release regression | Pass | Production build, 743 client unit tests, 11 targeted server integration tests, six Marketplace browser tests, lint, and `git diff --check` pass. |

## Surface hauler cap/productivity — 2026-09-27

| Gate | Result | Evidence |
|---|---|---|
| Core workforce rule | Pass | Unit coverage proves raw progression, five-cat visible cap, `rawCount / visibleCount` overflow multiplier, invalid-level rejection, and the `2.2x` level-100+ boundary. |
| Authoritative throughput | Pass | Unit coverage proves the same multiplier reaches warehouse conversion and derived production rates at the existing `warehouse.inputQueue` handoff. |
| Renderer contract | Pass | Production-stage browser coverage is 13/13 and proves raw count 11, five visible cats/carts, four assistants, and `2.2x` diagnostics at warehouse level 100. |
| Regression gate | Pass | Full client unit suite 761/761, lint, production build, focused production-stage E2E 13/13, and `git diff --check` pass. No save schema or extra queue was added. |

## Per-cart gold-pour feedback — 2026-09-27

| Gate | Result | Evidence |
|---|---|---|
| Event coverage | Pass | The lead and every visible assistant expose the same loading/pour event from their phase-shifted route pose; empty queue remains hidden. |
| Visual binding | Pass | `BootScene` pools one matching gold-pour sprite per visible cart and positions it relative to that cart beneath the chute. |
| Browser regression | Pass | Production-stage E2E observes all five per-cart effects over the staggered route cycle; the suite passes 13/13. |
| Regression gate | Pass | Unit suite 762/762, lint, production build, and `git diff --check` pass; authoritative state and save schema are unchanged. |

## Fixed chute pour origin — 2026-09-27

| Gate | Result | Evidence |
|---|---|---|
| Single origin | Pass | Every visible per-cart pour sprite is rendered at `SURFACE_GOLD_POUR_X/Y`; cart movement no longer changes the falling-gold origin. |
| Event preservation | Pass | Each lead/assistant loading pose still controls its own effect visibility and frame. |
| Regression gate | Pass | Production-stage E2E pins both coordinates and observes all five effects; unit suite, lint, build, and `git diff --check` pass. |

## Mine-floor workforce cap/productivity — 2026-09-27

| Gate | Result | Evidence |
|---|---|---|
| Workforce rule | Pass | Core tests pin raw one-per-50 progression, visible cap five, `1x` at level 200, and `1.2x` at level 250. |
| Authoritative throughput | Pass | Extraction and production-rate tests prove overflow productivity increases floor output while visible delivery events remain capped at five. |
| Renderer contract | Pass | Mine-view E2E uses a level-250 floor and still reads back five visible miners with no browser errors. |
| Regression gate | Pass | Focused core tests, full unit suite, lint, production build, mine-view E2E, and `git diff --check` pass; no save schema or extra queue was added. |

## Forge mining action — 2026-09-28

| Gate | Result | Evidence |
|---|---|---|
| Route and delivery | Pass | Pure tests pin outbound, stationary strike, return and assistant phase offsets at core delivery milestones. |
| Action and impact | Pass | Dedicated Forge and FX sheets pass strict sprite QC; browser tests observe the attack texture plus visible impact at the pile and idle texture plus hidden impact on return. |
| Regression | Pass | 766 unit tests, lint, build, and eight focused browser tests pass; no economy or save schema change. |

## Mica miner animation after assignment — 2026-09-28

| Gate | Result | Evidence |
|---|---|---|
| Identity binding | Pass | The Mica asset ID resolves to its own four-frame runtime sheet, not the Step 32A fallback; registry, manifest and source/runtime hash tests pass. |
| Mining action | Pass | Mica's independent four-frame strike sheet passes strict raster QC; browser tests observe the Mica attack texture plus impact at the pile and Mica idle texture with impact hidden on return. |
| Regression | Pass | 768 unit tests, lint, build, and twelve focused browser tests pass; core and save state are unchanged. |
| Scale correction | Pass | Runtime-only idle frames are 73–75 px tall and share the upright strike foot line; the original catalog sheet stays intact. Pixel-geometry E2E, six focused browser tests, 768 unit tests, lint, build and native-scale attack/travel screenshot review pass. |
| Directional walk correction | Pass | New right-facing 2×2 walk art passed strict raster QC. Browser diagnostics and screenshots show outbound `facesLeft=false`, right-facing mining, and returning `facesLeft=true` with the same walk sheet mirrored; seven focused browser tests, 768 full unit tests, lint and build pass. |
## 2026-09-28 — Free Elevator Pip / purchased Mofy gate

Passed: original Pip 2×2 sheet had four valid 128 px frames, no empty or
edge-touching frames, no clamped pastes, and body-scale CV 0.0028 under strict
raster QC. The full unit suite (770/770), focused Playwright runtime and
assignment tests (11/11), lint, and production build passed.
Browser readback confirms free Pip on an unassigned slot even with an idle
owned Mofy, and Mofy's original texture in both positions after assignment.
No gameplay, save, schema, or catalog-price change.

## Mine Overdrive scoped gate — 2026-09-29

| Gate | Result | Evidence |
|---|---|---|
| x4 timing and offline overlap | Pass | Pure tests cover active/end/cooldown boundaries, fixed-step acceleration, partial offline overlap, and server progress allowance. |
| Server authority | Pass | Deno handler tests, atomic concurrent live activations (one winner), authenticated status/reload, save-download Boost state, and direct PostgREST RLS denial. Local migration applied without reset. |
| Player UI | Pass | Eight focused client browser tests and configured-server activation/reload test; lint and build pass. |
| Wider repository suites | Open | Full unit (775), Deno (204), and server integration (134) pass. Existing broader client E2E/production suites retain unrelated failures; do not treat them as a Boost pass. |

## Hauler scoped gate — 2026-09-30

- Art: both four-frame walk sheets and all four empty/full cart images passed
  strict raster QC; runtime copies are linked to retained sources/provenance.
- Core: 779 unit tests pass, including exact slot range, same-role filtering,
  unique-instance assignment, reset, V3 round-trip, active-crew averaging,
  unchanged default throughput, fallback assets and cart dimensions.
- Authority: 205 Deno tests and 4 live cat-collection integration tests pass;
  seeded prices debit once per purchase, repeated purchases create different
  instances, duplicate use and stale revisions reject, reset preserves title.
- Browser: 12 focused client tests pass; live mobile Hauler test buys Tobi and
  Rivet, equips different carts, leaves an unassigned default, verifies no idle
  candidate remains, reloads, resets and reuses an owned cat on another cart.
  Screenshot and diagnostic readback confirm distinct vehicle textures and
  Rivet's raised cart. Click probes wait for the open route to avoid the
  overlapping Warehouse manager; the UI provides stable Cart buttons.
- Lint, production build, server-core build, diff whitespace and byte-identical
  Complete Database Schema blocks pass. The local migration was applied
  without reset. Production deployment and unrelated broad E2E gates are not
  claimed by this scoped release check.

### Surface cart cargo lifecycle feedback gate (2026-09-30)

- 790 unit tests pass, including per-slot cargo retention, late refills, empty
  trips, lap skips, rephasing, clock rewind and normal wrap. Sandbox subprocess
  timeout in the unrelated bundle scan was resolved by rerunning outside it.
- Five focused client browser tests pass: actual empty/full textures for
  default/Tobi/Rivet after the tower empties, empty departure despite refill,
  warehouse-only handoff, chute loading and empty routes. The older delivery
  check now samples the outbound phase, not the same X position on return.
- Live Hauler purchase/assignment/reload/reset/thruster browser test passes;
  lint, build and whitespace checks pass. Broader unrelated release gates were
  not rerun or claimed here.

### Boru excavator Miner gate (2026-09-30)

- 805 unit tests / 70 files pass; includes route endpoints, action ordering,
  direction, frame ranges, five-worker offsets and four runtime RGBA sheets.
- Four client browser tests pass: Boru one/five-worker phase rendering and
  Mica replacement, default role presentation, existing Mica geometry.
- Live Supabase browser Buy 42,000 -> assign Miner -> reload passes with a
  disposable test account; no real user's account or wallet was modified.
- Four strict processor runs pass at the shared 0.72 profile; chassis
  registration has no clipping. Four 512x256 RGBA/alpha reports pass. Mobile
  screenshots of all phases reviewed at one and five workers; the five large
  machines can overlap on the existing compact shared lane.
- Lint, build and diff checks pass. No broad unrelated E2E/server suite or
  production deployment is claimed. Local catalog migration applied only.

### Boru portrait and scoop polish gate (2026-09-30)

- 128x128 RGBA portrait passes asset QC with 116x92 content bounds; separate
  Marketplace 390/320px cards and Miner assignment candidate screenshot reviewed.
- Nine focused client E2E tests, including one/five-worker scoop and exact
  208px scoop endpoint, pass. A fixture-only Marketplace overlay interception
  was isolated, then its five-test suite passed on rerun.
- Disposable live Buy -> assign -> reload browser test passes. 31 focused
  unit tests, lint, build and diff checks pass. No broad release gate, user
  purchase or production deployment was performed.

### Mine-floor gold pile grounding gate (2026-09-30)

- Layout unit test checks that the existing 128px asset's visible lower bound
  meets the 122px floor line after scaling to 52px; four layout tests pass.
- Boru one/five-worker browser flows pass; the scoop screenshot shows ore on
  the floor and foreground occlusion retained. Lint, build and diff checks
  pass. No broad release gate or production deploy is claimed.

## Multi-mine Map release gate — 2026-10-05

- Player model: one shared wallet, one active foreground mine, six ordered
  sites, fixed purchase gates and exactly-once per-mine offline claims pass core,
  save migration and browser coverage.
- Cloud continuity: V1–V3 adoption, V4 validation, revision checks, durable
  version-2 command replay, exact `effectiveAtMs` settlement and merge into
  newer local progress pass Deno, integration and live browser coverage.
- Art: all six sites are represented; the five new sites have distinct upper,
  middle and deep floor families, ore, structures, cargo and effects. Native
  360×640 captures cover floors 1, 5, 10 and 15 and required worker/cargo states.
- `npm run verify` passes lint, 866 unit tests, 83 client E2E tests, build,
  bundle-secret scan and 10 production smoke tests.
- `npm run verify:server` passes server-core build, 218 Deno tests, all local
  Supabase migrations and health checks, 146 integration tests and 15 server
  E2E tests. Complete Database Schema copies are synchronized.
