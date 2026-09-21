# Cat Collection and Role Assignment v1 — Draft Specification

**Status:** Draft for product and implementation planning, 2026-09-19.

**Purpose:** Define the player journey after a signed-in user acquires a cat:
the cat enters the user's collection, the user can inspect it, and the user
can replace the cat currently assigned to a compatible mine role. The selected
assignment must be authoritative, persist across reloads and re-login, and
change the relevant production result according to the cat's role, skill, and
score.

This document extends `marketplace-spec-v1-draft.md`. It does not replace the
marketplace's listing, rental, or sale rules. It consumes the live seeded-
catalog Buy result: ownership is created by the server purchase command and
then projected into Collection.

## 1. Scope and product story

### 1.1 Acquisition to collection

1. A signed-in user purchases a cat through the Marketplace.
2. The server atomically confirms the purchase, deducts the required gold, and
   creates or transfers one uniquely identifiable cat instance to the buyer.
3. The buyer receives the cat in `Idle` state in the buyer's permanent
   collection. A purchase does not auto-assign the cat to a mine.
4. The client shows a success result and offers `View collection` and
   `View cat` actions only after the authoritative response succeeds.
5. The collection is tied to the authenticated account, not to a browser,
   device, display name, or sprite asset.

### 1.2 Collection and detail

The user can open a dedicated `Collection` screen and see every permanent cat
owned by the account. Each cat has a detail surface with its identity, role,
rarity, level, current attributes, role score, primary skill, current
availability, and current assignment location when assigned.

The UI may also show active rented cats in a separate `Rented` view for the
current user's temporary roster. A rented cat is not permanent ownership and
must never be presented as owned by the renter.

### 1.3 Replacing a cat in the mine

When the user clicks a cat currently visible in the mine:

1. The game opens a role-specific information panel for the currently
   assigned cat.
2. The panel shows the current cat's stats, skill, role benefit, assignment
   location, and a `Change cat` CTA.
3. `Change cat` opens the user's collection filtered to the exact role of the
   selected mine slot. Ineligible roles are not selectable.
4. Selecting a candidate shows a comparison with the current cat, including
   the expected change to the affected production metric.
5. The user confirms with `Confirm change`.
6. The client sends an authoritative assignment command. While it is pending,
   the old cat remains visible and the confirm control is disabled.
7. On success, the old cat returns to `Idle`, the new cat becomes `Assigned`,
   the runtime sprite is replaced in the same role slot, and the relevant
   production calculation uses the new cat from the next simulation boundary.
8. On failure, the old cat, assignment, and production result remain
   unchanged; the user receives a retryable error state.

## 2. v1 role slots and assignment defaults

The approved Marketplace roles are `Elevator`, `Warehouse`, and `Miner`.
`Unloader` remains future-only unless separately approved.

V1 defines these assignment slots:

| Slot key | Role | Assignment target |
|---|---|---|
| `miner:<floorId>` | `Miner` | One cat for each eligible unlocked mine floor |
| `elevator:main` | `Elevator` | The shared elevator operation |
| `warehouse:main` | `Warehouse` | The shared warehouse operation |

Rules:

- A slot contains at most one cat instance.
- A cat instance can occupy at most one active slot at a time.
- A cat's role is immutable and determines the slots it can occupy.
- The user may replace a cat only with an `Idle` or otherwise assignable cat of
  the exact matching role.
- Replacing a cat is not a second ownership transaction. It changes the
  assignment relationship only.
- The previous cat is returned to `Idle` atomically with the new assignment.
- A listed, rented-to-another-user, expired/locked, or otherwise unavailable
  cat cannot be assigned by the owner.
- The runtime asset catalog's current presentation mapping is not ownership
  state. A future assigned instance must resolve its stable `assetId` through
  the catalog; a sprite path or blueprint identity must not be used as the
  ownership identity.

The first implementation may expose only the slots supported by the current
mine presentation, but it must keep the slot key explicit so a later floor
unlock does not require a save-format rewrite.

## 3. Authoritative cat model

### 3.1 Blueprint versus instance

An asset/character blueprint is reusable. Ownership belongs to a cat instance.
Two instances may use the same blueprint and still have different owners,
levels, attributes, assignment states, and transaction history.

The existing asset registry remains the presentation authority for `assetId`,
portrait, runtime sheet, role family, and rarity metadata. It is not an
ownership database.

