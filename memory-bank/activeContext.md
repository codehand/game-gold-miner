# Active Context

## Current Focus

Implementation Plan Step 3 is implemented and its automated validation passes. The project is paused at the required stop gate while the user validates the quality-tooling test; Step 4 must not begin without explicit authorization.

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
- Validated Step 1 on 2026-08-27 and documented current file responsibilities, planned module ownership, dependency boundaries, data flow, and the absence of a database in `memory-bank/architecture.md`.
- Completed and validated Step 2 on 2026-08-27 with a root Vite/TypeScript scaffold, Phaser 4.2.1, an npm lockfile, and a simulator-preview workflow.
- Implemented Step 3 quality tooling with strict TypeScript 6.0.3, ESLint 10.9.1, Vitest 4.1.11, and Playwright 1.62.1.
- Added one baseline unit test and one Chromium browser smoke test; lint, unit tests, E2E tests, production build, and the development-server HTTP check pass.

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

1. Wait for the user to validate the Step 3 test results.
2. Begin Step 4 only after explicit user authorization.
3. Keep all later steps blocked behind their preceding validation gates.
4. Defer managers, boosts, gift drops, and other expanded features until the base-game milestone passes.

## Open Questions

- Exact balance curve and milestone multipliers.
- Final art-production workflow and original visual identity.
- Target Telegram launch requirements beyond the prototype.
