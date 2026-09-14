# Active Context

## Current Focus

**Server milestone, at the Step 19 validation gate.** Step 19 (client remote
repository) was implemented on 2026-09-13, completing protocol §9's upload
cadence and the `409` half of §7 that Step 18 left to it. Step 20 must not begin
until the user validates it.

Steps 9, 10, and 12–19 are implemented but unvalidated as one batch, because the
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

The narrative account of every earlier phase is in
`archive/phase-narrative.md`; finished work is in `archive/completed-log.md`.

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

1. **Wait for the user to validate Step 19.** This is the gate; nothing below
   starts before it.
2. Step 20 onward — Phase 4, server-verified progress (validate-on-save
   anti-cheat). Closes the open server-side-validation risk in `progress.md`.
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
