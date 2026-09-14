# Archive — Resolved risks

Risks closed by shipped code, moved out of `progress.md`'s `## Known Risks` on
2026-09-14. Each entry records **why** it closed, so a future reader can tell a
solved problem from a forgotten one.

Not part of the contract.

## Closed

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
  Steps 22 and 23 of the server milestone now implement it — the server clock
  settles offline income (`calculateOfflineGrant`) and `evaluateProgressBound`
  bounds what any uploaded document may claim — but they await user validation,
  and Step 24's rejection handling (what a refused save does to the player, and
  the audit row) is still unbuilt. The risk stays in `progress.md` until those
  land and are validated.