### 3.2 Cat instance fields

The authoritative instance contract is:

| Field | Meaning |
|---|---|
| `catInstanceId` | Stable opaque identifier for one owned cat instance |
| `ownerUserId` | Server-derived owner; never accepted from the client body |
| `assetId` | Stable blueprint/visual identity from the allowlisted catalog |
| `displayName` | Player-facing name for this instance |
| `roleId` | Immutable `elevator`, `warehouse`, or `miner` role |
| `rarityTier` | Immutable rarity for the instance |
| `level` | Current instance level |
| `attributes` | Authoritative `power`, `speed`, `capacity`, `efficiency` values |
| `calculationVersion` | Version of the role-score and benefit configuration |
| `availabilityState` | `Idle`, `Assigned`, `Listed`, `Rented`, `Expired`, or `Locked` |
| `assignedSlotKey` | Slot key when assigned; `null` otherwise |
| `updatedAt` | Server timestamp for ordering and conflict diagnostics |

`roleScore`, `primarySkill`, and `skillBonus` are derived from the
authoritative attributes, role, and `calculationVersion`. If the server stores
derived values for query speed, it must validate or recompute them rather than
trusting client-provided values.

### 3.3 Collection projection

The collection endpoint/projection must return only cats visible to the
authenticated caller:

- Permanent owned cats, including cats currently `Idle`, `Assigned`, `Listed`,
  or rented out.
- Active rented cats in a clearly separate temporary view, if the feature is
  enabled for the caller.
- No other user's `user_id` or private transaction data.

The projection must include enough data for cards, detail, role filtering,
assignment eligibility, and stat comparison. It must not require the client to
infer ownership from a display name or asset ID.

## 4. Collection UI contract

### 4.1 Entry points

- The game exposes a dedicated `Collection`/cat entry point; it must not be
  represented by Marketplace's `My listings` tab.
- A successful purchase may deep-link to the new collection or the purchased
  cat's detail view.
- The mine's visible role cat opens the assigned-cat panel, not the public
  Marketplace listing detail.

### 4.2 Collection screen

The collection screen contains:

- A responsive card grid/list that works at the existing portrait viewports
  and narrow 320 px layouts.
- Cat portrait, name, role, rarity, level, availability state, and assigned
  slot/location when applicable.
- Search by display name or stable player-facing name.
- Filters for role, rarity, and availability state.
- A deterministic sort default and explicit sort options (for example: role,
  rarity, level, and newest acquisition).
- A clear empty state for a newly signed-in account with no permanent cats.
- Loading, retryable error, and stale/offline states that do not imply that a
  transaction or assignment succeeded.

Cards use the same stable `assetId` and portrait fallback rules as Marketplace.
They must not decode or depend on premium animation sheets merely to render the
collection list.

### 4.3 Cat detail screen

The detail surface shows:

- Portrait and identity: name, role, rarity, level, and availability.
- `Power`, `Speed`, `Capacity`, and `Efficiency`.
- Role score, primary skill, current bonus, and calculation version or a
  player-friendly version label when product policy requires it.
- Current assignment slot/location, or `Idle` when unassigned.
- The role benefit in the relevant player-facing unit: mining output,
  elevator throughput, or warehouse processing.
- Allowed actions based on authoritative state. Conflicting actions must not
  appear simultaneously; for example, an `Assigned` cat may show `Change
  cat` but not `Assign`, and a `Listed` cat must not show `Assign`.

## 5. Mine assignment and replacement UI contract

### 5.1 Assigned-cat panel

Clicking a visible assigned cat opens an accessible panel with:

- The current cat's portrait and identity.
- The exact role slot and mine location.
- Current role benefit and the production metric affected.
- A `Change cat` CTA.
- A close/back control that returns focus to the same mine interaction.

The panel is a game-state overlay. It does not reuse a public Marketplace
listing card and does not expose buy/rent actions.

### 5.2 Candidate picker

The candidate picker:

- Is pre-filtered to the slot's exact role.
- Excludes cats that are not assignable according to authoritative state.
- Marks the current cat and prevents a misleading no-op confirmation.
- Shows enough stats to compare candidates without opening every detail page.
- Shows an explicit before/after delta for the affected rate or cycle time.
- Preserves selection while the user navigates back from a candidate detail.

