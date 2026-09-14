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

- Model mining as a three-stage pipeline: fifteen independent mine shafts → one shared elevator → one shared warehouse.
- Reveal mine presentation in groups of five: floors 1–5 initially, floors 6–10 once floor 5 opens, and floors 11–15 once floor 10 opens. Hidden floors remain authoritative but create no visible controls and do not extend the active scroll range.
- Run base-game production automatically without managers or player tapping.
- Let the shared elevator descend through every unlocked floor in order, load at each stop, and continue only when that floor is fully drained and capacity remains; otherwise return to the surface before starting another top-down trip.
- Upgrade each mine shaft, the elevator, and the warehouse independently; shaft levels derive higher extraction yield, shared-stage levels derive higher capacity, and all upgrades retain queued material and in-progress completion percentage.
- Treat a Level badge as selection, not payment: mine shafts, the elevator tower, and the warehouse open one blocking detail modal with authoritative current/next attributes and exact x1/x5/MAX quotes. Route every modal CTA through one atomic batch command and persist successful batches once.
- Apply tap-versus-drag rejection at the shared modal entry point, not only at individual controls, so surface Level badges and buildings cannot open a popup from the pointerup that ends a drag.
- Derive cumulative level 10/25/50/100 milestone multipliers from the current level for every stage; never store grant flags or mutate bonuses that could be applied twice after reload.
- Unlock deeper floors only through a distinct immutable command after the immediately previous floor is unlocked at its configured shaft level; deduct once and initialize the target from balance data. Derive what a locked floor shows from the same private predicate that command uses, so the description and the charge cannot disagree.
- Analyze provisional balance with a deterministic one-second automated playthrough: prioritize eligible unlocks, reserve their cost once prerequisites are met, otherwise buy the affordable upgrade with the greatest modeled effective-rate increase, and use next-unlock progress plus configured order for exact ties.
- Use events/commands between presentation and core logic; never mutate economy state directly from a scene.
- Advance foreground simulation through 100 ms fixed ticks, retain sub-tick remainder in authoritative state, and credit at most 1,000 ms per update after suspension while consuming the full wall-clock delta.
- Advance extraction only for unlocked floors, retain normalized overflow progress, and place completed level-adjusted output in the producing floor's local queue without changing spendable gold.
- Encode the elevator route in its legacy signed cursor: non-negative means descending toward that floor, negative `-(index + 1)` means returning from that floor. Load only on arrival, snap a pickup that consumes the computed remainder to exact configured capacity, never pass a floor whose queue remains, slow each leg linearly with load up to 75% at full capacity, and deliver only on reaching the surface.
- Clamp accumulated transported material to the producing floor's extracted total at pickup. Fractional yields reach those counters through different arithmetic histories and may otherwise drift by one final decimal digit after many routes; the semantic upper bound is exact and must remain serializable.
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
- Expand legacy four-floor version-1 payloads to the current fifteen-floor shape before strict validation, preserving the original four floor objects and initializing floors 5–15 as configured locked defaults.
- Access local storage through an `ActiveSaveRepository`; let the Dexie adapter replace one fixed record, let the coordinator debounce routine writes and absorb failures into diagnostics, and keep browser lifecycle event binding in `src/platform/web/`.
- Compose a remote replica behind the same `ActiveSaveRepository` rather than teaching callers about the network: read local only on the boot path, and write local first — awaiting it — before offering the same document to the replica un-awaited. A failed local write must still reject; the replica can only ever fail silently.
- Keep the replica's upload policy pure and injected (clock, timers, transport) and put the one `fetch` in `src/platform`; then a retry, a cadence, and a `409` are all unit-testable without a network. Gate the first upload on the boot reconcile reporting the server's revision, so a returning player's first routine save updates revision N instead of false-conflicting against it.
- Bind a globally-received host function (`setTimeout`, `clearTimeout`) to `globalThis` before storing it on an object: the browser throws "Illegal invocation" when the detached function is called with the wrong receiver.
- Let the cloud adopt a save that already exists locally, and make that a named operation: read the local document, run it through the same migration/validation the load path uses, and force-upload it on the account's first sign-in — rather than letting a fresh cloud save replace it. Compare and assert against the migrated document, never the pre-migration bytes.
- Distinguish a returning player from a new one only with evidence: a session that was *reused* (not minted this boot) plus no local save is the one state a first-time player cannot be in. Explain that state honestly when there is nothing to restore, restore silently when there is, and never treat a freshly minted session as a returning player. Measure storage-eviction behaviour rather than assuming it, and record a granted persistence request as evidence, never as a guarantee.
- Change which clock is authoritative by sharing the *formula*, not duplicating it: one pure grant function takes two opaque timestamps, the client passes its own while the server passes its stored receipt and its own now, and the economy's ratio tests then guard both paths. When the server figure arrives it is the ceiling, but bound it by the client's own projection (`min`) so a receipt that lags play cannot credit time the open tab already banked — and treat a null or zero projection as a *zero* bound, not an absent one, or the bound never engages in exactly the case it exists for. Credit the client's projection alone only where no server figure can exist (no cloud copy, unconfigured), never because a request or a sign-in failed, or dropping one request hands back the clock cheat. Decide all of that in one pure, unit-tested function, bound the request with a timeout, and record the receipt a granted reward came from only once it is actually claimed and persisted.
- Bound an uploaded save with the *shared rate model*, never a replayed simulation: derive the maximum the mine could have produced from the previous document by holding the candidate's own final configuration over the elapsed interval — a genuine upper bound because levels only rise, and a loose one because a player upgrades gradually — in `O(floors)` rather than `O(elapsed)`, which would blow the upload latency budget on any long absence. Carry the material already in the pipeline at the interval's open (a floor's in-flight cycle and queue, the elevator's load, the warehouse's input), because a proportional rate term is near-zero over a short interval while one completed cycle is a fixed amount, or an honest warm save is rejected. Bound only the counters that move one way (extracted, transported, gold delivered, offline gold claimed, and the gold the levels cost), never the current balance, which is meant to fall when the player spends, and allow spend one earning term — the interval was either played or spent away, never both at full rate. State the tolerance and its size in the code, keep it biased toward accepting an honest save over rejecting one, pin it from both sides so widening it silently fails, and exempt the very first upload, which has no previous document to bound against. When a divergent branch is involved, measure from the most recent common ancestor the row still retains (its one-generation rollback) rather than the row itself, or a save-conflict resolution can never commit. Keep the check a pure function in `src/core` that receives the already-deserialized states, so the server never rejects an honest save because its own stored row was unreadable.
- Advance authoritative state to the lifecycle event boundary before stamping a hidden/pagehide save. Mirror that exact document synchronously into a validated localStorage journal because document teardown may abort the asynchronous IndexedDB transaction; select only a newer valid journal on the next boot and clear it after IndexedDB catches up.
- Restore a save only after complete migration, validation, and deserialization; otherwise classify it as corrupt or incompatible, preserve a safe detached diagnostic payload, warn without throwing, and return a fully fresh authoritative state.
- Keep screen geometry in a pure Phaser-free layout module so region maths is unit-testable in Node and the scene only positions objects.
- Give related objects one semantic anchor: an elevator floor stop reads the same gold-container centre that positions the receiving cart, rather than independently approximating the floor midpoint.
- Derive every displayed string, ratio, and discrete step in a pure Phaser-free view model over a read-only core snapshot; Phaser entities only position and paint what that model already decided, and never mutate authoritative state.
- Build each reusable view's game objects once inside a supplied layout region, change it only through an `applySnapshot` rebinding method, and expose a `describeRenderedState` read-back so browser tests compare rendered output instead of scene intentions.
- Hand the loaded snapshot to the scene at construction so the screen boots already bound rather than showing placeholder values first.
- Let the renderer pull, never let the core push: the scene asks a driver for the newest snapshot each frame, and the driver advances the core from an injected wall clock. Frame rate, frame delta, and animation speed must never reach that calculation, so a frozen clock pauses production while the screen keeps drawing.
- Memoize the derived snapshot in the driver and re-derive it only when a fixed tick completed, so the frames that change no displayed value hand back the same object and the scene skips rebinding by identity. State replaced by a command always re-derives, because a command changes displayed values without completing a tick.
- Order a renderable guard behind the identity check it protects, so a per-frame path that changes nothing costs nothing while every distinct snapshot is still checked once.
- Keep read-back diagnostics out of shipped builds behind a statically substituted flag, so the serialization drops out of the bundle rather than merely going unread.
- Keep world-space route endpoints independent of camera scroll. Convert a world pose into each camera/layer only for drawing; never feed viewport offset back into physical route interpolation, or offscreen distance collapses when the player scrolls.
- Credit nothing when the host clock moves backwards, and leave the authoritative timestamp ahead until real time catches up; the safe direction is never paying out time that did not pass.
- Treat a gap in the render loop as elapsed time to be simulated, not as one oversized frame. The per-call foreground bound guards against a slow frame paying out a burst; a hidden tab returns the whole absence at once, so walk it in credited-size slices, bound the walk so resuming cannot freeze the tab, and consume the authoritative timestamp in full whether or not the time was credited.
- Share the away-time *horizon* between catch-up and offline income, but not the *rate*. A tab left open counts as online and is credited at full pipeline rate; a closed one is credited through `offlineIncome.efficiency`, so the same two hours is worth about twice as much backgrounded. That is a balance decision, not an oversight, and it is invisible to every test that checks only one of the two paths — pin the ratio directly so applying the efficiency to catch-up, or dropping it from offline income, fails loudly.
- Give every production stage its own indicator driven by authoritative progress, and render waiting material wherever it can accumulate as discrete blocks measured against the capacity of the stage that removes it.
- Keep the cosmetic clock strictly separate from the simulation clock: scale it with a validated multiplier and drive only decoration with it. Gate machinery that communicates production activity on authoritative state, but let the surface hauler crew continuously patrol; its queue predicate controls cargo/pour feedback rather than movement.
- For progress-driven travel, map authoritative normalized progress through a pure endpoint-preserving easing function only when positioning the rendered object. Never feed eased progress back into route state, production timing, load calculations, or persistence.
- When authoritative progress arrives on a fixed-step cadence, interpolate only the rendered value from its current pose to the newest target over one fixed step. Traverse normalized wraps forward, settle exactly on the target, and never extrapolate indefinitely when the core pauses; this removes 10 Hz snapping without making cosmetic time authoritative.
- Never report a bottleneck a stage cannot observe from its own state; a full elevator car is one full trip, so transport pressure belongs in the floor queue/cart diagnostic rather than the decorative gold mound.
- Publish read-back diagnostics on a cadence, not on every frame: values that change continuously would otherwise serialize the whole screen 60 times a second for diagnostics alone.
- Signal a locked or disabled element with its own palette colour and badge rather than an alpha dim, so a pixel probe can prove the distinction.
- Keep environmental decoration stable. If queue fullness needs a discrete capacity signal, expose it through the receiving container, amount label, or diagnostic rather than hiding, blinking, or rescaling a fixed landmark.
- Repeat long structural textures at a documented native-axis scale instead of stretching one bitmap over dynamic content depth. Publish tile dimensions in development diagnostics so a later floor-count change cannot silently reintroduce filtered, blurred rails or seams.
- Let visual workforce milestones derive from an existing authoritative level,
  not new saved presentation state. Pool the maximum crew once, reveal only the
  reached assistants, and phase-shift each worker horizontally around one
  shared route baseline without copying transforms or changing throughput.
- Reuse that workforce rule per mine floor: one base miner plus one assistant
  every 50 shaft levels through level 200. Apply the same pure count function to
  every floor view, cap the pool at five visible miners, and keep all assistant
  poses downstream of authoritative extraction progress.
- Pool one cart beside every pooled surface worker and bind both objects to the
  same independent route pose. A visible cat without its own visible cart, or
  multiple cats sharing the lead cart, violates the workforce presentation.
- Treat `warehouse.inputQueue` as the sole material source for the entire
  surface-delivery presentation. Elevator cargo is still in transit: it must
  not enable the gold-pour effect, filled carts, or loaded hauler poses before
  the core transfers it into the tower queue at surface arrival.
- Keep every surface hauler moving through the full collection/delivery/return
  route even when that source is empty; absence of gold means an empty cart and
  no pour, not an idle worker.
- Keep one lowercase magnitude-tier resolver shared by every number surface,
  including DOM overlays, so HUD, prices, queues, income, and offline rewards
  cannot disagree about suffix boundaries.
- Keep rendering steps free of interaction: a step that renders a control renders it inert, and the later ordered step adds costs, affordability, commands, and feedback.
- Model every purchase as one control: a labelled button with a price that either can or cannot be pressed to effect right now. A second kind of purchase reuses the button, the command sink, the feedback, and the diagnostic rather than duplicating them.
- Separate floor selection from floor purchase: the compact Level badge opens a
  detail overlay and never spends by itself. Derive x1, x5, and MAX quotes from
  the same geometric core cost function the batch command charges, and commit
  one immutable state transition plus one persistence notification per CTA.
- When a DOM modal overlays a Phaser canvas, disable scene input for the whole
  modal lifetime. DOM pointer events can still be observed by Phaser's global
  listeners; visual coverage alone does not prevent a close/CTA gesture from
  activating the game object underneath.
- Enable a control from everything the purchase needs, not from the price alone; put a second requirement beside the button as its own line, and colour it by whether it is met, so a player short of gold is not told to keep upgrading.
- Give a slot exactly one live control and assert it: two overlapping buttons on one panel is a rendering bug the view model can catch before the scene draws it.
- Name only the refusals a player can act on. Every other core failure is a press that should not have been reachable, and reads as unavailable rather than as advice the player cannot use.
- Expire a feedback map on its own terms, not through the controls still on screen: a purchase that removes the control it was made on would otherwise leave its result uncollected forever.
- Let a completed change be its own confirmation. A floor that visibly opens says more than a message on a button the same frame removes.
- Price a control through the same function the command charges, so the figure on the button and the figure deducted cannot drift apart.
- Let a disabled-looking control still be pressable and let the core decide: refusing in the view replaces the core's answer with the renderer's guess, and leaves a player who cannot afford something with no feedback at all.
- Advance the simulation to the current time before applying a command: the player is spending the gold the mine has now, not the gold the last rendered frame happened to show.
- Return an explicit outcome from every command and leave state and the memoized snapshot untouched on refusal, so a refused press costs the scene no rebinding.
- Persist a command's result explicitly. A purchase changes authoritative state without completing a simulation tick, so a debounced save that only follows ticks would lose it.
- Carry a press result on a presentation clock separate from the cosmetic one, so how long a message stays readable cannot change with animation speed.
- Make a control's own rectangle its hit area, so the pressable region is exactly the drawn one and hiding the control removes it from input.
- Keep every repeated render path free of writes that repaint, not only the per-frame one. `Text.setText` skips an unchanged value but `Text.setColor` does not: it re-rasterizes the text canvas and re-uploads its texture whatever colour is already there. The per-snapshot path runs ten times a second and rebinds every caption, so an unguarded colour there repaints just as pointlessly as one on the frame path. Compare before writing, keep the comparison in one shared helper (`setTextColor`) rather than re-deriving it per view, and cover it with a test that counts repaints across idle frames.
- Publish an interactive element's rectangle in screen coordinates, converted through the camera that renders it, so a browser test aims a real press at a real control instead of assuming a coordinate.
- Absorb host safe-area insets in CSS around the Phaser parent element rather than inside the canvas, so insets are applied exactly once and the logical viewport stays a fixed 360×640.
- Scale with `FIT` and `CENTER_BOTH`: letterbox rather than crop, so no required control can leave the host viewport.
- Clip scrollable screen regions with a dedicated camera viewport, not a geometry mask; Phaser 4 removed WebGL geometry masks, and camera scroll is the single value a scroll gesture drives.
- Keep fixed and scrolling layers in separate containers and cross-ignore them between cameras so the HUD and bottom navigation cannot scroll with the mine. Scroll the same camera the engine hit-tests through, so a control's pressable rectangle follows the content it is drawn on rather than needing its own bookkeeping.
- Let a navigation shell own only discovery and press feedback until its destination exists. Icon taps may emit a presentation callback for diagnostics, but must not invent gameplay state, persistence fields, or placeholder screens.
- Decide a scroll gesture in a pure model over pointer coordinates and one region, so telling a tap from a drag is unit-testable in Node instead of only reachable through a browser drag.
- Separate the two things a gesture decides: whether the surface scrolls, which needs the press to have started over it, and whether the release is still a tap, which is about how far the pointer travelled wherever it began. A swipe that lifts on a button is not a press on that button.
- Give a drag a threshold and let travel under it change nothing at all: a thumb never lands perfectly still, so a press that wobbles must both leave the screen where the player aimed and still buy what they aimed at.
- Let a suppressed tap outlive the gesture that suppressed it and clear it only on the next press, because the engine reports a control's press while the pointer is still coming up.
- Return state unchanged by identity whenever a pointer transition moved nothing, so a held finger costs no camera write and no republished diagnostic.
- Size every interactive region for a thumb and assert the minimum where the control is built, so an undersized button fails at boot rather than as an unattributable miss rate on a real phone.
- Let the surface that owns a gesture claim it in CSS as well as in code: without `touch-action: none` a browser can start panning the page and no canvas listener can take the gesture back.
- Publish whether an element is actually reachable, not only where it is: a scrolled-away control's rectangle outlives the control, and a test aiming at it would press whatever took its place.
- Format every displayed amount through one shared function, so a value never reads one way in the HUD and another in the mine.
- Bind the HUD centre value and warehouse icon to `warehouse.inputQueue`, the authoritative queue awaiting warehouse conversion, rather than `elevator.carriedMaterial` in transit.
- Self-host the approved game font and await its required weights before creating Canvas text; otherwise the renderer rasterizes a fallback that does not automatically become the intended face. Keep font family and SemiBold/Bold weights as shared presentation constants.
- Truncate a displayed balance rather than rounding it: a number that reads higher than it is promises a purchase the player cannot make.
- Read a magnitude through the numeric boundary's own mantissa and exponent, never through `Number`, which collapses everything past its range to the same value.
- Derive a displayed rate from the same calculation the core uses, never from what the renderer observed happening.
- Publish layout geometry as canvas dataset diagnostics so browser tests assert real on-screen rectangles instead of screenshots, but never let diagnostics be the only renderer evidence: they report intended geometry and stay green while the render is broken.
- Assert renderer correctness with pixel probes at fixed logical coordinates, sampling colors from the shared pure palette. Force `preserveDrawingBuffer` in the test browser context only; production keeps it disabled.
- Keep generated game art behind semantic texture keys and load the complete runtime family before constructing views. Views may transform, recolour, and show sprites, but generated assets never become authoritative state.
- Treat source resolution and semantic display size as separate contracts. Phaser
  texture swaps can restore native dimensions; whenever state variants have
  different source sizes, reapply the same display box immediately and publish
  measured bounds so empty/filled or normal/backlogged states cannot pulse.
- Paint full-strip environment plates behind every interactive surface object,
  with low contrast in gameplay corridors. Keep a code-rendered fallback fill
  underneath and foreground ground/interaction layers above the plate.
- Express a colour cue that carries meaning as a texture, not a tint: Phaser implements tinting in the WebGL renderer only, so a `Phaser.AUTO` game that falls back to Canvas would drop the cue silently. Generate the recoloured variant once at boot and swap the texture key, which also leaves the cue readable off the game object.
- Derive a view's rendered-state read-back from its own game objects — a measured size, a texture key, a visible flag — never from a field cached out of the snapshot. A field copied from the input echoes the scene's intentions and can no longer fail, which is exactly what the diagnostic exists to catch.
- Keep functional labels, dynamic values, focus/press behavior, and hit areas code-native. Generated UI artwork may identify a purchase or resource but cannot be the only carrier of price, state, or accessibility meaning.
- Retain the generation prompt, raw source, deterministic processor output, QC metadata, art-direction brief, and provenance manifest. Ship only semantic runtime files from `public/`; keep source and review artifacts outside the public build tree.
- Turn the deterministic economy trace into real UI presses for the integration journey. Derive the exact expected save in the test process, start each run from a deleted IndexedDB database, advance only the controlled wall clock, and require two isolated browser contexts to produce the same pre-offline and post-claim documents. Keep lifecycle/background equivalence out of this test because it belongs to the next ordered gate.
- Wait for an always-painted reference point before any pixel probe: canvas diagnostics are published inside `create`, before the first frame is presented, and an unpresented canvas reads back as opaque black.
- Probe a point where the layer under test is the topmost drawn thing. A probe hidden behind a later-drawn panel proves nothing, so the mine gutter, not a floor panel, guards the mine camera's ignore list.
- Declare the deployment base path rather than inheriting it. Runtime textures
  are requested through absolute paths no bundler rewrites, so a prefixed base
  would emit the bundle under the prefix while the loader kept asking the root —
  a failure that appears only in a deployed build.
- Verify the artefact that ships, not only the one the dev server assembles.
  A production smoke suite must assert what only the served bundle can show:
  every runtime asset returning success, entries resolving under the built
  asset root, no module served from `/src/`, and the dev-only read-backs
  absent. Diagnostics that are stripped from the shipped build are exactly the
  ones a production test cannot lean on, so fall back to pixel probes,
  IndexedDB contents, and the DOM.
- Reach a production entry through an init script, not through route rewriting.
  The dev-server suites inject a controlled clock by fulfilling `/src/main.ts`;
  a hashed bundle has no such stable URL, so the same single injected clock is
  installed before any application module runs.
- Seed an invalid save with the application blocked from booting. A page that
  runs will flush a valid document over the fixture at its next lifecycle
  boundary, so the recovery path under test never sees the payload.
- A capability the core exposes is not a feature until the application passes
  it. A visible recovery warning that no caller subscribes to is silent in the
  shipped build and green in every unit test; wire the callback and assert the
  surfaced text, not the produced value.
- Keep a recoverable diagnostic a notice rather than a dialog: the session
  continues either way, so it must not take focus or block the canvas.
  De-duplicate by code, because a broken storage backend reports the same
  failure on every debounce, and let a dismissal hold until a different problem
  occurs.
- Enforce every documented purity boundary with a lint rule plus an `architecture.test.ts` probe, not with prose alone.
- Add seeded randomness only when later probabilistic systems are introduced.
- When one animated object crosses between separately clipped Phaser camera
  regions, keep one authoritative world position and use a presentation-only
  twin on the fixed layer. Fade the twin after boundary entry and derive both
  poses from the same route; never duplicate simulation state or timing.
- Anchor routes to the semantic opening inside generated art, not blindly to
  the full sprite rectangle. An asymmetric chute or overhang moves the texture
  centre without moving the bay the cabin must visibly enter; export that bay
  stop as shared pure layout geometry and pin it in browser diagnostics.
- When a lift shaft is visually continuous, preserve one X coordinate across
  every camera layer and move the surrounding building art to that axis. Do not
  interpolate the cabin sideways near the seam; the resulting diagonal is
  visible even when both endpoints separately look plausible.
- A generated building may replace a legacy stage card while the invisible
  bound view remains the authoritative read-back and purchase model. Route taps
  from the building to the same command, and keep decorative character loops
  cosmetic so presentation cannot silently introduce manager gameplay state.
- When art replaces a stage card, restore its upgrade affordance as a separate
  code-rendered level badge anchored to a semantic landmark in the asset. Keep
  functional text out of the raster, preserve a 44×50 touch region behind the
  smaller chrome, and publish the visible badge bounds rather than the hidden
  legacy control bounds.

## Critical Flow

Load save → migrate and validate → recover fresh state if invalid → calculate capped offline reward → persist consumed timestamp interval → show positive pending reward → claim once into the driver's state → force-persist claim → dismiss modal → pull an advanced snapshot each frame → rebind the mine views → advance the separate cosmetic clock → send player commands to core → persist debounced snapshots.

## Performance

Prefer sprite atlases, object pooling, tweens/state machines, and minimal dynamic graphics. Physics is unnecessary. Keep the simulation independent of frame rate and target 60 FPS in a 9:16 viewport.

Measure the optimized bundle before changing runtime code. The Step 35 harness
uses a constant-memory frame histogram, forces GC before retained-heap samples,
ignores the bounded first-minute V8/Phaser warm-up when calculating sustained
memory slope, and holds the full fifteen-floor scene active while alternating
input probes.

Sample every trend metric; never publish one once and read it back later. A
counter written at boot and re-read after ten minutes is a boot-time value
wearing a trend's clothes, and the object-count metric exists precisely to catch
growth it could not have seen. For the same reason, assert the benchmark's own
preconditions — the seeded fifteen-floor save is verified as loaded before and
after the run, so a save that silently recovered into a fresh single-floor state
fails the benchmark instead of passing every budget while measuring the wrong
mine. A frame-rate figure derived from `requestAnimationFrame` deltas reports
the host's presentation cadence, so state conclusions in frame time against the
16.67 ms budget rather than in FPS. Keep profiler diagnostics behind a build-time flag so ordinary
production bundles remove them. Treat Pixel/CPU-throttled desktop Chrome as
repeatable emulation evidence only; it does not replace a physical mid-range
Android Chrome pass.

Re-run a benchmark when its fixture's scope changes, rather than keeping a
result that no longer measures what the plan requires. A recorded pass whose
fixture has since grown from four floors to fifteen is evidence about a mine
that no longer exists. For the same reason, read a frame-rate result against the
cadence the host actually presented at: a 16.67 ms mean on a 60 Hz host is the
vsync interval, not a measurement of headroom, and comparing it to an 8.33 ms
mean from a 120 Hz run is not a like-for-like delta.

## Closed incident reports

Four base-game defect reports (marketplace popup, navigation hit-target,
upgrade CTA press, marketplace hardening and close-race) previously appeared
verbatim in this file and six others. They are now in
`archive/incident-log.md`, one canonical copy.
