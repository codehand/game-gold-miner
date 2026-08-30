# Product Context

## Why This Exists

The project explores whether the appeal of a multi-floor idle mining game can be reproduced as a lightweight, web-first prototype. The primary value is immediate visual progress: the mine keeps moving while the player makes short, meaningful optimization decisions.

## Target Players

Casual mobile players who enjoy incremental numbers, automation, collectible managers, and sessions lasting roughly 30 seconds to five minutes.

## Player Problem

Many management games obscure cause and effect or require constant tapping. This game should make every bottleneck visible and allow the player to improve production with a few clear actions.

## Intended Experience

- Understand how gold is produced and spent within 30 seconds.
- See miners, carts, and storage working concurrently.
- Recognize stalled production from visible gold queues and progress bars.
- Feel a noticeable acceleration after every meaningful upgrade.
- Return to a useful but capped offline reward.
- Make progress without blockchain, payment, or advertising systems.

## Core Journey

The player claims offline gold, inspects the mine, upgrades the slowest stage, opens deeper floors, assigns managers, activates a boost, and leaves while production continues. Short-term goals are the next upgrade and floor; the prototype's long-term goal is fully automating and optimizing all four floors.

## UX Principles

Prioritize one-thumb controls, readable large-number notation, strong upgrade affordances, short animations, and uninterrupted portrait play. UI must reinforce the production chain instead of covering it.

## Base-Game Delivery Boundary

The current implementation milestone is limited to four floors, one shared elevator, one shared warehouse, gold, independent stage upgrades, milestone multipliers, sequential unlocks, local saves, and capped offline income. Production is automatic without managers. UI copy is English, the logical viewport is 360×640, and no inactive bottom navigation is shown. Managers, boosts, gift drops, shops, tasks, social systems, Telegram integration, backend services, monetization, audio, and final production assets remain deferred until the base-game acceptance checks in `memory-bank/implementation-plan.md` pass.

The completed establishment phase now provides the web scaffold, quality tooling, enforced module boundaries, and a minimal 360×640 Phaser boot scene. The deterministic core runs the automatic production chain, exposes a bottleneck-aware effective rate, and supports exact-price upgrades, cumulative level 10/25/50/100 milestone multipliers, and sequentially gated floor unlocks. A deterministic ten-minute balance harness confirms the provisional curve opens all four floors, reaches milestones without runaway level-100 growth, and does not stall. The complete authoritative snapshot and effective rate cross a strict version-1 save boundary and persist as one replaceable local IndexedDB record. Malformed or incompatible saves recover automatically to a playable fresh game. Valid returning players see a simple modal for a deterministic pending reward based on the saved rate, at 50% efficiency for at most two hours; claiming adds the exact amount once and persists it before the modal closes. The portrait mine screen now has its responsive frame: a fixed English top HUD, a shared surface strip for the elevator and warehouse, and a scrollable mine area that runs to the bottom edge with no navigation bar reserved for deferred features. The canvas fits inside the device safe area at phone, tablet, and desktop sizes without cropping any control. That frame is now filled: each of the four floors shows its number, mine-shaft level, an original cat-miner sprite, a growing illustrated gold pile, an extraction progress bar, and a shaft-upgrade control, while locked floors use their own dark panel and padlock art. The shared elevator and warehouse have distinct original machinery silhouettes, held material appears as ore-crate sprites, and the HUD and purchase controls use matching coin, cart, lock, and upgrade icons. All labels and state remain code-native and the generated artwork remains cosmetic. The mine runs while the player watches: each of the three stages advances its own indicator from the live simulation, and material waiting anywhere in the chain turns into a red silhouette and says `Backed up` once a whole cycle of work is queued, so the slowest stage is visible without reading a number. Miners keep moving and conveyors keep moving as decoration only — that motion is on a separate clock and cannot change how much gold the mine produces. The top bar shows the gold the player can spend and a bottleneck-aware income estimate with stable large-number abbreviations. Every open floor and both shared stages can be upgraded with immediate success or refusal feedback, every locked floor states and enforces its requirement, and successful commands persist. Dragging or wheeling scrolls the mine without moving the fixed layers or buying whatever a swipe ends on. The original placeholder presentation remains readable at both exact 360×640 scale and a reduced 320×568 phone viewport; audio and final production art remain deferred.
