# Progress

## Status Summary

**Base game: complete.** All 37 `implementation-plan.md` steps are implemented
and validated; the user validated Step 37 on 2026-09-08. No plan step remains
open.

**Server milestone: in progress, at the Step 25 gate.** Steps 1–8 are validated.
Step 11 (Apple sign-in) is cut. Steps 9, 10, and 12–25 are implemented and await
user validation together. Step 25 is implemented and awaiting user validation;
**Step 26 is blocked until the user validates it.**

The playable game stays fully playable offline. The one network call on the boot
path is `ensureGuestSession`, never awaited before the first frame.

Full history is archived, not deleted:

- Finished work → `archive/completed-log.md`
- Passed gates and deferred features → `archive/acceptance-gates.md`
- Per-step packages, tests, and review findings → `archive/step-implementation-map.md`
- The prose account of how each phase unfolded → `archive/phase-narrative.md`

**2026-09-16 — server-gate CI hardening (not a milestone step).** The GitHub
Actions `server` job failed with undici's `TimeoutError: The operation was
aborted due to timeout` on work that passes locally: every function's first
request boots a worker against an empty Deno/npm module cache on a 4-vCPU
runner, while a developer's container is warm from earlier runs, and four
timing-sensitive calls carried a hard budget with no retry against that one
slow response. Fixed by warming every Edge Function once before any suite runs
(`scripts/warm-edge-functions.mjs`, called from `scripts/verify-server-stack.mjs`),
by replacing the two server-e2e cloud-save reads' bare 5 s timeout with a
retrying shared helper (`tests/server-e2e/cloudSaveFixture.ts`), by setting the
integration suite's `hookTimeout` above the 20 s per-request budget its own
`fetch` calls declare, and by giving `recovery-code`'s two burst loops an
attempt that tolerates a transient stall
(`tests/server-integration/transientFetchFixture.ts`). That last one is the call
the CI log actually indicted: the job's only red test died on its first
iteration after ninety-odd successful requests, so the cause was contention
(16 parallel Vitest files against one edge runtime on 4 vCPU), not a cold
start — the cold-start reading holds only for the rate-limit reset hook and the
`hookTimeout` default. No step's state changed and the Step 24 gate is
untouched; the details are in `techContext.md`'s 2026-09-16 finding.

## Phase Status

| | |
|---|---|
| Current milestone | Server milestone (`server-milestone-plan.md`, 37 steps) |
| Current gate | **Step 25 — abuse limits.** Implemented 2026-09-17, awaiting user validation. |
| Blocked on the gate | Step 26 (the adversarial suite) and Steps 27–37 |
| Last validated step | Step 8 (user validation on 2026-09-10) |
| Client gate | `npm run verify` passes end to end |
| Server gate | `npm run verify:server` passes end to end |

Work proceeded past several gates on the user's explicit instruction rather than
pausing at each one; Steps 9, 10, and 12–24 therefore sit
implemented-but-unvalidated as one batch.

## Server Milestone Step Status

Compact status only. Per-step evidence, packages, and review findings are in
`archive/step-implementation-map.md`.

| Step | Status |
|---|---|
| 1 — Record scope, threat model, and open questions | Validated 2026-09-08 |
| 2 — Design the save-sync protocol | Validated 2026-09-08 |
| 3 — Design the database schema | Validated 2026-09-08 |
| 4 — Stand up the Supabase project and local stack | Validated 2026-09-08 |
| 5 — Add migrations and CI | Validated 2026-09-08 |
| 6 — Make the core simulation runnable on the server | Validated 2026-09-09 |
| 7 — Add the Edge Function test harness | Validated 2026-09-09 |
| 8 — Anonymous guest session | Validated 2026-09-10 |
| 9 — Identity: profiles and row-level security | Implemented 2026-09-10, awaiting validation |
| 10 — Google sign-in | Implemented 2026-09-10, live-verified same day, awaiting validation |
| 11 — Apple sign-in | **Cut 2026-09-11** — prerequisites not acquired (finding F7's recorded contingency) |
| 12 — Telegram sign-in | Implemented 2026-09-11, live-verified; critical fix 2026-09-12 (F13); awaiting validation |
| 13 — Guest linking, including the collision | Implemented 2026-09-12, awaiting validation |
| 14 — Recovery code | Implemented 2026-09-12; three review rounds absorbed; awaiting validation |
| 15 — `saves` table evidence | Implemented 2026-09-12, awaiting validation |
| 16 — `PUT /v1/save` | Implemented 2026-09-12; critical concurrency fix same day; awaiting validation |
| 17 — `GET /v1/save` and boot-time reconcile | Implemented 2026-09-12; HIGH reload race fixed 2026-09-13; awaiting validation |
| 18 — Conflict resolution | Implemented 2026-09-13, awaiting validation |
| 19 — Client remote repository | Implemented 2026-09-13, awaiting validation |
| 20 — Adopt existing local saves | Implemented 2026-09-14, awaiting validation |
| 21 — Survive local storage eviction | Implemented 2026-09-14, awaiting validation; the iOS Safari seven-day measurement is outstanding |
| 22 — The server clock is the only clock | Implemented 2026-09-14, awaiting validation |
| 23 — Upper-bound re-simulation | Implemented 2026-09-14; six review fixes absorbed; awaiting validation |
| 24 — Rejection handling | Implemented 2026-09-14; review fixes absorbed (H1/H2 HIGH, M1, L1–L3); awaiting validation |
| 25 — Abuse limits | Implemented 2026-09-17; awaiting validation — **current gate** |
| 26–37 | Not started, blocked by the Step 25 gate |

## Known Risks

Open risks only. Risks closed by shipped code are in `archive/risks-resolved.md`
with the reason each one closed.

- **The provisional balance curve is unvalidated.** The reference clip is too
  short to establish exact formulas or all features, and the GDD's values remain
  starting hypotheses. Needs playtesting, not code.
- **Offline-reward clock manipulation is closed; upper-bound validation is
  implemented, pending validation.** Step 22 moved settlement to the server: the
  credited reward is the server's `offlineGrant`, computed from the stored
  `received_at` to the server's own `now()`, so a manipulated client clock cannot
  move it. Step 23 now bounds what *any* document may claim: on upload the server
  re-derives the maximum the mine could have produced from the last accepted save
  over the server-measured elapsed time (plus material already in the pipeline)
  and rejects a document claiming more (`422 save_rejected`), bounding the
  monotonic cumulative counters and upgrade spend, never current `gold`. A branch
  that resolved a save conflict is measured from the row's one-generation
  ancestor, so a chosen branch still commits. Step 24 now handles what a rejected
  save does to the player — local save intact, session playable, a comprehensible
  notice, one `save_audit` row per attempt. Step 25 now bounds the remaining
  cost: its rate limits refuse before any audit write exists on the path, and an
  oversized body writes none either, so Step 24's L2 amplification
  (1 authenticated request → 1 service-role `save_audit` write) no longer grows
  the table per refused request. What remains open is only Step 26's adversarial
  suite. See `archive/risks-resolved.md` for the closed half.
- **The Step 23 fork anchor is one generation deep (N1, known limit).** A save
  that resolved a `409` is measured from the row's immediate predecessor, so a
  fork older than roughly two minutes against an actively-syncing peer (a tablet
  left open while the player plays on their phone offline, then returns and
  dominates) is still rejected — both anchors are too recent. The player's local
  save is intact and play continues; only the cloud copy lags, and Step 21's
  eviction restore would return that inferior branch. The sound fix is to retain
  fork points (a `saves` history/schema change) or accept a client-supplied
  verifiable fork revision. Step 24 handled rejection handling without taking
  this on, so the design decision is still open. A
  server-side "accept any strict superset" exemption was rejected because an
  inflating cheat submits exactly supersets, so it would gut the bound. Recorded
  in `architecture.md`'s Step 23 section; not yet scheduled.
- **iOS Safari deletes all script-writable storage after seven days without
  interaction.** A lapsed player loses the entire local save today. Step 21 now
  detects the partial case (save gone, session still present), restores from the
  cloud when a cloud copy exists, shows an honest notice when it does not, asks
  for persistent storage, and syncs early enough that a lapsed player has a
  cloud copy to restore. What remains open is the **measurement**: the real
  seven-day iOS Safari behaviour (and whether a granted `persist()` exempts the
  data) needs a real device and a seven-day wall-clock observation — finding F8.
  The `persist()` half is measured (see `techContext.md`); the deletion half is
  outstanding. An unlinked guest whose session and save are swept in the same
  event still needs the Step 14 recovery code.
  Recorded in `server-milestone-plan.md` as a base-game defect that the server
  milestone reduces but does not eliminate.
- **The fork chooser has no production surface.** Protocol §7.3 assigns the
  conflict-resolution chooser UI to Step 13, which shipped only a DEV hook;
  Step 18 and Step 19 likewise park a genuine fork in `src/main.ts`'s
  `pendingSaveConflict` session hook with no player-facing way to choose.
- **Visual fidelity must not rely on copied art, audio, branding, or UI assets.**
  Standing rule for all future art work.
- **Two verification items carried past the base-game milestone**, both
  non-blocking: a physical mid-range Android Chrome pass (only Pixel 5 emulation
  has been run), and a human playtest of the 30-second-comprehension criterion.
