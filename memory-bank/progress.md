# Progress

## Status Summary

**Phase:** Design complete enough to begin scaffolding. No runnable game exists yet.

## Completed

- Reference video reviewed and its visible gameplay elements documented.
- Simple GDD created in `memory-bank/game-design-document.md`.
- MVP scope and explicit exclusions defined.
- Technical stack and planned architecture documented in `memory-bank/tech-stack.md`.
- Repository contribution rules documented in `AGENTS.md`.
- Six core Memory Bank files initialized.
- Required pre-code document checks and database-schema documentation rules established.
- Detailed base-game implementation plan created with validation for every step.
- GDD, tech stack, and implementation plan moved into `memory-bank/`; related links and base-game decisions updated.
- Architecture documentation workflow added; `memory-bank/architecture.md` remains empty until architecture or database implementation begins.

## Not Started

- Vite/TypeScript/Phaser scaffold and dependency installation.
- Package scripts, linting, type checking, Vitest, and Playwright configuration.
- Pure simulation/economy implementation.
- Phaser mine scene, four floors, miners, transport, warehouse, and UI.
- Base-game shaft/elevator/warehouse upgrades and floor unlocks.
- Expanded manager, boost, and gift-drop systems after the base milestone.
- Save schema, migrations, IndexedDB persistence, and offline income.
- Original art, sprite atlases, audio, and visual polish.
- Mobile performance, responsive layout, and Telegram integration testing.
- Deployment pipeline.

## Acceptance Targets

- The production chain is understandable within 30 seconds.
- Four floors animate concurrently at 60 FPS on target mobile hardware.
- A player can open at least three floors and reach a multiplier milestone within ten minutes.
- Save restoration and capped offline income are deterministic and tested.
- The economy cannot enter an unrecoverable progression stall.

## Known Risks

- The reference clip is too short to establish exact formulas or all features.
- Idle-game number growth can overflow without a large-number abstraction.
- WebView suspension and clock manipulation can corrupt offline rewards if not bounded and validated.
- Visual fidelity must not rely on copied art, audio, branding, or UI assets.
