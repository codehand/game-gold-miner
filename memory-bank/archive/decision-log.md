# Archive — Decision log

Settled design decisions from the base-game milestone, moved out of
`activeContext.md`'s `## Active Decisions` on 2026-09-14. Each one is already
enforced by shipped code and restated as a contract in `architecture.md` or
`systemPatterns.md`; they are kept here for rationale and provenance.

Not part of the contract. `activeContext.md` keeps only decisions that still
constrain code not yet written.

## Mica as the free floor baseline — 2026-09-28

- Treat unassigned Mica as the mine floor's presentation baseline, not as a
  free owned cat instance. This preserves server ownership and keeps the base
  production rate unchanged while making a newly opened floor visibly staffed.
- One Marketplace purchase creates one owned Miner instance. It may replace
  the baseline on one floor only; another floor requires another idle instance.

## Independent bottom-navigation icons — 2026-09-27

- The mine's HUD and buildings, not the old ornate menu reference, now set the
  bottom bar's palette: navy, slate-blue steel, warm gold and restrained timber.
- Ship five separate transparent 96×96 PNG textures, each displayed at 42×42.
  Draw panel, tile frames, English labels and pressed state in Phaser so an
  individual icon can be replaced without regenerating a full strip or sheet.
- Keep five equal 64×64 hit regions inside the unchanged 360×80 layout; preserve
  keys, callbacks and the presentation-only status of Boost and Map.

This supersedes the two 2026-09-21 full-strip/sprite-sheet decisions below.
Their original sources remain in `art-source/`; their unused public runtime
files were removed.

## Mine miner delivery cadence — 2026-09-26

- Treat the mine worker count as a shared derived rule: one worker plus one at
  shaft levels 50, 100, 150, and 200, capped at five. Keep the rule out of save
  state so upgrades still derive the current crew from the authoritative level.
- Schedule floor material delivery at evenly spaced worker milestones. Each
  miner arrival adds an equal share of the configured cycle yield to that floor's
  `materialQueue`; the complete cycle yield is unchanged, and spendable gold
  remains owned by elevator transport plus warehouse conversion.
- Render the phase-shifted crew on one horizontal patrol baseline. The renderer
  mirrors milestones and never writes back to the core.

## Reference-driven bottom menu artwork — 2026-09-21

- The supplied visual reference is the source of truth for the menu's outer
  treatment: one navy/gold strip, five rounded tiles, and a raised active Boost
  tile in the centre. Use one processed transparent runtime image instead of
  rebuilding this chrome from multiple code-drawn pieces.
- Keep code responsible for semantic order, hit regions, callbacks, and
  accessibility-adjacent interaction behavior. Artwork is presentation-only;
  the full strip must never become the hit-test boundary.
- Retain the earlier icon-only generation under `art-source/` for provenance,
  but do not load it in the runtime after the reference-driven replacement.

The runtime source must be alpha-cropped to the visible menu before display;
transparent generation margins must not determine the layout box. Fit the
cropped strip uniformly inside a fixed 360×80 safe region with a small margin,
while keeping semantic hit regions independent of the artwork so decorative
shell and active Boost ornaments cannot clip or change interaction geometry.
Fill the transparent margin with the navigation surface color rather than
letting the mine background show through as a black seam.
Ship a high-quality 2× runtime resample of the menu and draw it at an exact
0.5 texture scale, so the large generated source is not filtered directly into
the small logical display box and softened in the browser.
This supersedes the temporary 360×58 presentation fit, which vertically
stretched the source strip.

## Bottom-navigation sprite sheet — 2026-09-21

- Use one generated transparent 5×1 sprite sheet as the source of truth for
  the bottom-navigation icon family, with fixed frame order Rewards,
  Marketplace, Boost, Collection, Map. Keep the raw prompt/source and QC
  outputs under `art-source/navigation-icons/`; ship only the approved runtime
  sheet under `public/assets/ui/navigation/`.
- Keep the existing interactive parent geometry and presentation callbacks.
  Fit each transparent 256px frame before the shared 0.6 visual scale so the
  generated art cannot overlap neighboring targets or alter input behavior.
- Treat the regenerated art as presentation-only. Boost and Map may look
  production-ready while their game actions remain deferred until their own
  milestones.

## UI feedback decisions — 2026-09-21

- Treat Marketplace Buy confirmation as one two-choice action group: the
  explanatory copy and wallet context span the modal, while `Confirm purchase`
  and `Cancel` share a responsive row so neither choice is pushed below the
  other on a narrow portrait screen.
- Treat Collection `ready` with zero cats as the only true empty state. During
  `loading`, `stale`, or `error`, show state-specific copy and preserve Retry;
  never display a zero owned-count summary from a failed roster load.
- Treat a `Listed` Marketplace catalog item as a listing-specific confirmation
  surface: use `Buy listed cat` and `Back to cats` so the CTA names reflect the
  active listing, while retaining the explicit confirmation boundary and the
  existing server-authoritative command.

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

## Marketplace transaction boundary

- **2026-09-20:** Make Buy live only for the nine seeded v1 catalog rows. Price,
  wallet deduction, ownership, idempotency, and the returned cat instance stay
  server-authoritative; the response also returns wallet gold and save revision
  so the client can continue cloud CAS safely. Keep Rent, Sell, My listings,
  auctions, and real-money payment as explicit preview/deferred surfaces until
  their own server contracts and acceptance gates exist.

