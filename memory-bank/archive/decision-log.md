# Archive — Decision log

Settled design decisions from the base-game milestone, moved out of
`activeContext.md`'s `## Active Decisions` on 2026-09-14. Each one is already
enforced by shipped code and restated as a contract in `architecture.md` or
`systemPatterns.md`; they are kept here for rationale and provenance.

Not part of the contract. `activeContext.md` keeps only decisions that still
constrain code not yet written.

## Marketplace asset runtime decisions

- **2026-09-19:** The first runtime-integrated Marketplace roles are Mofy for
  the elevator, Baron for the warehouse, and Forge for miners. Runtime asset
  identity is presentation-only and must not become authoritative assignment,
  save, economy, or simulation state; the Unloader remains a future receiving
  role. A missing runtime sheet must resolve to the existing local placeholder
  so offline boot remains playable.

## Settled base-game decisions

- Advance foreground simulation in deterministic 100 ms ticks, carry sub-tick remainder in authoritative state, and credit at most 1,000 ms of simulation per update while consuming the full wall-clock delta.
- Calculate mine-shaft yield as base yield multiplied by the configured output-growth rate for each level above one and every cumulative milestone multiplier reached at the current level.
- Deposit completed extraction only into the producing floor's material queue and total-extracted counter; spendable gold changes only after later transport and warehouse stages.
- Treat non-negative `roundRobinCursor` as the downward target floor and negative `-(index + 1)` as the upward origin floor; zero with no waiting/carried material is surface idle.
- Remove material from a floor and increment its transported total only when the cabin arrives; visit each unlocked floor while capacity remains, slow travel as load rises, and deliver carried material only at the surface without changing gold directly.
- During every fixed tick, advance every unlocked floor's extraction first, then the shared elevator, then the shared warehouse; newly produced and delivered material is eligible for the next stage in that same tick.
- Convert warehouse material to gold at a 1:1 ratio only on a completed configured cycle; leave excess input queued for later cycles and reset progress when no input remains.
- Keep locked floors fully inert while all unlocked production stages run automatically without managers or player taps.
- Treat production rates as derived read-only values: expose every floor's theoretical rate, sum only unlocked floors for the mine estimate, and cap that estimate at the slower shared-stage throughput.
- Calculate an upgrade's next price from the stage's current level without rounding; expected player-action failures return the original state, while invalid/non-incrementable levels are invariant errors.
- Recalculate each stage effect as `baseValue × outputGrowthRate^(level - 1) × cumulativeMilestoneMultiplier`; shared-stage cycle durations remain fixed.
- Derive milestone effects from the current level rather than storing grant state, so each threshold activates once and reloads cannot apply it twice.
- Unlock floors 2–15 only in sequence after the immediately previous unlocked mine shaft reaches its configured level; floors 2–4 require levels 5, 5, and 7 at costs 250/1,500/7,500, and the generated depth curve continues from floor 5.
- Initialize a successfully opened floor at its configured starting level with zero progress, queues, and totals; preserve unrelated floors, shared stages, and simulation metadata.
- Format every displayed amount through one shared two-decimal function, so a value never reads one way in the HUD and another in the mine.
- Truncate a displayed balance rather than rounding it: a number that reads higher than it is promises a purchase the player cannot make.
- Read a magnitude through `GameNumber`'s own mantissa and exponent, never through `Number`, which collapses everything past its range to the same value.
- Estimate income from the core's bottleneck-capped effective rate, never from aggregate extraction and never from what the renderer observed.
- Price every control through the same core function the command charges, so the shown and charged figures cannot drift.
- Let a control drawn unaffordable still be pressable and let the core answer: the view must not decide a purchase, and a silent press is worse than a refusal the player can read.
- Advance the simulation to the current time before applying a command, so the player spends the gold the mine has now rather than the gold the last frame showed.
- Persist a command's result explicitly; a purchase completes no tick, and a save that follows only ticks would lose it.
- Time press feedback on the presentation clock, never the cosmetic one, so animation speed cannot change how long a message is readable.
- Publish an interactive element's screen-space rectangle, converted through the camera that draws it, so browser tests press the real control.
- Use the Step 19 automated policy only as a reproducible balance-analysis harness; it does not issue player-runtime purchases or replace later playtesting.
- Persist every `GameNumber` as a finite decimal/scientific string, validate exact version-1 structure and authoritative invariants before deserialization, and keep migration dispatch separate from IndexedDB storage.
- Store one active document under the fixed `active` key, debounce routine writes by 500 ms, force the newest snapshot on supported lifecycle events, and surface storage failures without terminating the running session.
- Treat unsupported schema versions separately from malformed current-version saves, preserve a cloneable invalid payload in the recovery warning, and initialize a fully fresh state at the caller-provided current timestamp.
- Configure offline income as a 7,200,000 ms cap at 0.5 efficiency, calculate from the saved effective-rate snapshot, keep a positive reward outside spendable gold until the player claims it, and settle consumed time before exposing that reward.
- Consume pending rewards through one pure claim result, reuse the same in-memory claim candidate across save retries, and dismiss the modal only after the claimed authoritative snapshot is force-persisted.
- Keep the logical viewport a fixed 360×640 and make responsiveness a scaling concern: `FIT` plus `CENTER_BOTH` letterboxes instead of cropping, so later render steps keep addressing stable logical coordinates.
- Apply host safe-area insets exactly once, as CSS padding on `#app` around the `#game-viewport` Phaser parent, never inside the canvas.
- Keep layout geometry pure and Phaser-free so it is unit-testable in Node; the scene only positions objects and publishes canvas dataset diagnostics for browser assertions.
- Clip the scrollable mine with a dedicated camera viewport rather than a geometry mask, because Phaser 4 removed WebGL geometry masks; Step 31 will drive only that camera's scroll.
- Reserve the bottom 58 logical pixels for the authorized five-icon navigation shell; keep its activation presentation-only until destination screens are separately implemented.
- Treat canvas dataset diagnostics as geometry reporting only, never as renderer evidence; every rendering guarantee needs a pixel probe sampling the shared palette.
- Keep colors in the pure layout palette rather than private scene constants, so browser tests assert the same values the scene draws.
- Derive every on-screen string, ratio, and discrete step in a pure view model, and let Phaser entities only position and paint what that model already decided.
- Give each view an `applySnapshot` rebinding method and a `describeRenderedState` read-back, so views hold no authoritative state and browser tests compare rendered output rather than scene intentions.
- Draw locked floors with their own panel colour and badge instead of an alpha dim, so a pixel probe can prove the distinction.
- Keep Step 26 controls presentational: costs, affordability, commands, and feedback belong to Steps 29 and 30.
- Republish the rendered-state diagnostic on every rebind, never only at boot: a diagnostic frozen at the first frame reports success for a rendering path that has since broken.
- Hold structural render invariants in the pure view model (`assertRenderableMineViewModel`) so they are unit-testable in Node, and throw on violation rather than skipping the affected view.
- Derive every view's internal geometry from the `LayoutRegion` it is given; a hardcoded dimension beside region-relative neighbours drifts apart the moment the region changes.
- Let browser tests import the read-back types from the views themselves, never restate them, so the diagnostic contract cannot drift unnoticed.
- Never report a constant through the rendered-state read-back; report a bound value instead, so the assertion can actually fail.
- Derive test expectations that depend on balance data through the same pure function the code uses, and keep hardcoded values only for fixture-owned amounts.
- Let the renderer pull snapshots from a driver each frame; never let a frame delta, frame rate, or animation speed reach the core. Production is a function of injected wall-clock time alone.
- Treat a frozen host clock as a paused mine that still renders, and a backwards clock as crediting nothing until real time catches up.
- Treat a gap in the render loop as elapsed time to be simulated, never as one oversized frame: walk it in credited-size slices, bound the walk so resuming cannot freeze the tab, and consume the timestamp in full whether or not the time was credited.
- Drive every stage indicator from authoritative progress and every decoration from a separate validated cosmetic clock, gated on whether the stage holds material.
- Render queue state wherever material accumulates, measured against the capacity of the stage that removes it, without hiding or rescaling fixed environmental decoration.
- Never report a bottleneck a stage cannot observe from its own state.
- Guard a one-time claim with a consumed-once flag rather than a cached state candidate once the world keeps changing behind the modal.
- Publish read-back diagnostics on a 100 ms cadence rather than every frame, and keep the forced publish at boot and on external binds.
- Never sample a pixel probe on the strength of a dataset diagnostic alone: diagnostics are published inside `create`, before a frame exists, so wait for an always-painted point first.
- Treat every purchase as one control kind: a second thing to buy reuses the button, the command sink, the feedback, and the diagnostic rather than duplicating them.
- Enable a control from everything its purchase needs, never from the price alone, and carry any second requirement beside the button as its own coloured line.
- Give a panel slot exactly one live control, and assert it in the pure view model so two overlapping buttons fail before the scene draws them.
- Name only the refusals a player can act on; every other core failure reads as unavailable.
- Expire a press-result map on its own terms rather than through the controls still on screen, because a purchase can remove the control it was made on.
- Let a completed change be its own confirmation: a floor that visibly opens says more than a message on a button the same frame removes.
- Wait for a browser press to be observed rather than assuming a settling time, and grant the paused-clock game loop one step before pressing anything at all.
