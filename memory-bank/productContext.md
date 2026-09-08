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

The player claims offline gold, inspects the mine, upgrades the slowest stage, opens deeper floors, assigns managers, activates a boost, and leaves while production continues. Short-term goals are the next upgrade and floor; the prototype's long-term goal is fully automating and optimizing all fifteen floors.

## UX Principles

Prioritize one-thumb controls, readable large-number notation, strong upgrade affordances, short animations, and uninterrupted portrait play. UI must reinforce the production chain instead of covering it.

## Base-Game Delivery Boundary

The current implementation milestone includes fifteen sequential floors, one shared elevator, one shared warehouse, gold, independent stage upgrades, milestone multipliers, local saves, and capped offline income. The screen initially exposes floors 1–5; opening floor 5 reveals floors 6–10, and opening floor 10 reveals floors 11–15. Production is automatic without managers. UI copy is English, the logical viewport is 360×640, and no inactive bottom navigation is shown. Managers, boosts, gift drops, shops, tasks, social systems, Telegram integration, backend services, monetization, audio, and final production assets remain deferred until the base-game acceptance checks in `memory-bank/implementation-plan.md` pass.

The user-review revision completed on 2026-09-08 reduces the fixed HUD to 52 logical pixels and defines its centre number as the authoritative warehouse input queue (`warehouse.inputQueue`), not gold still travelling inside the elevator cabin. A warehouse icon makes that ownership explicit. The tower hopper, gold pour, loaded cats, and filled surface carts now all empty with that queue; elevator cargo remains visually in transit until surface delivery. The elevator preserves top-down priority by returning whenever a visited floor still has gold, and the surface delivery crew shares one straight baseline.

The delivery crew remains visibly active when the tower is empty: the lead cat and every warehouse-level assistant repeatedly visit the tower, push an empty cart to the warehouse, and return. A positive warehouse input queue adds gold pour and filled-cart feedback to that same route; it does not start or stop the workers.

The shared elevator shaft remains visually continuous and crisp through all fifteen floors. Its original shaft art repeats at native vertical resolution rather than being stretched to the full mine depth, so rail connectors and braces stay readable while scrolling.

Opening more floors does not reduce the apparent cadence of miner travel: fixed-step extraction targets are blended across rendered frames, keeping walking smooth while authoritative production remains deterministic.

Scrolling to inspect deep floors changes only the player's view. The elevator still travels the complete physical shaft through every intervening floor before entering the surface tower; offscreen distance is never skipped.

The same review replaces direct Level-badge purchases with an accessible detail popup for mine floors, the elevator tower, and the warehouse. It explains each target's authoritative current and next production attributes before the player chooses x1, x5, or the exact MAX affordable level count; the warehouse queue field is sourced from `warehouse.inputQueue`. Opening or closing spends nothing, disabled choices reflect current gold, successful batches update the still-open popup immediately, and Phaser input stays disabled behind the DOM overlay.

The completed establishment phase provides a safe-area-aware 360×640 Phaser game with the approved Step 32A mine composition, original surface scenery, one shared elevator tower, cart-hauler crews, a warehouse depot, independently animated mine crews, and touch-safe level controls. The 2026-09-07 review expands the authoritative mine to fifteen floors with progressive five-floor disclosure and changes the compact HUD centre to the warehouse input queue. Step 33 proves the core journey twice through real controls; Step 34 proves lifecycle and offline intervals are consumed exactly once; Step 35 measures the mobile frame, memory, startup, and input budgets under Pixel 5 emulation, with a physical Android pass still outstanding; and Step 36 proves the optimized bundle, assets, save recovery, and responsive portrait layout. Save-document and IndexedDB schema versions remain 1, with a same-version compatibility expansion for former four-floor saves.

Step 37 closed the milestone, validated by the user on 2026-09-08. It reviewed the delivered game against this plan and the GDD acceptance criteria, recorded every deferred feature rather than building it, added `README.md` so a new developer can install, run, test, and understand the base game from repository documentation alone, and corrected the documentation that still described a four-floor mine. What a player can do is therefore final for this milestone: watch fifteen floors produce automatically, upgrade three stage types independently, buy shaft levels in x1/x5/MAX batches through the floor detail popup, open floors in sequence, cross milestone multipliers, and claim a capped offline reward. Everything else in the GDD is deferred and recorded in `memory-bank/progress.md`.
