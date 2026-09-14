# Active Context

## Current Focus

**Server milestone, at the Step 22 validation gate.** Step 22 (the server clock
is the only clock) was implemented on 2026-09-14, on the user's explicit
instruction: offline-income settlement moved to the server, computed from the
stored `received_at` to the server's own `now()`, so a manipulated device clock
cannot change the credited reward. Step 23 must not begin until the user
validates it.

Steps 9, 10, and 12–22 are implemented but unvalidated as one batch, because the
user directed work past several gates rather than pausing at each. Step 11
(Apple sign-in) is cut.

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

## Next Steps

1. **Wait for the user to validate Step 22.** This is the gate; nothing below
   starts before it.
2. Step 23 onward — upper-bound re-simulation and rejection handling, closing
   the remaining server-side-validation risk in `progress.md`.
3. Give the fork chooser a production surface. §7.3 assigns it to Step 13, which
   shipped only a DEV hook; it remains the one protocol requirement with no
   player-facing implementation.
4. Non-blocking carry-overs from the base-game milestone: a physical mid-range
   Android Chrome pass, and a human playtest of the 30-second-comprehension
   criterion.

## Open Questions

- Validation and refinement of the provisional balance curve through playtesting.
- Whether `calculateMineProductionRates` should model sequential route distance
  and load-sensitive leg timing, or whether the estimate stays a route-agnostic
  upper bound used by the HUD and offline snapshot.
- Final art-production workflow and original visual identity.
- Target Telegram launch requirements beyond the prototype.
