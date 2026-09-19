# Archive — Passed acceptance gates

Every base-game implementation step (1–37) with its recorded passing evidence,
the features deliberately deferred at the Step 37 close, and the acceptance
results reviewed at that close. All 37 steps are Complete and user-validated;
the milestone closed on 2026-09-08.

Not part of the contract. Append passed gates here as they close.

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
