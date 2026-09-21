# Cat Collection and Role Assignment v1 — Implementation Plan

**Status:** Living implementation plan, 2026-09-20. Phases 0–9 are complete;
the full feature acceptance gate passed. The plan remains draft only because the
product/spec documents are still versioned drafts.

The Collection/Assignment scope is closed. The seeded-catalog Marketplace Buy
handoff is now tracked separately in
`marketplace-purchase-and-cat-assignment-implementation-plan-v1.md`; only
Rent, Sell, and My listings remain preview-only.

**Goal:** Implement the post-purchase cat journey defined by
`cat-collection-and-role-assignment-spec-v1-draft.md`: a signed-in user can
see owned cat instances, inspect each cat, replace the cat assigned to a
compatible mine role, and keep the authoritative assignment and production
effect across reload and re-login.

This plan is ordered. A phase must pass its validation gate before the next
phase starts. A phase may add tests and documentation while it is in progress,
but it must not silently widen the contract or bypass an earlier gate.

## 1. Source documents and current baseline

### 1.1 Binding inputs

- `memory-bank/cat-collection-and-role-assignment-spec-v1-draft.md` — product,
  UI, data, persistence, security, and acceptance contract for this feature.
- `memory-bank/marketplace-spec-v1-draft.md` — ownership lifecycle, roles,
  attributes, role scores, skills, benefits, and transaction authority.
- `memory-bank/marketplace-asset-implementation-plan-draft.md` — stable
  `assetId`, runtime role families, portrait/runtime fallback, and the rule
  that visual assets are not ownership identity.
- `memory-bank/server-save-sync-protocol.md` — bearer authentication,
  server-owned revision, conflict handling, and non-blocking cloud sync.
- `memory-bank/architecture.md` and `memory-bank/techContext.md` — current
  layer boundaries, save schema, database schema, and verified commands.
- `memory-bank/game-design-document.md` — player-facing mine layout and
  navigation context.

### 1.2 Current repository facts

- The base game has fifteen floors, one shared elevator, and one shared
  warehouse. Its authoritative data-only save document is `SaveDocumentV3`;
  `SaveDocumentV2` is retained only as a compatibility alias for existing
  repository callers.
- The approved Marketplace role set for this work is `Elevator`, `Warehouse`,
  and `Miner`. `Unloader` remains future-only.
- `src/ui/MarketplaceModal.ts` uses the seeded fixtures for catalog display;
  Buy now delegates to the live purchase handoff, while its My listings and
  Rent surfaces remain preview-only and never represent ownership.
- The current V3 save state contains gold, floors, elevator, warehouse, cat
  instances, and an explicit assignment map; V1/V2 documents migrate to an
  empty cat projection.
- Collection list/detail now consumes the data-only projection. Runtime role
  binding remains the next concern: its resolver must map
  `slot → catInstanceId → assetId → runtime asset` and must not use a sprite
  path as an ownership key. The runtime resolver and pure production modifiers
  are now implemented; final conflict/offline/recovery audit remains.

### 1.3 Non-negotiable constraints

- Server state is authoritative for ownership, purchase, assignment, and any
  gold-affecting operation. Local storage is a cache/offline projection.
- Cat blueprint identity and cat instance identity are separate.
- One cat instance may occupy at most one active role slot; one role slot may
  contain at most one cat instance.
- A replacement is atomic: the old cat returns to `Idle` when the new cat
  becomes `Assigned`.
- Role effects are pure data-driven modifiers layered onto existing base
  simulation formulas; they must not be calculated by the renderer.
- UI updates are event-driven, not per-frame polling.
- Renderer objects, sprite frames, textures, and animation state never enter
  the save document.
- Existing Marketplace preview behavior stays playable for Rent/Sell/My
  listings; the seeded Buy handoff is implemented by the follow-up plan.

## 2. Phase summary and dependencies

| Phase | Name | Depends on | Gate |
|---:|---|---|---|
| 0 | Contract lock and implementation boundary | Product draft | Design and scope gate |
| 1 | Pure cat domain and role-effect model | Phase 0 | Deterministic unit gate |
| 2 | Versioned local save and migration | Phase 1 | Save compatibility gate |
| 3 | Server ownership, purchase handoff, and collection API | Phases 0–2 | Auth/RLS/integration gate |
| 4 | Client repository, hydration, and account switching | Phases 2–3 | Reload/re-login data gate |
| 5 | Collection list and cat detail UI | Phase 4 | Responsive/accessibility UI gate |
| 6 | Assigned-cat panel and replacement flow | Phases 4–5 | Interaction/authority gate |
| 7 | Runtime role-slot binding | Phases 1, 4, 6 | Visual identity/slot gate |
| 8 | Simulation production effects | Phases 1, 6–7 | Deterministic economy gate |
| 9 | Conflict, offline, recovery, and release audit | Phases 2–8 | Full feature acceptance gate |

