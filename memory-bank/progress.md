# Progress

## Status Summary

**Base game: complete.** All 37 `implementation-plan.md` steps are implemented
and validated; the user validated Step 37 on 2026-09-08. No plan step remains
open.

**Server milestone: in progress, at the Step 21 gate.** Steps 1–8 are validated.
Step 11 (Apple sign-in) is cut. Steps 9, 10, and 12–21 are implemented and await
user validation together. **Step 22 must not begin until the user validates
Step 21.**

The playable game stays fully playable offline. The one network call on the boot
path is `ensureGuestSession`, never awaited before the first frame.

Full history is archived, not deleted:

- Finished work → `archive/completed-log.md`
- Passed gates and deferred features → `archive/acceptance-gates.md`
- Per-step packages, tests, and review findings → `archive/step-implementation-map.md`
- The prose account of how each phase unfolded → `archive/phase-narrative.md`

## Phase Status

| | |
|---|---|
| Current milestone | Server milestone (`server-milestone-plan.md`, 37 steps) |
| Current gate | **Step 21 — survive local storage eviction.** Implemented 2026-09-14, awaiting user validation. |
| Blocked on the gate | Steps 22–37 |
| Last validated step | Step 8 (user validation on 2026-09-10) |
| Client gate | `npm run verify` passes end to end |
| Server gate | `npm run verify:server` passes end to end |

Work proceeded past several gates on the user's explicit instruction rather than
pausing at each one; Steps 9, 10, and 12–21 therefore sit
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
| 21 — Survive local storage eviction | Implemented 2026-09-14, awaiting validation — **current gate**; the iOS Safari seven-day measurement is outstanding |
| 22–37 | Not started, blocked by the Step 21 gate |

## Known Risks

Open risks only. Risks closed by shipped code are in `archive/risks-resolved.md`
with the reason each one closed.

- **The provisional balance curve is unvalidated.** The reference clip is too
  short to establish exact formulas or all features, and the GDD's values remain
  starting hypotheses. Needs playtesting, not code.
- **Offline rewards have no server-side validation.** The client bounds and caps
  are in place and closed (see `archive/risks-resolved.md`), but nothing verifies
  a manipulated client clock server-side. That is Phase 4 of the server milestone
  (validate-on-save anti-cheat, Steps 20+).
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