## Marketplace trading authority — 2026-09-20

- **Server-owned listing state:** prices, listing status, sale ownership,
  rental ownership, rental expiry, wallet deductions, and idempotency are
  authoritative in Supabase RPCs; the client only renders returned projections.
- **Safe sell boundary:** only an owned, unassigned cat can be listed, and an
  active listing locks the cat out of another listing or assignment until it is
  cancelled or settled.
- **Sale versus rental semantics:** Buy transfers the cat permanently; Rent
  grants temporary use to the renter while legal ownership remains with the
  seller and the owner is restored when expiry is settled.
- **Exact-role replacement:** both the owner and active renter can replace a
  currently assigned cat, but the requested cat must match the mine role and
  remain idle for that account.
- **Replay safety:** every Marketplace mutation takes a caller idempotency key
  so retries return the original result without charging or transferring twice.
- **Caller-scoped renter projection:** a renter receives a usable collection
  projection without changing the V4 client save schema; legal ownership stays
  in `cat_instances` and `cat_rentals`.

## Surface hauler productivity — 2026-09-27

- Preserve the existing raw progression `1 + floor(min(warehouseLevel, 100) / 10)`.
- Cap the visible surface crew at five cats and keep one cart per visible cat.
- Convert overflow into shared per-cat productivity with
  `productivityMultiplier = rawCount / visibleCount`, preserving the aggregate
  workforce represented by the prior eleven-cat rule.
- Apply the multiplier at the existing `warehouse.inputQueue` handoff rather
  than adding a persisted surface queue. Reuse the same core-derived value in
  foreground simulation, production-rate estimates, offline income, and
  anti-cheat bounds so all projections agree without a save-schema change.

## Mine-floor workforce productivity — 2026-09-27

- Preserve the mine-floor raw progression as `1 + floor(mineShaftLevel / 50)`;
  do not cap the derived raw count at level 200.
- Cap the rendered and delivery-event workforce at five visible miners so the
  scene's pooled sprites remain bounded.
- Convert overflow into `productivityMultiplier = rawCount / visibleCount` and
  apply it to the completed cycle yield. At level 200 the multiplier is `1x`;
  at level 250 it is `1.2x`; higher levels continue to scale throughput while
  the screen remains five cats.
- Keep the helper shared by extraction, theoretical production rates, offline
  projections, and anti-cheat in-flight allowances. This preserves one
  authoritative formula without adding a save-state workforce field or queue.
## 2026-09-28 — Elevator default is a free visual, not a free owned cat

The shared `elevator:main` slot uses Pip while unassigned; Pip is original
N-tier art but is not a Marketplace blueprint, Collection instance, or source
of a role bonus. Mofy remains the paid SSR blueprint and replaces Pip only
when a server-owned instance is assigned. This mirrors the Mica/Forge floor
pattern without changing purchase authority or save schema.

## Mine Overdrive clock and economy — 2026-09-29

The first Boost is free, x4 for five minutes, and repeatable only after eight
hours. It advances all three existing simulation stages rather than
multiplying wallet gold or adding a new resource. The timer continues while
away; offline income gets only the exact active-window overlap within the
existing two-hour real-time cap. Configured play uses an atomic server-clock
activation row and server-owned grant/progress checks. The client-only build
uses a separate localStorage timestamp, leaving the save document unchanged.

## Haulers are per-cart specialists — 2026-09-30

Keep free wooden-handcart workers on unassigned surface slots, without owned
instances or bonuses. Tobi SR and Rivet SSR are level-1 purchases at 18,000 /
42,000 gold; their electric and maglev vehicles follow their assigned instance.
Use five stable slots, exposing only the warehouse-unlocked crew. One instance
can occupy one slot; NULL-ID assignment explicitly restores the free default.
Average active cart multipliers so one purchase never buffs five carts as if
five copies had been bought. Preserve the old workforce/overflow formula.
Use four genuinely authored walk frames and separate vehicle images, recorded
as an art-policy exception; rarity is not padded by duplicating walk frames.

## Boru excavator Miner — 2026-09-30

User explicitly approved the Boru calico/mini-excavator concept. Keep the
existing Miner role and one-owned-instance-per-floor rule, not a new vehicle
inventory. Four eight-frame actions are tied to extraction progress, with
whole-machine mirroring and one track origin. Initial 42,000-gold pricing and
96/68/95/90 attributes are provisional balance, not a new production formula.

## Multi-mine portfolio and art direction — 2026-10-05

- Keep a single account wallet. Only the mine currently being viewed runs the
  foreground simulation; other owned mines store bounded offline intervals.
- Credit an inactive mine's reward to the shared wallet when the player enters
  that mine. A disconnected configured entry remains pending until server-time
  validation settles the original boundary exactly once.
- Use six ordered resources: Gold, Amethyst, Ruby, Sapphire, Emerald and
  Diamond. Higher-value resources require higher purchase prices and earlier
  site ownership; the initial Gold mine remains free.
- Give each resource a complete visual family. Its fifteen floors use upper,
  middle and deep bands, and walls, ground, ore veins, piles, shafts,
  structures, surface buildings, cargo, impacts and claim presentation inherit
  the resource's form and palette.