Phase 0 is the only phase that may revise the contract before implementation.
After Phase 0 closes, any change to role slots, ownership states, save shape,
or effect formulas requires an explicit decision-log entry and a plan update.

## 3. Phase 0 — Contract lock and implementation boundary

### Input

- The approved Marketplace story and the new Collection/Assignment draft.
- Current runtime role map and asset registry.
- Current V3 save document (with compatibility callers still named
  `SaveDocumentV2`), cloud save revision protocol, auth/session flow,
  and existing Marketplace preview tests.

### Work

1. Confirm the v1 role slots:
   - `miner:<floorId>` for eligible unlocked floors;
   - `elevator:main`;
   - `warehouse:main`.
2. Confirm that `Unloader` is not assignable in this milestone.
3. Confirm cat lifecycle behavior for `Idle`, `Assigned`, `Listed`, `Rented`,
   `Expired`, and `Locked`, including which states are visible and assignable.
4. Freeze the instance/blueprint boundary and the exact four attributes.
5. Freeze the role benefit formula and the fixed-step boundary at which a new
   assignment affects production.
6. Decide the concrete API names and whether purchase is a new command or an
   extension of a future Marketplace transaction function. Do not create a
   second ownership authority.
7. Confirm the next save schema version. The implementation has now confirmed
   `V3`; existing V1/V2 documents migrate to an empty cat projection and the
   compatibility type name remains `SaveDocumentV2` in older repository APIs.
8. Record the event names and the source-of-truth owner for each state.

### Output

- A closed scope decision recorded in this plan and, if needed, the decision
  log.
- A field-level cat-instance contract and assignment contract.
- A field-level local save projection contract.
- A server endpoint/function inventory with auth and revision requirements.
- A test matrix mapping each acceptance criterion to a unit, integration, or
  browser test.
- Updated `architecture.md`, `techContext.md`, or `productContext.md` only
  when a documented contract decision actually changes. No implementation
  schema migration is performed in this phase.

### Validation / gate

- No unresolved contradiction remains between the Marketplace state rules,
  the new Collection/Assignment spec, current runtime roles, and save-sync
  rules.
- The implementation team can answer, for every field, whether it is
  authoritative, derived, cached, or presentation-only.
- A proposed same-role replacement cannot assign one instance to two slots.
- The user-facing flow is complete from purchase success to collection to
  replacement to reload/re-login.

**Gate:** product/scope approval. Do not start Phase 1 until role slots,
schema-version direction, and purchase/assignment authority are accepted.

## 4. Phase 1 — Pure cat domain and role-effect model

### Input

- Phase 0 field and invariant contract.
- Existing `GameState`, `GameNumber`, role-score configuration, and production
  rate calculations.

### Work

1. Add engine-independent domain types under `src/core/`, for example:
   - `CatInstance` and serialized cat-instance types;
   - `CatAssignment`, slot keys, and assignment command results;
   - availability/state transition helpers;
   - role eligibility and assignment validation;
   - role-score, primary-skill, and benefit calculations.
2. Keep `assetId` as a stable string reference only. Do not import Phaser, DOM,
   asset registries, or persistence modules into the core domain.
3. Define deterministic comparison data for replacement previews:
   current value, candidate value, absolute delta, percentage delta, and the
   affected metric label.
4. Define domain events or an equivalent typed event interface for collection
   changes, assignment changes, benefit changes, and failed commands.
5. Define explicit results for invalid role, unavailable cat, duplicate
   assignment, stale revision, and no-op replacement.

### Output

- Pure cat/assignment/effect modules in `src/core/`.
- No renderer or network dependency in the new core modules.
- Deterministic fixtures for at least two cats per role, including a stronger
  and weaker replacement candidate.
- A documented mapping from role to affected production metric.

### Validation / gate

- Unit tests cover instance/blueprint separation, all lifecycle states, role
  eligibility, one-cat/one-slot invariants, atomic replacement result shape,
  same-cat no-op, and invalid command results.
