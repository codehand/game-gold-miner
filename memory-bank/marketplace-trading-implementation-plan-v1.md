# Marketplace Trading v1 — Implementation Plan

**Status:** Complete, 2026-09-20.

**Goal:** Remove the remaining preview boundary from Marketplace by making
Sell, Rent, and My listings server-authoritative while preserving the already
live seeded Buy path.

## Contract invariants

- Only an authenticated owner can list or cancel their own cat.
- Only an `Idle` cat can be listed; an active listing blocks assignment.
- Sale transfers title and gold atomically; rent transfers time-bounded usage
  rights and gold atomically without changing title.
- Every mutation is idempotent and returns a caller-scoped roster/listing
  projection plus wallet/save revision when that caller's save changed.
- Due rentals settle before reads and mutations; expiry releases renter use and
  returns the owner cat to `Idle`.
- The UI has no local ownership/listing draft that can be mistaken for a live
  listing. Rent, Sell, and My listings show server state or a clear error.

## Phase 0 — Spec and transaction boundary

**Input**

- Existing Buy/Collection/Assignment contract and the Marketplace draft.
- Existing cat states, save revision protocol, and seeded catalog.

**Output**

- This plan and an updated spec defining sale, rental, cancellation, expiry,
  idempotency, wallet settlement, and the four live Marketplace tabs.

**Validation**

- Spec names every state transition and does not call Rent/Sell/My listings a
  preview surface.

## Phase 1 — Listing/rental schema and atomic RPCs

**Input**

- `cat_instances`, `cat_assignments`, `saves`, and existing purchase RPC.

**Output**

- Listing, rental, and mutation-idempotency tables; ownership/usage columns;
  service-role RPCs for create/cancel/sale/rent/expiry.

**Validation**

- `supabase db reset` applies the migration cleanly; the live integration flow
  covers exact seller/buyer wallet settlement, sale replay, rental duration and
  price, and expiry releasing renter usage and returning the owner cat to Idle.
- The RPC boundary is service-role-only and the migration-derived RLS matrix
  covers all fourteen public tables and all four verbs for anon/authenticated
  callers.

## Phase 2 — Authenticated API and typed client adapter

**Input**

- Phase 1 RPCs and the existing cat-collection projection.

**Output**

- Authenticated listing read/mutation routes and strict client parsers for
  listings, transaction results, wallet gold, and save revision.

**Validation**

- `tests/unit/marketplace.test.ts` proves listing query parsing, typed command
  projections, malformed/rejected responses, and forwarding only the intended
  listing command fields; the existing collection adapter keeps the refresh-on-
  401 contract.

## Phase 3 — Live Marketplace UI

**Input**

- Typed API adapter and existing responsive Marketplace modal.

**Output**

- Live Buy/Rent/Sell/My listings tabs; owned idle cats populate listing form;
  create/cancel/buy/rent have confirmation, pending, success, and rejection
  states; rental duration and exact total are visible.

**Validation**

- Marketplace E2E covers 390×844 and 320×568 responsive Buy, plus live fixture
  flows for Rent, Sell, My listings creation, exact rental totals, success and
  rejection surfaces. The modal retains focus restoration and uses disabled
  pending CTAs to prevent double-submit.

## Phase 4 — Runtime/save reconciliation

**Input**

- Phase 2 transaction projections and the active driver/CloudSaveReplica.

**Output**

- Buyer/renter local roster and wallet reconcile after a transaction; seller
  listing/cat removal reconciles after reload; rental expiry is reflected in
  Collection and mine assignment without resurrecting stale local state.

**Validation**

- The live server integration creates separate seller/buyer accounts, lists a
  purchased cat, buys it from the second account with an idempotent replay,
  rents another cat for two hours, then advances expiry through the service
  role and verifies both caller projections. Existing purchase/assignment E2E
  additionally verifies reload persistence of the authoritative roster.

## Phase 5 — Release audit and Memory Bank closeout

**Input**

- All phase outputs and live evidence.

**Output**

- Architecture/tech schema copies, product context, progress, completed log,
  acceptance gates, decision log, and resolved risks describe the live market.

**Validation**

- Client type-check/build, 743 unit tests, 198 server unit tests, six
  Marketplace browser tests, 11 live collection/trading integration tests,
  migration reset, and the focused RLS matrix pass. The active Memory Bank and
  UI copy no longer describe Rent/Sell/My listings as preview-only.
