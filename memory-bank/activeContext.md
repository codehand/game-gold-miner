# Active Context

## Current Focus

The base-game milestone is complete and validated. A second milestone is now planned but not started: `memory-bank/server-milestone-plan.md` takes the game from client-only to account-backed — guest play, Google/Apple/Telegram sign-in, cloud save, server-verified progress, leaderboards, and entitlement groundwork, on Supabase.

Steps 1 through 8 are validated — Step 8 was validated by the user's 2026-09-10 authorization to proceed with Step 9. **Step 9 (Phase 2 — Identity: profiles and row-level security) is implemented on 2026-09-10 and awaiting user validation**; no step past it has started. See `## Next Steps` below for the Step 4 through Step 8 narrative; the paragraphs immediately following this one describe Step 1–3's still-current design decisions.

Step 9 closes a gap the Step 5 migration deliberately left open: `profiles` and its own-row select/update policies already existed, but nothing put a row there for a real sign-up except the seed script's manual insert. `supabase/migrations/20260910090000_profiles_signup_trigger.sql` adds `public.handle_new_user()`, a `security definer` function pinning `set search_path = ''` — the same hardening `public.set_updated_at()` already applies — and its `on_auth_user_created` trigger, `after insert on auth.users`. `security definer` is load-bearing rather than decorative: GoTrue writes `auth.users` as `supabase_auth_admin`, a role with no privilege on `public.profiles`, so an invoker-rights trigger would fail the very insert it exists to react to; running as the function's owner, `postgres`, which owns `profiles` and is never subject to `FORCE ROW LEVEL SECURITY`, is what lets it insert at all. `profiles` still carries no insert or delete policy for anyone, so this trigger is the only path that ever creates a row, and the RLS matrix's `profiles` insert cell in both schema documents now names it instead of forward-referencing this step. `tests/server-integration/profiles-rls.integration.test.ts` is the step's required evidence: it signs in two independent real anonymous identities through live Supabase Auth — not hand-signed tokens for ids nothing backs — and proves against the live PostgREST endpoint that the trigger alone created each profile row, that a user can select and update their own row, and that user A cannot select, insert into (using B's real, FK-satisfying id), update, or delete user B's row. Live mutation confirmed the test is real: dropping the trigger from the running database (leaving the migration file untouched) failed five of the seven new tests by name.

Step 3 designed six tables — `profiles`, `saves`, `save_audit`, `recovery_codes`, `leaderboard_entries`, `entitlements` — with all 42 columns, every type, default, nullability, key, constraint, index, and relationship, plus the RLS matrix in which `saves` denies the client every write. Step 5 landed all six as `supabase/migrations/20260908130000_create_platform_tables.sql`, with RLS enabled and exactly the policies that matrix names; they exist in the local development database, not in any deployment.

Its decisive finding is that **`saves.document_json` must be `text`, not `jsonb`**. Step 20's test requires a pre-milestone save to come back from download byte-for-byte, and `jsonb` reorders keys, drops insignificant whitespace, and normalizes numeric literals. That was verified rather than assumed: the same document stored in both column types came back from `jsonb` with its keys reordered. Choosing `jsonb` would have failed Step 20 long after the schema was live.

Three further decisions carry beyond the schema. `saves` keeps one generation of rollback, because the threat model ranks a player's own progress above everything else and a single history-less row offers no recovery from a wrongly accepted upload. `leaderboard_entries` snapshots its own `display_name` so publishing a public board never widens `profiles` past own-row access. `recovery_codes.code_hash` is an HMAC digest under a pepper held outside the database — a fast keyed digest is right for a high-entropy machine secret rather than a human password, and keeping the pepper out of Postgres means a database leak alone does not permit offline enumeration. Every table carries exactly one cascading foreign key to `auth.users`, which gives Step 33 a single deletion path and becomes an invariant for every future table; the accepted cost is that deleting an account also erases its abuse evidence from `save_audit`.

Step 2 fixed the client/server contract before either side is written. `GET /v1/save` and `PUT /v1/save` on an Edge Function are the only save path, each with an example request and response for every success and every rejection. An eleven-code error vocabulary pairs each failure with what the client does and the exact copy the player sees — most entries show the player nothing, because the game never blocks on cloud sync and `createSaveDiagnosticBanner` deliberately never withdraws a notice, so a retryable network error must stay silent while a retry is pending or a tunnel would pin a permanent banner to the screen. Cloud failures reuse that banner with `cloud-sync-*` codes rather than a new surface.

Five decisions are binding on later steps. **D1**: the session lives in script-writable storage, not a first-party HttpOnly cookie, because no domain exists — and the consequence is sharper than the default looked, since the session token and the local save then fall under iOS Safari's *same* seven-day deletion, so for an unlinked guest the Step 14 recovery code rather than cloud save is what makes Step 21's promise true. **D2**: a server-owned monotonic `revision`, with the stale-write rejection returning the server's document so a conflict resolves in one round trip; this also makes a retried upload whose response was lost resolve silently instead of becoming a false conflict. **D3**: the server's `receivedAt` anchors every elapsed-time calculation, while the document's own timestamps are carried verbatim for the client's local simulation and are never a server input. **D4**: divergent devices resolve by dominance over the monotonic progress vector — one document that is a superset of the other is adopted silently, and only a genuine fork asks the player, with `gold` and every queue and progress value excluded because they legitimately fall. **D5**: cloud upload is at most one per 60 s with forced lifecycle, claim, and boot-reconcile triggers, leaving the 500 ms local debounce untouched; this resolves finding F6.

That deliverable records the threat model over six attacker capabilities — local storage, the client bundle, the device clock, HTTP requests, the session credential itself, and unlimited anonymous identities — with what each is worth and which step defends it. It ranks the protected assets, and that ranking is load-bearing: a player's own progress outranks leaderboard integrity, so the Step 23 re-simulation tolerance must be biased toward accepting a slightly generous save over rejecting an honest one. It also records what the milestone deliberately does not defend, and one ordering consequence — nothing before Step 22 defends the device clock, so Steps 15–21 will faithfully store clock-derived income and must not be described as anti-cheat.

None of the eight kickoff questions was answered by the user; all eight now carry a conservative recorded default, and the plan's Open questions section is now a table of those defaults rather than a list of blockers. Three were resolved partly by inspecting the repository: the git remote is GitHub, there is no CI of any kind, and `index.html` sets no Content Security Policy — so Step 2 may **not** assume a first-party HttpOnly cookie is available, and Step 5 creates CI from nothing.

Auditing all 37 steps also found nine assumptions the plan relied on without recording them (F1–F9). The two with real cost: **Step 12 presumes a Telegram Mini App host that does not exist** — `src/platform/` contains only `web/` and nothing in `src/` mentions Telegram — so Step 12 gains a prerequisite it did not have; and **Step 6's premise that `break_infinity.js` imports cleanly into Deno is unproven**, so Step 6 must verify that first, with a shim rather than a reimplementation as the fallback. A third has a cost the plan never recorded: **Step 11's Apple sign-in needs an Apple Developer Program membership, a Services ID, and a verified domain**, so it depends on the unresolved domain question in a way Step 10's Google sign-in does not, and it adds roughly USD 99/year. The rest: Step 23's upper bound is loose by construction and must say so, Step 22 changes the authoritative clock and must not change the offline-income formula, cloud upload cadence is separate from the 500 ms local debounce and capped at one per 60 s, Step 21's measurement needs a seven-day wall-clock observation rather than a sitting, Step 31 needs one concrete entitlement and it must be cosmetic so it cannot become an unmodelled input to Step 23, and there is no XSS/CSP step. That last one, F5, is the single item left genuinely open, because closing it means adding a step and that is the user's decision at this gate.

Two findings from the planning discussion are recorded in that plan. Canvas/WebGL fingerprinting was proposed as a guest identity mechanism and rejected: it collides across identically-configured devices, which would hand one player another player's save; it is unstable across routine updates; Brave randomizes it per session while Firefox and Tor make every user identical; and it is an observable identifier rather than a secret credential, so it cannot prove ownership. It is permitted only as a weak abuse signal in Step 25. Separately, Safari deletes all script-writable storage after seven days of use without first-party interaction, which means the shipped client-only build already loses a lapsed player's entire save — both the Dexie database and the localStorage lifecycle journal fall under that rule. Step 21 handles it for players with an account; whether to fix the shipped build first is undecided. Other post-milestone work — managers, boosts, gift drops, audio, final art — remains unplanned and unauthorized.

## Recent Changes

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

## Active Decisions

- Target browser and Telegram Mini App first.
- Keep core simulation deterministic and independent of Phaser.
- Use original branding and assets rather than copying the reference game's protected content.
- Keep MVP client-only and exclude monetization, blockchain, and social systems.
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
- Advance foreground simulation in deterministic 100 ms ticks, carry sub-tick remainder in authoritative state, and credit at most 1,000 ms of simulation per update while consuming the full wall-clock delta.
- Calculate mine-shaft yield as base yield multiplied by the configured output-growth rate for each level above one and every cumulative milestone multiplier reached at the current level.
- Deposit completed extraction only into the producing floor's material queue and total-extracted counter; spendable gold changes only after later transport and warehouse stages.
- Treat non-negative `roundRobinCursor` as the downward target floor and negative `-(index + 1)` as the upward origin floor; zero with no waiting/carried material is surface idle.
- Remove material from a floor and increment its transported total only when the cabin arrives; visit each unlocked floor while capacity remains, slow travel as load rises, and deliver carried material only at the surface without changing gold directly.
- During every fixed tick, advance every unlocked floor's extraction first, then the shared elevator, then the shared warehouse; newly produced and delivered material is eligible for the next stage in that same tick.
- Convert warehouse material to gold at a 1:1 ratio only on a completed configured cycle; leave excess input queued for later cycles and reset progress when no input remains.
- Keep locked floors fully inert while all unlocked production stages run automatically without managers or player taps.
- Treat production rates as derived read-only values: expose every floor's theoretical rate, sum only unlocked floors for the mine estimate, and cap that estimate at the slower shared-stage throughput.
- Calculate an upgrade's next price from the stage's current level without rounding; expected player-action failures return the original state, while invalid/non-incrementable levels are invariant errors.
- Recalculate each stage effect as `baseValue × outputGrowthRate^(level - 1) × cumulativeMilestoneMultiplier`; shared-stage cycle durations remain fixed.
- Derive milestone effects from the current level rather than storing grant state, so each threshold activates once and reloads cannot apply it twice.
- Unlock floors 2–15 only in sequence after the immediately previous unlocked mine shaft reaches its configured level; floors 2–4 require levels 5, 5, and 7 at costs 250/1,500/7,500, and the generated depth curve continues from floor 5.
- Initialize a successfully opened floor at its configured starting level with zero progress, queues, and totals; preserve unrelated floors, shared stages, and simulation metadata.
- Format every displayed amount through one shared two-decimal function, so a value never reads one way in the HUD and another in the mine.
- Truncate a displayed balance rather than rounding it: a number that reads higher than it is promises a purchase the player cannot make.
- Read a magnitude through `GameNumber`'s own mantissa and exponent, never through `Number`, which collapses everything past its range to the same value.
- Estimate income from the core's bottleneck-capped effective rate, never from aggregate extraction and never from what the renderer observed.
- Price every control through the same core function the command charges, so the shown and charged figures cannot drift.
- Let a control drawn unaffordable still be pressable and let the core answer: the view must not decide a purchase, and a silent press is worse than a refusal the player can read.
- Advance the simulation to the current time before applying a command, so the player spends the gold the mine has now rather than the gold the last frame showed.
- Persist a command's result explicitly; a purchase completes no tick, and a save that follows only ticks would lose it.
- Time press feedback on the presentation clock, never the cosmetic one, so animation speed cannot change how long a message is readable.
- Publish an interactive element's screen-space rectangle, converted through the camera that draws it, so browser tests press the real control.
- Bulk purchases remain deferred; mine scroll input arrives in Step 31.
- Use the Step 19 automated policy only as a reproducible balance-analysis harness; it does not issue player-runtime purchases or replace later playtesting.
- Persist every `GameNumber` as a finite decimal/scientific string, validate exact version-1 structure and authoritative invariants before deserialization, and keep migration dispatch separate from IndexedDB storage.
- Store one active document under the fixed `active` key, debounce routine writes by 500 ms, force the newest snapshot on supported lifecycle events, and surface storage failures without terminating the running session.
- Treat unsupported schema versions separately from malformed current-version saves, preserve a cloneable invalid payload in the recovery warning, and initialize a fully fresh state at the caller-provided current timestamp.
- Configure offline income as a 7,200,000 ms cap at 0.5 efficiency, calculate from the saved effective-rate snapshot, keep a positive reward outside spendable gold until the player claims it, and settle consumed time before exposing that reward.
- Consume pending rewards through one pure claim result, reuse the same in-memory claim candidate across save retries, and dismiss the modal only after the claimed authoritative snapshot is force-persisted.
- Keep the logical viewport a fixed 360×640 and make responsiveness a scaling concern: `FIT` plus `CENTER_BOTH` letterboxes instead of cropping, so later render steps keep addressing stable logical coordinates.
- Apply host safe-area insets exactly once, as CSS padding on `#app` around the `#game-viewport` Phaser parent, never inside the canvas.
- Keep layout geometry pure and Phaser-free so it is unit-testable in Node; the scene only positions objects and publishes canvas dataset diagnostics for browser assertions.
- Clip the scrollable mine with a dedicated camera viewport rather than a geometry mask, because Phaser 4 removed WebGL geometry masks; Step 31 will drive only that camera's scroll.
- Reserve the bottom 58 logical pixels for the authorized five-icon navigation shell; keep its activation presentation-only until destination screens are separately implemented.
- Treat canvas dataset diagnostics as geometry reporting only, never as renderer evidence; every rendering guarantee needs a pixel probe sampling the shared palette.
- Keep colors in the pure layout palette rather than private scene constants, so browser tests assert the same values the scene draws.
- Derive every on-screen string, ratio, and discrete step in a pure view model, and let Phaser entities only position and paint what that model already decided.
- Give each view an `applySnapshot` rebinding method and a `describeRenderedState` read-back, so views hold no authoritative state and browser tests compare rendered output rather than scene intentions.
- Draw locked floors with their own panel colour and badge instead of an alpha dim, so a pixel probe can prove the distinction.
- Keep Step 26 controls presentational: costs, affordability, commands, and feedback belong to Steps 29 and 30.
- Republish the rendered-state diagnostic on every rebind, never only at boot: a diagnostic frozen at the first frame reports success for a rendering path that has since broken.
- Hold structural render invariants in the pure view model (`assertRenderableMineViewModel`) so they are unit-testable in Node, and throw on violation rather than skipping the affected view.
- Derive every view's internal geometry from the `LayoutRegion` it is given; a hardcoded dimension beside region-relative neighbours drifts apart the moment the region changes.
- Let browser tests import the read-back types from the views themselves, never restate them, so the diagnostic contract cannot drift unnoticed.
- Never report a constant through the rendered-state read-back; report a bound value instead, so the assertion can actually fail.
- Derive test expectations that depend on balance data through the same pure function the code uses, and keep hardcoded values only for fixture-owned amounts.
- Let the renderer pull snapshots from a driver each frame; never let a frame delta, frame rate, or animation speed reach the core. Production is a function of injected wall-clock time alone.
- Treat a frozen host clock as a paused mine that still renders, and a backwards clock as crediting nothing until real time catches up.
- Treat a gap in the render loop as elapsed time to be simulated, never as one oversized frame: walk it in credited-size slices, bound the walk so resuming cannot freeze the tab, and consume the timestamp in full whether or not the time was credited.
- Drive every stage indicator from authoritative progress and every decoration from a separate validated cosmetic clock, gated on whether the stage holds material.
- Render queue state wherever material accumulates, measured against the capacity of the stage that removes it, without hiding or rescaling fixed environmental decoration.
- Never report a bottleneck a stage cannot observe from its own state.
- Guard a one-time claim with a consumed-once flag rather than a cached state candidate once the world keeps changing behind the modal.
- Publish read-back diagnostics on a 100 ms cadence rather than every frame, and keep the forced publish at boot and on external binds.
- Never sample a pixel probe on the strength of a dataset diagnostic alone: diagnostics are published inside `create`, before a frame exists, so wait for an always-painted point first.
- Treat every purchase as one control kind: a second thing to buy reuses the button, the command sink, the feedback, and the diagnostic rather than duplicating them.
- Enable a control from everything its purchase needs, never from the price alone, and carry any second requirement beside the button as its own coloured line.
- Give a panel slot exactly one live control, and assert it in the pure view model so two overlapping buttons fail before the scene draws them.
- Name only the refusals a player can act on; every other core failure reads as unavailable.
- Expire a press-result map on its own terms rather than through the controls still on screen, because a purchase can remove the control it was made on.
- Let a completed change be its own confirmation: a floor that visibly opens says more than a message on a button the same frame removes.
- Wait for a browser press to be observed rather than assuming a settling time, and grant the paused-clock game loop one step before pressing anything at all.
- Review of the Step 30 implementation found no defect, but one untested path: the shaft-upgrade control on a floor that was just opened occupies the exact rectangle the unlock control had, and nothing pressed it. Sharing one slot rests on Phaser skipping invisible objects when hit-testing, so the behaviour was pinned by a test rather than left to that mechanism: the browser test now asserts the two controls report the same screen rectangle, that the opened shaft is affordable, and that a press there buys a shaft level.
- Mutation-verified: offsetting the unlock control out of the shared slot fails the new bounds assertion by name, and routing an upgrade press to the unlock handler fails with the press never reaching the scene.
- Three review cleanups with no behaviour change. `createPurchaseControlViewModel` became `createUpgradeControlViewModel`, because the generically named factory only ever produced the `Upgrade` caption while its sibling was specific. `RenderedFloorState.isUnlockRequirementUnmet` became `isUnlockRequirementMet`, so the read-back and the view model state the flag in one sense; the two browser assertions that read it prove the met and unmet colours still differ. The feedback-map expiry comment no longer implies an unbounded map: it is keyed by control and bounded either way, and the reason to expire it directly is that collection should not depend on what is currently on screen.
- Mutation-verified: inverting the requirement colour fails the polarity assertion by name.
- The user validated Step 30 and authorized Step 31 on 2026-08-30.
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

## Open Questions

- Validation and refinement of the provisional balance curve through Step 19 and playtesting.
- Whether `calculateMineProductionRates` should model sequential route distance and load-sensitive leg timing, or whether the estimate stays a route-agnostic upper bound used by the HUD and offline snapshot.
- Final art-production workflow and original visual identity.
- Target Telegram launch requirements beyond the prototype.


## Marketplace popup — 2026-09-09

The user authorized the Shop icon to open a marketplace design for buying and
hourly rental of cat roles. `src/ui/MarketplaceModal.ts` now owns a native modal
dialog opened by `BootScene`'s Shop callback. It blocks background input, restores
scene input on close, supports Escape/native focus containment, and is destroyed
on scene shutdown. The responsive navy/gold interface includes Buy, Rent and My
listings, name search, role/rarity filters, price sorting, empty-state reset, cat
details, 1–24 hour rental totals, and validated session-only listing drafts with
removal. Four catalog portraits (Mofy, Baron, Elon, Cipher) are copied into
`public/assets/marketplace/` for this presentation only; gameplay assignments
and rarity bonuses are not integrated.

This is explicitly a Preview with sample prices/listings. Live trading is disabled;
no ownership inventory, transaction service, gold debit, or public listing is
implemented. Drafts survive popup close but disappear on reload. No database,
IndexedDB, localStorage journal, save-document, or server schema changes.
The existing server milestone remains at Step 8 awaiting validation.

Validation: production build and lint pass. Marketplace browser coverage checks
390×844 and 320×568 layouts, search/filter/reset, rental totals, draft creation
and removal, disabled live trading, and Escape dismissal. Navigation coverage
closes Marketplace before testing the remaining icons.


## Navigation hit-target correction — 2026-09-09

Fixed the user-reported left/up offset on bottom-navigation icons. Phaser's
InputManager adds a Container's `displayOriginX/Y` (half its configured size)
before testing the hit shape. BottomNavigationView now uses Rectangle(0, 0,
width, height), replacing the negative half-size origin that applied the offset
twice. Artwork remains centered, and all five existing touch targets retain
their dimensions; the complete visible icon chrome now responds to mouse/touch.

Regression: navigation-hit-targets.spec.ts failed for both mouse and touch before
the fix, then passed afterward. It checks center and four interior corners of
each icon at 553×934 and after resizing to 320×568 (100 total activations), with
Marketplace opened/closed at every Shop activation. The test waits two animation
frames after resizing so Phaser receives the resize before native touch input.
Validation: all 9 targeted navigation/marketplace/layout browser tests pass;
production build and lint pass. No gameplay, save or database schema changes.

## Upgrade CTA press correction — 2026-09-10

Fixed the user-reported case where upgrade CTA text did not respond while the
button's left padding did. The live simulation refreshes an open upgrade modal;
the old render path replaced each button's label and cost spans on every changed
snapshot. A press beginning on that text could lose its DOM target before
release, so the browser canceled the click. `MineShaftUpgradeModal` now creates
those spans once and updates their text in place. It captures the primary
pointer from press through release, clears canceled pointers, handles physical
pointer activation exactly once, and retains keyboard/assistive click support.
CTA CSS now declares `touch-action: manipulation` and disables text selection.

Regression coverage holds a pointer on the x1 label across multiple live
simulation updates before releasing, and separately verifies the initially
focused CTA activates once with Enter. Playwright's port can be overridden with
`PLAYWRIGHT_PORT` so the suite does not require stopping an unrelated process on
its default port. No gameplay formula, balance, save, or database schema changed.
Validation passes: 11 targeted CTA/navigation/Marketplace browser tests, the
production build, and lint. The dwell regression also passed 5/5 repeated runs.

## Marketplace hardening and close-race correction — 2026-09-10

A review pass over the Marketplace popup, the bottom navigation, and the Step 9
row-level-security suite corrected nine items. None changed gameplay, balance,
the save document, or any database schema.

`src/ui/MarketplaceModal.ts` now builds every node with `createElement` and
`textContent`; no `innerHTML` or `insertAdjacentHTML` remains anywhere in
`src/`. The listing fields it renders — name, role, rarity — are still the
module-level `CATS` constant, so nothing was exploitable before. The point is
that this is the one screen designed to render *other players'* listings, and
the template-string form would have become a stored-XSS sink the day that
constant is replaced by server data. This narrows the surface finding F5 names;
it does not close it, because `index.html` still ships no Content Security
Policy.

The modal is exported from the `src/ui/index.ts` barrel like every other UI
module. Its tab, role, rarity, and sort state carry union types instead of
`string`, and `#select` is generic over them, so a mistyped literal comparison
is now a compile error. Formatting returned to the repository norm: the longest
line fell from 594 characters to 110, and the new `src/style.css` rules are
multi-line like the ones above them. No lint rule caught any of that — there is
no `max-len` — which is why it needed a reading rather than a run.

Two dialog behaviours were wrong. Every `#render()` tears down and rebuilds the
whole body, destroying whatever held keyboard focus — the tab just pressed, or
the button behind "Clear filters", "Back to cats", "Save draft" or "Remove" —
and inside `showModal()` that dropped focus to `<body>`, forcing keyboard and
screen-reader users to tab back down from the header. `#render()` now refocuses
the active tab, and the detail and create-listing views refocus their back
button. Separately, `dialog.close()` queues its `close` event as a task, so
`destroy()`'s synchronous `remove()` ran first and the callback still fired
afterward, re-enabling input and bumping the close count on a shutting-down
scene and focusing a detached element; a `#destroyed` flag short-circuits it.
Suppressing that callback cannot strand input, because Phaser's
`InputPlugin.start()` sets `enabled = true` on scene restart. `BootScene` also
replaced `this.#marketplace?.open()` with an explicit null check, so scene input
is surrendered only once the modal that restores it is known to exist.

A navigation button pressed twice inside 130 ms never looked pressed:
`pointerdown` set the scale while the previous release's `Back.Out` tween was
still running and kept overwriting it. `pointerdown` now kills that tween first.

The largest finding was in the tests, not the product.
`navigation-hit-targets.spec.ts` and `layout.spec.ts` clicked "Close
marketplace" and then immediately clicked the canvas again. Because
`dialog.close()` queues its `close` event, `#onClose()` — the callback that
re-enables `this.input` — had not run yet, so Phaser dropped the next press
without a trace. The rewrite's many `createElement` calls are slower than the
single `innerHTML` parse and widened the window until the failure was near
deterministic: the isolated spec failed 6 of 6 runs where the pre-rewrite modal
passed 3 of 3. Both specs now wait on `data-marketplace-close-count`, which
`BootScene` bumps inside that same callback *after* re-enabling input, making
the wait causal rather than a timing guess; the isolated spec then passed 6 of 6.

What made it worth chasing is that it hid under load. The full 51-test
Playwright run passed both before and after the fix, and `--repeat-each=6`
passed 12 of 12, because parallel workers shift the timing. `npm run verify`
would have stayed green while anyone running that one spec saw red.

`layout.spec.ts` and `production-smoke.spec.ts` also scope their "no DOM
navigation" assertion to `#game-viewport > nav`, since the marketplace mounts
its own `<nav class="market-tabs">` in the same parent and must not decide that
assertion either way.

`tests/server-integration/profiles-rls.integration.test.ts` no longer depends on
declaration order: a third anonymous identity, `userC`, owns the one test that
writes a `display_name`, leaving `userA` and `userB` read-only fixtures. Its
first test now proves the trigger instead of repeating the select policy, by
asserting `created_at` falls inside the sign-up call itself.

Validation: lint, `tsc --noEmit`, 401 unit tests, 51 Playwright E2E tests, and
13 server-integration tests against the live local stack all pass, alongside the
6-of-6 isolated re-run above. One unrelated one-off was observed and recorded:
`tests/unit/bundle-secret-scan.test.ts` failed once under heavy concurrent load
and did not reproduce in two further full runs or in isolation. That file is
untouched by this change; it is noted as a pre-existing latent flake, not a
finding against it.
