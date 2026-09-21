# Marketplace Purchase → Collection → Mine Assignment v1 — Implementation Plan

**Status:** Complete, 2026-09-20.

**Goal:** Replace the Marketplace Buy preview boundary for the seeded v1
catalog with a server-authoritative purchase flow, then prove the complete
player journey: `Buy` → wallet deduction → owned Collection instance →
role-compatible mine assignment/change → persisted production effect.

This plan is the follow-up to
`cat-collection-and-role-assignment-implementation-plan-v1-draft.md`. That
plan delivered the Collection and assignment contracts but deliberately left
the Marketplace button disconnected. This plan owns the handoff and its
release gates; live Rent, Sell, My listings, auctions, and real-money payment
remain out of scope.

## Contract invariants

- The authenticated server is authoritative for price, wallet deduction,
  ownership, idempotency, and the returned cat instance.
- A successful purchase creates exactly one `Idle` cat and never auto-assigns
  it to a mine slot.
- The purchase response includes the post-purchase wallet gold and save
  revision. The client adopts both before its next cloud compare-and-swap.
- Collection and assignment consume the same validated roster projection.
- A mine replacement is allowed only for the slot's exact role and becomes
  visible only after the authoritative assignment response.
- The old cat returns to `Idle`, the new cat becomes `Assigned`, and the core
  derives the production delta from role score/skill/attributes.
- Local V3 persistence and the server cat tables remain separate concerns:
  renderer asset paths and animation state never enter save data.

## Phase 0 — Contract and scope update

**Input**

- `marketplace-spec-v1-draft.md` and the existing Collection/Assignment spec.
- Existing seeded blueprints, `/v1/purchase`, `/v1/collection`, and
  `/v1/assignment` contracts.

**Work**

- Mark seeded Buy as live and Rent/Sell/My listings as preview-only.
- Define the purchase response metadata (`walletGold`, `saveRevision`) and the
  cloud revision handoff.
- Record this plan in `INDEX.md` and update the active product/architecture
  context.

**Output**

- A dated, reviewable contract with no ambiguity about what “live” means.

**Validation gate**

- Every later phase can name its input/output and no UI copy claims that Rent,
  Sell, or a local preview changed ownership.

## Phase 1 — Server purchase projection and wallet authority

**Input**

- `purchase_cat_instance` RPC and seeded `cat_blueprints` rows.
- Existing authenticated Edge Function and integration fixtures.

**Work**

- Keep price, wallet locking, deduction, instance creation, and idempotency in
  the existing server transaction.
- Return the caller-scoped roster plus the post-transaction wallet gold and
  save revision.
- Preserve replay semantics: the same idempotency key returns the same cat and
  does not deduct gold twice.

**Output**

- `POST /v1/purchase` is sufficient for the client to update gold, cats, and
  cloud CAS state without trusting client-supplied price or role fields.

**Validation gate**

- Live integration proves exact seeded price, exact wallet balance after
  purchase, ownership/role/Idle state, revision increment, replay safety,
  unknown asset, insufficient funds, and missing-wallet rejection.

## Phase 2 — Typed client adapter and persistence reconciliation

**Input**

- Phase 1 response contract.
- `purchaseCatViaFetch`, V3 save coordinator, `CloudSaveReplica`, and the
  active `MineSimulationDriver`.

**Work**

- Parse and validate purchase metadata alongside the roster.
- Generate a fresh idempotency key for every user intent.
- Apply server gold and roster only after a successful response.
- Adopt the returned cloud save revision before queuing the updated local
  document; keep local IndexedDB persistence first and cloud upload best-effort.

**Output**

- A single main-layer purchase command that cannot report success from a
  local preview or a malformed response.

**Validation gate**

- Unit tests cover metadata validation, 401 refresh, malformed responses, and
  external cloud revision adoption. A failed purchase leaves gold, roster, and
  assignment unchanged.

## Phase 3 — Marketplace Buy UI

**Input**

- Phase 2 purchase command.
- Existing Marketplace detail/card UI and responsive modal contract.

**Work**

- Replace Buy detail's disabled “coming soon” CTA with price, wallet context,
  explicit confirmation, pending state, rejection/offline copy, and success.