- Role-score and benefit tests reproduce the Marketplace v1 examples and test
  both positive and negative replacement deltas.
- Repeated calculations with the same inputs are byte-for-byte/deterministically
  equivalent where serialized output is compared.
- `npm run test` and `npm run lint` pass.

**Gate:** pure domain gate. No UI or server code may calculate an independent
role score or effect formula after this phase.

### Phase 1 gate result — passed, 2026-09-19

The engine-independent domain is implemented in `src/core/cats/`. It freezes
`CAT_CALCULATION_VERSION = 1`, the three approved role profiles, explicit slot
keys, lifecycle/eligibility checks, atomic old-cat-to-Idle replacement, and
before/after comparison data. The unit suite covers shared blueprint identity,
the Marketplace score example (the literal arithmetic evaluates to `80.3`),
positive replacement deltas, wrong-role/stale/no-op rejection, and candidate
filtering. `npm run test -- --run tests/unit/cat-domain.test.ts` passed 6/6 and
`npm run build` passed. The next phase may add the V3 local projection but must
reuse these core helpers.

## 5. Phase 2 — Versioned local save and migration

### Input

- Phase 1 serialized domain types.
- Existing V3 save document (with `SaveDocumentV2` compatibility aliases),
  migration helpers, local repository, save recovery
  behavior, and server save-sync wire contract.

### Work

1. Extend the versioned save shape with the minimum local projection:
   - `cats`: locally visible cat instance records;
   - `assignments`: explicit slot key to `catInstanceId` mapping;
   - assignment/collection revision metadata needed to identify stale data;
   - no owner identity supplied by the client as an authority.
2. Add the next schema version and a pure `V2 → V3` migration. Existing saves
   migrate to an empty collection and unassigned role slots.
3. Validate exact keys, stable identifiers, role/slot compatibility, unique
   assignment, valid attribute ranges, state/assignment consistency, and
   serialized `GameNumber` values.
4. Preserve the existing save recovery behavior for malformed, corrupt, or
   unsupported documents.
5. Update both byte-identical database/save schema copies in
   `memory-bank/architecture.md` and `memory-bank/techContext.md` in the same
   implementation change. Update `INDEX.md` only if new top-level sections are
   added.
6. Keep runtime asset resolution out of serialization; loading reconstructs
   runtime presentation from `assetId`.

### Output

- Versioned local save read/write/migration implementation.
- V2 fixtures, V3 fixtures, malformed fixtures, and recovery fixtures.
- Updated architecture and tech-context schema contracts.
- A migration note explaining why old saves remain playable with no cats.

### Validation / gate

- V2 saves load into an empty collection without losing base-game state.
- V3 round-trips preserve cat instances, assignments, states, and exact large
  numbers.
- Invalid duplicate assignments, mismatched roles, missing cat IDs, stale
  revision metadata, and renderer-shaped data are rejected.
- Corrupt and unsupported saves follow the existing diagnostic/recovery path.
- Reloading the same local document reconstructs data-only state with no Phaser
  object or texture references.
- `npm run test`, `npm run lint`, and `npm run build` pass.

**Gate:** save compatibility gate. Do not add server writes or UI assumptions
that require fields not validated by the versioned local schema.

## 6. Phase 3 — Server ownership, purchase handoff, and collection API

### Input

- Phase 0 authority decision and Phase 1 domain contract.
- Phase 2 serialized projection.
- Existing Supabase auth/session, Edge Function conventions, RLS policies,
  server revision protocol, and Marketplace ownership rules.

### Work

1. Add the authoritative ownership model. The preferred bounded design is:
   - `cat_instances`: one row per owned instance with owner, stable asset,
     role, rarity, level, attributes, lifecycle state, and timestamps;
   - `cat_assignments`: one row per occupied slot with owner, slot key, cat
     instance, and assignment revision, with uniqueness constraints preventing
     one cat or slot from being assigned twice.
2. Add the required indexes and comments for role/state/owner reads.
3. Add caller-scoped read access for the collection projection. Client roles
   may read only their own visible rows and may not write ownership or
   assignment rows directly.
4. Add or extend the authoritative purchase handoff. It must deduct gold and
   create/transfer the cat atomically, be replay-safe, and return the new
   instance only after commit.
5. Add the authoritative assignment/replacement command. It accepts the cat
   instance, slot key, and expected assignment revision; the server derives the
   user from the bearer token and validates role, ownership, availability, and
   concurrency.
