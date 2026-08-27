# Technical Context

## Current State

Steps 1 through 8 are complete. Step 9 is implemented with passing automated checks and is awaiting user validation; Step 10 has not started. The pure core now exports immutable large numbers, authoritative state contracts, deterministic fresh-state construction, and bounded fixed-step elapsed-time advancement. No extraction, transport, warehouse conversion, physics system, or persistence schema exists yet.

Implementation must follow the ordered, test-gated sequence in `memory-bank/implementation-plan.md`. The plan currently defines 37 base-game steps; each step must pass its stated validation before dependent work begins.

## Approved Direction

- TypeScript
- Phaser 4.2.1, pinned for reproducible 2D rendering and animation builds
- Vite for development and production builds
- IndexedDB with Dexie for local persistence
- `break_infinity.js` or an equivalent library behind `GameNumber`
- Vitest for unit tests
- Playwright for browser/E2E tests
- Telegram Mini Apps JavaScript API
- Capacitor 8 only if native packaging becomes necessary
- Optional Preact for complex DOM overlays; no React-rendered gameplay

## Implemented Toolchain

- Node.js 22.18.0 and npm 10.9.3 were used for Step 3 validation.
- TypeScript 6.0.3 is selected because the Step 2 TypeScript 7 scaffold version was outside the supported peer range of typescript-eslint 8.68.0.
- ESLint 10.9.1 uses a flat configuration with `@eslint/js` and `typescript-eslint` recommended correctness rules.
- Vitest 4.1.11 runs Node-based unit tests from `tests/unit/`.
- Playwright 1.62.1 runs Chromium E2E tests from `tests/e2e/` and starts a fixed-port Vite test server automatically.
- ESLint applies additional rules to `src/core/**/*.ts` that reject Phaser, persistence/platform imports, and browser globals; the Vitest suite probes these rules through the repository's real flat configuration.
- Phaser is configured without a physics property. Its E2E diagnostics identify the selected renderer and count boot-scene starts without making presentation state authoritative.
- Balance data remains declarative finite JavaScript-number input; future authoritative state converts monetary and material values into `GameNumber`. Startup validation requires exactly four sequential floors, unique identifiers, valid unlock chains, positive timing/yield/capacity values, upgrade growth above one, and the configured milestone schedule.
- `GameNumber` encapsulates break_infinity.js 2.2.0. It accepts finite numbers or numeric strings, returns new values for add/subtract/multiply, exposes comparisons, and serializes to a backend-neutral string; formatting is deliberately separate.
- Fresh authoritative state uses save version 1 and requires an explicit non-negative safe-integer timestamp. Gold, material queues/totals, carried material, and capacities are `GameNumber`; normalized progress and levels remain ordinary numbers.
- Foreground simulation advances in 100 ms fixed ticks, stores a monotonically increasing tick plus sub-tick remainder in authoritative state, and credits at most 1,000 ms per update. Valid elapsed time must be finite and non-negative; the full elapsed duration advances `lastUpdateTimestampMs` even when credited simulation time is capped.

Production-only services, when justified, are Node.js/Fastify, PostgreSQL, and optional Redis. The MVP should remain client-only.

## Complete Database Schema

**Current schema: none.** The repository has no database, migrations, tables, indexes, object stores, or relationships. The MVP is intentionally client-only and plans to use IndexedDB for local saves.

If a database is introduced, replace this statement with the complete authoritative schema: every table, column, data type, default, nullable rule, primary/foreign key, unique/check constraint, index, and relationship. Update this section in the same change as each migration; do not leave schema details only in migration files.

## Verified Commands

- `npm run dev`: verified by starting Vite at `127.0.0.1:5173`, receiving the application HTML over HTTP, and terminating the server cleanly.
- `npm run build` (`tsc --noEmit` plus Vite production build)
- `npm run test`: twenty-four tests across the scaffold, architecture, balance-configuration, large-number, authoritative-state, and fixed-step timing suites pass.
- `npm run test:e2e`: one Chromium boot-scene test passes before and after reload, with one canvas, one scene start per load, valid logical dimensions and renderer, and no console or page errors.
- `npm run lint`: the repository passes the ESLint flat configuration.

## Conventions

Use two-space indentation, semicolons, single quotes, explicit exports, and minimal unchecked `any`. Use `PascalCase` for classes/scenes/components, `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for global constants, and kebab-case for assets.

## Constraints and Security

Use English UI, a 360×640 logical viewport, root deployment base path `/`, and K/M/B/T large-number suffixes before alphabetic suffixes. Optimize for quick startup and 60 FPS on a representative mid-range Android device running Chrome. Telegram WebView testing is deferred to its integration milestone. Offline rewards use the saved production-rate snapshot, a two-hour cap, and 50% efficiency; future timestamps award zero. Store secrets only in ignored `.env.local` files with safe `.env.example` placeholders. Never trust Telegram `initDataUnsafe`; production identity must be derived from server-validated `initData`.
