# System Patterns

## Architecture

Use a layered, web-first architecture:

```text
UI / Phaser Scenes
        ↓ events and commands
Pure TypeScript Game Core
        ↓ snapshots
Persistence and Platform Adapters
```

- `src/core/`: deterministic economy, simulation, progression, boosts, and offline-income logic. It must not import Phaser or browser APIs.
- `src/game/`: Phaser scenes, entities, animation, input, camera, and rendering.
- `src/ui/`: HUD and complex overlays; use Phaser first and Preact only where DOM UI is materially simpler.
- `src/persistence/`: versioned save schema, migrations, IndexedDB access, and future cloud synchronization.
- `src/platform/`: adapters for browser, Telegram, and optional Capacitor builds.
- `src/config/`: data-driven balance tables rather than hard-coded economy values.
- Validate balance tables before game startup so malformed floor, stage, unlock, or milestone data fails before simulation state is created.

## Core Patterns

- Model mining as a three-stage pipeline: four independent mine shafts → one shared elevator → one shared warehouse.
- Run base-game production automatically without managers or player tapping.
- Let the shared elevator service non-empty unlocked floors round-robin from top to bottom.
- Upgrade each mine shaft, the elevator, and the warehouse independently; shaft levels derive higher extraction yield, shared-stage levels derive higher capacity, and all upgrades retain queued material and in-progress completion percentage.
- Derive cumulative level 10/25/50/100 milestone multipliers from the current level for every stage; never store grant flags or mutate bonuses that could be applied twice after reload.
- Unlock deeper floors only through a distinct immutable command after the immediately previous floor is unlocked at its configured shaft level; deduct once and initialize the target from balance data.
- Analyze provisional balance with a deterministic one-second automated playthrough: prioritize eligible unlocks, reserve their cost once prerequisites are met, otherwise buy the affordable upgrade with the greatest modeled effective-rate increase, and use next-unlock progress plus configured order for exact ties.
- Use events/commands between presentation and core logic; never mutate economy state directly from a scene.
- Advance foreground simulation through 100 ms fixed ticks, retain sub-tick remainder in authoritative state, and credit at most 1,000 ms per update after suspension while consuming the full wall-clock delta.
- Advance extraction only for unlocked floors, retain normalized overflow progress, and place completed level-adjusted output in the producing floor's local queue without changing spendable gold.
- Let the shared elevator scan unlocked non-empty floors from an authoritative round-robin cursor, remove no more than its capacity, hold material during timed transit, and deliver only to the warehouse input queue.
- Advance warehouse conversion only with queued input, consume no more than capacity at a completed cycle, and add converted material 1:1 to spendable and cumulative delivered gold.
- Within each fixed tick, advance every floor's extraction in configured order, then the shared elevator, then the shared warehouse so stage handoffs are immediately eligible while locked floors remain inert.
- Derive each floor's theoretical extraction rate from its current level and configuration; derive mine-wide effective production as the minimum of unlocked aggregate extraction, shared elevator throughput, and shared warehouse throughput without storing the estimate in authoritative state.
- Calculate next-upgrade prices through `GameNumber` from base cost, growth rate, and current level; route each production stage through a distinct immutable purchase command that returns an explicit result, applies its level-derived growth and milestones, and never partially mutates state.
- Calculate offline rewards purely from the saved rate snapshot, injected current time, and configured cap/efficiency; settle the load timestamp before exposing a positive pending reward, award zero for future clocks or failed settlement writes, and keep spendable gold unchanged until the claim command.
- Create a pending-reward view only for positive income. Claim immutably into the driver's authoritative state, force-persist it before dismissing the modal, and guard the claim itself with a consumed-once flag rather than a cached state candidate, so a retry after a failed write persists the mine as it is now without adding the reward twice.
- Represent very large values through the immutable `GameNumber` abstraction; keep break_infinity.js private, serialize as strings, and implement abbreviated display formatting separately.
- Serialize only authoritative game state, never transient animation state.
- Construct fresh state from validated balance data and an injected timestamp; never read the wall clock inside deterministic state creation.
- Version every save and test migrations.
- Route every save candidate through migration dispatch and strict schema/config validation before reconstructing runtime `GameNumber` values; keep this pure document boundary independent of the later IndexedDB adapter.
- Access local storage through an `ActiveSaveRepository`; let the Dexie adapter replace one fixed record, let the coordinator debounce routine writes and absorb failures into diagnostics, and keep browser lifecycle event binding in `src/platform/web/`.
- Restore a save only after complete migration, validation, and deserialization; otherwise classify it as corrupt or incompatible, preserve a safe detached diagnostic payload, warn without throwing, and return a fully fresh authoritative state.
- Keep screen geometry in a pure Phaser-free layout module so region maths is unit-testable in Node and the scene only positions objects.
- Derive every displayed string, ratio, and discrete step in a pure Phaser-free view model over a read-only core snapshot; Phaser entities only position and paint what that model already decided, and never mutate authoritative state.
- Build each reusable view's game objects once inside a supplied layout region, change it only through an `applySnapshot` rebinding method, and expose a `describeRenderedState` read-back so browser tests compare rendered output instead of scene intentions.
- Hand the loaded snapshot to the scene at construction so the screen boots already bound rather than showing placeholder values first.
- Let the renderer pull, never let the core push: the scene asks a driver for the newest snapshot each frame, and the driver advances the core from an injected wall clock. Frame rate, frame delta, and animation speed must never reach that calculation, so a frozen clock pauses production while the screen keeps drawing.
- Memoize the derived snapshot in the driver and re-derive it only when a fixed tick completed, so the frames that change no displayed value hand back the same object and the scene skips rebinding by identity. State replaced by a command always re-derives, because a command changes displayed values without completing a tick.
- Order a renderable guard behind the identity check it protects, so a per-frame path that changes nothing costs nothing while every distinct snapshot is still checked once.
- Keep read-back diagnostics out of shipped builds behind a statically substituted flag, so the serialization drops out of the bundle rather than merely going unread.
- Credit nothing when the host clock moves backwards, and leave the authoritative timestamp ahead until real time catches up; the safe direction is never paying out time that did not pass.
- Treat a gap in the render loop as elapsed time to be simulated, not as one oversized frame. The per-call foreground bound guards against a slow frame paying out a burst; a hidden tab returns the whole absence at once, so walk it in credited-size slices, bound the walk so resuming cannot freeze the tab, and consume the authoritative timestamp in full whether or not the time was credited.
- Give every production stage its own indicator driven by authoritative progress, and render waiting material wherever it can accumulate as discrete blocks measured against the capacity of the stage that removes it.
- Keep the cosmetic clock strictly separate from the simulation clock: scale it with a validated multiplier, drive only decoration with it, and gate that decoration on state so idle machinery visibly stops.
- Never report a bottleneck a stage cannot observe from its own state; a full elevator car is one full trip, so transport pressure belongs on the floor piles instead.
- Publish read-back diagnostics on a cadence, not on every frame: values that change continuously would otherwise serialize the whole screen 60 times a second for diagnostics alone.
- Signal a locked or disabled element with its own palette colour and badge rather than an alpha dim, so a pixel probe can prove the distinction.
- Show a bottleneck as a discrete pile measured against what the next stage removes in one cycle, so a full pile is a readable signal rather than an unbounded number.
- Keep rendering steps free of interaction: a step that renders a control renders it inert, and the later ordered step adds costs, affordability, commands, and feedback.
- Price a control through the same function the command charges, so the figure on the button and the figure deducted cannot drift apart.
- Let a disabled-looking control still be pressable and let the core decide: refusing in the view replaces the core's answer with the renderer's guess, and leaves a player who cannot afford something with no feedback at all.
- Advance the simulation to the current time before applying a command: the player is spending the gold the mine has now, not the gold the last rendered frame happened to show.
- Return an explicit outcome from every command and leave state and the memoized snapshot untouched on refusal, so a refused press costs the scene no rebinding.
- Persist a command's result explicitly. A purchase changes authoritative state without completing a simulation tick, so a debounced save that only follows ticks would lose it.
- Carry a press result on a presentation clock separate from the cosmetic one, so how long a message stays readable cannot change with animation speed.
- Make a control's own rectangle its hit area, so the pressable region is exactly the drawn one and hiding the control removes it from input.
- Keep an every-frame render path free of writes that repaint. `Text.setText` skips an unchanged value but `Text.setColor` does not: it re-rasterizes the text canvas and re-uploads its texture, so a colour written unconditionally each frame repaints captions that never changed. Compare before writing, and cover it with a test that counts repaints across idle frames.
- Publish an interactive element's rectangle in screen coordinates, converted through the camera that renders it, so a browser test aims a real press at a real control instead of assuming a coordinate.
- Absorb host safe-area insets in CSS around the Phaser parent element rather than inside the canvas, so insets are applied exactly once and the logical viewport stays a fixed 360×640.
- Scale with `FIT` and `CENTER_BOTH`: letterbox rather than crop, so no required control can leave the host viewport.
- Clip scrollable screen regions with a dedicated camera viewport, not a geometry mask; Phaser 4 removed WebGL geometry masks, and camera scroll gives later input steps a single value to drive.
- Keep fixed and scrolling layers in separate containers and cross-ignore them between cameras so the HUD cannot scroll with the mine.
- Format every displayed amount through one shared function, so a value never reads one way in the HUD and another in the mine.
- Truncate a displayed balance rather than rounding it: a number that reads higher than it is promises a purchase the player cannot make.
- Read a magnitude through the numeric boundary's own mantissa and exponent, never through `Number`, which collapses everything past its range to the same value.
- Derive a displayed rate from the same calculation the core uses, never from what the renderer observed happening.
- Publish layout geometry as canvas dataset diagnostics so browser tests assert real on-screen rectangles instead of screenshots, but never let diagnostics be the only renderer evidence: they report intended geometry and stay green while the render is broken.
- Assert renderer correctness with pixel probes at fixed logical coordinates, sampling colors from the shared pure palette. Force `preserveDrawingBuffer` in the test browser context only; production keeps it disabled.
- Wait for an always-painted reference point before any pixel probe: canvas diagnostics are published inside `create`, before the first frame is presented, and an unpresented canvas reads back as opaque black.
- Probe a point where the layer under test is the topmost drawn thing. A probe hidden behind a later-drawn panel proves nothing, so the mine gutter, not a floor panel, guards the mine camera's ignore list.
- Enforce every documented purity boundary with a lint rule plus an `architecture.test.ts` probe, not with prose alone.
- Add seeded randomness only when later probabilistic systems are introduced.

## Critical Flow

Load save → migrate and validate → recover fresh state if invalid → calculate capped offline reward → persist consumed timestamp interval → show positive pending reward → claim once into the driver's state → force-persist claim → dismiss modal → pull an advanced snapshot each frame → rebind the mine views → advance the separate cosmetic clock → send player commands to core → persist debounced snapshots.

## Performance

Prefer sprite atlases, object pooling, tweens/state machines, and minimal dynamic graphics. Physics is unnecessary. Keep the simulation independent of frame rate and target 60 FPS in a 9:16 viewport.