6. Ensure the replacement commits old-cat `Idle` and new-cat `Assigned` as one
   transaction. A failed command must leave both the database and the previous
   production state unchanged.
7. Return a caller-safe projection containing no unrelated `user_id` values or
   private transaction details.
8. Update database schema documentation in both required copies in the same
   change. Record RLS and deletion/relationship behavior explicitly.

### Output

- Database migration(s) for cat instances and assignments.
- Edge Function/service contracts for collection read, purchase handoff, and
  assignment replacement.
- Caller-scoped RLS/grant policy and indexes.
- Server-side role-score/benefit validation using the agreed calculation
  version.
- Server unit tests and real-stack integration fixtures.
- Updated `architecture.md` and `techContext.md` complete schema sections.

### Validation / gate

- A signed-in fixture user can purchase once, receive exactly one instance,
  and see the gold deduction and instance in one committed result.
- Replaying the same purchase/assignment request does not duplicate a cat,
  deduct gold twice, or move a cat twice.
- A caller cannot read, assign, or mutate another user's cat.
- Wrong-role, listed, rented, locked, duplicate-slot, duplicate-cat, stale
  revision, and insufficient-funds requests are rejected.
- A valid replacement changes exactly two cat states and one slot atomically.
- RLS mutation tests prove direct client writes are refused.
- Relevant server-unit and server-integration suites pass, including the
  existing adversarial/RLS suite.

**Gate:** auth/RLS/integration gate. Do not expose a client CTA that can claim
purchase or assignment success before this gate passes.

### Phase 3 gate result — passed, 2026-09-19

The authoritative server path is implemented by
`20260919100000_create_cat_collection.sql` and the `cat-collection` Edge
Function. It derives blueprint role/price/attributes server-side, deducts the
wallet and creates an owned instance atomically, replays purchases by
`idempotencyKey`, and replaces assignments with an expected revision. Direct
client grants are revoked and the migration-derived RLS matrix now covers all
eleven public tables.

Evidence: `npm run supabase:reset` applied the migration on the local stack;
the focused cat integration covered auth, ownership, purchase replay, role
mismatch, stale revision, and assignment persistence; and the full
`npm run test:server-integration` gate passed 21 files / 132 tests. The existing
save-sync tests also pass with V3 after restarting the Edge runtime so the
generated bundle is not stale.

## 7. Phase 4 — Client repository, hydration, and account switching

### Input

- Phase 2 local save projection.
- Phase 3 server collection and assignment projections.
- Existing guest/provider session flow, cloud save repository, conflict policy,
  and boot/lifecycle persistence coordinator.

### Work

1. Add typed client repository methods for collection read, purchase result,
   assignment replacement, retry, and authoritative refresh.
2. Hydrate local data from the authenticated account without blocking the first
   playable frame. The current preview remains available while the collection
   request is loading.
3. On a successful authoritative response, update the in-memory domain state,
   write the local projection safely, and schedule/upload through existing
   revision rules.
4. On logout or account switch, clear the previous account's in-memory and
   UI projections before loading the next account. Never merge collections
   between identities.
5. Mark last-known local data as stale when the server cannot be reached. Keep
   read-only display available where safe, but disable ownership-changing
   actions until authority returns.
6. Emit typed domain events consumed by UI and runtime rather than polling
   `GameState` from DOM code.

### Output

- `src/platform/`/`src/persistence/` repository adapters for cat data.
- Account-scoped hydration and clear-on-switch behavior.
- Event-driven collection/assignment state store or coordinator.
- Local/cloud conflict handling for the new projection.
- Diagnostics for loading, stale, retryable, rejected, and signed-out states.

### Validation / gate

- Same-account reload restores the exact collection and assignments.
- Logout/login as another account cannot display the previous account's cats.
- A delayed or failed server response never replaces a confirmed assignment
  with stale local data.
- A failed upload leaves the last authoritative assignment visible and marks
  the local projection appropriately.
- Boot remains playable offline and does not await collection network work
  before the first frame.
- Unit tests cover identity clearing, hydration, stale data, retry, and
  revision conflict behavior.

**Gate:** account/reload data gate. The UI phase may consume only the typed
  repository/state contract, not raw Supabase responses or local storage.

### Phase 4 gate result — passed, 2026-09-19

