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
- Recognize floor extraction from miner travel and stalled production from visible gold queues; shared transport stages retain progress bars.
- Feel a noticeable acceleration after every meaningful upgrade.
- Return to a useful but capped offline reward.
- Make progress without blockchain, payment, or advertising systems.

## Core Journey

The player claims offline gold, inspects the mine, upgrades the slowest stage, opens deeper floors, assigns managers, activates a boost, and leaves while production continues. Short-term goals are the next upgrade and floor; the prototype's long-term goal is fully automating and optimizing all four floors.

## UX Principles

Prioritize one-thumb controls, readable large-number notation, strong upgrade affordances, short animations, and uninterrupted portrait play. UI must reinforce the production chain instead of covering it.

## Base-Game Delivery Boundary

The current implementation milestone is limited to four floors, one shared elevator, one shared warehouse, gold, independent stage upgrades, milestone multipliers, sequential unlocks, local saves, and capped offline income. Production is automatic without managers. UI copy is English, the logical viewport is 360×640, and no inactive bottom navigation is shown. Managers, boosts, gift drops, shops, tasks, social systems, Telegram integration, backend services, monetization, audio, and final production assets remain deferred until the base-game acceptance checks in `memory-bank/implementation-plan.md` pass.

The completed establishment phase now provides a safe-area-aware 360×640 Phaser game with the approved Step 32A mine composition. Above ground, a bright original blue-sky, mountain, pine, and meadow panorama replaces the flat navy field behind the tower and warehouse, making the production space read as the surface. A 62 px cabin travels straight into the headhouse; when material exists, gold falls into carts beneath its chute and orange hard-hat cats push them toward the right-flush warehouse before returning empty. Every visible cat owns one independent cart; empty and filled cart art always occupies one 46×46 footprint, so state changes never pulse in size. Warehouse progression now makes the operation visibly busier: one base hauler is joined by one assistant every ten warehouse levels, reaching eleven cats at level 100 without changing throughput. Every unlocked mine floor similarly starts with one miner and gains one at levels 50/100/150/200, reaching five independently phased miners without multiplying extraction. Assistants occupy independently phase-shifted positions and shallow lanes, so they do not hide behind the lead worker. The HUD centre shows authoritative elevator-carried gold, and main-screen amounts retain two decimal places. Every game-number suffix is lowercase and follows the named tiers through `dc` before `aa` begins at `10^36`. The elevator `Level N` control sits immediately beside the chute and five pixels higher than the previous review; the warehouse control remains above its roof. Both retain 30×34 chrome inside 44×50 touch regions and reuse existing purchase commands. The delivery crew, floor crew expansion, and warehouse supervisor remain presentation-only. Save schema version 1 and economy behavior are unchanged; Step 33 remains blocked pending Step 32 validation.
