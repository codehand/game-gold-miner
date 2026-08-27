# Technical Context

## Current State

The repository is documentation-only. There is no `package.json`, application scaffold, dependency lockfile, source code, or executable test suite yet. Do not report planned commands as working until they have been created and verified.

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

Production-only services, when justified, are Node.js/Fastify, PostgreSQL, and optional Redis. The MVP should remain client-only.

## Complete Database Schema

**Current schema: none.** The documentation-only repository has no database, migrations, tables, indexes, or relationships. The MVP is intentionally client-only and plans to use IndexedDB for local saves.

If a database is introduced, replace this statement with the complete authoritative schema: every table, column, data type, default, nullable rule, primary/foreign key, unique/check constraint, index, and relationship. Update this section in the same change as each migration; do not leave schema details only in migration files.

## Planned Commands

After scaffolding, provide and verify:

- `npm run dev`
- `npm run build` (`tsc --noEmit` plus Vite production build)
- `npm run test`
- `npm run test:e2e`
- `npm run lint`

## Conventions

Use two-space indentation, semicolons, single quotes, explicit exports, and minimal unchecked `any`. Use `PascalCase` for classes/scenes/components, `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for global constants, and kebab-case for assets.

## Constraints and Security

Use English UI, a 360×640 logical viewport, root deployment base path `/`, and K/M/B/T large-number suffixes before alphabetic suffixes. Optimize for quick startup and 60 FPS on a representative mid-range Android device running Chrome. Telegram WebView testing is deferred to its integration milestone. Offline rewards use the saved production-rate snapshot, a two-hour cap, and 50% efficiency; future timestamps award zero. Store secrets only in ignored `.env.local` files with safe `.env.example` placeholders. Never trust Telegram `initDataUnsafe`; production identity must be derived from server-validated `initData`.