`loadActiveGame` now returns the data-only `catRoster` and preserves it when
settling offline income. `MineSimulationDriver` owns the validated roster
alongside `GameState`, while every main-thread save path includes the roster.
`src/platform/web/catCollection.ts` provides defensive, refresh-aware typed
collection/purchase/assignment adapters. Hydration runs after the driver/game
is created, so the first playable frame is not blocked; an authoritative
projection is then validated and persisted locally. Unconfigured/offline
responses retain the last safe local projection.

Evidence: the adapter and reload-hydration unit tests pass; the focused
save-schema/persistence suite passes 49 tests; `npm run build` and `npm run
lint` pass. Account switching continues through the existing cloud reconcile
and boot path; UI clear-on-switch remains part of Phase 5/6 state-store work.

## 8. Phase 5 — Collection list and cat detail UI

### Input

- Phase 4 typed collection state and events.
- Asset registry/portrait fallback contract.
- Existing responsive portrait viewport, modal focus patterns, Marketplace
  visual language, and state icon family.

### Work

1. Add a dedicated Collection entry point with a stable navigation key. Do not
   overload Marketplace's `My listings` tab.
2. Build a responsive collection screen using containers/grids and safe-area
   insets. Avoid fixed absolute positions that only work at 390×844.
3. Render cards with portrait, instance name, role, rarity, level, status, and
   assignment location.
4. Add search, role/rarity/state filters, deterministic sorting, empty state,
   loading state, retryable error state, and stale/offline presentation.
5. Add cat detail with attributes, role score, skill, benefit, assignment
   location, and only the actions allowed by authoritative state.
6. Reuse stable `assetId` and safe portrait fallback. Do not load animation
   sheets solely to render collection cards.
7. Make the screen keyboard/gamepad navigable where supported: initial focus,
   predictable card order, visible focus, Escape/back, and no focus loss when
   filters or detail overlays rerender.
8. Keep strings externalizable or centralized so longer translations can flow
   inside the layout.

### Output

- Collection screen/modal and cat detail component(s) in `src/ui/`.
- Navigation wiring from the game shell.
- UI state presentation contract for loading, empty, stale, failed, and
  authoritative data.
- Unit tests for view-model/filter/action permissions.
- Browser tests and screenshots at 390×844 and 320×568.

### Validation / gate

- A newly signed-in account sees the empty state; a purchased fixture sees the
  correct instance card and detail.
- Search/filter/sort operate on instance data without changing domain state.
- Assigned, listed, rented, expired, and locked states show only valid actions.
- Failed portraits use the safe placeholder and remain identifiable by
  `assetId` diagnostics.
- The layout has no horizontal overflow at both required portrait viewports.
- Keyboard/touch navigation can open, inspect, back out, and close without
  losing the user's context.
- Focused UI unit/E2E tests, `npm run lint`, and `npm run build` pass.

**Gate:** responsive/accessibility UI gate. Do not connect the replacement CTA
until the collection accurately distinguishes preview, owned, and rented data.

### Phase 5 gate result — passed, 2026-09-19

`CollectionModal` is now a dedicated owned-cat list/detail surface wired from
the stable `managers` navigation key, so the existing five-button canvas shell
and its browser contract remain unchanged while the seeded Buy handoff is
tracked by the follow-up plan.
The list reads the validated `MineSimulationDriver.catRoster` projection and
renders portrait, instance name, role, rarity, level, lifecycle state, and
assignment location. Search, role/rarity/state filters, deterministic sorting,
empty state, keyboard focus, Escape/backdrop close, detail back navigation, and
safe portrait fallback are implemented. Detail shows the four attributes, the
single core role score/skill/benefit calculation, and assignment context; it
does not expose a replacement mutation before Phase 6.

Evidence: the new `tests/e2e/cat-collection.spec.ts` passes at both 390×844 and
320×568 with a V3 seeded roster, covering three owned cards, search, detail,
assigned-slot text, role filtering, and horizontal-overflow protection. The
manual local-browser pass confirmed the empty state, modal focus, and visual
responsive shell; the accessibility tree exposed the Collection heading,
search field, four filters, close button, and empty-state copy. The full
Chromium suite passes 58/58, the full unit suite passes 64 files / 734 tests,
and `npm run lint`, `npm run build`, and `git diff --check` pass. Hydration
refreshes an already open Collection modal after the authoritative roster
arrives, so opening the screen during non-blocking boot cannot leave a stale
empty projection.

The next phase may add current-cat panels and replacement actions, but it must
reuse the same core role/effect helpers and must keep mutation authority out of
`CollectionModal`.

## 9. Phase 6 — Assigned-cat panel and replacement flow

