# Active Context

## Current Focus

The project is in pre-implementation planning. The immediate objective is to scaffold the TypeScript/Phaser/Vite application without expanding the agreed MVP.

## Recent Changes

- Analyzed the supplied 8.56-second gameplay video.
- Created `memory-bank/game-design-document.md` with the core loop, systems, UI, MVP, and uncertainties.
- Selected a web-first Phaser/TypeScript stack in `memory-bank/tech-stack.md`.
- Added contributor guidance in `AGENTS.md`.
- Initialized the Memory Bank on 2026-08-27.
- Strengthened contributor rules to require pre-code context reads and complete database-schema documentation.
- Created `memory-bank/implementation-plan.md`, a 37-step test-driven delivery sequence for the base game.
- Consolidated the GDD, tech stack, and implementation plan inside `memory-bank/` and resolved base-game implementation defaults.
- Added `memory-bank/architecture.md` as an empty placeholder and required it to be read before code and updated after major features or milestones.

## Active Decisions

- Target browser and Telegram Mini App first.
- Keep core simulation deterministic and independent of Phaser.
- Use original branding and assets rather than copying the reference game's protected content.
- Keep MVP client-only and exclude monetization, blockchain, and social systems.
- Treat balance values in the GDD as starting hypotheses requiring playtests.
- Use English UI at a 360×640 logical resolution with no deferred bottom navigation.
- Run production automatically through four mine shafts, one shared round-robin elevator, and one shared warehouse.
- Upgrade mine shafts, elevator, and warehouse independently while preserving progress percentage.
- Use saved-rate offline rewards, K/M/B/T number formatting, Phaser 4.2.1, and a mid-range Android Chrome performance baseline.

## Next Steps

1. Execute Phase 1 of `memory-bank/implementation-plan.md`: repository scaffold and quality gates.
2. Implement the deterministic three-stage game core in Phase 2.
3. Add base progression, persistence, and offline rewards in Phases 3–4.
4. Render and integrate the four-floor base game in Phases 5–6.
5. Defer managers, boosts, gift drops, and other expanded features until the base-game milestone passes.

## Open Questions

- Exact balance curve and milestone multipliers.
- Final art-production workflow and original visual identity.
- Target Telegram launch requirements beyond the prototype.
