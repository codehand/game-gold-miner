# Repository Guidelines

## Project Structure & Module Organization

The base game is implemented; `README.md` is the human entry point. The three source-of-truth documents are:

- `memory-bank/game-design-document.md`: gameplay loop, systems, UI, economy, and MVP scope.
- `memory-bank/tech-stack.md`: approved TypeScript, Phaser, and Vite architecture.
- `memory-bank/implementation-plan.md`: ordered, testable instructions for delivering the base game.

Follow `memory-bank/tech-stack.md`: keep simulation code in `src/core/`, Phaser code in `src/game/`, interface components in `src/ui/`, save logic in `src/persistence/`, platform adapters in `src/platform/`, and balance data in `src/config/`. Store media under `public/assets/`. Place unit tests beside source files or in `tests/unit/`; keep browser flows in `tests/e2e/`.

## Build, Test, and Development Commands

These `package.json` scripts exist and are verified in this repository:

- `npm run dev`: start the local Vite development server.
- `npm run dev:sim`: boot an iPhone Simulator, open the Vite app in Safari, and stream it through `serve-sim` for AI-assisted visual review.
- `npm run sim:list` / `npm run sim:stop`: inspect or stop active simulator streams.
- `npm run build`: type-check and create the production bundle.
- `npm run test`: run Vitest unit tests.
- `npm run test:e2e`: run Playwright browser tests against a dev server on port 4173.
- `npm run test:prod`: build `dist/`, serve it from `/` on port 4175, and run the production smoke suite.
- `npm run verify`: run lint, unit, E2E, build, and the production smoke suite in that order.
- `npm run test:perf`: run the optional ten-minute mobile-emulation benchmark on port 4174.
- `npm run lint`: run the configured linter and report style errors.

Each Playwright config starts its own server, so free ports 4173, 4174, and 4175 before running those suites.

Do not document a command as supported until it runs successfully in this repository.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, single quotes, and trailing commas where supported. Use `PascalCase` for classes, Phaser scenes, and components; `camelCase` for functions and variables; `UPPER_SNAKE_CASE` for global constants; and kebab-case for asset filenames. Keep economy and offline-income calculations pure and independent of Phaser. Prefer small modules with explicit exports and avoid unchecked `any`.

## Testing Guidelines

Use Vitest for economy, progression, save migration, and offline-income logic. Name unit tests `*.test.ts`. Use Playwright for loading, upgrades, save restoration, and responsive 9:16 behavior; name these `*.spec.ts`. Every bug fix should include a regression test. Prioritize deterministic coverage of `src/core/`.

## Commit & Pull Request Guidelines

Use Conventional Commits, for example `feat: add mine-floor simulation` or `fix: cap offline rewards`. Keep commits focused. Pull requests should explain the player-facing effect, list verification commands, link the relevant issue, and include screenshots or short recordings for visual changes. Call out balance, save-format, dependency, or platform compatibility changes explicitly.

## Security & Configuration

Never commit bot tokens, API keys, production save data, or Telegram `initData`. Keep secrets in ignored `.env.local` files, provide safe placeholders in `.env.example`, and validate Telegram initialization data on the server before trusting user identity.

## IMPORTANT: Required Context and Memory Bank

- **Read `memory-bank/INDEX.md` first.** It maps every document to its sections;
  open only the files and sections your task actually needs. Do **not** read the
  whole Memory Bank — the live documents total roughly 126k tokens.
- `activeContext.md` and `progress.md` are short and always worth reading: they
  carry the current step, the current gate, the binding decisions, and the open
  risks.
- **Large files must be read by section.** `architecture.md` (~40k tokens) and
  `techContext.md` (~30k tokens) are contracts, not narratives. Get the map with
  `grep -n '^## \|^### ' <file>`, then `sed -n 'START,ENDp' <file>` or Read with
  offset/limit. A `PreToolUse` hook (`.claude/hooks/memory-bank-guard.sh`) blocks
  whole-file reads above 20,000 bytes; raise it for one command with
  `MEMORY_BANK_MAX_BYTES`.
- **Do not read `memory-bank/archive/` by default.** It holds closed history —
  completed steps, passed acceptance gates, settled decisions, resolved risks —
  and is not part of the contract. Open one archive file only when you need the
  provenance of a specific step or decision.
- Treat `memory-bank/` (excluding `archive/`) as the current product and
  architecture contract. `game-design-document.md`, `tech-stack.md`, and
  `implementation-plan.md` remain the sources of truth for scope.
- Keep the entire current database schema in both `memory-bank/architecture.md`
  and `memory-bank/techContext.md`, including tables, columns, types,
  constraints, indexes, and relationships. The two copies are byte-identical and
  must change together, in the same change as every schema migration. Both the
  six Supabase/Postgres tables and the client-side IndexedDB and localStorage
  journal schemas are documented in full in both files.
- After adding a major feature or completing a milestone, update
  `architecture.md`, `techContext.md`, `productContext.md`, `activeContext.md`,
  `progress.md`, and any other affected document in the same change. Then:
  append finished work to `memory-bank/archive/completed-log.md` and passed gates
  to `memory-bank/archive/acceptance-gates.md`; move a settled decision from
  `activeContext.md` to `memory-bank/archive/decision-log.md`; move a risk closed
  by code to `memory-bank/archive/risks-resolved.md` **with the reason it
  closed**, never deleting it. Keep `progress.md` to live phase status and open
  risks.
- If a file gains or loses a top-level `##` section, update its row in
  `memory-bank/INDEX.md` in the same change.
- When asked to "update memory bank," review every Memory Bank file, even if some
  require no edits — but review them by section, not by reading each one whole.