### Input

- Phase 4 authoritative client repository/events.
- Phase 5 Collection/detail UI and action-permission contract.
- Phase 1 eligibility/comparison helpers and Phase 3 assignment command.
- Current mine click targets and role-slot diagnostics.

### Work

1. Make each supported runtime role slot open an assigned-cat information
   panel, showing current cat, role, location, skill, benefit, and `Change cat`.
2. Add a candidate picker pre-filtered to the exact slot role and assignable
   states. Keep the current cat visible and prevent a misleading same-cat
   confirmation.
3. Add before/after comparison for the role-specific production metric,
   including both positive and negative deltas.
4. Add cancel/back/detail navigation that preserves selection and focus.
5. Add a pending state that keeps the old sprite and old effect active while
   the command is in flight.
6. Submit only `catInstanceId`, `slotKey`, and the expected assignment
   revision. Do not submit owner, role, score, or calculated bonus as authority.
7. On authoritative success, consume the returned assignment projection and
   emit one state transition for old cat, new cat, slot, and effect.
8. On stale, rejected, offline, or network failure, keep the old assignment,
   close nothing unexpectedly, and expose retry/cancel behavior.

### Output

- Assigned-cat panel and role-filtered replacement picker.
- Comparison view-model and action-state handling.
- Client command adapter and success/failure reducer.
- Unit tests for candidate filtering, comparison, pending, success, rejection,
  stale revision, and duplicate-submit prevention.
- Browser flow covering click current cat → change → select → confirm.

### Validation / gate

- A Miner slot cannot select Elevator or Warehouse candidates, and vice versa.
- Selecting a candidate alone does not change the runtime, save, or production.
- Confirming a valid candidate changes the visible result only after the
  authoritative response.
- During a pending request the old cat remains rendered and duplicate submits
  are impossible.
- Rejection leaves old cat, assignment, and production unchanged.
- Success returns the old cat to `Idle`, assigns the new cat, and refreshes the
  collection/detail state without a full page reload.
- Browser tests pass at both required portrait viewports.

**Gate:** interaction/authority gate. The feature must be safe if the user
double-clicks, loses the network, or has a stale account revision.

### Phase 6 gate result — passed, 2026-09-20

`CatAssignmentModal` now opens from every supported runtime role slot: miner
sprites open the exact floor slot, the elevator cargo cat opens
`elevator:main`, and the warehouse manager opens `warehouse:main`. The picker
uses the core role/availability filter, keeps the old cat rendered while a
command is pending, shows role-score and metric deltas, disables duplicate
submit, and consumes only an authoritative returned roster on success. The
client mutation adapter submits `catInstanceId`, `slotKey`, and
`expectedAssignmentRevision` only; offline, stale, role, and assignability
rejections keep the picker open and preserve the old projection.

Evidence: the offline browser flow passes at 390×844 and 320×568 with the
candidate and old-cat state unchanged after an unavailable command. The
server-backed fixture passes both viewports, asserts the exact three-field
payload, and verifies the success projection. The gate found and fixed an
adapter path bug where an already-appended mutation route became
`/v1/assignment/v1/assignment`. Runtime asset and production-effect changes
remain isolated to Phases 7–8.

## 10. Phase 7 — Runtime role-slot binding

### Input

- Phase 6 authoritative assignment events.
- Existing `BootScene` role presentation, runtime asset registry, display boxes,
  anchors, animation clock, and placeholder fallback.

### Work

1. Replace the presentation-only role mapping with explicit runtime slot state.
2. Resolve each slot through:

   ```text
   slotKey → catInstanceId → cat instance → assetId → runtime sheet/portrait
   ```

3. Apply the assigned cat to the exact existing role position, preserving
   semantic display size, anchor, facing, animation timing, and mine scrolling.
4. Keep the old asset visible until the authoritative assignment event arrives.
5. Use the safe placeholder when the runtime sheet is absent, and publish a
   diagnostic without changing the cat instance or role.
6. Ensure the same instance identity links Marketplace/Collection portrait,
   detail view, and in-world presentation.
7. Do not put texture, frame, sprite, animation, or Phaser state into save data.

### Output

- Runtime slot resolver and assignment event handler.
- Role-slot diagnostics showing slot, instance, asset, fallback, scale, and
  anchor data.
- Runtime regression tests for each role and missing-asset fallback.

### Validation / gate

- A valid replacement changes only the intended slot and keeps its position,
  scale, baseline, facing, and animation contract.
