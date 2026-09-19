# Archive — Resolved risks

Risks closed by shipped code, moved out of `progress.md`'s `## Known Risks` on
2026-09-14. Each entry records **why** it closed, so a future reader can tell a
solved problem from a forgotten one.

Not part of the contract.

## Closed

- **Approved Marketplace sheets could break offline boot or leak renderer state
  into gameplay.** *Closed 2026-09-19:* Phase 7 loads only stable local runtime
  copies, resolves a bundled placeholder when a copy is unavailable, and keeps
  asset IDs, frames, textures, and animation timing outside save data and
  simulation formulas. Runtime identity, fallback, dimensions, and role-slot
  behavior are covered by unit and browser tests.

- **The cloud fork had no player-facing chooser.** *Closed 2026-09-19:* the
  HUD settings control opens `AccountSettingsModal`, which presents both
  candidates and applies either the local branch through a server-revision
  compare-and-swap upload or the cloud branch through a guarded local adopt;
  both paths suspend local writes and reload only after the selected document
  is settled. The replica remains stopped while the choice is pending, so a
  routine save cannot overwrite the unshown branch.

- **Idle-game number growth can overflow without a large-number abstraction.**
  *Closed:* `src/core/numbers/GameNumber.ts` is an immutable wrapper that keeps
  `break_infinity.js` private and serializes to a decimal/scientific string. All
  gold, material, yields, and costs go through it; `eslint.config.mjs` and
  `tests/unit/architecture.test.ts` keep `Decimal` from leaking across the
  boundary. Display formatting lives outside the arithmetic type in
  `src/game/view-model/formatAmount.ts`.

- **WebView suspension and clock manipulation can corrupt offline rewards if not
  bounded and validated — the *client-side bounding* half.**
  *Closed:* `advanceSimulation` credits at most `MAX_FOREGROUND_DELTA_MS`
  (1,000 ms) per update while still consuming the full wall-clock delta;
  `catchUpSimulation` walks a render-loop gap in credited-size slices with a
  bounded total rather than one oversized frame; a frozen host clock renders a
  paused mine and a backwards clock credits nothing until real time catches up;
  offline income is capped at 7,200,000 ms at 0.5 efficiency and settled
  exactly once, with the consumed interval persisted *before* the reward is
  exposed.
  *Still open, and kept in `progress.md`:* the **server-side validation** half.
  Steps 22, 23, and 24 of the server milestone now implement it — the server
  clock settles offline income (`calculateOfflineGrant`), `evaluateProgressBound`
  bounds what any uploaded document may claim, and a refused save leaves the
  session playable with the local save intact and one `save_audit` row — but they
  await user validation. The risk stays in `progress.md` until those land and are
  validated.
