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

The completed establishment phase now provides the web scaffold, quality tooling, enforced module boundaries, and a safe-area-aware 360×640 Phaser game. The approved `layout1.png` underground composition uses number-only floor badges, a miner whose authoritative travel reaches from the unloading cat to the pile, a single-line coin-plus-amount queue readout, a softer irregular gold mound raised clear of the floor seam, and a tiny sharp level badge backed by a larger invisible touch target. Duplicate `Floor N` headings and floor progress bars remain absent. The offline reward uses the same abbreviated number language as the mine instead of raw serialized decimals. The first Step 32A pack is awaiting visual validation; Step 33 is blocked until validation.