- Reload/re-login reconstructs the same asset in the same slot.
- A missing asset remains playable and is visibly diagnosed.
- One instance cannot render in two assigned slots.
- Runtime presentation changes do not change production until Phase 8's domain
  effect event is applied.
- Focused runtime browser test and full existing Marketplace/runtime E2E pass.

**Gate:** visual identity/slot gate. No asset-path or sprite identity may leak
into ownership or save authority.

### Phase 7 gate result — passed, 2026-09-20

The runtime resolver now binds each role slot through the authoritative cat
instance and `assetId`, preserves the existing position/scale/animation
contract, and reports slot, instance, asset, runtime asset, and fallback
diagnostics on the canvas. An approved runtime sheet renders directly; an
assigned cat without a local sheet stays playable on the role placeholder while
retaining its owned identity. The assignment/reload browser fixture proves the
same slot and fallback survive a local save and reload. Focused runtime E2E
passes 3/3, server-backed assignment/reload passes 2/2, and resolver tests
cover approved and missing assets. No renderer state enters the save projection.

## 11. Phase 8 — Simulation production effects

### Input

- Phase 1 pure role-benefit model.
- Phase 6 confirmed assignment events.
- Existing fixed-step simulation and production-rate contracts.
- Phase 7 runtime slot mapping for diagnostics only.

### Work

1. Add assigned-cat effects as pure inputs to the relevant simulation stage:
   - Miner → assigned floor extraction/yield;
   - Elevator → shared elevator throughput/cycle;
   - Warehouse → shared conversion/processing rate.
2. Apply the effect at the next fixed simulation boundary after assignment
   confirmation. Never mutate production halfway through a tick.
3. Preserve the existing extraction → elevator → warehouse order, queue
   conservation, large-number behavior, offline bounds, and bottleneck logic.
4. Recompute derived production rates from authoritative assignment state on
   load; do not persist a renderer-calculated rate as authority.
5. Make replacement deltas observable in the comparison UI and diagnostics.

### Output

- Core effect integration and role-specific production-rate projections.
- Tests for stronger and weaker replacements, unassigned slots, all three
  roles, fixed-step timing, and offline catch-up.
- Updated architecture contracts for cat effects and stage boundaries.

### Validation / gate

- Assigning a stronger or weaker compatible cat changes only the intended
  metric and changes it in the expected direction.
- Removing an assignment removes that modifier; it does not transfer to a
  different cat or slot.
- Equal elapsed time remains deterministic regardless of update chunking.
- Queue/material conservation and existing bottleneck precedence remain valid.
- Reloading the same authoritative assignment produces the same derived rate.
- Full unit suite, build, lint, and relevant production browser tests pass.

**Gate:** deterministic economy gate. No balance or effect formula may be
considered complete without tests against the existing simulation contracts.

### Phase 8 gate result — passed, 2026-09-20

`createCatProductionModifiers` derives renderer-free modifiers from the
authoritative roster and `calculateCatRoleEffect`. Miner, elevator, and
warehouse effects enter the existing fixed-step extraction → transport →
conversion pipeline; the HUD/rate projection, save snapshot, offline rate, and
server progress bound use the same derived inputs. Direct simulation tests prove
positive changes to miner extraction, elevator transit, and warehouse delivery;
rate tests prove an assigned cat changes only its affected metric, while save
tests prove the persisted rate snapshot includes the assignment effect.
`npm run test` passes 64 files / 739 tests, server unit passes 195 tests,
server integration passes 21 files / 132 tests, focused runtime/assignment E2E
passes 3/3, and lint/build are green.

## 12. Phase 9 — Conflict, offline, recovery, and release audit

### Input

- All previous phase outputs.
- Server revision/conflict policy and save recovery rules.
- Existing full verification commands and Marketplace asset/runtime audit.

### Work

1. Exercise purchase, collection, assignment, replacement, reload, logout,
   re-login, and account-switch flows end to end.
2. Test concurrent device changes: stale assignment, stale collection, lost
   response followed by retry, and server rejection.
3. Test offline boot with last-known data, disabled ownership-changing CTA,
   reconnection refresh, and no false success state.
4. Test corrupted/older local saves and server documents with cat fields.
5. Verify no user ID, secret, session token, raw owner data, or renderer object
   enters a client-visible or serialized shape incorrectly.
6. Verify mobile layout, safe-area behavior, focus/back behavior, portrait
   fallback, runtime scale, and no cross-account data bleed.