The picker must support keyboard focus and touch navigation. When opened, the
first eligible candidate or the current selection receives focus. `Escape`, a
back action, or cancellation returns to the assigned-cat panel without
changing state.

### 5.3 Confirmation and result

`Confirm change` is enabled only when a different eligible candidate is
selected. Confirmation:

- Disables duplicate submissions.
- Uses the latest assignment revision or equivalent optimistic-concurrency
  token.
- Keeps the old runtime sprite and old stat result until the server confirms.
- On success, updates collection state, assignment state, runtime presentation,
  and derived production through one event-driven state transition.
- On rejection or network failure, leaves the previous assignment active and
  gives the user a retry path.

The game must not display the new cat or new production value merely because a
candidate was selected locally.

## 6. Production and role-benefit contract

The existing simulation remains authoritative for base mine, elevator, and
warehouse rates. Cat assignment supplies a role-specific modifier; it must not
duplicate or replace the existing stage formulas.

For a compatible assigned cat:

```text
effectiveRate = baseRate × (1 + skillBonus)
effectiveCycleTime = baseCycleTime / (1 + skillBonus)
```

The affected metric is determined by role:

| Role | Affected result |
|---|---|
| `Miner` | Mining yield/output rate for the assigned floor |
| `Elevator` | Elevator throughput/cycle rate |
| `Warehouse` | Warehouse processing/conversion rate |

Rules:

- The benefit uses the same versioned role-score and skill configuration as
  Marketplace preview and server validation.
- A higher score may increase the result; a lower score may decrease it when
  replacing a stronger cat. The comparison must show both cases honestly.
- Assignment changes take effect at the next fixed simulation boundary, never
  halfway through a tick.
- Visual sprite replacement is presentation-only and cannot change production
  without the authoritative assignment transition.
- Removing or losing an assigned cat leaves the slot unassigned and removes
  that cat's modifier; it must not silently transfer the modifier to another
  cat.
- A cat's role benefit is applied only to compatible slots. There is no
  cross-role bonus in v1.

## 7. Persistence, login, and synchronization

### 7.1 Source of truth

Ownership, cat instances, and active assignments are account-owned server
state. Local storage is a cache and offline continuity mechanism; it is not
proof of ownership and cannot grant a purchased cat or assignment on its own.

The authenticated boot flow must:

1. Restore or establish the user's session.
2. Download the latest collection and assignment projection, or use a clearly
   marked last-known local projection when offline.
3. Reconstruct collection cards and mine role slots from plain data.
4. Resolve each assigned instance's `assetId` through the local allowlisted
   catalog and apply its runtime presentation.

On re-login with the same account, the server projection must restore the same
cat instances and slot assignments on any supported device. A different
account must never inherit the previous account's collection or assignments.

### 7.2 Save document requirements

When implementation begins, the versioned save contract must add the minimum
authoritative projection required for local continuity:

- `cats`: serialized cat instance records visible to the local account;
- `assignments`: slot key to `catInstanceId` mapping;
- an assignment/collection revision or equivalent server sync metadata;
- no sprite frame, Phaser object, texture object, or animation state.

The existing save schema migration rules remain binding. The implementation
must choose a new schema version and update both byte-identical schema copies
in `architecture.md` and `techContext.md` in the same change. Older saves
without cats migrate to an empty collection and unassigned role slots.

### 7.3 Assignment write contract

The future authoritative command should accept only:

```text
catInstanceId
slotKey
expectedAssignmentRevision
```

The server derives the caller identity from the bearer token and validates:

- the cat exists and belongs to the caller;
- the slot exists and requires the cat's exact role;
- the cat is assignable and is not already assigned elsewhere;
- the expected revision still matches;
- the replacement of old cat and assignment of new cat are atomic.

The response returns the authoritative old/new assignment projection, the new
revision, and the derived role benefit needed by the client. It must not rely
on a client-supplied `ownerUserId`, role, score, or benefit.

### 7.4 Failure and offline behavior

- A failed cloud read may leave the game playable with the last-known local
  projection, but the UI must label it stale and disable ownership-changing
  actions until authority is restored.
- A failed assignment write must not change the visible assigned cat or the
  production result.
- A successful assignment must be saved locally immediately and uploaded using
  the existing optimistic-concurrency/revision rules.
