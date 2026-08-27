# Repository Guidelines

## Project Structure & Module Organization

This repository is currently in the design phase. The three source-of-truth documents are:

- `memory-bank/game-design-document.md`: gameplay loop, systems, UI, economy, and MVP scope.
- `memory-bank/tech-stack.md`: approved TypeScript, Phaser, and Vite architecture.
- `memory-bank/implementation-plan.md`: ordered, testable instructions for delivering the base game.

When implementation begins, follow `memory-bank/tech-stack.md`: keep simulation code in `src/core/`, Phaser code in `src/game/`, interface components in `src/ui/`, save logic in `src/persistence/`, platform adapters in `src/platform/`, and balance data in `src/config/`. Store media under `public/assets/`. Place unit tests beside source files or in `tests/unit/`; keep browser flows in `tests/e2e/`.

## Build, Test, and Development Commands

No application scaffold or package scripts exist yet. Once the Vite project is created, expose these standard commands in `package.json`:

- `npm run dev`: start the local Vite development server.
- `npm run build`: type-check and create the production bundle.
- `npm run test`: run Vitest unit tests.
- `npm run test:e2e`: run Playwright browser tests.
- `npm run lint`: run the configured linter and report style errors.

Do not document a command as supported until it runs successfully in this repository.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, single quotes, and trailing commas where supported. Use `PascalCase` for classes, Phaser scenes, and components; `camelCase` for functions and variables; `UPPER_SNAKE_CASE` for global constants; and kebab-case for asset filenames. Keep economy and offline-income calculations pure and independent of Phaser. Prefer small modules with explicit exports and avoid unchecked `any`.

## Testing Guidelines

Use Vitest for economy, progression, save migration, and offline-income logic. Name unit tests `*.test.ts`. Use Playwright for loading, upgrades, save restoration, and responsive 9:16 behavior; name these `*.spec.ts`. Every bug fix should include a regression test. Prioritize deterministic coverage of `src/core/`.

## Commit & Pull Request Guidelines

There is no Git history available from which to infer an existing convention. Use Conventional Commits, for example `feat: add mine-floor simulation` or `fix: cap offline rewards`. Keep commits focused. Pull requests should explain the player-facing effect, list verification commands, link the relevant issue, and include screenshots or short recordings for visual changes. Call out balance, save-format, dependency, or platform compatibility changes explicitly.

## Security & Configuration

Never commit bot tokens, API keys, production save data, or Telegram `initData`. Keep secrets in ignored `.env.local` files, provide safe placeholders in `.env.example`, and validate Telegram initialization data on the server before trusting user identity.

## IMPORTANT: Required Context and Memory Bank

- At the start of every task, read every Markdown file in `memory-bank/` before planning or editing.
- Before writing or modifying code, always read `memory-bank/architecture.md`, `memory-bank/techContext.md`, `memory-bank/productContext.md`, and the complete `memory-bank/game-design-document.md`.
- Keep the entire current database schema in both `memory-bank/architecture.md` and `memory-bank/techContext.md`, including tables, columns, types, constraints, indexes, and relationships. Update both files in the same change as every schema migration. While no database exists, `architecture.md` may remain an empty placeholder.
- After adding a major feature or completing a milestone, update `memory-bank/architecture.md`, `memory-bank/techContext.md`, and `memory-bank/productContext.md`. Also refresh `activeContext.md`, `progress.md`, and any other affected context file.
- When asked to “update memory bank,” review every Memory Bank file, even if some require no edits.