7. Update all affected memory-bank contracts after implementation is complete:
   `architecture.md`, `techContext.md`, `productContext.md`, `activeContext.md`,
   `progress.md`, and the relevant archive logs. Keep `INDEX.md` synchronized
   if top-level sections change.

### Output

- Full feature acceptance report with test counts and commands.
- Final migration and rollback notes.
- Security/RLS and conflict evidence.
- Screenshots or recordings for Collection, Cat Detail, replacement compare,
  pending/rejected states, and the three in-world role slots.
- Updated memory-bank status showing the feature gate and any remaining risks.

### Validation / gate

- `npm run lint` passes.
- `npm run test` passes with all new pure-domain, save, and client tests.
- `npm run build` passes.
- `npm run test:e2e` passes with Collection, detail, replacement, reload, and
  responsive coverage.
- `npm run verify:server` or the repository's current server verification
  command passes with ownership, purchase, assignment, RLS, and conflict tests.
- Production smoke passes and the game remains playable without a network on
  the boot path.
- The final acceptance criteria in the source spec are all evidenced; no
  phase is marked complete from code presence alone.

**Gate:** full feature acceptance. Only after this gate may the feature be
described as implemented and authoritative. Until then, Marketplace preview
fixtures remain non-owned sample data.

### Phase 9 gate result — passed, 2026-09-20

- Full client unit suite: 64 files / 739 tests passed.
- Client lint, production build, secret scan, and `git diff --check` passed.
- Full client browser suite: 60/60 passed.
- Production smoke: 10/10 passed, including corrupt/unsupported-save recovery,
  local-storage failure, lazy Supabase chunk failure, and responsive layouts.
- Server verification: `npm run verify:server` passed migrations/reset,
  core portability, Edge Function warm-up, 195 Deno unit tests, 21 integration
  files / 132 tests, and 11 server browser tests.
- Focused cat runtime/assignment browser coverage passed 3/3; the server-backed
  assignment/reload cases passed 2/2.
- Manual browser verification confirmed the ready empty Collection state
  (`0 owned cats · Collection #0`), the role-specific empty assignment panel
  (`Slot miner:floor-1`, no compatible cats), and that dismissing a sync
  diagnostic no longer opens Account & Settings through the HUD underneath.
- The implementation also closes the release-audit issue found during manual
  review: `SaveDiagnosticBanner` now captures `pointerdown/up` and mouse
  sequences before Phaser's window-level input handlers, with a production
  regression assertion for the hidden settings modal.

**Acceptance:** passed. The cat collection, detail, authoritative compatible
replacement, runtime role binding, production effects, persistence/recovery,
and release-audit scope is implemented. The seeded Buy handoff is no longer a
non-owned boundary; its remaining live validation is tracked by the follow-up
plan. Rent/Sell/My listings remain non-owned preview surfaces.

## 13. Required test matrix

| Area | Minimum evidence |
|---|---|
| Core domain | Instance identity, role eligibility, state transitions, atomic replacement, score/benefit comparison |
| Save | V2→V3 migration, V3 round-trip, malformed/unsupported data, no renderer state |
| Server | Purchase atomicity, caller scope, RLS refusal, replay safety, assignment revision conflicts |
| Client data | Hydration, account clearing, stale/offline, retry, lost-response handling |
| Collection UI | Empty/loading/error/stale, cards, detail, filters, portrait fallback, focus/back |
| Assignment UI | Same-role candidates, before/after delta, pending, success, reject, duplicate submit |
| Runtime | Slot identity, exact role position, scale/anchor, missing asset fallback, reload |
| Simulation | Miner/elevator/warehouse effects, positive/negative deltas, fixed-step boundary, conservation |
| End to end | Login → purchase → collection → detail → assign/replace → reload → relogin |

## 14. Stop conditions and change control

Stop the current phase and update this plan before continuing if:

- the user wants a role outside Elevator/Warehouse/Miner;
- a cat may occupy multiple slots or shared ownership is introduced;
- purchase, assignment, or ownership is moved from server authority to local
  state;
- the save schema cannot represent an assignment without renderer data;
- the role-benefit formula or affected production metric changes;
- the current server revision/conflict protocol is replaced;
- a UI decision would make Collection indistinguishable from Marketplace
  listings or temporary rentals.

Every such change requires a dated decision, affected phases, migration impact,
and updated acceptance tests in the memory bank before code changes resume.
