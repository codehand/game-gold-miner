# Project Brief

## Project

**Cat Mine Idle** is a mobile-first, portrait 2D idle/incremental mining game inspired by the gameplay shown in the supplied Cat Gold Miner video. Players manage several mine floors operated by cartoon cats, collect gold, remove production bottlenecks, upgrade equipment, automate floors with managers, and earn capped offline income.

## Goal

Build a focused prototype that proves the core loop is understandable, satisfying, and technically viable in a mobile browser and Telegram Mini App. Match the reference game's gameplay feel without copying its name, artwork, audio, text, or other protected assets.

## MVP Requirements

- Portrait 9:16 mine view with four simultaneous floors.
- Automated mine → transport → warehouse → spendable-gold loop.
- Floor upgrades, milestone multipliers, and sequential unlocks.
- One manager type that enables automation.
- Local save restoration and capped offline rewards.
- One temporary x4 boost and random gift drops.
- Basic animation, sound feedback, and abbreviated large numbers.
- Target 60 FPS on representative mobile devices.

## Out of Scope

Accounts, production backend, payments, ads, blockchain, NFTs, Play-to-Earn, leaderboards, referrals, Land, News, advanced cards, and more than four floors are excluded from the first prototype.

## Base-Game Milestone

The current base-game milestone precedes the full MVP. It uses English UI and automatic production without gameplay managers. It includes four mine shafts, one shared sequential-stop elevator whose speed decreases with load and returns into a surface headhouse with a gold hopper/discharge chute, and one shared warehouse presented as an open depot with a cosmetic supervisor cat. An original blue-sky landscape establishes the outdoor surface; a presentation-only crew moves one invariant-size empty/filled cart from the chute toward the warehouse. The crew starts with one cat and gains one independently animated cosmetic assistant every ten warehouse levels through level 100. All abbreviated units are lowercase. Compact code-rendered `Level N` controls upgrade the surface stages. Independent upgrades, local saves, and capped offline rewards remain core; managers, boosts, gifts, audio, and Telegram integration remain deferred.

## Source of Truth

Use `memory-bank/game-design-document.md` for product scope, `memory-bank/tech-stack.md` for technical direction, and `memory-bank/implementation-plan.md` for execution order. Assumptions derived from the short reference video must remain clearly labeled until verified through playtesting or additional evidence.
