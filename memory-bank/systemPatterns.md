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
- Create a pending-reward view only for positive income. Claim immutably into one cached authoritative candidate, force-persist it before dismissing the modal, and reuse the candidate on save retry so repeated input cannot add gold twice.
- Represent very large values through the immutable `GameNumber` abstraction; keep break_infinity.js private, serialize as strings, and implement abbreviated display formatting separately.
- Serialize only authoritative game state, never transient animation state.
- Construct fresh state from validated balance data and an injected timestamp; never read the wall clock inside deterministic state creation.
- Version every save and test migrations.
- Route every save candidate through migration dispatch and strict schema/config validation before reconstructing runtime `GameNumber` values; keep this pure document boundary independent of the later IndexedDB adapter.
- Access local storage through an `ActiveSaveRepository`; let the Dexie adapter replace one fixed record, let the coordinator debounce routine writes and absorb failures into diagnostics, and keep browser lifecycle event binding in `src/platform/web/`.
- Restore a save only after complete migration, validation, and deserialization; otherwise classify it as corrupt or incompatible, preserve a safe detached diagnostic payload, warn without throwing, and return a fully fresh authoritative state.
- Add seeded randomness only when later probabilistic systems are introduced.

## Critical Flow

Load save → migrate and validate → recover fresh state if invalid → calculate capped offline reward → persist consumed timestamp interval → show positive pending reward → claim into one state candidate → force-persist claim → dismiss modal → initialize simulation snapshot → render Phaser scene → send player commands to core → persist debounced snapshots.

## Performance

Prefer sprite atlases, object pooling, tweens/state machines, and minimal dynamic graphics. Physics is unnecessary. Keep the simulation independent of frame rate and target 60 FPS in a 9:16 viewport.