- Offer `View collection` only after success.
- Keep Rent and My listings visibly preview-only and preserve keyboard/back/
  Escape/focus behavior at 390×844 and 320×568.

**Output**

- The Buy tab visibly drives the authoritative purchase command and the user
  can distinguish preview actions from committed ownership.

**Validation gate**

- Browser test opens a seeded detail, confirms Buy, verifies the request body
  contains only `assetId` and `idempotencyKey`, shows success, and sees the
  exact instance in Collection. Rejection and duplicate-submit states are
  covered without double requests.

## Phase 4 — Purchase-to-Collection-to-Mine journey

**Input**

- Live Buy UI and the previously delivered Collection/Assignment UI.
- A signed-in local Supabase account with enough gold and at least two
  same-role catalog cats for replacement.

**Work**

- Buy a Miner cat, open Collection, inspect its detail, assign it to the Miner
  slot, then buy/select a second Miner and confirm `Change cat`.
- Rebind the runtime slot only from the returned roster.
- Verify the old/new availability states, role compatibility, assignment
  revision, and production modifier delta.
- Reload and re-login/reconcile to prove the replacement remains in the same
  slot.

**Output**

- A player can complete the requested real flow, and the mine visibly uses the
  replacement cat with the corresponding production behavior.

**Validation gate**

- Server integration passes purchase + assignment assertions.
- Browser fixture passes Buy → Collection and the existing authoritative
  replacement/reload flow.
- Live Playwright browser run completes two real purchases and a same-role
  replacement against local Supabase; the final slot and production/runtime
  diagnostics survive reload.

## Phase 5 — Release audit and Memory Bank closeout

**Input**

- All phase outputs and gate evidence.

**Work**

- Run focused and full client/server verification, production smoke, secret
  scan, and diff checks.
- Update `architecture.md`, `techContext.md`, `productContext.md`,
  `activeContext.md`, `progress.md`, and the affected specs.
- Append completed work and passed gates to the archive; move settled
  decisions and closed risks to their archive records.

**Output**

- The repository documentation describes the live Buy boundary accurately,
  while future transaction surfaces remain explicitly deferred.

**Validation gate**

- No stale “Marketplace is preview-only” statement remains for Buy, all
  required commands pass, and the end-to-end acceptance table is evidenced.

**Gate evidence, 2026-09-20**

- Phase 1: live cat-collection integration passes purchase price, wallet
  deduction, returned ownership/Idle state, revision metadata, replay safety,
  unknown asset, insufficient funds, and missing-wallet rejection.
- Phase 2: focused client tests pass (35 tests), including purchase metadata
  validation, auth refresh, malformed responses, and external cloud revision
  adoption.
- Phase 3: Marketplace UI browser test passes confirm → server callback →
  success, while full client E2E passes 61/61.
- Phase 4: live server integration passes 2/2 tests; live server browser E2E
  passes 12/12, including Buy Forge and Mica, assign Forge, change the Miner
  slot to Mica, and reload with the same runtime binding.
- Phase 5: `npm run lint`, `npm run test` (740 tests), `npm run build`,
  `npm run scan:secrets`, `npm run test:e2e` (61/61), `npm run test:prod`
  (10/10), `npm run verify:server` (195 server-unit, 132 integration,
  12 server-E2E), and `git diff --check` pass.

## Acceptance matrix

| Journey | Required evidence |
| --- | --- |
| Buy authority | Authenticated request, server price, atomic wallet deduction, exact cat instance |
| Replay safety | Same idempotency key returns same instance with no second deduction |
| Collection | Success response and reload show the owned cat as `Idle` |
| Assignment | Exact-role candidate only; stale/wrong-role requests reject |
| Replacement | Old cat `Idle`, new cat `Assigned`, slot unchanged, revision advances |
| Production | Role score/skill/attributes change the affected metric deterministically |
| Persistence | Local V3 save and server projection reload/re-login keep the replacement |
| Boundary | Rent/Sell/My listings remain preview-only and never claim ownership |

## Stop conditions

Pause and amend this plan before coding if price authority moves to the
client, one cat can occupy multiple slots, live Rent/Sell is added, the save
revision protocol changes, or the production formula changes. Each such change
requires a dated decision and new validation evidence.