- A reload after a successful assignment must reconstruct the new runtime
  sprite and modifier from saved data, not from an in-memory singleton.

## 8. Event and runtime integration contract

The UI must react to domain events rather than polling the simulation every
render frame. Minimum events are:

- `cat_collection_changed`;
- `cat_assignment_changed`;
- `cat_effective_benefit_changed`;
- `cat_assignment_request_failed`.

The runtime resolver maps:

```text
assigned slot → catInstanceId → cat instance → assetId → runtime sheet/portrait
```

If an asset is missing, the existing safe placeholder fallback keeps the game
renderable, but the missing asset must be visible in diagnostics. A missing
asset must not alter ownership or silently change the assigned cat's role.

The first frame must remain playable offline. Collection or assignment network
work must not block Phaser boot, but authoritative actions must wait for a
valid authenticated response before claiming success.

## 9. Security and consistency rules

- The client never decides ownership from a local asset ID, display name, or
  Marketplace card.
- The server derives the account from the verified session token.
- Collection reads are caller-scoped; no cross-account cat instances are
  returned.
- Purchase, assignment, replacement, and any gold-affecting transaction use
  server validation and idempotent/replay-safe handling.
- A stale assignment command cannot overwrite a newer assignment.
- Ownership, assignment, rental, and listing state must not imply one another
  without an authoritative state transition.
- The UI must never show a successful replacement before the server response.

## 10. Acceptance criteria

### Collection

- A logged-in user who successfully buys a cat sees exactly that cat in the
  permanent collection after the authoritative purchase response.
- The collection shows the correct portrait, role, rarity, level, attributes,
  state, and detail data for each instance.
- Two instances using the same `assetId` remain independently identifiable.
- A newly signed-in account with no cats receives a clear empty state.
- Collection filters and search do not mutate ownership or assignment.

### Assignment

- Clicking an assigned mine cat opens the correct current-cat information panel.
- `Change cat` shows only eligible same-role candidates.
- The comparison shows the expected production delta before confirmation.
- Confirming a valid change replaces the runtime cat in the same slot, returns
  the previous cat to `Idle`, and updates the correct production metric.
- The change is visible only after authoritative confirmation.
- Reloading the page reconstructs the new cat and its effect in the same slot.
- Logging out and back into the same account reconstructs the same collection
  and assignment; another account does not see it.
- A rejected, stale, duplicate, or offline assignment leaves the old cat and
  old production result active.
- A cat cannot be assigned to two slots or to a mismatched role.

### Quality and test coverage

- Unit tests cover role eligibility, instance/blueprint separation, state
  transitions, stat comparison, benefit calculation, and save migration.
- Integration tests cover caller-scoped collection reads, purchase-to-collection
  persistence, atomic replacement, revision conflicts, and replay safety.
- Browser tests cover collection empty/loading/error states, detail navigation,
  role-filtered replacement, confirmation, reload persistence, and portrait
  viewport layouts.
- The UI remains usable at the existing 390×844 and 320×568 test viewports,
  with a visible focus target and a safe back/cancel path.

## 11. Implementation order

1. Define the cat-instance and assignment domain types plus the versioned save
   migration shape.
2. Add server-authoritative collection and assignment read/write contracts.
3. Implement the collection list/detail UI and state presentation.
4. Implement assigned-cat panels, role-filtered candidate selection, comparison,
   confirmation, and failure handling.
5. Bind authoritative assignments to runtime sprites and fixed-step benefit
   calculations.
6. Add reload, re-login, conflict, offline, and end-to-end verification.

The seeded-catalog Buy handoff is now live and may claim ownership only after
the authoritative purchase response is applied. Rent, Sell, My listings, and
any local-only preview still must not claim that a cat is owned or assigned.

## 12. Explicit non-goals for this draft

- Redesigning Marketplace pricing, rarity, role weights, or transaction states.
- Implementing live Rent, Sell, My listings, auction, or real-money payment
  transactions; those remain Marketplace follow-up scope.
- Allowing shared ownership or one cat instance in multiple mine slots.
- Adding Unloader as a live v1 role without a separate role decision.
- Changing the base mine/elevator/warehouse formulas unrelated to cat effects.
- Persisting renderer objects, animation frames, or raw image paths.
- Treating a local-only draft, preview fixture, or failed network response as
  proof of ownership or a successful replacement.
