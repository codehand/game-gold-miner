# Project Brief

## Project

**Cat Mine Idle** is a mobile-first, portrait 2D idle/incremental mining game inspired by the gameplay shown in the supplied Cat Gold Miner video. Players manage several mine floors operated by cartoon cats, collect gold, remove production bottlenecks, upgrade equipment, automate floors with managers, and earn capped offline income.

## Goal

Build a focused prototype that proves the core loop is understandable, satisfying, and technically viable in a mobile browser and Telegram Mini App. Match the reference game's gameplay feel without copying its name, artwork, audio, text, or other protected assets.

## MVP Requirements

- Portrait 9:16 mine view with fifteen sequential floors revealed in groups of five.
- Automated mine → transport → warehouse → spendable-gold loop.
- Floor upgrades, milestone multipliers, and sequential unlocks.
- One manager type that enables automation.
- Local save restoration and capped offline rewards.
- One temporary x4 boost and random gift drops.
- Basic animation, sound feedback, and abbreviated large numbers.
- Target 60 FPS on representative mobile devices.

## Out of Scope

Accounts, production backend, payments, ads, blockchain, NFTs, Play-to-Earn, leaderboards, referrals, Land, News, advanced cards, and more than fifteen floors are excluded from the first prototype.

## Base-Game Milestone

The 2026-09-08 review leaves fifteen authoritative floors in progressive groups of five and a 52-pixel HUD whose centre is `warehouse.inputQueue`. The surface tower, pour, and every loaded cart now empty exactly when that queue is zero, while all hauler cats continue their phase-shifted empty round trips; the elevator cannot descend past a floor whose queue remains; and every surface hauler/cargo cart shares one route baseline. Tapping a mine-floor, elevator-tower, or warehouse Level badge opens a non-purchasing detail popup with authoritative current/next attributes and x1/x5/MAX upgrade choices.

The current base-game milestone precedes the full MVP. It uses English UI and automatic production without gameplay managers. It includes fifteen mine shafts revealed in groups of five, one shared sequential-stop elevator whose speed decreases with load and returns into a surface headhouse with a gold hopper/discharge chute, and one shared warehouse presented as an open depot with a cosmetic supervisor cat. An original blue-sky landscape establishes the outdoor surface; a presentation-only crew moves invariant-size empty/filled carts from the chute toward the warehouse. The crew starts with one cat and gains one independently animated cosmetic assistant every ten warehouse levels through level 100, with one independent cart per visible cat. Each unlocked floor starts with one miner and visually adds one at levels 50/100/150/200, capped at five without changing extraction throughput. The compact HUD exposes `warehouse.inputQueue` with a warehouse icon. All abbreviated units are lowercase and main-screen amounts retain two decimal places. Compact code-rendered `Level N` controls open stage-detail and batch-upgrade choices. Independent upgrades, local saves, and capped offline rewards remain core; managers, boosts, gifts, audio, and Telegram integration remain deferred.

## Source of Truth

Use `memory-bank/game-design-document.md` for product scope, `memory-bank/tech-stack.md` for technical direction, and `memory-bank/implementation-plan.md` for execution order. Assumptions derived from the short reference video must remain clearly labeled until verified through playtesting or additional evidence.
